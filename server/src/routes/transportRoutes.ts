import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { auditMutation } from '../middleware/auditLog';
import { asyncHandler } from '../utils/asyncHandler';
import { createDispatch, listDispatches, updateDispatchStatus, updateDispatchPosition } from '../controllers/transportController';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(listDispatches));

router.post(
  '/',
  auditMutation('dispatch', (_req, res) => {
    const target = res.locals.auditTarget as { targetId?: unknown; afterState?: unknown } | undefined;
    return { targetType: 'TransportDispatch', targetId: (target?.targetId as string) ?? null, afterState: target?.afterState ?? null };
  }),
  asyncHandler(createDispatch),
);

router.patch(
  '/:id/status',
  auditMutation('status_change', (_req, res) => {
    const target = res.locals.auditTarget as { targetId?: unknown; afterState?: unknown } | undefined;
    return { targetType: 'TransportDispatch', targetId: (target?.targetId as string) ?? null, afterState: target?.afterState ?? null };
  }),
  asyncHandler(updateDispatchStatus),
);

// Position pings are high-frequency and not independently meaningful for
// the audit trail (the resulting status changes already are) — skipped
// from AuditLog deliberately, same reasoning as skipping it for read
// endpoints.
router.patch('/:id/position', asyncHandler(updateDispatchPosition));

export default router;
