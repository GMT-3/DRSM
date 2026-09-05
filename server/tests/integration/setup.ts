import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test_access_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';
process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_TTL = '7d';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  // mongodb-memory-server downloads a real mongod binary from
  // fastdl.mongodb.org on first run and, when that download fails, logs a
  // multi-hundred-line stack trace via console.warn before throwing — in a
  // network-restricted environment (or one with no local mongod and no
  // internet access at all) that reads like the test SUITE is broken
  // rather than the environment. Suppress that internal warning and
  // replace the thrown error with one short, actionable line instead.
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    mongod = await MongoMemoryServer.create();
  } catch (err) {
    const message = err instanceof Error ? err.message.split('\n')[0] : String(err);
    throw new Error(
      `Skipping integration tests: could not start an in-memory MongoDB (${message}). ` +
        'This needs either outbound network access to download a mongod binary on first run, ' +
        'or MONGOMS_SYSTEM_BINARY pointing at an already-installed mongod. ' +
        'Run "npm run test:unit" for the DB-free test suite, or see README.md.',
    );
  } finally {
    console.warn = originalWarn;
  }
  await mongoose.connect(mongod.getUri());
}, 60000);

afterEach(async () => {
  if (!mongod) return;
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});
