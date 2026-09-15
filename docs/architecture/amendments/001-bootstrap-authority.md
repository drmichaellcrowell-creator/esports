# Architecture Amendment 001 — Bootstrap Authority

**Status: ADOPTED AND IN FORCE.** Ratified and incorporated into `../implementation-contract.md`.

**Scope:** closes the Layer 0 genesis circularity identified by the Backend Substrate Selection Gate, and resolves the Section 2 / Section 5 `Membership` mutability contradiction exposed while specifying it.

**Relationship to the canonical contract:** this document records the problem, the reasoning, the decisions and their bounds. The canonical contract remains the sole implementation source of truth. Where this document and the contract differ, **the contract wins**.

**Introduces no new entity and no new sensitivity classification.**

---

## 1. Bootstrap problem statement

The contract as frozen contained two genesis circularities and one representational gap.

**C1 — Tenant genesis.** Section 2 granted `Organization` write authority to OrgAdmin. Section 4's `role.assign` requires an OrgAdmin actor. Section 3 derives OrgAdmin authority from Membership + RoleAssignment scoped to an Organization. A new tenant has none of these, so no actor could create the first of any of them. Section 4 contained no `organization.create`.

**C2 — Policy genesis.** Global Invariant 6 denies on "an unresolvable active policy version", so every protected operation requires a resolvable active `AuthorizationPolicyVersion`. Section 4's `policy.activate` is itself a protected, audit-required operation and therefore could not install the first version. No installation lifecycle was defined.

**C3 — Audit actor representability.** Global Invariant 13 requires every audit-required operation to record "both actor identity and authority path". A platform operator holds no Membership and no RoleAssignment, so no authority path existed in the shape Section 2 implied. Global Invariant 18 forbids fabricating a human actor for non-human execution, but a platform operator is neither an organization user nor a service job. The contract had no third actor kind.

C1 and C2 blocked Layer 0 outright. C3 blocked the audit event that Invariant 13 requires of whatever resolves them.

**Governing principle.** Platform authority may establish the minimum trusted state required for the application authorization model to begin operating, and is exhausted the instant that state commits. It never becomes ongoing Organization-level authority.

---

## 2. `organization.provision`

### 2.1 Authorized actor

Platform authority only, defined as an **infrastructure trust root, never a persisted grant**: exercised solely through an operator-invoked administrative entrypoint in the deployment image, authenticated by a provisioning credential the client-facing API process does not hold, connecting as a database role distinct from the API's. This terminates the authority regress at the infrastructure boundary — the same trust root as the database credentials themselves — rather than by adding a platform-administrator table that would need its own genesis.

### 2.2 Inputs

| Input | Shape | Trust |
|---|---|---|
| `provisioning_request_id` | UUID, operator-supplied | Idempotency key only; confers nothing |
| `organization_key` | Stable slug, unique platform-wide | Uniqueness database-enforced |
| `organization_display_name` | Bounded string | Operator-supplied |
| `initial_admin_identity` | Discriminated `{auth_user_id}` or `{email}` | **Never trusted as submitted** |
| `provisioning_reference` | Bounded opaque external reference | Audit provenance; no student narrative (Inv 20) |

Every other field on every created record is server-derived (Inv 16): all primary keys, timestamps, `organization_id`, `membership.status`, `role_category`, `is_current`, the full audit event, and the policy version and hash.

### 2.3 Identity verification

The designated administrator's identity is **resolved, never accepted**. An `{email}` must resolve to exactly one confirmed authentication identity — zero or multiple aborts. An `{auth_user_id}` must resolve to an existing, confirmed identity — unresolvable aborts. Only the resolved identifier is persisted as `Membership.user_id`. A submitted identifier never becomes trusted by virtue of submission.

`Membership.user_id` carries a foreign key to the authentication identity table with `ON DELETE RESTRICT`, so an authentication identity cannot be deleted while a Membership references it — preserving Invariant 10 against upstream deletion.

### 2.4 Minimum viable tenant

Exactly three domain rows plus one audit row: `Organization`, `Membership` (`status = active`), `RoleAssignment` (`OrganizationAdministrator`, `is_current = true`), `AuditLogEvent`.

Determination on additional Layer 0 records — **none is strictly required**:

