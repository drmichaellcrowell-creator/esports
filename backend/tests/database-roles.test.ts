import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import type { Pool } from 'pg'
import { createPool } from '../src/db/pool.js'
import { runMigrations } from '../src/db/migrate.js'
import { withConnection } from '../src/db/transaction.js'
import {
  verifyDataApiExposure,
  verifyNoLayerZeroTables,
  verifyRoles,
  verifySchema,
  verifySchemaPrivileges,
  verifyTransactionSemantics,
  type CheckResult,
} from '../src/db/verify.js'
import { createTestDatabase, type TestDatabase } from './helpers/postgres.js'

/**
 * Phase 0B security substrate, against real PostgreSQL.
 *
 * The platform's client-facing roles are created before migrating so the
 * revocation paths are genuinely exercised rather than skipped, and the
 * PostgREST schema setting is simulated the way the platform stores it.
 *
 * No cloud credential is involved: everything here runs against a disposable
 * database, exactly as it does in CI.
 */

const PLATFORM_ROLES = ['anon', 'authenticated', 'service_role', 'authenticator'] as const

async function simulatePlatformRoles(pool: Pool, exposedSchemas = 'public'): Promise<void> {
  await withConnection(pool, async (client) => {
    for (const role of PLATFORM_ROLES) {
      await client.query(
        `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}')
           THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$;`,
      )
    }
    await client.query(`ALTER ROLE authenticator SET pgrst.db_schemas = '${exposedSchemas}'`)
  })
}

const failuresIn = (results: readonly CheckResult[]): string[] =>
  results.filter((r) => !r.passed).map((r) => `${r.name}: ${r.detail}`)

