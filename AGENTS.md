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

## Current state

| Area | State |
|---|---|
| Frontend | Application shell — role-based navigation, placeholder pages, no data access |
| Backend | Phase 0A substrate — API, worker, database and auth boundaries; **no domain model yet** |
| Layer 0 domain | Not implemented. Organization, Membership, RoleAssignment, CoachScopeAssignment, CaptainAssignment, AuthorizationPolicyVersion, AuditLogEvent and OutboxEvent are Phase 0B |
| Authorization | **Not implemented.** The resolver throws; there is no permissive placeholder, and no protected product route exists |

## Tech stack

**Frontend** — React 18, Vite 6, TypeScript, Tailwind CSS 3, React Router 6, lucide-react.

**Backend** — Node.js 22, TypeScript (strict), Fastify 5, Zod 4, Drizzle ORM,
`pg`, pino, jose. Tests: Vitest with Testcontainers or a PostgreSQL service.

**Data/identity** — Supabase-managed PostgreSQL; Supabase Auth for authentication
and identity only.

## Architectural rules that constrain everyday work

1. **Option B — the browser never touches application tables.** All data reaches
   the frontend through the backend API. Nothing is exposed through PostgREST,
   and RLS is not the authorization mechanism.
2. **Application tables live in the `app` schema, never `public`.**
3. **Authentication is not authorization.** Supabase Auth establishes *which
   verified identity* this is. Authority comes from application-owned Membership,
   RoleAssignment, CoachScopeAssignment and CaptainAssignment. The Supabase
   `role` and `app_metadata` claims are never consulted.
4. **No permissive placeholder authorization, ever.** If authorization is not
   implemented for an operation, the operation does not exist.
5. **Atomicity is structural.** A domain change, its AuditLogEvent and its
   OutboxEvent rows commit in one transaction. `src/db/transaction.ts` makes
   nested calls join rather than split, and refuses a second connection inside an
   active transaction.
6. **Two database identities.** The API credential and the provisioner credential
   are distinct, and startup refuses them being equal. Nothing under `src/api/`
   may import the provisioner.
7. **Base44 is a frontend preview harness only** — never a dependency, an auth
   provider, a data source, or a place for secrets.

## Backend structure

```
backend/
  migrations/           committed SQL, applied in order, checksum-verified
  src/
    config/env.ts       Zod environment validation — fails closed
    observability/      structured logging with secret redaction
    db/
      pool.ts           long-running connection pool
      transaction.ts    transaction boundary and anti-split guarantees
      migrate.ts        SQL migration runner
      provisioner.ts    separate provisioner authority (API must not import)
      schema.ts         Drizzle schema — `app` schema, no domain tables yet
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

Applies every `migrations/*.sql` not yet recorded, in order, each in its own
transaction. Applied migrations are immutable — editing one is refused by
checksum. Add a new migration instead.

### Run tests

```bash
cd backend && npm test
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
