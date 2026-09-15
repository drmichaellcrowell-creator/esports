import { loadEnv } from '../config/env.js'
import { createLogger } from '../observability/logger.js'
import { createPool } from '../db/pool.js'
import { runMigrations } from '../db/migrate.js'

/**
 * Apply committed SQL migrations.
 *
 * Uses DATABASE_URL by default. Schema changes that require provisioner-level
 * authority will move to that credential when Phase 0B introduces it.
 */
async function main(): Promise<void> {
  const env = loadEnv()
  const logger = createLogger(env)
  const pool = createPool({
    connectionString: env.DATABASE_URL,
    max: 1,
    applicationName: 'esports-migrate',
  })
  try {
    const applied = await runMigrations(pool, { log: (message) => logger.info(message) })
    logger.info({ count: applied.length }, applied.length === 0 ? 'no new migrations' : 'migrations applied')
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
