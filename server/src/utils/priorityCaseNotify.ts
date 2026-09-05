import { Severity } from '../models/PriorityCase';

// Pure extraction of Rule.md's skip-level escalation rule: Municipality
// and District are notified simultaneously always; Province joins only
// when severity crosses the 'critical' threshold. Kept pure and separate
// from priorityCaseController so the escalation rule itself is
// unit-testable without spinning up a database.
export function resolveNotifiedLevels(severity: Severity): string[] {
  const levels = ['municipality', 'district'];
  if (severity === 'critical') levels.push('province');
  return levels;
}
