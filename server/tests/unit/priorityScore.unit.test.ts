import { computePriorityScore } from '../../src/utils/priorityScore';

const BASE_CTX = { accessMode: 'road' as const, hoursSinceSubmission: 0 };

describe('computePriorityScore', () => {
  it('returns 0 for a fully-covered, non-hazardous, freshly-submitted, road-accessible requirement', () => {
    const score = computePriorityScore(
      { populationAffected: 0, vulnerableCount: 0, availableSupplyRatio: 1, hazardActive: false },
      BASE_CTX,
    );
    expect(score).toBe(0);
  });

  it('scores higher for a larger affected population, all else equal', () => {
    const small = computePriorityScore(
      { populationAffected: 10, vulnerableCount: 0, availableSupplyRatio: 0, hazardActive: false },
      BASE_CTX,
    );
    const large = computePriorityScore(
      { populationAffected: 90, vulnerableCount: 0, availableSupplyRatio: 0, hazardActive: false },
      BASE_CTX,
    );
    expect(large).toBeGreaterThan(small);
  });

  it('scores higher when supply coverage is lower (bigger gap = more urgent)', () => {
    const wellSupplied = computePriorityScore(
      { populationAffected: 50, vulnerableCount: 5, availableSupplyRatio: 0.9, hazardActive: false },
      BASE_CTX,
    );
    const unsupplied = computePriorityScore(
      { populationAffected: 50, vulnerableCount: 5, availableSupplyRatio: 0.1, hazardActive: false },
      BASE_CTX,
    );
    expect(unsupplied).toBeGreaterThan(wellSupplied);
  });

  it('scores higher the longer a requirement has waited, up to the 72h cap', () => {
    const fresh = computePriorityScore(
      { populationAffected: 20, vulnerableCount: 2, availableSupplyRatio: 0.5, hazardActive: false },
      { accessMode: 'road', hoursSinceSubmission: 1 },
    );
    const stale = computePriorityScore(
      { populationAffected: 20, vulnerableCount: 2, availableSupplyRatio: 0.5, hazardActive: false },
      { accessMode: 'road', hoursSinceSubmission: 96 },
    );
    const capped = computePriorityScore(
      { populationAffected: 20, vulnerableCount: 2, availableSupplyRatio: 0.5, hazardActive: false },
      { accessMode: 'road', hoursSinceSubmission: 500 },
    );
    expect(stale).toBeGreaterThan(fresh);
    expect(capped).toBe(stale); // capped at 72h — no further increase past that
  });

  it('scores an airlift-only site higher than a road-accessible one, all else equal', () => {
    const road = computePriorityScore(
      { populationAffected: 30, vulnerableCount: 3, availableSupplyRatio: 0.4, hazardActive: false },
      { accessMode: 'road', hoursSinceSubmission: 5 },
    );
    const airlift = computePriorityScore(
      { populationAffected: 30, vulnerableCount: 3, availableSupplyRatio: 0.4, hazardActive: false },
      { accessMode: 'airlift_only', hoursSinceSubmission: 5 },
    );
    expect(airlift).toBeGreaterThan(road);
  });

  it('an active hazard always pushes the score up', () => {
    const noHazard = computePriorityScore(
      { populationAffected: 10, vulnerableCount: 1, availableSupplyRatio: 0.7, hazardActive: false },
      BASE_CTX,
    );
    const hazard = computePriorityScore(
      { populationAffected: 10, vulnerableCount: 1, availableSupplyRatio: 0.7, hazardActive: true },
      BASE_CTX,
    );
    expect(hazard).toBeGreaterThan(noHazard);
  });

  it('never exceeds 100 even when every factor is maxed out', () => {
    const score = computePriorityScore(
      { populationAffected: 10000, vulnerableCount: 10000, availableSupplyRatio: 0, hazardActive: true },
      { accessMode: 'airlift_only', hoursSinceSubmission: 10000 },
    );
    expect(score).toBe(100);
  });
});
