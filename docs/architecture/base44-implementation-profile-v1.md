# Base44 Implementation Profile — v1

## 0. Status, authority and precedence

**Status:** frozen implementation profile for the active v1 substrate.
**Adopted strategy:** Option B — Base44 v1 with a preserved PostgreSQL/Supabase Reference Profile.
**Frozen at:** the Base44 Implementation Profile v1 Architecture Freeze Gate, following `BASE44 V1 TECHNICAL GATE PASSED`.
**Effective from:** merge of this document. No production Base44 Esports entity or business logic existed when it was written — that is the point of freezing it now.

Precedence, exactly:

1. **`implementation-contract.md` remains the canonical, full-strength architecture.** This profile does not rewrite it, does not amend it, and does not make any of its statements false. The contract describes the target guarantees; this profile describes which of those guarantees the scoped Base44 v1 implements *differently*, and how the difference is contained.
2. **Amendment 001 remains in force as written.** Its bootstrap semantics are unchanged; only their *enforcement mechanism* differs here, and every such difference is recorded in Section 5.
3. **Where this profile is silent, the canonical contract governs.** Silence is never permission. In particular, silence never converts a contract prohibition into an allowance.
4. **This profile may narrow, never widen.** A deviation recorded below may reduce what v1 implements or change how a guarantee is enforced. No deviation grants an actor authority the contract does not grant, exposes data the contract does not expose, or relaxes a Section 10 prohibition.

A deviation that is not written in Section 5 does not exist. An implementation agent that believes it needs one must stop and request an architecture decision, exactly as `implementation-handoff.md` Section 3 already requires.

---

## 1. Ratified implementation strategy

### 1.1 Base44 — the active practical v1 substrate

| Concern | v1 mechanism |
|---|---|
| Authentication / identity | Base44 Auth. Establishes *which verified identity* this is, and nothing more. |
| Application persistence | Base44 entities. |
| Controlled operations | Base44 backend functions. |
| Direct client CRUD on governed/internal resources | Denied by Base44 access rules (RLS). |
| Service-role access | Confined to trusted backend operations. Never reachable from the browser. |
| Authorization | Application-owned centralized resolver (Global Invariant 4), running inside backend functions. |
| Reconciliation | Scheduled Base44 workflows. |

### 1.2 PostgreSQL / Supabase — the preserved Reference Profile

Preserved, dormant, and not running any production workload. See `reference-profile-status.md` for the exact disposition. In summary: the backend stays merged, CI stays running, the Supabase project stays preserved, custom runtime and provisioner passwords stay unset, and the two deferred Session-pooler checks stay deferred — deferred, not dropped.

### 1.3 No hybrid runtime

**An active Base44 + PostgreSQL hybrid v1 is explicitly rejected.** There is exactly one authoritative store for v1 application data, and it is Base44. No v1 feature reads from or writes to the Supabase database at runtime, no dual-write exists, and no synchronisation process is authorized. The Reference Profile is a preserved alternative, not a second half of the system.

This is a security boundary, not a preference. A hybrid would create two disagreeing sources of authority truth with no transaction spanning them, which is strictly worse than either profile alone.

---

## 2. Empirically established platform facts, and the rules frozen from them

Each fact below was established by executing against the platform, not inferred from documentation, naming, or analogy. Each is followed by the implementation rule frozen from it. **The rules are binding; the evidence is recorded so a future agent can tell what was actually tested and what was not.**

### 2.1 Conditional / concurrency-safe writes — SUPPORTED for scoped v1

**Evidence.** 50 trials; two concurrent version-conditional writes per trial; approximately 100% exactly-one-winner behaviour; zero lost updates; version mismatch rejected; final state remained consistent.

**Frozen rules.**

- Every concurrency-sensitive controlled operation **must** use an explicit **application-owned version field** and a conditional / version-guarded write.
- A plain read followed by an unconditional `update(id, data)` is **prohibited** for concurrency-sensitive state. This includes every status transition, every supersession, every `is_current` flip, and every grant closure.
- **Do not claim PostgreSQL-equivalent transaction isolation.** What was demonstrated is single-record compare-and-set, not multi-record serializability. No document, comment, or product claim may describe this as ACID.

**What this does not establish.** It does not establish atomicity across two or more records. Every multi-record contract transaction (Section 7 of the contract) is therefore a deviation, handled in Section 5 below.

### 2.2 Full-fidelity export — SUPPORTED, with one hard pagination rule

**Evidence.** 60/60 records exported exactly once when pagination used unique `id` ordering. Nulls, Unicode and emoji, long text, booleans, numbers and timestamps all preserved. Application-owned UUID, reference and supersession values preserved. Current and historical rows preserved. Server-only / internal records exportable through trusted service-role access.

Built-in metadata: `id`, `created_by_id`, `created_date` and `updated_date` are available. **`created_by` email is NOT reliably returned and must not be migration-critical.**

**Observed failure.** Pagination using non-unique `-created_date` produced both duplicates and omissions.

**Frozen rules.**

- All migration and export pagination **must** order by a stable unique key (`id`), or by a separately verified cursor mechanism. Ordering by a non-unique field is prohibited.
- Provenance that matters **must** live in application-owned fields. Base44 platform metadata may be retained alongside it, never relied upon as the sole carrier. `created_by` email specifically may not appear in any migration path.

### 2.3 Resolver query capability — SUPPORTED for scoped v1

**Evidence.** Query capability verified sufficient to execute the full resolver chain within a backend function.

