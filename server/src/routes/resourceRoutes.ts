import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { auditMutation } from '../middleware/auditLog';
import { asyncHandler } from '../utils/asyncHandler';
import { createResource, listResources, updateResourceState } from '../controllers/resourceController';

const router = Router();

router.use(requireAuth);

function auditFromLocals(action: Parameters<typeof auditMutation>[0]) {
  return auditMutation(action, (req, res) => {
    const target = res.locals.auditTarget as
      | { targetId?: unknown; beforeState?: unknown; afterState?: unknown }
      | undefined;
    return {
      targetType: 'Resource',
      targetId: (target?.targetId as string) ?? req.params.id ?? null,
      beforeState: target?.beforeState ?? null,
      afterState: target?.afterState ?? null,
    };
  });
}

router.get('/', asyncHandler(listResources));
router.post('/', auditFromLocals('create'), asyncHandler(createResource));
router.patch('/:id/state', auditFromLocals('status_change'), asyncHandler(updateResourceState));

export default router;
