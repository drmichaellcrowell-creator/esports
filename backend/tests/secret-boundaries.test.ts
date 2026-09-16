import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Secrets must not reach the places that publish them.
 *
 * The frontend bundle is public: Vite inlines every VITE_* variable into
 * JavaScript the browser downloads. The Base44 preview harness is a third-party
 * surface. Neither may carry a database credential or a backend secret.
 *
 * Base44 is now the active v1 substrate, so the frontend legitimately depends
 * on its SDK — confined to one adapter directory, per profile Section 10.1.
 * Nothing else about these boundaries moved: Supabase and database access are
 * still forbidden the browser outright, and the SDK's presence is checked here
 * to be *confined*, not merely tolerated.
 */
const REPO = fileURLToPath(new URL('../..', import.meta.url))

/**
 * The single directory in the frontend permitted to import the Base44 SDK or
 * construct a substrate client. Kept in step with
 * `.github/scripts/check-frontend-base44-boundary.sh`.
 */
const FRONTEND_ADAPTER_DIR = path.join('frontend', 'src', 'infrastructure', 'base44')

const CREDENTIAL_SHAPES: readonly [string, RegExp][] = [
  ['a postgres connection string with a password', /postgres(ql)?:\/\/[^\s'"]*:[^\s'"@]+@/],
  ['a JWT', /eyJ[A-Za-z0-9_-]{20,}\./],
  ['a private key', /BEGIN [A-Z ]*PRIVATE KEY/],
  ['a Supabase secret key', /sb_secret|service_role_key|SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S/],
]

async function sourceFiles(dir: string, extensions: readonly string[]): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true })
  return entries
    .filter((e) => e.isFile() && extensions.some((ext) => e.name.endsWith(ext)))
    .map((e) => path.join(e.parentPath ?? dir, e.name))
    .filter((f) => !f.includes('node_modules') && !f.includes('/dist/'))
}

