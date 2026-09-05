import { Request, Response } from 'express';
import { StorageLocation } from '../models/StorageLocation';
import { resolveScopedStorageLocationIds } from '../utils/scopeResolvers';
import { ApiError } from '../utils/ApiError';

const MANAGE_ROLES = ['central', 'district_cdo', 'municipality_ward'];

export async function createStorageLocation(req: Request, res: Response) {
  const auth = req.auth!;
  if (!MANAGE_ROLES.includes(auth.role)) {
    throw ApiError.forbidden('Only Central, District/CDO, or Municipality/Ward can register a storage location');
  }

  const { name, type, provinceId, districtId, municipalityId, gpsLocation } = req.body as {
    name: string;
    type?: string;
    provinceId?: string;
    districtId?: string;
    municipalityId?: string;
    gpsLocation?: { lat: number; lng: number } | null;
  };
  if (!name) throw ApiError.badRequest('name is required');

  // A location a non-central caller creates is anchored to their own
  // scope, not whatever the client happened to send — the same
  // can't-forge-your-own-scope rule Site creation follows (Phase 0).
  const resolvedDistrictId = auth.role === 'central' ? districtId ?? null : auth.scope.districtId ?? null;
  const resolvedMunicipalityId = auth.role === 'municipality_ward' ? auth.scope.municipalityId : municipalityId ?? null;
  const resolvedProvinceId = auth.role === 'central' ? provinceId ?? null : auth.scope.provinceId ?? null;

  const location = await StorageLocation.create({
    name,
    type: type ?? 'warehouse',
    provinceId: resolvedProvinceId,
    districtId: resolvedDistrictId,
    municipalityId: resolvedMunicipalityId,
    gpsLocation: gpsLocation ?? null,
  });

  res.locals.auditTarget = { targetId: location._id, afterState: location.toObject() };
  res.status(201).json({ storageLocation: location });
}

export async function listStorageLocations(req: Request, res: Response) {
  const ids = await resolveScopedStorageLocationIds(req);
  const query = ids === null ? {} : { _id: { $in: ids } };
  const locations = await StorageLocation.find(query).sort({ name: 1 });
  res.json({ storageLocations: locations });
}
