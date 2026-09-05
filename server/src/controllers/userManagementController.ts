import { Request, Response } from 'express';
import { User } from '../models/User';
import { Ward } from '../models/Ward';
import { Municipality } from '../models/Municipality';
import { hashPassword } from '../utils/password';
import { generateTempPassword } from '../utils/randomPassword';
import { ApiError } from '../utils/ApiError';
import { FIELD_CATEGORIES, FieldCategory } from '../types/roles';

const FIELD_ROLES = ['volunteer', 'police', 'army'] as const;
type FieldRole = (typeof FIELD_ROLES)[number];

const LOGIN_TYPE_BY_FIELD_ROLE: Record<FieldRole, string> = {
  volunteer: 'own_email',
  police: 'departmental_email',
  army: 'departmental_email',
};

/**
 * Appointment flow for Volunteer/Police/Army (Roles.md: "government-
 * appointed... vetted, assigned"; Tech.md: "created only by the Ward/
 * Municipality that appoints them — no self-registration"). Restricted to
 * municipality_ward via the route guard; this handler additionally checks
 * the target ward actually falls within the caller's own scope so a
 * Municipality/Ward officer can't appoint someone into a ward they don't
 * administer.
 */
export async function appointFieldPersonnel(req: Request, res: Response) {
  const auth = req.auth!;
  const { name, email, phone, role, category, wardId } = req.body as {
    name?: string;
    email?: string;
    phone?: string;
    role?: FieldRole;
    category?: FieldCategory;
    wardId?: string;
  };

  if (!name || !email || !role || !category || !wardId) {
    throw ApiError.badRequest('name, email, role, category and wardId are required');
  }
  if (!FIELD_ROLES.includes(role)) {
    throw ApiError.badRequest(`role must be one of ${FIELD_ROLES.join(', ')}`);
  }
  if (!FIELD_CATEGORIES.includes(category)) {
    throw ApiError.badRequest(`category must be one of ${FIELD_CATEGORIES.join(', ')}`);
  }

  const ward = await Ward.findById(wardId);
  if (!ward) throw ApiError.notFound('Ward not found');

  if (String(ward.municipalityId) !== auth.scope.municipalityId) {
    throw ApiError.forbidden('That ward is outside your municipality');
  }
  if (auth.scope.wardId && auth.scope.wardId !== String(ward._id)) {
    throw ApiError.forbidden('That ward is outside your assigned ward');
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) throw ApiError.conflict('An account with this email already exists');

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const user = await User.create({
    name,
    email: normalizedEmail,
    phone,
    passwordHash,
    role,
    loginType: LOGIN_TYPE_BY_FIELD_ROLE[role],
    category,
    appointedBy: auth.userId,
    active: true,
    scope: {
      provinceId: auth.scope.provinceId,
      districtId: auth.scope.districtId,
      municipalityId: auth.scope.municipalityId,
      wardId: ward._id,
    },
  });

  res.locals.auditTarget = { targetId: user._id, afterState: { ...user.toObject(), passwordHash: undefined } };

  res.status(201).json({
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      category: user.category,
      wardId: String(ward._id),
      active: user.active,
    },
    tempPassword,
  });
}

/**
 * Scoped roster: central sees everyone; district_cdo sees field personnel
 * within their district's municipalities; municipality_ward sees their own
 * appointees (and only those they personally appointed, per Roles.md
 * "can be deactivated by the Municipality that appointed them").
 */
export async function listFieldPersonnel(req: Request, res: Response) {
  const auth = req.auth!;
  const filter: Record<string, unknown> = { role: { $in: FIELD_ROLES } };

  if (auth.role === 'district_cdo') {
    if (!auth.scope.districtId) return res.json({ users: [] });
    const municipalities = await Municipality.find({ districtId: auth.scope.districtId }).select('_id');
    filter['scope.municipalityId'] = { $in: municipalities.map((m) => m._id) };
  } else if (auth.role === 'municipality_ward') {
    if (!auth.scope.municipalityId) return res.json({ users: [] });
    filter['scope.municipalityId'] = auth.scope.municipalityId;
    if (auth.scope.wardId) filter['scope.wardId'] = auth.scope.wardId;
  } else if (auth.role !== 'central') {
    throw ApiError.forbidden('Not permitted to view the field-personnel roster');
  }

  const users = await User.find(filter).select('-passwordHash').sort({ createdAt: -1 });
  res.json({ users });
}

/** Toggles active/inactive for a field-personnel account (Roles.md: appointing Municipality can deactivate). */
export async function setFieldPersonnelActive(req: Request, res: Response) {
  const auth = req.auth!;
  const { id } = req.params;
  const { active } = req.body as { active?: boolean };
  if (typeof active !== 'boolean') throw ApiError.badRequest('active (boolean) is required');

  const user = await User.findById(id);
  if (!user || !FIELD_ROLES.includes(user.role as FieldRole)) throw ApiError.notFound('Field-personnel account not found');

  if (auth.role === 'municipality_ward') {
    if (String(user.appointedBy) !== auth.userId) {
      throw ApiError.forbidden('You can only manage accounts you appointed');
    }
  } else if (auth.role !== 'central') {
    throw ApiError.forbidden('Not permitted to manage field-personnel accounts');
  }

  const before = user.toObject();
  user.active = active;
  await user.save();

  res.locals.auditTarget = {
    targetId: user._id,
    beforeState: { ...before, passwordHash: undefined },
    afterState: { ...user.toObject(), passwordHash: undefined },
  };
  res.json({ user: { id: String(user._id), active: user.active } });
}

/**
 * Central-only: creates District/CDO or Municipality/Ward government
 * accounts (Roles.md: "Creates/manages District, Municipality... accounts
 * directly or by delegation"). A temp password is generated and returned
 * once, same pattern as field-personnel appointment.
 */
export async function createGovAccount(req: Request, res: Response) {
  const { name, email, phone, role, provinceId, districtId, municipalityId, wardId } = req.body as {
    name?: string;
    email?: string;
    phone?: string;
    role?: 'district_cdo' | 'municipality_ward';
    provinceId?: string;
    districtId?: string;
    municipalityId?: string;
    wardId?: string;
  };

  if (!name || !email || !role) throw ApiError.badRequest('name, email and role are required');
  if (!['district_cdo', 'municipality_ward'].includes(role)) {
    throw ApiError.badRequest("role must be 'district_cdo' or 'municipality_ward'");
  }
  if (role === 'district_cdo' && !districtId) {
    throw ApiError.badRequest('districtId is required for a district_cdo account');
  }
  if (role === 'municipality_ward' && !municipalityId) {
    throw ApiError.badRequest('municipalityId is required for a municipality_ward account');
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) throw ApiError.conflict('An account with this email already exists');

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const user = await User.create({
    name,
    email: normalizedEmail,
    phone,
    passwordHash,
    role,
    loginType: 'gov_email',
    active: true,
    scope: { provinceId, districtId, municipalityId, wardId },
  });

  res.locals.auditTarget = { targetId: user._id, afterState: { ...user.toObject(), passwordHash: undefined } };

  res.status(201).json({
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      scope: user.scope,
      active: user.active,
    },
    tempPassword,
  });
}
