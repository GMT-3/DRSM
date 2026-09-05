import { Request, Response } from 'express';
import { TransportDispatch, DispatchStatus } from '../models/TransportDispatch';
import { ResourceAllocation } from '../models/ResourceAllocation';
import { Requirement } from '../models/Requirement';
import { Vehicle } from '../models/Vehicle';
import { assertSiteInScope } from '../utils/requirementScope';
import { resolveScopedSiteIds } from '../utils/scopeResolvers';
import { tryAdvanceRequirementStatus } from '../utils/requirementTransitions';
import { ApiError } from '../utils/ApiError';

const DISPATCH_ROLES = ['central', 'district_cdo', 'municipality_ward'];
const FIELD_ROLES = ['volunteer', 'police', 'army'];

// Modules.md "Delivery Status: Dispatched -> In Transit -> Arrived ->
// Received -> Distributed" — forward-only, mirroring the Requirement
// lifecycle's own forward-only transition pattern.
//
// Current build scope (Rule.md's 2026-09-05 update / Prd.md "Out of
// scope (v1)"): tracking is implemented only as far as Municipality/Ward
// confirming receipt of an allocation, so 'received' is this phase's
// terminal dispatch status. The 'distributed' status (Volunteer -> Victim
// beneficiary handoff, alongside DistributionRecord) is next-update scope
// (Tracker.md Phase 12) — deliberately unreachable via this transition
// matrix for now, not deleted, so it needs no rework when Phase 12 opens.
const ALLOWED_DISPATCH_TRANSITIONS: Record<DispatchStatus, DispatchStatus[]> = {
  dispatched: ['in_transit'],
  in_transit: ['arrived'],
  arrived: ['received'],
  received: [],
  distributed: [],
};

async function assertCanManageDispatch(req: Request, dispatch: InstanceType<typeof TransportDispatch>) {
  const auth = req.auth!;
  if (DISPATCH_ROLES.includes(auth.role)) {
    await assertSiteInScope(req, String(dispatch.destinationSiteId));
    return;
  }
  if (FIELD_ROLES.includes(auth.role)) {
    await assertSiteInScope(req, String(dispatch.destinationSiteId));
    return;
  }
  const vehicle = await Vehicle.findById(dispatch.vehicleId);
  if (vehicle?.transporterOrganizationId && String(vehicle.transporterOrganizationId) === auth.scope.organizationId) {
    return;
  }
  throw ApiError.forbidden('Not permitted to manage this dispatch');
}

/**
 * Creates a dispatch against an already-allocated ResourceAllocation
 * (Phase 4/5 bridge: allocate -> dispatch -> deliver). Advances the
 * underlying Requirement to 'dispatched' too, so its own lifecycle view
 * (module 2) stays in sync with the shipment's real-world progress.
 */
export async function createDispatch(req: Request, res: Response) {
  const auth = req.auth!;
  if (!DISPATCH_ROLES.includes(auth.role)) throw ApiError.forbidden('Not permitted to create a dispatch');

  const { resourceAllocationId, vehicleId, originLocationId, destinationSiteId, cargo, expectedArrivalAt, routeId } = req.body as {
    resourceAllocationId: string;
    vehicleId: string;
    originLocationId: string;
    destinationSiteId: string;
    cargo: { resourceType: string; quantity: number };
    expectedArrivalAt?: string;
    routeId?: string;
  };

  if (!resourceAllocationId || !vehicleId || !originLocationId || !destinationSiteId || !cargo?.resourceType || !cargo?.quantity) {
    throw ApiError.badRequest('resourceAllocationId, vehicleId, originLocationId, destinationSiteId, and cargo are required');
  }

  const allocation = await ResourceAllocation.findById(resourceAllocationId);
  if (!allocation) throw ApiError.notFound('Resource allocation not found');
  if (allocation.status !== 'allocated') throw ApiError.badRequest('This allocation has already been dispatched or delivered');

  await assertSiteInScope(req, destinationSiteId);

  const dispatch = await TransportDispatch.create({
    resourceAllocationId: allocation._id,
    vehicleId,
    originLocationId,
    destinationSiteId,
    cargo,
    status: 'dispatched',
    expectedArrivalAt: expectedArrivalAt ? new Date(expectedArrivalAt) : null,
    routeId: routeId ?? null,
    dispatchedAt: new Date(),
    dispatchedByUserId: auth.userId,
  });

  allocation.status = 'dispatched';
  await allocation.save();

  const requirement = await Requirement.findById(allocation.requirementId);
  if (requirement) {
    tryAdvanceRequirementStatus(requirement, 'dispatched', auth.userId, 'Dispatch created');
    await requirement.save();
  }

  res.locals.auditTarget = { targetId: dispatch._id, afterState: dispatch.toObject() };
  res.status(201).json({ dispatch });
}

export async function listDispatches(req: Request, res: Response) {
  const auth = req.auth!;
  const { status } = req.query as { status?: string };
  const query: Record<string, unknown> = {};
  if (status) query.status = status;

  if (auth.role === 'donor') return res.json({ dispatches: [] });

  if (['ngo_ingo', 'private_org'].includes(auth.role)) {
    const vehicles = await Vehicle.find({ transporterOrganizationId: auth.scope.organizationId }).select('_id');
    query.vehicleId = { $in: vehicles.map((v) => v._id) };
  } else {
    const siteIds = await resolveScopedSiteIds(req);
    if (siteIds !== null) query.destinationSiteId = { $in: siteIds };
  }

  const dispatches = await TransportDispatch.find(query).sort({ dispatchedAt: -1 }).limit(500);
  res.json({ dispatches });
}

export async function updateDispatchStatus(req: Request, res: Response) {
  const auth = req.auth!;
  const dispatch = await TransportDispatch.findById(req.params.id);
  if (!dispatch) throw ApiError.notFound('Dispatch not found');
  await assertCanManageDispatch(req, dispatch);

  const { status } = req.body as { status: DispatchStatus };
  if (!ALLOWED_DISPATCH_TRANSITIONS[dispatch.status].includes(status)) {
    throw ApiError.badRequest(`Cannot move a dispatch from '${dispatch.status}' to '${status}'`);
  }

  dispatch.status = status;
  await dispatch.save();

  if (status === 'received') {
    const allocation = await ResourceAllocation.findById(dispatch.resourceAllocationId);
    if (allocation) {
      allocation.status = 'delivered';
      await allocation.save();
      const requirement = await Requirement.findById(allocation.requirementId);
      if (requirement) {
        tryAdvanceRequirementStatus(requirement, 'delivered', auth.userId, 'Shipment received at site');
        await requirement.save();
      }
    }
  }

  res.locals.auditTarget = { targetId: dispatch._id, afterState: dispatch.toObject() };
  res.json({ dispatch });
}

export async function updateDispatchPosition(req: Request, res: Response) {
  const dispatch = await TransportDispatch.findById(req.params.id);
  if (!dispatch) throw ApiError.notFound('Dispatch not found');
  await assertCanManageDispatch(req, dispatch);

  const { lat, lng } = req.body as { lat: number; lng: number };
  if (typeof lat !== 'number' || typeof lng !== 'number') throw ApiError.badRequest('lat and lng are required');

  dispatch.currentPosition = { lat, lng };
  dispatch.lastPositionUpdateAt = new Date();
  await dispatch.save();

  res.json({ dispatch });
}
