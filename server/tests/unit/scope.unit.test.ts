import { Request } from 'express';
import { buildScopeFilter, isWithinCallerScope } from '../../src/middleware/scope';
import { AuthTokenPayload } from '../../src/types/express';

function reqWithAuth(auth: AuthTokenPayload): Request {
  return { auth } as unknown as Request;
}

describe('buildScopeFilter (Roles.md access-control summary, enforced server-side)', () => {
  it('central gets no restriction (sees everything)', () => {
    const req = reqWithAuth({ userId: 'u', role: 'central', scope: {} });
    expect(buildScopeFilter(req, { districtId: '_id' })).toEqual({});
  });

  it('district_cdo is restricted to their own districtId', () => {
    const req = reqWithAuth({ userId: 'u', role: 'district_cdo', scope: { districtId: 'd1' } });
    expect(buildScopeFilter(req, { districtId: '_id' })).toEqual({ _id: 'd1' });
  });

  it('municipality_ward is restricted to their municipalityId and wardId when present', () => {
    const req = reqWithAuth({
      userId: 'u',
      role: 'municipality_ward',
      scope: { municipalityId: 'm1', wardId: 'w1' },
    });
    expect(buildScopeFilter(req, { municipalityId: 'municipalityId', wardId: '_id' })).toEqual({
      municipalityId: 'm1',
      _id: 'w1',
    });
  });

  it('ngo_ingo is restricted to their organizationId', () => {
    const req = reqWithAuth({ userId: 'u', role: 'ngo_ingo', scope: { organizationId: 'org1' } });
    expect(buildScopeFilter(req, { organizationId: 'organizationId' })).toEqual({ organizationId: 'org1' });
  });

  it('denies (impossible filter) when the token has no usable scope for the field map', () => {
    const req = reqWithAuth({ userId: 'u', role: 'district_cdo', scope: {} });
    expect(buildScopeFilter(req, { districtId: '_id' })).toEqual({ _id: null });
  });
});

describe('isWithinCallerScope', () => {
  it('central is always within scope', () => {
    const req = reqWithAuth({ userId: 'u', role: 'central', scope: {} });
    expect(isWithinCallerScope(req, { districtId: 'anything' })).toBe(true);
  });

  it('municipality_ward matches only their own municipality (and ward, if scoped)', () => {
    const req = reqWithAuth({
      userId: 'u',
      role: 'municipality_ward',
      scope: { municipalityId: 'm1', wardId: 'w1' },
    });
    expect(isWithinCallerScope(req, { municipalityId: 'm1', wardId: 'w1' })).toBe(true);
    expect(isWithinCallerScope(req, { municipalityId: 'm1', wardId: 'w2' })).toBe(false);
    expect(isWithinCallerScope(req, { municipalityId: 'm2', wardId: 'w1' })).toBe(false);
  });

  it('donor/ngo/private_org match only their own organizationId', () => {
    const req = reqWithAuth({ userId: 'u', role: 'donor', scope: { organizationId: 'org1' } });
    expect(isWithinCallerScope(req, { organizationId: 'org1' })).toBe(true);
    expect(isWithinCallerScope(req, { organizationId: 'org2' })).toBe(false);
  });
});
