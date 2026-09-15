import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Pool } from 'pg'
import { createPool } from '../src/db/pool.js'
import {
  withTransaction,
  withConnection,
  currentTransaction,
  assertInTransaction,
  NonTransactionalAccessError,
  TransactionRequiredError,
} from '../src/db/transaction.js'
import { createTestDatabase, type TestDatabase } from './helpers/postgres.js'

/**
 * These tests run against real PostgreSQL. A mock cannot demonstrate that a
 * forced mid-transaction failure leaves no partial state, which is exactly what
 * Contract Section 11 requires to be proven.
 *
 * `probe.record` is generic test scaffolding, not a Layer 0 entity. No domain
 * table is created to make these tests pass.
 */
describe('transaction boundary', () => {
  let database: TestDatabase
  let pool: Pool

  const countRecords = async (): Promise<number> => {
    const rows = await withConnection(pool, (client) =>
      client.query<{ count: string }>('SELECT count(*)::text AS count FROM probe.record'),
    )
    return Number(rows.rows[0]!.count)
  }

  beforeAll(async () => {
    database = await createTestDatabase()
    pool = createPool({ connectionString: database.url, max: 5 })
    await withConnection(pool, async (client) => {
      await client.query('CREATE SCHEMA probe')
      await client.query('CREATE TABLE probe.record (id serial PRIMARY KEY, note text NOT NULL)')
    })
  })

  afterAll(async () => {
    await pool?.end()
    await database?.close()
  })

  beforeEach(async () => {
    await withConnection(pool, (client) => client.query('TRUNCATE probe.record'))
  })

  describe('commits every statement together', () => {
    it('persists all writes made inside one transaction', async () => {
      await withTransaction(pool, async (tx) => {
        await tx.query('INSERT INTO probe.record (note) VALUES ($1)', ['first'])
        await tx.query('INSERT INTO probe.record (note) VALUES ($1)', ['second'])
        await tx.query('INSERT INTO probe.record (note) VALUES ($1)', ['third'])
      })
      expect(await countRecords()).toBe(3)
    })

    it('returns the callback result', async () => {
      const result = await withTransaction(pool, async (tx) => {
        const { rows } = await tx.query<{ id: number }>(
          'INSERT INTO probe.record (note) VALUES ($1) RETURNING id',
          ['x'],
        )
        return rows[0]!.id
      })
      expect(result).toBeGreaterThan(0)
    })

    it('writes are invisible to other connections until commit', async () => {
      let observedDuringTransaction = -1
      await withTransaction(pool, async (tx) => {
        await tx.query('INSERT INTO probe.record (note) VALUES ($1)', ['uncommitted'])
        // A genuinely separate connection, taken from the pool directly.
        const client = await pool.connect()
        try {
          const { rows } = await client.query<{ count: string }>(
            'SELECT count(*)::text AS count FROM probe.record',
          )
          observedDuringTransaction = Number(rows[0]!.count)
        } finally {
          client.release()
        }
      })
      expect(observedDuringTransaction).toBe(0)
      expect(await countRecords()).toBe(1)
    })
  })

  describe('a forced failure rolls everything back', () => {
    it('discards all writes when the callback throws', async () => {
      await expect(
        withTransaction(pool, async (tx) => {
          await tx.query('INSERT INTO probe.record (note) VALUES ($1)', ['one'])
          await tx.query('INSERT INTO probe.record (note) VALUES ($1)', ['two'])
          throw new Error('forced failure after two successful writes')
        }),
      ).rejects.toThrow('forced failure after two successful writes')
      expect(await countRecords()).toBe(0)
    })

    it('discards all writes when a later statement fails at the database', async () => {
      await expect(
        withTransaction(pool, async (tx) => {
          await tx.query('INSERT INTO probe.record (note) VALUES ($1)', ['valid'])
          // NOT NULL violation — the failure comes from PostgreSQL, not the test.
          await tx.query('INSERT INTO probe.record (note) VALUES (NULL)')
        }),
      ).rejects.toThrow()
      expect(await countRecords()).toBe(0)
    })

    it.each([0, 1, 2])('rolls back when failure is injected at sub-step %i', async (failAt) => {
      await expect(
        withTransaction(pool, async (tx) => {
          for (let step = 0; step < 3; step += 1) {
            if (step === failAt) {
              throw new Error(`injected failure at step ${step}`)
            }
            await tx.query('INSERT INTO probe.record (note) VALUES ($1)', [`step-${step}`])
          }
        }),
      ).rejects.toThrow(`injected failure at step ${failAt}`)
      expect(await countRecords()).toBe(0)
    })

    it('releases the connection back to the pool after a rollback', async () => {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        await withTransaction(pool, async (tx) => {
          await tx.query('INSERT INTO probe.record (note) VALUES ($1)', ['leak-check'])
          throw new Error('rollback')
        }).catch(() => undefined)
      }
      // A leak would have exhausted the pool (max 5) long before now.
      expect(await countRecords()).toBe(0)
    })
  })

  describe('nested and incorrect usage cannot silently split atomic work', () => {
    it('a nested transaction joins rather than opening a second connection', async () => {
      await withTransaction(pool, async (outer) => {
        await withTransaction(pool, async (inner) => {
          expect(inner.client).toBe(outer.client)
          expect(inner.depth).toBe(2)
        })
      })
    })

    it('an inner unit of work cannot commit when the outer one fails', async () => {
      await expect(
        withTransaction(pool, async (outer) => {
          await outer.query('INSERT INTO probe.record (note) VALUES ($1)', ['outer'])
          // A nested call that "succeeds" from its own point of view.
          await withTransaction(pool, async (inner) => {
            await inner.query('INSERT INTO probe.record (note) VALUES ($1)', ['inner'])
          })
          throw new Error('outer fails after the inner unit completed')
        }),
      ).rejects.toThrow('outer fails after the inner unit completed')

      // This is the guarantee: the inner write did NOT survive independently.
      expect(await countRecords()).toBe(0)
    })

    it('refuses non-transactional access from inside a transaction', async () => {
      await expect(
        withTransaction(pool, async (tx) => {
          await tx.query('INSERT INTO probe.record (note) VALUES ($1)', ['a'])
          await withConnection(pool, (client) => client.query('SELECT 1'))
        }),
      ).rejects.toThrow(NonTransactionalAccessError)
      expect(await countRecords()).toBe(0)
    })

    it('exposes the active transaction to nested code', async () => {
      expect(currentTransaction()).toBeUndefined()
      await withTransaction(pool, async (tx) => {
        expect(currentTransaction()?.client).toBe(tx.client)
        expect(assertInTransaction('probe').client).toBe(tx.client)
      })
      expect(currentTransaction()).toBeUndefined()
    })

    it('assertInTransaction throws outside a transaction', () => {
      expect(() => assertInTransaction('audit.write')).toThrow(TransactionRequiredError)
    })

    it('clears transaction context after a rollback', async () => {
      await withTransaction(pool, async () => {
        throw new Error('boom')
      }).catch(() => undefined)
      expect(currentTransaction()).toBeUndefined()
    })
  })

  describe('real database connectivity', () => {
    it('connects and round-trips a query', async () => {
      const value = await withConnection(pool, async (client) => {
        const { rows } = await client.query<{ answer: number }>('SELECT 1 + 1 AS answer')
        return rows[0]!.answer
      })
      expect(value).toBe(2)
    })

    it('reports a real PostgreSQL server version', async () => {
      const version = await withConnection(pool, async (client) => {
        const { rows } = await client.query<{ version: string }>('SELECT version()')
        return rows[0]!.version
      })
      expect(version).toMatch(/PostgreSQL/)
    })
  })
})
