import { loadEnv } from '../config/env.js'
import { verifyAuthConfiguration } from '../auth/verify-config.js'

/**
 * Verify Supabase Auth configuration against the real project.
 *
 * Needs no database and no credential: a JWKS endpoint serves public keys.
 * Usable wherever HTTPS reaches the project, including from environments that
 * cannot open a PostgreSQL connection.
 */
async function main(): Promise<void> {
  const env = loadEnv()
  const results = await verifyAuthConfiguration({
    issuer: env.SUPABASE_JWT_ISSUER,
    jwksUrl: env.SUPABASE_JWKS_URL,
    audience: env.SUPABASE_JWT_AUDIENCE,
  })

  process.stdout.write('Supabase Auth configuration\n---------------------------\n')
  let failures = 0
  for (const result of results) {
    if (!result.passed) failures += 1
    process.stdout.write(
      `${result.passed ? '  PASS  ' : '  FAIL  '}${result.name}\n          ${result.detail}\n`,
    )
  }
  process.stdout.write(failures === 0 ? '\nAuth configuration is correct.\n' : `\n${failures} check(s) FAILED.\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
