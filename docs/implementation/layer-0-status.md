# Base44 Layer 0 Implementation Status

**Status:** Layer 0 frozen. This document records the implementation status, empirical findings, and acceptance evidence for the Base44 v1 Layer 0 runtime. It is a non-canonical implementation status record — the canonical architecture lives in `docs/architecture/`.

**Base SHA:** `b73853ce3f5bada11e5b5470afa718191f0d5ce7`

**Date:** 2026-09-21

---

## 1. Layer 0 acceptance summary

| Layer | Status | Notes |
|---|---|---|
| 0A — Substrate scaffolding | Accepted | Base44 as active v1 substrate; profile frozen. |
| 0B.1 — Entity schemas | Accepted | All Layer 0 entities defined with RLS locked down. |
| 0B.2 — Bootstrap/policy | Accepted | `policy.bootstrap`, `policy.activate`, `organization.provision` implemented and verified. |
| 0B.3 — Membership/Role/Scope operations | Accepted for current Layer 0 scope | `membership.invite`, `membership.activate`, `membership.deactivate`, `role.assign`, `role.revoke`, `scope.assign`, `scope.revoke` implemented and verified. CaptainAssignment (`captain.assign`) deferred to Layer 1 Team/Roster dependency. |
| 0B.4 — Reconciliation | Accepted | R1–R11 implemented and scheduled; R12 reserved; R13 deferred. S1–S4 scheduled-context scenarios verified. |

### Canonical acceptance evidence

- **Membership M1–M4:** Accepted. Invite, activate, deactivate, and zero-OrgAdmin protection verified under concurrency.
- **Assignment A1–A4:** Accepted for admitted scope. Role and CoachScope assign/revoke verified, including AO+S supersession, idempotent replay, and concurrent-write convergence.
- **Policy Race C:** Accepted post-fix. Concurrent `policy.bootstrap` and `policy.activate` verified for singleton active-version invariant.
- **RLS:** Locked down. All 9 governed entities deny client CRUD (read, create, update, delete) for every role. Service-role access confirmed.
- **Reconciliation S1–S4:** Accepted. Clean tick (S1), defect detection (S2), R5 deterministic repair + idempotency (S3), and failed-tick recovery (S4) verified in scheduled context.

---

## 2. Base44 Layer 0 runtime inventory

### 2.1 Entities

| Entity | Schema status | RLS posture |
|---|---|---|
| Organization | Implemented | Client CRUD denied (all false). Service-role only. |
| Membership | Implemented | Client CRUD denied (all false). Service-role only. |
| RoleAssignment | Implemented | Client CRUD denied (all false). Service-role only. |
| CoachScopeAssignment | Implemented | Client CRUD denied (all false). Service-role only. |
| CaptainAssignment | Schema defined; implementation deferred | Client CRUD denied (all false). Requires Layer 1 Team/Roster for effectiveness. |
| AuthorizationPolicyVersion | Implemented | Client CRUD denied (all false). Service-role only. |
| AuditLogEvent | Implemented | Client CRUD denied (all false). Server-only, append-only by convention. |
| ReconciliationHeartbeat | Implemented | Client CRUD denied (all false). Server-only. |
| ReconciliationFinding | Implemented | Client CRUD denied (all false). Server-only. |

All entities carry application-generated UUIDs, application-owned timestamps, discriminated actor provenance (`created_by_actor_type` / `created_by_actor_reference`), and correlation IDs per profile Section 9.

### 2.2 Controlled operations

#### Bootstrap / policy (operator entrypoints — no adapter, no client surface)

| Operation key | Status |
|---|---|
| `policy.bootstrap` | Implemented. Self-extinguishing; denied once any active version exists. |
| `policy.activate` | Implemented. Version-guarded singleton transition. |
| `organization.provision` | Implemented. Staged provisioning; idempotent by `provisioning_request_id`. |

#### Membership lifecycle

| Operation key | Status |
|---|---|
| `membership.invite` | Implemented. Creates Membership at `invited`. |
| `membership.activate` | Implemented. Transitions `invited` or `inactive` → `active` in place. |
| `membership.deactivate` | Implemented. Transitions `active` → `inactive`; denies on last effective OrgAdmin. |

#### RoleAssignment

| Operation key | Status |
|---|---|
| `role.assign` | Implemented. AO+S supersession; unique active per `(membership_id, role_category)`. |
| `role.revoke` | Implemented. AO+S supersession; zero-OrgAdmin protection. |

