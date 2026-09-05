import { Request, Response } from 'express';
import { Requirement } from '../models/Requirement';
import { ResourceAllocation } from '../models/ResourceAllocation';
import { TransportDispatch } from '../models/TransportDispatch';
import { Route } from '../models/Route';
import { Site } from '../models/Site';
import { resolveScopedSiteIds } from '../utils/scopeResolvers';

const OPEN_STATUSES = ['submitted', 'pending_approval', 'approved', 'allocated', 'dispatched', 'partially_fulfilled'];
const NOT_YET_ALLOCATED = ['submitted', 'pending_approval', 'approved'];
const DELAYED_HOURS_THRESHOLD = 48;

/**
 * Module 5 (Situation & Coordination) — the interpretation/coordination
 * layer over the other modules, not a data source of its own. Roles.md
 * explicitly grants organizations "the shared coordination view (situation,
 * requirements, resource gaps) to align their own response rather than
 * duplicating another org's work", so — unlike every other module built
 * so far — organization roles get the SAME unrestricted view as Central
 * here, not an empty or own-org-scoped one. Donor gets nothing, matching
 * the no-operational-data-of-this-kind pattern used elsewhere.
 */
async function resolveSituationSiteIds(req: Request): Promise<string[] | null> {
  const auth = req.auth!;
  if (auth.role === 'central' || ['ngo_ingo', 'private_org'].includes(auth.role)) return null;
  return resolveScopedSiteIds(req);
}

export async function getSituationOverview(req: Request, res: Response) {
  const auth = req.auth!;
  if (auth.role === 'donor') {
    return res.json({
      criticalLocations: [],
      outstandingRequirements: { count: 0, byCluster: [] },
      resourceGaps: [],
      supplyDemand: [],
      delayedActions: [],
      notShared: true,
    });
  }

  const siteIds = await resolveSituationSiteIds(req);
  const siteFilter = siteIds === null ? {} : { siteId: { $in: siteIds } };

  const requirements = await Requirement.find({ ...siteFilter, status: { $ne: 'rejected' } }).select(
    'siteId cluster quantityRequested status priorityScore',
  );

  // Critical Locations: sites ranked by their highest open priority score.
  const scoreBySite = new Map<string, number>();
  const countBySite = new Map<string, number>();
  for (const r of requirements) {
    if (!OPEN_STATUSES.includes(r.status)) continue;
    const key = String(r.siteId);
    scoreBySite.set(key, Math.max(scoreBySite.get(key) ?? 0, r.priorityScore ?? 0));
    countBySite.set(key, (countBySite.get(key) ?? 0) + 1);
  }
  const topSiteIds = [...scoreBySite.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const sites = await Site.find({ _id: { $in: topSiteIds.map(([id]) => id) } });
  const siteById = new Map(sites.map((s) => [String(s._id), s]));
  const criticalLocations = topSiteIds.map(([id, score]) => ({
    siteId: id,
    siteName: siteById.get(id)?.name ?? 'Unknown site',
    maxPriorityScore: score,
    openRequirementCount: countBySite.get(id) ?? 0,
  }));

  // Outstanding Requirements: everything not yet fulfilled, grouped by cluster.
  const outstanding = requirements.filter((r) => OPEN_STATUSES.includes(r.status));
  const byClusterMap = new Map<string, { count: number; quantityRequested: number }>();
  for (const r of outstanding) {
    const entry = byClusterMap.get(r.cluster) ?? { count: 0, quantityRequested: 0 };
    entry.count += 1;
    entry.quantityRequested += r.quantityRequested;
    byClusterMap.set(r.cluster, entry);
  }
  const outstandingRequirements = {
    count: outstanding.length,
    byCluster: [...byClusterMap.entries()].map(([cluster, v]) => ({ cluster, ...v })),
  };

  // Resource Gaps + Supply-Demand Status: per cluster, requested vs. what
  // has actually moved past "not yet allocated" (a simple, real proxy for
  // "resources committed" without needing a full quantity-level join
  // against ResourceAllocation for every requirement).
  const clusters = new Set(requirements.map((r) => r.cluster));
  const supplyDemand = [...clusters].map((cluster) => {
    const inCluster = requirements.filter((r) => r.cluster === cluster);
    const requested = inCluster.reduce((sum, r) => sum + r.quantityRequested, 0);
    const committed = inCluster
      .filter((r) => !NOT_YET_ALLOCATED.includes(r.status))
      .reduce((sum, r) => sum + r.quantityRequested, 0);
    const delivered = inCluster
      .filter((r) => ['delivered', 'partially_fulfilled', 'fulfilled'].includes(r.status))
      .reduce((sum, r) => sum + r.quantityRequested, 0);
    return { cluster, requested, committed, delivered };
  });
  const resourceGaps = supplyDemand
    .map((s) => ({ cluster: s.cluster, gap: s.requested - s.committed }))
    .filter((g) => g.gap > 0)
    .sort((a, b) => b.gap - a.gap);

  // Delayed / At-Risk Actions: dispatches not yet distributed, either
  // stuck past a time threshold or riding a degraded/blocked route.
  const dispatchFilter = siteIds === null ? {} : { destinationSiteId: { $in: siteIds } };
  const activeDispatches = await TransportDispatch.find({ ...dispatchFilter, status: { $ne: 'distributed' } });
  const routeIds = activeDispatches.map((d) => d.routeId).filter(Boolean);
  const routes = await Route.find({ _id: { $in: routeIds } });
  const routeById = new Map(routes.map((r) => [String(r._id), r]));
  const now = Date.now();
  const delayedActions = activeDispatches
    .map((d) => {
      const hoursSince = (now - new Date(d.dispatchedAt).getTime()) / (1000 * 60 * 60);
      const route = d.routeId ? routeById.get(String(d.routeId)) : null;
      const routeAtRisk = route ? route.currentCondition !== 'open' : false;
      const delayed = hoursSince > DELAYED_HOURS_THRESHOLD || routeAtRisk;
      return delayed
        ? {
            dispatchId: d._id,
            status: d.status,
            hoursSinceDispatch: Math.round(hoursSince),
            reason: routeAtRisk ? `route condition: ${route!.currentCondition}` : 'exceeded expected transit time',
          }
        : null;
    })
    .filter(Boolean);

  res.json({ criticalLocations, outstandingRequirements, resourceGaps, supplyDemand, delayedActions });
}
