-- =============================================================================
-- Phase 0A — infrastructure migration
--
-- Establishes the application schema and its security posture ONLY.
-- No Layer 0 domain table is created here: Organization, Membership,
-- RoleAssignment, CoachScopeAssignment, CaptainAssignment,
-- AuthorizationPolicyVersion, AuditLogEvent and OutboxEvent belong to Phase 0B.
--
-- Posture established here:
--   * Application tables live in a dedicated `app` schema, never `public`.
--   * Supabase's client-facing roles (`anon`, `authenticated`) hold no privilege
--     on `app`, now or by default for future objects.
--   * Nothing here treats PostgREST or RLS as the authorization mechanism.
--     Authorization is a centralized server-side resolver (Contract Global
--     Invariant 4); row visibility predicates cannot express the contract's
--     controlled-operation preconditions, sensitivity tiers, authority path or
--     policy-version binding. RLS appears below only as a deny-all backstop.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS app;

-- -----------------------------------------------------------------------------
-- PUBLIC holds nothing on `app`, now or for future objects.
-- ALTER DEFAULT PRIVILEGES applies to objects created by the role running this
-- migration, which is the role that will own application tables.
-- -----------------------------------------------------------------------------
REVOKE ALL ON SCHEMA app FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA app FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA app FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;

ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE ALL ON FUNCTIONS FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- Supabase client-facing roles.
--
-- On Supabase these roles back the auto-generated PostgREST API. Option B denies
-- the browser direct access to application tables, so they must hold nothing on
-- `app`. The guard keeps this migration portable: the roles exist on Supabase and
-- do not exist in a plain PostgreSQL container, and the migration must apply
-- cleanly to both.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  client_role text;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA app FROM %I', client_role);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA app FROM %I', client_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA app FROM %I', client_role);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM %I', client_role);

      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE ALL ON TABLES FROM %I', client_role);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE ALL ON SEQUENCES FROM %I', client_role);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE ALL ON FUNCTIONS FROM %I', client_role);

      RAISE NOTICE 'revoked all privileges on schema app from role %', client_role;
    END IF;
  END LOOP;
END
$$;

COMMENT ON SCHEMA app IS
  'Application tables. Reached only through the server-side controlled-operation '
  'layer; no direct client access, no PostgREST exposure. Authorization is the '
  'centralized resolver, not RLS.';
