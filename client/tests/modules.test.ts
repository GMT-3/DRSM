import { describe, it, expect } from 'vitest';
import { MODULES, modulesForRole } from '../src/config/modules';

// Design.md: "Sidebar contents are filtered by the logged-in user's
// role/scope — a Ward user does not see Administration; a Volunteer sees
// a reduced set." This is the pure logic behind that filtering.
describe('modulesForRole', () => {
  it('returns all 9 modules for central (no restrictions)', () => {
    expect(modulesForRole('central')).toHaveLength(MODULES.length);
    expect(modulesForRole('central').find((m) => m.key === 'administration')).toBeDefined();
  });

  it('includes Administration for the government-level roles', () => {
    for (const role of ['central', 'district_cdo', 'municipality_ward'] as const) {
      expect(modulesForRole(role).some((m) => m.key === 'administration')).toBe(true);
    }
  });

  it('excludes Administration for field personnel and organizations', () => {
    for (const role of ['volunteer', 'police', 'army', 'ngo_ingo', 'private_org', 'donor'] as const) {
      expect(modulesForRole(role).some((m) => m.key === 'administration')).toBe(false);
    }
  });

  it('every module has a unique id 1-9 matching its sidebar position', () => {
    const ids = MODULES.map((m) => m.id);
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
