import { randomUUID } from 'node:crypto'
import pg from 'pg'

/**
 * Real PostgreSQL for integration tests. PostgreSQL is never mocked here:
 * transaction atomicity, privilege revocation and DDL behaviour are precisely the
 * properties a fake would get wrong, and Contract Section 11 requires them tested
 * by forcing real failures.
 *
 * Two sources, in order:
 *   1. TEST_DATABASE_URL — an already-running PostgreSQL (CI service container,
 *      or a local instance).
 *   2. Testcontainers — starts a disposable PostgreSQL when Docker is available.
 *
 * Each test database is created fresh and dropped afterwards, so migrations are
 * always exercised against a genuinely empty database.
 */

export interface TestDatabase {
  readonly url: string
  readonly adminUrl: string
  close(): Promise<void>
}

interface StartedContainerLike {
  getConnectionUri(): string
  stop(): Promise<void>
}

async function startContainer(): Promise<StartedContainerLike> {
  const { PostgreSqlContainer } = await import('@testcontainers/postgresql')
  const container = await new PostgreSqlContainer('postgres:16-alpine').start()
  return {
    getConnectionUri: () => container.getConnectionUri(),
    stop: async () => {
      await container.stop()
    },
  }
}

function withDatabaseName(url: string, database: string): string {
  const parsed = new URL(url)
  parsed.pathname = `/${database}`
  return parsed.toString()
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const provided = process.env['TEST_DATABASE_URL']
  let baseUrl: string
  let stopContainer: (() => Promise<void>) | undefined

  if (provided !== undefined && provided.trim().length > 0) {
    baseUrl = provided
  } else {
    const container = await startContainer()
    baseUrl = container.getConnectionUri()
    stopContainer = () => container.stop()
  }

  const databaseName = `test_${randomUUID().replace(/-/g, '')}`
  const admin = new pg.Client({ connectionString: baseUrl })
  await admin.connect()
  await admin.query(`CREATE DATABASE ${databaseName}`)
  await admin.end()

  return {
    url: withDatabaseName(baseUrl, databaseName),
    adminUrl: baseUrl,
    async close(): Promise<void> {
      const cleanup = new pg.Client({ connectionString: baseUrl })
      await cleanup.connect()
      await cleanup.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [databaseName],
      )
      await cleanup.query(`DROP DATABASE IF EXISTS ${databaseName}`)
      await cleanup.end()
      if (stopContainer !== undefined) {
        await stopContainer()
      }
    },
  }
}
