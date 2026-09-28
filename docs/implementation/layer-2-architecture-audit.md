# Layer 2 Frozen Architecture Audit

**Audit date:** 2026-09-27  
**Repository:** `drmichaellcrowell-creator/esports`  
**Working branch:** `layer-2-foundation`  
**Pinned frozen baseline:** `ae22063a8471875f9940fe46dd954cbfe57916c7`  
**Layer 1 Base44 freeze checkpoint:** `6ab46ef874248a23b98366e7`  
**Layer 1 Base44 runtime:** `107c1ee5fad1b1977615551e9f478d71b76c21f8`  
**Active policy:** `1g-layer1-read-ratified`  
**Policy hash:** `f4624985e292b9c0b53f3f4bea7d8ea92328de90cb3ec6b636098aea48bc3cf4`

## Audit verdict

**Layer 2 is dependency-authorized but not architecture-closed for direct implementation.**

The canonical dependency graph defines Layer 2 exactly as two parallel domains that both depend only on frozen Layer 0 + Layer 1:

- **Layer 2A — Events / Practice / Attendance / Availability**
- **Layer 2B — Equipment**

The frozen Base44 v1 profile explicitly includes both domains.

However, unlike Layer 1 after Amendment 003, the canonical contract does not yet freeze enough implementation detail to permit a runtime agent to create schemas/functions/policies without inference. The canonical contract itself says that where it is silent, implementation must stop and request an explicit architecture decision.

No Layer 2 entity schema, backend operation, read adapter, policy grant, or projection implementation currently exists in the live Base44 app. This is a clean starting state.

---

## 1. Frozen Layer 2 scope

### 1.1 Layer 2A — Events / Practice / Attendance / Availability

Persistent entities already named canonically:

- Event
- RecurringEventSeries
- EventParticipationExpectation
- EventParticipationAdjustment
- AvailabilityResponse
- AttendanceRecord
- Practice
- PracticeActivity
- PracticeActivityTemplate

Frozen semantics already present:

- Event is `StandardOperational`.
- Event lifecycle: `draft → scheduled → in_progress → completed`; `cancelled` from draft/scheduled only.
- Postponement is cancel + supersession with a new Event row; postponement is not a status.
- Player reads Event/Practice only where a materialized expectation exists.
- Coach writes/reads are scope-contained.
- OrgAdmin manages same-Organization records.
- EventParticipationExpectation is `AO+S`, `RestrictedStudent`, materialized once at `draft→scheduled`, never regenerated.
- EventParticipationAdjustment is `AO+Seq`, `RestrictedStudent`, distinct from Availability.
- AvailabilityResponse is `RestrictedStudent`; No-Response is row absence, never a stored state.
- AttendanceRecord is `AO+S`, `RestrictedStudent`; `absent` is reserved for expected-but-did-not-attend.
- Practice is 1:1 with Event where `event_type=Practice`; Practice itself has no `team_season_id`.
- PracticeActivity is ordered and has states `planned|completed|modified|replaced|skipped`.
- PracticeActivityTemplate is reusable and Organization-defined.
- Controlled operation already named: `event.materialize_expectations`.
- Event expectation materialization is a multi-record transaction in the Reference Profile.
- Base44 v1 Communication/Notification is excluded, so Layer 2A has no Notification/Outbox side effect in v1 unless a later architecture gate changes that scope.

### 1.2 Layer 2B — Equipment

Persistent entities already named canonically:

- EquipmentAssetType
- EquipmentAsset
- EquipmentAssetAllocation
- EquipmentAssignment
- EquipmentConditionAssessment
- EquipmentIssueReport
- EquipmentServiceRecord

Derived surface:

- EquipmentProjection

Frozen semantics already present:

