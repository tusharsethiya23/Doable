// Runs before each test file: sets test environment variables (before the app is imported),
// connects Mongoose to the shared in-memory DB, and wipes the DB after the file finishes.
import { inject, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';

Object.assign(process.env, {
  NODE_ENV: 'test',
  MONGO_URI: `${inject('mongoUri').replace(/\/$/, '')}/doable-test`,
  JWT_ACCESS_SECRET: 'test-access-secret-that-is-long-enough-123',
  JWT_REFRESH_SECRET: 'test-refresh-secret-that-is-long-enough-456',
  ANTHROPIC_API_KEY: 'test-key', // never used: Claude is mocked in the tests
  GOOGLE_CLIENT_ID: 'test-client-id',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
  TOKEN_ENCRYPTION_KEY: 'ab'.repeat(32),
  ENABLE_WEB_SEARCH: 'false',
  ADMIN_EMAILS: 'admin@test.com',
  USER_MONTHLY_BUDGET_USD: '5',
});

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
