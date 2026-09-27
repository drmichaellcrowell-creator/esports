# Layer 2 Architecture Closure Work Order

**Status:** READY FOR ARCHITECTURE WORK — RUNTIME IMPLEMENTATION NOT YET AUTHORIZED  
**Repository:** `drmichaellcrowell-creator/esports`  
**Working branch:** `layer-2-foundation`  
**Pinned starting SHA:** `ae22063a8471875f9940fe46dd954cbfe57916c7`  
**Frozen predecessor:** Layer 0 + Layer 1  
**Canonical source:** `docs/architecture/implementation-contract.md`  
**Runtime profile:** `docs/architecture/base44-implementation-profile-v1.md`  
**Dependency order:** `docs/architecture/implementation-handoff.md` Section 4

## 0. Mission

Close Layer 2 architecture without altering frozen Layer 0/1 semantics, then prepare a post-amendment implementation work order.

Layer 2 is exactly:

- **Layer 2A — Events / Practice / Attendance / Availability**
- **Layer 2B — Equipment**

The two tracks may proceed in parallel only **after** architecture closure.

This work order authorizes architecture analysis and documentation only. It does **not** authorize Base44 schema creation, policy activation, backend mutation functions, production data writes, or frontend product implementation.

---

# 1. Baseline guard

Before making any architecture edit:

1. Resolve `layer-2-foundation`.
2. Require branch HEAD = `ae22063a8471875f9940fe46dd954cbfe57916c7`.
3. Require merge base with `main` = the same SHA.
4. Confirm `main` has not advanced unexpectedly; if it has, stop and rebase/re-audit deliberately.
5. Confirm the Layer 1 freeze record remains present and unchanged.
6. Confirm the live Base44 production policy remains `1g-layer1-read-ratified` with hash `f4624985e292b9c0b53f3f4bea7d8ea92328de90cb3ec6b636098aea48bc3cf4`.
7. Confirm no Layer 2 runtime entities/functions/policy rows have been added outside this work order.

**Gate L2-0 passes only if the frozen predecessor is unchanged.**

---

# 2. Produce Amendment 005

Create:

`docs/architecture/amendments/005-layer2-events-equipment-closure.md`

Amendment 005 must be architecture-complete enough that an implementation agent can create schemas/functions/policies without guessing.

## 2A. Events / Practice / Attendance / Availability closure

Freeze the complete persistent model for:

- Event
- RecurringEventSeries
- EventParticipationExpectation
- EventParticipationAdjustment
- AvailabilityResponse
- AttendanceRecord
- Practice
- PracticeActivity
- PracticeActivityTemplate

For every entity, specify:

- exact persistent fields;
- UUID identity field;
- Organization ownership or immutable scope-resolution chain;
- immutable references;
- mutability model;
- sensitivity;
- all enum values;
- bounded text fields;
- timestamps/provenance/correlation;
- `creation_request_id` / request identity where required;
- `version` / CAS requirements;
- supersession/current fields where applicable;
- uniqueness constraints;
- terminal/immutable states;
- Base44 recovery metadata where a workflow can partially apply.

### Event scope model

Amendment 005 must define the canonical Event scope discriminator and containment path.

It must support the already-frozen grants:

- Player Event/Practice read only through `viewer_has_expectation`;
- Coach Event/Practice/attendance authority through `coach_scope_match`;
- OrgAdmin same-Organization authority.

Do not modify Layer 1 CoachScope semantics. Extend containment using the frozen Team/TeamSeason chain.

### Event lifecycle operations

Define canonical operation keys for every client/server write required to realize the existing write grants.

At minimum, architecture must explicitly decide operations for:

- Event creation;
- Event editable-field update;
- Event forward lifecycle transitions;
- Event cancellation;
- Event postponement/supersession;
- recurring-series creation;
- recurring-series edit;
- recurring occurrence creation/expansion if materialized;
- Practice creation/update;
- PracticeActivity create/update/transition/replacement;
- PracticeActivityTemplate create/update and any terminal state if one exists;
- manual EventParticipationExpectation supersession if allowed;
- EventParticipationAdjustment append;
- AvailabilityResponse self response/change;
- AvailabilityResponse coach correction;
- AttendanceRecord create;
- AttendanceRecord correction.

Retain the already frozen key:

- `event.materialize_expectations`

