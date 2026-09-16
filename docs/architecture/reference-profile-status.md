# PostgreSQL / Supabase Reference Profile — Status

## Disposition

**Preserved, dormant, and not running any production workload.**

The PostgreSQL/Supabase profile remains the canonical contract's full-strength
implementation target. Under the ratified Option B strategy it is not the active
v1 substrate — Base44 is (see `base44-implementation-profile-v1.md`) — but it is
kept in a state from which it can be activated without re-doing Phase 0A or 0B.

## What is complete

- **Phase 0A — substrate scaffolding.** Merged (PR #4). Node/TypeScript backend,
  Fastify API, worker, migration runner, transaction boundary, Supabase JWT
  verification, and the inert authorization resolver seam.
- **Phase 0B — Supabase security and environment bootstrap.** Merged (PR #5).
  The four database authorities (`app_owner`, `app_migrator`, `app_api`,
  `app_provisioner`) are provisioned on the real project, Option B lockdown is in
  place, and neither runtime identity holds a default privilege.
- **Structural verification: 28/28 PASS** against the real Supabase project
  (PostgreSQL 17.6, non-superuser project owner). Recorded in
  `docs/operations/supabase-bootstrap.md`.

## What was deliberately not done

- **No domain tables were created.** The `app` schema exists and is empty of
  domain model. No Layer 0 entity — Organization, Membership, RoleAssignment,
  CoachScopeAssignment, CaptainAssignment, AuthorizationPolicyVersion,
  AuditLogEvent, OutboxEvent — exists in PostgreSQL.
- **No custom runtime or provisioner credentials were issued.** No password
  exists for `app_api`, `app_migrator` or `app_provisioner`. A `LOGIN` role
  without a password cannot authenticate, so all three currently fail closed,
  which is the safer resting state. They are issued at the point of first use,
  not before.
- **The authorization resolver is still inert.** It throws. There is no
  permissive placeholder and no protected product route.

## What remains deferred

**Two Session-pooler-as-`app_api` runtime checks remain deferred — deferred, not
complete, and not dropped:**

1. Transaction commit and rollback through the Session pooler **as `app_api`**.
2. `FOR UPDATE SKIP LOCKED` under concurrency through the Session pooler **as
   `app_api`**.

Both require connecting as `app_api` *through the pooler*, which needs a
credential that has deliberately not been issued. They are about the behaviour of
the configured **endpoint**, not the logic — CI proves the identical code path
against a disposable PostgreSQL on every run.

**These close when the Reference Profile is activated**, at the point the
`app_api` credential is first issued into a secret store. `npm run verify:substrate`
already performs both checks and reports them by name. Full detail:
`docs/operations/supabase-bootstrap.md`.

## What stays running

- **The backend stays merged.** It is not deleted, archived, or allowed to rot.
- **CI stays active.** The backend test suite, typecheck, build and the
  architecture guard all continue to run on every pull request. A change that
  breaks the Reference Profile is a failing build today, not a surprise at
  activation time.
- **The Supabase Free project stays preserved.** Roles, grants and lockdown as
  verified.

## What is not authorized

**No hybrid runtime.** There is exactly one authoritative store for v1
application data, and it is Base44. No v1 feature reads from or writes to the
Supabase database at runtime, no dual-write exists, and no synchronisation
process between the two is authorized. An active Base44 + PostgreSQL hybrid was
explicitly rejected at the Architecture Freeze Gate.

## Activation

Activation is triggered by any item in
`base44-implementation-profile-v1.md` Section 11 — among them a second
production Organization, Conduct or `PrivateCoachNote` entering scope, an
institutional requirement for evidentiary-grade audit or for
database-enforced integrity, cross-organization `SharedCompetition`,
unacceptable reconciliation drift, or a material change in Base44's export
capability.

Activation means the Base44 assumptions may no longer be accepted without a new
architecture decision. It does not automatically mean immediate migration.
