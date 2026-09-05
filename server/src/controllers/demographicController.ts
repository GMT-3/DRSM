import { Request, Response } from 'express';
import { ApiError } from '../utils/ApiError';
import { Site } from '../models/Site';
import { Ward } from '../models/Ward';
import { Household } from '../models/Household';
import { Person } from '../models/Person';
import { summarizePersons } from '../utils/demographicSummary';
import { resolveScopedSiteIds } from '../utils/scopeResolvers';

/**
 * Modules.md's Demographic module in one response: per-site rollups
 * (population, access mode, freshness) plus the caller-scoped aggregate
 * breakdown (Population Status / Demographic Composition / Stranded /
 * Displaced / Missing / Rescued-Evacuated). Read-only, so no audit entry.
 */
export async function getDemographicSummary(req: Request, res: Response) {
  const auth = req.auth!;
  if (['ngo_ingo', 'private_org', 'donor'].includes(auth.role)) {
    return res.json({
      sites: [],
      aggregate: summarizePersons([]),
      note: 'Demographic data is not shared with organizations directly — see the Situation & Coordination module.',
    });
  }

  const siteIds = await resolveScopedSiteIds(req);
  const siteQuery = siteIds === null ? {} : { _id: { $in: siteIds } };
  const sites = await Site.find(siteQuery).sort({ name: 1 });

  const householdsBysite = await Household.find({ siteId: { $in: sites.map((s) => s._id) } }).select('_id siteId');
  const householdIdsBySite = new Map<string, string[]>();
  for (const h of householdsBysite) {
    const key = String(h.siteId);
    const list = householdIdsBySite.get(key) ?? [];
    list.push(String(h._id));
    householdIdsBySite.set(key, list);
  }

  const allHouseholdIds = householdsBysite.map((h) => h._id);
  const allPersons = await Person.find({ householdId: { $in: allHouseholdIds } }).select(
    'householdId status vulnerabilityFlags',
  );
  const personsByHousehold = new Map<string, typeof allPersons>();
  for (const p of allPersons) {
    const key = String(p.householdId);
    const list = personsByHousehold.get(key) ?? [];
    list.push(p);
    personsByHousehold.set(key, list);
  }

  const siteSummaries = sites.map((site) => {
    const householdIds = householdIdsBySite.get(String(site._id)) ?? [];
    const peopleAtSite = householdIds.flatMap((hid) => personsByHousehold.get(hid) ?? []);
    return {
      site,
      householdCount: householdIds.length,
      summary: summarizePersons(peopleAtSite),
    };
  });

  const aggregate = summarizePersons(allPersons);

  res.json({ sites: siteSummaries, aggregate, totalHouseholds: allHouseholdIds.length });
}

const ACCESS_MODES = ['road', 'foot_only', 'airlift_only'];

/** Updates a Site's daily access-mode indicator (Schema.md: "updatable daily"). */
export async function updateSiteAccessMode(req: Request, res: Response) {
  const auth = req.auth!;
  const site = await Site.findById(req.params.id);
  if (!site) throw ApiError.notFound('Site not found');

  if (auth.role !== 'central') {
    const ward = await Ward.findById(site.wardId);
    if (!ward || String(ward.municipalityId) !== auth.scope.municipalityId) {
      throw ApiError.forbidden('Site is outside your scope');
    }
  }

  const { accessMode } = req.body as { accessMode: string };
  if (!ACCESS_MODES.includes(accessMode)) {
    throw ApiError.badRequest(`accessMode must be one of ${ACCESS_MODES.join(', ')}`);
  }

  const before = site.toObject();
  site.accessMode = accessMode as (typeof ACCESS_MODES)[number] as typeof site.accessMode;
  site.accessModeUpdatedAt = new Date();
  site.accessModeUpdatedBy = auth.userId as unknown as typeof site.accessModeUpdatedBy;
  site.lastUpdateAt = new Date();
  await site.save();

  res.locals.auditTarget = { targetId: site._id, beforeState: before, afterState: site.toObject() };
  res.json({ site });
}
