import { Request, Response } from 'express';
import { Site } from '../models/Site';
import { Person } from '../models/Person';
import { Household } from '../models/Household';
import { Requirement } from '../models/Requirement';
import { TransportDispatch } from '../models/TransportDispatch';
import { resolveScopedSiteIds } from '../utils/scopeResolvers';

/**
 * Main Dashboard overview stat cards (Modules.md / Design.md). Real
 * aggregates from live collections, scoped per caller — deliberately
 * returns zeros rather than mock numbers until later phases populate
 * Requirement/TransportDispatch/etc: a Phase-0 dashboard shell should
 * never show invented figures.
 */
export async function getDashboardSummary(req: Request, res: Response) {
  const siteIds = await resolveScopedSiteIds(req);
  const siteFilter = siteIds === null ? {} : { _id: { $in: siteIds } };
  const siteScopedFilter = siteIds === null ? {} : { siteId: { $in: siteIds } };

  const [affectedLocations, householdIds] = await Promise.all([
    Site.countDocuments(siteFilter),
    Household.find(siteIds === null ? {} : { siteId: { $in: siteIds } }).select('_id'),
  ]);

  const [affectedPopulation, activeRequirements, criticalRequirements, resourcesInTransit, pendingActions] =
    await Promise.all([
      Person.countDocuments({ householdId: { $in: householdIds.map((h) => h._id) } }),
      Requirement.countDocuments({
        ...siteScopedFilter,
        status: { $in: ['submitted', 'pending_approval', 'approved', 'allocated', 'dispatched', 'partially_fulfilled'] },
      }),
      Requirement.countDocuments({ ...siteScopedFilter, priorityScore: { $gte: 80 } }),
      TransportDispatch.countDocuments({
        status: 'in_transit',
        ...(siteIds === null ? {} : { destinationSiteId: { $in: siteIds } }),
      }),
      Requirement.countDocuments({ ...siteScopedFilter, status: 'pending_approval' }),
    ]);

  res.json({
    affectedLocations,
    affectedPopulation,
    activeRequirements,
    criticalRequirements,
    resourcesInTransit,
    pendingActions,
    lastUpdated: new Date().toISOString(),
  });
}
