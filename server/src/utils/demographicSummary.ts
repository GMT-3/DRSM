import { PersonStatus, VulnerabilityFlag } from '../models/Person';

export interface PersonLike {
  status: PersonStatus;
  vulnerabilityFlags: VulnerabilityFlag[];
  age?: number | null;
}

export interface DemographicSummary {
  totalPopulation: number;
  byStatus: Record<PersonStatus, number>;
  byVulnerability: Record<VulnerabilityFlag, number>;
}

const STATUSES: PersonStatus[] = ['normal', 'stranded', 'displaced', 'missing', 'rescued', 'evacuated'];
const FLAGS: VulnerabilityFlag[] = [
  'pregnant',
  'recently_delivered',
  'child_under_5',
  'elderly',
  'disabled',
  'chronic_illness',
];

/**
 * Pure aggregation over a list of Person-like records into the counts
 * Modules.md's Demographic module needs (Population Status, Demographic
 * Composition, Stranded/Displaced/Missing/Rescued-Evacuated breakdowns).
 * Kept DB-free and pure so it's unit-testable without mongodb-memory-server
 * (see tests/unit/demographicSummary.unit.test.ts) — the controller is the
 * only place that fetches documents and hands them to this function.
 */
export function summarizePersons(people: PersonLike[]): DemographicSummary {
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<PersonStatus, number>;
  const byVulnerability = Object.fromEntries(FLAGS.map((f) => [f, 0])) as Record<VulnerabilityFlag, number>;

  for (const person of people) {
    if (byStatus[person.status] !== undefined) byStatus[person.status] += 1;
    for (const flag of person.vulnerabilityFlags ?? []) {
      if (byVulnerability[flag] !== undefined) byVulnerability[flag] += 1;
    }
  }

  return {
    totalPopulation: people.length,
    byStatus,
    byVulnerability,
  };
}
