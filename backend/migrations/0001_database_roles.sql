-- =============================================================================
-- Phase 0B — database roles and Option B lockdown
--
-- Establishes the distinct database authorities Amendment 001 requires, and
-- hardens the `app` schema against every client-facing role.
--
-- NO Layer 0 domain table is created here. This migration creates roles,
-- ownership and privileges only.
--
-- FOUR AUTHORITIES, deliberately separate:
--
--   app_owner       NOLOGIN. Owns the `app` schema and every object in it.
--                   Owning objects as a dedicated role — rather than as
--                   `postgres` — isolates us from any platform-configured
--                   default privileges attached to the platform's own role.
--
--   app_migrator    LOGIN. Runs migrations. Member of app_owner (INHERIT), so
--                   objects it creates are owned by app_owner.
--
--   app_api         LOGIN. The API and worker runtime identity. Least
--                   privilege: USAGE on the schema and nothing else. It is
--                   granted NO default privileges, so a future table confers
--                   nothing on it until a migration grants it explicitly.
--                   That is what makes Amendment 001 invariant I12 structural:
--                   app_api cannot acquire INSERT on the organization or
--                   policy-version tables by accident, because privileges on
--                   those tables have to be written down to exist at all.
--
--   app_provisioner LOGIN. Operator-only genesis authority (`policy.bootstrap`,
--                   `organization.provision` — Phase 0C). Same posture: USAGE
--                   only, no default privileges, no standing read of anything.
--
-- CREDENTIALS ARE NOT IN THIS FILE. The LOGIN attribute is structure and lives
-- in Git; passwords are set once, out of band, with ALTER ROLE ... PASSWORD.
-- A LOGIN role with no password cannot authenticate, so the roles fail closed
-- until an operator deliberately issues a credential.
--
-- This migration requires an authority that can CREATE ROLE. It is applied with
-- the project-owner/bootstrap credential, not with app_migrator.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Roles. Created without passwords and without any privilege-bearing attribute.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  target_role text;
BEGIN
  FOREACH target_role IN ARRAY ARRAY['app_owner', 'app_migrator', 'app_api', 'app_provisioner'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target_role) THEN
      EXECUTE format('CREATE ROLE %I', target_role);
      RAISE NOTICE 'created role %', target_role;
    END IF;
  END LOOP;
END
$$;

-- Attributes are asserted every run, so drift is corrected rather than assumed.
-- NOINHERIT on the runtime identities means that even an accidental future
-- membership grant would not silently take effect without an explicit SET ROLE.
ALTER ROLE app_owner       NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
ALTER ROLE app_migrator      LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS   INHERIT;
ALTER ROLE app_api           LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
ALTER ROLE app_provisioner   LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;

-- app_migrator inherits app_owner so migrated objects are owned by app_owner.
-- The runtime identities are members of nothing.
GRANT app_owner TO app_migrator;

-- The bootstrap authority needs membership in app_owner to transfer ownership.
DO $$
BEGIN
  IF NOT pg_has_role(current_user, 'app_owner', 'MEMBER') THEN
    EXECUTE format('GRANT app_owner TO %I', current_user);
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- Ownership: the `app` schema belongs to app_owner, not to whoever migrated.
-- -----------------------------------------------------------------------------
ALTER SCHEMA app OWNER TO app_owner;

-- -----------------------------------------------------------------------------
-- Connect + schema privileges.
--
-- USAGE lets a role resolve names inside the schema. It confers NO access to
-- any object: that still requires a per-object grant, and there are no objects.
-- CREATE is withheld from every runtime identity — only migrations add objects.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  db  text := current_database();
  runtime_role text;
BEGIN
  FOREACH runtime_role IN ARRAY ARRAY['app_migrator', 'app_api', 'app_provisioner'] LOOP
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', db, runtime_role);
    EXECUTE format('GRANT USAGE ON SCHEMA app TO %I', runtime_role);
  END LOOP;

  -- Only migrations create objects.
  EXECUTE 'GRANT CREATE ON SCHEMA app TO app_migrator';
  EXECUTE 'REVOKE CREATE ON SCHEMA app FROM app_api, app_provisioner';
END
$$;

-- -----------------------------------------------------------------------------
-- NO DEFAULT PRIVILEGES FOR THE RUNTIME IDENTITIES.
--
-- This absence is the mechanism, not an omission. Because app_api and
-- app_provisioner hold no default privileges, every future table grants them
-- nothing until a migration says otherwise in writing. Amendment 001 invariant
-- I12 — the API must never be able to perform tenant or policy genesis — is
-- therefore enforced by what has to be added rather than by what must be
-- remembered and removed.
--
-- What IS asserted below is the negative: objects created by app_owner confer
-- nothing on PUBLIC or on any client-facing platform role.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  client_role text;
BEGIN
  ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA app REVOKE ALL ON TABLES FROM PUBLIC;
  ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA app REVOKE ALL ON SEQUENCES FROM PUBLIC;
  ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA app REVOKE ALL ON FUNCTIONS FROM PUBLIC;

  -- Platform client-facing roles. `service_role` and `authenticator` are
  -- included beyond anon/authenticated: service_role bypasses RLS and
  -- authenticator is the role the auto-generated Data API logs in as. Under
  -- Option B none of them may reach `app`. Guarded, because these roles exist
  -- on the platform and not in a plain PostgreSQL container.
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role', 'authenticator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA app FROM %I', client_role);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA app FROM %I', client_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA app FROM %I', client_role);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM %I', client_role);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA app REVOKE ALL ON TABLES FROM %I', client_role);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA app REVOKE ALL ON SEQUENCES FROM %I', client_role);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA app REVOKE ALL ON FUNCTIONS FROM %I', client_role);
      RAISE NOTICE 'revoked all privileges on schema app from platform role %', client_role;
    END IF;
  END LOOP;
END
$$;

COMMENT ON ROLE app_owner       IS 'Owns the app schema and its objects. No login.';
COMMENT ON ROLE app_migrator    IS 'Migration authority. Member of app_owner. Not a runtime identity.';
COMMENT ON ROLE app_api         IS 'API/worker runtime identity. USAGE only; no default privileges (Amendment 001 I12).';
COMMENT ON ROLE app_provisioner IS 'Operator-only genesis authority. USAGE only; no standing tenant-content read.';
