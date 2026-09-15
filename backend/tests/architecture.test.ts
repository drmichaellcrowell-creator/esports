import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  resolveAuthorization,
  AuthorizationResolverNotImplementedError,
} from '../src/authz/resolver.js'
import {
  executeControlledOperation,
  ControlledOperationNotImplementedError,
} from '../src/authz/controlled-operation.js'
import { createProvisionerPool, ProvisionerNotConfiguredError } from '../src/db/provisioner.js'
import type { AuthenticatedIdentity } from '../src/auth/identity.js'
import type { Environment } from '../src/config/env.js'

const SRC = fileURLToPath(new URL('../src', import.meta.url))

async function readSourceFiles(dir: string): Promise<{ file: string; contents: string }[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true })
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => path.join(entry.parentPath ?? dir, entry.name))
  return Promise.all(
    files.map(async (file) => ({ file, contents: await readFile(file, 'utf8') })),
  )
}

describe('database access boundary', () => {
  it('no route module imports database infrastructure directly', async () => {
    const routes = await readSourceFiles(path.join(SRC, 'api', 'routes'))
    expect(routes.length).toBeGreaterThan(0)
    for (const { file, contents } of routes) {
      const imports = contents.match(/^\s*import[\s\S]*?from\s+'([^']+)'/gm) ?? []
      const joined = imports.join('\n')
      for (const forbidden of ['pg', 'drizzle-orm', 'db/pool', 'db/provisioner', 'db/transaction']) {
        expect(joined, `${file} must not import ${forbidden}`).not.toContain(forbidden)
      }
    }
  })

  it('no API module reaches for provisioner authority', async () => {
    const apiFiles = await readSourceFiles(path.join(SRC, 'api'))
    for (const { file, contents } of apiFiles) {
      expect(contents, `${file} must not import the provisioner pool`).not.toContain('provisioner')
    }
  })

  it('the provisioner refuses to run without its own distinct credential', () => {
    const env = { PROVISIONER_DATABASE_URL: undefined } as unknown as Environment
    expect(() => createProvisionerPool(env)).toThrow(ProvisionerNotConfiguredError)
  })
})

describe('no permissive authorization placeholder exists', () => {
  const identity: AuthenticatedIdentity = Object.freeze({
    authUserId: 'auth-user-0001',
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + 3600_000),
  })

  it('the resolver throws rather than returning a decision', () => {
    expect(() =>
      resolveAuthorization({
        identity,
        organizationSelector: 'org-1',
        action: 'organization.read',
        resourceType: 'Organization',
        resourceId: 'org-1',
      }),
    ).toThrow(AuthorizationResolverNotImplementedError)
  })

  it('the resolver never returns permit', () => {
    let returned: unknown = 'no value returned'
    try {
      returned = resolveAuthorization({
        identity,
        organizationSelector: null,
        action: 'anything',
        resourceType: 'Anything',
        resourceId: null,
      })
    } catch {
      returned = 'threw'
    }
    expect(returned).toBe('threw')
  })

  it('controlled operations cannot execute', () => {
    expect(() =>
      executeControlledOperation('organization.provision', async () => undefined),
    ).toThrow(ControlledOperationNotImplementedError)
  })

  it('no source file constructs and returns a permit decision', async () => {
    // Matches a permit returned as a VALUE. The `outcome: 'permit'` that appears
    // in the AuthorizationDecision type declaration is the shape of a future
    // decision, not a granted one, and is intentionally not matched here.
    const returnsPermit = /return\s*\{[^}]*outcome:\s*['"]permit['"]/
    for (const { file, contents } of await readSourceFiles(SRC)) {
      expect(contents.replace(/\s+/g, ' '), `${file} must not return a permit`).not.toMatch(
        returnsPermit,
      )
    }
  })

  it('no authorization module short-circuits to a positive answer', async () => {
    // Scoped to src/authz: a bare `return true` is legitimate elsewhere (the
    // readiness probe returns one), but never in the authorization layer.
    for (const { file, contents } of await readSourceFiles(path.join(SRC, 'authz'))) {
      const normalized = contents.replace(/\s+/g, ' ')
      expect(normalized, `${file} must not return true`).not.toMatch(/return\s+true/)
      expect(normalized, `${file} must not return an allow flag`).not.toMatch(
        /(allowed|permitted|authorized)\s*:\s*true/,
      )
    }
  })
})

describe('Phase 0A scope boundary', () => {
  it('defines no Layer 0 domain entity', async () => {
    const sources = await readSourceFiles(SRC)
    const layerZeroTables = [
      'organization',
      'membership',
      'role_assignment',
      'coach_scope_assignment',
      'captain_assignment',
      'authorization_policy_version',
      'audit_log_event',
      'outbox_event',
    ]
    for (const { file, contents } of sources) {
      for (const table of layerZeroTables) {
        expect(contents, `${file} must not define table ${table}`).not.toMatch(
          new RegExp(`pgTable\\(\\s*['"]${table}['"]`),
        )
        expect(contents, `${file} must not define table ${table}`).not.toMatch(
          new RegExp(`appSchema\\.table\\(\\s*['"]${table}['"]`),
        )
      }
    }
  })

  it('the committed migrations create no Layer 0 domain table', async () => {
    const migrationsDir = fileURLToPath(new URL('../migrations', import.meta.url))
    const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql'))
    expect(files.length).toBeGreaterThan(0)
    for (const name of files) {
      const sql = (await readFile(path.join(migrationsDir, name), 'utf8')).toLowerCase()
      expect(sql, `${name} must not create tables`).not.toMatch(/create\s+table/)
    }
  })

  it('the app schema is declared and public is not used for application tables', async () => {
    const schema = await readFile(path.join(SRC, 'db', 'schema.ts'), 'utf8')
    expect(schema).toContain("pgSchema('app')")
    expect(schema).not.toContain("pgSchema('public')")
  })
})
