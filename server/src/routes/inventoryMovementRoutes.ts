import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { auditMutation } from '../middleware/auditLog';
import { asyncHandler } from '../utils/asyncHandler';
import { recordMovement, listMovements } from '../controllers/inventoryMovementController';

const router = Router();

router.use(requireAuth);

router.get('/', asyncHandler(listMovements));

router.post(
  '/',
  auditMutation('update', (_req, res) => {
    const target = res.locals.auditTarget as { targetId?: unknown; afterState?: unknown } | undefined;
    return { targetType: 'InventoryMovement', targetId: (target?.targetId as string) ?? null, afterState: target?.afterState ?? null };
  }),
  asyncHandler(recordMovement),
);

export default router;
