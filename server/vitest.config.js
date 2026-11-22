// Vitest config: one in-memory MongoDB for the whole run, test files run one after another (they share it).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: './tests/globalSetup.js', // starts MongoDB once
    setupFiles: ['./tests/setup.js'], // env vars + DB connection for each test file
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 120000, // first run downloads the MongoDB binary
  },
});
