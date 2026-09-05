import { User } from '../../src/models/User';
import { hashPassword } from '../../src/utils/password';
import { Role } from '../../src/types/roles';

interface TestUserOverrides {
  name?: string;
  email: string;
  role: Role;
  loginType?: string;
  scope?: Record<string, unknown>;
  active?: boolean;
  category?: string | null;
}

export async function createTestUser(overrides: TestUserOverrides) {
  const passwordHash = await hashPassword(TEST_PASSWORD);
  return User.create({
    name: overrides.name ?? 'Test User',
    email: overrides.email,
    role: overrides.role,
    loginType: overrides.loginType ?? 'own_email',
    passwordHash,
    scope: overrides.scope ?? {},
    active: overrides.active ?? true,
    category: overrides.category ?? null,
  });
}

export const TEST_PASSWORD = 'Passw0rd!123';
