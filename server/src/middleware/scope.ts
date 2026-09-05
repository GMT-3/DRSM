import { Request, Response, NextFunction } from 'express';
import { FilterQuery } from 'mongoose';
import { ApiError } from '../utils/ApiError';

/**
 * Server-side scope enforcement (Roles.md "Access control summary",
 * Tech.md "Every list/read endpoint filters by the caller's scope
 * server-side"). This is deliberately the ONE place scope-to-query-filter
 * translation lives, so every module built in later phases reuses it
 * instead of re-deriving visibility rules per route.
 *
 * scopeFieldMap tells buildScopeFilter which field on the target
 * collection corresponds to each geo/org level, e.g. a Site is scoped via
 * its Ward's chain, so callers pass the field path that exists on (or is
 * resolvable from) the collection being queried.
 */
export interface ScopeFieldMap {
  provinceId?: string;
  districtId?: string;
  municipalityId?: string;
  wardId?: string;
  organizationId?: string;
}

/**
 * Builds a Mongo filter object that restricts a query to the caller's
 * own subtree:
 *  - central: no restriction (sees everything, Roles.md).
 *  - district_cdo: restricted to their districtId.
 *  - municipality_ward: restricted to their municipalityId (and wardId when set).
 *  - volunteer/police/army: restricted to their own assigned sites/submissions
 *    (callers should additionally filter by submittedByUserId/reportedByUserId
 *    where applicable — this function only applies the geo part).
 *  - ngo_ingo/private_org/donor: restricted to their organizationId.
 */
export function buildScopeFilter<T = Record<string, unknown>>(
  req: Request,
  fieldMap: ScopeFieldMap,
): FilterQuery<T> {
  const auth = req.auth;
  if (!auth) throw ApiError.unauthorized();

  if (auth.role === 'central') {
    return {} as FilterQuery<T>;
  }

  const filter: Record<string, unknown> = {};

  if (['district_cdo'].includes(auth.role) && fieldMap.districtId && auth.scope.districtId) {
    filter[fieldMap.districtId] = auth.scope.districtId;
    return filter as FilterQuery<T>;
  }

  if (
    ['municipality_ward', 'volunteer', 'police', 'army'].includes(auth.role) &&
    fieldMap.municipalityId &&
    auth.scope.municipalityId
  ) {
    filter[fieldMap.municipalityId] = auth.scope.municipalityId;
    if (fieldMap.wardId && auth.scope.wardId) {
      filter[fieldMap.wardId] = auth.scope.wardId;
    }
    return filter as FilterQuery<T>;
  }

  if (['ngo_ingo', 'private_org', 'donor'].includes(auth.role) && fieldMap.organizationId && auth.scope.organizationId) {
    filter[fieldMap.organizationId] = auth.scope.organizationId;
    return filter as FilterQuery<T>;
  }

  // No usable scope on the token for this field map -> deny by returning an
  // impossible filter rather than leaking unscoped data.
  return { _id: null } as FilterQuery<T>;
}

/** True if `targetScope` (a document's own scope ids) falls within the caller's scope. */
export function isWithinCallerScope(
  req: Request,
  targetScope: { provinceId?: unknown; districtId?: unknown; municipalityId?: unknown; wardId?: unknown; organizationId?: unknown },
): boolean {
  const auth = req.auth;
  if (!auth) return false;
  if (auth.role === 'central') return true;

  const eq = (a: unknown, b: unknown) => a != null && b != null && String(a) === String(b);

  switch (auth.role) {
    case 'district_cdo':
      return eq(auth.scope.districtId, targetScope.districtId);
    case 'municipality_ward':
    case 'volunteer':
    case 'police':
    case 'army':
      return (
        eq(auth.scope.municipalityId, targetScope.municipalityId) &&
        (auth.scope.wardId == null || eq(auth.scope.wardId, targetScope.wardId))
      );
    case 'ngo_ingo':
    case 'private_org':
    case 'donor':
      return eq(auth.scope.organizationId, targetScope.organizationId);
    default:
      return false;
  }
}

/** Route guard: 403s unless the resolved target scope is within the caller's scope. */
export function enforceScope(
  resolveTargetScope: (req: Request) => Promise<Parameters<typeof isWithinCallerScope>[1]>,
) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const targetScope = await resolveTargetScope(req);
      if (!isWithinCallerScope(req, targetScope)) {
        return next(ApiError.forbidden('Outside your scope'));
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}
