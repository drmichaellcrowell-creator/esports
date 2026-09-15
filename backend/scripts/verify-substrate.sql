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
WITH expected_roles(rolname, want_login, want_inherit) AS (
  VALUES ('app_owner', false, false),
         ('app_migrator', true, true),
         ('app_api', true, false),
         ('app_provisioner', true, false)
),
checks AS (

  -- 1. schema ------------------------------------------------------------
  SELECT 1 AS seq, 'app schema exists' AS check_name,
         CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END AS status,
         COALESCE(max(pg_get_userbyid(nspowner)), 'absent') AS detail
    FROM pg_namespace WHERE nspname = 'app'

  UNION ALL
  SELECT 2, 'app schema owned by app_owner',
         CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END,
         COALESCE(max(pg_get_userbyid(nspowner)), 'n/a')
    FROM pg_namespace WHERE nspname = 'app' AND pg_get_userbyid(nspowner) = 'app_owner'

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
         CASE WHEN has_schema_privilege(t.rolname,'app','USAGE')
               AND NOT has_schema_privilege(t.rolname,'app','CREATE') THEN 'PASS' ELSE 'FAIL' END,
         'usage=' || has_schema_privilege(t.rolname,'app','USAGE')
           || ' create=' || has_schema_privilege(t.rolname,'app','CREATE')
    FROM (VALUES ('app_api'), ('app_provisioner')) AS t(rolname)

  -- 6. Option B: client-facing roles have nothing -----------------------
  UNION ALL
  SELECT 8, 'Option B: ' || c.rolname || ' has no access to app',
         CASE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = c.rolname) THEN 'PASS'
              WHEN has_schema_privilege(c.rolname,'app','USAGE')
                OR has_schema_privilege(c.rolname,'app','CREATE') THEN 'FAIL'
              ELSE 'PASS' END,
         CASE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = c.rolname)
              THEN 'role does not exist here'
              ELSE 'usage=' || has_schema_privilege(c.rolname,'app','USAGE')
                || ' create=' || has_schema_privilege(c.rolname,'app','CREATE') END
    FROM (VALUES ('anon'), ('authenticated'), ('service_role'), ('authenticator')) AS c(rolname)

  UNION ALL
  SELECT 9, 'Option B: PUBLIC has no privilege on app',
         CASE WHEN COALESCE(array_to_string(nspacl, ','), '') ~ '(^|,)=' THEN 'FAIL' ELSE 'PASS' END,
         'schema acl entries: ' || COALESCE(array_length(nspacl, 1), 0)::text
    FROM pg_namespace WHERE nspname = 'app'

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
  UNION ALL
  SELECT 15, 'migration ledger records both migrations',
         CASE WHEN count(*) = 2 THEN 'PASS' ELSE 'FAIL' END,
         COALESCE(string_agg(name, ', ' ORDER BY name), 'ledger empty or missing')
    FROM migrations.applied_migration
   WHERE name IN ('0000_infrastructure.sql', '0001_database_roles.sql')

  UNION ALL
  SELECT 16, 'ledger checksums match the committed files',
         CASE WHEN count(*) = 2 THEN 'PASS' ELSE 'FAIL' END,
         count(*)::text || ' of 2 checksums match'
    FROM migrations.applied_migration
   WHERE (name, checksum) IN (
           ('0000_infrastructure.sql', 'e0340940358d1c62959e85888d7a89eb7531bf917cb6798ebbaa67ca48c941ec'),
           ('0001_database_roles.sql', 'f94fd43ecef9436a421ccbf0ca22a5546ab3fa6c710e9ee61f245583b7ac36db'))
)
SELECT status, check_name, detail FROM checks ORDER BY seq, check_name;
