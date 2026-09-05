import { Request, Response } from 'express';
import { Province } from '../models/Province';
import { District } from '../models/District';
import { Municipality } from '../models/Municipality';
import { Ward } from '../models/Ward';
import { Category, CategoryKind } from '../models/Category';
import { DisasterEvent } from '../models/DisasterEvent';
import { User } from '../models/User';
import { ROLES, Role } from '../types/roles';
import { buildScopeFilter } from '../middleware/scope';
import { ApiError } from '../utils/ApiError';

const CENTRAL_ONLY = ['central'];

function assertCentral(req: Request) {
  if (req.auth!.role !== 'central') throw ApiError.forbidden('Restricted to Central Government');
}

// --- Locations & Administrative Boundaries ---------------------------
// Site create/list and the read-only Province/District/Municipality/Ward
// listings already exist from Phase 0 (geoController). Administration
// adds the write side for the higher levels of the hierarchy, Central-only
// since these are national-reference records, not operational data any
// lower level should be creating themselves.
export async function createProvince(req: Request, res: Response) {
  assertCentral(req);
  const { name, code } = req.body as { name: string; code: string };
  if (!name || !code) throw ApiError.badRequest('name and code are required');
  const province = await Province.create({ name, code });
  res.locals.auditTarget = { targetId: province._id, afterState: province.toObject() };
  res.status(201).json({ province });
}

export async function createDistrict(req: Request, res: Response) {
  assertCentral(req);
  const { provinceId, name, code } = req.body as { provinceId: string; name: string; code: string };
  if (!provinceId || !name || !code) throw ApiError.badRequest('provinceId, name, and code are required');
  const province = await Province.findById(provinceId);
  if (!province) throw ApiError.notFound('Province not found');
  const district = await District.create({ provinceId, name, code });
  res.locals.auditTarget = { targetId: district._id, afterState: district.toObject() };
  res.status(201).json({ district });
}

export async function createMunicipality(req: Request, res: Response) {
  assertCentral(req);
  const { districtId, name, type } = req.body as { districtId: string; name: string; type?: string };
  if (!districtId || !name) throw ApiError.badRequest('districtId and name are required');
  const district = await District.findById(districtId);
  if (!district) throw ApiError.notFound('District not found');
  const municipality = await Municipality.create({ districtId, name, type: type ?? 'municipality' });
  res.locals.auditTarget = { targetId: municipality._id, afterState: municipality.toObject() };
  res.status(201).json({ municipality });
}

export async function createWard(req: Request, res: Response) {
  assertCentral(req);
  const { municipalityId, wardNumber } = req.body as { municipalityId: string; wardNumber: number };
  if (!municipalityId || !wardNumber) throw ApiError.badRequest('municipalityId and wardNumber are required');
  const municipality = await Municipality.findById(municipalityId);
  if (!municipality) throw ApiError.notFound('Municipality not found');
  const ward = await Ward.create({ municipalityId, wardNumber });
  res.locals.auditTarget = { targetId: ward._id, afterState: ward.toObject() };
  res.status(201).json({ ward });
}

// --- Disaster / Event Management --------------------------------------
export async function createDisasterEvent(req: Request, res: Response) {
  assertCentral(req);
  const { name, type, startDate, affectedProvinceIds, affectedDistrictIds, affectedMunicipalityIds } = req.body as {
    name: string;
    type: string;
    startDate: string;
    affectedProvinceIds?: string[];
    affectedDistrictIds?: string[];
    affectedMunicipalityIds?: string[];
  };
  if (!name || !type || !startDate) throw ApiError.badRequest('name, type, and startDate are required');

  const event = await DisasterEvent.create({
    name,
    type,
    startDate: new Date(startDate),
    affectedProvinceIds: affectedProvinceIds ?? [],
    affectedDistrictIds: affectedDistrictIds ?? [],
    affectedMunicipalityIds: affectedMunicipalityIds ?? [],
    status: 'active',
  });
  res.locals.auditTarget = { targetId: event._id, afterState: event.toObject() };
  res.status(201).json({ event });
}

