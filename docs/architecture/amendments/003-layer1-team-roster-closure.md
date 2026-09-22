# Amendment 003 — Layer 1 Team/Roster Architecture Closure

**Status:** RATIFIED — architecture only; implementation is not authorized by this amendment alone.  
**Ratified:** 2026-09-22  
**Baseline:** `48a381a797d3e619d925a6843c8ab2b1df7bb49b`

This amendment closes the field, lifecycle, operation, authorization, projection, reconciliation, idempotency, and Base44-recovery gaps required to implement canonical **Layer 1 — Team/Roster** without widening the layer boundary or weakening Layer 0.

It is incorporated into `../implementation-contract.md`, `../implementation-handoff.md`, and `../base44-implementation-profile-v1.md`. Where the amendment text and the incorporated canonical contract later differ, the incorporated contract wins.

---

## 1. Layer 1 boundary

Layer 1 remains exactly:

- `Team`
- `TeamSeason`
- `RosterAssignment`
- `OrganizationGameOffering`
- `RosterDisplayProjection`

Layer 1 also activates the already-canonical `CaptainAssignment` behavior that depends on TeamSeason/RosterAssignment and makes Team/TeamSeason CoachScope resolution operational.

No Event, Equipment, Competition, Match, Eligibility, Development, Competitive Tier, Communication, Conduct, Accountability, Outbox, or SharedCompetition domain is admitted by this amendment.

---

## 2. Canonical entity closure

### 2.1 Team

`Team` remains `Ctrl`, `StandardOperational`, Player/Coach/OrgAdmin readable and OrgAdmin writable.

Canonical fields:

- `team_uuid` — application-generated portable UUID.
- `organization_id` — immutable Organization reference.
- `game_id` — immutable opaque portable game identity.
- `team_display_name` — bounded display name.
- `status` — `active | archived`.
- application-owned `created_at`, `updated_at`, actor provenance, and `correlation_id`.
- `creation_request_id` — immutable durable logical-request identity for `team.create`, distinct from execution `correlation_id`.

Base44 additionally carries application-owned `version` for CAS; that field is substrate-specific.

A Team may share a `game_id` with another Team in the same Organization. No Team-level uniqueness rule beyond `team_uuid` is introduced.

### 2.2 TeamSeason

`TeamSeason` remains `Ctrl`, `StandardOperational`, Player/Coach/OrgAdmin readable, OrgAdmin writable, and Coach writable only through the scoped update transitions ratified below.

Canonical fields:

- `team_season_uuid` — portable UUID.
- `team_id` — immutable Team reference.
- `team_season_display_name` — bounded display name.
- `status` — `planning | active | completed | withdrawn`.
- application-owned timestamps, actor provenance, `correlation_id`.
- `creation_request_id` — immutable durable logical-request identity for `team_season.create`.

Organization resolves through the immutable chain TeamSeason → Team → Organization. TeamSeason carries no denormalized `organization_id`.

### 2.3 RosterAssignment

`RosterAssignment` remains `Temporal`, `StandardOperational`, and is never repointed to another TeamSeason.

Canonical fields:

- `roster_assignment_uuid` — portable UUID.
- `membership_id` — immutable Membership reference.
- `team_season_id` — immutable TeamSeason reference.
- `participation_status` — `active | reserve | inactive | completed | removed`.
- `gamer_tag` — optional bounded in-game handle for this roster tenure; it may vary across games/seasons.
- application-owned timestamps, actor provenance, `correlation_id`.
- `creation_request_id` — immutable durable logical-request identity for the `roster.assign` or `roster.move` that created the row.

Organization resolves through RosterAssignment → TeamSeason → Team → Organization. `membership_id` must resolve to the same Organization at every write.

At most one **non-terminal** RosterAssignment may exist per `(membership_id, team_season_id)`. Multiple non-terminal assignments across different TeamSeasons are permitted; this amendment creates no "primary team", "one team per game", varsity/JV exclusion, or similar rule.

