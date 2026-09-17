# Architecture Amendment 002 — Membership Lifecycle Operations

**Status: ADOPTED AND IN FORCE.** Ratified and incorporated into `../implementation-contract.md`.

**Scope:** ratifies the canonical Membership lifecycle operation family, strengthens the zero-OrgAdmin invariant ruling, records empirically established Base44 concurrency acceptance rules, and extends audit/policy portability to the new operation identifiers.

**Relationship to the canonical contract:** this document records the problem, the reasoning, the decisions and their bounds. The canonical contract remains the sole implementation source of truth. Where this document and the contract differ, **the contract wins**.

**Introduces no new entity and no new sensitivity classification.** All three operations act on the existing `Membership` entity (Temporal, RestrictedStudent), whose schema and mutability model are unchanged.

---

## 1. Problem statement

The canonical contract explicitly names `membership.deactivate` (Contract Section 4) and describes the `Membership.status` lifecycle as `invited → active ↔ inactive/removed` (Contract Section 5). The contract states that ordinary Membership is "created at `invited`" and that deactivation "cascades to close dependent Role/Scope/Captain grants," but it does not name the controlled operations for entry (invitation) and activation. This left two gaps:

**G1 — Entry operation.** The contract states that "ordinary Membership is created at `invited`" (Section 5) but Section 4 contains no operation whose Creates column writes a Membership at `invited`. `organization.provision` creates a Membership directly at `active` (the designated first administrator); every subsequent member must arrive through a named controlled operation, but none was named.

**G2 — Activation operation.** The contract states that reactivation "restores Membership standing only" (Section 5, Global Invariant 11) and that the lifecycle includes `invited → active` and `inactive → active` transitions, but Section 4 contains no operation that performs these in-place transitions. `membership.deactivate` covers `active → inactive`; the reverse direction lacked a canonical operation identifier.

**G3 — Zero-OrgAdmin enforcement under concurrency.** Prohibition 21 requires `membership.deactivate` to "deny when the target holds the last effective OrganizationAdministrator RoleAssignment." The Base44 v1 profile (Section 5.3) records that enforcement is a "version-guarded read-modify-write against a per-Organization administrator-count guard record." The contract and profile did not explicitly rule on whether compensation that temporarily crosses through zero OrgAdmins and then repairs is an acceptable enforcement strategy. This amendment rules that it is not.

**G4 — Base44 concurrency acceptance.** The Base44 v1 profile (Section 2.1) records empirically established conditional-write rules but does not record the full set of concurrency acceptance rules established during Layer 0B implementation, including the CAS winner semantics, eventual consistency of post-write reads, the distinction between consistency retry, CAS, and rate-limit retry, and the required aggregate trial count for authority-sensitive concurrency gates.

---

## 2. Decision 1 — Canonical Membership operations

### 2.1 Ratified operation family

The following three operations are ratified as the canonical Membership lifecycle operation family:

| Operation | Authorized actors | Preconditions | Creates/Supersedes | Audit |
|---|---|---|---|---|
| `membership.invite` | OrgAdmin | resolvable, hash-verified active AuthorizationPolicyVersion; target identity independently resolved and verified; no existing Membership for `(user_id, organization_id)` | Membership created **in place** at `status = invited` (single enduring row; no second row for the same pair) | Required (Organization-scoped) |
| `membership.activate` | OrgAdmin | active AuthorizationPolicyVersion; existing Membership with `status ∈ {invited, inactive}`; target is not blocked by the last-effective-OrgAdmin precondition (Decision 2) | Membership status transitioned **in place** to `active` (same row, same UUID; no new row) | Required |
| `membership.deactivate` | OrgAdmin | active AuthorizationPolicyVersion; existing Membership with `status = active`; **target does not hold the last effective OrganizationAdministrator RoleAssignment in the Organization** (Prohibition 21, Decision 2) | Membership status transitioned **in place** to `inactive`; cascades close all dependent Role/Scope/Captain grants | Required |

### 2.2 Frozen semantics

**`membership.invite`**

- Creates the single enduring Membership for `(user_id, organization_id)` in `invited` state where invitation is the applicable entry path.
- Must not create a second Membership if one already exists for that pair. A replay against the same pair returns the existing Membership's identity, not a duplicate.
- The target identity is resolved, never accepted as submitted — the same identity verification rule as `organization.provision` (Amendment 001 Section 2.3). An `{email}` must resolve to exactly one confirmed authentication identity; an `{auth_user_id}` must resolve to an existing, confirmed identity.
- The Membership is created at `invited` regardless of whether the target user has authenticated. Activation is a separate controlled operation.

**`membership.activate`**