export async function listDisasterEvents(_req: Request, res: Response) {
  const events = await DisasterEvent.find().sort({ startDate: -1 });
  res.json({ events });
}

export async function closeDisasterEvent(req: Request, res: Response) {
  assertCentral(req);
  const event = await DisasterEvent.findById(req.params.id);
  if (!event) throw ApiError.notFound('Disaster event not found');
  event.status = 'closed';
  event.endDate = new Date();
  await event.save();
  res.locals.auditTarget = { targetId: event._id, afterState: event.toObject() };
  res.json({ event });
}

// --- Resource / Requirement Categories --------------------------------
export async function createCategory(req: Request, res: Response) {
  if (!CENTRAL_ONLY.concat(['district_cdo', 'municipality_ward']).includes(req.auth!.role)) {
    throw ApiError.forbidden('Not permitted to manage categories');
  }
  const { kind, name } = req.body as { kind: CategoryKind; name: string };
  if (!kind || !name) throw ApiError.badRequest('kind and name are required');
  const category = await Category.create({ kind, name, createdByUserId: req.auth!.userId });
  res.locals.auditTarget = { targetId: category._id, afterState: category.toObject() };
  res.status(201).json({ category });
}

export async function listCategories(req: Request, res: Response) {
  const { kind, includeInactive } = req.query as { kind?: CategoryKind; includeInactive?: string };
  const query: Record<string, unknown> = {};
  // Management views (Administration) pass includeInactive=true to see and
  // restore categories a government admin previously removed from the
  // picklist; every other caller (e.g. the Resources form's category
  // dropdown) only ever wants the currently-active list.
  if (includeInactive !== 'true') query.active = true;
  if (kind) query.kind = kind;
  const categories = await Category.find(query).sort({ name: 1 });
  res.json({ categories });
}

/**
 * Adds or removes a category from the active picklist. This is a soft
 * remove (active: false), not a delete: past Resources/Requirements that
 * already used a since-removed category name keep their historical data
 * intact (Rule.md — records aren't retroactively invalidated), and a
 * government admin can restore a category they removed by mistake.
 */
export async function setCategoryActive(req: Request, res: Response) {
  if (!CENTRAL_ONLY.concat(['district_cdo', 'municipality_ward']).includes(req.auth!.role)) {
    throw ApiError.forbidden('Not permitted to manage categories');
  }
  const { active } = req.body as { active: boolean };
  if (typeof active !== 'boolean') throw ApiError.badRequest('active (boolean) is required');

  const category = await Category.findById(req.params.id);
  if (!category) throw ApiError.notFound('Category not found');

  const before = category.toObject();
  category.active = active;
  await category.save();

  res.locals.auditTarget = { targetId: category._id, beforeState: before, afterState: category.toObject() };
  res.json({ category });
}

// --- User Permissions ---------------------------------------------------
/**
 * Admin-level roster of every account and its role/scope (Modules.md
 * "User Permissions: Controls access to different parts of the system").
 * Scoped like everything else — a district_cdo administering permissions
 * only sees accounts within their own district, matching Rule.md's
 * "visibility is scoped, not open".
 */
export async function listAllUsers(req: Request, res: Response) {
  const filter = buildScopeFilter(req, { districtId: 'scope.districtId', municipalityId: 'scope.municipalityId' });
  const users = await User.find(filter).select('name email role loginType scope active category').sort({ role: 1, name: 1 });
  res.json({ users });
}

export async function updateUserRole(req: Request, res: Response) {
  assertCentral(req);
  const { role } = req.body as { role: Role };
  if (!ROLES.includes(role)) throw ApiError.badRequest('Invalid role');

  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');

  const before = user.toObject();
  user.role = role;
  await user.save();

  res.locals.auditTarget = { targetId: user._id, beforeState: before, afterState: user.toObject() };
  res.json({ user });
}
