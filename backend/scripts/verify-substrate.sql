-- =============================================================================
-- Phase 0B substrate verification — READ ONLY.
--
-- Run in the Supabase SQL Editor. Returns one row per check.
--
-- OUTPUT SAFETY: this query is written so its result cannot carry a secret.
--   * It never reads pg_authid, the only catalog holding password verifiers.
--   * It never selects rolpassword, any connection string, or any key.
--   * From authenticator's rolconfig it extracts the single pgrst.db_schemas
--     entry rather than the whole settings array.
--   * Every value returned is a schema name, role name, boolean, count or
--     literal. The result is safe to paste into a review.
--
-- It reads catalogs only and writes nothing.
-- =============================================================================
WITH environment AS (
  SELECT current_user AS who,
         (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS is_superuser,
         (SELECT rolcreaterole FROM pg_roles WHERE rolname = current_user) AS can_create_role,
         current_setting('server_version') AS pg_version
),
expected_roles(rolname, want_login, want_inherit) AS (
  VALUES ('app_owner', false, false),
         ('app_migrator', true, true),
         ('app_api', true, false),
         ('app_provisioner', true, false)
),
checks AS (

  -- 0. environment context (no credential: role name and capability only) ----
  SELECT 0 AS seq, 'context: migrating role and server' AS check_name,
         CASE WHEN can_create_role THEN 'PASS' ELSE 'FAIL' END AS status,
         'role=' || who || ' superuser=' || is_superuser
           || ' createrole=' || can_create_role || ' postgres=' || pg_version AS detail
    FROM environment

  UNION ALL
  -- 1. schema ------------------------------------------------------------
  SELECT 1 AS seq, 'app schema exists' AS check_name,
         CASE WHEN to_regnamespace('app') IS NULL THEN 'FAIL' ELSE 'PASS' END AS status,
         COALESCE((SELECT 'owner=' || pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'app'),
                  'absent — run 0000_infrastructure.sql') AS detail

  UNION ALL
  SELECT 2, 'app schema owned by app_owner',
         CASE WHEN (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'app') = 'app_owner'
              THEN 'PASS' ELSE 'FAIL' END,
         COALESCE((SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'app'), 'schema absent')

  -- 2. roles exist -------------------------------------------------------
  UNION ALL
  SELECT 3, 'all four authorities exist',
         CASE WHEN count(*) = 4 THEN 'PASS' ELSE 'FAIL' END,
         count(*)::text || ' of 4 present'
    FROM pg_roles r JOIN expected_roles e ON e.rolname = r.rolname

  -- 3. role attributes ---------------------------------------------------
  UNION ALL
  SELECT 4, 'role attributes: ' || e.rolname,
         CASE WHEN r.rolname IS NULL THEN 'FAIL'
              WHEN r.rolsuper OR r.rolcreatedb OR r.rolcreaterole
                OR r.rolbypassrls OR r.rolreplication THEN 'FAIL'
              WHEN r.rolcanlogin <> e.want_login THEN 'FAIL'
              WHEN r.rolinherit  <> e.want_inherit THEN 'FAIL'
              ELSE 'PASS' END,
         CASE WHEN r.rolname IS NULL THEN 'role missing'
              ELSE 'login=' || r.rolcanlogin || ' inherit=' || r.rolinherit
                || ' super=' || r.rolsuper || ' createdb=' || r.rolcreatedb
                || ' createrole=' || r.rolcreaterole || ' bypassrls=' || r.rolbypassrls
                || ' replication=' || r.rolreplication END
    FROM expected_roles e LEFT JOIN pg_roles r ON r.rolname = e.rolname

  -- 4. memberships -------------------------------------------------------
  UNION ALL
  SELECT 5, 'membership: app_migrator is a member of app_owner',
         CASE WHEN pg_has_role('app_migrator', 'app_owner', 'MEMBER') THEN 'PASS' ELSE 'FAIL' END,
         'required so migrated objects are owned by app_owner'

  UNION ALL
  SELECT 6, 'separation: ' || m.grantee || ' is NOT a member of ' || m.target,
         CASE WHEN pg_has_role(m.grantee, m.target, 'MEMBER') THEN 'FAIL' ELSE 'PASS' END,
         CASE WHEN pg_has_role(m.grantee, m.target, 'MEMBER')
              THEN 'MEMBERSHIP PRESENT — authorities are not separated'
              ELSE 'no membership' END
    FROM (VALUES ('app_api','app_provisioner'), ('app_provisioner','app_api'),
                 ('app_api','app_owner'), ('app_provisioner','app_owner'),
                 ('app_api','app_migrator')) AS m(grantee, target)

  -- 5. runtime schema privileges ----------------------------------------
  UNION ALL
  SELECT 7, 'schema privilege: ' || t.rolname || ' has USAGE, not CREATE',
         CASE WHEN to_regnamespace('app') IS NULL THEN 'FAIL'
              WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = t.rolname) THEN 'FAIL'
              WHEN has_schema_privilege(t.rolname,'app','USAGE')
               AND NOT has_schema_privilege(t.rolname,'app','CREATE') THEN 'PASS' ELSE 'FAIL' END,
         CASE WHEN to_regnamespace('app') IS NULL THEN 'schema app does not exist'
              WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = t.rolname) THEN 'role does not exist'
              ELSE 'usage=' || has_schema_privilege(t.rolname,'app','USAGE')
                || ' create=' || has_schema_privilege(t.rolname,'app','CREATE') END
    FROM (VALUES ('app_api'), ('app_provisioner')) AS t(rolname)

  -- 6. Option B: client-facing roles have nothing -----------------------
  UNION ALL
  SELECT 8, 'Option B: ' || c.rolname || ' has no access to app',
         CASE WHEN to_regnamespace('app') IS NULL THEN 'PASS'
              WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = c.rolname) THEN 'PASS'
              WHEN has_schema_privilege(c.rolname,'app','USAGE')
                OR has_schema_privilege(c.rolname,'app','CREATE') THEN 'FAIL'
              ELSE 'PASS' END,
         CASE WHEN to_regnamespace('app') IS NULL THEN 'schema app does not exist'
              WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = c.rolname)
              THEN 'role does not exist here'
              ELSE 'usage=' || has_schema_privilege(c.rolname,'app','USAGE')
                || ' create=' || has_schema_privilege(c.rolname,'app','CREATE') END
    FROM (VALUES ('anon'), ('authenticated'), ('service_role'), ('authenticator')) AS c(rolname)

  UNION ALL
  SELECT 9, 'Option B: PUBLIC has no privilege on app',
         CASE WHEN to_regnamespace('app') IS NULL THEN 'FAIL'
              WHEN COALESCE((SELECT array_to_string(nspacl, ',') FROM pg_namespace WHERE nspname='app'), '') ~ '(^|,)='
              THEN 'FAIL' ELSE 'PASS' END,
         COALESCE('schema acl entries: ' ||
           (SELECT COALESCE(array_length(nspacl, 1), 0)::text FROM pg_namespace WHERE nspname='app'),
           'schema absent')

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
     AND tablename IN ('organization','membership','role_assignment','coach_scope_assignment',
                       'captain_assignment','authorization_policy_version','audit_log_event','outbox_event')

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
  -- The ledger table may not exist yet. A plain reference would fail at PARSE
  -- time, taking the whole report down, so it is read through query_to_xml:
  -- the relation name is a string evaluated at run time, and the CASE guard
  -- short-circuits when to_regclass finds nothing. Still strictly read-only.
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
