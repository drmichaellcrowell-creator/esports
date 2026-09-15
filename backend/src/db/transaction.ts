import { AsyncLocalStorage } from 'node:async_hooks'
import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg'

/**
 * Transaction boundary.
 *
 * Contract Global Invariant 15 requires that a domain change, its AuditLogEvent
 * and its OutboxEvent rows commit or fail together, and Section 10 prohibition 12
 * requires the whole transaction to roll back if the audit or outbox write fails.
 * The single way that guarantee breaks in practice is code that *believes* it is
 * inside a transaction while actually holding a second, independent connection —
 * silently splitting one atomic unit into two.
 *
 * This module makes that specific mistake impossible rather than merely
 * discouraged:
 *
 *  - `withTransaction` nested inside another `withTransaction` JOINS the existing
 *    transaction and reuses its connection. It never opens a second connection
 *    and never issues a second BEGIN/COMMIT.
 *  - `withConnection` (non-transactional access) THROWS when called inside an
 *    active transaction, because that is precisely the split this invariant
 *    forbids.
 */

export interface TransactionHandle {
  /** The single connection this transaction owns. */
  readonly client: PoolClient
  /** Depth of joined `withTransaction` calls. 1 is the outermost. */
  readonly depth: number
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<R>>
}

export class NonTransactionalAccessError extends Error {
  constructor() {
    super(
      'Refusing to open a separate database connection inside an active transaction. ' +
        'Doing so would split one atomic unit of work across two connections and could ' +
        'commit a domain change without its AuditLog/Outbox rows (Global Invariant 15). ' +
        'Use the TransactionHandle already in scope.',
    )
    this.name = 'NonTransactionalAccessError'
  }
}

export class TransactionRequiredError extends Error {
  constructor(operation: string) {
    super(`"${operation}" must run inside a transaction, but none is active.`)
    this.name = 'TransactionRequiredError'
  }
}

const transactionStorage = new AsyncLocalStorage<TransactionHandle>()

/** The transaction active on this async context, if any. */
export function currentTransaction(): TransactionHandle | undefined {
  return transactionStorage.getStore()
}

/** Guard for code that is only correct inside a transaction. */
export function assertInTransaction(operation: string): TransactionHandle {
  const handle = transactionStorage.getStore()
  if (handle === undefined) {
    throw new TransactionRequiredError(operation)
  }
  return handle
}

function createHandle(client: PoolClient, depth: number): TransactionHandle {
  return Object.freeze({
    client,
    depth,
    query<R extends QueryResultRow = QueryResultRow>(
      text: string,
      values?: readonly unknown[],
    ): Promise<QueryResult<R>> {
      return client.query<R>(text, values as unknown[] | undefined)
    },
  })
}

/**
 * Run `fn` inside a single PostgreSQL transaction, committing on success and
 * rolling back on any thrown error. Nested calls join the existing transaction.
 */
export async function withTransaction<T>(
  pool: Pool,
  fn: (tx: TransactionHandle) => Promise<T>,
): Promise<T> {
  const existing = transactionStorage.getStore()
  if (existing !== undefined) {
    // Join. One BEGIN, one COMMIT, one connection — the inner unit of work
    // cannot commit or roll back independently of the outer one.
    const joined = createHandle(existing.client, existing.depth + 1)
    return transactionStorage.run(joined, () => fn(joined))
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const handle = createHandle(client, 1)
    let result: T
    try {
      result = await transactionStorage.run(handle, () => fn(handle))
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    }
    await client.query('COMMIT')
    return result
  } finally {
    client.release()
  }
}

/**
 * Non-transactional access, for reads and setup that genuinely stand alone.
 * Throws inside an active transaction — see `NonTransactionalAccessError`.
 */
export async function withConnection<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (transactionStorage.getStore() !== undefined) {
    throw new NonTransactionalAccessError()
  }
  const client = await pool.connect()
  try {
    return await fn(client)
  } finally {
    client.release()
  }
}
