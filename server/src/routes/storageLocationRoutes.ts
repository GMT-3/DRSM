import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { auditMutation } from '../middleware/auditLog';
import { asyncHandler } from '../utils/asyncHandler';
import { createStorageLocation, listStorageLocations } from '../controllers/storageLocationController';

const router = Router();

router.use(requireAuth);

router.get('/', asyncHandler(listStorageLocations));

router.post(
  '/',
  auditMutation('create', (_req, res) => {
    const target = res.locals.auditTarget as { targetId?: unknown; afterState?: unknown } | undefined;
    return { targetType: 'StorageLocation', targetId: (target?.targetId as string) ?? null, afterState: target?.afterState ?? null };
  }),
  asyncHandler(createStorageLocation),
);

export default router;
