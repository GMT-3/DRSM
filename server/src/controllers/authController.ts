import { Request, Response } from 'express';
import { User } from '../models/User';
import { comparePassword } from '../utils/password';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { ApiError } from '../utils/ApiError';
import { writeAuditLog } from '../middleware/auditLog';

function toScopeClaim(user: InstanceType<typeof User>) {
  return {
    provinceId: user.scope?.provinceId ? String(user.scope.provinceId) : null,
    districtId: user.scope?.districtId ? String(user.scope.districtId) : null,
    municipalityId: user.scope?.municipalityId ? String(user.scope.municipalityId) : null,
    wardId: user.scope?.wardId ? String(user.scope.wardId) : null,
    organizationId: user.scope?.organizationId ? String(user.scope.organizationId) : null,
  };
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    throw ApiError.badRequest('email and password are required');
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user || !user.active) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  const ok = await comparePassword(password, user.passwordHash);
  if (!ok) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  const scope = toScopeClaim(user);
  const accessToken = signAccessToken({
    userId: String(user._id),
    role: user.role,
    scope,
  });
  const refreshToken = signRefreshToken({
    userId: String(user._id),
    tokenVersion: user.refreshTokenVersion,
  });

  await writeAuditLog({
    actorUserId: user._id,
    actorRole: user.role,
    action: 'login',
    targetType: 'User',
    targetId: user._id,
    req,
  });

  res.json({
    accessToken,
    refreshToken,
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      loginType: user.loginType,
      scope,
    },
  });
}

export async function refresh(req: Request, res: Response) {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (!refreshToken) {
    throw ApiError.badRequest('refreshToken is required');
  }

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const user = await User.findById(payload.userId);
  if (!user || !user.active || user.refreshTokenVersion !== payload.tokenVersion) {
    throw ApiError.unauthorized('Refresh token no longer valid');
  }

  const scope = toScopeClaim(user);
  const accessToken = signAccessToken({ userId: String(user._id), role: user.role, scope });
  const newRefreshToken = signRefreshToken({ userId: String(user._id), tokenVersion: user.refreshTokenVersion });

  res.json({ accessToken, refreshToken: newRefreshToken });
}

export async function me(req: Request, res: Response) {
  if (!req.auth) throw ApiError.unauthorized();
  const user = await User.findById(req.auth.userId).select('-passwordHash');
  if (!user) throw ApiError.notFound('User not found');
  res.json({ user });
}
