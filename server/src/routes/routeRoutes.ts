import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { auditMutation } from '../middleware/auditLog';
import { asyncHandler } from '../utils/asyncHandler';
import { createRoute, listRoutes, updateRouteCondition } from '../controllers/routeController';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(listRoutes));

router.post(
  '/',
  auditMutation('create', (_req, res) => {
    const target = res.locals.auditTarget as { targetId?: unknown; afterState?: unknown } | undefined;
    return { targetType: 'Route', targetId: (target?.targetId as string) ?? null, afterState: target?.afterState ?? null };
  }),
  asyncHandler(createRoute),
);

router.patch(
  '/:id/condition',
  auditMutation('status_change', (_req, res) => {
    const target = res.locals.auditTarget as { targetId?: unknown; afterState?: unknown } | undefined;
    return { targetType: 'Route', targetId: (target?.targetId as string) ?? null, afterState: target?.afterState ?? null };
  }),
  asyncHandler(updateRouteCondition),
);

export default router;
