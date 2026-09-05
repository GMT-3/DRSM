import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { auditMutation } from '../middleware/auditLog';
import { asyncHandler } from '../utils/asyncHandler';
import {
  registerHousehold,
  listHouseholds,
  getHousehold,
  getHouseholdQr,
  addPerson,
  updatePerson,
  syncHouseholds,
} from '../controllers/householdController';

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

router.get('/', asyncHandler(listHouseholds));
router.get('/:id', asyncHandler(getHousehold));
router.get('/:id/qr', asyncHandler(getHouseholdQr));

router.post('/', auditFromLocals('register_household', 'Household'), asyncHandler(registerHousehold));
router.post('/:id/persons', auditFromLocals('register_person', 'Person'), asyncHandler(addPerson));
router.patch('/:id/persons/:personId', auditFromLocals('status_change', 'Person'), asyncHandler(updatePerson));

// Offline field-app background sync (Tech.md) — bulk upsert-by-clientUuid.
router.post('/sync', auditFromLocals('register_household', 'Household'), asyncHandler(syncHouseholds));

export default router;
