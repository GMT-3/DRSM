import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { auditMutation } from '../middleware/auditLog';
import { asyncHandler } from '../utils/asyncHandler';
import { createNotice, listNotices } from '../controllers/noticeController';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(listNotices));

router.post(
  '/',
  auditMutation('create', (_req, res) => {
    const target = res.locals.auditTarget as { targetId?: unknown; afterState?: unknown } | undefined;
    return { targetType: 'Notice', targetId: (target?.targetId as string) ?? null, afterState: target?.afterState ?? null };
  }),
  asyncHandler(createNotice),
);

export default router;