For each operation specify:

- authorized actors;
- scope predicate;
- preconditions;
- exact write set;
- audit requirement;
- Notification/Outbox requirement in canonical profile;
- Base44 v1 behavior while Communication remains excluded;
- idempotency class;
- logical-request identity;
- replay behavior.

### Expectation materialization

Freeze:

- Event participant/audience model;
- authoritative source rows;
- qualifying RosterAssignment states;
- snapshot membership identity;
- duplicate-prevention key;
- behavior after roster change;
- behavior after Membership deactivation;
- exactly-once logical semantics under replay;
- ordered Base44 write sequence;
- stable confirmation;
- partial-application recovery.

The existing invariant remains: materialize once at `draft→scheduled`; never regenerate.

### Availability / adjustment / attendance semantics

Resolve the current AvailabilityResponse ambiguity:

- entity catalog = append-only / insert-only;
- Player grant table = create/update own response.

Freeze the exact history model.

Also freeze:

- AvailabilityResponse enum;
- EventParticipationAdjustment enum;
- AttendanceRecord enum;
- correction/supersession rules;
- “absent” eligibility rule;
- how expectation, adjustment, availability and attendance remain distinct facts;
- no automatic fault/discipline inference.

### Practice model

Freeze:

- Practice's 1:1 Event reference;
- event_type invariant;
- no TeamSeason FK on Practice itself;
- PracticeActivity ordering key;
- PracticeActivity legal transitions;
- replacement lineage;
- template linkage semantics;
- recurring-series interaction.

## 2B. Equipment closure

Freeze the complete persistent model for:

- EquipmentAssetType
- EquipmentAsset
- EquipmentAssetAllocation
- EquipmentAssignment
- EquipmentConditionAssessment
- EquipmentIssueReport
- EquipmentServiceRecord

Freeze the exact derived DTO for:

- EquipmentProjection

For every entity, specify the same field / identity / scope / mutability / version / recovery details required above.

### Equipment scope model

Define:

- EquipmentAsset Organization ownership;
- allocation target discriminator;
- CoachScope containment from Team / TeamSeason / OrganizationWide to allocation;
- assignee discriminator and reference model;
- self-owned Player read predicate;
- allocation-scoped Coach mutation predicate;
- OrgAdmin same-Organization predicate.

Game scope remains deferred unless a separate architecture decision explicitly activates it.

### EquipmentAsset lifecycle

Freeze:

- complete `EquipmentAsset.status` enum;
- legal transitions;
- which transitions are identity/admin writes vs controlled workflow writes;
- deterministic return-condition → Asset.status derivation;
- administrative-closure allowed resulting statuses;
- transfer status behavior;
- missing/service/damaged semantics;
- explicit prohibition on discipline inference.

Generic status update remains prohibited.

### Assignment model

Resolve `Temporal + AO+S (correction)` into an executable model.

Freeze:

- active/closed standing model;
- assignment status enum;
- one-active-assignment-per-Asset invariant;
- assignee types;
- purpose fields;
- due date / return date semantics;
- closure reason;
- correction vs lifecycle transition;
- request identity and replay.

### Equipment write operation catalog

Retain the already frozen keys:

- `equipment.return`
- `equipment.administrative_closure`
- `equipment.transfer`

Define canonical keys for all other required writes:

- AssetType management;
- Asset create / identity update;
- AssetAllocation create/update/close;
- Assignment create;
- Assignment correction if allowed;
- ConditionAssessment create/correct;
- IssueReport create/correct;
- ServiceRecord create/correct.

For every operation define actor/scope/preconditions/write set/audit/idempotency/recovery.

### Player issue-report authorization window

Make “active assignment / return-workflow only” executable.

Freeze:

- persisted proof of active assignment;
- persisted proof that return workflow is in progress;
- start/end of the return window;
- correction rights after closure;
- correlation behavior when an issue report participates in return processing.

### EquipmentProjection

Freeze exact output fields and derivation.

Must preserve the already-frozen audience/content boundary:

Include only:
- assigned item;
- purpose;
- due date;
- derived `action_needed`;
- own reported issues.

Exclude:
- other Players' assignments;
- service notes;
- blame framing.

Define:
- exact field names;
- opaque vs raw references;
- `action_needed` enum;
- overdue clock semantics;
- issue correction/current-row semantics;
- behavior after assignment closure.

