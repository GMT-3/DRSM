import { IRequirement, IRequirementHistoryEntry, RequirementStatus } from '../models/Requirement';
import { IResourceAllocation } from '../models/ResourceAllocation';
import { DispatchStatus, ITransportDispatch } from '../models/TransportDispatch';

/**
 * The live, end-to-end "tracking system" Roles.md calls the core
 * requirement: a single ordered view of what has happened to a
 * Requirement's relief, from submission through Municipality/Ward
 * confirming receipt.
 *
 * Scope (Rule.md's 2026-09-05 update / Prd.md "Out of scope (v1)"): the
 * current build's terminal, trackable event is a TransportDispatch
 * reaching 'received' at its destination Site (which flips the linked
 * ResourceAllocation to 'delivered'). The Volunteer -> Victim/Beneficiary
 * handoff (TransportDispatch 'distributed', DistributionRecord) is
 * next-update scope (Tracking.md, Tracker.md Phase 12) and is
 * deliberately never surfaced by this timeline, even if a dispatch
 * record's own status has been advanced past 'received' by a direct API
 * call — this function is the single place that draws the current
 * build's visible line.
 */

export type TrackingStage =
  | 'submitted'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'allocated'
  | 'dispatched'
  | 'in_transit'
  | 'delivered'
  | 'partially_fulfilled'
  | 'fulfilled';

export interface TrackingTimelineEntry {
  stage: TrackingStage;
  label: string;
  at: Date;
  note?: string;
  byUserId?: string;
}

export interface TrackingTimelineResult {
  currentStage: TrackingStage;
  timeline: TrackingTimelineEntry[];
  scopeNote: string;
}

export const CURRENT_BUILD_SCOPE_NOTE =
  "Tracked through Municipality/Ward confirming receipt of this allocation. Beneficiary-level (Volunteer -> Victim/Beneficiary) delivery confirmation is next-update scope.";

const STAGE_LABELS: Record<TrackingStage, string> = {
  submitted: 'Submitted',
  pending_approval: 'Pending approval',
  approved: 'Approved',
  rejected: 'Rejected',
  allocated: 'Resource allocated',
  dispatched: 'Dispatched',
  in_transit: 'In transit',
  delivered: 'Delivered — confirmed at Municipality/Ward',
  partially_fulfilled: 'Partially fulfilled',
  fulfilled: 'Fulfilled',
};

// Dispatch statuses this build's timeline recognizes. 'arrived' is folded
// into 'in_transit' (arrived-but-not-yet-received is still "in transit"
// from the requirement's point of view) and anything at or past
// 'received' reads as this build's terminal 'delivered' stage — never a
// beneficiary-facing 'distributed' label.
function dispatchStatusToStage(status: DispatchStatus): TrackingStage {
  if (status === 'dispatched') return 'dispatched';
  if (status === 'in_transit' || status === 'arrived') return 'in_transit';
  return 'delivered'; // 'received' or (defensively) 'distributed'
}

function requirementHistoryToEntries(history: IRequirementHistoryEntry[]): TrackingTimelineEntry[] {
  return history
    .filter((h) => h.status !== 'delivered' && h.status !== 'dispatched' && h.status !== 'allocated')
    .map((h) => ({
      stage: h.status as TrackingStage,
      label: STAGE_LABELS[h.status as TrackingStage] ?? h.status,
      at: h.at,
      note: h.note,
      byUserId: String(h.byUserId),
    }));
}

/**
 * Builds the ordered tracking timeline for one Requirement, folding in
 * every ResourceAllocation raised against it and every TransportDispatch
 * raised against those allocations. Pure function — no DB access — so it
 * is fully unit-testable without mongodb-memory-server (see
 * tests/unit/trackingTimeline.unit.test.ts), unlike most of this
 * project's Phase 5 coverage.
 */
export function buildTrackingTimeline(
  requirement: Pick<IRequirement, 'status' | 'history'>,
  allocations: Pick<IResourceAllocation, 'allocatedAt' | 'status'>[],
  dispatches: Pick<ITransportDispatch, 'status' | 'dispatchedAt' | 'lastPositionUpdateAt'>[],
): TrackingTimelineResult {
  const entries: TrackingTimelineEntry[] = requirementHistoryToEntries(requirement.history);

  for (const allocation of allocations) {
    entries.push({ stage: 'allocated', label: STAGE_LABELS.allocated, at: allocation.allocatedAt });
  }

  let furthestDispatchStage: TrackingStage | null = null;
  for (const dispatch of dispatches) {
    entries.push({ stage: 'dispatched', label: STAGE_LABELS.dispatched, at: dispatch.dispatchedAt });
    const stage = dispatchStatusToStage(dispatch.status);
    if (stage === 'in_transit' || stage === 'delivered') {
      entries.push({
        stage,
        label: STAGE_LABELS[stage],
        at: dispatch.lastPositionUpdateAt ?? dispatch.dispatchedAt,
      });
    }
    if (
      furthestDispatchStage === null ||
      stageRank(stage) > stageRank(furthestDispatchStage)
    ) {
      furthestDispatchStage = stage;
    }
  }

  entries.sort((a, b) => a.at.getTime() - b.at.getTime());

  const currentStage = resolveCurrentStage(requirement.status, furthestDispatchStage);

  return { currentStage, timeline: entries, scopeNote: CURRENT_BUILD_SCOPE_NOTE };
}

const STAGE_ORDER: TrackingStage[] = [
  'submitted',
  'pending_approval',
  'approved',
  'rejected',
  'allocated',
  'dispatched',
  'in_transit',
  'delivered',
  'partially_fulfilled',
  'fulfilled',
];

function stageRank(stage: TrackingStage): number {
  return STAGE_ORDER.indexOf(stage);
}

/**
 * The Requirement's own `status` already reflects allocate/dispatch/
 * deliver once transportController advances it (see
 * updateDispatchStatus), but a dispatch that is merely 'in_transit'
 * doesn't yet have a matching Requirement status of its own — so this
 * takes the more advanced of the two, never the less advanced.
 */
function resolveCurrentStage(requirementStatus: RequirementStatus, furthestDispatchStage: TrackingStage | null): TrackingStage {
  if (furthestDispatchStage && stageRank(furthestDispatchStage) > stageRank(requirementStatus as TrackingStage)) {
    return furthestDispatchStage;
  }
  return requirementStatus as TrackingStage;
}
