import { loadEnv } from '../config/env.js'
import { databaseRoleFromUrl } from '../config/database-identity.js'
import { createPool } from '../db/pool.js'
import {
  verifyDataApiExposure,
  verifyNoLayerZeroTables,
  verifyNoProbeArtifacts,
  verifyRoles,
  verifySchema,
  verifySchemaPrivileges,
  verifyTransactionSemantics,
  type CheckResult,
} from '../db/verify.js'

/**
 * Phase 0B substrate verification, runnable against any PostgreSQL — a
 * disposable container or the real project.
 *
 * Reports role names, privileges and check outcomes. It never prints a
 * connection string, a username with its host, or any credential.
 *
 * Usage:  npm run verify:substrate
 */

const PASS = '  PASS  '
const FAIL = '  FAIL  '

function report(title: string, results: readonly CheckResult[]): number {
  process.stdout.write(`\n${title}\n${'-'.repeat(title.length)}\n`)
  let failures = 0
  for (const result of results) {
    if (!result.passed) failures += 1
    process.stdout.write(
      `${result.passed ? PASS : FAIL}${result.name}\n          ${result.detail}\n`,
    )
  }
  return failures
}

async function main(): Promise<void> {
  const env = loadEnv()
  const role = databaseRoleFromUrl(env.DATABASE_URL) ?? '(unknown)'

  process.stdout.write('Phase 0B substrate verification\n')
  process.stdout.write(`connected as database role: ${role}\n`)

  const pool = createPool({
    connectionString: env.DATABASE_URL,
    max: 4,
    applicationName: 'esports-verify-substrate',
  })

  let failures = 0
  try {
    failures += report('Schema', await verifySchema(pool))
    failures += report('Roles and separation of authority', await verifyRoles(pool))
    failures += report('Option B — schema privileges', await verifySchemaPrivileges(pool))
    failures += report('Option B — Data API exposure', await verifyDataApiExposure(pool))
    failures += report('Transaction semantics through this endpoint', await verifyTransactionSemantics(pool))
    failures += report('Gate scope', [
      ...(await verifyNoLayerZeroTables(pool)),
      ...(await verifyNoProbeArtifacts(pool)),
    ])
  } finally {
    await pool.end()
  }

  process.stdout.write(
    failures === 0
      ? '\nAll substrate checks passed.\n'
      : `\n${failures} check(s) FAILED.\n`,
  )
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
