import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { SupplyAssistanceRequest } from '../models/SupplyAssistanceRequest';
import { Requirement } from '../models/Requirement';
import { Resource } from '../models/Resource';
import { StorageLocation } from '../models/StorageLocation';
import { ApiError } from '../utils/ApiError';
import { sumAcceptedOfferQuantity, isRequestFulfilled } from '../utils/supplyAssistance';

const ORG_RESPOND_ROLES = ['ngo_ingo', 'private_org'];

/**
 * Supply Assistance workflow (user requirement, 2026-09-04): "if some
 * supplies are missing, then the government will reach out to NGOs and
 * INGOs for the missing supplies." Central opens a request describing the
 * shortfall against an already-approved/consolidated Requirement; any
 * organization can offer a quantity; Central decides which offers to
 * accept, converting them into confirmed Resources it can then allocate
 * and dispatch to the site like any other inventory (allocationController
 * accepts an optional linkedSupplyAssistanceRequestId for traceability).
 */
export async function createSupplyAssistanceRequest(req: Request, res: Response) {
  const auth = req.auth!;
  if (auth.role !== 'central') throw ApiError.forbidden('Only Central can open a supply assistance request');

  const { requirementId, quantityNeeded, quantityGovernmentCommitted, note, unit, category, cluster } = req.body as {
    requirementId: string;
    quantityNeeded: number;
    quantityGovernmentCommitted?: number;
    note?: string;
    unit?: string;
    category?: string;
    cluster?: string;
  };

  if (!requirementId || !quantityNeeded) {
    throw ApiError.badRequest('requirementId and quantityNeeded are required');
  }

  const requirement = await Requirement.findById(requirementId);
  if (!requirement) throw ApiError.notFound('Requirement not found');
  if (!['approved', 'allocated', 'partially_fulfilled'].includes(requirement.status)) {
    throw ApiError.badRequest('A supply assistance request can only be opened against an approved requirement');
  }

  const supplyRequest = await SupplyAssistanceRequest.create({
    requirementId: requirement._id,
    cluster: cluster ?? requirement.cluster,
    category: category ?? requirement.category,
    unit: unit ?? 'unit',
    quantityNeeded,
    quantityGovernmentCommitted: quantityGovernmentCommitted ?? 0,
    note,
    status: 'open',
    createdByUserId: auth.userId,
    createdAt: new Date(),
    offers: [],
  });

  res.locals.auditTarget = { targetId: supplyRequest._id, afterState: supplyRequest.toObject() };
  res.status(201).json({ supplyAssistanceRequest: supplyRequest });
}

export async function listSupplyAssistanceRequests(req: Request, res: Response) {
  const auth = req.auth!;

  if (['volunteer', 'police', 'army', 'donor'].includes(auth.role)) {
    return res.json({ supplyAssistanceRequests: [] });
  }

  let query: Record<string, unknown> = {};

  if (ORG_RESPOND_ROLES.includes(auth.role)) {
    // NGOs/INGOs see requests still open for offers, plus any request they
    // have already responded to (so a declined/accepted offer of theirs
    // doesn't disappear from view once the request moves on).
    query = {
      $or: [{ status: 'open' }, { 'offers.organizationId': auth.scope.organizationId }],
    };
  }
  // central / district_cdo / municipality_ward see everything, for
  // situational awareness of what's been asked of NGOs/INGOs.

  const supplyAssistanceRequests = await SupplyAssistanceRequest.find(query).sort({ createdAt: -1 }).limit(500);
  res.json({ supplyAssistanceRequests });
}

