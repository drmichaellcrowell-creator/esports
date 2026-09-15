import { defineConfig } from 'drizzle-kit'

/**
 * Drizzle is the schema/query layer. Generated DDL is emitted as plain SQL into
 * `migrations/` and committed to Git, so every database-enforced guarantee the
 * contract relies on is reviewable as SQL rather than inferred from TypeScript.
 *
 * Application tables live in the dedicated `app` schema, never `public`.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './migrations',
  schemaFilter: ['app'],
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? '',
  },
})
