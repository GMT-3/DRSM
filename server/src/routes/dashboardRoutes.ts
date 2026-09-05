import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { getDashboardSummary } from '../controllers/dashboardController';

const router = Router();

router.get('/summary', requireAuth, asyncHandler(getDashboardSummary));

export default router;
