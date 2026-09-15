import type { Pool } from 'pg'
import { withConnection, withTransaction } from './transaction.js'
import { DATABASE_ROLES } from '../config/database-identity.js'

/**
 * Substrate verification.
 *
 * The same checks run against a disposable PostgreSQL in CI and against the real
 * project, so "it passed in CI" and "it passed against Supabase" mean the same
 * thing. Every check is a query — none of them prints or returns a credential.
 *
 * These checks create no Layer 0 table. The transaction and row-lock probes use
 * a temporary schema that is dropped before the function returns.
 */

export interface CheckResult {
  readonly name: string
  readonly passed: boolean
  readonly detail: string
}

/** Client-facing platform roles that must hold nothing on `app` under Option B. */
export const CLIENT_FACING_ROLES = [
  'anon',
  'authenticated',
  'service_role',
  'authenticator',
] as const

const ok = (name: string, detail: string): CheckResult => ({ name, passed: true, detail })
const bad = (name: string, detail: string): CheckResult => ({ name, passed: false, detail })

export async function verifySchema(pool: Pool): Promise<CheckResult[]> {
  return withConnection(pool, async (client) => {
    const results: CheckResult[] = []

    const { rows: schema } = await client.query<{ owner: string }>(
      `SELECT pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname = 'app'`,
    )
    results.push(
      schema.length === 1
        ? ok('app schema exists', `owned by ${schema[0]!.owner}`)
        : bad('app schema exists', 'schema "app" not found'),
    )

    if (schema.length === 1) {
      results.push(
        schema[0]!.owner === DATABASE_ROLES.owner
          ? ok('app schema owned by app_owner', schema[0]!.owner)
          : bad('app schema owned by app_owner', `owned by ${schema[0]!.owner}`),
      )
    }

    const { rows: publicTables } = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    )
    results.push(
      publicTables.length === 0
        ? ok('no application table in public', '0 tables')
        : bad('no application table in public', `${publicTables.length} table(s) present`),
    )

    return results
  })
}

export async function verifyRoles(pool: Pool): Promise<CheckResult[]> {
  return withConnection(pool, async (client) => {
    const results: CheckResult[] = []
    const expected = [
      { role: DATABASE_ROLES.owner, login: false, inherit: false },
      { role: DATABASE_ROLES.migrator, login: true, inherit: true },
      { role: DATABASE_ROLES.api, login: true, inherit: false },
      { role: DATABASE_ROLES.provisioner, login: true, inherit: false },
    ]

    for (const { role, login, inherit } of expected) {
      const { rows } = await client.query<{
        rolcanlogin: boolean
        rolsuper: boolean
        rolcreatedb: boolean
        rolcreaterole: boolean
        rolinherit: boolean
        rolbypassrls: boolean
        rolreplication: boolean
      }>(
        `SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolbypassrls, rolreplication
           FROM pg_roles WHERE rolname = $1`,
        [role],
      )
      if (rows.length === 0) {
        results.push(bad(`role ${role} exists`, 'not found'))
        continue
      }
      const r = rows[0]!
      results.push(ok(`role ${role} exists`, 'present'))

      const violations: string[] = []
      if (r.rolsuper) violations.push('SUPERUSER')
      if (r.rolcreatedb) violations.push('CREATEDB')
      if (r.rolcreaterole) violations.push('CREATEROLE')
      if (r.rolbypassrls) violations.push('BYPASSRLS')
      if (r.rolreplication) violations.push('REPLICATION')
      if (r.rolcanlogin !== login) violations.push(`LOGIN=${r.rolcanlogin} (expected ${login})`)
      if (r.rolinherit !== inherit) violations.push(`INHERIT=${r.rolinherit} (expected ${inherit})`)

      results.push(
        violations.length === 0
          ? ok(`role ${role} attributes restricted`, `login=${login} inherit=${inherit}, no elevated attributes`)
          : bad(`role ${role} attributes restricted`, violations.join(', ')),
      )
    }

    // The API and provisioner must be unable to reach each other's authority.
    for (const [from, to] of [
      [DATABASE_ROLES.api, DATABASE_ROLES.provisioner],
      [DATABASE_ROLES.provisioner, DATABASE_ROLES.api],
      [DATABASE_ROLES.api, DATABASE_ROLES.owner],
      [DATABASE_ROLES.provisioner, DATABASE_ROLES.owner],
      [DATABASE_ROLES.api, DATABASE_ROLES.migrator],
    ] as const) {
      const { rows } = await client.query<{ member: boolean }>(
        `SELECT pg_has_role($1, $2, 'MEMBER') AS member`,
        [from, to],
      )
      results.push(
        rows[0]!.member === false
          ? ok(`${from} is not a member of ${to}`, 'no membership')
          : bad(`${from} is not a member of ${to}`, 'MEMBERSHIP PRESENT — authorities are not separated'),
      )
    }

    return results
  })
}

