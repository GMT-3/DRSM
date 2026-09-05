import { generateTempPassword } from '../../src/utils/randomPassword';

describe('generateTempPassword', () => {
  it('generates a password of the requested length', () => {
    expect(generateTempPassword(12)).toHaveLength(12);
    expect(generateTempPassword(20)).toHaveLength(20);
  });

  it('only uses unambiguous alphanumeric characters', () => {
    const pw = generateTempPassword(200);
    expect(pw).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/);
  });

  it('is not deterministic across calls', () => {
    const a = generateTempPassword();
    const b = generateTempPassword();
    expect(a).not.toBe(b);
  });
});