Roster participation is **independent of Player RoleAssignment**. A Membership may remain on a roster without an active Player RoleAssignment. Player role continues to govern Player authorization and remains an independent prerequisite for Captain effectiveness.

### 2.4 OrganizationGameOffering

`OrganizationGameOffering` remains `Ctrl`, `StandardOperational`, Player/Coach/OrgAdmin readable and OrgAdmin writable.

Canonical fields:

- `organization_game_offering_uuid` — portable UUID.
- `organization_id` — immutable Organization reference.
- `game_id` — immutable opaque portable game identity.
- `status` — `active | inactive`.
- application-owned timestamps, actor provenance, `correlation_id`.
- `creation_request_id` — immutable durable logical-request identity for `offering.create`.

Uniqueness remains `(organization_id, game_id)` regardless of status.

`game_id` is an opaque portable identity, not a reference to OrganizationGameOffering and not a newly-created `Game` entity.

### 2.5 Membership Layer 0 amendment

The accepted Layer 0 `Membership` entity gains one optional `RestrictedStudent` field:

- `display_name` — bounded display name.

Existing rows require no backfill and may remain null. No Membership identity, authority, lifecycle, uniqueness, or sensitivity semantics change.

`gamer_tag` is **not** added to Membership; it belongs to RosterAssignment.

### 2.6 CaptainAssignment Layer 0 amendment

The accepted Layer 0 `CaptainAssignment` entity gains:

- `creation_request_id` — immutable durable logical-request identity for `captain.assign`, distinct from execution `correlation_id`.

There were zero CaptainAssignment rows at ratification, so no data backfill is required. Existing AO+S identity, authority, supersession, and sensitivity semantics are unchanged.

---

## 3. Canonical lifecycle closure

### 3.1 Team

```
active → archived
```

`archived` is terminal. `team.archive` is denied while any child TeamSeason is `planning` or `active`.

### 3.2 TeamSeason

```
planning → active       (OrgAdmin or Coach(scope))
active   → completed    (OrgAdmin or Coach(scope))
planning → withdrawn    (OrgAdmin only)
active   → withdrawn    (OrgAdmin only)
```

`completed` and `withdrawn` are terminal. No backward transition exists.

The existing Coach rule "update only, no create/revoke" is resolved as follows: transition to `withdrawn` is the canonical revocation/withdrawal action and is OrgAdmin-only.

When TeamSeason transitions `active → completed`, **all non-terminal child RosterAssignments must become `completed`, and affected current CaptainAssignments must close**. This is one conceptual controlled workflow attached to `team_season.transition`.

### 3.3 OrganizationGameOffering

```
active ⇄ inactive
```

No deletion/terminal state is introduced.

### 3.4 RosterAssignment

```
active  ⇄ reserve
active  ⇄ inactive
reserve ⇄ inactive

active|reserve|inactive → completed
active|reserve|inactive → removed
```

`completed` and `removed` are terminal and irreversible.

---

## 4. Controlled operation catalog additions

All operations below are resolver-gated, Organization-scoped, audit-required unless explicitly stated otherwise, and have no Outbox requirement in Layer 1.

