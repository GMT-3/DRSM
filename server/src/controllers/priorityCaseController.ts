import { Request, Response } from 'express';
import { PriorityCase, CaseType, Severity, ReportedVia } from '../models/PriorityCase';
import { Notice } from '../models/Notice';
import { District } from '../models/District';
import { siteScopeChain } from '../utils/requirementScope';
import { resolveNotifiedLevels } from '../utils/priorityCaseNotify';
import { resolveScopedSiteIds } from '../utils/scopeResolvers';
import { ApiError } from '../utils/ApiError';

const REPORT_ROLES = ['volunteer', 'police', 'army', 'municipality_ward', 'central'];
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  reported: ['acknowledged'],
  acknowledged: ['dispatched'],
  dispatched: ['resolved'],
  resolved: [],
};

/**
 * Skip-level emergency escalation (Rule.md, Appflow.md "Skip-level
 * emergency escalation flow"): a life-threatening case reported by a
 * Volunteer cannot wait to climb the chain sequentially. It's still
 * logged normally into the standard hierarchy (the PriorityCase record
 * itself, visible to Municipality/District/Central like any other data),
 * but simultaneously pushes a real-time Notice to Municipality AND
 * District at the same instant, and to Province too if severity is
 * 'critical'. There is no SMS/push gateway in this environment (no
 * telecom credentials), so "notification" here means an in-app Notice
 * record each of those levels' dashboards surfaces immediately — the
 * same mechanism as any other Important Notice (Modules.md dashboard
 * section) — documented honestly rather than faked as a real SMS send.
 */
export async function reportPriorityCase(req: Request, res: Response) {
  const auth = req.auth!;
  if (!REPORT_ROLES.includes(auth.role)) throw ApiError.forbidden('Not permitted to report a priority case');

  const { siteId, caseType, severity, reportedVia, personId } = req.body as {
    siteId: string;
    caseType: CaseType;
    severity: Severity;
    reportedVia?: ReportedVia;
    personId?: string;
  };
  if (!siteId || !caseType || !severity) throw ApiError.badRequest('siteId, caseType, and severity are required');

  const chain = await siteScopeChain(siteId);
  const district = await District.findById(chain.municipality.districtId);

  const notifiedLevels = resolveNotifiedLevels(severity);

  const priorityCase = await PriorityCase.create({
    personId: personId ?? null,
    siteId,
    caseType,
    severity,
    reportedVia: reportedVia ?? 'field_app',
    reportedAt: new Date(),
    notifiedLevels,
    status: 'reported',
  });

  const noticeBody = `${severity === 'critical' ? 'CRITICAL' : 'HIGH'} priority case (${caseType.replace(/_/g, ' ')}) reported at a site in your area — immediate attention needed.`;
  await Notice.create({
    title: 'Priority case reported',
    body: noticeBody,
    category: 'emergency_instruction',
    issuedByUserId: auth.userId,
    issuedAt: new Date(),
    scope: chain.ward.municipalityId,
  });
  await Notice.create({
    title: 'Priority case reported',
    body: noticeBody,
    category: 'emergency_instruction',
    issuedByUserId: auth.userId,
    issuedAt: new Date(),
    scope: chain.municipality.districtId,
  });
  if (notifiedLevels.includes('province') && district) {
    await Notice.create({
      title: 'CRITICAL priority case reported',
      body: noticeBody,
      category: 'emergency_instruction',
      issuedByUserId: auth.userId,
      issuedAt: new Date(),
      scope: district.provinceId,
    });
  }

  res.locals.auditTarget = { targetId: priorityCase._id, afterState: priorityCase.toObject() };
  res.status(201).json({ priorityCase, notifiedLevels });
}

export async function listPriorityCases(req: Request, res: Response) {
  const auth = req.auth!;
  if (['ngo_ingo', 'private_org', 'donor'].includes(auth.role)) return res.json({ priorityCases: [] });

  const query: Record<string, unknown> = {};
  const siteIds = await resolveScopedSiteIds(req);
  if (siteIds !== null) query.siteId = { $in: siteIds };

  const cases = await PriorityCase.find(query).sort({ reportedAt: -1 }).limit(200);
  res.json({ priorityCases: cases });
}

export async function updatePriorityCaseStatus(req: Request, res: Response) {
  const auth = req.auth!;
  if (!['central', 'district_cdo', 'municipality_ward'].includes(auth.role)) {
    throw ApiError.forbidden('Not permitted to update a priority case');
  }
  const priorityCase = await PriorityCase.findById(req.params.id);
  if (!priorityCase) throw ApiError.notFound('Priority case not found');

  const { status, resolutionNote } = req.body as { status: string; resolutionNote?: string };
  if (!ALLOWED_TRANSITIONS[priorityCase.status].includes(status)) {
    throw ApiError.badRequest(`Cannot move a priority case from '${priorityCase.status}' to '${status}'`);
  }

  priorityCase.status = status as never;
  if (resolutionNote) priorityCase.resolutionNote = resolutionNote;
  await priorityCase.save();

  res.locals.auditTarget = { targetId: priorityCase._id, afterState: priorityCase.toObject() };
  res.json({ priorityCase });
}