---

# 3. Base44 v1 recovery and reconciliation closure

Amendment 005 must add Base44-specific Layer 2 recovery rules to `base44-implementation-profile-v1.md`.

## 3.1 Idempotency classes

Classify every Layer 2 operation.

Use the Layer 1 discipline as precedent:

- creation / replacement / multi-row logical requests need immutable logical-request identity;
- target-state transitions need deterministic replay;
- material inputs require server-computed hashes where replay with changed inputs must conflict.

Do not reuse execution `correlation_id` as logical-request identity.

## 3.2 Ordered non-atomic workflows

For every multi-record Reference Profile transaction, define Base44 order that fails toward:

- less authority;
- less visibility;
- less false completion.

Required explicit sequences include at least:

- Event expectation materialization;
- Event postponement/supersession if multi-row;
- recurring-series occurrence propagation if multi-row;
- equipment.return;
- equipment.administrative_closure;
- equipment.transfer.

Each sequence must define:

- version guard;
- recovery marker;
- stable-read confirmation where required;
- safe partial states;
- unsafe partial states;
- compensation vs operator review.

## 3.3 New integrity invariants

Add Layer 2 application-enforced invariants after I17.

At minimum decide invariants for:

- expectation uniqueness/currentness;
- expectation materialization completion;
- Event/Practice 1:1 integrity;
- recurring-series occurrence integrity;
- one active EquipmentAssignment per Asset;
- Allocation/Assignment Organization/scope consistency;
- Assignment/Asset status consistency;
- transfer completeness;
- return/administrative-closure completeness;
- correction-chain currentness.

Exact numbering and wording are part of Amendment 005.

## 3.4 New reconciliation sweeps

Extend the reconciliation model beyond R17.

For every new invariant decide:

- sweep key;
- detection predicate;
- sensitivity;
- auto-repair or detect-only;
- operator-review rule;
- cadence;
- settling window;
- heartbeat inclusion.

No repair may silently choose between competing authority/student-state records.

R10 must be updated to monitor the new sweep set.

---

# 4. Authorization / policy closure

Amendment 005 must produce an exact Layer 2 read/write matrix ready to encode as policy rows.

## 4.1 New resolver predicates

Define fail-closed semantics for:

- `viewer_has_expectation`;
- Event CoachScope containment;
- allocation-scoped equipment Coach authority;
- Player self-owned equipment;
- Player active-assignment / return-workflow issue-report authority.

No unknown scope label may fall through permissively.

## 4.2 Layer 1 non-regression

Layer 2 policy must inherit frozen Layer 1 grants exactly.

The amendment must explicitly state that Layer 2 introduces **no** change to:

- Team/Roster lifecycle;
- Captain semantics;
- Layer 1 read grants;
- RosterDisplayProjection fields;
- active policy semantics;
- Layer 1 reconciliation repair rules.

Any required change to those is a separate architecture amendment, not a hidden part of Amendment 005.

---

# 5. Incorporation outputs

Amendment 005 must be incorporated into:

1. `docs/architecture/implementation-contract.md`
2. `docs/architecture/base44-implementation-profile-v1.md`
3. `docs/architecture/implementation-handoff.md`

Create/update traceability so the canonical contract remains the sole implementation source of truth.

Do **not** implement runtime schemas/functions in the architecture PR.

The PR must carry the repository's `architecture-amendment` label because canonical architecture documents will change.

---

# 6. Architecture verification gate

Before Amendment 005 is merged, perform a read-only architecture audit confirming:

- every Layer 2 persistent entity has an exact field set;
- every Layer 2 write grant maps to a named controlled operation;
- every operation has actor/scope/precondition/write/audit/idempotency semantics;
- all enums are closed;
- all uniqueness/currentness constraints are explicit;
- Event scope containment is executable;
- Equipment allocation containment is executable;
- projection DTO is exact;
- Base44 recovery exists for every multi-row workflow;
- new reconciliation sweeps cover every application-enforced invariant needing drift detection;
- Communication remains excluded;
- SharedCompetition remains excluded;
- Conduct remains excluded;
- no Layer 1 contract was modified except by an explicitly identified separate amendment.

**Gate L2-A passes only when no implementation decision remains inferential.**

---

# 7. Merge and repin

After the Amendment 005 PR passes architecture CI:

