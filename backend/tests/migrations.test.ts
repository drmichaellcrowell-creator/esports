import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Pool } from 'pg'
import { createPool } from '../src/db/pool.js'
import { runMigrations, listMigrationFiles, MigrationChecksumMismatchError } from '../src/db/migrate.js'
import { withConnection } from '../src/db/transaction.js'
import { createTestDatabase, type TestDatabase } from './helpers/postgres.js'

describe('migrations apply to a fresh PostgreSQL database', () => {
  let database: TestDatabase
  let pool: Pool

  beforeAll(async () => {
    database = await createTestDatabase()
    pool = createPool({ connectionString: database.url, max: 4 })

    // Simulate Supabase: the client-facing roles exist before migration, so the
    // migration's revocation path is genuinely exercised rather than skipped.
    await withConnection(pool, async (client) => {
      for (const role of ['anon', 'authenticated']) {
        await client.query(
          `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}')
             THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$;`,
        )
      }
    })
  })

  afterAll(async () => {
    await pool?.end()
    await database?.close()
  })

  it('has at least one committed SQL migration', async () => {
    const files = await listMigrationFiles()
    expect(files.length).toBeGreaterThan(0)
    expect(files[0]).toMatch(/^0000_.*\.sql$/)
  })

  it('applies cleanly to an empty database', async () => {
    const applied = await runMigrations(pool)
    expect(applied.length).toBeGreaterThan(0)
    expect(applied.map((m) => m.name)).toContain('0000_infrastructure.sql')
  })

  it('is idempotent — re-running applies nothing further', async () => {
    const applied = await runMigrations(pool)
    expect(applied).toEqual([])
  })

  it('creates the dedicated app schema', async () => {
    const exists = await withConnection(pool, async (client) => {
      const { rows } = await client.query<{ nspname: string }>(
        `SELECT nspname FROM pg_namespace WHERE nspname = 'app'`,
      )
      return rows.length === 1
    })
    expect(exists).toBe(true)
  })

  it('places no application table in the public schema', async () => {
    const publicTables = await withConnection(pool, async (client) => {
      const { rows } = await client.query<{ tablename: string }>(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
      )
      return rows.map((r) => r.tablename)
    })
    expect(publicTables).toEqual([])
  })

  it('records applied migrations with a checksum', async () => {
    const rows = await withConnection(pool, async (client) => {
      const result = await client.query<{ name: string; checksum: string }>(
        'SELECT name, checksum FROM migrations.applied_migration ORDER BY name',
      )
      return result.rows
    })
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0]!.checksum).toMatch(/^[0-9a-f]{64}$/)
  })

  it('refuses to proceed if an applied migration is edited after the fact', async () => {
    await withConnection(pool, (client) =>
      client.query(
        `UPDATE migrations.applied_migration SET checksum = repeat('0', 64) WHERE name = $1`,
        ['0000_infrastructure.sql'],
      ),
    )
    await expect(runMigrations(pool)).rejects.toThrow(MigrationChecksumMismatchError)

    // Restore so later assertions in this file see a consistent ledger.
    await withConnection(pool, (client) =>
      client.query(`DELETE FROM migrations.applied_migration WHERE name = $1`, [
        '0000_infrastructure.sql',
      ]),
    )
    await runMigrations(pool)
  })
})

describe('client-facing database roles hold no privilege on app', () => {
  let database: TestDatabase
  let pool: Pool

  beforeAll(async () => {
    database = await createTestDatabase()
    pool = createPool({ connectionString: database.url, max: 4 })
    await withConnection(pool, async (client) => {
      for (const role of ['anon', 'authenticated']) {
        await client.query(
          `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}')
             THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$;`,
        )
      }
    })
    await runMigrations(pool)
  })

  afterAll(async () => {
    await pool?.end()
    await database?.close()
  })

  it.each(['anon', 'authenticated'])('%s has no USAGE or CREATE on schema app', async (role) => {
    const privileges = await withConnection(pool, async (client) => {
      const { rows } = await client.query<{ usage: boolean; create: boolean }>(
        `SELECT has_schema_privilege($1, 'app', 'USAGE')  AS usage,
                has_schema_privilege($1, 'app', 'CREATE') AS create`,
        [role],
      )
      return rows[0]!
    })
    expect(privileges.usage).toBe(false)
    expect(privileges.create).toBe(false)
  })

  it.each(['anon', 'authenticated'])('%s holds no default privileges in app', async (role) => {
    const grants = await withConnection(pool, async (client) => {
      const { rows } = await client.query<{ acl: string }>(
        `SELECT unnest(defaclacl)::text AS acl
           FROM pg_default_acl d
           JOIN pg_namespace n ON n.oid = d.defaclnamespace
          WHERE n.nspname = 'app'`,
      )
      return rows.map((r) => r.acl)
    })
    expect(grants.filter((acl) => acl.startsWith(`${role}=`))).toEqual([])
  })

  it('PUBLIC has no USAGE on schema app', async () => {
    const acl = await withConnection(pool, async (client) => {
      const { rows } = await client.query<{ nspacl: string | null }>(
        `SELECT nspacl::text FROM pg_namespace WHERE nspname = 'app'`,
      )
      return rows[0]!.nspacl ?? ''
    })
    // An entry with an empty grantee is PUBLIC. It must not appear with USAGE.
    expect(acl).not.toMatch(/(^|,)\{?=U/)
  })
})