| operation_key | actors | canonical effect |
|---|---|---|
| `team.create` | OrgAdmin | Create Team at `active`. |
| `team.update` | OrgAdmin | Update `team_display_name` only. |
| `team.archive` | OrgAdmin | `active → archived`; deny while an open TeamSeason exists. |
| `team_season.create` | OrgAdmin | Create TeamSeason at `planning`. |
| `team_season.transition` | OrgAdmin; Coach(scope) for forward progressions only | Apply the legal TeamSeason transition graph; `active → completed` owns the roster/captain completion cascade. |
| `offering.create` | OrgAdmin | Create one Offering for `(organization_id, game_id)` at `active`. |
| `offering.transition` | OrgAdmin | `active ⇄ inactive`. |
| `roster.assign` | OrgAdmin, Coach(scope) | Initial placement on a TeamSeason at `active` or `reserve`. |
| `roster.transition` | OrgAdmin, Coach(scope) | In-tenure `active/reserve/inactive` transition. |
| `roster.complete` | OrgAdmin, Coach(scope), system cascade | Terminal transition to `completed`; close affected captain. |
| `roster.remove` | OrgAdmin, Coach(scope) | Terminal transition to `removed`; close affected captain. |
| `roster.move` | OrgAdmin, Coach(scope) | Close source RosterAssignment as `removed`, then create destination assignment on a different TeamSeason. |
| `captain.assign` | OrgAdmin, Coach(scope) | Create/replace current captain for one TeamSeason. |
| `captain.close` | OrgAdmin, system cascade | Close current captain without replacement. |

### 4.1 Class A durable idempotency

The following creation/multi-record operations require durable logical request identity:

- `team.create`
- `team_season.create`
- `offering.create`
- `roster.assign`
- `roster.move`
- `captain.assign`

The created row persists the request as immutable `creation_request_id`. `creation_request_id` is distinct from `correlation_id`: the former identifies the same logical request across retries; the latter links one execution and its records/audit.

Same request id + same material input returns/resumes the prior logical result. Same request id + different material input is an idempotency conflict.

### 4.2 Class B target-state idempotency

`team.update`, `team.archive`, `team_season.transition`, `offering.transition`, `roster.transition`, `roster.complete`, `roster.remove`, and `captain.close` require no durable request ledger. If already in the exact requested target state, they return success with no second mutation; incompatible state returns conflict/invalid. CAS remains independent of idempotency.

---

## 5. Roster semantics

### 5.1 Initial assignment

`roster.assign` requires:

- active Membership;
- destination TeamSeason in `planning` or `active`;
- same Organization across Membership and TeamSeason chain;
- actor authorization;
- no non-terminal RosterAssignment already exists for the same `(membership_id, team_season_id)`.

It does **not** require Player RoleAssignment.

Initial participation status is `active` by default or may be `reserve`. `inactive` is not an initial state.

### 5.2 Move

`roster.move` requires a non-terminal source and a different destination TeamSeason in `planning` or `active`. Destination status defaults to `active` and may be `reserve`.

A pre-existing non-terminal destination assignment denies the move. Moving within the same TeamSeason is not a move; use `roster.transition`.

A source current CaptainAssignment closes. Captaincy is never automatically created at the destination; a new `captain.assign` is separate.

---

## 6. CoachScope and centralized authorization

Layer 1 admits `OrganizationWide`, `Team`, and `TeamSeason` scope evaluation.

- **OrganizationWide** matches all Team, TeamSeason, RosterAssignment resources in the actor's Organization.
- **Team** matches the Team, every child TeamSeason, and their RosterAssignments.
- **TeamSeason** matches that TeamSeason, its RosterAssignments, and later resources whose canonical `coach_scope_match` chain passes through that TeamSeason.
- **Game** remains a canonical scope type but is **not assignable in Layer 1**. No Game entity/catalog exists yet, and OrganizationGameOffering is not silently substituted for Game.

For OrganizationGameOffering read:

- OrganizationWide Coach scope may read all Offerings in the Organization.
- Team scope may read the Offering whose `game_id` matches the scoped Team.
- TeamSeason scope resolves TeamSeason → Team → `game_id` and may read the matching Offering.

Authorization stays centralized in the resolver. It checks active Membership, current Coach RoleAssignment, current additive CoachScopeAssignments, true resource Organization, scope containment, sensitivity, policy, and ambiguity. Missing/orphaned scope targets, cross-Organization references, duplicate current authority, or no scope match deny.

---

## 7. Captain closure

At most one current CaptainAssignment may exist per `team_season_id`; zero is valid.

Captain effectiveness remains live-computed from:

