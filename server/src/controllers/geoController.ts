import { Request, Response } from 'express';
import { Province } from '../models/Province';
import { District } from '../models/District';
import { Municipality } from '../models/Municipality';
import { Ward } from '../models/Ward';
import { Site, ISite } from '../models/Site';
import { buildScopeFilter } from '../middleware/scope';
import { ApiError } from '../utils/ApiError';

// Provinces/Districts are visible to central + district_cdo scoped to their
// own district; Municipality/Ward/Site follow the finer-grained scope.
// These are intentionally simple "list" endpoints for Phase 0 — richer
// drill-down/aggregation views belong to the dashboard/module phases.

export async function listProvinces(req: Request, res: Response) {
  if (req.auth?.role === 'central') {
    return res.json({ provinces: await Province.find().sort({ name: 1 }) });
  }
  if (req.auth?.scope.provinceId) {
    return res.json({ provinces: await Province.find({ _id: req.auth.scope.provinceId }) });
  }
  return res.json({ provinces: [] });
}

export async function listDistricts(req: Request, res: Response) {
  const filter = buildScopeFilter(req, { districtId: '_id' });
  res.json({ districts: await District.find(filter).sort({ name: 1 }) });
}

export async function listMunicipalities(req: Request, res: Response) {
  const filter = buildScopeFilter(req, { districtId: 'districtId', municipalityId: '_id' });
  res.json({ municipalities: await Municipality.find(filter).sort({ name: 1 }) });
}

export async function listWards(req: Request, res: Response) {
  const filter = buildScopeFilter(req, { municipalityId: 'municipalityId', wardId: '_id' });
  res.json({ wards: await Ward.find(filter).sort({ wardNumber: 1 }) });
}

export async function listSites(req: Request, res: Response) {
  const auth = req.auth!;
  let wardIds: string[] | undefined;

  if (auth.role !== 'central') {
    const wardFilter = buildScopeFilter(req, { municipalityId: 'municipalityId', wardId: '_id' });
    const wards = await Ward.find(wardFilter).select('_id');
    wardIds = wards.map((w) => String(w._id));
    if (wardIds.length === 0) {
      return res.json({ sites: [] });
    }
  }

  const query = wardIds ? { wardId: { $in: wardIds } } : {};
  res.json({ sites: await Site.find(query).sort({ name: 1 }) });
}

export async function createSite(req: Request, res: Response) {
  const auth = req.auth!;
  if (!['central', 'municipality_ward'].includes(auth.role)) {
    throw ApiError.forbidden('Only Central Government or Municipality/Ward can register a Site');
  }

  const { wardId, name, siteType, gpsLocation, accessMode } = req.body as Partial<ISite> & { wardId: string };
  if (!wardId || !name) throw ApiError.badRequest('wardId and name are required');

  const ward = await Ward.findById(wardId);
  if (!ward) throw ApiError.notFound('Ward not found');

  if (auth.role === 'municipality_ward' && String(ward.municipalityId) !== auth.scope.municipalityId) {
    throw ApiError.forbidden('Ward is outside your municipality');
  }

  const site = await Site.create({
    wardId,
    name,
    siteType: siteType ?? 'settlement',
    gpsLocation: gpsLocation ?? null,
    accessMode: accessMode ?? 'road',
    accessModeUpdatedAt: new Date(),
    accessModeUpdatedBy: auth.userId,
    lastUpdateAt: new Date(),
  });

  res.locals.auditTarget = { targetId: site._id, afterState: site.toObject() };
  res.status(201).json({ site });
}
