import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { getSituationOverview } from '../controllers/situationController';

const router = Router();
router.use(requireAuth);

// Read-only aggregation layer — no mutation routes on this module by
// design (Modules.md module 5 is "the interpretation/coordination layer",
// it doesn't originate its own data).
router.get('/overview', asyncHandler(getSituationOverview));

export default router;
