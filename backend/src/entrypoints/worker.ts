import { loadEnv } from '../config/env.js'
import { createLogger } from '../observability/logger.js'
import { createPool } from '../db/pool.js'
import { createWorker } from '../worker/runtime.js'

/** Worker process entrypoint — separate process, same image as the API. */
async function main(): Promise<void> {
  const env = loadEnv()
  const logger = createLogger(env)
  const pool = createPool({
    connectionString: env.DATABASE_URL,
    max: 4,
    applicationName: 'esports-worker',
  })

  const worker = createWorker({
    logger,
    heartbeatIntervalMs: env.WORKER_HEARTBEAT_INTERVAL_MS,
    // This is a long-running process: it must outlive start() and wait for work.
    keepProcessAlive: true,
    shutdown: async () => {
      await pool.end()
    },
  })

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'worker received shutdown signal')
    await worker.stop()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  await worker.start()
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