- **CoachScopeAssignment** — not required; the first administrator is not a coach.
- **CaptainAssignment** — not required; captain effectiveness depends on a Layer 1 RosterAssignment.
- **AuthorizationPolicyVersion** — a platform singleton created by `policy.bootstrap`. A **precondition**, not an output.
- **OutboxEvent** — not required. Section 4's Outbox column reads "if Notification required", and Notification is Layer 6. Should a provisioning Notification later be wanted, it is added at Layer 6 and at that point falls under Invariant 15 inside this same transaction.

### 2.5 Transaction boundary

One transaction, **T-PROV**, all-or-nothing. Preconditions verified before any write: a resolvable, hash-verified active policy version exists; `provisioning_request_id` is unused; `organization_key` is unused; the administrator identity resolves per 2.3.

### 2.6 Idempotency, duplication, repetition

Replay of the same `provisioning_request_id` creates nothing, returns the original Organization's identity, and emits no second audit event — making retry after an ambiguous crash or network failure safe. A different `provisioning_request_id` against an existing `organization_key` is denied. Both uniqueness rules are database-enforced, so concurrent attempts resolve deterministically.

**Provisioning is genesis-only and is never repeatable for an existing Organization.** There is no re-provision, no deprovision, and no suspension path. Every subsequent administrator is added by an existing OrgAdmin through ordinary `role.assign`.

### 2.7 Zero-OrgAdmin invariant

**Adopted:** every Organization has at least one effective Organization Administrator at every committed transaction boundary.

An Organization with zero administrators is permanently unadministrable, and the only conceivable recovery is platform intervention into tenant state — precisely the break-glass mechanism the contract forbids. Adopting this invariant is what makes the absence of break-glass sustainable rather than a latent operational trap.

Enforcement is hybrid, because "at least one" is not expressible as a unique or check constraint:

- **Database guarantee:** a deferred constraint trigger on the membership and role-assignment tables which, at transaction end, counts effective administrators for every affected Organization and raises if the count is zero.
- **Server-code obligation that makes the check sound:** any operation which could reduce the count (`role.revoke`, `membership.deactivate`) first takes a row lock on the Organization. Without it, two concurrent revocations of different administrators could each observe a count of one and both commit.

### 2.8 Failure behavior

Full rollback in every case: no Organization, no Membership, no RoleAssignment, no audit row. Because the domain transaction rolls back, a **failed** attempt is recorded by a separate, independently committed audit event with `outcome = denied | failed`.

This does not violate Invariant 15. That invariant governs the success path, where a domain change exists for the audit and outbox rows to be atomic with; a failure has no domain change. Where the database itself is unreachable, the failure is recorded to operational logs only — an acknowledged limit.

---

## 3. Initial policy bootstrap

### 3.1 Why a distinct operation

Special-casing `policy.activate` to skip the active-version requirement was **rejected**: it would place a conditional bypass inside the resolver — the most security-critical code path in the system — where it would live permanently and be evaluated on every request.

`policy.bootstrap` was **adopted** instead: a separate entrypoint outside the resolver, unreachable over the network, hard-gated on zero active versions existing, and **self-extinguishing after first success**.

### 3.2 Contract

| Property | Value |
|---|---|
| Actor | Platform authority (infrastructure trust root), operator entrypoint only |
| Resolver | **Not consulted** — the one operation that cannot be, by construction |
| Precondition | Zero rows with `status = active` |
| Creates | First `AuthorizationPolicyVersion` pointer, `status = active` |
| Audit | Required — one Platform-scoped event |
| Repeatable | **Never** |

### 3.3 Artifact identification and hash verification

Rule content remains in code; the record holds metadata, pointer and hash only. `policy_hash` is SHA-256 over a canonical, deterministically ordered serialization of the compiled in-code ruleset, **computed by the server and never authoritative from input**. An operator may supply an `expected_policy_hash`; a mismatch aborts, catching a wrong-build deploy without making the operator the source of truth.

**Continuous verification:** the resolver recomputes the hash on load and on resolution and compares it to the active pointer. **On mismatch, every protected operation denies.** The operational consequence is accepted deliberately — a deploy that changes authorization rules without a corresponding `policy.activate` fails closed to deny-all rather than silently running new rules under an old pointer, so rule changes must include activation in the deploy sequence.

