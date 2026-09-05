import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { listCategories } from '../controllers/adminController';

// Read-only, any authenticated role (unlike /api/admin/categories, which is
// government-only): every role that can register inventory or a
// requirement — including organizations and NGOs — needs to read the
// admin-configured category picklist to populate a dropdown, even though
// only government roles can add or remove categories from it.
const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(listCategories));

export default router;
