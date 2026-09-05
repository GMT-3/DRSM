import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { auditMutation } from '../middleware/auditLog';
import { asyncHandler } from '../utils/asyncHandler';
import {
  createSupplyAssistanceRequest,
  listSupplyAssistanceRequests,
  respondToSupplyAssistanceRequest,
  decideOffer,
  cancelSupplyAssistanceRequest,
} from '../controllers/supplyAssistanceController';

const router = Router();

router.use(requireAuth);

function auditFromLocals(action: Parameters<typeof auditMutation>[0]) {
  return auditMutation(action, (req, res) => {
    const target = res.locals.auditTarget as
      | { targetId?: unknown; beforeState?: unknown; afterState?: unknown }
      | undefined;
    return {
      targetType: 'SupplyAssistanceRequest',
      targetId: (target?.targetId as string) ?? req.params.id ?? null,
      beforeState: target?.beforeState ?? null,
      afterState: target?.afterState ?? null,
    };
  });
}

router.get('/', asyncHandler(listSupplyAssistanceRequests));
router.post('/', auditFromLocals('create'), asyncHandler(createSupplyAssistanceRequest));
router.post('/:id/offers', auditFromLocals('create'), asyncHandler(respondToSupplyAssistanceRequest));
router.patch('/:id/offers/:offerId', auditFromLocals('status_change'), asyncHandler(decideOffer));
router.patch('/:id/cancel', auditFromLocals('status_change'), asyncHandler(cancelSupplyAssistanceRequest));

export default router;
