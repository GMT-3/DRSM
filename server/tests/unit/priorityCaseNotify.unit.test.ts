import { resolveNotifiedLevels } from '../../src/utils/priorityCaseNotify';

describe('resolveNotifiedLevels (Phase 7 skip-level escalation, Rule.md)', () => {
  it('notifies Municipality and District simultaneously for a high-severity case', () => {
    expect(resolveNotifiedLevels('high')).toEqual(['municipality', 'district']);
  });

  it('adds Province when severity is critical', () => {
    expect(resolveNotifiedLevels('critical')).toEqual(['municipality', 'district', 'province']);
  });
});
