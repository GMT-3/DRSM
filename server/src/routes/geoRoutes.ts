import { Router } from 'express';
import { Types } from 'mongoose';
import { requireAuth } from '../middleware/auth';
import { auditMutation } from '../middleware/auditLog';
import { asyncHandler } from '../utils/asyncHandler';
import {
  listProvinces,
  listDistricts,
  listMunicipalities,
  listWards,
  listSites,
  createSite,
} from '../controllers/geoController';
import { updateSiteAccessMode } from '../controllers/demographicController';

const router = Router();

router.use(requireAuth);

router.get('/provinces', asyncHandler(listProvinces));
router.get('/districts', asyncHandler(listDistricts));
router.get('/municipalities', asyncHandler(listMunicipalities));
router.get('/wards', asyncHandler(listWards));
router.get('/sites', asyncHandler(listSites));

router.post(
  '/sites',
  auditMutation('create', (_req, res) => {
    const target = res.locals.auditTarget as { targetId?: string | Types.ObjectId | null; afterState?: unknown } | undefined;
    return {
      targetType: 'Site',
      targetId: target?.targetId ?? null,
      afterState: target?.afterState ?? null,
    };
  }),
  asyncHandler(createSite),
);

router.patch(
  '/sites/:id/access-mode',
  auditMutation('update', (req, res) => {
    const target = res.locals.auditTarget as
      | { targetId?: string | Types.ObjectId | null; beforeState?: unknown; afterState?: unknown }
      | undefined;
    return {
      targetType: 'Site',
      targetId: target?.targetId ?? req.params.id ?? null,
      beforeState: target?.beforeState ?? null,
      afterState: target?.afterState ?? null,
    };
  }),
  asyncHandler(updateSiteAccessMode),
);

export default router;
