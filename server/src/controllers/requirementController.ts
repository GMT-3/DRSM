import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Requirement, IRequirement, RequirementStatus } from '../models/Requirement';
import { Site } from '../models/Site';
import { ResourceAllocation } from '../models/ResourceAllocation';
import { TransportDispatch } from '../models/TransportDispatch';
import { computePriorityScore, PriorityInputs } from '../utils/priorityScore';
import { resolveScopedSiteIds } from '../utils/scopeResolvers';
import { ALLOWED_TRANSITIONS, appendHistory } from '../utils/requirementTransitions';
import { assertSiteInScope } from '../utils/requirementScope';
import { canVerifyRequirement } from '../utils/requirementVerification';
import { buildTrackingTimeline } from '../utils/trackingTimeline';
import { ApiError } from '../utils/ApiError';

const SUBMIT_ROLES = ['volunteer', 'police', 'army', 'municipality_ward', 'central'];
const REVIEW_ROLES = ['municipality_ward', 'district_cdo', 'central'];

// Volunteer/Police/Army requests skip Ward review and go straight to
// District/CDO for verification ("the volunteer request must go to the
// CDO of the district... the request will first be verified by the
// CDO"). REVIEW_ROLES still lists municipality_ward because Ward- and
// Municipality-originated requirements remain Ward's to approve;
// canVerifyRequirement() below is what actually blocks Ward from
// acting on a field-submitted requirement, so REVIEW_ROLES membership
// alone is necessary but not sufficient.

// `pending_approval` and `submitted` are treated as the same "awaiting
// review" bucket for approval purposes. The transition matrix and the
// Site -> Ward -> Municipality scope-chain check now live in
// utils/requirementTransitions.ts and utils/requirementScope.ts (Phase 5
// needs both too, for its allocation/dispatch flow).

async function scoreAndSave(requirement: InstanceType<typeof Requirement>, accessMode: string) {
  const hoursSinceSubmission = (Date.now() - requirement.submittedAt.getTime()) / (1000 * 60 * 60);
  const inputs: PriorityInputs = {
    populationAffected: requirement.priorityInputs?.populationAffected ?? 0,
    vulnerableCount: requirement.priorityInputs?.vulnerableCount ?? 0,
    availableSupplyRatio: requirement.priorityInputs?.availableSupplyRatio ?? 0,
    hazardActive: requirement.priorityInputs?.hazardActive ?? false,
  };
  requirement.priorityScore = computePriorityScore(inputs, {
    accessMode: accessMode as 'road' | 'foot_only' | 'airlift_only',
    hoursSinceSubmission,
  });
  await requirement.save();
}

export async function submitRequirement(req: Request, res: Response) {
  const auth = req.auth!;
  if (!SUBMIT_ROLES.includes(auth.role)) {
    throw ApiError.forbidden('Only field personnel or Municipality/Ward can submit a requirement');
  }

  const {
    siteId,
    cluster,
    category,
    description,
    quantityRequested,
    populationAffected,
    vulnerableCount,
    availableSupplyRatio,
    hazardActive,
  } = req.body as {
    siteId: string;
    cluster: string;
    category: string;
    description?: string;
    quantityRequested: number;
    populationAffected?: number;
    vulnerableCount?: number;
    availableSupplyRatio?: number;
    hazardActive?: boolean;
  };

  if (!siteId || !cluster || !category || !quantityRequested) {
    throw ApiError.badRequest('siteId, cluster, category, and quantityRequested are required');
  }

  const { site } = await assertSiteInScope(req, siteId);

  const requirement = new Requirement({
    siteId,
    cluster,
    category,
    description,
    quantityRequested,
    submittedByUserId: auth.userId,
    submittedByRole: auth.role,
    submittedAt: new Date(),
    status: 'submitted',
    priorityInputs: {
      populationAffected: populationAffected ?? 0,
      vulnerableCount: vulnerableCount ?? 0,
      availableSupplyRatio: availableSupplyRatio ?? 0,
      hazardActive: hazardActive ?? false,
    },
    history: [{ status: 'submitted', byUserId: auth.userId, at: new Date() }],
  });

  await scoreAndSave(requirement, site.accessMode);

  res.locals.auditTarget = { targetId: requirement._id, afterState: requirement.toObject() };
  res.status(201).json({ requirement });
}

export async function listRequirements(req: Request, res: Response) {
  const auth = req.auth!;
  const { status, cluster, siteId, critical, mine } = req.query as Record<string, string | undefined>;

  let query: Record<string, unknown> = {};

  if (['ngo_ingo', 'private_org', 'donor'].includes(auth.role)) {
    return res.json({ requirements: [] });
  }

  if (['volunteer', 'police', 'army'].includes(auth.role) || mine === 'true') {
    query.submittedByUserId = auth.userId;
  } else {
    const siteIds = await resolveScopedSiteIds(req);
    if (siteIds !== null) query.siteId = { $in: siteIds };
  }

  if (status) query.status = status;
  if (cluster) query.cluster = cluster;
  if (siteId) query.siteId = siteId;

  let requirements = await Requirement.find(query).sort({ submittedAt: -1 }).limit(500);

  if (critical === 'true') {
    // Recompute live for display so elapsed time is reflected without
    // requiring a separate background job — persists the refreshed score
    // for each requirement returned (cheap: only touches the page shown).
    const sites = await Site.find({ _id: { $in: requirements.map((r) => r.siteId) } });
    const siteById = new Map(sites.map((s) => [String(s._id), s]));
    for (const requirement of requirements) {
      const site = siteById.get(String(requirement.siteId));
      if (site) await scoreAndSave(requirement, site.accessMode);
    }
    requirements = requirements.sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0));
  }

  res.json({ requirements });
}

