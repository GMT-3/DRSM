import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { auditMutation } from '../middleware/auditLog';
import { asyncHandler } from '../utils/asyncHandler';
import {
  appointFieldPersonnel,
  listFieldPersonnel,
  setFieldPersonnelActive,
  createGovAccount,
} from '../controllers/userManagementController';

const router = Router();

router.use(requireAuth);

function auditFromLocals(action: Parameters<typeof auditMutation>[0], targetType: string) {
  return auditMutation(action, (req, res) => {
    const target = res.locals.auditTarget as
      | { targetId?: unknown; beforeState?: unknown; afterState?: unknown }
      | undefined;
    return {
      targetType,
      targetId: (target?.targetId as string) ?? req.params.id ?? null,
      beforeState: target?.beforeState ?? null,
      afterState: target?.afterState ?? null,
    };
  });
}

// Volunteer/Police/Army appointment — Ward/Municipality only (Tech.md: no self-registration).
router.post(
  '/field-personnel',
  requireRole('municipality_ward'),
  auditFromLocals('assign_user', 'User'),
  asyncHandler(appointFieldPersonnel),
);

router.get('/field-personnel', asyncHandler(listFieldPersonnel));

router.patch(
  '/field-personnel/:id/active',
  requireRole('municipality_ward', 'central'),
  auditFromLocals('status_change', 'User'),
  asyncHandler(setFieldPersonnelActive),
);

// Government account management — Central only (Roles.md).
router.post(
  '/gov-accounts',
  requireRole('central'),
  auditFromLocals('create_user', 'User'),
  asyncHandler(createGovAccount),
);

export default router;