#### CoachScopeAssignment

| Operation key | Status |
|---|---|
| `scope.assign` | Implemented. AO+S supersession; OrganizationWide scope at Layer 0. |
| `scope.revoke` | Implemented. AO+S supersession. |

#### CaptainAssignment — deferred

| Operation key | Status |
|---|---|
| `captain.assign` | Deferred. Requires Layer 1 Team/Roster (RosterAssignment) for effectiveness precondition. Schema is defined; no operation handler. |

### 2.3 Shared infrastructure

| Component | Status |
|---|---|
| Centralized resolver | Implemented. Single resolver chain inside backend functions (profile Section 2.3). |
| Version-aware production-policy registry | Implemented. Each `AuthorizationPolicyVersion` resolves to its own immutable frozen rule set and expected hash. |
| Policy loader | Implemented. Loads active production policy; recomputes hash; denies on mismatch. |
| CAS semantics | Implemented. `updateMany` with version guard; `updated === 1` winner; `updated === 0` stale/conflict. |
| Bounded stable-read semantics | Implemented. Post-write confirmation uses bounded re-reads; exhaustion fails closed. |
| Assignment supersession reconciliation | Implemented. Follows semantic `supersedes_id` chains, not UUID ordering. |
| Zero-OrgAdmin protection | Implemented. Per-Organization guard record + version-guarded write; denies before transition. |
| Reconciliation scheduler | Implemented. Base44 scheduled workflow, 5-minute cadence. |
| Reconciliation sweeps R1–R11 | Implemented. See Section 3 below. |
| Audit log writer | Implemented. Server-only, controlled-code path. |

---

## 3. Reconciliation map (R1–R12)

| # | Sweep | Status | Auto-repair | Notes |
|---|---|---|---|---|
| R1 | Duplicate Membership | Implemented | No | Detection only; operator review. |
| R2 | Multiple-current RoleAssignment | Implemented | No | Detection only; operator review. |
| R3 | Multiple-current CoachScopeAssignment | Implemented | No | Detection only; operator review. |
| R4 | Multiple-current CaptainAssignment | Deferred | No | Requires Layer 1 Team/TeamSeason. |
| R5 | Grants attached to inactive Membership | Implemented | Yes — deterministic | Close the grant. Idempotent: after supersession, subsequent sweeps find no current grants on inactive memberships. |
| R6 | Orphaned references | Implemented | No | Detection only; operator review. |
| R7 | Zero effective OrgAdmins | Implemented | No | Detection only; critical severity. |
| R8 | Multiple active policy / no active policy / hash-invalid | Implemented | No | Detection only; all protected operations deny on ambiguity. |
| R9 | Missing AuditLog correlation | Implemented | No | Detection only; never repaired by backdated audit. |
| R10 | Sweep heartbeat gap | Implemented | No | Detection of stalled/failed sweeps; R10's own gap is the outermost check. |
| R11 | Incomplete provisioning | Implemented | No | Detection only; never silently completed. |
| R12 | Outbox / notification inconsistency | Reserved | — | Not applicable until Communication/Outbox enters scope. |

### 3.1 Unresolved R9 finding — `lb02-restore-active`

The production policy bootstrap (correlation ID `lb02-restore-active`) has no corresponding `AuditLogEvent`. This is a **historical artifact** from before R9 was implemented — the bootstrap was executed before the audit-writing path existed.

This is a **legitimate unresolved operator-review finding**, not synthetic residue. R9 correctly re-detects it on every sweep run. Multiple persisted `ReconciliationFinding` records for the same logical issue represent **repeated detections by different sweep runs**, not duplicate defects. This is the designed behavior: each sweep run independently detects and records findings; it does not deduplicate against prior findings.

**Resolution:** An operator must acknowledge and resolve this finding. It is not resolved by writing a backdated audit record (R9 never repairs by writing history).

---

## 4. Empirical findings — Layer 0B.3 and 0B.4

These findings were established by executing against the Base44 platform during Layer 0B.3 (assignment concurrency) and 0B.4 (reconciliation). They are Base44-specific implementation mechanics and are recorded here, not in the canonical architecture, per the profile's rule that Base44-specific mechanics live in the profile/status docs.

### 4.1 CAS and concurrency

