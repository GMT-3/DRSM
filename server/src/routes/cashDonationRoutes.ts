import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { auditMutation } from '../middleware/auditLog';
import { asyncHandler } from '../utils/asyncHandler';
import {
  submitDonation,
  listDonations,
  verifyDonation,
  getFundSummary,
  allocateFund,
  listAllocations,
} from '../controllers/cashDonationController';

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

router.get('/', asyncHandler(listDonations));
router.post('/', auditFromLocals('create', 'CashDonation'), asyncHandler(submitDonation));
router.patch('/:id/verify', auditFromLocals('verify_donation', 'CashDonation'), asyncHandler(verifyDonation));

router.get('/summary', asyncHandler(getFundSummary));

router.get('/allocations', asyncHandler(listAllocations));
router.post('/allocations', auditFromLocals('allocate', 'FundAllocation'), asyncHandler(allocateFund));

export default router;