- active Membership;
- active Player RoleAssignment;
- qualifying RosterAssignment `active | reserve`;
- current CaptainAssignment.

`inactive` RosterAssignment makes captaincy temporarily ineffective without closing the CaptainAssignment. `completed`/`removed` RosterAssignment or Player-role closure triggers `captain.close`.

Replacement semantics:

- old current captain → `is_current = false`;
- new captain → `is_current = true`, `supersedes_id = <old captain_assignment_uuid>`.

Player retains canonical self-read of own CaptainAssignment; no teammate raw read and no Player write authority.

---

## 8. RosterDisplayProjection closure

Canonical DTO:

- `member_reference` — opaque, not raw Membership UUID; the implementation mechanism is not frozen.
- `display_name` — from Membership allowlist.
- `gamer_tag` — from RosterAssignment.
- `team_name` — Team display name.
- `game_id` — Team game identity.
- `participation_status` — RosterAssignment state.
- `captain_indicator` — live CaptainAssignment effectiveness.

Only `active`, `reserve`, and `inactive` rows appear. Terminal roster history does not appear.

No projection is authority or provenance.

---

## 9. Base44 v1 implementation consequences

This section is profile-specific and does not alter canonical domain semantics.

### 9.1 Recovery metadata

Base44 RosterAssignment adds profile-only fields:

- `last_operation_key` — required.
- `last_operation_correlation_id` — required.
- `last_operation_request_id` — nullable.
- `last_operation_payload_hash` — nullable, server-computed from validated material input.

For `roster.move`, source-side terminal mutation records operation key, execution correlation, durable request id, and a server-computed payload hash covering source identity, destination TeamSeason, destination participation status, and gamer_tag when material. Destination row, when created, carries the same logical request as `creation_request_id`.

Base44 CaptainAssignment adds the same profile-only recovery fields. For replacement `captain.assign`, the superseded old row records the request id and a server-computed payload hash covering TeamSeason and incoming Membership identity. The replacement, when created, carries the same `creation_request_id`.

These recovery fields never enter the canonical contract.

### 9.2 Non-atomic safety ordering

- `roster.move`: close source before destination create — transient "neither", never "both".
- replacement `captain.assign`: supersede old before create new — transient vacancy, never two effective captains.
- TeamSeason completion: transition TeamSeason to `completed`, then complete child rosters, then close affected captains.

Every write is version-guarded and uses bounded stable-read confirmation. No ACID claim is made.

### 9.3 Base44 invariants

Add profile invariants:

- **I14:** at most one non-terminal RosterAssignment per `(membership_id, team_season_id)`.
- **I15:** canonical target at most one current CaptainAssignment per `team_season_id`; Base44 enforces by guarded operations + fail-closed ambiguity + R4, not a structural "at all times" guarantee.
- **I16:** unique OrganizationGameOffering per `(organization_id, game_id)`, application-enforced.
- **I17:** completed TeamSeason implies all child RosterAssignments terminal `completed` and affected captaincies closed.

### 9.4 Reconciliation additions

Existing sweeps extend as follows:

- **R4** activates for CaptainAssignment: multiple current captains per TeamSeason; detection-only, `RestrictedStudent`, operator review.
- **R5** includes stale current CaptainAssignment on inactive Membership; deterministic close-only repair.
- **R6** checks Layer 1 references and wrong-tenant RosterAssignment chains.
- **R9** covers every new audit-required Layer 1 mutation.

New sweeps:

