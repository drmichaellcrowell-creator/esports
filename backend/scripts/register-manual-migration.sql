-- =============================================================================
-- Register manually-applied migrations in the migration ledger.
--
-- Run this ONLY after applying 0000_infrastructure.sql and 0001_database_roles.sql
-- by hand (for example through the Supabase SQL Editor), and only once.
--
-- WHY THIS IS REQUIRED. The migration runner records every applied file in
-- migrations.applied_migration with a SHA-256 of its contents. Applying the SQL
-- by hand changes the database but leaves that ledger empty, so the next
-- `npm run migrate` would treat both migrations as pending and re-apply them.
-- Both happen to be idempotent, so nothing would break — but the ledger would be
-- lying about the state of the database, and that is exactly the kind of drift
-- the checksum mechanism exists to prevent.
--
-- The checksums below are of the committed files. Recording the canonical
-- checksum is correct even if a copy-paste introduced an incidental whitespace
-- difference: the ledger's claim is "the migration as committed is applied",
-- and the runner will compare against the committed file from then on.
--
-- If either checksum is wrong, `npm run migrate` will refuse to proceed with
-- MigrationChecksumMismatchError rather than silently diverging.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS migrations;

CREATE TABLE IF NOT EXISTS migrations.applied_migration (
  name        text PRIMARY KEY,
  checksum    text NOT NULL,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO migrations.applied_migration (name, checksum) VALUES
  ('0000_infrastructure.sql', 'e0340940358d1c62959e85888d7a89eb7531bf917cb6798ebbaa67ca48c941ec'),
  ('0001_database_roles.sql', 'f94fd43ecef9436a421ccbf0ca22a5546ab3fa6c710e9ee61f245583b7ac36db')
ON CONFLICT (name) DO NOTHING;

SELECT name, checksum, applied_at FROM migrations.applied_migration ORDER BY name;
