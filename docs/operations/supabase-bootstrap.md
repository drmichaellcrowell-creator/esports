# Supabase bootstrap — Phase 0B

Operational runbook for the `esports-platform` project. This is not architecture;
the canonical contract is unaffected by anything here.

**No secret in this document, in Git, in `.base44/`, or in the frontend.** Values
live only in ignored local `.env` files and, later, in deployment/CI secret stores.

---

## 1. The four database authorities

Migration `0001_database_roles.sql` creates four roles. They exist because the
contract requires the separation, not for convenience.

| Role | Login | Purpose | Privileges after Phase 0B |
|---|---|---|---|
| `app_owner` | no | Owns the `app` schema and every object in it | `USAGE`, `CREATE` on `app` |
| `app_migrator` | yes | Applies migrations; member of `app_owner` | `USAGE`, `CREATE` on `app` |
| `app_api` | yes | API and worker runtime identity | `USAGE` on `app` only |
| `app_provisioner` | yes | Operator-only genesis authority (Phase 0C) | `USAGE` on `app` only |

### Working within a managed platform's privileges

A managed platform grants the project owner `CREATEROLE` but **not** `SUPERUSER`,
and PostgreSQL refuses to let a non-superuser set the `SUPERUSER`, `REPLICATION`
or `BYPASSRLS` attributes at all — even to turn them *off*. Migration `0001`
therefore **asserts** those three rather than setting them, raising an exception
that names the offending role if any of ours carries one.

That is not a concession. A bare `CREATE ROLE` already yields all three as false,
so the desired state is reached either way; and asserting is strictly stronger
than setting, because setting would silently normalise a role that had been
elevated elsewhere, whereas asserting stops the migration and reports it.

Two further operations need the migrating role to be able to `SET ROLE` to
`app_owner`: transferring schema ownership, and declaring default privileges
`FOR ROLE app_owner`. On PostgreSQL 16+ membership alone is not enough —
`CREATEROLE`'s automatic grant carries `ADMIN` but not `SET`, and ownership
transfer fails with *"must be able to SET ROLE"*. The migration issues
`GRANT app_owner TO <current_user> WITH SET TRUE`, falling back to a plain grant
on older servers and skipping it entirely for a superuser.

**Neither `app_api` nor `app_provisioner` holds any default privilege.** That
absence is the mechanism. A table created later grants them nothing until a
migration says so explicitly, which is what makes Amendment 001 invariant I12 —
the API must never be able to perform tenant or policy genesis — a property of
what must be *written down* rather than of what must be *remembered*.

Owning objects as `app_owner` rather than as the platform's `postgres` role also
isolates the schema from any platform-configured default privileges.

### Authority vs identity

Four distinct things, easily conflated:

- **Migration authority** (`app_migrator`, and the project owner for `0001`) —
  changes schema. Never serves traffic.
- **API authority** (`app_api`) — serves traffic. Cannot create anything.
- **Provisioner authority** (`app_provisioner`) — genesis only, operator-invoked,
  exhausted at commit. Never serves traffic.
- **Supabase Auth identity** — *not a database authority at all.* It answers
  "which verified person is this?" The application's own Membership and
  RoleAssignment answer "may they do this?" The `role` and `app_metadata` claims
  are never consulted (Global Invariant 5).

---

## 2. Connection model — session mode, not transaction mode

| Purpose | Endpoint | Port | Username |
|---|---|---|---|
| Migrations | Session pooler | 5432 | `app_migrator.<project-ref>` (project owner for `0001`) |
| API | Session pooler | 5432 | `app_api.<project-ref>` |
| Worker | Session pooler | 5432 | `app_api.<project-ref>` |
| Provisioner (Phase 0C) | Session pooler | 5432 | `app_provisioner.<project-ref>` |

Pooled usernames carry the project reference after a dot. Custom roles connect
the same way the default role does.

**Transaction mode (port 6543) is not usable here.** It does not support prepared
statements, and session state — `SET`/`RESET`, advisory locks, `LISTEN`/`NOTIFY`,
temporary tables — is lost between transactions. The Outbox claim pattern holds a
transaction across `SELECT … FOR UPDATE SKIP LOCKED` and its follow-up writes, and
Amendment 001's zero-administrator guard takes a per-organization row lock. Both
need the session semantics that transaction mode discards. This is why the
platform's default recommendation for serverless workloads is the wrong default
for us: our processes are long-lived, not per-request.

**Direct connection is not usable on the Free plan.** It is IPv6-only there,
while the shared pooler is IPv4 on every plan. Session mode gives us full
PostgreSQL session semantics *and* IPv4 reachability.

