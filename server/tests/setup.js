// Runs before each test file: sets test environment variables (before the app is imported),
// connects Mongoose to the shared in-memory DB, and wipes the DB after the file finishes.
import { inject, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';

Object.assign(process.env, {
  NODE_ENV: 'test',
  MONGO_URI: `${inject('mongoUri').replace(/\/$/, '')}/doable-test`,
  JWT_ACCESS_SECRET: 'test-access-secret-that-is-long-enough-123',
  JWT_REFRESH_SECRET: 'test-refresh-secret-that-is-long-enough-456',
  GEMINI_API_KEY: 'test-key', // never used: the AI call (streamReply) is mocked in the tests
  // Paid-style prices so the budget logic can be tested (the free tier defaults are 0)
  LLM_PRICE_INPUT: '4',
  LLM_PRICE_OUTPUT: '20',
  LLM_PRICE_CACHE_READ: '0.2',
  LLM_PRICE_CACHE_WRITE: '5',
  WEB_SEARCH_PRICE: '0.01',
  DAILY_MESSAGE_LIMIT: process.env.DAILY_MESSAGE_LIMIT || '1000', // high, except in limits.test.js
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
