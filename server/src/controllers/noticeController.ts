import { Request, Response } from 'express';
import { Notice, NoticeCategory } from '../models/Notice';
import { ApiError } from '../utils/ApiError';

const ISSUE_ROLES = ['central', 'district_cdo', 'municipality_ward'];

/**
 * Important Notices (Modules.md dashboard section: "shown persistently in
 * the sidebar... government directives, hazard warnings, road closures,
 * emergency instructions, changes in response priorities, coordination
 * messages"). `scope: 'national'` reaches everyone; an id targets one
 * province/district/municipality and cascades down to it (Rule.md's
 * "visibility is scoped, not open" applies to notices too — a Ward
 * officer shouldn't be alerted about another district's road closure).
 */
export async function createNotice(req: Request, res: Response) {
  const auth = req.auth!;
  if (!ISSUE_ROLES.includes(auth.role)) throw ApiError.forbidden('Not permitted to issue a notice');

  const { title, body, category, scope } = req.body as { title: string; body: string; category: NoticeCategory; scope?: string };
  if (!title || !body || !category) throw ApiError.badRequest('title, body, and category are required');

  // A non-central issuer can only scope a notice to their own level or
  // narrower, not declare it national or aim it at somewhere else.
  let resolvedScope: string = scope ?? 'national';
  if (auth.role !== 'central' && resolvedScope === 'national') {
    resolvedScope = auth.scope.districtId ?? auth.scope.municipalityId ?? 'national';
  }

  const notice = await Notice.create({
    title,
    body,
    category,
    issuedByUserId: auth.userId,
    issuedAt: new Date(),
    scope: resolvedScope,
  });

  res.locals.auditTarget = { targetId: notice._id, afterState: notice.toObject() };
  res.status(201).json({ notice });
}

export async function listNotices(req: Request, res: Response) {
  const auth = req.auth!;
  if (auth.role === 'central') {
    const notices = await Notice.find().sort({ issuedAt: -1 }).limit(100);
    return res.json({ notices });
  }

  const ownScopeIds = [auth.scope.provinceId, auth.scope.districtId, auth.scope.municipalityId, auth.scope.wardId].filter(Boolean);
  const notices = await Notice.find({ $or: [{ scope: 'national' }, { scope: { $in: ownScopeIds } }] })
    .sort({ issuedAt: -1 })
    .limit(100);
  res.json({ notices });
}
