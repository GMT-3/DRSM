import { Request, Response } from 'express';
import { DistributionRecord } from '../models/DistributionRecord';
import { Household } from '../models/Household';
import { assertSiteInScope } from '../utils/requirementScope';
import { resolveScopedSiteIds } from '../utils/scopeResolvers';
import { isDuplicateDistribution } from '../utils/duplicateDistribution';
import { ApiError } from '../utils/ApiError';

const DISTRIBUTE_ROLES = ['volunteer', 'police', 'army', 'municipality_ward', 'central', 'district_cdo'];

/**
 * Confirms resources actually reached a household (Modules.md "Delivery
 * Confirmation... dispatched does not mean delivered", "QR scan
 * distribution flow + duplicate-delivery flagging"). Flags rather than
 * blocks a same-resourceType repeat within 24h — see
 * utils/duplicateDistribution.ts — so a real second delivery is never
 * silently lost, only surfaced for review.
 */
export async function recordDistribution(req: Request, res: Response) {
  const auth = req.auth!;
  if (!DISTRIBUTE_ROLES.includes(auth.role)) throw ApiError.forbidden('Not permitted to record a distribution');

  const { householdId, resourceType, quantity, transportDispatchId } = req.body as {
    householdId: string;
    resourceType: string;
    quantity: number;
    transportDispatchId?: string;
  };
  if (!householdId || !resourceType || !quantity) throw ApiError.badRequest('householdId, resourceType, and quantity are required');

  const household = await Household.findById(householdId);
  if (!household) throw ApiError.notFound('Household not found');
  await assertSiteInScope(req, String(household.siteId));

  const priorRecords = await DistributionRecord.find({ householdId }).select('resourceType distributedAt');
  const distributedAt = new Date();
  const duplicateFlag = isDuplicateDistribution(
    priorRecords.map((r) => ({ resourceType: r.resourceType, distributedAt: r.distributedAt })),
    { resourceType, distributedAt },
  );

  const record = await DistributionRecord.create({
    householdId,
    transportDispatchId: transportDispatchId ?? null,
    distributedByUserId: auth.userId,
    qrScanTimestamp: distributedAt,
    resourceType,
    quantity,
    duplicateFlag,
    distributedAt,
  });

  res.locals.auditTarget = { targetId: record._id, afterState: record.toObject() };
  res.status(201).json({ distribution: record });
}

export async function listDistributions(req: Request, res: Response) {
  const auth = req.auth!;
  const { householdId, duplicatesOnly } = req.query as { householdId?: string; duplicatesOnly?: string };

  if (['ngo_ingo', 'private_org', 'donor'].includes(auth.role)) return res.json({ distributions: [] });

  const query: Record<string, unknown> = {};
  if (householdId) query.householdId = householdId;
  if (duplicatesOnly === 'true') query.duplicateFlag = true;

  if (auth.role !== 'central' && !householdId) {
    const siteIds = await resolveScopedSiteIds(req);
    const households = siteIds === null ? null : await Household.find({ siteId: { $in: siteIds } }).select('_id');
    if (households !== null) query.householdId = { $in: households.map((h) => h._id) };
  }

  const distributions = await DistributionRecord.find(query).sort({ distributedAt: -1 }).limit(500);
  res.json({ distributions });
}