Verify the choice rather than trusting it: `npm run verify:substrate` proves
commit, rollback and concurrent `FOR UPDATE SKIP LOCKED` **through the endpoint
actually configured**, and fails if the connection is multiplexing.

---

## 3. One-time setup

Each step says whether it is database state (in Git, applied by migration) or a
project setting (dashboard only — code cannot enforce it).

### 3.1 Bootstrap migration — database state

Migration `0001` creates roles, so it needs an authority that can `CREATE ROLE`.
The project owner credential has it; `app_api` does not and never will.

1. In the dashboard, open **Connect** (top bar) → **Session pooler** and copy the
   connection string. Note the port is **5432**, not 6543.
2. Put it in `backend/.env` as `DATABASE_URL`, with the project owner's database
   password substituted for the placeholder. Leave `MIGRATION_DATABASE_URL`
   unset for this one run — `npm run migrate` will fall back and log that it is
   doing so, which is correct for bootstrap and wrong afterwards.
3. Run:

   ```bash
   cd backend && npm run migrate
   ```

`backend/.env` is git-ignored. The password is never echoed: the migrate
entrypoint logs the database *role*, not the connection string.

### 3.2 Issue role credentials — database state, secret out of band

Migration `0001` deliberately sets no password. A `LOGIN` role without one cannot
authenticate, so the roles fail closed until you issue a credential.

Generate three strong passwords locally (for example
`openssl rand -base64 24`), then in the dashboard **SQL Editor** run:

```sql
ALTER ROLE app_api         PASSWORD '<generated-1>';
ALTER ROLE app_migrator    PASSWORD '<generated-2>';
ALTER ROLE app_provisioner PASSWORD '<generated-3>';
```

Do not save these as a named SQL snippet, and do not paste them anywhere else.

### 3.3 Switch to least privilege — local configuration

Rewrite `backend/.env` so each authority is used for its own purpose:

| Variable | Connect as |
|---|---|
| `DATABASE_URL` | `app_api.<project-ref>` |
| `MIGRATION_DATABASE_URL` | `app_migrator.<project-ref>` |
| `PROVISIONER_DATABASE_URL` | `app_provisioner.<project-ref>` |
| `WORKER_DATABASE_URL` | optional; defaults to `DATABASE_URL` |

Startup refuses a `DATABASE_URL` that connects as `app_provisioner`,
`app_migrator` or `app_owner`, and refuses any two of these being identical, so a
mistake here fails immediately rather than quietly running the API with genesis
authority.

### 3.4 JWT signing keys — ALREADY SATISFIED for `esports-platform`

The backend verifies tokens against the public JWKS endpoint and accepts
**RS256 and ES256 only**, rejecting `alg: none` and HS256. A project still using
the legacy shared secret publishes no keys there, so every token would be
rejected — correct fail-closed behaviour, but nothing would work.

**Verified against the live project: asymmetric signing is already active.** The
JWKS endpoint publishes one `ES256` P-256 key with `use: sig`, `key_ops:
["verify"]` and no private material. **No key migration or rotation is
required**, and none should be performed.

Check at any time, with no credential:

```bash
cd backend && npm run verify:auth
```

Should a future project ever still be on the legacy secret, the migration path is
**Settings → JWT** → **Migrate JWT secret** → **Rotate keys**, leaving the legacy
secret in "previously used" until existing tokens expire. Nothing in this backend
depends on that secret.

### 3.5 Data API exposure — project setting, verifiable from SQL

**Settings → API → Exposed schemas.** Confirm `app` is **not** listed. It should
not be by default; the point is to confirm, and to keep it that way.

This is a project setting, but PostgREST reads it from the `authenticator` role,
so `npm run verify:substrate` checks it and fails if `app` appears. Removing
`public` as well is reasonable hardening — nothing in this application uses the
auto-generated Data API — but it is optional.

### 3.6 Auth providers — project setting

Email/password is enabled by default and is sufficient for development. Google
Workspace and Microsoft Entra SSO remain a deployment decision; nothing in the
contract requires either now.

**No service-role key is needed, and none should be configured.** Verification
uses public keys; database access uses the PostgreSQL roles above. A service-role
key bypasses row-level security and would be a standing credential with no
purpose here.

---

## 3b. Dashboard-only bootstrap (no Node, no local tooling)

The whole of 3.1–3.3 can be done in the Supabase SQL Editor instead, using the
committed migration files unchanged. Two things make that safe rather than a
divergence:

