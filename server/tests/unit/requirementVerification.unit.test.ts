import { canVerifyRequirement } from '../../src/utils/requirementVerification';

describe('canVerifyRequirement (volunteer-request CDO-routing rule)', () => {
  it('forbids Ward/Municipality from verifying a volunteer-submitted requirement', () => {
    expect(canVerifyRequirement('municipality_ward', 'volunteer')).toBe(false);
  });

  it('forbids Ward/Municipality from verifying a police-submitted requirement', () => {
    expect(canVerifyRequirement('municipality_ward', 'police')).toBe(false);
  });

  it('forbids Ward/Municipality from verifying an army-submitted requirement', () => {
    expect(canVerifyRequirement('municipality_ward', 'army')).toBe(false);
  });

  it('allows Ward/Municipality to verify a requirement it submitted itself administratively', () => {
    expect(canVerifyRequirement('municipality_ward', 'municipality_ward')).toBe(true);
  });

  it('allows Ward/Municipality to verify a requirement Central submitted administratively', () => {
    expect(canVerifyRequirement('municipality_ward', 'central')).toBe(true);
  });

  it('allows District/CDO to verify a volunteer-submitted requirement', () => {
    expect(canVerifyRequirement('district_cdo', 'volunteer')).toBe(true);
  });

  it('allows Central to verify a volunteer-submitted requirement', () => {
    expect(canVerifyRequirement('central', 'volunteer')).toBe(true);
  });
});
