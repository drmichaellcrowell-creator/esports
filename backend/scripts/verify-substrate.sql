-- =============================================================================
-- Phase 0B substrate verification — READ ONLY.
--
-- Run in the Supabase SQL Editor. Returns one row per check.
--
-- RUNS IN ANY STATE. This query must never abort, whatever has or has not been
-- applied yet — an empty database, 0000 only, a subset of roles, roles without
-- the ledger, or a complete substrate. Missing pieces are reported as FAIL rows.
--
-- Achieving that is not automatic, because several catalog functions RAISE
-- rather than return NULL when their argument is absent:
--
--   pg_has_role(role, role, text)          raises 42704 if EITHER role is absent
--   has_schema_privilege(role, schema, ..) raises if the role OR the schema is absent
--
-- Every such call therefore sits behind a CASE guard fed by the role_present and
-- schema_present CTEs below. CASE does short-circuit these (they are STABLE, so
-- they are not constant-folded at plan time), which is what makes the guards
-- effective rather than decorative.
--
-- Two further hazards, both handled:
--   * PostgreSQL resolves relation names at PARSE time, so the migration ledger
--     cannot be referenced directly while it may not exist. It is read through
--     query_to_xml, whose argument is a string evaluated at run time.
--   * to_regclass / to_regnamespace / pg_get_userbyid are safe: they return
--     NULL or a placeholder rather than raising.
--
-- OUTPUT SAFETY: the result cannot carry a secret.
--   * It never reads pg_authid, the only catalog holding password verifiers.
--   * It never selects rolpassword, a connection string, or any key.
--   * From authenticator's rolconfig it extracts only the pgrst.db_schemas
--     entry, not the whole settings array.
--   * Every value returned is a schema name, role name, boolean, count,
--     version string or literal. Safe to paste into a review.
--
-- It reads catalogs only and writes nothing.
-- =============================================================================
WITH environment AS (
  SELECT current_user AS who,
         COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false) AS is_superuser,
         COALESCE((SELECT rolcreaterole FROM pg_roles WHERE rolname = current_user), false) AS can_create_role,
         current_setting('server_version') AS pg_version
),
-- Presence of every role this query names. Guards every pg_has_role and
-- has_schema_privilege call so neither can raise.
role_present(name, present) AS (
  SELECT v.name, EXISTS (SELECT 1 FROM pg_roles p WHERE p.rolname = v.name)
    FROM (VALUES ('app_owner'), ('app_migrator'), ('app_api'), ('app_provisioner'),
                 ('anon'), ('authenticated'), ('service_role'), ('authenticator')) AS v(name)
),
schema_present AS (
  SELECT to_regnamespace('app') IS NOT NULL AS present
),
expected_roles(rolname, want_login, want_inherit, ord) AS (
  VALUES ('app_owner', false, false, 1),
         ('app_migrator', true, true, 2),
         ('app_api', true, false, 3),
         ('app_provisioner', true, false, 4)
),
separation(grantee, target) AS (
  VALUES ('app_api', 'app_provisioner'), ('app_provisioner', 'app_api'),
         ('app_api', 'app_owner'), ('app_provisioner', 'app_owner'),
         ('app_api', 'app_migrator')
),
checks AS (

  -- 0. environment context: role name and capability only, never a credential.
  SELECT 0 AS seq, 'context: migrating role and server' AS check_name,
         CASE WHEN can_create_role OR is_superuser THEN 'PASS' ELSE 'FAIL' END AS status,
         'role=' || who || ' superuser=' || is_superuser
           || ' createrole=' || can_create_role || ' postgres=' || pg_version AS detail
    FROM environment

  -- 1. schema -----------------------------------------------------------
  UNION ALL
  SELECT 1, 'app schema exists',
         CASE WHEN present THEN 'PASS' ELSE 'FAIL' END,
         COALESCE((SELECT 'owner=' || pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'app'),
                  'absent — run 0000_infrastructure.sql')
    FROM schema_present

  UNION ALL
  SELECT 2, 'app schema owned by app_owner',
         CASE WHEN (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'app') = 'app_owner'
              THEN 'PASS' ELSE 'FAIL' END,
         COALESCE((SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'app'),
                  'schema absent — run 0000 then 0001')

  -- 2. roles exist -------------------------------------------------------
  UNION ALL
  SELECT 3, 'all four authorities exist',
         CASE WHEN count(*) FILTER (WHERE rp.present) = 4 THEN 'PASS' ELSE 'FAIL' END,
         count(*) FILTER (WHERE rp.present)::text || ' of 4 present'
           || CASE WHEN count(*) FILTER (WHERE NOT rp.present) > 0
                   THEN ' — missing: ' || string_agg(er.rolname, ', ') FILTER (WHERE NOT rp.present)
                   ELSE '' END
    FROM expected_roles er JOIN role_present rp ON rp.name = er.rolname

  -- 3. role attributes ---------------------------------------------------
  UNION ALL
  SELECT 4, 'role attributes: ' || er.rolname,
         CASE WHEN NOT rp.present THEN 'FAIL'
              WHEN r.rolsuper OR r.rolcreatedb OR r.rolcreaterole
                OR r.rolbypassrls OR r.rolreplication THEN 'FAIL'
              WHEN r.rolcanlogin <> er.want_login THEN 'FAIL'
              WHEN r.rolinherit  <> er.want_inherit THEN 'FAIL'
              ELSE 'PASS' END,
         CASE WHEN NOT rp.present THEN 'role does not exist — run 0001_database_roles.sql'
              ELSE 'login=' || r.rolcanlogin || ' inherit=' || r.rolinherit
                || ' super=' || r.rolsuper || ' createdb=' || r.rolcreatedb
                || ' createrole=' || r.rolcreaterole || ' bypassrls=' || r.rolbypassrls
                || ' replication=' || r.rolreplication END
    FROM expected_roles er
    JOIN role_present rp ON rp.name = er.rolname
    LEFT JOIN pg_roles r ON r.rolname = er.rolname

  -- 4. memberships -------------------------------------------------------
  UNION ALL
  SELECT 5, 'membership: app_migrator is a member of app_owner',
         CASE WHEN NOT mg.present OR NOT ow.present THEN 'FAIL'
              WHEN pg_has_role('app_migrator', 'app_owner', 'MEMBER') THEN 'PASS'
              ELSE 'FAIL' END,
         CASE WHEN NOT mg.present OR NOT ow.present THEN 'role(s) do not exist yet'
              WHEN pg_has_role('app_migrator', 'app_owner', 'MEMBER')
              THEN 'required so migrated objects are owned by app_owner'
              ELSE 'MEMBERSHIP MISSING — migrated objects would not be owned by app_owner' END
    FROM role_present mg, role_present ow
   WHERE mg.name = 'app_migrator' AND ow.name = 'app_owner'

  UNION ALL
  SELECT 6, 'separation: ' || s.grantee || ' is NOT a member of ' || s.target,
         CASE WHEN NOT g.present OR NOT t.present THEN 'FAIL'
              WHEN pg_has_role(s.grantee, s.target, 'MEMBER') THEN 'FAIL'
              ELSE 'PASS' END,
         CASE WHEN NOT g.present THEN s.grantee || ' does not exist yet'
              WHEN NOT t.present THEN s.target || ' does not exist yet'
              WHEN pg_has_role(s.grantee, s.target, 'MEMBER')
              THEN 'MEMBERSHIP PRESENT — authorities are not separated'
              ELSE 'no membership' END
    FROM separation s
    JOIN role_present g ON g.name = s.grantee
    JOIN role_present t ON t.name = s.target

  -- 5. runtime schema privileges ----------------------------------------
  UNION ALL
  SELECT 7, 'schema privilege: ' || t.name || ' has USAGE, not CREATE',
         CASE WHEN NOT sp.present OR NOT t.present THEN 'FAIL'
              WHEN has_schema_privilege(t.name, 'app', 'USAGE')
               AND NOT has_schema_privilege(t.name, 'app', 'CREATE') THEN 'PASS'
              ELSE 'FAIL' END,
         CASE WHEN NOT sp.present THEN 'schema app does not exist yet'
              WHEN NOT t.present THEN 'role does not exist yet'
              ELSE 'usage=' || has_schema_privilege(t.name, 'app', 'USAGE')
                || ' create=' || has_schema_privilege(t.name, 'app', 'CREATE') END
    FROM role_present t, schema_present sp
   WHERE t.name IN ('app_api', 'app_provisioner')

  -- 6. Option B: client-facing roles have nothing -----------------------
  -- A role or schema that does not exist cannot grant access, so absence is a
  -- genuine PASS here rather than an unknown.
  UNION ALL
  SELECT 8, 'Option B: ' || c.name || ' has no access to app',
         CASE WHEN NOT sp.present OR NOT c.present THEN 'PASS'
              WHEN has_schema_privilege(c.name, 'app', 'USAGE')
                OR has_schema_privilege(c.name, 'app', 'CREATE') THEN 'FAIL'
              ELSE 'PASS' END,
         CASE WHEN NOT sp.present THEN 'schema app does not exist'
              WHEN NOT c.present THEN 'role does not exist here'
              ELSE 'usage=' || has_schema_privilege(c.name, 'app', 'USAGE')
                || ' create=' || has_schema_privilege(c.name, 'app', 'CREATE') END
    FROM role_present c, schema_present sp
   WHERE c.name IN ('anon', 'authenticated', 'service_role', 'authenticator')

  UNION ALL
  SELECT 9, 'Option B: PUBLIC has no privilege on app',
         CASE WHEN NOT sp.present THEN 'FAIL'
              WHEN COALESCE((SELECT array_to_string(nspacl, ',') FROM pg_namespace WHERE nspname = 'app'), '') ~ '(^|,)='
              THEN 'FAIL' ELSE 'PASS' END,
         COALESCE((SELECT 'schema acl entries: ' || COALESCE(array_length(nspacl, 1), 0)::text
                     FROM pg_namespace WHERE nspname = 'app'), 'schema absent')
    FROM schema_present sp

  -- 7. default privileges ------------------------------------------------
  UNION ALL
  SELECT 10, 'no default privilege grants access in app',
         CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
         count(*)::text || ' offending default grant(s)'
    FROM pg_default_acl d
    JOIN pg_namespace n ON n.oid = d.defaclnamespace
    CROSS JOIN LATERAL unnest(d.defaclacl) AS acl
   WHERE n.nspname = 'app'
     AND split_part(acl::text, '=', 1) IN
         ('', 'anon', 'authenticated', 'service_role', 'authenticator', 'app_api', 'app_provisioner')

  -- 8. Data API exposure (project setting, readable from SQL) ------------
  UNION ALL
  SELECT 11, 'Option B: Data API does not expose app',
         CASE WHEN COALESCE(s.value, '') ~ '(^|,)\s*app\s*(,|$)' THEN 'FAIL' ELSE 'PASS' END,
         COALESCE('exposed schemas: ' || s.value, 'no authenticator/pgrst setting — no Data API here')
    FROM (SELECT 1) AS one
    LEFT JOIN LATERAL (
      SELECT substring(cfg from 'pgrst[.]db_schemas=(.*)') AS value
        FROM pg_roles r, unnest(COALESCE(r.rolconfig, ARRAY[]::text[])) AS cfg
       WHERE r.rolname = 'authenticator' AND cfg LIKE 'pgrst.db_schemas=%'
       LIMIT 1
    ) AS s ON true

  -- 9. gate scope: no Layer 0 domain table ------------------------------
  UNION ALL
  SELECT 12, 'no Layer 0 domain table exists',
         CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
         CASE WHEN count(*) = 0 THEN 'none found' ELSE string_agg(tablename, ', ') END
    FROM pg_tables
   WHERE schemaname = 'app'
     AND tablename IN ('organization', 'membership', 'role_assignment', 'coach_scope_assignment',
                       'captain_assignment', 'authorization_policy_version', 'audit_log_event', 'outbox_event')

  UNION ALL
  SELECT 13, 'app schema contains no table at all',
         CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
         count(*)::text || ' table(s)'
    FROM pg_tables WHERE schemaname = 'app'

  UNION ALL
  SELECT 14, 'no application table in public',
         CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
         count(*)::text || ' table(s)'
    FROM pg_tables WHERE schemaname = 'public'

  -- 10. migration ledger -------------------------------------------------
  -- Read through query_to_xml: a direct reference would fail at PARSE time when
  -- the table does not exist, taking the whole report down.
  UNION ALL
  SELECT 15, 'migration ledger records both migrations',
         CASE WHEN l.n = 2 THEN 'PASS' ELSE 'FAIL' END,
         CASE WHEN l.n IS NULL
              THEN 'ledger table does not exist — run register-manual-migration.sql'
              ELSE l.n::text || ' of 2 recorded' END
    FROM (SELECT CASE WHEN to_regclass('migrations.applied_migration') IS NULL THEN NULL ELSE
            (xpath('/row/c/text()', (query_to_xml(
              'SELECT count(*) AS c FROM migrations.applied_migration WHERE name IN '
              '(''0000_infrastructure.sql'', ''0001_database_roles.sql'')',
              false, true, ''))))[1]::text::int END AS n) AS l

  UNION ALL
  SELECT 16, 'ledger checksums match the committed files',
         CASE WHEN c.n = 2 THEN 'PASS' ELSE 'FAIL' END,
         CASE WHEN c.n IS NULL THEN 'ledger table does not exist'
              ELSE c.n::text || ' of 2 checksums match' END
    FROM (SELECT CASE WHEN to_regclass('migrations.applied_migration') IS NULL THEN NULL ELSE
            (xpath('/row/c/text()', (query_to_xml(
              'SELECT count(*) AS c FROM migrations.applied_migration WHERE (name, checksum) IN ('
              '(''0000_infrastructure.sql'', ''e0340940358d1c62959e85888d7a89eb7531bf917cb6798ebbaa67ca48c941ec''),'
              '(''0001_database_roles.sql'', ''75723d88d756266355f646caee2dcb25cf4a7125dc9a4365cfc1a70f16109002''))',
              false, true, ''))))[1]::text::int END AS n) AS c
)
SELECT status, check_name, detail FROM checks ORDER BY seq, check_name;
