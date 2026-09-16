# Esports Platform — Development Environment

## Overview

School-based esports team-management application. The frontend is an application
shell with role-based navigation (Coach, Player, Administration). The backend is
being implemented from an authoritative architecture contract.

**The canonical architecture is authoritative and is not edited during
implementation work.** See `docs/architecture/implementation-contract.md`,
`docs/architecture/implementation-handoff.md`, and
`docs/architecture/amendments/`. Where the contract is silent, stop and request
an architecture decision rather than inferring one.

## Substrate: Base44 is the active v1, PostgreSQL is the preserved reference

| | |
|---|---|
| **Active v1 substrate** | **Base44** — Auth for identity, entities for persistence, backend functions for controlled operations, access rules denying direct client CRUD, scheduled workflows for reconciliation |
| **Preserved Reference Profile** | **PostgreSQL / Supabase** — merged, CI-covered, dormant. No production workload. See `docs/architecture/reference-profile-status.md` |
| **Hybrid runtime** | **Not authorized.** Exactly one authoritative store for v1 data, and it is Base44. No dual-write, no synchronisation |
| **Canonical contract** | Unchanged, and remains the **full-strength reference** |

**Any Base44 v1 implementation work must follow
`docs/architecture/base44-implementation-profile-v1.md`.** It is the only place
deviations from the canonical contract exist. The profile narrows and never
widens; where it is silent, the contract governs; a deviation not written in its
deviation register does not exist.

Base44 cannot provide multi-record ACID transactions, database-enforced
constraints, or a durable outbox. The profile is how that is contained — through
version-guarded conditional writes, an application-owned resolver, and
reconciliation sweeps as a primary integrity mechanism. Read it before writing
any v1 entity, function, or operation.

## Current state

| Area | State |
|---|---|
| Frontend | Application shell — role-based navigation, placeholder pages, no data access |
| Base44 v1 | Operation adapter boundary established. **No production entity, backend function, workflow, resolver or product operation implemented yet** |
| Backend (Reference Profile) | Phase 0B substrate — API, worker, database and auth boundaries, plus the four database authorities provisioned and verified on the real project (28/28). **No domain model yet.** Two Session-pooler runtime checks remain deferred; see `docs/operations/supabase-bootstrap.md` |
| Layer 0 domain | Not implemented on either substrate. Organization, Membership, RoleAssignment, CoachScopeAssignment, CaptainAssignment, AuthorizationPolicyVersion and AuditLogEvent are the first Base44 v1 work; OutboxEvent is excluded from v1 with the Communication domain |
| Authorization | **Not implemented.** The resolver throws; there is no permissive placeholder, and no protected product route exists |

## Tech stack

**Frontend** — React 18, Vite 6, TypeScript, Tailwind CSS 3, React Router 6, lucide-react.

**Backend** — Node.js 22, TypeScript (strict), Fastify 5, Zod 4, Drizzle ORM,
`pg`, pino, jose. Tests: Vitest with Testcontainers or a PostgreSQL service.

**Data/identity (active v1)** — Base44 entities and Base44 Auth; authentication
and identity only — Base44 roles and claims are never the authorization root.

**Data/identity (preserved Reference Profile)** — Supabase-managed PostgreSQL;
Supabase Auth for authentication and identity only.

## Architectural rules that constrain everyday work

1. **Option B — the browser never touches application tables.** All data reaches
   the frontend through the backend API. Nothing is exposed through PostgREST,
   and RLS is not the authorization mechanism.
2. **Application tables live in the `app` schema, never `public`.**
3. **Authentication is not authorization.** The identity provider — Base44 Auth
   on v1, Supabase Auth on the Reference Profile — establishes *which verified
   identity* this is. Authority comes from application-owned Membership,
   RoleAssignment, CoachScopeAssignment and CaptainAssignment. Provider-native
   role and metadata claims are never consulted.
4. **No permissive placeholder authorization, ever.** If authorization is not
   implemented for an operation, the operation does not exist.
5. **Atomicity is structural.** A domain change, its AuditLogEvent and its
   OutboxEvent rows commit in one transaction. `src/db/transaction.ts` makes
   nested calls join rather than split, and refuses a second connection inside an
   active transaction.
6. **Four database authorities, deliberately separate.** `app_owner` owns the
   `app` schema; `app_migrator` applies migrations; `app_api` is the API/worker
   runtime identity; `app_provisioner` is operator-only genesis authority.
   Startup refuses an API credential that connects as any of the other three,
   and refuses any two of the configured URLs being identical. Nothing under
   `src/api/` may import the provisioner. Neither runtime identity holds a
   default privilege, so a future table grants them nothing until a migration
   says so explicitly — that is what makes Amendment 001 invariant I12
   structural. See `docs/operations/supabase-bootstrap.md`.
7. **Session-mode connections only.** Transaction-mode pooling loses session
   state between transactions and cannot support the Outbox claim pattern.
8. **Base44 is the active v1 substrate** — Auth, entities, backend functions and
   scheduled workflows. Rules 1, 3 and 4 apply to it unchanged: the browser
   never touches governed entities directly, the Base44 role is never the
   authorization root, and there is no permissive placeholder authorization. No
   service-role credential or secret ever reaches the browser bundle or
   `.base44/environment.json` — every `VITE_*` variable is inlined into the
   bundle. Rules 5 and 6 describe the Reference Profile; the Base44 equivalents
   are version-guarded conditional writes plus reconciliation, defined in
   `docs/architecture/base44-implementation-profile-v1.md`, which is where any
   agent implementing v1 must look first.
