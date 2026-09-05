import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { auditMutation } from '../middleware/auditLog';
import { asyncHandler } from '../utils/asyncHandler';
import {
  submitRequirement,
  listRequirements,
  getRequirement,
  getRequirementTrace,
  approveRequirement,
  rejectRequirement,
  updateRequirementStatus,
  consolidateRequirements,
} from '../controllers/requirementController';

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

router.get('/', asyncHandler(listRequirements));
router.get('/:id', asyncHandler(getRequirement));
// Read-only tracking view (Roles.md "Tracking — the core requirement") —
// no auditMutation wrapper, matching every other GET in this router.
router.get('/:id/trace', asyncHandler(getRequirementTrace));

router.post('/', auditFromLocals('create', 'Requirement'), asyncHandler(submitRequirement));
router.post('/consolidate', auditFromLocals('status_change', 'Requirement'), asyncHandler(consolidateRequirements));
router.patch('/:id/approve', auditFromLocals('status_change', 'Requirement'), asyncHandler(approveRequirement));
router.patch('/:id/reject', auditFromLocals('status_change', 'Requirement'), asyncHandler(rejectRequirement));
router.patch('/:id/status', auditFromLocals('status_change', 'Requirement'), asyncHandler(updateRequirementStatus));

export default router;
