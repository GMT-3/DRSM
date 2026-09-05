import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { auditMutation } from '../middleware/auditLog';
import { asyncHandler } from '../utils/asyncHandler';
import { recordDistribution, listDistributions } from '../controllers/distributionController';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(listDistributions));

router.post(
  '/',
  auditMutation('distribute', (_req, res) => {
    const target = res.locals.auditTarget as { targetId?: unknown; afterState?: unknown } | undefined;
    return { targetType: 'DistributionRecord', targetId: (target?.targetId as string) ?? null, afterState: target?.afterState ?? null };
  }),
  asyncHandler(recordDistribution),
);

export default router;
