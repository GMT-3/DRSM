import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Organization, OrganizationType } from '../models/Organization';
import { User } from '../models/User';
import { hashPassword } from '../utils/password';
import { signAccessToken, signRefreshToken } from '../utils/jwt';
import { ApiError } from '../utils/ApiError';
import { writeAuditLog } from '../middleware/auditLog';
import { Role } from '../types/roles';

type EntityKind = 'ngo' | 'ingo' | 'private' | 'donor_institutional' | 'donor_individual';

const ORG_TYPE_BY_KIND: Partial<Record<EntityKind, OrganizationType>> = {
  ngo: 'ngo',
  ingo: 'ingo',
  private: 'private',
  donor_institutional: 'donor_institutional',
};

const ROLE_BY_KIND: Record<EntityKind, Role> = {
  ngo: 'ngo_ingo',
  ingo: 'ngo_ingo',
  private: 'private_org',
  donor_institutional: 'donor',
  donor_individual: 'donor',
};

/**
 * Public self-registration for NGO/INGO/Private Organizations and Donors
 * (Roles.md: "organizations ... log in with their company/organizational
 * email"; "Donor ... may also be entered on their behalf by Central
 * Government"). Field personnel and government accounts are deliberately
 * NOT created here — Tech.md: those have no self-registration path, see
 * userManagementController.ts instead.
 *
 * `donor_individual` skips creating an Organization record entirely (an
 * individual donor has no company) and uses their own email as the login,
 * matching Roles.md's "individual email" login option for donors.
 */
export async function registerOrganization(req: Request, res: Response) {
  const {
    entityKind,
    name,
    organizationName,
    email,
    password,
    phone,
    registrationDetails,
  } = req.body as {
    entityKind?: EntityKind;
    name?: string;
    organizationName?: string;
    email?: string;
    password?: string;
    phone?: string;
    registrationDetails?: { registrationNumber?: string; country?: string; contact?: string };
  };

  if (!entityKind || !ROLE_BY_KIND[entityKind]) {
    throw ApiError.badRequest('entityKind must be one of ngo, ingo, private, donor_institutional, donor_individual');
  }
  if (!name || !email || !password) {
    throw ApiError.badRequest('name, email and password are required');
  }
  if (password.length < 8) {
    throw ApiError.badRequest('password must be at least 8 characters');
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const needsOrganization = entityKind !== 'donor_individual';
  let organization = null;

  if (needsOrganization) {
    if (!organizationName) {
      throw ApiError.badRequest('organizationName is required for this entity type');
    }
    organization = await Organization.create({
      name: organizationName,
      type: ORG_TYPE_BY_KIND[entityKind],
      registrationDetails: registrationDetails ?? {},
      verificationStatus: 'unverified',
    });
  }

  const role = ROLE_BY_KIND[entityKind];
  const passwordHash = await hashPassword(password);
  const user = await User.create({
    name,
    email: normalizedEmail,
    phone,
    passwordHash,
    role,
    loginType: needsOrganization ? 'org_email' : 'own_email',
    scope: organization ? { organizationId: organization._id } : {},
    active: true,
  });

  await writeAuditLog({
    actorUserId: user._id,
    actorRole: role,
    action: 'create_user',
    targetType: needsOrganization ? 'Organization' : 'User',
    targetId: organization ? organization._id : user._id,
    afterState: { user: user.toObject(), organization: organization?.toObject() ?? null },
    req,
  });

  const scopeClaim = {
    provinceId: null,
    districtId: null,
    municipalityId: null,
    wardId: null,
    organizationId: organization ? String(organization._id) : null,
  };
  const accessToken = signAccessToken({ userId: String(user._id), role, scope: scopeClaim });
  const refreshToken = signRefreshToken({ userId: String(user._id), tokenVersion: user.refreshTokenVersion });

  res.status(201).json({
    accessToken,
    refreshToken,
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      loginType: user.loginType,
      scope: scopeClaim,
    },
    organization: organization
      ? {
          id: String(organization._id),
          name: organization.name,
          type: organization.type,
          verificationStatus: organization.verificationStatus,
        }
      : null,
  });
}

/**
 * Listing rules mirror Roles.md: central/district_cdo/municipality_ward see
 * the full verification queue (they need to know who's registered and
 * whether they're verified); an organization-scoped caller sees only their
 * own Organization record.
 */
export async function listOrganizations(req: Request, res: Response) {
  const auth = req.auth!;
  if (['ngo_ingo', 'private_org', 'donor'].includes(auth.role)) {
    if (!auth.scope.organizationId) {
      return res.json({ organizations: [] });
    }
    const org = await Organization.findById(auth.scope.organizationId);
    return res.json({ organizations: org ? [org] : [] });
  }

  // Government roles: full visibility for now — verification is a
  // Central/District/Municipality responsibility, not scoped by geography
  // the way Sites/Requirements are (an Organization isn't geo-anchored).
  const organizations = await Organization.find().sort({ createdAt: -1 });
  res.json({ organizations });
}

export async function verifyOrganization(req: Request, res: Response) {
  const auth = req.auth!;
  if (auth.role !== 'central') {
    throw ApiError.forbidden('Only Central Government can verify an organization');
  }

  const { id } = req.params;
  const { decision } = req.body as { decision?: 'verified' | 'unverified' };
  if (!decision || !['verified', 'unverified'].includes(decision)) {
    throw ApiError.badRequest("decision must be 'verified' or 'unverified'");
  }

  const organization = await Organization.findById(id);
  if (!organization) throw ApiError.notFound('Organization not found');

  const before = organization.toObject();
  organization.verificationStatus = decision;
  organization.verifiedBy = decision === 'verified' ? new Types.ObjectId(auth.userId) : null;
  organization.verifiedAt = decision === 'verified' ? new Date() : null;
  await organization.save();

  res.locals.auditTarget = { targetId: organization._id, beforeState: before, afterState: organization.toObject() };
  res.json({ organization });
}
