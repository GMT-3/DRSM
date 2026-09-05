import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { auditMutation } from '../middleware/auditLog';
import { asyncHandler } from '../utils/asyncHandler';
import { submitFieldReport, listFieldReports } from '../controllers/fieldReportController';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(listFieldReports));

router.post(
  '/',
  auditMutation('create', (_req, res) => {
    const target = res.locals.auditTarget as { targetId?: unknown; afterState?: unknown } | undefined;
    return { targetType: 'FieldReport', targetId: (target?.targetId as string) ?? null, afterState: target?.afterState ?? null };
  }),
  asyncHandler(submitFieldReport),
);

export default router;
