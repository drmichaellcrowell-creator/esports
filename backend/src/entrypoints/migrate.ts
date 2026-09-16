import { loadEnv } from '../config/env.js'
import { databaseRoleFromUrl } from '../config/database-identity.js'
import { createLogger } from '../observability/logger.js'
import { createPool } from '../db/pool.js'
import { runMigrations } from '../db/migrate.js'

/**
 * Apply committed SQL migrations.
 *
 * Prefers MIGRATION_DATABASE_URL. Migration 0001 creates database roles and so
 * needs the project bootstrap credential; `app_api` cannot and must not apply
 * it. Falling back to DATABASE_URL is allowed for local convenience but is
 * reported, because running migrations as the runtime identity is not the
 * intended posture.
 */
async function main(): Promise<void> {
  const env = loadEnv()
  const logger = createLogger(env)
  const connectionString = env.MIGRATION_DATABASE_URL ?? env.DATABASE_URL
  if (env.MIGRATION_DATABASE_URL === undefined) {
    logger.warn(
      'MIGRATION_DATABASE_URL is not set — falling back to DATABASE_URL. Migrations that ' +
        'create roles or objects need the migration authority, not the API runtime identity.',
    )
  }
  logger.info(
    { role: databaseRoleFromUrl(connectionString) ?? 'unknown' },
    'applying migrations as database role',
  )
  const pool = createPool({
    connectionString,
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