**Frozen resolver chain** (this is the contract's Global Invariant 4 chain, expressed in Base44 terms — it is not a new chain):

```
authenticated actor
  → organization
  → active Membership
  → additive Role / CoachScope / Captain grants
  → resource
  → resource organization
  → action
  → sensitivity
  → policy
  → decision
```

**Frozen rules.**

- **Membership liveness is checked at decision time**, on every protected operation. A cached or previously-resolved membership state is not sufficient.
- **A stale Role / Scope / Captain assignment never grants authority when Membership is inactive.** In the Reference Profile the cascade in Global Invariant 11 closes those grants inside the deactivation transaction; here the cascade is best-effort and reconciled, so the resolver must independently refuse to honour a grant whose Membership is not active. This is the deviation's containment, and it is mandatory.
- **Base44 / provider-native roles are never the application's authorization root** (Global Invariant 5). The Base44 role, and any provider-supplied claim, are never consulted by the resolver.
- Grants remain **additive** (Global Invariant 8). No "highest role wins" merge.
- **Default deny** (Global Invariant 6) is unchanged: no matching policy row, malformed input, unresolvable organization / scope / sensitivity, or unresolvable active policy version all deny.

### 2.4 Function-only operation boundary — SUPPORTED

**Evidence.** For an RLS-locked verification entity, ordinary authenticated client/browser access produced: create → 403; read → empty result; update → 404; delete → 404. Trusted backend / service-role access succeeded.

**Frozen rules.**

- **Governed and internal entities must deny direct client CRUD**, for every role, exactly as Global Invariant 17 and Prohibition 9 require.
- The UI calls **application operations / backend functions**. UI modules must not import, reference, or mutate governed Base44 entities directly.
- Service-role access is available **only** inside backend functions. No service-role credential, key, or capability reaches the browser bundle or `.base44/environment.json`.
- A read returning an empty result is a *deny*, not an absence. No UI may interpret an empty governed-entity read as "no data exists".

### 2.5 Scheduled / background execution — SUPPORTED for reconciliation, NOT for durable delivery

**Evidence.** Three real scheduled executions on a five-minute cadence. A successful scheduled execution wrote RLS-locked / server-only resources. A deliberately failed scheduled execution was visible as `FAILED`; the failure did not halt future schedule; the subsequent scheduled run succeeded. No overlap observed. **No separate scheduled-level retry of the failed tick was observed.** Heartbeat / run state is sufficient to detect failed, missed and stalled sweeps with application-side gap detection.

**Frozen rules.**

- Base44 scheduled workflows are **sufficient for v1 reconciliation sweeps**.
- They are **not** equivalent to the Reference Profile Durable Outbox. Global Invariant 14's at-least-once, idempotent, crash-recoverable guarantee is **not** provided by the scheduler itself.
- **Failed scheduled work requires application-owned detection, retry and compensation.** A tick that fails is lost unless the application re-detects the work on a later tick. Every sweep must therefore be written to be *re-derivable from persisted state*, not to consume a one-shot queue.
- Every sweep writes a heartbeat / run record. Gap detection is application-side and mandatory (Section 7).
- No sweep may assume it runs exactly once, on time, or without a predecessor having failed. Every sweep is idempotent.

---

## 3. Base44 v1 scope

**Scope is an allowlist.** A domain, entity or operation that is not admitted below is not in v1. Silence is exclusion, not discretion.

### 3.1 Included

- **Identity / Access / Policy** — Organization, Membership, RoleAssignment, CoachScopeAssignment, CaptainAssignment, AuthorizationPolicyVersion, and the centralized resolver.
- **Teams / Rosters** — Team, TeamSeason, OrganizationGameOffering, RosterAssignment, RosterDisplayProjection.
- **Scheduling / Attendance** — Event, RecurringEventSeries, Practice and practice activities, EventParticipationExpectation, EventParticipationAdjustment, AvailabilityResponse, AttendanceRecord.
- **Competition / Matches** — Competition and provider/offering/ruleset records, TeamSeasonCompetitionEntry, ExternalOpponent, Match, MatchParticipant, OrganizationMatchEvent, MatchSchedule, MatchLineupEntry, MatchParticipantLineupLock, MatchSegment, ProvisionalResultSubmission, MatchParticipation, AcceptedResult, PlayerCompetitiveResult, and the non-shared match projections — **single-Organization matches and matches against an `ExternalOpponent` only**.
- **Equipment** — EquipmentAssetType, EquipmentAsset, EquipmentAssetAllocation, EquipmentAssignment, EquipmentConditionAssessment, EquipmentIssueReport, EquipmentServiceRecord, EquipmentProjection.
- **Eligibility** — EligibilityRequirement, EligibilityEvaluation, EligibilityStatusProjection, and the eligibility combination computation.
- **Restriction — included only to the extent required by canonical lineup and participation gating.** `ParticipationRestriction` and `RestrictionReview`, with the operations `restriction.create` and `restriction.review`, exist in v1 solely so that the restriction-clear leg of `lineup.lock`'s canonical precondition can actually be evaluated. See Section 3.4 for the exact boundary. **This admits no Conduct or disciplinary functionality of any kind.**
- **Development, except `PrivateCoachNote`** — PlayerDevelopmentProfile, Goal, SkillEvaluation, CoachFeedback, PlayerReflection, DevelopmentEvidenceLink, DevelopmentCheckpoint, PlayerDevelopmentProfileProjection.
- **Operational administration and audit** necessary for the above, in the degraded form Section 6 defines.

### 3.2 Excluded from Base44 v1

These are **security and architecture boundaries, not backlog priorities.** None may be admitted by an implementation decision; each requires its own architecture gate.

- **`PrivateCoachNote`.**
- **The Conduct / disciplinary domain**, including `ConductIncident`, `ConductResponse` and `AccountabilityConcernReport`, and the operations `conduct.report`, `conduct.respond` and `concern.report`.
- **`SharedCompetition` cross-tenant functionality** — every cross-Organization surface, including `SharedMatchStateProjection`, `SharedMatchSubmissionProjection`, `SharedAuditEventProjection`, cross-org `MatchResultConfirmation`, `MatchDiscrepancyFlag` and `MatchDispute` arising from a second participating Organization, and the authority-selector machinery (`lifecycle_start/complete/cancel`, `schedule_change`, `finalization_authority_model`).
- **The Communication / notification domain** initially — Announcement, AnnouncementAudience, Notification, NotificationDeliveryAttempt, ActionItem, CommunicationPreference, ActionCenterProjection, OutboxEvent, OutboxHealthProjection, and the operations `announcement.publish`, `announcement.correct` and `outbox.replay`.
- **Any feature requiring evidentiary-grade AuditLog** (Section 6).

**Consequence worth stating plainly:** every `HighlyRestricted` entity in Contract Section 9 is excluded from v1 **except `AuditLogEvent`**, which is admitted only in the operational-grade form Section 6 defines. `SharedAuditEventProjection` is excluded with the rest of `SharedCompetition`.

### 3.3 Not admitted, by silence

Named here so that no agent has to guess. These are outside v1 because nothing in Section 3.1 admits them:

- **Accountability** — `AccountabilityExpectation`, `AccountabilityRecord`. (`AccountabilityConcernReport` is separately and explicitly excluded with Conduct.)
- **Competitive Tier** — the whole domain, including `CompetitiveTierAssessment`, its framework/adoption records, and both tier projections. Contract Section 6 places it after Competition and Eligibility; it is not required by anything admitted above.

### 3.4 Restriction — ratified derived inclusion, and its exact boundary

**Ratified.** `ParticipationRestriction` and `RestrictionReview` are included in Base44 v1 as a **derived consequence of `lineup.lock` being in scope**, not as an independent scope expansion.

**Why.** `lineup.lock`'s preconditions in Contract Section 4 are *"roster validity + eligibility = eligible + restrictions clear + ruleset constraints, all atomically"*, and Contract Section 7 makes this a four-way gate. `implementation-handoff.md` Section 4 states the same dependency independently: *"Do not build Phase 4's `lineup.lock` operation before Phase 5's Eligibility/Restriction domains exist — the operation's own atomicity requirement (Contract Section 7) makes this a hard blocker, not a convenience ordering."*

**The ratified decision is that `lineup.lock` will not ship with the restriction-clear leg unevaluated.** The alternative — running the gate with one leg vacuous — is a silent weakening of a named security gate, which Section 0 rule 4 prohibits.

**The boundary is exact. Restriction is included only to the extent canonical lineup and participation gating requires:**

- **In scope:** creating a `ParticipationRestriction`, reviewing it through `restriction.review` (`continue | modify | revoke | expire`), reading a Player's own restrictions and a scoped coach's / OrgAdmin's view of them, and evaluating "restrictions clear" inside `lineup.lock`.
- **Authority is unchanged.** `restriction.create` and `restriction.review` remain **OrgAdmin-only**. Coach and Captain gain nothing — Contract Section 3 already denies Coach any `RestrictionReview` access and Prohibition 5 already denies Captain restriction-review authority. Neither is relaxed.
- **Provenance is mandatory.** `source_type` / `source_reference_id` are always preserved (Global Invariant 9), and a `modify | revoke | expire` review creates a superseding Restriction inheriting the original provenance, exactly as Contract Section 5 specifies.
- **`RestrictionReview.review_reason_code` remains a closed enum** with no free-text rationale (Global Invariant 20, Prohibition 8).

**What this does not admit — Conduct remains excluded.**

- **Conduct-sourced provenance is structurally unavailable in v1.** The Conduct domain is excluded (Section 3.2), so no `ConductIncident` exists for a `source_reference_id` to point at. A v1 Restriction can only carry a `source_type` whose source domain is itself admitted.
- **No `ConductIncident`, `ConductResponse` or `AccountabilityConcernReport`** is created, read, referenced or implied by anything in this inclusion.
- **Prohibition 17 is unaffected and still binding:** no equipment damage, missing or overdue status, and no incomplete accountability record, may automatically create or imply a `ConductIncident`.
- **Prohibition 8 is unaffected and still binding:** no narrative from a higher-sensitivity source may be copied into a Restriction or a review reason code.
- Admitting the Conduct/disciplinary domain remains a **Reference Profile activation trigger** (Section 11) and requires its own architecture gate. This inclusion is not a step toward it.

`ParticipationRestriction` and `RestrictionReview` are both `RestrictedStudent` in Contract Section 9, and that classification is unchanged.

## 4. Single-organization v1 posture

**Frozen.**

- v1 is intended for **one district / program first**.
- `organization_id` is **stored and enforced from day one**, on every Organization-owned record, exactly as Global Invariant 1 requires. Single-tenancy is an operational fact, never an excuse to omit the column or skip the check.
- Client-supplied organization context remains a **selector, never proof** (Global Invariant 2). The server re-derives the actor's Memberships and independently verifies the resource's true Organization, even when there is only one Organization to verify against.
- **Do not claim production-grade multi-tenant isolation for Base44 v1.** The isolation that exists is application-enforced, single-record-CAS-backed, and reconciled after the fact. It has not been demonstrated under adversarial multi-tenant conditions, because there is only one tenant.
- **Introducing a second production Organization is a mandatory Reference Profile reassessment trigger** (Section 11).

---

## 5. Deviation register

This is the complete list of places where Base44 v1 implements a canonical guarantee differently. It is keyed to the canonical text so a reader can check each claim. **Nothing outside this table is a permitted deviation.**

### 5.1 Global Invariants

| # | Canonical guarantee | v1 disposition |
|---|---|---|
| 1 | Organization is the sole tenant/privacy boundary | **Held.** `organization_id` enforced from day one; see Section 4 for the single-tenant caveat on *claims*, not on enforcement. |
| 2 | Client organization context is a selector, never proof | **Held**, unchanged. |
| 3 | `SharedCompetition` is the only cross-tenant exception | **Narrowed to zero.** No cross-tenant surface exists in v1 (Section 3.2). The invariant is satisfied vacuously, not relaxed. |
| 4 | Authorization is centralized | **Held.** One resolver, inside backend functions (Section 2.3). |
| 5 | Native platform role fields are never the authorization root | **Held.** Base44 roles and claims are never consulted. |
| 6 | Default deny | **Held**, unchanged. |
| 7 | Sensitivity is independent of authorization | **Held.** Contract Section 9 classifications are unchanged for every admitted entity. |
| 8 | Grants are additive | **Held**, unchanged. |
| 9 | Provenance is preserved, never collapsed | **Held**, by application-owned provenance fields (Section 9). |
| 10 | Historical immutability; supersession / append-only / `Temporal` transition | **DEVIATION — enforcement mechanism.** Base44 records are technically mutable and the platform enforces no append-only constraint. Immutability is maintained by *controlled-code convention*: only the owning controlled operation writes these records, writes are version-guarded (Section 2.1), and the reconciliation sweeps in Section 7 detect multiple-current and duplicate-enduring-row violations. The *patterns* in Contract Section 2/5 are unchanged and may not be substituted. |
| 11 | Membership deactivation closes dependent grants in the same transaction | **DEVIATION — atomicity.** The cascade cannot be one transaction. Containment is twofold and both parts are mandatory: (a) the resolver checks Membership liveness at decision time and refuses any grant whose Membership is inactive (Section 2.3), so an un-cascaded grant confers nothing; (b) the *grants attached to inactive Membership* sweep (Section 7) closes the residue. Reactivation still restores Membership standing only — closed grants are never resurrected. Membership remains a single enduring row per `(user_id, organization_id)`. |
| 12 | Safe projections are the only cross-role / cross-sensitivity path | **Held.** Projection field sets remain frozen per Contract Section 8, minus the excluded shared projections. |
| 13 | AuditLog required, atomic with the domain change, append-only, HighlyRestricted | **DEVIATION — atomicity and append-only enforcement.** See Section 6. Audit remains required, server-only, and `HighlyRestricted`; it is **not** atomic with the domain change and **not** tamper-proof. |
| 14 | Durable Outbox, at-least-once, idempotent, crash-recoverable | **Not applicable in v1 — no Outbox exists.** Communication is excluded (Section 3.2), so no v1 operation has asynchronous downstream work. The single operation whose Outbox column reads `Required` outright, `match_schedule.supersede`, is a **ratified scoped deviation** — see Section 8.1. |
| 15 | Domain change + AuditLog + Outbox commit or fail together | **Vacuous in v1.** Exactly three of the contract's thirty-three operations require both Audit and Outbox — `announcement.publish`, `announcement.correct` and `match_schedule.supersede`. The first two are excluded with Communication; the third is handled in Section 8. No v1 operation is subject to Invariant 15, so v1 neither satisfies nor violates it — and **no implementation may cite that as licence to split an audit write it could have kept together.** |
| 16 | No client-authored actor identity, outcome, policy version, scope, or resource identity | **Held.** All server-derived inside backend functions. |
| 17 | Backend/internal-only entities have no client-facing CRUD path | **Held**, empirically (Section 2.4). |
| 18 | Background execution derives Organization scope from persisted source data | **Held.** Scheduled workflows resolve scope from persisted records and never fabricate a human actor; sweeps record a `system` actor. |
| 19 | Damage / missing / overdue / fault are never inferred from one another | **Held**, unchanged. |
| 20 | No free-text field carries higher-sensitivity narrative | **Held**, unchanged, and strengthened by the exclusion of every narrative-bearing `HighlyRestricted` entity from v1. |

### 5.2 Transaction Catalog (Contract Section 7)

**DEVIATION — every multi-record row.** Base44 provides single-record compare-and-set, not multi-record transactions. Every transaction row in Contract Section 7 that spans more than one record is implemented as an ordered, version-guarded sequence with a defined recovery posture, not as an atomic commit.

Mandatory pattern for every such operation:

1. **Order by safety.** Write the record whose premature existence is *least* harmful first; make the record that grants authority or publishes visibility last. A partially-applied operation must fail toward *less* authority and *less* exposure, never more.
2. **Guard every step** with the version condition from Section 2.1. A failed guard aborts the remaining steps.
3. **Compensate what can be compensated**, in the same function invocation, on failure.
4. **Mark the operation with a correlation / operation id** (Section 9) on every record it writes, so a partial application is detectable by correlation rather than by guesswork.
5. **Be detected by a sweep** (Section 7) if it neither completes nor compensates.

Named consequences:

- **`equipment.return`** loses the contract's structural guarantee that it is *"impossible to complete leaving `Asset.status` stale"*. Order: ConditionAssessment → Asset status derivation → Assignment closure; the orphaned-reference and correlation sweeps detect a stalled sequence.
- **`roster.move`** can transiently leave a Player on neither roster or, if ordered the other way, on both. Order so that the Player is never on two active rosters: close first, then create, and let the sweep detect an un-recreated assignment.
- **`lineup.lock`**'s four-way gate is evaluated inside one function invocation against version-guarded reads, then the lock is written with a guard. It is *validated atomically enough* to reject a stale gate, but the underlying facts can change between validation and write; the guard on the lock record is what makes a stale write fail rather than silently win.
- **`restriction.review`**, **`result.finalize`** and **`result.correct`** follow the same ordered, guarded, correlated pattern.

### 5.3 Amendment 001 — Bootstrap Authority

Amendment 001's semantics are **unchanged**. Its enforcement mechanism deviates.

| Amendment element | v1 disposition |
|---|---|
| Bootstrap ordering (`policy.bootstrap` → `organization.provision` → ordinary authorization) | **Held**, unchanged and mandatory. |
| `policy.bootstrap` runs outside the resolver, is self-extinguishing | **Held.** Operator entrypoint only; denied permanently once any `active` policy version exists. |
| `organization.provision` is an ordinary resolver-gated protected operation | **Held.** |
| Identity verification — resolve, never accept as submitted | **Held**, unchanged. `created_by` email is not usable here (Section 2.2); the resolved identifier is persisted as `Membership.user_id`. |
| T-BOOT / T-PROV as single atomic transactions; *"no partial tenant is ever observable"* | **DEVIATION — atomicity.** Provisioning is staged: the Organization is created in a **non-effective provisioning state** that the resolver treats as conferring nothing, then Membership, then the OrganizationAdministrator RoleAssignment, then the audit record, and **only then** is the Organization transitioned to effective by a version-guarded write. "No partial tenant is observable" is preserved as *"no partial tenant is ever effective"*. An abandoned provisioning is detected by the incomplete-provisioning sweep (Section 7) and is never silently completed. |
| Idempotency by `provisioning_request_id` | **Held**, by an application-owned uniqueness check plus the duplicate sweep — see I3 below. |
| Genesis-only; never re-provision, suspend or deprovision | **Held**, unchanged (Prohibition 20). |
| Zero-OrgAdmin invariant | **DEVIATION — enforcement.** No deferred constraint trigger and no row lock exist. Enforcement is: a version-guarded read-modify-write against a per-Organization administrator-count guard record, taken by **every** operation that could reduce the count (`role.revoke`, `membership.deactivate`), plus the *zero effective OrgAdmins* sweep as detection of last resort. The invariant itself — at least one effective OrgAdmin at every committed boundary — is unchanged, and `role.revoke` / `membership.deactivate` still **deny** on the last effective administrator. |
| Failure-path audit events, independently committed, `outcome = denied \| failed` | **Held**, and structurally easier here — there is no transaction to roll back. |
| Platform authority exhausted at provisioning commit | **Held**, unchanged (Prohibition 19). |
| No break-glass | **Held**, unchanged (Prohibition 15). Nothing in this profile creates one. |

### 5.4 Amendment 001 database-enforced invariants (I1–I13)

Amendment 001 places these in PostgreSQL *"because they must hold even when application code is wrong."* **Base44 provides no equivalent.** Every one of them becomes application-enforced in v1, which is a real reduction in assurance and the single largest reason the Reference Profile is preserved.

| # | Invariant | v1 enforcement |
|---|---|---|
| I1 | Unique `organization_key` | Guarded uniqueness check in `organization.provision` + duplicate sweep. |
| I2 | Organization identity | Application-generated UUID (Section 9); Base44 `id` retained separately. |
| I3 | Unique `provisioning_request_id` | Guarded check in `organization.provision` + duplicate sweep. Replay creates nothing and returns the original identity. |
| I4 | One enduring Membership per `(user_id, organization_id)` | Guarded write + **duplicate Membership sweep** (Section 7). |
| I5 | Exactly one current RoleAssignment per `(membership_id, role_category)` | Guarded supersession + **multiple-current RoleAssignment sweep**. |
| I6 | Tenant FK chain | No foreign keys. Application-enforced reference integrity + **orphaned-reference sweep**. RoleAssignment still resolves its Organization through the immutable chain and still carries no own `organization_id`. |
| I7 | Identity existence, `ON DELETE RESTRICT` | Application-enforced. Identity resolution at write time; orphaned-reference sweep detects a vanished identity. |
| I8 | Append-only AuditLog (revoked grants + trigger) | **Convention only** — see Section 6. This is the deviation that makes v1 audit operational-grade rather than evidentiary-grade. |
| I9 | Active policy singleton | Guarded activation + **multiple active policy versions sweep**. Detection of more than one active version still denies all protected operations. |
| I10 | Policy record is pointer-only, `active → superseded` only | Controlled-code convention + guarded transition; sweep detects any other mutation via correlation. |
| I11 | Never zero OrgAdmins (deferred constraint + row lock) | Guard record + guarded write + **zero effective OrgAdmins sweep** (Section 5.3). |
| I12 | Provisioning privilege separation — the API role holds no INSERT on organization/policy tables | **DEVIATION — no database grant exists.** Separation is by function boundary: only the operator-entrypoint provisioning function may create an Organization or a policy version, and no client-reachable route invokes it (Prohibition 18). *"A bug in an HTTP handler cannot create an Organization"* is downgraded from a database grant to a code boundary. This is a named loss of assurance. |
| I13 | Audit actor coherence check constraints | Validated in the audit-writing helper; sweep detects incoherent rows. |

### 5.5 Implementation Verification Checklist (Contract Section 11)

`implementation-handoff.md` Section 5 requires the full Contract Section 11 checklist to pass at the end of every implementation phase. **Every item still runs in v1.** Seven of them cannot pass in their canonical form, and each has a frozen v1 form. Nothing is deleted from the checklist, and no item may be marked passed on the strength of a deviation that is not listed here.

| Checklist item | v1 form |
|---|---|
| **Transaction atomicity** — *"a forced mid-transaction failure leaves no partial state (test by injecting failure at each named sub-step)"* | Injection at each named sub-step is still required. The assertion changes: a forced failure must leave **no state that grants authority or exposes data**, must leave every written record carrying the operation's correlation id, and must be detected by the sweep that owns it (Section 7). "No partial state" becomes "no *effective* partial state, and every partial state is detectable". |
| **AuditLog** — *"atomically with its domain change; confirm zero mutability on any written row"* | Correlation-completeness replaces atomicity: every audit-required operation still produces exactly one (or correctly correlated multiple) audit record, verified by the R9 join rather than by a transaction. Zero mutability is verified against the **controlled-code path** — no code other than the audit writer may write the entity — not against a platform guarantee. |
| **Outbox** | **Vacuous in v1** — no Outbox exists (Section 5.1, Invariant 14). The item becomes live again with the Communication gate, and R12 must exist before it does. |
| **Supersession / current-state correctness** — *"exactly one `is_current = true` row per key at all times"* | *At all times* is not achievable. The v1 assertion: a conditional write that would create a second current row is **rejected** (Section 2.1), and any second current row that nevertheless appears is detected by R2–R4 and escalated. Membership's `UNIQUE (user_id, organization_id)` is verified the same way, via R1. |
| **Zero-OrgAdmin prevention** — *"including under concurrent revocation of two different administrators in separate transactions"* | The concurrency test is still required and still must show exactly one revocation succeeding. The mechanism under test is the guard record and its version condition (Section 5.3), not a deferred constraint and row lock. |
| **Provisioning idempotency and non-repetition** — *"a forced mid-transaction failure leaves no Organization, Membership, or RoleAssignment"* | A forced failure may leave a **non-effective** Organization. The assertion becomes: no *effective* Organization, no usable Membership, no honoured RoleAssignment, the resolver grants nothing against the residue, and R11 reports it. Replay of the same `provisioning_request_id` still creates nothing and emits no second audit event; a second provisioning against an existing `organization_key` is still denied. |
| **No direct client CRUD bypass** | Verified empirically for every in-scope internal entity by the Section 2.4 method (create → 403, read → empty, update → 404, delete → 404). `AnnouncementAudience`, `NotificationDeliveryAttempt` and `OutboxEvent` do not exist in v1, so those three are vacuous. |

Every other checklist item — schema correctness, authorization, Organization isolation, controlled-write enforcement, sensitivity exposure, lifecycle legality, fail-closed behaviour, tests, bootstrap self-extinguishing, policy hash enforcement, Platform authority containment — runs **unchanged**.

### 5.6 Implementation Prohibitions (Contract Section 10)

**All twenty-two prohibitions remain in force, unchanged and unrelaxed.**

Prohibitions whose subject matter is entirely outside v1 — 5's conduct clauses, 13 and 14's `SharedCompetition` clauses, 16's Notification clauses — are satisfied vacuously and become live again the moment their domain is admitted.

**Prohibition 8 is live, not vacuous.** Its `ConductIncident` / `ConductResponse` / `PrivateCoachNote` *sources* are excluded from v1, but its two in-scope destinations are not: `RestrictionReview.review_reason_code` must remain a closed enum (Restriction is in scope — Section 3.4), and `EligibilityEvaluation` must use a typed `source_reference` + `reason_code` and never free text. Its *"raw academic detail"* source is also in scope through Eligibility. Only the Notification `template_parameters` clause is vacuous.

**Prohibitions 17 and 19 are likewise live**, because Equipment, Eligibility and Restriction are all in v1: no equipment damage, missing or overdue status, and no incomplete accountability record, may automatically create or imply a `ConductIncident` — and in v1 there is no `ConductIncident` to create, which makes any code that tries to a defect rather than a policy question.

Prohibition 12 — *never commit a domain mutation whose audit write failed* — cannot be enforced by rollback here; its v1 form is in Section 6.3.

---

## 6. Audit posture

**Base44 v1 AuditLog is operational-grade, not evidentiary-grade.**

### 6.1 Required fields

Every audit record must carry:

- an **application-generated UUID** (not the Base44 `id`);
- a **correlation / operation id** shared with every record written by the same operation;
- **actor identity** (server-derived, never client-authored — Global Invariant 16);
- **authority source** — the resolved grant that authorized the operation, not merely the role name;
- **organization**;
- **operation** (the canonical `operation_key`);
- **resource / reference**;
- **timestamp** (application-owned — Section 9);
- **result / outcome** where appropriate, including `denied` and `failed`.

### 6.2 Properties

- **Server-only.** No client read or write path of any kind. Classification remains `HighlyRestricted` (Contract Section 9), unchanged.
- **Append-only by controlled-code convention.** There is no platform mechanism enforcing it — no revoked UPDATE/DELETE grant, no trigger. Amendment 001's I8 "belt and braces" does not exist here.
- **Not atomic with the domain change.** Global Invariant 13's atomicity does not hold.

### 6.3 Consequences that must be implemented, not merely acknowledged

Because a domain mutation and its audit write cannot be one ACID transaction, reconciliation **must** detect:

- a **domain mutation with a missing audit record**;
- an **audit record with no corresponding mutation**, where detectable.

Both are correlation-id joins, which is why the correlation id is mandatory rather than convenient.

Prohibition 12's v1 form: the audit write is attempted **before** the operation's final authority-granting or visibility-granting step wherever the ordering in Section 5.2 permits it, and an operation whose audit write fails **must not proceed to that final step**. Where an operation has already applied domain effects when the audit write fails, it must compensate, and if it cannot, it must record the discrepancy for operator review. Proceeding silently is prohibited.

### 6.4 The hard limit

**No product or institutional process may rely on Base44 v1 AuditLog as tamper-proof or evidentiary history.** Not for a disciplinary determination, not for an eligibility appeal, not for a records request, not for anything a person could be asked to defend. Any requirement of that kind is a Reference Profile activation trigger (Section 11), and *"any feature requiring evidentiary-grade AuditLog"* is out of v1 scope by Section 3.2.

---

## 7. Reconciliation model

**Reconciliation is a primary integrity mechanism in Base44 v1, not an emergency repair mechanism.** In the Reference Profile, constraints make certain states unreachable. Here they are reachable, and reconciliation is what makes them *short-lived and visible*. It is load-bearing.

### 7.1 Governing rules

- **Detection is mandatory; repair is not.** Every sweep detects. A sweep may auto-repair only where the repair rule is deterministic and frozen in the table below.
- **Authority and security anomalies escalate to an operator.** Where two rows disagree about who holds authority, v1 **does not silently choose a winner**. It reports.
- **Every sweep is idempotent and re-derivable from persisted state** (Section 2.5). No sweep consumes a one-shot queue.
- **Every sweep writes a heartbeat / run record** — start, finish, outcome, counts — and gap detection over those records is itself a sweep.
- **A sweep that finds nothing still writes its heartbeat.** Silence must be distinguishable from failure.
- **Findings are `HighlyRestricted` where they reference audit content, and otherwise carry the sensitivity of what they reference.** A reconciliation report is not a laundering path for sensitive narrative (Global Invariant 20).

### 7.2 Required sweeps

| # | Sweep | Detects | Auto-repair? | Operator review | Cadence |
|---|---|---|---|---|---|
| R1 | Duplicate Membership | More than one Membership row for `(user_id, organization_id)` — I4 | **No** | **Always.** Merging Memberships merges authority tenure; only an operator may decide which row is the enduring one. | Hourly |
| R2 | Multiple-current RoleAssignment | More than one `is_current` RoleAssignment per `(membership_id, role_category)` — I5 | **No** | **Always.** Authority anomaly. | Hourly |
| R3 | Multiple-current CoachScopeAssignment | More than one current scope grant per key | **No** | **Always.** Authority anomaly. | Hourly |
| R4 | Multiple-current CaptainAssignment | More than one current CaptainAssignment per team-season | **No** | **Always.** Authority anomaly. | Hourly |
| R5 | Grants attached to inactive Membership | Current Role / Scope / Captain grants whose Membership is not active — the Global Invariant 11 cascade residue | **Yes — close the grant.** Deterministic and frozen: the contract already requires these grants closed, and the resolver already refuses to honour them, so closing them only makes persisted state match decided state. Never the reverse: a sweep never reactivates a Membership to match a grant. | Report every repair; no approval needed | Every 15 minutes |
| R6 | Orphaned references | A reference whose target does not exist — I6, I7 | **No** | **Always.** | Hourly |
| R7 | Zero effective OrgAdmins | An Organization with no effective OrganizationAdministrator — I11 | **No** | **Always, and urgently.** This is the state Amendment 001 exists to prevent; there is no break-glass to recover it. | Every 15 minutes |
| R8 | Multiple active policy versions | More than one `AuthorizationPolicyVersion` with `status = active` — I9 | **No.** While detected, **all protected operations deny** (Amendment 001 Section 8), which is the fail-closed response, not a repair. | **Always, and urgently.** | Every 5 minutes |
| R9 | Missing AuditLog correlation | A domain mutation with no audit record for its correlation id, and an audit record with no corresponding mutation where detectable — Section 6.3 | **No** | **Always.** An audit gap is never repaired by writing a backdated audit record. | Hourly |
| R10 | Sweep heartbeat gap | A sweep that failed, was missed, or stalled — Section 2.5 | **No** | **Always** if a sweep has missed more than one expected run, or failed twice consecutively. | Every 5 minutes |
| R11 | Incomplete provisioning | An Organization left in the non-effective provisioning state past a bounded age — Section 5.3 | **No.** Never silently completed. | **Always.** | Hourly |
| R12 | Outbox / notification inconsistency | Reserved. Not implemented in v1 because Communication is excluded. **Mandatory before Communication is admitted** (Section 8). | — | — | — |
| R13 | Multiple-current ParticipationRestriction | More than one `is_current` `ParticipationRestriction` per subject/key. Required because Restriction is in v1 (Section 3.4) and gates `lineup.lock`: two disagreeing current restrictions make that gate nondeterministic, which is a fail-open risk, not a cosmetic one | **No** | **Always.** Choosing which restriction is current is a participation decision about a student, never a sweep's to make | Hourly |

Cadences above are the frozen *maximum* interval for each sweep's class. A shorter interval is an operational decision; a longer one is an architecture decision.

### 7.3 Observability

- Sweep heartbeats and findings are readable by an operator without granting any tenant-content access.
- Counts, ages and outcomes — never sensitive narrative — are what surfaces in any operational view.
- R10's own heartbeat gap is the outermost check. If R10 itself stops running, that is visible as the absence of its heartbeat, and detecting it is an operational monitoring responsibility outside the platform.

---

## 8. Notification / Outbox posture

**Frozen: Base44 native scheduling is insufficient for Reference Profile Durable Outbox equivalence.** Section 2.5's evidence is explicit — a failed scheduled tick was not retried by the platform.

**Communication remains excluded from v1 until a dedicated architecture gate accepts the weaker model.** That gate, not an implementation decision, is what admits it.

If and when Communication enters Base44 scope, all of the following are required, and this list is frozen now so the later gate cannot quietly shorten it:

- an **application-owned Outbox entity** — never the platform scheduler as the queue;
- **idempotency keys** on every event;
- **scheduled dispatch and reconciliation**, both;
- **explicit attempt state** — pending, in-flight, succeeded, failed, dead-letter — with attempt counts and timestamps;
- **stale and failed detection**, including in-flight rows whose worker died;
- **duplicate-safe downstream effects**, because delivery is at-least-once;
- sweep **R12** implemented (Section 7.2).

**Do not claim same-transaction domain + audit + outbox atomicity.** It does not exist here and cannot be added by any amount of application code.

### 8.1 `match_schedule.supersede` — ratified v1 Outbox deviation

`match_schedule.supersede` is the only in-scope operation whose Outbox column in Contract Section 4 reads `Required` outright rather than *"if Notification required"*. Its Outbox row exists to drive a downstream schedule-change Notification.

**Ratified deviation:** **`match_schedule.supersede` produces no `OutboxEvent` in Base44 v1 while Communication/Notification is excluded from v1 scope.**

Recorded explicitly, because each part is load-bearing:

1. **The domain mutation and the operational AuditLog record remain required.** The old `MatchSchedule` is superseded, the new one is created, and the audit record is written with the operation's correlation id (Section 6.1). Nothing about the operation's own behaviour is relaxed — only the downstream side effect is absent. The ordered, guarded, correlated pattern of Section 5.2 applies to it unchanged.
2. **There is no notification or outbox side effect because no Communication consumer exists in v1.** The Outbox row is not omitted because it is inconvenient or because Base44 cannot write it; it is omitted because Communication is out of scope, so the row would have no consumer, no delivery path, and no downstream effect to be idempotent about. Writing an unconsumed queue row would be a false claim of durability, not a partial guarantee. Schedule changes reach people by read-time derivation in the UI.
3. **Admitting Communication automatically reopens this requirement**, and doing so requires the **dedicated Communication architecture gate** together with every element frozen in Section 8 above — an application-owned Outbox entity, idempotency keys, explicit attempt state, stale and failed detection, duplicate-safe downstream effects, and sweep R12. The requirement is not reopened by an implementation decision, and the gate may not shorten that list.

**This is a scoped profile deviation, not a canonical-contract rewrite.** Contract Section 4's `Required` cell and Contract Section 7's `match_schedule.supersede` transaction row are unchanged and remain the full-strength Reference Profile behaviour. What is scoped is what **Base44 v1** implements, for exactly as long as Communication is out of v1.

Every other in-scope operation's Outbox column is conditional on a Notification that v1 does not have, so no other operation is affected.

---

## 9. Identity and provenance portability

**Frozen from day one.** These exist so that a Reference Profile activation is a migration rather than a rewrite, and because Section 2.2 showed platform metadata is not fully reliable.

Every portable domain object carries:

- an **application-generated UUID** as its portable identity;
- application-owned **`created_at`**, and **`updated_at`** where the entity's mutability model makes it meaningful;
- an explicit **`created_by_user_id`** wherever provenance matters — never `created_by` email (Section 2.2);
- **`organization_id`**;
- **correlation / operation ids** linking every record written by one operation;
- **supersession ids** (`supersedes_*_id`) per the entity's Contract Section 2 mutability model;
- **`is_current`** where the model is `AO+S`;
- **source type / source reference fields** required by the canonical contract — `ParticipationRestriction.source_type` / `source_reference_id`, `EligibilityEvaluation` typed `source_reference` + `reason_code`, and every other provenance field Contract Section 2 names.

The **Base44 platform id is retained separately where useful and is never the sole portable identity.** No application field, reference or foreign key stores a Base44 id in place of the application UUID.

Export and migration pagination follows Section 2.2's rule without exception: order by unique `id`, or by a separately verified cursor.

---

## 10. Operation adapter boundary

**Mandatory before the first production entity is wired into the UI.** Not after the first screen works — before.

### 10.1 The rule

There is a **substrate-neutral application operation layer** between the frontend and Base44. The frontend depends on **operation contracts and types**. The frontend does not depend on **Base44 persistence semantics** — not on entity shapes, not on `id`, not on `created_date`, not on the SDK's return envelopes, not on RLS behaviour.

A UI module that imports a Base44 entity handler, or that branches on a Base44 error shape, has violated this boundary.

### 10.2 Naming

**Exact operation names and signatures are derived from Contract Section 4, not invented here.** The canonical `operation_key` is the identity of the operation; the adapter's function name is a presentation of it.

The mapping for the operations named at this gate:

| Adapter operation | Canonical `operation_key` (Contract Section 4) |
|---|---|
| `assignRole` | `role.assign` |
| `revokeRole` | `role.revoke` |
| `assignCoachScope` | `scope.assign` |
| `assignCaptain` | `captain.assign` |
| `deactivateMembership` | `membership.deactivate` |
| `moveRoster` | `roster.move` |
| `lockLineup` | `lineup.lock` |
| `unlockLineup` | `lineup.unlock` |
| `submitMatchResult` | `result.submit` |
| `finalizeResult` | `result.finalize` |
| `evaluateEligibility` | `eligibility.evaluate` |

This table is illustrative of the *mapping discipline*, not an exhaustive v1 operation list. Every in-scope operation in Contract Section 4 gets an adapter entry, and the canonical `operation_key` is what is recorded in the audit record (Section 6.1) regardless of what the adapter calls it.

### 10.3 Operations that must have no adapter entry

`policy.bootstrap`, `policy.activate` and `organization.provision` are **operator entrypoints** and must not be reachable from the client-facing surface in any form (Prohibition 18). They get no adapter operation, no route, and no UI affordance. The surface is **absent, not guarded**.

### 10.4 A CI boundary check the first implementation gate must resolve

CI's *"Frontend must not depend on Base44"* boundary check fails the build if `@base44` appears in `frontend/package.json` or `frontend/src`. It was written when Base44 was only a preview harness, and it is **correct and enforcing today** — no v1 code exists, so nothing legitimately needs that dependency.

It is recorded here because the first gate that wires the operation adapter to Base44 will have to decide where the adapter lives and what that check should then assert. **Resolving it is that gate's work, not this one's, and the check is not to be relaxed in the meantime.** Whatever that gate decides, the rule in Section 10.1 is unaffected: the frontend depends on operation contracts and types, never on Base44 persistence semantics.

---

## 11. Reference Profile activation triggers

Any one of these is a **mandatory reassessment**. Reaching one does not necessarily mean migrating immediately — it means the Base44 assumptions in this profile may no longer be accepted without a new architecture decision, and continuing without one is not an option.

1. **A second production Organization.**
2. **Conduct / disciplinary records entering scope.**
3. **`PrivateCoachNote` entering scope.**
4. **An institutional requirement for evidentiary or tamper-resistant audit.**
5. **Cross-organization `SharedCompetition`.**
6. **An institutional requirement for stronger database-enforced integrity** — any requirement that an invariant hold *even when application code is wrong* (Amendment 001 Section 7).
7. **Unacceptable reconciliation drift or failure rate** — sustained findings in Section 7's sweeps, or repeated R10 heartbeat gaps.
8. **Base44 export capability materially changing or becoming insufficient** — the Section 2.2 evidence no longer holding.
9. **Scale or latency making the Base44 resolver impractical.**

Each trigger maps to something this profile depends on. If the dependency fails, the profile is no longer the ratified answer.

---

## 12. Institutional governance gate

**Technical approval does not constitute institutional approval to store real student education records in Base44.**

`BASE44 V1 TECHNICAL GATE PASSED` is a statement about platform capability. It is not a statement about whether this organization may lawfully or contractually place student data on this platform.

Before real student production data is introduced, the product owner / institution must determine that Base44 is approved for the intended student-data use, **including whatever vendor, privacy and security review or agreement the institution requires.** That determination is theirs, not an engineering decision, and not something this repository can record on their behalf.

**Synthetic development may proceed before that institutional decision.** Real student data may not.

---

## 13. What this profile may never weaken

Listed so no future deviation can be argued into existence by silence:

1. **Default deny** (Global Invariant 6) and the fail-closed cases in Amendment 001 Section 8.
2. **Centralized authorization** (Global Invariant 4) and the resolver chain in Section 2.3.
3. **Native platform roles are never the authorization root** (Global Invariant 5).
4. **Sensitivity classifications** (Contract Section 9) for every admitted entity.
5. **No client-authored actor identity, outcome, policy version, scope, or resource identity** (Global Invariant 16).
6. **No client CRUD on governed or internal entities** (Global Invariant 17, Prohibition 9).
7. **All twenty-two Implementation Prohibitions** (Contract Section 10), including the absence of a Platform break-glass (Prohibition 15) and the absence of any client-reachable provisioning surface (Prohibition 18).
8. **The zero-OrgAdmin invariant** (Amendment 001).
9. **No free-text field carries higher-sensitivity narrative** (Global Invariant 20).
10. **The v1 exclusions in Section 3.2**, each of which requires its own architecture gate to admit.

---

## 14. Ratification record

Both items this profile originally raised for decision have been ratified. **No item in this profile is awaiting ratification.**

| # | Decision | Outcome | Where it lives |
|---|---|---|---|
| 1 | **Restriction domain** — `ParticipationRestriction` and `RestrictionReview` admitted as a derived consequence of `lineup.lock` being in scope | **Approved**, bounded to canonical lineup and participation gating. `lineup.lock` will not ship with the restriction-clear leg unevaluated. Conduct remains excluded and is not broadened by this. | Sections 3.1, 3.4 |
| 2 | **`match_schedule.supersede` Outbox behaviour** — no `OutboxEvent` while Communication is excluded | **Approved** as a scoped profile deviation. Domain mutation and operational AuditLog remain required; no side effect exists because no consumer exists; admitting Communication reopens the requirement and needs the dedicated Communication gate. | Sections 5.1 (Invariant 14), 8.1 |

A future item that requires a decision is added to this table by an architecture gate, not by an implementation agent. An implementation agent that believes it needs one stops and requests the gate (Section 0).
