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
 */
const REPO = fileURLToPath(new URL('../..', import.meta.url))

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

  it('has no Supabase data client dependency', async () => {
    const pkg = await readFile(path.join(REPO, 'frontend', 'package.json'), 'utf8')
    expect(pkg).not.toContain('@supabase/')
    expect(pkg).not.toContain('@base44')
    expect(pkg).not.toContain('pg')
  })

  it('makes no direct Supabase or database call', async () => {
    const files = await sourceFiles(path.join(REPO, 'frontend', 'src'), ['.ts', '.tsx'])
    for (const file of files) {
      const contents = await readFile(file, 'utf8')
      expect(contents, `${file} must not use a Supabase client`).not.toMatch(
        /@supabase\/|createClient\s*\(/,
      )
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
