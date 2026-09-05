import { hashPassword, comparePassword } from '../../src/utils/password';

describe('password hashing', () => {
  it('hashes a password and verifies the correct plaintext against it', async () => {
    const hash = await hashPassword('Passw0rd!123');
    expect(hash).not.toBe('Passw0rd!123');
    await expect(comparePassword('Passw0rd!123', hash)).resolves.toBe(true);
  });

  it('rejects an incorrect plaintext against a stored hash', async () => {
    const hash = await hashPassword('Passw0rd!123');
    await expect(comparePassword('wrong-password', hash)).resolves.toBe(false);
  });
});
