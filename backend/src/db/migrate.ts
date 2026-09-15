import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Pool } from 'pg'
import { withConnection } from './transaction.js'

/**
 * SQL migration runner.
 *
 * Migrations are plain, hand-reviewable `.sql` files committed to Git and applied
 * in lexical order. Every guarantee the contract expects the database to enforce —
 * schema isolation, privilege revocation, and later the unique and partial-unique
 * indexes and append-only triggers — is therefore reviewable as SQL rather than
 * inferred from TypeScript.
 *
 * Each file runs inside its own transaction, so a failed migration leaves nothing
 * behind (PostgreSQL DDL is transactional). Applied files are recorded with a
 * checksum and are refused if their content later changes: an applied migration
 * is history, and history is not edited in place.
 */

export interface AppliedMigration {
  readonly name: string
  readonly checksum: string
  readonly appliedAt: Date
}

export class MigrationChecksumMismatchError extends Error {
  constructor(name: string) {
    super(
      `Migration "${name}" has already been applied but its contents have changed. ` +
        'Applied migrations are immutable; add a new migration instead of editing one.',
    )
    this.name = 'MigrationChecksumMismatchError'
  }
}

export const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url))

const LEDGER_DDL = `
CREATE SCHEMA IF NOT EXISTS migrations;
CREATE TABLE IF NOT EXISTS migrations.applied_migration (
  name        text PRIMARY KEY,
  checksum    text NOT NULL,
  applied_at  timestamptz NOT NULL DEFAULT now()
);
`

function checksum(contents: string): string {
  return createHash('sha256').update(contents, 'utf8').digest('hex')
}

export async function listMigrationFiles(dir: string = MIGRATIONS_DIR): Promise<string[]> {
  const entries = await readdir(dir)
  return entries.filter((name) => name.endsWith('.sql')).sort((a, b) => a.localeCompare(b))
}

export async function runMigrations(
  pool: Pool,
  options: { readonly dir?: string; readonly log?: (message: string) => void } = {},
): Promise<AppliedMigration[]> {
  const dir = options.dir ?? MIGRATIONS_DIR
  const log = options.log ?? (() => undefined)
  const files = await listMigrationFiles(dir)

  return withConnection(pool, async (client) => {
    await client.query(LEDGER_DDL)

    const { rows: existing } = await client.query<{ name: string; checksum: string }>(
      'SELECT name, checksum FROM migrations.applied_migration',
    )
    const alreadyApplied = new Map(existing.map((row) => [row.name, row.checksum]))

    const applied: AppliedMigration[] = []
    for (const name of files) {
      const sql = await readFile(path.join(dir, name), 'utf8')
      const digest = checksum(sql)
      const previous = alreadyApplied.get(name)

      if (previous !== undefined) {
        if (previous !== digest) {
          throw new MigrationChecksumMismatchError(name)
        }
        continue
      }

      await client.query('BEGIN')
      try {
        await client.query(sql)
        const { rows } = await client.query<{ applied_at: Date }>(
          'INSERT INTO migrations.applied_migration (name, checksum) VALUES ($1, $2) RETURNING applied_at',
          [name, digest],
        )
        await client.query('COMMIT')
        log(`applied migration ${name}`)
        applied.push({ name, checksum: digest, appliedAt: rows[0]!.applied_at })
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw error
      }
    }
    return applied
  })
}