**The migration files are safe to run by hand.** Both are idempotent — guarded
role creation, `CREATE SCHEMA IF NOT EXISTS`, and `REVOKE`/`ALTER` statements
that assert a state rather than toggle one. Neither touches application data:
`0000` has no data-mutating statement at all, and `0001`'s only `INSERT` is the
ledger row. Re-running either changes nothing.

**The migration ledger must be registered afterwards.** The runner records each
applied file in `migrations.applied_migration` with a SHA-256 of its contents.
Applying the SQL by hand leaves that ledger empty, so a later `npm run migrate`
would treat both as pending. They would re-apply harmlessly, but the ledger would
be misrepresenting the database — exactly the drift the checksum mechanism
exists to catch. `scripts/register-manual-migration.sql` inserts the two rows
with the canonical checksums and closes that gap.

Verified end to end against a real PostgreSQL: after applying both files by hand
and registering the ledger, `npm run migrate` reports `count: 0`, "no new
migrations". Migration history is preserved exactly.

Order, each as its own SQL Editor query:

1. paste `backend/migrations/0000_infrastructure.sql`
2. paste `backend/migrations/0001_database_roles.sql`
3. paste `backend/scripts/register-manual-migration.sql`
4. paste `backend/scripts/verify-substrate.sql` — read-only, returns one row per
   check

`verify-substrate.sql` can be run at any point, including before anything else
has been applied: it reports missing pieces as `FAIL` rows rather than failing.
Two details make that work, and both are easy to get wrong. PostgreSQL resolves
relation names at *parse* time, so the migration-ledger checks read that table
through `query_to_xml` behind a `to_regclass` guard rather than referencing it
directly. And `has_schema_privilege()` *raises* when the schema is absent instead
of returning NULL, so every call sits behind a `to_regnamespace` guard. Its first
row reports the connected role, whether it is a superuser, whether it holds
`CREATEROLE`, and the server version — which is what diagnoses a privilege
failure.

`verify-substrate.sql` reads only `pg_namespace`, `pg_roles`, `pg_tables`,
`pg_default_acl`, `pg_has_role` and `pg_get_userbyid`. It never reads `pg_authid`,
the only catalog holding password verifiers, and every value it returns is a role
name, schema name, boolean, count or literal — so its output is safe to share.
Its failure detection is tested: an unregistered ledger, `app` exposed to the
Data API, `anon` granted USAGE, a Layer 0 table, a cross-membership between
`app_api` and `app_provisioner`, and `app_api` granted CREATE are each detected.

### What this path defers

Two checks genuinely require connecting **as `app_api` through the session
pooler**, and cannot be done from the SQL Editor, which connects as the project
owner: transaction commit/rollback, and `FOR UPDATE SKIP LOCKED` under
concurrency. The structural posture those checks depend on is fully verified by
the SQL above; what remains unproven is that the configured *endpoint* behaves
correctly.

Defer them to the first environment that holds the `app_api` credential in a
secret store — CI or a deployment host — by running `npm run verify:substrate`
there. The tradeoff is explicit: Phase 0B's structure is proven now, and the
endpoint behaviour is proven when there is somewhere legitimate to keep the
credential. CI already proves the same code path against a disposable database on
every run, so what is outstanding is specifically the pooler's behaviour, not the
logic.

## 4. Where the bootstrap can be run from

**A Claude Code cloud session cannot reach the database.** Its egress goes
through an HTTPS proxy: port 443 to the pooler host is reachable, port 5432 is
not. This is a property of the sandbox, not of the project or the credential —
supplying the password would not change it. Measured from a session:

| Target | Result |
|---|---|
| `aws-0-us-east-1.pooler.supabase.com:443` | open |
| `aws-0-us-east-1.pooler.supabase.com:5432` | blocked |
| `db.<project-ref>.supabase.co:5432` | blocked |
| `https://<project-ref>.supabase.co` | reachable |

So steps 3.1 to 3.3 run from a machine with ordinary outbound access — a
developer laptop, a CI runner, or a deployment host. Everything over HTTPS,
including `npm run verify:auth`, runs anywhere.

`npm run verify:substrate` prints role names, privileges and outcomes and never
prints a connection string, so its output can be shared or pasted into a review
safely.

## 5. Verification

```bash
cd backend && npm run verify:substrate
```

`verify:substrate` checks the schema and its owner, all four roles and their attributes, that the
API and provisioner cannot reach each other's authority, that no client-facing
role or `PUBLIC` can touch `app`, that no default privilege grants access, that
the Data API does not expose `app`, that transactions commit and roll back and
that `FOR UPDATE SKIP LOCKED` works through the configured endpoint — and that no
Layer 0 table exists.

