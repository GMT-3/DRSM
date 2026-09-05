import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { auditMutation } from '../middleware/auditLog';
import { asyncHandler } from '../utils/asyncHandler';
import { createVehicle, listVehicles, setVehicleActive } from '../controllers/vehicleController';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(listVehicles));

router.post(
  '/',
  auditMutation('create', (_req, res) => {
    const target = res.locals.auditTarget as { targetId?: unknown; afterState?: unknown } | undefined;
    return { targetType: 'Vehicle', targetId: (target?.targetId as string) ?? null, afterState: target?.afterState ?? null };
  }),
  asyncHandler(createVehicle),
);

router.patch(
  '/:id/active',
  auditMutation('update', (_req, res) => {
    const target = res.locals.auditTarget as { targetId?: unknown; afterState?: unknown } | undefined;
    return { targetType: 'Vehicle', targetId: (target?.targetId as string) ?? null, afterState: target?.afterState ?? null };
  }),
  asyncHandler(setVehicleActive),
);

export default router;