1. merge to `main`;
2. capture the exact merge SHA;
3. verify post-merge CI green;
4. record that SHA as the **Layer 2 architecture baseline**;
5. create a fresh implementation branch from that exact SHA;
6. write the Layer 2 runtime implementation work order against that SHA and the then-current Base44 runtime.

No runtime work begins before this repin.

---

# 8. Planned runtime implementation slices after architecture closure

These slice names are planning placeholders. Exact operation keys and entity fields come only from the ratified Amendment 005.

## Layer 2.0 — schema substrate

- create Layer 2 schemas only;
- portable application UUIDs;
- exact field/enums/uniqueness from Amendment 005;
- direct client CRUD RLS denied;
- no operations activated;
- schema verifier only.

## Layer 2.1 — loaders + resolver containment

- Event scope loader;
- `viewer_has_expectation`;
- Coach Event containment;
- Equipment allocation containment;
- Player self predicates;
- pure read-only resolver tests;
- no policy activation yet.

## Layer 2.2 — policy candidate + read preflight

- extend frozen policy artifact;
- exact Layer 2 read/write rows;
- registry/hash parity;
- prove no Layer 1 rule drift;
- candidate remains inactive until preflight passes.

## Layer 2A.1 — Event core lifecycle

- Event + recurring-series core operations;
- lifecycle legality;
- cancellation/postponement semantics;
- synthetic-only acceptance.

## Layer 2A.2 — expectation materialization

- `event.materialize_expectations`;
- snapshot participant set;
- replay/idempotency;
- partial-application recovery;
- new reconciliation coverage.

## Layer 2A.3 — availability / adjustment / attendance

- self availability;
- coach correction;
- participation adjustments;
- AttendanceRecord create/correct;
- strict distinction among expectation, availability, adjustment and attendance.

## Layer 2A.4 — Practice / activities / templates

- Practice 1:1 Event invariant;
- activities/order/status/replacement;
- templates;
- recurring-series interaction.

## Layer 2A.5 — Event read boundary

- Player expectation-gated reads;
- Coach scope reads;
- OrgAdmin same-org reads;
- synthetic allow/deny acceptance.

## Layer 2B.1 — equipment catalog + allocation

- AssetType;
- Asset identity;
- Allocation;
- allocation-scoped Coach reads;
- no generic Asset.status writes.

## Layer 2B.2 — assignment / condition / issue / service

- assignment creation/correction;
- condition;
- issue-report narrow Player path;
- service records;
- uniqueness/currentness gates.

## Layer 2B.3 — return / administrative closure / transfer

- `equipment.return`;
- `equipment.administrative_closure`;
- `equipment.transfer`;
- ordered Base44 recovery;
- deterministic status derivation;
- reconciliation.

## Layer 2B.4 — EquipmentProjection + reads

- exact safe DTO;
- self-only Player projection;
- Coach allocation-scoped raw reads;
- OrgAdmin same-org reads;
- leak tests.

## Layer 2.3 — reconciliation closure

- all new sweeps live;
- schema enums current;
- R10 monitors full set;
- scheduled clean run required.

## Layer 2.4 — final freeze audit

Require:

- every Layer 2 synthetic acceptance gate green;
- all synthetic fixtures cleaned;
- open Layer 2 findings = 0;
- latest scheduled reconciliation clean;
- exactly one active policy;
- Layer 1 regression verifier green;
- no real student data;
- final Base44 checkpoint;
- GitHub freeze record;
- PR + CI green;
- merge to `main`.

---

# 9. Hard stop conditions

Stop and request an explicit architecture decision if implementation work discovers any of the following:

- a needed persistent field not present in Amendment 005;
- an unnamed write path;
- an undefined enum value;
- ambiguous scope containment;
- a new cross-Organization path;
- a need for Communication/Notification/Outbox;
- a need for Conduct;
- a need to alter frozen Layer 1 behavior;
- a multi-row workflow with no ratified Base44 recovery order;
- a reconciliation anomaly with no frozen repair posture;
- any proposal to use real student data before institutional approval.

---

# 10. Immediate next action

The next authorized task is:

**Draft Amendment 005 — Layer 2 Events/Attendance + Equipment Architecture Closure against `ae22063a8471875f9940fe46dd954cbfe57916c7`.**

Do not create Layer 2 runtime entities or functions yet.