- Controlled in-place transition: `invited → active` or `inactive → active`, preserving the same Membership UUID/row.
- Does not create Role/Scope/Captain grants. Activation restores Membership standing only — a new authorization tenure requires fresh grants (Global Invariant 11).
- Does not resurrect previously closed grants. The cascade that closed them during deactivation is preserved through the immutable/superseding dependent grant records and AuditLog.

**`membership.deactivate`**

- Controlled in-place transition: `active → inactive`, preserving the same Membership UUID/row.
- Cascades to close all currently-effective dependent Role/Scope/Captain grants (Global Invariant 11). In the Base44 v1 profile, this cascade is best-effort and reconciled (Profile Section 5.1, Invariant 11 deviation); the resolver independently refuses to honour a grant whose Membership is inactive.
- Subject to the zero-OrgAdmin invariant (Decision 2, Prohibition 21).

### 2.3 Relationship to `organization.provision`

`organization.provision` remains the sole operation that creates a Membership directly at `active` — for the designated first administrator, whose identity was independently resolved and verified at provisioning time (Amendment 001 Section 2.3). Every subsequent Membership is created at `invited` by `membership.invite` and transitioned to `active` by `membership.activate`. No other operation may create a Membership row.

### 2.4 Membership remains Temporal

Membership is and remains **Temporal** (Contract Section 2, Section 5). The three operations transition the status of a single enduring row in place. They never create a second row, never supersede, and never use `is_current`. This is unchanged by this amendment.

---

## 3. Decision 2 — Zero-OrgAdmin invariant

### 3.1 Ruling

**No controlled operation may knowingly create even a temporary effective state with zero OrgAdmins.**

Compensation that deactivates the last effective OrgAdmin and subsequently reactivates it is **not an acceptable enforcement strategy**. The invariant must hold at every committed boundary, not just at the final boundary after compensation.

### 3.2 Enforcement requirement

For Base44 v1, last-OrgAdmin protection must occur **before the Membership transition becomes effective**. The operation must:

1. Acquire a per-Organization serialization guard (a version-guarded read-modify-write against a per-Organization administrator-count guard record, as Profile Section 5.3 already specifies).
2. Count effective OrgAdmins **before** transitioning the target Membership.
3. Deny (fail closed) if the transition would reduce the effective OrgAdmin count to zero.

### 3.3 Concurrency ambiguity

If concurrent authority changes make the precondition ambiguous or cannot be safely serialized/guarded, the operation **fails closed**. A denial is always safer than a temporary zero-OrgAdmin window.

### 3.4 Reconciliation is detection, not enforcement

Reconciliation sweeps may detect violations caused by defects or out-of-band corruption. They are **not the normal enforcement mechanism** for intentionally crossing through zero OrgAdmins. An implementation that relies on reconciliation to repair a knowingly-created zero-OrgAdmin state violates this amendment.

---

## 4. Decision 3 — Base44 concurrency acceptance

The following implementation rules were empirically established during Layer 0B and are recorded here as binding for Base44 v1 authority-sensitive concurrency:

### 4.1 CAS (compare-and-set) semantics

- **CAS winner is `updateMany(..., expected version ...)` with `updated === 1`.** A single-record version-guarded write where exactly one record is updated is the winner.
- **`updated === 0` is stale/conflict.** The state moved since it was read; the operation must fail closed or retry with a fresh read.
- This is single-record compare-and-set, not multi-record serializability. No document, comment, or product claim may describe this as ACID (Profile Section 2.1).

### 4.2 Post-write consistency

- **Base44 post-write reads may be eventually consistent.** A filter immediately after a write may not reflect that write.
- **Correctness-critical post-write confirmation uses bounded consistency re-read.** A short, bounded retry loop (e.g., 3 retries at 250ms = 750ms max) gives a concurrent write time to become visible before deciding the outcome.
- **Exhaustion fails closed.** If the consistency retry budget is exhausted without convergence, the operation fails closed — it never assumes success.

### 4.3 Three distinct retry mechanisms

The following are distinct mechanisms and must not be conflated:

1. **Consistency retry** — bounded re-read after a write to handle eventual consistency. Short delay, small budget (e.g., 750ms max).
2. **CAS version-guarding** — application-owned version increment on a conditional write to prevent lost updates. No retry; a failed guard is a conflict.
3. **Rate-limit retry** — linear backoff for transient 429/rate-limit errors. Longer delay, separate budget.

### 4.4 Acceptance trial count

- Acceptance race suites may be **executed in batches** to stay within Base44 execution limits, but the **required aggregate trial count is unchanged**.
- For authority-sensitive concurrency gates, **25 post-fix trials per required race** are required unless a later architecture decision explicitly changes the standard.

---

## 5. Decision 4 — Audit/policy portability

The new Membership operation identifiers are added wherever operation keys are part of:

### 5.1 AuditLog semantics