- **CAS winner is `updateMany(..., expected version ...)` with `updated === 1`.** A single-record version-guarded write where exactly one record is updated is the winner. `updated === 0` is stale/conflict — the state moved since it was read; the operation fails closed or retries with a fresh read. (Already in profile Section 2.1.)
- **Post-write reads may be eventually consistent.** A filter immediately after a write may not reflect that write. Correctness-critical post-write confirmation uses a bounded consistency re-read. (Already in profile Section 2.1.)
- **Stable-read exhaustion fails closed.** If bounded re-reads do not reach consistency, the operation fails — never assume success. (Already in profile Section 2.1.)

### 4.2 Assignment supersession reconciliation

- **UUID ordering must never determine the authority winner.** When two concurrent AO+S writes both create current records, the winner is determined by semantic supersession (which record supersedes which), not by lexical UUID comparison. UUID ordering is an implementation artifact with no authority meaning.
- **Supersession reconciliation follows the `supersedes_id` chain.** The reconciliation helper walks the `supersedes_id` chain to identify the current record, rather than comparing UUIDs or timestamps. This preserves the append-only history and the semantic authority relationship.
- **Unrelated or cyclic ambiguous authority state fails closed.** If two current records cannot be reconciled through the supersession chain (unrelated records with no supersession relationship, or a cyclic chain), the operation fails closed and escalates to operator review. The system never invents a winner for an ambiguous authority state.

### 4.3 Policy versioning

- **Policy definitions are immutable and version-aware.** Each `AuthorizationPolicyVersion` resolves to its own frozen rule definition and hash. The resolver loads the active version and validates against its own historical definition, not the latest deployed ruleset.
- **Historical policy versions validate against their own frozen rule definition/hash.** A superseded version's hash is never recomputed from the current code; it is validated against the hash recorded when it was activated.

### 4.4 Scheduler and reconciliation

- **The scheduler has no assumed exactly-once or retry guarantee.** A failed scheduled tick is lost unless the application re-detects the work on a later tick. Every sweep is idempotent and re-derivable from persisted state. (Already in profile Section 2.5.)
- **Later scheduled ticks continue after a failed invocation.** A failed tick does not halt the schedule; the subsequent tick runs normally. Verified: a deliberately failed tick (S4) was followed by a successful tick that advanced the heartbeat. (Already in profile Section 2.5.)
- **R5 repair is deterministic and idempotent.** After R5 supersedes a grant (sets `is_current = false`), the next sweep finds no current grants on inactive memberships and performs no additional mutation. Verified in scheduled context: the repair tick wrote 2 repairs; the next tick wrote 0.
- **Reconciliation is otherwise detection/operator-review, not authority invention.** No sweep silently chooses an authority winner. Authority and security anomalies escalate to an operator. (Already in profile Section 7.1.)

---

## 5. Known limitations

### 5.1 Ordinary auth boundary — manual empirical check pending

**ORDINARY AUTH BOUNDARY: MANUAL EMPIRICAL CHECK PENDING.**

The ordinary authorization boundary (non-admin, authenticated user invoking operations through the production HTTP path) has not been empirically tested with a genuine non-admin authenticated request. All operation-level authorization testing was conducted via the service-role SDK path or admin-authenticated test harnesses.

Until a genuine authenticated non-admin request has been tested through the production operation dispatcher, the ordinary auth boundary is accepted on the strength of code-level verification (resolver logic, policy evaluation, audit recording) but not on the strength of end-to-end empirical evidence.

### 5.2 Operational audit — not evidentiary-grade

Base44 v1 `AuditLogEvent` is **operational-grade, not evidentiary-grade** (profile Section 6). It is:
- Server-only with no client CRUD path.
- Append-only by controlled-code convention, not by platform enforcement.
- Not atomic with the domain change.

No product or institutional process may rely on Base44 v1 AuditLog as tamper-proof or evidentiary history.

### 5.3 Communication remains excluded

The Communication / notification domain is excluded from v1 (profile Section 3.2). Durable outbox equivalence is **not claimed**. R12 is reserved and mandatory before Communication is admitted.

### 5.4 Multi-organization production use triggers Reference Profile reassessment

Introducing a second production Organization is a mandatory Reference Profile reassessment trigger (profile Section 11). The single-tenancy enforcement has not been demonstrated under adversarial multi-tenant conditions.

### 5.5 Institutional approval required before real student data

Technical approval does not constitute institutional approval to store real student education records in Base44 (profile Section 12). Synthetic development may proceed; real student data may not until the institution has approved Base44 for the intended student-data use.

---

## 6. File-to-implementation mapping

### Entities (`base44/entities/`)