export async function verifySchemaPrivileges(pool: Pool): Promise<CheckResult[]> {
  return withConnection(pool, async (client) => {
    const results: CheckResult[] = []

    // Runtime identities: USAGE yes, CREATE no.
    for (const role of [DATABASE_ROLES.api, DATABASE_ROLES.provisioner]) {
      const { rows } = await client.query<{ usage: boolean; create: boolean }>(
        `SELECT has_schema_privilege($1,'app','USAGE') AS usage,
                has_schema_privilege($1,'app','CREATE') AS create`,
        [role],
      )
      const r = rows[0]!
      results.push(
        r.usage && !r.create
          ? ok(`${role} has USAGE but not CREATE on app`, 'usage=true create=false')
          : bad(`${role} has USAGE but not CREATE on app`, `usage=${r.usage} create=${r.create}`),
      )
    }

    // Client-facing platform roles: nothing at all.
    for (const role of CLIENT_FACING_ROLES) {
      const { rows } = await client.query<{ present: boolean; usage: boolean; create: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS present,
                COALESCE(has_schema_privilege($1,'app','USAGE'), false)  AS usage,
                COALESCE(has_schema_privilege($1,'app','CREATE'), false) AS create`,
        [role],
      )
      const r = rows[0]!
      if (!r.present) {
        results.push(ok(`${role} has no access to app`, 'role does not exist here'))
        continue
      }
      results.push(
        !r.usage && !r.create
          ? ok(`${role} has no access to app`, 'usage=false create=false')
          : bad(`${role} has no access to app`, `usage=${r.usage} create=${r.create} — Option B breached`),
      )
    }

    // PUBLIC must hold nothing on the schema.
    const { rows: acl } = await client.query<{ nspacl: string | null }>(
      `SELECT nspacl::text FROM pg_namespace WHERE nspname = 'app'`,
    )
    const aclText = acl[0]?.nspacl ?? ''
    const publicGrant = /(^|[{,])=[^,}]*\//.test(aclText)
    results.push(
      publicGrant
        ? bad('PUBLIC has no privilege on app', `ACL contains a PUBLIC grant: ${aclText}`)
        : ok('PUBLIC has no privilege on app', 'no PUBLIC entry in schema ACL'),
    )

    // No default privilege in `app` may grant anything to a client-facing role
    // or to a runtime identity. Absence of a row is the correct state.
    const { rows: defaults } = await client.query<{ grantee: string; acl: string }>(
      `SELECT pg_get_userbyid(d.defaclrole) AS grantee, unnest(d.defaclacl)::text AS acl
         FROM pg_default_acl d
         JOIN pg_namespace n ON n.oid = d.defaclnamespace
        WHERE n.nspname = 'app'`,
    )
    const forbiddenGrantees = [
      ...CLIENT_FACING_ROLES,
      DATABASE_ROLES.api,
      DATABASE_ROLES.provisioner,
      '',
    ]
    const offending = defaults.filter((row) =>
      forbiddenGrantees.some((grantee) => row.acl.startsWith(`${grantee}=`)),
    )
    results.push(
      offending.length === 0
        ? ok(
            'no default privilege grants access in app',
            `${defaults.length} default ACL entr${defaults.length === 1 ? 'y' : 'ies'}, none granting`,
          )
        : bad('no default privilege grants access in app', offending.map((o) => o.acl).join(', ')),
    )

    return results
  })
}

/**
 * Whether the auto-generated Data API is configured to expose `app`.
 *
 * This is a project setting, not database state, but it is readable from SQL:
 * PostgREST takes its schema list from the `authenticator` role's
 * `pgrst.db_schemas` setting. Where that role does not exist (plain PostgreSQL),
 * there is no Data API and the check is reported as not applicable.
 */
export async function verifyDataApiExposure(pool: Pool): Promise<CheckResult[]> {
  return withConnection(pool, async (client) => {
    const { rows } = await client.query<{ config: string[] | null }>(
      `SELECT rolconfig AS config FROM pg_roles WHERE rolname = 'authenticator'`,
    )
    if (rows.length === 0) {
      return [ok('Data API does not expose app', 'no authenticator role — no Data API here')]
    }
    const setting = (rows[0]!.config ?? []).find((entry) => entry.startsWith('pgrst.db_schemas='))
    if (setting === undefined) {
      return [
        ok('Data API does not expose app', 'authenticator has no pgrst.db_schemas setting'),
      ]
    }
    const exposed = setting.slice('pgrst.db_schemas='.length).split(',').map((s) => s.trim())
    return [
      exposed.includes('app')
        ? bad('Data API does not expose app', `exposed schemas: ${exposed.join(', ')} — remove "app"`)
        : ok('Data API does not expose app', `exposed schemas: ${exposed.join(', ')}`),
    ]
  })
}

/**
 * Transaction semantics and row-locking, through whichever connection the caller
 * supplies — so this proves the endpoint is usable, not merely that PostgreSQL is.
 *
 * Creates and drops an isolated probe schema. No Layer 0 table is involved.
 */
export async function verifyTransactionSemantics(pool: Pool): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  const schema = `substrate_probe_${Date.now().toString(36)}`

  try {
    await withConnection(pool, async (client) => {
      await client.query(`CREATE SCHEMA ${schema}`)
      await client.query(`CREATE TABLE ${schema}.probe (id serial PRIMARY KEY, note text NOT NULL)`)
    })

    await withTransaction(pool, async (tx) => {
      await tx.query(`INSERT INTO ${schema}.probe (note) VALUES ('a')`)
      await tx.query(`INSERT INTO ${schema}.probe (note) VALUES ('b')`)
    })
    const committed = await withConnection(pool, async (client) => {
      const { rows } = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM ${schema}.probe`,
      )
      return Number(rows[0]!.n)
    })
    results.push(
      committed === 2
        ? ok('multi-statement transaction commits together', '2 rows committed')
        : bad('multi-statement transaction commits together', `${committed} rows, expected 2`),
    )

    await withTransaction(pool, async (tx) => {
      await tx.query(`INSERT INTO ${schema}.probe (note) VALUES ('rollback-me')`)
      throw new Error('forced')
    }).catch(() => undefined)
    const afterRollback = await withConnection(pool, async (client) => {
      const { rows } = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM ${schema}.probe`,
      )
      return Number(rows[0]!.n)
    })
    results.push(
      afterRollback === 2
        ? ok('forced failure rolls back', 'no partial row persisted')
        : bad('forced failure rolls back', `${afterRollback} rows, expected 2`),
    )

    // The Outbox claim pattern: a held transaction taking a skip-locked row,
    // while a second connection concurrently claims a different one.
    const skipLocked = await withTransaction(pool, async (tx) => {
      const { rows: mine } = await tx.query<{ id: number }>(
        `SELECT id FROM ${schema}.probe ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1`,
      )
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const { rows: theirs } = await client.query<{ id: number }>(
          `SELECT id FROM ${schema}.probe ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1`,
        )
        await client.query('COMMIT')
        return { mine: mine[0]?.id, theirs: theirs[0]?.id }
      } finally {
        client.release()
      }
    })
    results.push(
      skipLocked.mine !== undefined &&
        skipLocked.theirs !== undefined &&
        skipLocked.mine !== skipLocked.theirs
        ? ok(
            'FOR UPDATE SKIP LOCKED gives concurrent workers distinct rows',
            `claimed ${skipLocked.mine} and ${skipLocked.theirs}`,
          )
        : bad(
            'FOR UPDATE SKIP LOCKED gives concurrent workers distinct rows',
            `claimed ${String(skipLocked.mine)} and ${String(skipLocked.theirs)} — ` +
              'a pooled connection may be multiplexing (transaction-mode pooling is not usable here)',
          ),
    )
  } finally {
    await withConnection(pool, (client) =>
      client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`),
    ).catch(() => undefined)
  }

  return results
}