export async function getRequirement(req: Request, res: Response) {
  const requirement = await Requirement.findById(req.params.id);
  if (!requirement) throw ApiError.notFound('Requirement not found');
  await assertSiteInScope(req, String(requirement.siteId));
  res.json({ requirement });
}

/**
 * "Requirement History" (Modules.md, module 2) as the live tracking
 * system Roles.md/Prd.md describe: one consolidated, ordered view of a
 * Requirement's full journey — submitted -> approved -> allocated ->
 * dispatched -> in transit -> delivered — folding in every
 * ResourceAllocation and TransportDispatch raised against it, not just
 * the Requirement's own status field. Scope is the same as everywhere
 * else in this build: it ends at Municipality/Ward confirming receipt
 * (see utils/trackingTimeline.ts) — the Volunteer -> Victim/Beneficiary
 * leg is next-update scope (Rule.md's 2026-09-05 update, Tracker.md
 * Phase 12) and is never surfaced here.
 */
export async function getRequirementTrace(req: Request, res: Response) {
  const requirement = await Requirement.findById(req.params.id);
  if (!requirement) throw ApiError.notFound('Requirement not found');
  await assertSiteInScope(req, String(requirement.siteId));

  const allocations = await ResourceAllocation.find({ requirementId: requirement._id }).sort({ allocatedAt: 1 });
  const dispatches = allocations.length
    ? await TransportDispatch.find({ resourceAllocationId: { $in: allocations.map((a) => a._id) } }).sort({ dispatchedAt: 1 })
    : [];

  const { currentStage, timeline, scopeNote } = buildTrackingTimeline(requirement, allocations, dispatches);

  res.json({
    requirement,
    allocations,
    dispatches,
    currentStage,
    timeline,
    scopeNote,
  });
}

export async function approveRequirement(req: Request, res: Response) {
  const auth = req.auth!;
  if (!REVIEW_ROLES.includes(auth.role)) throw ApiError.forbidden('Only Ward/Municipality, District/CDO, or Central can approve');

  const requirement = await Requirement.findById(req.params.id);
  if (!requirement) throw ApiError.notFound('Requirement not found');
  if (!canVerifyRequirement(auth.role, requirement.submittedByRole)) {
    throw ApiError.forbidden('Requests submitted by field personnel must be verified by the District/CDO, not Ward/Municipality');
  }
  const { site } = await assertSiteInScope(req, String(requirement.siteId));

  if (!ALLOWED_TRANSITIONS[requirement.status].includes('approved')) {
    throw ApiError.badRequest(`Cannot approve a requirement in status "${requirement.status}"`);
  }

  const before = requirement.toObject();
  requirement.status = 'approved';
  requirement.approvedByUserId = new Types.ObjectId(auth.userId);
  requirement.approvedAt = new Date();
  appendHistory(requirement, 'approved', auth.userId, req.body?.note);
  await scoreAndSave(requirement, site.accessMode);

  res.locals.auditTarget = { targetId: requirement._id, beforeState: before, afterState: requirement.toObject() };
  res.json({ requirement });
}

export async function rejectRequirement(req: Request, res: Response) {
  const auth = req.auth!;
  if (!REVIEW_ROLES.includes(auth.role)) throw ApiError.forbidden('Only Ward/Municipality, District/CDO, or Central can reject');

  const requirement = await Requirement.findById(req.params.id);
  if (!requirement) throw ApiError.notFound('Requirement not found');
  if (!canVerifyRequirement(auth.role, requirement.submittedByRole)) {
    throw ApiError.forbidden('Requests submitted by field personnel must be verified by the District/CDO, not Ward/Municipality');
  }
  await assertSiteInScope(req, String(requirement.siteId));

  if (!ALLOWED_TRANSITIONS[requirement.status].includes('rejected')) {
    throw ApiError.badRequest(`Cannot reject a requirement in status "${requirement.status}"`);
  }

  const { note } = req.body as { note?: string };
  if (!note) throw ApiError.badRequest('A note explaining the rejection is required');

  const before = requirement.toObject();
  requirement.status = 'rejected';
  appendHistory(requirement, 'rejected', auth.userId, note);
  await requirement.save();

  res.locals.auditTarget = { targetId: requirement._id, beforeState: before, afterState: requirement.toObject() };
  res.json({ requirement });
}