### 3.4 Transaction, audit, and attempted re-bootstrap

One transaction, **T-BOOT**: the version insert plus one Platform-scoped audit event (`organization_id IS NULL`). The event records **the version being installed** and is therefore self-referential; every other audit event records the version in force when the decision was made.

Bootstrap attempted while an active version exists is denied, recorded with `outcome = denied` in its own transaction, and changes nothing. This holds permanently.

### 3.5 How `policy.activate` differs

| | `policy.bootstrap` | `policy.activate` |
|---|---|---|
| Precondition | Zero active versions | Exactly one active version |
| Resolver | Not consulted | Fully consulted |
| Effect | Creates first active pointer | Supersedes current → new active, atomically |
| Repeatable | Never | Yes |
| Surface | Operator entrypoint | Operator entrypoint |
| Hash source | Server-computed | Server-computed |

---

## 4. Bootstrap ordering

```
1. policy.bootstrap        (outside the resolver — the only such operation)
2. organization.provision  (resolver-gated, like every other protected operation)
3. ordinary Organization authorization
```

Tenant provisioning before policy activation is **prohibited**. Provisioning is audit-required and every audit event records the policy version in force; with no active version there is nothing to record, and Invariant 6 denies on an unresolvable active version. More fundamentally, permitting a protected operation to execute with no policy in force is exactly the fail-open the contract exists to prevent.

**The payoff of this ordering is the amendment's central property.** Because `organization.provision` runs after a policy is in force, it is a fully resolver-gated operation rather than a second bypass — evaluated through the ordinary chain, with Platform as the authority *source* in place of an organizational grant. **The special bootstrap surface is exactly one operation, not two.**

---

## 5. Authorization boundaries

**What Platform authority is:** an infrastructure trust root exercised through an operator entrypoint. Not a Membership, not a RoleAssignment, not a row in any table, not reachable over the client-facing API. Invariant 5 is upheld — no native platform role field is ever the authorization root.

**What it may do, exhaustively:** `policy.bootstrap` (once ever), `policy.activate`, `organization.provision`, and the platform-level catalog/registry writes already named in Section 3. Absence from this list is denial (Inv 6). The resolver contains **no Platform bypass branch for tenant data**.

**What it never acquires — at provisioning or ever:** no Membership in the provisioned Organization; no RoleAssignment; no standing read of that Organization's `RestrictedStudent` or `HighlyRestricted` content; no read of its AuditLogEvent rows; no read of its OutboxEvent rows; no re-provision, suspend, or deprovision capability.

Prohibition 15 is preserved unchanged. **No break-glass mechanism is created here, and none may be inferred from this amendment.**

If a platform operator is legitimately designated as the first administrator of some Organization, they hold that authority **as an ordinary org member via Membership + RoleAssignment**. The two authority sources remain separate and are never merged (Inv 8).

---

## 6. Transaction boundaries

| Tx | Records committing or failing together | Inv 15 |
|---|---|---|
| **T-BOOT** | First `AuthorizationPolicyVersion` (active) + Platform-scoped AuditLogEvent | Satisfied; no Outbox required |
| **T-PROV** | `Organization` + `Membership` (`active`) + `RoleAssignment` + Organization-scoped AuditLogEvent | Satisfied; no Outbox required |
| **T-FAIL** | One audit event, `outcome = denied \| failed` | **Outside Inv 15** — no domain change to be atomic with |

Concurrency: T-BOOT races resolve through the active-singleton partial unique index; T-PROV races resolve through the `organization_key` and `provisioning_request_id` unique constraints. Constraints, not isolation level, do the work.

---

## 7. Database-enforced invariants

These belong in PostgreSQL rather than server convention, because they must hold even when application code is wrong.

