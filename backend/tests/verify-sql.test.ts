import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import pg from 'pg'
import { createTestDatabase, type TestDatabase } from './helpers/postgres.js'
import { dropAppRoles, appRolesPresent } from './helpers/roles.js'

/**
 * The dashboard diagnostic must never abort.
 *
 * It is pasted into a SQL Editor against a project in an unknown state, so an
 * aborted query tells the operator nothing and blocks the bootstrap. These tests
 * drive it through every state the bootstrap passes through — including the one
 * that actually broke in production: 0000 applied, none of the four roles
 * created yet.
 *
 * Role cleanup is cluster-wide (see helpers/roles.ts). Without that these tests
 * would pass vacuously, because roles outlive the databases that created them.
 */
const VERIFY_SQL = fileURLToPath(new URL('../scripts/verify-substrate.sql', import.meta.url))
const MIG_0000 = fileURLToPath(new URL('../migrations/0000_infrastructure.sql', import.meta.url))
const MIG_0001 = fileURLToPath(new URL('../migrations/0001_database_roles.sql', import.meta.url))
const REGISTER = fileURLToPath(new URL('../scripts/register-manual-migration.sql', import.meta.url))

interface Row {
  status: string
  check_name: string
  detail: string
}

describe('verify-substrate.sql runs in every bootstrap state', () => {
  let database: TestDatabase

  const run = async (): Promise<Row[]> => {
    const sql = await readFile(VERIFY_SQL, 'utf8')
    const client = new pg.Client({ connectionString: database.url })
    await client.connect()
    try {
      const { rows } = await client.query<Row>(sql)
      return rows
    } finally {
      await client.end()
    }
  }

  const exec = async (file: string): Promise<void> => {
    const sql = await readFile(file, 'utf8')
    const client = new pg.Client({ connectionString: database.url })
    await client.connect()
    try {
      await client.query(sql)
    } finally {
      await client.end()
    }
  }

  const platformRoles = async (): Promise<void> => {
    const client = new pg.Client({ connectionString: database.url })
    await client.connect()
    try {
      for (const role of ['anon', 'authenticated', 'service_role', 'authenticator']) {
        await client.query(
          `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}')
             THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$;`,
        )
      }
      await client.query(`ALTER ROLE authenticator SET pgrst.db_schemas = 'public'`)
    } finally {
      await client.end()
    }
  }

  const statusOf = (rows: Row[], fragment: string): string | undefined =>
    rows.find((r) => r.check_name.includes(fragment))?.status

  beforeEach(async () => {
    database = await createTestDatabase()
    await dropAppRoles(database.adminUrl)
  })

  afterEach(async () => {
    await database?.close()
    await dropAppRoles(database.adminUrl).catch(() => undefined)
  })

  it('scenario 1: zero Phase 0B migrations applied', async () => {
    expect(await appRolesPresent(database.adminUrl)).toEqual([])

    const rows = await run()
    expect(rows.length).toBeGreaterThan(20)
    expect(statusOf(rows, 'app schema exists')).toBe('FAIL')
    expect(statusOf(rows, 'all four authorities exist')).toBe('FAIL')
    expect(rows.find((r) => r.check_name.includes('all four'))?.detail).toContain('0 of 4')
    expect(statusOf(rows, 'context:')).toBe('PASS')
    expect(statusOf(rows, 'ledger records')).toBe('FAIL')
  })

  it('scenario 2: only 0000 applied and NONE of the four roles exists', async () => {
    // The exact real-project state that aborted the query with 42704.
    await platformRoles()
    await exec(MIG_0000)
    expect(await appRolesPresent(database.adminUrl)).toEqual([])

    const rows = await run()

    expect(rows.length).toBeGreaterThan(20)
    expect(statusOf(rows, 'app schema exists')).toBe('PASS')
    expect(statusOf(rows, 'app schema owned by app_owner')).toBe('FAIL')
    expect(statusOf(rows, 'all four authorities exist')).toBe('FAIL')
    for (const role of ['app_owner', 'app_migrator', 'app_api', 'app_provisioner']) {
      expect(statusOf(rows, `role attributes: ${role}`)).toBe('FAIL')
      expect(rows.find((r) => r.check_name.includes(`attributes: ${role}`))?.detail).toContain(
        'does not exist',
      )
    }
    // The separation checks are the ones that used to raise.
    expect(statusOf(rows, 'app_api is NOT a member of app_provisioner')).toBe('FAIL')
    expect(statusOf(rows, 'membership: app_migrator')).toBe('FAIL')
    // Client-facing roles genuinely have no access, so these legitimately pass.
    expect(statusOf(rows, 'anon has no access')).toBe('PASS')
    expect(statusOf(rows, 'Data API does not expose app')).toBe('PASS')
    expect(statusOf(rows, 'no Layer 0 domain table')).toBe('PASS')
  })

  it.each([
    [['app_owner']],
    [['app_owner', 'app_api']],
    [['app_api', 'app_provisioner']],
    [['app_owner', 'app_migrator', 'app_api']],
  ])('scenario 3: only a subset of roles exists (%s)', async (subset) => {
    await platformRoles()
    await exec(MIG_0000)
    const client = new pg.Client({ connectionString: database.url })
    await client.connect()
    try {
      for (const role of subset) {
        await client.query(`CREATE ROLE ${role}`)
      }
    } finally {
      await client.end()
    }
    expect((await appRolesPresent(database.adminUrl)).sort()).toEqual([...subset].sort())

    const rows = await run()
    expect(rows.length).toBeGreaterThan(20)
    expect(statusOf(rows, 'all four authorities exist')).toBe('FAIL')
    expect(rows.find((r) => r.check_name.includes('all four'))?.detail).toContain(
      `${subset.length} of 4`,
    )
    for (const role of ['app_owner', 'app_migrator', 'app_api', 'app_provisioner']) {
      const detail = rows.find((r) => r.check_name.includes(`attributes: ${role}`))?.detail ?? ''
      expect(subset.includes(role) ? detail : 'does not exist').toBeTruthy()
    }
  })

  it('scenario 4: roles exist but the ledger does not', async () => {
    await platformRoles()
    await exec(MIG_0000)
    await exec(MIG_0001)
    expect((await appRolesPresent(database.adminUrl)).length).toBe(4)

    const rows = await run()
    expect(rows.length).toBeGreaterThan(20)
    expect(statusOf(rows, 'all four authorities exist')).toBe('PASS')
    expect(statusOf(rows, 'app schema owned by app_owner')).toBe('PASS')
    expect(statusOf(rows, 'ledger records')).toBe('FAIL')
    expect(rows.find((r) => r.check_name.includes('ledger records'))?.detail).toContain(
      'does not exist',
    )
    expect(statusOf(rows, 'ledger checksums')).toBe('FAIL')
  })

  it('scenario 5: complete Phase 0B state — every check passes', async () => {
    await platformRoles()
    await exec(MIG_0000)
    await exec(MIG_0001)
    await exec(REGISTER)

    const rows = await run()
    const failures = rows.filter((r) => r.status !== 'PASS')
    expect(failures.map((f) => `${f.check_name}: ${f.detail}`)).toEqual([])
    expect(rows.length).toBeGreaterThan(20)
  })

  it('never returns a credential-shaped value in any state', async () => {
    await platformRoles()
    await exec(MIG_0000)
    const rows = await run()
    const serialized = JSON.stringify(rows)
    for (const pattern of [
      /postgres(ql)?:\/\/[^\s"]*:[^\s"@]+@/,
      /eyJ[A-Za-z0-9_-]{20,}\./,
      /SCRAM-SHA-256\$/,
      /md5[0-9a-f]{32}/,
    ]) {
      expect(serialized).not.toMatch(pattern)
    }
  })

  it('reads no credential catalog', async () => {
    const sql = await readFile(VERIFY_SQL, 'utf8')
    const executable = sql.replace(/--.*$/gm, '')
    expect(executable).not.toMatch(/pg_authid/)
    expect(executable).not.toMatch(/rolpassword/)
    expect(executable).not.toMatch(/pg_shadow/)
  })
})
