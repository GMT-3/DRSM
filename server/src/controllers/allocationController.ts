import { Request, Response } from 'express';
import { ResourceAllocation } from '../models/ResourceAllocation';
import { Requirement } from '../models/Requirement';
import { Resource } from '../models/Resource';
import { assertSiteInScope } from '../utils/requirementScope';
import { tryAdvanceRequirementStatus } from '../utils/requirementTransitions';
import { ApiError } from '../utils/ApiError';

const ALLOCATE_ROLES = ['central', 'district_cdo', 'municipality_ward'];

/**
 * Bridges an approved Requirement to a confirmed Resource (Modules.md
 * "Allocated Resources: Resources already assigned to a particular
 * requirement but not necessarily dispatched"). A Resource record here is
 * allocated as a whole (its `state` flips to 'allocated'), matching how
 * Phase 4 modeled inventory state per-record rather than by sub-quantity.
 */
export async function createAllocation(req: Request, res: Response) {
  const auth = req.auth!;
  if (!ALLOCATE_ROLES.includes(auth.role)) throw ApiError.forbidden('Not permitted to allocate resources');

  const { requirementId, resourceId, quantityAllocated, linkedSupplyAssistanceRequestId } = req.body as {
    requirementId: string;
    resourceId: string;
    quantityAllocated: number;
    linkedSupplyAssistanceRequestId?: string;
  };
  if (!requirementId || !resourceId || !quantityAllocated) {
    throw ApiError.badRequest('requirementId, resourceId, and quantityAllocated are required');
  }

  const requirement = await Requirement.findById(requirementId);
  if (!requirement) throw ApiError.notFound('Requirement not found');
  await assertSiteInScope(req, String(requirement.siteId));
  if (requirement.status !== 'approved') throw ApiError.badRequest('Only an approved requirement can be allocated');

  const resource = await Resource.findById(resourceId);
  if (!resource) throw ApiError.notFound('Resource not found');
  if (resource.state !== 'available') throw ApiError.badRequest('Resource is not currently available');
  if (quantityAllocated > resource.quantity) throw ApiError.badRequest('quantityAllocated exceeds the resource quantity');

  const allocation = await ResourceAllocation.create({
    requirementId: requirement._id,
    resourceId: resource._id,
    fromLevel: auth.role,
    fromUserId: auth.userId,
    toLevel: 'site',
    toEntityId: requirement.siteId,
    quantityAllocated,
    allocatedAt: new Date(),
    status: 'allocated',
    linkedSupplyAssistanceRequestId: linkedSupplyAssistanceRequestId ?? null,
  });

  resource.state = 'allocated';
  await resource.save();

  tryAdvanceRequirementStatus(requirement, 'allocated', auth.userId, 'Resource allocated');
  await requirement.save();

  res.locals.auditTarget = { targetId: allocation._id, afterState: allocation.toObject() };
  res.status(201).json({ allocation });
}

export async function listAllocations(req: Request, res: Response) {
  const auth = req.auth!;
  const { requirementId, status } = req.query as { requirementId?: string; status?: string };

  if (['ngo_ingo', 'private_org', 'donor'].includes(auth.role)) {
    return res.json({ allocations: [] });
  }

  const query: Record<string, unknown> = {};
  if (requirementId) query.requirementId = requirementId;
  if (status) query.status = status;

  if (auth.role !== 'central') {
    // Scope by the linked Requirement's site — reuse the same site-scope
    // chain check used everywhere else rather than re-deriving it here.
    const requirements = await Requirement.find(requirementId ? { _id: requirementId } : {}).select('_id siteId');
    const allowed: string[] = [];
    for (const r of requirements) {
      try {
        await assertSiteInScope(req, String(r.siteId));
        allowed.push(String(r._id));
      } catch {
        // outside scope, skip
      }
    }
    query.requirementId = requirementId ? requirementId : { $in: allowed };
  }

  const allocations = await ResourceAllocation.find(query).sort({ allocatedAt: -1 }).limit(500);
  res.json({ allocations });
}