| # | Invariant | Mechanism |
|---|---|---|
| I1 | Unique Organization key | `UNIQUE (organization_key)` |
| I2 | Organization identity | `PRIMARY KEY (id)` |
| I3 | Duplicate-provisioning protection | `UNIQUE (provisioning_request_id)`, `NOT NULL` |
| I4 | **One enduring Membership per user/org** | `UNIQUE (user_id, organization_id)` — regardless of status, across deactivation and reactivation |
| I5 | Exactly one current RoleAssignment per key | Partial unique index on `(membership_id, role_category) WHERE is_current` |
| I6 | Tenant FK chain | `membership.organization_id → organization.id`; `role_assignment.membership_id → membership.id`; RoleAssignment carries no own `organization_id`, resolving it through the immutable chain (Inv 1) |
| I7 | Identity existence and non-deletion | `membership.user_id → auth identity (id) ON DELETE RESTRICT` |
| I8 | Append-only AuditLog | Revoke `UPDATE`/`DELETE` from every application role **and** a trigger raising on either — belt and braces |
| I9 | Active policy singleton | Partial unique index on `(status) WHERE status = 'active'` |
| I10 | Policy record is pointer-only | Trigger permitting only the `active → superseded` transition; every other column immutable after insert |
| I11 | Never zero OrgAdmins | Deferred constraint trigger counting effective administrators per affected Organization at transaction end, plus the per-Organization row lock in reducing operations |
| I12 | Provisioning privilege separation | The API database role holds **no INSERT** on the organization or policy-version tables; only the provisioner role does |
| I13 | Audit actor coherence | Check constraints binding `actor_type` to which actor columns must be NULL / NOT NULL |

I12 is worth emphasising: it makes "only the provisioner may create tenants or policy versions" a **database grant**, not a code convention. A bug in an HTTP handler cannot create an Organization.

---

## 8. Fail-closed cases

| Condition | Behavior |
|---|---|
| No active `AuthorizationPolicyVersion` | All protected operations deny, `organization.provision` included |
| Active `policy_hash` != computed in-code hash | **All protected operations deny** |
| More than one active version detected | All protected operations deny (I9 makes this unreachable; checked anyway) |
| `policy.bootstrap` with an active version present | Deny; self-extinguished permanently |
| `organization.provision` without the provisioning credential | Deny |
| Provisioning attempted over HTTP | No route exists — the surface is absent, not guarded |
| Designated administrator not found or unconfirmed | Abort, full rollback |
| Designated administrator email resolving to multiple identities | Abort, full rollback |
| `organization_key` collision | Abort, full rollback |
| `provisioning_request_id` replay | Create nothing; return original identity |
| Any sub-step failure in T-PROV | Full rollback — no partial tenant |
| AuditLog write failure | Entire transaction rolls back (Prohibition 12) |
| Revoking or deactivating the last effective OrgAdmin | Deny (I11) |
| Malformed input | Deny at the validation boundary, before any database work (Inv 6) |

---

## 9. AuditLog requirements

C3 requires `AuditLogEvent` to represent a third actor kind. Fields added:

| Field | Purpose |
|---|---|
| `actor_type` | Enum: `user \| platform_operator \| service` |
| `actor_user_id` | Nullable — NULL for `platform_operator` and `service` |
| `actor_membership_id` | Nullable — NULL for `platform_operator` and `service` |
| `platform_operator_reference` | Nullable — operator identity from the infrastructure trust root; **never a fabricated org user** (Inv 18) |
| `service_operation_key`, `service_source_record_reference` | Nullable — already implied by Inv 18 and Section 3 |
| `authority_path` | Discriminated: `{organization_grant: role_assignment_id, coach_scope_assignment_id?}` \| `{platform_authority: platform_authority_key}` \| `{service: service_operation_key}` |
| `organization_id` | **Now nullable** — NULL denotes a Platform-scoped event |
| `policy_key`, `policy_version_label`, `policy_hash` | Recorded on every event; self-referential on `policy.bootstrap` |
| `outcome` | Enum including `denied` and `failed` |
| `correlation_id` | Correlates multi-row events where they occur |

**Scoping rule.** Platform-scoped events (`organization_id IS NULL`) are readable by **no** OrgAdmin — Section 2's grant covers "own-org events", and a platform event belongs to no organization. Organization-scoped events remain readable by that Organization's OrgAdmin only. The provisioning event is Organization-scoped, so the newly provisioned administrator can read the genesis record of their own tenant.

**Event counts.** `policy.bootstrap` success: one Platform-scoped event. `organization.provision` success: **one** Organization-scoped event covering all three created records. Either, on failure: one event in its own transaction.

**Anti-double-logging rule.** `organization.provision` is one controlled operation, not a composition of three. It does **not** additionally emit `role.assign` or membership events.

