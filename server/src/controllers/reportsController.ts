import { Request, Response } from 'express';
import { Requirement } from '../models/Requirement';
import { Resource } from '../models/Resource';
import { TransportDispatch } from '../models/TransportDispatch';
import { DistributionRecord } from '../models/DistributionRecord';
import { Household } from '../models/Household';
import { Site } from '../models/Site';
import { AuditLog } from '../models/AuditLog';
import { resolveScopedSiteIds, resolveScopedStorageLocationIds } from '../utils/scopeResolvers';
import { toCsv } from '../utils/csv';
import { ApiError } from '../utils/ApiError';

const GOV_ROLES = ['central', 'district_cdo', 'municipality_ward'];

function assertReportAccess(req: Request) {
  if (!GOV_ROLES.includes(req.auth!.role)) throw ApiError.forbidden('Reports & Analytics is restricted to government roles');
}

/** Requirement Reports: summarized by location/cluster/priority/status (Modules.md). */
export async function requirementReport(req: Request, res: Response) {
  assertReportAccess(req);
  const siteIds = await resolveScopedSiteIds(req);
  const filter = siteIds === null ? {} : { siteId: { $in: siteIds } };
  const requirements = await Requirement.find(filter).select('siteId cluster category quantityRequested status priorityScore');
  const sites = await Site.find({ _id: { $in: requirements.map((r) => r.siteId) } }).select('name');
  const siteById = new Map(sites.map((s) => [String(s._id), s.name]));

  const rows = requirements.map((r) => ({
    site: siteById.get(String(r.siteId)) ?? 'Unknown',
    cluster: r.cluster,
    category: r.category,
    quantityRequested: r.quantityRequested,
    status: r.status,
    priorityScore: r.priorityScore ?? 0,
  }));
  res.json({ rows });
}

/** Resource Reports: available and committed resources (Modules.md). */
export async function resourceReport(req: Request, res: Response) {
  assertReportAccess(req);
  const storageLocationIds = await resolveScopedStorageLocationIds(req);
  const filter = storageLocationIds === null ? {} : { storageLocationId: { $in: storageLocationIds } };
  const resources = await Resource.find(filter).select('resourceType unit quantity state ownerType');
  const rows = resources.map((r) => ({
    resourceType: r.resourceType,
    unit: r.unit,
    quantity: r.quantity,
    state: r.state,
    ownerType: r.ownerType,
  }));
  res.json({ rows });
}

/** Inventory Reports: by organization/location/resource type (Modules.md). */
export async function inventoryReport(req: Request, res: Response) {
  assertReportAccess(req);
  const storageLocationIds = await resolveScopedStorageLocationIds(req);
  const filter = storageLocationIds === null ? {} : { storageLocationId: { $in: storageLocationIds } };
  const resources = await Resource.find(filter);

  const byKey = new Map<string, { resourceType: string; ownerType: string; totalQuantity: number; recordCount: number }>();
  for (const r of resources) {
    const key = `${r.resourceType}::${r.ownerType}`;
    const entry = byKey.get(key) ?? { resourceType: r.resourceType, ownerType: r.ownerType, totalQuantity: 0, recordCount: 0 };
    entry.totalQuantity += r.quantity;
    entry.recordCount += 1;
    byKey.set(key, entry);
  }
  res.json({ rows: [...byKey.values()] });
}

/** Transport Reports: dispatches, deliveries, delays (Modules.md). */
export async function transportReport(req: Request, res: Response) {
  assertReportAccess(req);
  const siteIds = await resolveScopedSiteIds(req);
  const filter = siteIds === null ? {} : { destinationSiteId: { $in: siteIds } };
  const dispatches = await TransportDispatch.find(filter);

  const byStatus = new Map<string, number>();
  for (const d of dispatches) byStatus.set(d.status, (byStatus.get(d.status) ?? 0) + 1);

  res.json({
    totalDispatches: dispatches.length,
    byStatus: [...byStatus.entries()].map(([status, count]) => ({ status, count })),
    rows: dispatches.map((d) => ({
      cargoType: d.cargo.resourceType,
      quantity: d.cargo.quantity,
      status: d.status,
      dispatchedAt: d.dispatchedAt.toISOString(),
    })),
  });
}

