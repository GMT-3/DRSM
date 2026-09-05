process.env.JWT_ACCESS_SECRET = 'unit_test_access_secret';
process.env.JWT_REFRESH_SECRET = 'unit_test_refresh_secret';

import { signAccessToken, verifyAccessToken, signRefreshToken, verifyRefreshToken } from '../../src/utils/jwt';

describe('JWT access/refresh tokens', () => {
  it('round-trips an access token carrying userId/role/scope', () => {
    const payload = {
      userId: 'user-1',
      role: 'district_cdo' as const,
      scope: { districtId: 'district-1', provinceId: 'province-1' },
    };
    const token = signAccessToken(payload);
    const decoded = verifyAccessToken(token);
    expect(decoded.userId).toBe('user-1');
    expect(decoded.role).toBe('district_cdo');
    expect(decoded.scope.districtId).toBe('district-1');
  });

  it('rejects a tampered access token', () => {
    const token = signAccessToken({ userId: 'u1', role: 'central', scope: {} });
    const tampered = token.slice(0, -2) + 'xx';
    expect(() => verifyAccessToken(tampered)).toThrow();
  });

  it('round-trips a refresh token carrying tokenVersion', () => {
    const token = signRefreshToken({ userId: 'user-2', tokenVersion: 3 });
    const decoded = verifyRefreshToken(token);
    expect(decoded.userId).toBe('user-2');
    expect(decoded.tokenVersion).toBe(3);
  });
});
