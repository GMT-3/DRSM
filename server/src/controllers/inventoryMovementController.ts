import { Request, Response } from 'express';
import { InventoryMovement } from '../models/InventoryMovement';
import { Resource } from '../models/Resource';
import { StorageLocation } from '../models/StorageLocation';
import { applyMovement, MovementReason } from '../utils/inventoryMovement';
import { ApiError } from '../utils/ApiError';

const GOV_ROLES = ['central', 'district_cdo', 'municipality_ward'];
const ORG_ROLES = ['ngo_ingo', 'private_org'];

async function assertCanManageResource(req: Request, resource: InstanceType<typeof Resource>) {
  const auth = req.auth!;
  if (ORG_ROLES.includes(auth.role)) {
    if (String(resource.ownerId) !== auth.scope.organizationId) throw ApiError.forbidden('Not your organization\'s resource');
    return;
  }
  if (GOV_ROLES.includes(auth.role)) {
    if (auth.role === 'central' || !resource.storageLocationId) return;
    const location = await StorageLocation.findById(resource.storageLocationId);
    if (!location) return;
    if (auth.role === 'district_cdo' && String(location.districtId) !== auth.scope.districtId) {
      throw ApiError.forbidden('Resource is outside your district');
    }
    if (auth.role === 'municipality_ward' && String(location.municipalityId) !== auth.scope.municipalityId) {
      throw ApiError.forbidden('Resource is outside your municipality');
    }
    return;
  }
  throw ApiError.forbidden('Not permitted to move inventory');
}

/**
 * Records one inventory movement and applies its effect to the Resource in
 * the same operation (Modules.md: "Inventory Movement... Inventory
 * History: Records changes in inventory over time — answers what came in,
 * what went out, and where it went"). The movement log itself is
 * immutable/append-only — like AuditLog, no update/delete route exists.
 */
export async function recordMovement(req: Request, res: Response) {
  const auth = req.auth!;
  const { resourceId, toLocationId, quantity, reason } = req.body as {
    resourceId: string;
    toLocationId?: string | null;
    quantity: number;
    reason: MovementReason;
  };

  if (!resourceId || quantity === undefined || !reason) {
    throw ApiError.badRequest('resourceId, quantity, and reason are required');
  }

  const resource = await Resource.findById(resourceId);
  if (!resource) throw ApiError.notFound('Resource not found');
  await assertCanManageResource(req, resource);

  if (toLocationId) {
    const dest = await StorageLocation.findById(toLocationId);
    if (!dest) throw ApiError.notFound('Destination storage location not found');
  }

  const result = applyMovement(
    {
      quantity: resource.quantity,
      state: resource.state,
      storageLocationId: resource.storageLocationId ? String(resource.storageLocationId) : null,
    },
    { reason, quantity, toLocationId },
  );

  if (result.error) throw ApiError.badRequest(result.error);

  const movement = await InventoryMovement.create({
    resourceId: resource._id,
    fromLocationId: resource.storageLocationId,
    toLocationId: toLocationId ?? null,
    quantity,
    movedAt: new Date(),
    movedByUserId: auth.userId,
    reason,
  });

  resource.quantity = result.resource.quantity;
  resource.storageLocationId = result.resource.storageLocationId as never;
  await resource.save();

  res.locals.auditTarget = { targetId: movement._id, afterState: { movement: movement.toObject(), resourceAfter: resource.toObject() } };
  res.status(201).json({ movement, resource });
}

export async function listMovements(req: Request, res: Response) {
  const { resourceId } = req.query as { resourceId?: string };
  if (!resourceId) throw ApiError.badRequest('resourceId is required');

  const resource = await Resource.findById(resourceId);
  if (!resource) throw ApiError.notFound('Resource not found');
  await assertCanManageResource(req, resource);

  const movements = await InventoryMovement.find({ resourceId }).sort({ movedAt: -1 }).limit(500);
  res.json({ movements });
}