| # | Detects | Repair | Sensitivity | Cadence |
|---|---|---|---|---|
| **R14** | source RosterAssignment marked by Base44 recovery metadata as `roster.move`, terminal `removed`, request `R`, but no destination row with `creation_request_id=R` after settling window | No; operator review | StandardOperational | Hourly |
| **R15** | duplicate OrganizationGameOffering for one `(organization_id, game_id)` | No; operator review; dependent resolution fails closed | StandardOperational | Hourly |
| **R16** | TeamSeason `completed` while child RosterAssignment remains `active/reserve/inactive` after settling window | Yes; complete leftover rosters and close affected captains; review on repair failure | StandardOperational | Every 5 minutes |
| **R17** | old CaptainAssignment superseded by replacement request `R`, but no replacement row with `creation_request_id=R` after settling window | No; operator review | RestrictedStudent | Hourly |

R14/R17 detection does not require AuditLog; R9 independently reports missing audit correlation.

---

## 10. Policy and frontend operation boundary

A future Layer 1 production-policy version must add the exact authorization implied above:

- OrgAdmin: manage Team, TeamSeason, RosterAssignment, Offering, CaptainAssignment in same Organization.
- Coach: read Team; forward-update TeamSeason; manage scoped RosterAssignment; read matching Offering; read/assign scoped CaptainAssignment; no manual `captain.close`.
- Player: read Team/TeamSeason/Offering in canonical same-Organization scope; read own RosterDisplayProjection under `viewer_team_season_member`; read own CaptainAssignment; no Layer 1 writes.
- Captain: inherits Player Layer 1 grants only; no additional Team/Roster management authority.

Frontend adapter names to add when implementation is authorized:

| adapter | canonical key |
|---|---|
| `createTeam` | `team.create` |
| `updateTeam` | `team.update` |
| `archiveTeam` | `team.archive` |
| `createTeamSeason` | `team_season.create` |
| `transitionTeamSeason` | `team_season.transition` |
| `createOffering` | `offering.create` |
| `transitionOffering` | `offering.transition` |
| `assignRoster` | `roster.assign` |
| `transitionRoster` | `roster.transition` |
| `completeRoster` | `roster.complete` |
| `removeRoster` | `roster.remove` |
| `moveRoster` | `roster.move` |
| `assignCaptain` | `captain.assign` |
| `closeCaptain` | `captain.close` |

System cascade paths of `roster.complete` and `captain.close` have no separate frontend adapter; the same operation key identifies the controlled operation while authority path distinguishes service execution.

---

## 11. Migration and student-data posture

Every canonical reference uses application-owned portable UUIDs, never Base44 IDs. Export pagination remains unique-`id` or separately verified cursor only.

Layer 0 schema amendments:

- Membership adds optional `display_name`; existing rows may remain null.
- CaptainAssignment adds canonical `creation_request_id`; there were zero rows at ratification, so no backfill.

No real student roster, identity, display name, gamer tag, participation, or captaincy data is authorized by this amendment. All architecture and implementation acceptance remains synthetic-only until institutional approval is separately established.

---

## 12. Incorporation

### 12.1 `implementation-contract.md`

Incorporate:

- the Layer 0 Membership and CaptainAssignment field amendments;
- complete Team/Roster entity fields and uniqueness rules;
- lifecycle graphs;
- operation catalog additions and idempotency classes;
- roster/CoachScope/captain/projection semantics;
- TeamSeason-completion cascade;
- substrate-neutral incomplete-operation recoverability requirements.

### 12.2 `base44-implementation-profile-v1.md`

Incorporate:

- Base44-only recovery fields and non-atomic ordering;
- I14–I17;
- R14–R17;
- Layer 1 scope enablement and Game-scope deferral;
- operation-adapter mapping requirements.

### 12.3 `implementation-handoff.md`

Record that Layer 1 is architecture-closed and that implementation agents may not re-infer the decisions above.

### 12.4 Frontend operation registry

No registry edit is performed by this architecture amendment. The ratified adapter/key mapping above is an implementation requirement for the future Layer 1 implementation work order.

---

## 13. Ratification boundary

This amendment authorizes **architecture incorporation only**. It does not authorize Layer 1 runtime implementation.

After this amendment is merged, the new `main` SHA becomes the authoritative baseline for the Layer 1 implementation work order.
