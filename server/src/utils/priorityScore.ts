import { AccessMode } from '../models/Site';

/**
 * Inputs the priority formula needs (Schema.md: priorityScore is "computed
 * from population, vulnerability, available supply, consumption, time,
 * accessibility, hazard conditions"). Schema.md names the inputs but not
 * their storage shape, so they're persisted on the Requirement as
 * `priorityInputs` (see models/Requirement.ts) — the same kind of
 * documented, minimal extension as Household.clientUuid in Phase 2.
 */
export interface PriorityInputs {
  populationAffected: number;
  vulnerableCount: number;
  /** 0 = nothing available yet (most urgent), 1 = fully covered already. */
  availableSupplyRatio: number;
  hazardActive: boolean;
}

export interface PriorityContext {
  accessMode: AccessMode;
  hoursSinceSubmission: number;
}

const ACCESS_URGENCY: Record<AccessMode, number> = {
  road: 0,
  foot_only: 60,
  airlift_only: 100,
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Pure 0-100 priority score. Weights are a documented, deliberate policy
 * choice (Roles.md: "Central Government ... Sets cluster-based
 * prioritization policy") rather than derived from the docs, since no file
 * specifies exact weights — kept in one place so that policy can be
 * revisited without touching call sites.
 */
export function computePriorityScore(inputs: PriorityInputs, ctx: PriorityContext): number {
  const populationFactor = clamp01(inputs.populationAffected / 100) * 100;
  const vulnerabilityFactor = clamp01(inputs.vulnerableCount / 20) * 100;
  const supplyGapFactor = clamp01(1 - inputs.availableSupplyRatio) * 100;
  const timeFactor = clamp01(ctx.hoursSinceSubmission / 72) * 100;
  const accessibilityFactor = ACCESS_URGENCY[ctx.accessMode];
  const hazardFactor = inputs.hazardActive ? 100 : 0;

  const score =
    0.25 * populationFactor +
    0.2 * vulnerabilityFactor +
    0.2 * supplyGapFactor +
    0.15 * timeFactor +
    0.1 * accessibilityFactor +
    0.1 * hazardFactor;

  return Math.round(score);
}