`membership.invite`, `membership.activate`, and `membership.deactivate` are valid `operation_key` values in `AuditLogEvent` (Contract Section 2). Every audit event records the canonical `operation_key` (Profile Section 6.1).

### 5.2 Authorization policy

The production authorization policy must include rules that grant OrgAdmin authority for `membership.invite`, `membership.activate`, and `membership.deactivate` scoped to the actor's Organization. These rules are part of the in-code policy artifact, not stored data (Contract Section 2, `AuthorizationPolicyVersion`).

### 5.3 Portable migration/export requirements

The operation identifiers are part of the canonical operation catalog and are included in any portable migration or export of audit history. They are canonical `operation_key` values, not Base44 adapter names (Profile Section 10.2).

### 5.4 Frontend substrate-neutral operation contracts

The frontend operation registry (Profile Section 10.2) must include the new operation identifiers. The canonical `operation_key` is the operation's identity; the adapter name is a presentation of it. The registry is the reason a caller cannot name an arbitrary backend function: an operation name that is not a key here never reaches the substrate.

### 5.5 Base44-specific implementation details remain in the profile

CAS mechanics, consistency retry budgets, rate-limit retry, and the version-guarded write pattern are Base44-specific implementation details that belong in the Base44 implementation profile, not in the canonical contract. The canonical contract specifies the guarantee (zero-OrgAdmin at every committed boundary); the profile specifies the enforcement mechanism.

---

## 6. Current implementation discrepancy

### 6.1 Premature implementation

Base44 prematurely implemented `membership.invite` and `membership.activate` and activated `esports_v1` v`0b.2` before architecture ratification. The implementation was built during Layer 0B.2 and the policy was activated to test the new authorization rules.

### 6.2 Amendment ratifies identifiers, not implementation

This amendment ratifies the operation identifiers and their semantics. It does **not** automatically accept the current Base44 0B.2 implementation.

### 6.3 Required implementation changes

The current Base44 0B.2 implementation must still:

1. **Remove the temporary-zero-OrgAdmin compensation behavior.** The current `membership.deactivate` implementation includes a post-deactivation compensation check that may temporarily deactivate the last effective OrgAdmin and subsequently re-activate it. This violates Decision 2 and must be removed. Last-OrgAdmin protection must occur before the Membership transition becomes effective.

2. **Pass the full post-fix concurrency acceptance suite.** 25 post-fix trials per required race (Decision 3.4), executed in batches if necessary to stay within Base44 execution limits.

3. **Re-verify prior 0B.1 regressions.** The resolver, RLS, ordinary-user denial, and Layer 0B.1 bootstrap invariants must all pass with the updated policy.

### 6.4 Policy version

The `esports_v1` v`0b.2` policy version was activated prematurely. After the implementation changes in 6.3 are complete, a new policy version must be activated through `policy.activate` that includes the ratified operation rules. The premature v`0b.2` version must be superseded.

---

## 7. Incorporation

This amendment is incorporated into `../implementation-contract.md` as follows:

- **Section 4 (Controlled Operation Catalog):** `membership.invite` and `membership.activate` are added to the operation table.
- **Section 5 (Lifecycle / State-Machine Catalog):** The Membership.status lifecycle references all three controlled operations by name.
- **Section 10 (Implementation Prohibitions):** Prohibition 21 is strengthened to explicitly prohibit temporary-zero-OrgAdmin compensation.

This amendment is incorporated into `../base44-implementation-profile-v1.md` as follows:

- **Section 2.1:** The empirically established CAS and concurrency rules are recorded (Decision 3).
- **Section 5.3/5.4:** The zero-OrgAdmin enforcement is strengthened to prohibit temporary-zero compensation (Decision 2).

This amendment is incorporated into `../implementation-handoff.md` as follows:

- **Section 4 (Implementation dependency order):** The Membership lifecycle operations are noted as part of Layer 0B.

The frontend operation registry (`frontend/src/application/operations/registry.ts`) is updated to include `membership.invite` and `membership.activate` as canonical operation keys (Decision 4.4).

---

## 8. Amendment 001 coherence

Amendment 001 remains fully coherent with this amendment. Specifically:

- `organization.provision` (Amendment 001 Section 2) remains the sole operation that creates a Membership directly at `active`. This amendment adds `membership.invite` (creates at `invited`) and `membership.activate` (transitions to `active`), which are the ordinary entry and activation paths for subsequent members.
- The zero-OrgAdmin invariant (Amendment 001 Section 2.7) is strengthened, not weakened, by this amendment's Decision 2.
- The identity verification rule (Amendment 001 Section 2.3, "resolve, never accept as submitted") applies identically to `membership.invite`.
- No entity, sensitivity classification, or mutability model is changed.