9. **The frontend reaches the substrate through one adapter, never directly.**
   The Base44 SDK may be imported only under `frontend/src/infrastructure/base44/`.
   Pages, components, hooks and application modules call
   `OperationExecutor.execute(name, input)` and see `OperationResult`. Entity
   access, service-role access and credentials are banned throughout
   `frontend/src`, and `.github/scripts/check-frontend-base44-boundary.sh`
   fails the build on any of it. Operation names come from the registry in
   `frontend/src/application/operations/registry.ts`, whose canonical
   `operation_key` values are Contract Section 4's — never invented.
10. **The docker-compose Base44 preview harness remains a preview harness.** It
   mounts `./frontend` and is unrelated to the Base44 application substrate.

## Backend structure

```
frontend/
  src/
    application/
      operations/       substrate-neutral contract, registry, ids — no Base44
      react/            provider + useOperation hook — no Base44
    infrastructure/
      base44/           THE ONLY place the Base44 SDK may be imported
    testing/            in-memory executor — test infrastructure, never shipped
    components/         UI — sees OperationResult, never a substrate
  tests/architecture/   boundary tests that name the banned literals
```

```
backend/
  migrations/           committed SQL, applied in order, checksum-verified
  src/
    config/env.ts       Zod environment validation — fails closed
    observability/      structured logging with secret redaction
    config/
      database-identity.ts  role names; refuses a credential that is not ours
    db/
      pool.ts           long-running connection pool
      transaction.ts    transaction boundary and anti-split guarantees
      migrate.ts        SQL migration runner
      provisioner.ts    separate provisioner authority (API must not import)
      schema.ts         Drizzle schema — `app` schema, no domain tables yet
      verify.ts         substrate security checks (CI and real project alike)
    auth/               Supabase JWT verification, server-derived identity
    authz/              resolver + controlled-operation seams (both throw)
    api/                Fastify app, centralized errors, health routes
    worker/             worker runtime and lifecycle
    entrypoints/        api.ts, worker.ts, migrate.ts
  tests/                Vitest suites against real PostgreSQL
```

## Developer instructions

### Install dependencies

```bash
cd backend  && npm install
cd frontend && npm install
```

Backend and frontend are separate packages with separate lockfiles. This is
deliberate: it keeps the Base44 preview harness working unchanged, since it
mounts only `./frontend`.

### Configure

```bash
cp backend/.env.example backend/.env       # then fill in locally
cp frontend/.env.example frontend/.env     # VITE_API_BASE_URL only
```

Never commit a filled-in `.env`. No database credential or Supabase service-role
key belongs in the frontend or in `.base44/environment.json` — every `VITE_*`
variable is inlined into the browser bundle.

### Start the frontend

```bash
docker compose -f docker-compose.base44.yml up -d   # preview harness, host port 3000
# or
cd frontend && npm run dev                          # port 5173
```

### Start the API

```bash
cd backend && npm run dev:api     # http://localhost:8080
curl http://localhost:8080/health/live
curl http://localhost:8080/health/ready
```

### Start the worker

```bash
cd backend && npm run dev:worker
```

It starts, reports idle and shuts down cleanly on SIGTERM. It does no queue
processing: `OutboxEvent` does not exist yet.

### Apply migrations locally

```bash
cd backend && npm run migrate
```

Prefers `MIGRATION_DATABASE_URL`; falls back to `DATABASE_URL` and says so.
Migration `0001` creates database roles and needs an authority that can
`CREATE ROLE`, so the first run uses the project owner credential. Full sequence:
`docs/operations/supabase-bootstrap.md`.

### Verify the security substrate

```bash
cd backend && npm run verify:substrate
```

Checks roles, privileges, Option B lockdown, Data API exposure and transaction
semantics against whatever database is configured — a disposable container or
the real project. Prints role names and outcomes, never a connection string.

```bash
cd backend && npm run verify:auth
```

Checks the project's published signing keys against what the verifier accepts.
Needs no credential and no database — a JWKS endpoint serves public keys — so it
works from anywhere HTTPS reaches the project.

Note: a Claude Code cloud session can reach the project over HTTPS but **not**
over PostgreSQL port 5432, so migrations and `verify:substrate` against the real
project must run from a machine with ordinary outbound access. See
`docs/operations/supabase-bootstrap.md`.

Applies every `migrations/*.sql` not yet recorded, in order, each in its own
transaction. Applied migrations are immutable — editing one is refused by
checksum. Add a new migration instead.

### Run tests

```bash
cd frontend && npm test    # Vitest + jsdom
cd backend  && npm test
```

Integration tests need real PostgreSQL and never mock it. Provide one with
`TEST_DATABASE_URL`, or leave it unset and Testcontainers starts a disposable
instance (requires Docker):

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres npm test
```

### Typecheck and build

```bash
cd backend  && npm run typecheck && npm run build
cd frontend && npm run build
```

## Verification

- `curl http://localhost:3000/` returns the Vite dev HTML (preview harness).
- `curl http://localhost:8080/health/ready` returns `{"status":"ready"}` when the
  database is reachable, and 503 when it is not.
- `curl http://localhost:8080/organizations` returns 404 — no product route
  exists, by design.
- Role switching in the UI is client-side only and carries no authority.
