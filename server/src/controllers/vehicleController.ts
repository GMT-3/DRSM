import { Request, Response } from 'express';
import { Vehicle } from '../models/Vehicle';
import { ApiError } from '../utils/ApiError';

const GOV_ROLES = ['central', 'district_cdo', 'municipality_ward'];
const ORG_ROLES = ['ngo_ingo', 'private_org'];

export async function createVehicle(req: Request, res: Response) {
  const auth = req.auth!;
  if (![...GOV_ROLES, ...ORG_ROLES].includes(auth.role)) throw ApiError.forbidden('Not permitted to register a vehicle');

  const { type, capacity, registrationNumber } = req.body as { type: string; capacity?: string; registrationNumber: string };
  if (!type || !registrationNumber) throw ApiError.badRequest('type and registrationNumber are required');

  const vehicle = await Vehicle.create({
    transporterOrganizationId: ORG_ROLES.includes(auth.role) ? auth.scope.organizationId : null,
    type,
    capacity,
    registrationNumber,
    active: true,
  });

  res.locals.auditTarget = { targetId: vehicle._id, afterState: vehicle.toObject() };
  res.status(201).json({ vehicle });
}

export async function listVehicles(req: Request, res: Response) {
  const auth = req.auth!;
  if (auth.role === 'donor') return res.json({ vehicles: [] });

  const query: Record<string, unknown> = {};
  if (ORG_ROLES.includes(auth.role)) query.transporterOrganizationId = auth.scope.organizationId;

  const vehicles = await Vehicle.find(query).sort({ registrationNumber: 1 });
  res.json({ vehicles });
}

export async function setVehicleActive(req: Request, res: Response) {
  const auth = req.auth!;
  const vehicle = await Vehicle.findById(req.params.id);
  if (!vehicle) throw ApiError.notFound('Vehicle not found');

  if (ORG_ROLES.includes(auth.role) && String(vehicle.transporterOrganizationId) !== auth.scope.organizationId) {
    throw ApiError.forbidden("Not your organization's vehicle");
  }
  if (!GOV_ROLES.includes(auth.role) && !ORG_ROLES.includes(auth.role)) throw ApiError.forbidden('Not permitted');

  const { active } = req.body as { active: boolean };
  vehicle.active = Boolean(active);
  await vehicle.save();

  res.locals.auditTarget = { targetId: vehicle._id, afterState: vehicle.toObject() };
  res.json({ vehicle });
}
