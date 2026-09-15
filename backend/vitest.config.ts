import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Integration tests share one PostgreSQL instance and create/drop their own
    // probe schemas. Running files sequentially keeps that isolation simple and
    // deterministic; this suite is small enough that parallelism buys nothing.
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
})
