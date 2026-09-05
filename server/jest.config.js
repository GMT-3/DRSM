/** @type {import('jest').Config} */
// Two projects, deliberately separated:
//  - "unit": pure logic (JWT, password hashing, scope-filter derivation,
//    a DB-less health check). No external dependency — always runnable.
//  - "integration": full HTTP + Mongoose flows via supertest against an
//    in-memory MongoDB (mongodb-memory-server). This downloads a real
//    mongod binary on first run, which requires outbound network access
//    to fastdl.mongodb.org — set MONGOMS_SYSTEM_BINARY to a local mongod
//    path (or point MONGODB_URI-style setup at one) if that download is
//    blocked in your environment (e.g. `npm run test:unit` still works).
module.exports = {
  testTimeout: 60000,
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/unit/**/*.test.ts'],
    },
    {
      displayName: 'integration',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/tests/integration/setup.ts'],
    },
  ],
};