describe('database roles and Option B lockdown', () => {
  let database: TestDatabase
  let pool: Pool
  let rolesWithPasswordAfterMigration: string[]

  beforeAll(async () => {
    database = await createTestDatabase()
    pool = createPool({ connectionString: database.url, max: 6 })
    await simulatePlatformRoles(pool)
    await runMigrations(pool)

    // Captured here, immediately after migrating, because PostgreSQL roles are
    // CLUSTER-scoped while test databases are not: a role created by one test
    // database outlives it and is shared with every other. Asserting later
    // would measure accumulated cluster state rather than what the migration
    // actually did.
    rolesWithPasswordAfterMigration = await withConnection(pool, async (client) => {
      const { rows } = await client.query<{ rolname: string }>(
        `SELECT rolname FROM pg_authid WHERE rolname LIKE 'app\\_%' AND rolpassword IS NOT NULL`,
      )
      return rows.map((r) => r.rolname)
    })
  })

  afterAll(async () => {
    await pool?.end()
    await database?.close()
  })

  describe('the four authorities exist and are separate', () => {
    it('passes every role check', async () => {
      expect(failuresIn(await verifyRoles(pool))).toEqual([])
    })

    it('app_api and app_provisioner are distinct roles', async () => {
      const distinct = await withConnection(pool, async (client) => {
        const { rows } = await client.query<{ n: string }>(
          `SELECT count(DISTINCT oid)::text AS n FROM pg_roles WHERE rolname IN ('app_api','app_provisioner')`,
        )
        return Number(rows[0]!.n)
      })
      expect(distinct).toBe(2)
    })

    it.each(['app_api', 'app_provisioner', 'app_migrator', 'app_owner'])(
      '%s holds no elevated attribute',
      async (role) => {
        const attrs = await withConnection(pool, async (client) => {
          const { rows } = await client.query<Record<string, boolean>>(
            `SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolreplication
               FROM pg_roles WHERE rolname = $1`,
            [role],
          )
          return rows[0]!
        })
        expect(Object.values(attrs).every((v) => v === false)).toBe(true)
      },
    )

    it.each(['app_api', 'app_provisioner'])('%s has NOINHERIT', async (role) => {
      const inherit = await withConnection(pool, async (client) => {
        const { rows } = await client.query<{ rolinherit: boolean }>(
          `SELECT rolinherit FROM pg_roles WHERE rolname = $1`,
          [role],
        )
        return rows[0]!.rolinherit
      })
      expect(inherit).toBe(false)
    })

    it('no app_* role carries a password from the migration', () => {
      // Credentials are issued out of band; a LOGIN role without a password
      // cannot authenticate, so the roles fail closed until an operator acts.
      expect(rolesWithPasswordAfterMigration).toEqual([])
    })

    it('the migration SQL contains no password literal', async () => {
      const { readFile } = await import('node:fs/promises')
      const { fileURLToPath } = await import('node:url')
      const sql = await readFile(
        fileURLToPath(new URL('../migrations/0001_database_roles.sql', import.meta.url)),
        'utf8',
      )
      expect(sql).not.toMatch(/PASSWORD\s+'/i)
      expect(sql).not.toMatch(/ENCRYPTED\s+PASSWORD/i)
    })
  })

  describe('schema privileges', () => {
    it('passes every schema check', async () => {
      expect(failuresIn(await verifySchema(pool))).toEqual([])
    })

    it('passes every privilege check', async () => {
      expect(failuresIn(await verifySchemaPrivileges(pool))).toEqual([])
    })

    it.each(PLATFORM_ROLES)('%s cannot use the app schema', async (role) => {
      const privileges = await withConnection(pool, async (client) => {
        const { rows } = await client.query<{ usage: boolean; create: boolean }>(
          `SELECT has_schema_privilege($1,'app','USAGE') AS usage,
                  has_schema_privilege($1,'app','CREATE') AS create`,
          [role],
        )
        return rows[0]!
      })
      expect(privileges).toEqual({ usage: false, create: false })
    })

    it('grants no default privilege to any runtime or client-facing role', async () => {
      // Absence is the mechanism: a future table confers nothing until a
      // migration grants it explicitly (Amendment 001 I12).
      const entries = await withConnection(pool, async (client) => {
        const { rows } = await client.query<{ acl: string }>(
          `SELECT unnest(d.defaclacl)::text AS acl
             FROM pg_default_acl d JOIN pg_namespace n ON n.oid = d.defaclnamespace
            WHERE n.nspname = 'app'`,
        )
        return rows.map((r) => r.acl)
      })
      for (const grantee of [...PLATFORM_ROLES, 'app_api', 'app_provisioner']) {
        expect(entries.filter((acl) => acl.startsWith(`${grantee}=`))).toEqual([])
      }
    })
  })

  describe('migration behaviour', () => {
    it('is idempotent under the migration runner', async () => {
      expect(await runMigrations(pool)).toEqual([])
    })

    it('still passes every check after re-running', async () => {
      await runMigrations(pool)
      expect(failuresIn(await verifyRoles(pool))).toEqual([])
      expect(failuresIn(await verifySchemaPrivileges(pool))).toEqual([])
    })

    it('creates no Layer 0 domain table', async () => {
      expect(failuresIn(await verifyNoLayerZeroTables(pool))).toEqual([])
    })

    it('creates no table at all', async () => {
      const tables = await withConnection(pool, async (client) => {
        const { rows } = await client.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM pg_tables WHERE schemaname = 'app'`,
        )
        return Number(rows[0]!.n)
      })
      expect(tables).toBe(0)
    })
  })

  describe('transaction semantics', () => {
    it('commits, rolls back, and supports FOR UPDATE SKIP LOCKED', async () => {
      expect(failuresIn(await verifyTransactionSemantics(pool))).toEqual([])
    })
  })

  describe('Data API exposure', () => {
    it('reports app as unexposed when the setting lists only public', async () => {
      expect(failuresIn(await verifyDataApiExposure(pool))).toEqual([])
    })

    it('FAILS when app is exposed to the Data API', async () => {
      await withConnection(pool, (client) =>
        client.query(`ALTER ROLE authenticator SET pgrst.db_schemas = 'public, app'`),
      )
      const results = await verifyDataApiExposure(pool)
      expect(results[0]!.passed).toBe(false)
      expect(results[0]!.detail).toContain('app')
      await withConnection(pool, (client) =>
        client.query(`ALTER ROLE authenticator SET pgrst.db_schemas = 'public'`),
      )
      expect(failuresIn(await verifyDataApiExposure(pool))).toEqual([])
    })
  })
})

describe('the API identity cannot reach provisioner or migration authority', () => {
  let database: TestDatabase
  let pool: Pool
  let apiClientUrl: string

  beforeAll(async () => {
    database = await createTestDatabase()
    pool = createPool({ connectionString: database.url, max: 4 })
    await simulatePlatformRoles(pool)
    await runMigrations(pool)

    // A throwaway password, generated here and never committed, so we can
    // actually connect as app_api and attempt escalation for real.
    const password = `probe_${randomBytes(12).toString('hex')}`
    await withConnection(pool, (client) =>
      client.query(`ALTER ROLE app_api PASSWORD '${password}'`),
    )
    const url = new URL(database.url)
    url.username = 'app_api'
    url.password = password
    apiClientUrl = url.toString()
  })

  afterAll(async () => {
    // Roles are cluster-scoped, so the throwaway credential must be withdrawn
    // or it leaks into every later test database on this server.
    await withConnection(pool, (client) =>
      client.query('ALTER ROLE app_api PASSWORD NULL'),
    ).catch(() => undefined)
    await pool?.end()
    await database?.close()
  })

  const asApi = async <T>(fn: (client: pg.Client) => Promise<T>): Promise<T> => {
    const client = new pg.Client({ connectionString: apiClientUrl })
    await client.connect()
    try {
      return await fn(client)
    } finally {
      await client.end()
    }
  }

  it('can connect', async () => {
    const who = await asApi(async (client) => {
      const { rows } = await client.query<{ user: string }>('SELECT current_user AS user')
      return rows[0]!.user
    })
    expect(who).toBe('app_api')
  })

  it.each([
    ['SET ROLE app_provisioner', 'SET ROLE app_provisioner'],
    ['SET ROLE app_owner', 'SET ROLE app_owner'],
    ['SET ROLE app_migrator', 'SET ROLE app_migrator'],
    ['create a table in app', 'CREATE TABLE app.should_not_exist (id int)'],
    ['create a schema', 'CREATE SCHEMA should_not_exist'],
    ['create a role', 'CREATE ROLE should_not_exist LOGIN'],
    ['make itself superuser', 'ALTER ROLE app_api SUPERUSER'],
    ['read password hashes', 'SELECT rolpassword FROM pg_authid'],
  ])('is denied: %s', async (_label, statement) => {
    await expect(asApi((client) => client.query(statement))).rejects.toThrow()
  })

  it('cannot grant itself privileges', async () => {
    // PostgreSQL's GRANT does not raise when the grantor lacks authority: it
    // emits a warning and grants nothing. The security property is therefore
    // that the attempt has no effect, not that it errors.
    await asApi((client) => client.query('GRANT CREATE ON SCHEMA app TO app_api'))

    const privileges = await withConnection(pool, async (client) => {
      const { rows } = await client.query<{ usage: boolean; create: boolean }>(
        `SELECT has_schema_privilege('app_api','app','USAGE')  AS usage,
                has_schema_privilege('app_api','app','CREATE') AS create`,
      )
      return rows[0]!
    })
    expect(privileges).toEqual({ usage: true, create: false })
  })

  it('still cannot create a table after attempting to grant itself CREATE', async () => {
    await expect(
      asApi((client) => client.query('CREATE TABLE app.should_not_exist (id int)')),
    ).rejects.toThrow()
  })

  it('cannot apply migrations', async () => {
    const apiPool = createPool({ connectionString: apiClientUrl, max: 1 })
    try {
      // Insufficient authority must fail loudly rather than partially apply.
      await expect(runMigrations(apiPool)).rejects.toThrow()
    } finally {
      await apiPool.end()
    }
  })
})
