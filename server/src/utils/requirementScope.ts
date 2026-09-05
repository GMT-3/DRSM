import { Request } from 'express';
import { Site } from '../models/Site';
import { Ward } from '../models/Ward';
import { Municipality } from '../models/Municipality';
import { ApiError } from './ApiError';

/**
 * Resolves a Site's Ward -> Municipality chain and checks it against the
 * caller's scope (Site records don't carry district/province ids directly,
 * so this walks the chain rather than reusing buildScopeFilter). Shared by
 * requirementController and any later module whose data hangs off a Site
 * (Phase 5's allocation/dispatch flow) so the chain-walk logic lives in
 * exactly one place.
 */
export async function siteScopeChain(siteId: string) {
  const site = await Site.findById(siteId);
  if (!site) throw ApiError.notFound('Site not found');
  const ward = await Ward.findById(site.wardId);
  if (!ward) throw ApiError.notFound('Ward not found for site');
  const municipality = await Municipality.findById(ward.municipalityId);
  if (!municipality) throw ApiError.notFound('Municipality not found for ward');
  return { site, ward, municipality };
}

export async function assertSiteInScope(req: Request, siteId: string) {
  const chain = await siteScopeChain(siteId);
  const auth = req.auth!;
  if (auth.role === 'central') return chain;
  if (auth.role === 'district_cdo') {
    if (String(chain.municipality.districtId) !== auth.scope.districtId) {
      throw ApiError.forbidden('Site is outside your district');
    }
    return chain;
  }
  if (String(chain.ward.municipalityId) !== auth.scope.municipalityId) {
    throw ApiError.forbidden('Site is outside your scope');
  }
  return chain;
}