export async function updateRequirementStatus(req: Request, res: Response) {
  const auth = req.auth!;
  if (!REVIEW_ROLES.includes(auth.role)) throw ApiError.forbidden('Only Ward/Municipality, District/CDO, or Central can update status');

  const requirement = await Requirement.findById(req.params.id);
  if (!requirement) throw ApiError.notFound('Requirement not found');
  await assertSiteInScope(req, String(requirement.siteId));

  const { status, note } = req.body as { status: RequirementStatus; note?: string };
  if (
    (status === 'approved' || status === 'rejected') &&
    !canVerifyRequirement(auth.role, requirement.submittedByRole)
  ) {
    throw ApiError.forbidden('Requests submitted by field personnel must be verified by the District/CDO, not Ward/Municipality');
  }
  if (!ALLOWED_TRANSITIONS[requirement.status]?.includes(status)) {
    throw ApiError.badRequest(
      `Cannot move a requirement from "${requirement.status}" to "${status}". Allowed: ${ALLOWED_TRANSITIONS[requirement.status]?.join(', ') || 'none (terminal status)'}`,
    );
  }

  const before = requirement.toObject();
  requirement.status = status;
  appendHistory(requirement, status, auth.userId, note);
  await requirement.save();

  res.locals.auditTarget = { targetId: requirement._id, beforeState: before, afterState: requirement.toObject() };
  res.json({ requirement });
}

/**
 * Ward/CDO demand-consolidation workflow (Roles.md: Municipality/Ward
 * "approves and combines those field-level demands into a single
 * ward/municipality-level request"; District/CDO "reviews, approves, and
 * further consolidates those into the district's request"). Rolls several
 * already-approved requirements into one combined requirement that
 * represents the escalated demand, without deleting or hiding the
 * originals — each source keeps its own record but is marked
 * `consolidatedIntoId` so it's traceable both ways.
 */
export async function consolidateRequirements(req: Request, res: Response) {
  const auth = req.auth!;
  if (!REVIEW_ROLES.includes(auth.role)) throw ApiError.forbidden('Only Ward/Municipality, District/CDO, or Central can consolidate');

  const { requirementIds, siteId, cluster, category, description } = req.body as {
    requirementIds: string[];
    siteId: string;
    cluster?: string;
    category?: string;
    description?: string;
  };

  if (!Array.isArray(requirementIds) || requirementIds.length < 2) {
    throw ApiError.badRequest('requirementIds must include at least two requirements to consolidate');
  }
  if (!siteId) throw ApiError.badRequest('siteId (the aggregation anchor) is required');

  const { site } = await assertSiteInScope(req, siteId);

  const sources = await Requirement.find({ _id: { $in: requirementIds } });
  if (sources.length !== requirementIds.length) throw ApiError.notFound('One or more requirements not found');

  for (const source of sources) {
    await assertSiteInScope(req, String(source.siteId));
    if (source.status !== 'approved') {
      throw ApiError.badRequest(`Requirement ${source._id} must be approved before it can be consolidated`);
    }
    if (source.consolidatedIntoId) {
      throw ApiError.badRequest(`Requirement ${source._id} has already been consolidated`);
    }
  }

  const totalQuantity = sources.reduce((sum, s) => sum + s.quantityRequested, 0);
  const totalPopulation = sources.reduce((sum, s) => sum + (s.priorityInputs?.populationAffected ?? 0), 0);
  const totalVulnerable = sources.reduce((sum, s) => sum + (s.priorityInputs?.vulnerableCount ?? 0), 0);
  const anyHazard = sources.some((s) => s.priorityInputs?.hazardActive);
  const avgSupplyRatio = sources.reduce((sum, s) => sum + (s.priorityInputs?.availableSupplyRatio ?? 0), 0) / sources.length;

  const combined = new Requirement({
    siteId,
    cluster: cluster ?? sources[0].cluster,
    category: category ?? sources[0].category,
    description: description ?? `Consolidated from ${sources.length} requirements`,
    quantityRequested: totalQuantity,
    submittedByUserId: auth.userId,
    submittedByRole: auth.role,
    submittedAt: new Date(),
    status: 'approved',
    approvedByUserId: new Types.ObjectId(auth.userId),
    approvedAt: new Date(),
    priorityInputs: {
      populationAffected: totalPopulation,
      vulnerableCount: totalVulnerable,
      availableSupplyRatio: avgSupplyRatio,
      hazardActive: anyHazard,
    },
    history: [
      { status: 'submitted', byUserId: auth.userId, at: new Date(), note: 'Created by consolidation' },
      { status: 'approved', byUserId: auth.userId, at: new Date(), note: `Consolidated from ${sources.length} requirements` },
    ],
  });

  await scoreAndSave(combined, site.accessMode);

  for (const source of sources) {
    source.consolidatedIntoId = combined._id;
    await source.save();
  }

  res.locals.auditTarget = {
    targetId: combined._id,
    afterState: { combined: combined.toObject(), sourceIds: sources.map((s) => String(s._id)) },
  };
  res.status(201).json({ requirement: combined, consolidatedSources: sources.map((s) => s._id) });
}