- EquipmentAssetType, EquipmentAsset, EquipmentAssetAllocation and EquipmentServiceRecord are `StandardOperational`.
- EquipmentAssignment, EquipmentConditionAssessment, EquipmentIssueReport and EquipmentProjection are `RestrictedStudent`.
- EquipmentAsset status is workflow-controlled; generic update may not write it.
- `current_location` is not persisted.
- EquipmentAssetAllocation distinguishes ownership from usable pool.
- EquipmentAssignment permits at most one active assignment per Asset across all assignee types.
- Coach equipment authority is allocation-scoped.
- EquipmentConditionAssessment may carry optional `location_reference`.
- EquipmentIssueReport has a deliberately narrow Player-authoring window tied to active assignment / return workflow.
- EquipmentServiceRecord is Asset-only and carries no Player-attributed field.
- EquipmentProjection is self-only and exposes assigned item, purpose, due date, derived action_needed, and own reported issues; it excludes other Players' assignments, service notes, and blame framing.
- Controlled operations already named:
  - `equipment.return`
  - `equipment.administrative_closure`
  - `equipment.transfer`
- `equipment.return` Reference Profile transaction = Assignment closure + ConditionAssessment + Asset.status derivation + AuditLog.
- `equipment.transfer` Reference Profile transaction = outgoing Assignment close + incoming Assignment create + AuditLog.
- Equipment damage, missing status, or overdue state must never imply disciplinary fault or create Conduct data.

---

## 2. Live implementation audit

The current Base44 runtime contains no Layer 2 implementation.

Verified absent:

- Event
- RecurringEventSeries
- EventParticipationExpectation
- EventParticipationAdjustment
- AvailabilityResponse
- AttendanceRecord
- Practice
- PracticeActivity
- PracticeActivityTemplate
- EquipmentAssetType
- EquipmentAsset
- EquipmentAssetAllocation
- EquipmentAssignment
- EquipmentConditionAssessment
- EquipmentIssueReport
- EquipmentServiceRecord
- EquipmentProjection

No Layer 2 operation implementations or operation keys were found in the live Base44 source tree.

The current production policy remains the frozen Layer 1 policy:

- `1g-layer1-read-ratified`
- hash `f4624985e292b9c0b53f3f4bea7d8ea92328de90cb3ec6b636098aea48bc3cf4`

This is the desired pre-Layer-2 state.

---

## 3. Architecture closure gaps

These are blockers to direct Layer 2 runtime implementation.

### A1 — Persistent field sets are not closed

The canonical contract names entities and some individual fields/semantics, but does not provide the complete persistent field set for any Layer 2 entity comparable to Amendment 003's Layer 1 field closure.

Amendment 005 must freeze, for every persistent Layer 2 entity:

- application UUID field;
- Organization ownership or immutable scope-resolution chain;
- immutable foreign keys;
- timestamps/provenance/correlation;
- creation-request identity where required;
- version / compare-and-set field where Base44 recovery requires it;
- all domain fields and bounded text fields;
- all closed enums;
- supersession/current-row fields where the mutability model requires them;
- recovery metadata for non-atomic multi-record workflows.

### A2 — Event scope chain is not closed

Coach authorization requires `coach_scope_match`, but the exact containment chain for Event, Practice, recurring series, activities, expectations, availability and attendance is not frozen.

In particular, the architecture must decide how an Event is canonically tied to Team / TeamSeason / Game scope without violating the frozen statement that Practice itself has no `team_season_id`.

The Player rule `viewer_has_expectation` must also be defined fail-closed in resolver terms.

### A3 — Event participation materialization inputs are not closed

The contract says expectations are materialized once at `draft→scheduled` and never regenerated, but does not freeze:

- the authoritative participant source set;
- whether participation is TeamSeason-roster-based, selected-members-based, or another discriminated audience model;
- exactly which roster statuses qualify;
- snapshot identity semantics;
- duplicate prevention key;
- behavior when roster/membership changes after scheduling;
- replay/idempotency identity;
- Base44 partial-application recovery.

These decisions are prerequisites to implementing `event.materialize_expectations`.

### A4 — Event mutation operation catalog is incomplete

