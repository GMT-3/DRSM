import { summarizePersons, PersonLike } from '../../src/utils/demographicSummary';

describe('summarizePersons', () => {
  it('counts total population and status buckets', () => {
    const people: PersonLike[] = [
      { status: 'normal', vulnerabilityFlags: [] },
      { status: 'stranded', vulnerabilityFlags: [] },
      { status: 'stranded', vulnerabilityFlags: [] },
      { status: 'missing', vulnerabilityFlags: [] },
    ];
    const summary = summarizePersons(people);
    expect(summary.totalPopulation).toBe(4);
    expect(summary.byStatus.stranded).toBe(2);
    expect(summary.byStatus.missing).toBe(1);
    expect(summary.byStatus.normal).toBe(1);
    expect(summary.byStatus.displaced).toBe(0);
  });

  it('counts vulnerability flags, including a person with multiple flags', () => {
    const people: PersonLike[] = [
      { status: 'normal', vulnerabilityFlags: ['pregnant', 'child_under_5'] },
      { status: 'normal', vulnerabilityFlags: ['elderly'] },
    ];
    const summary = summarizePersons(people);
    expect(summary.byVulnerability.pregnant).toBe(1);
    expect(summary.byVulnerability.child_under_5).toBe(1);
    expect(summary.byVulnerability.elderly).toBe(1);
    expect(summary.byVulnerability.disabled).toBe(0);
  });

  it('returns all-zero buckets for an empty list', () => {
    const summary = summarizePersons([]);
    expect(summary.totalPopulation).toBe(0);
    expect(Object.values(summary.byStatus).every((n) => n === 0)).toBe(true);
    expect(Object.values(summary.byVulnerability).every((n) => n === 0)).toBe(true);
  });
});
