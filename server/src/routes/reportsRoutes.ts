import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import {
  requirementReport,
  resourceReport,
  inventoryReport,
  transportReport,
  distributionReport,
  unfulfilledRequirementsReport,
  responseTimelineReport,
  exportReport,
} from '../controllers/reportsController';

const router = Router();
router.use(requireAuth);

// Read-only reporting layer — no mutation routes (Modules.md module 8 is
// for formal reporting/analysis over live data, not a data source itself).
router.get('/requirements', asyncHandler(requirementReport));
router.get('/resources', asyncHandler(resourceReport));
router.get('/inventory', asyncHandler(inventoryReport));
router.get('/transport', asyncHandler(transportReport));
router.get('/distribution', asyncHandler(distributionReport));
router.get('/unfulfilled', asyncHandler(unfulfilledRequirementsReport));
router.get('/timeline', asyncHandler(responseTimelineReport));
router.get('/export/:type', asyncHandler(exportReport));

export default router;