describe('the frontend never receives backend secrets', () => {
  it('contains no database connection string', async () => {
    const files = await sourceFiles(path.join(REPO, 'frontend', 'src'), ['.ts', '.tsx', '.js', '.jsx'])
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const contents = await readFile(file, 'utf8')
      expect(contents, `${file} must not contain a connection string`).not.toMatch(
        /postgres(ql)?:\/\//,
      )
    }
  })

  it('declares no database or secret variable in its example environment', async () => {
    const example = await readFile(path.join(REPO, 'frontend', '.env.example'), 'utf8')
    for (const forbidden of [
      'DATABASE_URL',
      'PROVISIONER_DATABASE_URL',
      'MIGRATION_DATABASE_URL',
      'SERVICE_ROLE',
      'JWT_SECRET',
      'PASSWORD',
    ]) {
      expect(example, `frontend/.env.example must not mention ${forbidden}`).not.toContain(forbidden)
    }
  })

  it('has no Supabase or database client dependency', async () => {
    // Checked against declared dependency names rather than the file's text: a
    // substring search over package.json reports a match for any package whose
    // name happens to contain 'pg', and misses nothing it would otherwise catch.
    const pkg = JSON.parse(
      await readFile(path.join(REPO, 'frontend', 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
    const declared = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ]

    for (const forbidden of ['pg', 'postgres', 'drizzle-orm', 'knex']) {
      expect(declared, `frontend must not depend on ${forbidden}`).not.toContain(forbidden)
    }
    expect(declared.filter((name) => name.startsWith('@supabase/'))).toEqual([])
  })

  it('confines the Base44 SDK to the one adapter directory', async () => {
    // Base44 is the active v1 substrate, so the SDK is permitted — in exactly
    // one place. Pages, components, hooks and application modules depend on the
    // operation contract, never on the substrate (profile Section 10.1).
    const files = await sourceFiles(path.join(REPO, 'frontend', 'src'), ['.ts', '.tsx'])
    expect(files.length).toBeGreaterThan(0)

    for (const file of files) {
      const contents = await readFile(file, 'utf8')
      if (!contents.includes('@base44')) {
        continue
      }
      expect(file, 'the Base44 SDK may be imported only by the adapter').toContain(
        FRONTEND_ADAPTER_DIR,
      )
    }
  })

  it('makes no direct Supabase or database call', async () => {
    const files = await sourceFiles(path.join(REPO, 'frontend', 'src'), ['.ts', '.tsx'])
    for (const file of files) {
      const contents = await readFile(file, 'utf8')
      // Unchanged: the browser never reaches Supabase or a database, whatever
      // the active application substrate is (Option B).
      expect(contents, `${file} must not use a Supabase client`).not.toMatch(/@supabase\//)

      // A substrate client may be constructed only by the adapter. Outside it,
      // this is the same ban it has always been.
      if (!file.includes(FRONTEND_ADAPTER_DIR)) {
        expect(contents, `${file} must not construct a substrate client`).not.toMatch(
          /createClient\s*\(/,
        )
      }
    }
  })

  it('never lets the browser reach elevated substrate access', async () => {
    const files = await sourceFiles(path.join(REPO, 'frontend', 'src'), ['.ts', '.tsx'])
    for (const file of files) {
      const contents = await readFile(file, 'utf8')
      expect(contents, `${file} must not reach elevated access`).not.toMatch(
        /asServiceRole|createClientFromRequest|serviceToken/,
      )
      expect(contents, `${file} must not access entities directly`).not.toMatch(/\.entities\b/)
    }
  })
})

describe('Base44 remains a credential-free preview harness', () => {
  it('declares no secrets', async () => {
    const config = JSON.parse(
      await readFile(path.join(REPO, '.base44', 'environment.json'), 'utf8'),
    ) as { secrets?: unknown[] }
    expect(config.secrets).toEqual([])
  })

  it('contains no credential-shaped value', async () => {
    const config = await readFile(path.join(REPO, '.base44', 'environment.json'), 'utf8')
    const compose = await readFile(path.join(REPO, 'docker-compose.base44.yml'), 'utf8')
    for (const source of [config, compose]) {
      for (const [label, pattern] of CREDENTIAL_SHAPES) {
        expect(source, `must not contain ${label}`).not.toMatch(pattern)
      }
      expect(source).not.toMatch(/DATABASE_URL|SERVICE_ROLE|JWT_SECRET/)
    }
  })
})

describe('example environment files carry names, never values', () => {
  it.each(['backend/.env.example', 'frontend/.env.example'])('%s has no real credential', async (rel) => {
    const contents = await readFile(path.join(REPO, rel), 'utf8')
    for (const [label, pattern] of CREDENTIAL_SHAPES) {
      const matches = contents.match(pattern)
      if (matches !== null) {
        // Documented placeholders are acceptable; real-looking values are not.
        expect(
          /USER:PASSWORD|PROVISIONER_USER|APP_API_PASSWORD|YOUR_|\[|</.test(matches[0]),
          `${rel} appears to contain ${label}: ${matches[0]}`,
        ).toBe(true)
      }
    }
  })

  it('backend example names every identity the contract separates', async () => {
    const contents = await readFile(path.join(REPO, 'backend/.env.example'), 'utf8')
    for (const name of [
      'DATABASE_URL',
      'PROVISIONER_DATABASE_URL',
      'MIGRATION_DATABASE_URL',
      'SUPABASE_JWT_ISSUER',
      'SUPABASE_JWKS_URL',
      'SUPABASE_JWT_AUDIENCE',
    ]) {
      expect(contents, `backend/.env.example must document ${name}`).toContain(name)
    }
  })

  it('no .env file other than an example is tracked', async () => {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const { stdout } = await promisify(execFile)('git', ['ls-files'], { cwd: REPO })
    const envFiles = stdout.split('\n').filter((f) => /(^|\/)\.env/.test(f))
    expect(envFiles.sort()).toEqual(['backend/.env.example', 'frontend/.env.example'])
  })
})