/** Confirm the probe schema left nothing behind. */
export async function verifyNoProbeArtifacts(pool: Pool): Promise<CheckResult[]> {
  return withConnection(pool, async (client) => {
    const { rows } = await client.query<{ nspname: string }>(
      `SELECT nspname FROM pg_namespace WHERE nspname LIKE 'substrate_probe_%'`,
    )
    return [
      rows.length === 0
        ? ok('no probe artifacts remain', 'temporary schemas removed')
        : bad('no probe artifacts remain', `left behind: ${rows.map((r) => r.nspname).join(', ')}`),
    ]
  })
}

/** Confirm no Layer 0 domain table has been created. */
export async function verifyNoLayerZeroTables(pool: Pool): Promise<CheckResult[]> {
  const LAYER_ZERO = [
    'organization',
    'membership',
    'role_assignment',
    'coach_scope_assignment',
    'captain_assignment',
    'authorization_policy_version',
    'audit_log_event',
    'outbox_event',
  ]
  return withConnection(pool, async (client) => {
    const { rows } = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'app'`,
    )
    const present = rows.map((r) => r.tablename)
    const found = present.filter((t) => LAYER_ZERO.includes(t))
    return [
      found.length === 0
        ? ok('no Layer 0 domain table exists', `app contains ${present.length} table(s)`)
        : bad('no Layer 0 domain table exists', `found: ${found.join(', ')}`),
    ]
  })
}
