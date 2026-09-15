import { loadEnv } from '../config/env.js'
import { createLogger } from '../observability/logger.js'
import { createPool } from '../db/pool.js'
import { withConnection } from '../db/transaction.js'
import { buildApi } from '../api/app.js'

/** API process entrypoint. Fails closed on invalid configuration. */
async function main(): Promise<void> {
  const env = loadEnv()
  const logger = createLogger(env)
  const pool = createPool({ connectionString: env.DATABASE_URL, applicationName: 'esports-api' })

  const app = await buildApi({
    logger,
    checkDatabase: async () => {
      try {
        await withConnection(pool, (client) => client.query('SELECT 1'))
        return true
      } catch (error) {
        logger.error({ err: error }, 'readiness database check failed')
        return false
      }
    },
  })

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'api shutting down')
    await app.close()
    await pool.end()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  await app.listen({ host: env.API_HOST, port: env.API_PORT })
  logger.info({ host: env.API_HOST, port: env.API_PORT }, 'api listening')
}

main().catch((error: unknown) => {
  // Configuration and startup failures must be loud and fatal, never degraded.
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