export async function respondToSupplyAssistanceRequest(req: Request, res: Response) {
  const auth = req.auth!;
  if (!ORG_RESPOND_ROLES.includes(auth.role)) throw ApiError.forbidden('Only NGOs/INGOs or private organizations can offer supplies');

  const { quantityOffered, note } = req.body as { quantityOffered: number; note?: string };
  if (!quantityOffered) throw ApiError.badRequest('quantityOffered is required');

  const supplyRequest = await SupplyAssistanceRequest.findById(req.params.id);
  if (!supplyRequest) throw ApiError.notFound('Supply assistance request not found');
  if (supplyRequest.status !== 'open') throw ApiError.badRequest('This request is no longer open for offers');

  const before = supplyRequest.toObject();

  supplyRequest.offers.push({
    _id: new Types.ObjectId(),
    organizationId: auth.scope.organizationId as never,
    offeredByUserId: auth.userId as never,
    quantityOffered,
    note,
    status: 'offered',
    offeredAt: new Date(),
    resourceId: null,
  });
  await supplyRequest.save();

  res.locals.auditTarget = { targetId: supplyRequest._id, beforeState: before, afterState: supplyRequest.toObject() };
  res.status(201).json({ supplyAssistanceRequest: supplyRequest });
}

/**
 * Central accepts or declines a single offer. Accepting converts it into a
 * confirmed Resource owned by the offering organization (the same
 * pledge -> inventory conversion verifyContribution uses) so Central can
 * then allocate/dispatch it like any other stock; declining just marks the
 * offer, leaving the request open for other organizations.
 */
export async function decideOffer(req: Request, res: Response) {
  const auth = req.auth!;
  if (auth.role !== 'central') throw ApiError.forbidden('Only Central can accept or decline a supply offer');

  const { decision, storageLocationId } = req.body as { decision: 'accepted' | 'declined'; storageLocationId?: string };
  if (!['accepted', 'declined'].includes(decision)) throw ApiError.badRequest('decision must be "accepted" or "declined"');

  const supplyRequest = await SupplyAssistanceRequest.findById(req.params.id);
  if (!supplyRequest) throw ApiError.notFound('Supply assistance request not found');

  const offer = supplyRequest.offers.find((o) => String(o._id) === req.params.offerId);
  if (!offer) throw ApiError.notFound('Offer not found');
  if (offer.status !== 'offered') throw ApiError.badRequest('This offer has already been decided');

  const before = supplyRequest.toObject();

  if (decision === 'accepted') {
    if (!storageLocationId) throw ApiError.badRequest('storageLocationId is required to accept an offer');
    const location = await StorageLocation.findById(storageLocationId);
    if (!location) throw ApiError.notFound('Storage location not found');

    const resource = await Resource.create({
      ownerType: 'organization',
      ownerId: offer.organizationId,
      resourceType: supplyRequest.category,
      unit: supplyRequest.unit,
      quantity: offer.quantityOffered,
      storageLocationId,
      state: 'available',
    });

    offer.status = 'accepted';
    offer.resourceId = resource._id;
  } else {
    offer.status = 'declined';
  }

  const acceptedTotal = sumAcceptedOfferQuantity(supplyRequest.offers);
  if (isRequestFulfilled(supplyRequest.offers, supplyRequest.quantityNeeded)) {
    supplyRequest.status = 'fulfilled';
  }

  await supplyRequest.save();

  res.locals.auditTarget = {
    targetId: supplyRequest._id,
    beforeState: before,
    afterState: { ...supplyRequest.toObject(), acceptedTotal },
  };
  res.json({ supplyAssistanceRequest: supplyRequest });
}

export async function cancelSupplyAssistanceRequest(req: Request, res: Response) {
  const auth = req.auth!;
  if (auth.role !== 'central') throw ApiError.forbidden('Only Central can cancel a supply assistance request');

  const supplyRequest = await SupplyAssistanceRequest.findById(req.params.id);
  if (!supplyRequest) throw ApiError.notFound('Supply assistance request not found');
  if (supplyRequest.status !== 'open') throw ApiError.badRequest('Only an open request can be cancelled');

  const before = supplyRequest.toObject();
  supplyRequest.status = 'cancelled';
  await supplyRequest.save();

  res.locals.auditTarget = { targetId: supplyRequest._id, beforeState: before, afterState: supplyRequest.toObject() };
  res.json({ supplyAssistanceRequest: supplyRequest });
}
