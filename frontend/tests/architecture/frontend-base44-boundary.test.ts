// @vitest-environment node
/**
 * Architecture tests for the frontend substrate boundary.
 *
 * These live outside `src/` deliberately. They must name the very literals the
 * CI boundary check bans — `asServiceRole`, entity access, credential names —
 * and a file under `src/` containing them would trip that check.
 *
 * They overlap the CI script on purpose. The script is what fails a build; the
 * script's own tests run against fixtures. These run against the real tree, so
 * a rule that both agree on has been checked two independent ways.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Runs in the node environment (see the directive above) so that
// `import.meta.url` is a real file URL rather than the jsdom page origin.
const SRC = fileURLToPath(new URL('../../src', import.meta.url))
const ADAPTER_DIR = join('infrastructure', 'base44')
const TEST_ONLY_DIR = 'testing'

interface SourceFile {
  readonly path: string
  readonly text: string
  readonly isTest: boolean
}

function collect(dir: string, into: SourceFile[] = []): SourceFile[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      collect(full, into)
    } else if (/\.(ts|tsx)$/.test(entry)) {
      into.push({
        path: relative(SRC, full),
        text: readFileSync(full, 'utf8'),
        isTest: /\.test\.tsx?$/.test(entry),
      })
    }
  }
  return into
}

const FILES = collect(SRC)
const inAdapter = (f: SourceFile) => f.path.startsWith(ADAPTER_DIR + sep)
const inTestOnly = (f: SourceFile) => f.path.startsWith(TEST_ONLY_DIR + sep)
const offenders = (predicate: (f: SourceFile) => boolean) =>
  FILES.filter(predicate).map((f) => f.path)

describe('frontend substrate boundary', () => {
  it('finds a source tree to check, so a passing suite means something', () => {
    expect(FILES.length).toBeGreaterThan(10)
    expect(FILES.some(inAdapter)).toBe(true)
  })

  it('confines the Base44 SDK to the designated adapter directory', () => {
    // Profile Section 10.1: one substrate dependency, behind one adapter.
    expect(offenders((f) => !inAdapter(f) && f.text.includes('@base44'))).toEqual([])
  })

  it('keeps substrate-neutral application contracts free of the substrate', () => {
    const application = FILES.filter((f) => f.path.startsWith('application' + sep))
    expect(application.length).toBeGreaterThan(0)
    expect(application.filter((f) => f.text.includes('@base44')).map((f) => f.path)).toEqual([])
  })

  it('keeps pages and components free of the substrate', () => {
    const ui = FILES.filter(
      (f) => f.path.startsWith('components' + sep) || f.path.startsWith('pages' + sep),
    )
    expect(ui.length).toBeGreaterThan(0)
    for (const file of ui) {
      expect(file.text).not.toContain('@base44')
      expect(file.text).not.toContain('infrastructure/base44')
    }
  })

  it('prohibits Base44 entity access anywhere in frontend source', () => {
    // Contract Global Invariant 17 and Prohibition 9: governed and internal
    // entities have no client-facing CRUD path of any kind, for any role.
    expect(offenders((f) => /\.entities\b/.test(f.text))).toEqual([])
  })

  it('prohibits elevated service-role access anywhere in frontend source', () => {
    const elevated = ['asServiceRole', 'createClientFromRequest', 'serviceToken', 'SERVICE_ROLE']
    for (const literal of elevated) {
      expect(offenders((f) => f.text.includes(literal))).toEqual([])
    }
  })

  it('carries no credential in frontend source', () => {
    const forbidden = [/\bapiKey\b/, /\bapi_key\b/, /\bAPI_KEY\b/, /JWT_SECRET/, /DATABASE_URL/,
      /VITE_[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD)/]
    for (const pattern of forbidden) {
      expect(offenders((f) => pattern.test(f.text))).toEqual([])
    }
  })

  it('keeps Option B: no direct Supabase or database access from the browser', () => {
    expect(offenders((f) => /@supabase\/|postgres(ql)?:\/\//.test(f.text))).toEqual([])
  })

  it('keeps test-only infrastructure out of shipped modules', () => {
    const shipped = FILES.filter((f) => !f.isTest && !inTestOnly(f))
    expect(
      shipped.filter((f) => /from '(\.{1,2}\/)+testing\//.test(f.text)).map((f) => f.path),
    ).toEqual([])
  })

  it('lets only the entry point choose the production substrate', () => {
    const importers = offenders(
      (f) => !f.isTest && !inAdapter(f) && f.text.includes('createProductionOperationExecutor'),
    )
    expect(importers).toEqual(['main.tsx'])
  })

  it('names exactly one backend function, as a constant', () => {
    const adapter = readFileSync(join(SRC, ADAPTER_DIR, 'operation-executor.ts'), 'utf8')
    const invocations = adapter.match(/\.invoke\(/g) ?? []
    expect(invocations).toHaveLength(1)
    expect(adapter).toContain('this.invoker.invoke(OPERATION_DISPATCH_FUNCTION,')
  })
})
