import { Request, Response } from 'express';
import { ResourceContribution } from '../models/ResourceContribution';
import { Resource } from '../models/Resource';
import { StorageLocation } from '../models/StorageLocation';
import { ApiError } from '../utils/ApiError';

const SUBMIT_ROLES = ['ngo_ingo', 'private_org', 'donor', 'central', 'district_cdo', 'municipality_ward'];

/**
 * Resource Contributions (Modules.md): "Allows organizations, communities,
 * and volunteers to register resources they can contribute. Subject to
 * verification before being treated as confirmed inventory." Rule.md: "All
 * external contributions must be listed centrally... regardless of which
 * level they were given to" — so any government role may also record one
 * on a contributor's behalf (Roles.md: donor contributions may be
 * "recorded on their behalf").
 */
export async function submitContribution(req: Request, res: Response) {
  const auth = req.auth!;
  if (!SUBMIT_ROLES.includes(auth.role)) throw ApiError.forbidden('Not permitted to submit a contribution');

  const { resourceType, quantity, unit, fundAmount, currency, sourceCountry } = req.body as {
    resourceType: string;
    quantity: number;
    unit: string;
    fundAmount?: number;
    currency?: string;
    sourceCountry?: string;
  };

  if (!resourceType || quantity === undefined || !unit) {
    throw ApiError.badRequest('resourceType, quantity, and unit are required');
  }

  const isOrg = ['ngo_ingo', 'private_org'].includes(auth.role);
  const contribution = await ResourceContribution.create({
    contributedByOrganizationId: isOrg ? auth.scope.organizationId : null,
    contributedByUserId: !isOrg ? auth.userId : null,
    resourceType,
    quantity,
    unit,
    fundAmount: fundAmount ?? null,
    currency: currency ?? null,
    sourceCountry: sourceCountry ?? null,
    verificationStatus: 'unverified',
    receivedAt: new Date(),
  });

  res.locals.auditTarget = { targetId: contribution._id, afterState: contribution.toObject() };
  res.status(201).json({ contribution });
}

export async function listContributions(req: Request, res: Response) {
  const auth = req.auth!;
  let query: Record<string, unknown> = {};

  // Rule.md: "All external contributions must be listed centrally" — every
  // government role can see the full list for situational awareness, but
  // only Central can act on it (see verifyContribution).
  if (['ngo_ingo', 'private_org'].includes(auth.role)) {
    query = { contributedByOrganizationId: auth.scope.organizationId };
  } else if (auth.role === 'donor') {
    query = { contributedByUserId: auth.userId };
  } else if (!['central', 'district_cdo', 'municipality_ward'].includes(auth.role)) {
    return res.json({ contributions: [] });
  }

  const contributions = await ResourceContribution.find(query).sort({ receivedAt: -1 }).limit(500);
  res.json({ contributions });
}

/**
 * Central-only verification (Roles.md: "Central Government (lists every
 * contribution, decides allocation)"). On verification, the contribution
 * converts into a confirmed Resource at the given storage location — the
 * moment it starts counting as real inventory rather than a pledge.
 */
export async function verifyContribution(req: Request, res: Response) {
  const auth = req.auth!;
  if (auth.role !== 'central') throw ApiError.forbidden('Only Central can verify a contribution');

  const contribution = await ResourceContribution.findById(req.params.id);
  if (!contribution) throw ApiError.notFound('Contribution not found');
  if (contribution.verificationStatus === 'verified') {
    throw ApiError.badRequest('Contribution has already been verified');
  }

  const { decision, storageLocationId } = req.body as { decision: 'verified' | 'unverified'; storageLocationId?: string };

  const before = contribution.toObject();

  if (decision === 'verified') {
    if (!storageLocationId) throw ApiError.badRequest('storageLocationId is required to convert a contribution into inventory');
    const location = await StorageLocation.findById(storageLocationId);
    if (!location) throw ApiError.notFound('Storage location not found');

    const resource = await Resource.create({
      ownerType: contribution.contributedByOrganizationId ? 'organization' : 'government',
      ownerId: contribution.contributedByOrganizationId ?? auth.userId,
      resourceType: contribution.resourceType,
      unit: contribution.unit,
      quantity: contribution.quantity,
      storageLocationId,
      state: 'available',
    });

    contribution.verificationStatus = 'verified';
    contribution.verifiedByUserId = auth.userId as never;
    contribution.verifiedAt = new Date();
    contribution.convertedToResourceId = resource._id;
  } else {
    contribution.verificationStatus = 'unverified';
    contribution.verifiedByUserId = null;
    contribution.verifiedAt = null;
  }

  await contribution.save();

  res.locals.auditTarget = { targetId: contribution._id, beforeState: before, afterState: contribution.toObject() };
  res.json({ contribution });
}
