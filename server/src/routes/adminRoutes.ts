import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { auditMutation } from '../middleware/auditLog';
import { asyncHandler } from '../utils/asyncHandler';
import {
  createProvince,
  createDistrict,
  createMunicipality,
  createWard,
  createDisasterEvent,
  listDisasterEvents,
  closeDisasterEvent,
  createCategory,
  listCategories,
  setCategoryActive,
  listAllUsers,
  updateUserRole,
} from '../controllers/adminController';

const router = Router();
router.use(requireAuth);
router.use(requireRole('central', 'district_cdo', 'municipality_ward'));

function audit(targetType: string) {
  return auditMutation('create', (_req, res) => {
    const target = res.locals.auditTarget as { targetId?: unknown; beforeState?: unknown; afterState?: unknown } | undefined;
    return {
      targetType,
      targetId: (target?.targetId as string) ?? null,
      beforeState: target?.beforeState ?? null,
      afterState: target?.afterState ?? null,
    };
  });
}

router.post('/provinces', audit('Province'), asyncHandler(createProvince));
router.post('/districts', audit('District'), asyncHandler(createDistrict));
router.post('/municipalities', audit('Municipality'), asyncHandler(createMunicipality));
router.post('/wards', audit('Ward'), asyncHandler(createWard));

router.get('/disaster-events', asyncHandler(listDisasterEvents));
router.post('/disaster-events', audit('DisasterEvent'), asyncHandler(createDisasterEvent));
router.patch('/disaster-events/:id/close', audit('DisasterEvent'), asyncHandler(closeDisasterEvent));

router.get('/categories', asyncHandler(listCategories));
router.post('/categories', audit('Category'), asyncHandler(createCategory));
router.patch(
  '/categories/:id/active',
  auditMutation('status_change', (_req, res) => {
    const target = res.locals.auditTarget as { targetId?: unknown; beforeState?: unknown; afterState?: unknown } | undefined;
    return {
      targetType: 'Category',
      targetId: (target?.targetId as string) ?? null,
      beforeState: target?.beforeState ?? null,
      afterState: target?.afterState ?? null,
    };
  }),
  asyncHandler(setCategoryActive),
);

router.get('/users', asyncHandler(listAllUsers));
router.patch(
  '/users/:id/role',
  auditMutation('update', (_req, res) => {
    const target = res.locals.auditTarget as { targetId?: unknown; beforeState?: unknown; afterState?: unknown } | undefined;
    return {
      targetType: 'User',
      targetId: (target?.targetId as string) ?? null,
      beforeState: target?.beforeState ?? null,
      afterState: target?.afterState ?? null,
    };
  }),
  asyncHandler(updateUserRole),
);

export default router;
