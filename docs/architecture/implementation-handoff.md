# Esports Platform — Implementation Handoff

## 1. What is authoritative

**`implementation-contract.md`** is the sole source of truth for implementation. On current `main`, Amendments 001–004 are ratified and in force. On this architecture branch, Amendment 005 is incorporated across the contract/profile/handoff for consistency review but remains pending ratification until its architecture PR merges. Amendment 003 closes Layer 1 Team/Roster architecture; Amendment 004 ratifies the Base44 TeamSeason completion ordering; Amendment 005 proposes the complete Layer 2 Events/Practice/Attendance/Availability + Equipment closure. **Do not implement Layer 2 from this review branch.** Runtime implementation begins only from a work order pinned to the post-amendment `main` SHA after ratification/merge.

### 1.1 The active v1 substrate profile

The contract is the full-strength **Reference Profile**. The active v1 is implemented on Base44, which cannot provide every guarantee the contract specifies. **Before implementing anything for the active v1, read `base44-implementation-profile-v1.md` in full.** It records — explicitly, and as the only permitted deviations — which canonical guarantees v1 implements differently, what the v1 scope is, and what may never be weakened.

Precedence is exact and does not change: the contract governs; the profile narrows and never widens; **where the profile is silent, the contract governs**. A deviation not written in the profile's deviation register does not exist — stop and request an architecture decision rather than inferring one, exactly as Section 3 below requires.

`reference-profile-status.md` records the disposition of the preserved PostgreSQL/Supabase Reference Profile. **No hybrid runtime is authorized.**

## 2. What is historical provenance only

Every prior phase document, correction gate, infrastructure gate, and review gate (Phases 1A–1D, 2A–2I, the AuditLog gate, the Durable Outbox gate, all correction rounds, and the Cross-Domain Review and its revisions) is **design history, not implementation instruction**. Where any of them appears to say something different from the contract, **the contract wins**. Do not read them to resolve an implementation question — the contract's Section 12 traceability appendix exists only to explain *where* a rule came from, not to override it.

## 3. What must never be inferred

Do not invent, assume, or fill any of the following if the contract is silent on it:

- Authorization for any role/operation pair not explicitly listed in Contract Section 3 or 4. Absence = deny.
- Sensitivity classification for any entity not listed in Contract Section 9. If an entity is genuinely missing from that registry, stop and ask — do not classify it yourself.
- Field shapes beyond what Contract Section 2 states. Do not add convenience fields, denormalized caches, or "obviously useful" columns.
- Captain, Coach, or Organization Administrator authority beyond what is explicitly granted (Contract Section 3, Section 10 prohibitions).
- Any cross-Organization access path beyond the narrow `SharedCompetition` surfaces explicitly named in the contract.
- Retry counts, lease timeouts, or other Outbox/operational tuning parameters — these are deliberately left as implementation-time operational decisions, not architectural ones, but must not be chosen in a way that violates the at-least-once/idempotency guarantees in Contract Section 1.
- A Platform Administrator break-glass mechanism — this is a named, deliberate future dependency, not something to build ambiently in Phase 0/1.
- Any Layer 1 Team/Roster field, lifecycle, operation, scope-containment, idempotency, captain-uniqueness, roster-projection, or reconciliation rule already resolved by Amendment 003. In particular, do not re-infer a Player-role prerequisite for roster participation, a Game-scope target, multiple current captains, or different roster-move/cascade semantics.
- Any Layer 2 Event/Practice/Attendance/Availability or Equipment field, enum, lifecycle, operation key, scope-containment predicate, idempotency/recovery rule, projection field, or reconciliation disposition already resolved by Amendment 005. In particular, do not re-infer Organization-wide Events, Game-scope matching, roster regeneration after scheduling, mutable Availability history, a different Player equipment issue window, a generic EquipmentAsset.status write, two effective EquipmentAssignments, or a different R18–R30 repair posture.

**Provisioning authority is not break-glass — do not conflate them.** Amendment 001 defines a narrow, genesis-only Platform provisioning authority (`policy.bootstrap`, `organization.provision`). The distinction is exact:

- **Permitted (Amendment 001):** establishing the minimum trusted state required for the authorization model to begin operating. It creates one Organization, one Membership, one OrganizationAdministrator RoleAssignment, and the first AuthorizationPolicyVersion. It confers **no read access to any tenant content whatsoever**, and Platform authority over that Organization is exhausted the instant provisioning commits.
- **Still forbidden:** break-glass investigative access — any standing or ad-hoc Platform read into an Organization's `RestrictedStudent`/`HighlyRestricted` content, AuditLog, or Outbox. This remains a named future dependency requiring its own scoped, time-boxed, audited grant, and must not be inferred from the existence of provisioning authority.