All rows remain fully immutable and `HighlyRestricted`. No sensitivity classification changes.

---

## 10. Membership mutability ruling

The Section 2 / Section 5 contradiction — Section 2 classifying `Membership` as `AO+S (status)` while Section 5 stated "temporal, no supersession — status itself is the current fact" — is **resolved in favour of the Section 5 model**.

Deciding evidence: Section 2's own uniqueness rule, `unique (user_id, org_id) regardless of status`, is **unsatisfiable** under append-only supersession, because superseded rows would share that pair. The rule only coheres if exactly one Membership row exists per pair for all time.

**Canonical invariant, now in force:**

- Exactly one Membership row may ever exist for a given `(user_id, organization_id)`.
- `UNIQUE (user_id, organization_id)` applies regardless of status.
- Membership is never superseded and has no `is_current` chain.
- Membership status is the current standing of an enduring Organization relationship.
- Status changes occur only through controlled operations.
- `membership.deactivate` changes the existing row's status in place and atomically closes all currently-effective dependent RoleAssignment, CoachScopeAssignment and CaptainAssignment grants.
- Reactivation restores Membership standing only; it never resurrects previously closed grants. A new authorization tenure requires fresh grants.
- Historical authorization changes are preserved through AuditLog and through the immutable/superseding dependent grant records, **not** through duplicate Membership rows.
- Hard deletion of Membership remains prohibited through ordinary product workflows.

**Consequential edit to Global Invariant 10.** Invariant 10's enumeration of permitted patterns — supersession, sequential append, controlled one-way lifecycle closure — did not cover a *reversible* temporal status (`active` to `inactive` and back), although Section 2's legend already defined `Temporal` and assigned it to `RosterAssignment` and `EquipmentAssignment`. The enumeration was extended to name the `Temporal` pattern explicitly, and to state that for such entities history lives in AuditLog and dependent records rather than in duplicated rows. This was a pre-existing under-specification in Invariant 10 which the ruling made unavoidable; it is recorded here rather than applied silently.

---

## 11. Adopted discretionary decisions

All four ratified:

1. **Membership created directly at `active`** by provisioning, after independent identity resolution and verification. Creating at `invited` would leave the Organization with zero *effective* administrators at commit, violating the zero-OrgAdmin invariant, and Section 4 defines no `membership.accept` at Layer 0.
2. **Zero-OrgAdmin invariant adopted** — see 2.7.
3. **One audit stream**, `AuditLogEvent`, with nullable `organization_id` and the discriminated actor/authority model. No separate platform audit entity; this keeps the amendment free of new entities.
4. **Operator-entrypoint-only surfaces** for `policy.bootstrap`, `policy.activate` and `organization.provision`. Self-service tenant provisioning remains a future architecture gate.

---

## 12. Final bootstrap invariants

**B1.** Exactly one operation — `policy.bootstrap` — executes outside the authorization resolver. Every other operation, `organization.provision` included, is resolver-gated.

**B2.** `policy.bootstrap` is self-extinguishing: it succeeds at most once per database, ever.

**B3.** Platform authority is an infrastructure trust root — never a persisted grant, never reachable over the client-facing API, never a native platform role field.

**B4.** Platform authority over a tenant is exhausted at the instant provisioning commits.

**B5.** Platform authority never acquires Membership, RoleAssignment, or standing read of any Organization's `RestrictedStudent` content, `HighlyRestricted` content, AuditLog, or Outbox.

**B6.** `policy_hash` is always server-computed from the in-code artifact; a mismatch against the active pointer denies every protected operation.

**B7.** Provisioning is genesis-only and is never repeatable for an existing Organization.

**B8.** A provisioned tenant is exactly one Organization, one Membership, one OrganizationAdministrator RoleAssignment, and one AuditLogEvent — nothing more.

**B9.** Every Organization has at least one effective Organization Administrator at every committed transaction boundary.

**B10.** Every bootstrap failure denies and leaves no partial state; failure audit events commit separately and are outside Global Invariant 15.

**B11.** Exactly one Membership row exists per `(user_id, organization_id)` for all time; status is transitioned in place, never by duplication.

**B12.** This amendment introduces no new entity and no new sensitivity classification.