It prints role names and outcomes. It never prints a connection string.

The probe schema it creates is dropped before it returns, and the final check
confirms nothing was left behind.

---

## 6. What is not done yet

Phase 0B establishes the substrate only. Still absent, by design:

- Every Layer 0 domain table — Organization, Membership, RoleAssignment,
  CoachScopeAssignment, CaptainAssignment, AuthorizationPolicyVersion,
  AuditLogEvent, OutboxEvent.
- `policy.bootstrap`, `policy.activate`, `organization.provision`.
- The centralized authorization resolver, which still throws.
- Any table-level grant to `app_api` or `app_provisioner` — each will be written
  explicitly alongside the table it concerns.

---

## Bootstrap record — `esports-platform`, completed

The dashboard-only path was executed against the real project and verified.

| Step | Outcome |
|---|---|
| `0000_infrastructure.sql` | applied |
| `0001_database_roles.sql` (original) | **failed and rolled back**; 0 of 4 roles present afterwards |
| `0001_database_roles.sql` (corrected) | applied |
| `register-manual-migration.sql` | applied; two ledger records |
| `verify-substrate.sql` | **28 rows, 28 PASS, 0 FAIL** |

Environment as reported by the diagnostic's context row: SQL Editor connects as
`postgres` with `superuser=false`, `createrole=true`, on PostgreSQL 17.6.

### The non-superuser compatibility fix

That context row is the whole story. The project owner holds `CREATEROLE` but not
`SUPERUSER`, and PostgreSQL refuses to let such a role set the `SUPERUSER`,
`REPLICATION` or `BYPASSRLS` attributes at all — even to turn them off. The
original migration set all three explicitly and failed on its first `ALTER ROLE`.

The correction was to stop *setting* those three and start *asserting* them,
raising an exception that names the offending role. A bare `CREATE ROLE` already
yields all three as false, so the intended state is reached either way, and
asserting is the stronger posture: setting would silently normalise a role that
had been elevated elsewhere. Two further operations — transferring schema
ownership and declaring default privileges `FOR ROLE app_owner` — needed
`GRANT app_owner TO <current_user> WITH SET TRUE`, because on PostgreSQL 16+ the
automatic grant that comes with `CREATEROLE` carries `ADMIN` but not `SET`.

The failure was reproduced locally by simulating a `CREATEROLE`-without-`SUPERUSER`
role before the fix was written, and the fix verified under the same simulation.
The one difference between the simulation and the project was the wording of the
error `DETAIL`, which differs between PostgreSQL 16 and 17 for the same check.

### What the 28 passing checks establish

Schema `app` exists and is owned by `app_owner`; all four authorities exist with
the designed attributes; `app_migrator` is a member of `app_owner` while
`app_api` and `app_provisioner` are members of nothing and of each other;
`app_api` and `app_provisioner` hold `USAGE` and not `CREATE`; `PUBLIC`, `anon`,
`authenticated`, `service_role` and `authenticator` hold nothing on `app`; no
default privilege grants access; the Data API does not expose `app`; no Layer 0
domain table exists; `app` and `public` contain no table at all; and the ledger
holds both migrations with checksums matching the committed files.

Supabase Auth was verified separately over HTTPS: the project publishes one
active `ES256` signing key with `use: sig` and no private material, so no JWT
migration or rotation is needed.

---

## Outstanding — two deferred runtime checks

**These are deferred, not complete, and not dropped.**

1. Transaction commit and rollback through the Session pooler **as `app_api`**.
2. `FOR UPDATE SKIP LOCKED` under concurrency through the Session pooler **as
   `app_api`**.

Both require connecting *as `app_api` through the pooler*, which the SQL Editor
cannot do — it connects as the project owner. They are about the behaviour of the
configured **endpoint**, not about the logic: CI proves the identical code path
against a disposable PostgreSQL on every run, and the structural posture they
depend on is fully verified above.

**What closes them:** run `npm run verify:substrate` from the first environment
that legitimately holds the `app_api` credential in a secret store — CI or a
deployment host. The tool already performs both checks and reports them by name.

**Custom role passwords remain unset.** No password has been issued for
`app_api`, `app_migrator` or `app_provisioner`. A `LOGIN` role without a password
cannot authenticate, so the roles currently fail closed, which is the safer
resting state. Issue them at the point of first use: `app_api` when closing the
deferred checks above, `app_provisioner` not until Phase 0C.
