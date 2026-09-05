import { Request, Response } from 'express';
import { Resource, ResourceState } from '../models/Resource';
import { StorageLocation } from '../models/StorageLocation';
import { resolveScopedStorageLocationIds } from '../utils/scopeResolvers';
import { ApiError } from '../utils/ApiError';

const GOV_ROLES = ['central', 'district_cdo', 'municipality_ward'];
const ORG_ROLES = ['ngo_ingo', 'private_org'];
const STATES: ResourceState[] = ['available', 'allocated', 'reserved'];

async function assertStorageLocationInScope(req: Request, storageLocationId?: string | null) {
  if (!storageLocationId) return null;
  const location = await StorageLocation.findById(storageLocationId);
  if (!location) throw ApiError.notFound('Storage location not found');
  const auth = req.auth!;
  if (auth.role === 'central') return location;
  if (auth.role === 'district_cdo' && String(location.districtId) !== auth.scope.districtId) {
    throw ApiError.forbidden('Storage location is outside your district');
  }
  if (auth.role === 'municipality_ward' && String(location.municipalityId) !== auth.scope.municipalityId) {
    throw ApiError.forbidden('Storage location is outside your municipality');
  }
  return location;
}

/**
 * Government Inventory / Organization Inventory records (Modules.md). A
 * government-role caller creates a `government`-owned Resource; an
 * organization role creates one owned by their own Organization — nobody
 * can create a Resource under a different owner than themselves.
 */
export async function createResource(req: Request, res: Response) {
  const auth = req.auth!;
  const { category, resourceType, unit, quantity, storageLocationId, state } = req.body as {
    category?: string;
    resourceType: string;
    unit: string;
    quantity: number;
    storageLocationId?: string | null;
    state?: ResourceState;
  };

  if (!resourceType || !unit || quantity === undefined) {
    throw ApiError.badRequest('resourceType, unit, and quantity are required');
  }

  let ownerType: 'government' | 'organization';
  let ownerId: string;

  if (GOV_ROLES.includes(auth.role)) {
    ownerType = 'government';
    ownerId = auth.userId;
  } else if (ORG_ROLES.includes(auth.role)) {
    if (!auth.scope.organizationId) throw ApiError.forbidden('Your account has no organization on file');
    ownerType = 'organization';
    ownerId = auth.scope.organizationId;
  } else {
    throw ApiError.forbidden('Only government or organization roles can register inventory');
  }

  await assertStorageLocationInScope(req, storageLocationId);

  const resource = await Resource.create({
    ownerType,
    ownerId,
    category: category && category.trim() ? category.trim() : 'other',
    resourceType,
    unit,
    quantity,
    storageLocationId: storageLocationId ?? null,
    state: state && STATES.includes(state) ? state : 'available',
  });

  res.locals.auditTarget = { targetId: resource._id, afterState: resource.toObject() };
  res.status(201).json({ resource });
}

export async function listResources(req: Request, res: Response) {
  const auth = req.auth!;
  const { ownerType, state, category, resourceType, storageLocationId } = req.query as Record<string, string | undefined>;

  if (auth.role === 'donor') {
    return res.json({ resources: [] });
  }

  let query: Record<string, unknown> = {};

  if (ORG_ROLES.includes(auth.role)) {
    query.ownerType = 'organization';
    query.ownerId = auth.scope.organizationId;
  } else if (GOV_ROLES.includes(auth.role)) {
    const locationIds = await resolveScopedStorageLocationIds(req);
    if (locationIds !== null) {
      // Government scope is anchored on storage location; a resource with
      // no location yet only shows up for central (nothing else to scope it by).
      query = auth.role === 'central' ? {} : { storageLocationId: { $in: locationIds } };
    }
    if (ownerType) query.ownerType = ownerType;
  }

  if (state) query.state = state;
  if (category) query.category = category;
  if (resourceType) query.resourceType = resourceType;
  if (storageLocationId) query.storageLocationId = storageLocationId;

  const resources = await Resource.find(query).sort({ updatedAt: -1 }).limit(500);
  res.json({ resources });
}

export async function updateResourceState(req: Request, res: Response) {
  const auth = req.auth!;
  const resource = await Resource.findById(req.params.id);
  if (!resource) throw ApiError.notFound('Resource not found');

  if (ORG_ROLES.includes(auth.role)) {
    if (String(resource.ownerId) !== auth.scope.organizationId) throw ApiError.forbidden('Not your organization\'s resource');
  } else if (GOV_ROLES.includes(auth.role)) {
    await assertStorageLocationInScope(req, resource.storageLocationId ? String(resource.storageLocationId) : null);
  } else {
    throw ApiError.forbidden('Not permitted to change resource state');
  }

  const { state } = req.body as { state: ResourceState };
  if (!STATES.includes(state)) throw ApiError.badRequest(`state must be one of ${STATES.join(', ')}`);

  const before = resource.toObject();
  resource.state = state;
  await resource.save();

  res.locals.auditTarget = { targetId: resource._id, beforeState: before, afterState: resource.toObject() };
  res.json({ resource });
}