| Entity | File |
|---|---|
| Organization | `Organization.jsonc` |
| Membership | `Membership.jsonc` |
| RoleAssignment | `RoleAssignment.jsonc` |
| CoachScopeAssignment | `CoachScopeAssignment.jsonc` |
| CaptainAssignment | `CaptainAssignment.jsonc` (schema only) |
| AuthorizationPolicyVersion | `AuthorizationPolicyVersion.jsonc` |
| AuditLogEvent | `AuditLogEvent.jsonc` |
| ReconciliationHeartbeat | `ReconciliationHeartbeat.jsonc` |
| ReconciliationFinding | `ReconciliationFinding.jsonc` |

### Shared infrastructure (`base44/shared/`)

| Component | File |
|---|---|
| Operation dispatcher | `operation-dispatcher.ts` |
| Resolver | `resolver.ts` |
| Policy loader | `policy-loader.ts` |
| Policy registry | `policy-registry.ts` |
| Production policy | `production-policy.ts` |
| Policy core | `policy.ts` |
| Audit writer | `audit.ts` |
| Membership lifecycle | `membership-lifecycle.ts` |
| Assignment lifecycle | `assignment-lifecycle.ts` |
| Reconcile helper | `reconcile.ts` |
| ID/time utilities | `ids.ts` |
| Retry wrapper | `retry.ts` |
| Test helpers | `test-helpers.ts` |
| Operations: organization.provision | `operations/organization_provision.ts` |
| Operations: policy.bootstrap | `operations/policy_bootstrap.ts` |
| Operations: policy.activate | `operations/policy_activate.ts` |
| Operations: membership.invite | `operations/membership_invite.ts` |
| Operations: membership.activate | `operations/membership_activate.ts` |
| Operations: membership.deactivate | `operations/membership_deactivate.ts` |
| Operations: role.assign | `operations/role_assign.ts` |
| Operations: role.revoke | `operations/role_revoke.ts` |
| Operations: scope.assign | `operations/scope_assign.ts` |
| Operations: scope.revoke | `operations/scope_revoke.ts` |
| Reconciliation: heartbeat | `reconciliation/heartbeat.ts` |
| Reconciliation: detection sweeps | `reconciliation/sweeps-detection.ts` |
| Reconciliation: repair sweeps | `reconciliation/sweeps-repair.ts` |
| Reconciliation: integrity sweeps | `reconciliation/sweeps-integrity.ts` |
| Reconciliation: observability sweeps | `reconciliation/sweeps-observability.ts` |

### Backend functions (`base44/functions/`)

| Function | Purpose |
|---|---|
| `execute_operation` | Production operation dispatcher (client-facing). |
| `reconciliation_sweep` | Reconciliation sweep entry point (scheduled + manual). |
| `concurrency_harness` | Test-only: organization/policy concurrency races. |
| `assignment_concurrency_harness` | Test-only: assignment concurrency races. |
| `membership_concurrency_harness` | Test-only: membership lifecycle concurrency races. |
| `reconciliation_test_harness` | Test-only: reconciliation sweep verification. |
| `rls_acceptance_test` | Test-only: RLS denial verification. |
| `membership_lifecycle_test` | Test-only: membership lifecycle verification. |
| `diagnostic_authorize` | Test-only: resolver authorization diagnostics. |
| `ordinary_user_test` | Test-only: ordinary user boundary (pending). |
| `test_resolver` | Test-only: resolver unit diagnostics. |

### Workflows (`base44/workflows/`)

| Workflow | Purpose |
|---|---|
| `Reconciliation Sweep.jsonc` | Scheduled reconciliation sweep, 5-minute cadence. |

### Frontend operation registry

The frontend operation registry (`frontend/src/application/operations/registry.ts`) already matches the accepted operation catalog. No changes were needed.

---

## 7. Architecture amendment determination

**Canonical architecture changed:** No.

The canonical architecture documents (`implementation-contract.md`, `implementation-handoff.md`, `base44-implementation-profile-v1.md`, `reference-profile-status.md`, Amendments 001 and 002) were reviewed. No architecture rule, invariant, entity definition, operation definition, or prohibition changed during Layer 0B.3–0B.4.

The empirical findings in Section 4 above are Base44-specific implementation mechanics that confirm and elaborate existing rules. They are documented here in the implementation status record, not promoted to the canonical architecture.

**Architecture-amendment label required:** No. This PR does not modify any file matched by the architecture guard's `CANONICAL_PATTERN`. It passes the guard without the exception label.