Only `event.materialize_expectations` is canonically named.

The contract grants Coach/OrgAdmin create/manage authority for Event, Practice, PracticeActivity, RecurringEventSeries and PracticeActivityTemplate, but does not freeze the backend operation keys for:

- Event create/update;
- Event status transition / cancel;
- Event postponement/supersession;
- recurring-series create/update/expansion;
- Practice create/update;
- PracticeActivity create/update/status transition/replacement;
- PracticeActivityTemplate create/update/archive (if archive exists);
- EventParticipationExpectation manual supersession;
- EventParticipationAdjustment append;
- AvailabilityResponse self response and coach correction;
- AttendanceRecord create/correction.

Base44's function-only boundary means these cannot be filled in by generic client CRUD or invented ad hoc during implementation.

### A5 — AvailabilityResponse mutability wording is ambiguous

The entity catalog calls AvailabilityResponse **append-only / insert-only**, while the Player authorization table says **create/update own AvailabilityResponse**.

Amendment 005 must explicitly resolve whether a changed response:

- creates a new sequential row;
- supersedes a prior row;
- mutates one enduring row;
- or uses another frozen pattern.

No implementation may infer the answer.

### A6 — Event/attendance enums and lifecycle details are incomplete

The contract does not completely freeze:

- Event `event_type` enum;
- Event/series scheduling fields and time-zone representation;
- EventParticipationAdjustment type enum (only “e.g. excused” appears);
- AvailabilityResponse value enum;
- AttendanceRecord status enum beyond the special meaning of `absent`;
- PracticeActivity transition graph;
- recurring-series edit/expansion semantics beyond “only still-draft occurrences”.

### B1 — Equipment field sets and scope keys are not closed

The contract does not freeze complete fields or identifiers for AssetType, Asset, Allocation, Assignment, ConditionAssessment, IssueReport, or ServiceRecord.

Amendment 005 must define:

- Asset identity / tag / display fields;
- Asset status enum and legal transitions;
- allocation target discriminator and uniqueness;
- assignee discriminator and reference model;
- Assignment standing/status model and due-date semantics;
- condition-state enum;
- issue-report state/category fields;
- service-record fields;
- correction/supersession keys;
- exact Organization / Team / TeamSeason containment path.

### B2 — EquipmentAssignment mutability is underspecified

EquipmentAssignment is described as **Temporal + AO+S (correction)**, but the boundary between:

- enduring assignment standing,
- assignment closure,
- factual correction,
- and superseding correction

is not fully specified.

The exact row model and legal transitions must be frozen before schema creation.

### B3 — EquipmentAsset status derivation is not closed

The architecture requires workflow-only status changes and says `equipment.return` derives Asset.status, but does not freeze:

- Asset.status enum;
- return-condition → resulting-status mapping;
- administrative-closure allowed resulting statuses;
- whether transfer changes Asset.status;
- missing/lost/damaged/service states and their transition rules;
- deterministic repair behavior if Assignment and Asset status diverge.

### B4 — Equipment write operation catalog is incomplete

The contract names return / administrative closure / transfer, but write grants also exist for creation/correction of:

- EquipmentAssetType;
- EquipmentAsset identity fields;
- EquipmentAssetAllocation;
- EquipmentAssignment;
- EquipmentConditionAssessment;
- EquipmentIssueReport;
- EquipmentServiceRecord.

Function-only Base44 requires explicit operation keys, authorization rules, audit requirements and idempotency classes for these writes.

### B5 — Player EquipmentIssueReport authorization window is not executable yet

“Narrow Player-authorization window, active assignment / return-workflow only” is frozen as intent but not as an executable predicate.

Amendment 005 must define:

- what persisted state proves “return workflow”;
- exact start/end of the window;
- whether a report submitted during return is part of the return correlation;
- correction rules after assignment closure.

### B6 — EquipmentProjection derivation is incomplete

The projection field categories are frozen, but the exact DTO shape and derivation rules are not.

