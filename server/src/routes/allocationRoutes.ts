import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { auditMutation } from '../middleware/auditLog';
import { asyncHandler } from '../utils/asyncHandler';
import { createAllocation, listAllocations } from '../controllers/allocationController';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(listAllocations));

router.post(
  '/',
  auditMutation('allocate', (_req, res) => {
    const target = res.locals.auditTarget as { targetId?: unknown; afterState?: unknown } | undefined;
    return { targetType: 'ResourceAllocation', targetId: (target?.targetId as string) ?? null, afterState: target?.afterState ?? null };
  }),
  asyncHandler(createAllocation),
);

export default router;
