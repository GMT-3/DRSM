import { isDuplicateDistribution } from '../../src/utils/duplicateDistribution';

describe('isDuplicateDistribution (Phase 5)', () => {
  it('is not a duplicate when there is no prior record', () => {
    expect(isDuplicateDistribution([], { resourceType: 'rice', distributedAt: new Date() })).toBe(false);
  });

  it('flags a same-day repeat of the same resourceType', () => {
    const now = new Date('2026-09-04T10:00:00Z');
    const priorAt = new Date('2026-09-04T08:00:00Z');
    const result = isDuplicateDistribution(
      [{ resourceType: 'rice', distributedAt: priorAt }],
      { resourceType: 'rice', distributedAt: now },
    );
    expect(result).toBe(true);
  });

  it('does not flag a different resourceType delivered the same day', () => {
    const now = new Date('2026-09-04T10:00:00Z');
    const priorAt = new Date('2026-09-04T08:00:00Z');
    const result = isDuplicateDistribution(
      [{ resourceType: 'tarpaulin', distributedAt: priorAt }],
      { resourceType: 'rice', distributedAt: now },
    );
    expect(result).toBe(false);
  });

  it('does not flag the same resourceType delivered well outside the window', () => {
    const now = new Date('2026-09-10T10:00:00Z');
    const priorAt = new Date('2026-09-04T08:00:00Z');
    const result = isDuplicateDistribution(
      [{ resourceType: 'rice', distributedAt: priorAt }],
      { resourceType: 'rice', distributedAt: now },
    );
    expect(result).toBe(false);
  });

  it('respects a custom window', () => {
    const now = new Date('2026-09-04T10:00:00Z');
    const priorAt = new Date('2026-09-04T02:00:00Z'); // 8 hours earlier
    expect(
      isDuplicateDistribution([{ resourceType: 'rice', distributedAt: priorAt }], { resourceType: 'rice', distributedAt: now }, 4),
    ).toBe(false);
    expect(
      isDuplicateDistribution([{ resourceType: 'rice', distributedAt: priorAt }], { resourceType: 'rice', distributedAt: now }, 12),
    ).toBe(true);
  });
});
