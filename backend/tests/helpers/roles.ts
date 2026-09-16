import pg from 'pg'

/**
 * Drop the Phase 0B roles cluster-wide.
 *
 * PostgreSQL roles are CLUSTER-scoped while test databases are not, so a role
 * created by one test database outlives it and is visible to every other. Any
 * test asserting "this role does not exist" is therefore meaningless without
 * this — which is exactly how a bug reached a real project: the diagnostic was
 * only ever exercised against a fresh *database* that still had the roles.
 *
 * A role cannot be dropped while it owns objects or holds privileges, so this
 * runs DROP OWNED BY in every connectable database first.
 */
export const APP_ROLES = ['app_api', 'app_provisioner', 'app_migrator', 'app_owner'] as const

export async function dropAppRoles(adminUrl: string): Promise<void> {
  const admin = new pg.Client({ connectionString: adminUrl })
  await admin.connect()
  let databases: string[]
  try {
    const { rows } = await admin.query<{ datname: string }>(
      `SELECT datname FROM pg_database WHERE datallowconn AND datname NOT LIKE 'template%'`,
    )
    databases = rows.map((r) => r.datname)
  } finally {
    await admin.end()
  }

  for (const database of databases) {
    const url = new URL(adminUrl)
    url.pathname = `/${database}`
    const client = new pg.Client({ connectionString: url.toString() })
    try {
      await client.connect()
    } catch {
      continue
    }
    try {
      for (const role of APP_ROLES) {
        await client
          .query(
            `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}')
               THEN EXECUTE 'DROP OWNED BY ${role} CASCADE'; END IF; END $$;`,
          )
          .catch(() => undefined)
      }
    } finally {
      await client.end()
    }
  }

  const dropper = new pg.Client({ connectionString: adminUrl })
  await dropper.connect()
  try {
    for (const role of APP_ROLES) {
      await dropper.query(`DROP ROLE IF EXISTS ${role}`)
    }
  } finally {
    await dropper.end()
  }
}

export async function appRolesPresent(adminUrl: string): Promise<string[]> {
  const client = new pg.Client({ connectionString: adminUrl })
  await client.connect()
  try {
    const { rows } = await client.query<{ rolname: string }>(
      `SELECT rolname FROM pg_roles WHERE rolname = ANY($1::text[]) ORDER BY rolname`,
      [APP_ROLES],
    )
    return rows.map((r) => r.rolname)
  } finally {
    await client.end()
  }
}
