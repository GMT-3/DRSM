import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { auditMutation } from '../middleware/auditLog';
import { asyncHandler } from '../utils/asyncHandler';
import { reportPriorityCase, listPriorityCases, updatePriorityCaseStatus } from '../controllers/priorityCaseController';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(listPriorityCases));

router.post(
  '/',
  auditMutation('escalate', (_req, res) => {
    const target = res.locals.auditTarget as { targetId?: unknown; afterState?: unknown } | undefined;
    return { targetType: 'PriorityCase', targetId: (target?.targetId as string) ?? null, afterState: target?.afterState ?? null };
  }),
  asyncHandler(reportPriorityCase),
);

router.patch(
  '/:id/status',
  auditMutation('status_change', (_req, res) => {
    const target = res.locals.auditTarget as { targetId?: unknown; afterState?: unknown } | undefined;
    return { targetType: 'PriorityCase', targetId: (target?.targetId as string) ?? null, afterState: target?.afterState ?? null };
  }),
  asyncHandler(updatePriorityCaseStatus),
);

export default router;
