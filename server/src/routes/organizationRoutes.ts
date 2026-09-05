import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { auditMutation } from '../middleware/auditLog';
import { asyncHandler } from '../utils/asyncHandler';
import { registerOrganization, listOrganizations, verifyOrganization } from '../controllers/organizationController';

const router = Router();

// Public — self-registration, no account exists yet (Roles.md).
router.post('/register', asyncHandler(registerOrganization));

router.get('/', requireAuth, asyncHandler(listOrganizations));

router.patch(
  '/:id/verify',
  requireAuth,
  auditMutation('verify_organization', (req, res) => {
    const target = res.locals.auditTarget as
      | { targetId?: unknown; beforeState?: unknown; afterState?: unknown }
      | undefined;
    return {
      targetType: 'Organization',
      targetId: (target?.targetId as string) ?? req.params.id,
      beforeState: target?.beforeState ?? null,
      afterState: target?.afterState ?? null,
    };
  }),
  asyncHandler(verifyOrganization),
);

export default router;
