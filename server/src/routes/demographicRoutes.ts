import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { auditMutation } from '../middleware/auditLog';
import { asyncHandler } from '../utils/asyncHandler';
import { getDemographicSummary } from '../controllers/demographicController';

const router = Router();

router.use(requireAuth);

router.get('/summary', asyncHandler(getDemographicSummary));

export default router;