Nothing in Amendment 001 widens Platform authority beyond the operations enumerated in Contract Section 3. Absence from that enumeration remains denial.

If a genuine gap is found during implementation — something the contract needed to specify but didn't — stop and surface it explicitly rather than resolving it silently, exactly as every prior architecture gate in this project required.

## 4. Implementation dependency order

Follow Contract Section 6 exactly. In sequence, not in parallel where a dependency exists:

0. **Bootstrap** (Amendment 001): `policy.bootstrap` installs the first active `AuthorizationPolicyVersion`, **then** `organization.provision` performs tenant genesis. This order is mandatory — no protected operation may execute before a resolvable, hash-verified active policy version exists, and `organization.provision` is itself a protected operation. `policy.bootstrap` is the only operation in the architecture that runs outside the authorization resolver, and it is self-extinguishing.
1. **Foundation**: Organization, Membership, RoleAssignment, CoachScopeAssignment, CaptainAssignment, the centralized authorization resolver, AuditLogEvent, OutboxEvent. The Membership lifecycle operations (`membership.invite`, `membership.activate`, `membership.deactivate` — Amendment 002) are part of this layer.
2. **Team/Roster**: Team, TeamSeason, RosterAssignment, OrganizationGameOffering, RosterDisplayProjection. **Architecture closure is Amendment 003.** Implementation must use its exact entity fields, operation keys, lifecycle rules, CoachScope containment, captain semantics, idempotency classes, and Base44 recovery/reconciliation profile; do not invent alternatives.
3. **Events/Practice/Attendance/Availability** and **Equipment** — canonical Layer 2, architecture closure is Amendment 005. They may proceed in parallel because both depend only on Foundation + Team/Roster. Implementation must use Amendment 005's exact fields, operation keys, Event→TeamSeason scope chain, `viewer_has_expectation`, allocation containment, immutable scheduling snapshot semantics, Equipment pending/inert standing, projection shape, and Base44 I18–I30 / R18–R30 profile; do not invent alternatives.
4. **Competition/Match/Scoring/Results** (depends on 2 for Roster, 3 for OrganizationMatchEvent binding).
5. **Eligibility/Accountability/Conduct/Restriction** and **Development/Goals/Skills** (may proceed in parallel — Eligibility is a hard dependency of Match's `lineup.lock` operation, so it must exist before that specific operation can be safely built, even if the rest of Match proceeds first).
6. **Competitive Tier** (depends on 4 and 5).
7. **Communication** (depends on every prior layer).

Do not build Phase 4's `lineup.lock` operation before Phase 5's Eligibility/Restriction domains exist — the operation's own atomicity requirement (Contract Section 7) makes this a hard blocker, not a convenience ordering.

## 5. Verification procedure — required at the end of every implementation phase

Run the full checklist in **Contract Section 11** before declaring any phase complete. Every item must pass. Do not proceed to the next dependency layer with an unresolved checklist item from the current one — later layers assume earlier layers' fail-closed and atomicity guarantees actually hold.

If any checklist item fails and the fix would require changing something the contract specifies, **stop and report it** rather than silently deviating from the contract to make the check pass.

## 6. Layer 1 post-Amendment-003 implementation boundary

Amendment 003 is human-ratified architecture. It does **not** authorize direct implementation against the pre-amendment Layer 0 baseline. After the architecture-amendment PR merges, capture the new authoritative `main` SHA and write the Layer 1 implementation work order against that exact SHA and the then-current Base44 runtime.

Layer 1 implementation may use synthetic data only until the institutional student-data gate is separately satisfied.

## 7. Layer 2 post-Amendment-005 implementation boundary

Amendment 005 is architecture closure, not direct runtime authorization.

After the Amendment 005 architecture PR merges:

1. capture the exact new authoritative `main` SHA;
2. verify post-merge CI is green;
3. create a fresh Layer 2 implementation branch from that exact SHA;
4. write the Layer 2 runtime implementation work order against that SHA and the then-current Base44 runtime;
5. keep all acceptance synthetic-only until the institutional student-data gate is separately satisfied.

Layer 2 implementation is two independently gateable tracks:

- **Layer 2A:** Events / Practice / Attendance / Availability
- **Layer 2B:** Equipment

They may be implemented in parallel only after the shared schema/resolver/policy substrate they depend on is in place.

The following are hard implementation stops:

- any required field/enum not present in the canonical contract;
- any unnamed Layer 2 write path;
- any need to change Layer 1 semantics;
- any need to activate Game CoachScope matching;
- any need for Communication/Notification/Outbox;
- any need for Conduct;
- any multi-record Base44 workflow that does not match the profile's ratified ordering/recovery;
- any proposal to use real student data before institutional approval.

