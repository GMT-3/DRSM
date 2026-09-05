import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { AuditLog } from '../models/AuditLog';

const router = Router();

// Read-only by construction: no PUT/PATCH/DELETE route is ever registered
// here. Only Central Government may view the national audit log (Appflow.md
// screen list: "national audit log viewer"); District/Municipality-scoped
// audit views are a later-phase concern once actorRole-based scoping is needed.
router.get(
  '/',
  requireAuth,
  requireRole('central'),
  asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(String(req.query.limit ?? '100'), 10) || 100, 500);
    const logs = await AuditLog.find().sort({ timestamp: -1 }).limit(limit);
    res.json({ logs });
  }),
);

export default router;