Amendment 005 must define:

- exact field names;
- opaque references vs raw UUID exposure;
- `action_needed` enum and derivation;
- overdue derivation / clock semantics;
- issue inclusion/correction rules;
- behavior for inactive/closed assignments.

### C1 — Base44 idempotency / recovery classes are not closed

Layer 1 required explicit Class A / Class B idempotency semantics and operation-specific recovery metadata.

Layer 2 has multiple non-atomic Base44 workflows but no equivalent closure for:

- Event expectation materialization;
- Event postponement/supersession;
- recurring-series expansion/edit propagation;
- Equipment return;
- Equipment administrative closure;
- Equipment transfer;
- creation/correction operations that can be replayed.

Amendment 005 must define logical-request identity, material-input hash requirements, replay semantics, partial-application states and operator-visible recovery metadata.

### C2 — Layer 2 reconciliation is not defined

The Base44 profile currently defines R1–R17. No Layer 2-specific sweeps exist.

Layer 2 architecture closure must determine which integrity invariants require new reconciliation coverage, including at minimum consideration of:

- incomplete expectation materialization;
- duplicate expectation/current-row anomalies;
- invalid/orphan Event/Practice scope chains;
- incomplete recurring-series propagation;
- duplicate active EquipmentAssignment;
- Assignment/Asset status divergence;
- incomplete equipment transfer;
- incomplete equipment return / administrative closure;
- invalid allocation/assignment containment;
- projection-source integrity.

For each new sweep the amendment must freeze:

- detection predicate;
- sensitivity;
- auto-repair vs detect-only;
- operator-review requirement;
- cadence;
- settling window;
- heartbeat integration.

### C3 — Layer 2 read-policy matrix is not executable yet

The role-level grants are conceptually frozen, but implementation still needs exact policy rows and resolver predicates for:

- `viewer_has_expectation`;
- Event/Practice CoachScope containment;
- allocation-scoped equipment Coach reads/writes;
- Player self-owned equipment predicates;
- OrgAdmin same-Organization reads/writes;
- EquipmentProjection self-only access.

The amendment must translate these into fail-closed resolver inputs without broadening Layer 1 grants.

### C4 — Audit requirements are incomplete for unnamed writes

The three named equipment workflows are audit-required. `event.materialize_expectations` is not designated audit-required in the operation table.

For every newly named Layer 2 write operation, Amendment 005 must explicitly designate:

- AuditLog required / not required;
- authority path;
- operation key;
- resource identity;
- correlation behavior;
- compensation / R9 behavior when Base44 audit and domain writes cannot be atomic.

---

## 4. Base44 v1 constraints already resolved

The following do **not** require new Layer 2 decisions unless Amendment 005 deliberately changes scope:

- Single-Organization production posture remains in force.
- SharedCompetition remains excluded.
- Conduct remains excluded.
- Communication / Notification / Outbox remains excluded.
- No real student data is authorized by technical implementation alone.
- Direct client CRUD on governed entities remains prohibited; frontend uses operation/read adapters.
- Service role remains backend-only.
- AuditLog remains operational-grade, not evidentiary-grade.
- Scheduled workflows may be used for reconciliation only under the existing re-derivable/idempotent model.
- Layer 1 contracts are frozen and may not be modified by Layer 2 without a separate explicit amendment.

---

## 5. Recommended architecture disposition

Create **Amendment 005 — Layer 2 Events/Attendance + Equipment Architecture Closure**.

The amendment should close both Layer 2 tracks under one dependency-layer decision, but preserve separate implementation gates:

- **Track A:** Events / Practice / Attendance / Availability
- **Track B:** Equipment

The tracks may be implemented independently after Amendment 005 is merged because the canonical dependency graph explicitly permits them to proceed in parallel.

No Layer 2 runtime schema/function/policy work should begin before Amendment 005 is ratified, incorporated into the canonical contract/profile/handoff, merged to `main`, and a new authoritative post-amendment SHA is captured.
