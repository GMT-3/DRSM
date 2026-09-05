import { Request, Response } from 'express';
import { FieldReport, FieldReportType } from '../models/FieldReport';
import { assertSiteInScope } from '../utils/requirementScope';
import { resolveScopedSiteIds } from '../utils/scopeResolvers';
import { ApiError } from '../utils/ApiError';

const REPORT_ROLES = ['volunteer', 'police', 'army', 'municipality_ward', 'central'];

// Modules.md module 6 (Field Operations): the generic field-update log —
// Hazard/Route Report and Rescue/Evacuation Report are the two report
// types this phase adds; site/population/resource updates and delivery
// confirmation already have their own dedicated endpoints from earlier
// phases (Sites, Households, Resources, Distributions) and are logged
// here too only if a field team chooses this generic channel instead.
export async function submitFieldReport(req: Request, res: Response) {
  const auth = req.auth!;
  if (!REPORT_ROLES.includes(auth.role)) throw ApiError.forbidden('Not permitted to submit a field report');

  const { siteId, reportType, payload, clientUuid, capturedAt } = req.body as {
    siteId: string;
    reportType: FieldReportType;
    payload?: Record<string, unknown>;
    clientUuid: string;
    capturedAt?: string;
  };
  if (!siteId || !reportType || !clientUuid) throw ApiError.badRequest('siteId, reportType, and clientUuid are required');

  await assertSiteInScope(req, siteId);

  // Upsert-by-clientUuid (same offline-sync pattern as Household in Phase 2)
  // so a field app can safely retry a report whose response was dropped.
  const existing = await FieldReport.findOne({ clientUuid });
  if (existing) {
    return res.status(200).json({ report: existing, alreadyExisted: true });
  }

  const report = await FieldReport.create({
    siteId,
    reportedByUserId: auth.userId,
    reportType,
    payload: payload ?? {},
    clientUuid,
    capturedAt: capturedAt ? new Date(capturedAt) : new Date(),
    syncedAt: new Date(),
    syncStatus: 'synced',
  });

  res.locals.auditTarget = { targetId: report._id, afterState: report.toObject() };
  res.status(201).json({ report });
}

export async function listFieldReports(req: Request, res: Response) {
  const auth = req.auth!;
  const { reportType, mine } = req.query as { reportType?: string; mine?: string };

  if (['ngo_ingo', 'private_org', 'donor'].includes(auth.role)) return res.json({ reports: [] });

  const query: Record<string, unknown> = {};
  if (reportType) query.reportType = reportType;

  if (['volunteer', 'police', 'army'].includes(auth.role) || mine === 'true') {
    query.reportedByUserId = auth.userId;
  } else {
    const siteIds = await resolveScopedSiteIds(req);
    if (siteIds !== null) query.siteId = { $in: siteIds };
  }

  const reports = await FieldReport.find(query).sort({ capturedAt: -1 }).limit(500);
  res.json({ reports });
}
