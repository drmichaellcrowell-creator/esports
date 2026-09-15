import pg from 'pg'

export type { PoolClient, Pool } from 'pg'

export interface PoolOptions {
  readonly connectionString: string
  readonly max?: number
  readonly applicationName?: string
}

/**
 * Connection pool for a long-running Node process.
 *
 * Deliberately NOT serverless-shaped: the contract's Global Invariant 15 requires
 * a domain change, its AuditLogEvent and its OutboxEvent rows to commit in one
 * multi-statement transaction, and the Outbox worker needs to hold a transaction
 * open across `SELECT ... FOR UPDATE SKIP LOCKED` and its follow-up writes. No
 * statement timeout is imposed here for that reason; bound long work explicitly
 * at the call site instead of globally.
 */
export function createPool(options: PoolOptions): pg.Pool {
  return new pg.Pool({
    connectionString: options.connectionString,
    max: options.max ?? 10,
    application_name: options.applicationName ?? 'esports-api',
    keepAlive: true,
    // A session stuck idle inside a transaction holds locks indefinitely and
    // would stall the Outbox. Sessions idle *between* transactions are fine.
    idle_in_transaction_session_timeout: 60_000,
  })
}