/** Distribution Reports: where resources were ultimately delivered (Modules.md). */
export async function distributionReport(req: Request, res: Response) {
  assertReportAccess(req);
  const siteIds = await resolveScopedSiteIds(req);
  const households = siteIds === null ? await Household.find({}).select('_id siteId') : await Household.find({ siteId: { $in: siteIds } }).select('_id siteId');
  const householdIds = households.map((h) => h._id);
  const distributions = await DistributionRecord.find({ householdId: { $in: householdIds } });
  const householdSiteById = new Map(households.map((h) => [String(h._id), String(h.siteId)]));
  const sites = await Site.find({ _id: { $in: [...new Set(households.map((h) => String(h.siteId)))] } }).select('name');
  const siteNameById = new Map(sites.map((s) => [String(s._id), s.name]));

  const rows = distributions.map((d) => ({
    site: siteNameById.get(householdSiteById.get(String(d.householdId)) ?? '') ?? 'Unknown',
    resourceType: d.resourceType,
    quantity: d.quantity,
    duplicateFlag: d.duplicateFlag,
    distributedAt: d.distributedAt.toISOString(),
  }));
  res.json({ rows });
}

/** Unfulfilled Requirements: the report Modules.md flags as "particularly important for government decision-making". */
export async function unfulfilledRequirementsReport(req: Request, res: Response) {
  assertReportAccess(req);
  const siteIds = await resolveScopedSiteIds(req);
  const filter = siteIds === null ? {} : { siteId: { $in: siteIds } };
  const requirements = await Requirement.find({ ...filter, status: { $nin: ['fulfilled', 'rejected'] } })
    .sort({ priorityScore: -1 })
    .select('siteId cluster category quantityRequested status priorityScore submittedAt');
  const sites = await Site.find({ _id: { $in: requirements.map((r) => r.siteId) } }).select('name');
  const siteById = new Map(sites.map((s) => [String(s._id), s.name]));

  const rows = requirements.map((r) => ({
    site: siteById.get(String(r.siteId)) ?? 'Unknown',
    cluster: r.cluster,
    category: r.category,
    quantityRequested: r.quantityRequested,
    status: r.status,
    priorityScore: r.priorityScore ?? 0,
    submittedAt: r.submittedAt.toISOString(),
  }));
  res.json({ rows });
}

/** Response Timeline: a chronological account of major response actions, drawn from AuditLog. */
export async function responseTimelineReport(req: Request, res: Response) {
  assertReportAccess(req);
  const actions = ['dispatch', 'distribute', 'escalate', 'verify_contribution', 'allocate', 'status_change'];
  const logs = await AuditLog.find({ action: { $in: actions } }).sort({ timestamp: -1 }).limit(300);
  const rows = logs.map((l) => ({
    timestamp: l.timestamp.toISOString(),
    action: l.action,
    actorRole: l.actorRole,
    targetType: l.targetType,
  }));
  res.json({ rows });
}

const REPORTS: Record<string, (req: Request, res: Response) => Promise<void>> = {
  requirements: requirementReport,
  resources: resourceReport,
  inventory: inventoryReport,
  transport: transportReport,
  distribution: distributionReport,
  unfulfilled: unfulfilledRequirementsReport,
  timeline: responseTimelineReport,
};

/**
 * Export / Official Reports (Modules.md): re-runs the named report's
 * query and serializes it as CSV instead of JSON, so an authorized user
 * can produce an official-reporting-ready file from live data rather
 * than a manual compilation.
 */
export async function exportReport(req: Request, res: Response) {
  const { type } = req.params as { type: string };
  const handler = REPORTS[type];
  if (!handler) throw ApiError.badRequest(`Unknown report type '${type}'`);

  const rowsCapture: { rows?: Record<string, unknown>[] } = {};
  const fakeRes = {
    json: (body: { rows?: Record<string, unknown>[] }) => {
      rowsCapture.rows = body.rows ?? [];
    },
  } as unknown as Response;

  await handler(req, fakeRes);

  const csv = toCsv(rowsCapture.rows ?? []);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${type}-report.csv"`);
  res.send(csv);
}
