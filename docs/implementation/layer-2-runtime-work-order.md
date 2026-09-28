# Layer 2 Runtime Implementation Work Order

**Status:** AUTHORIZED FOR IMPLEMENTATION  
**Repository:** `drmichaellcrowell-creator/esports`  
**Implementation branch:** `layer-2-implementation`  
**Pinned architecture baseline:** `c1c49d0ac9ebc5bab1b6762be2af02e98ebcf5e2`  
**Architecture source:** `docs/architecture/implementation-contract.md`  
**Base44 profile:** `docs/architecture/base44-implementation-profile-v1.md`  
**Handoff:** `docs/architecture/implementation-handoff.md`  
**Architecture closure:** Amendment 005 — Layer 2 Events/Attendance + Equipment  
**Base44 app:** Esports Platform  
**Base44 app id:** `6aaa835ffde8688971351551`

## 0. Runtime baseline

Implementation begins only from the state below.

### GitHub

- `main = c1c49d0ac9ebc5bab1b6762be2af02e98ebcf5e2`
- `layer-2-implementation = c1c49d0ac9ebc5bab1b6762be2af02e98ebcf5e2`

### Base44

Current production authorization state:

- active policy version: `1g-layer1-read-ratified`
- active policy UUID: `e5d33548-4269-4ea3-823f-c43ac7657aa3`
- active policy hash: `f4624985e292b9c0b53f3f4bea7d8ea92328de90cb3ec6b636098aea48bc3cf4`

Frozen Layer 1 domain counts at work-order start:

- Team = 0
- TeamSeason = 0
- RosterAssignment = 0
- OrganizationGameOffering = 0
- CaptainAssignment = 0

Layer 2 runtime state at work-order start:

- no Event schema
- no RecurringEventSeries schema
- no EventParticipationExpectation schema
- no EventParticipationAdjustment schema
- no AvailabilityResponse schema
- no AttendanceRecord schema
- no Practice schema
- no PracticeActivity schema
- no PracticeActivityTemplate schema
- no EquipmentAssetType schema
- no EquipmentAsset schema
- no EquipmentAssetAllocation schema
- no EquipmentAssignment schema
- no EquipmentConditionAssessment schema
- no EquipmentIssueReport schema
- no EquipmentServiceRecord schema
- no EventMaterializationBatch schema

This zero-Layer-2 state is the implementation baseline.

---

# 1. Non-negotiable implementation rules

1. **Amendment 005 is authoritative through the incorporated canonical contract/profile/handoff.** Do not re-infer fields, enums, lifecycle, operation keys, read grants, recovery order, or reconciliation behavior.
2. **Layer 0/1 is frozen.** No Layer 2 slice may silently alter Foundation or Team/Roster semantics.
3. **Synthetic-only.** No real student roster, attendance, availability, equipment assignment, gamer identity, or other education record may be introduced during implementation acceptance.
4. **No direct client CRUD.** Every governed Layer 2 persistent entity must deny raw client create/read/update/delete unless the canonical contract explicitly defines a safe read surface. Product access is through resolver-gated read adapters and controlled operations.
5. **No policy mutation before preflight.** Candidate policy rows may be staged in code/registry, but the active production policy remains `1g-layer1-read-ratified` until the exact Layer 2 candidate passes a read-only policy preflight.
6. **Never mutate a frozen active policy artifact in place.** If a staged/activated Layer 2 policy needs correction after activation, create the next version.
7. **Base44 partial workflows must fail toward less authority / less visibility / less false completion.**
8. **Every acceptance mutation verifier cleans its synthetic fixtures.**
9. **Every acceptance gate must return raw machine-readable totals and failure details.** Do not infer pass from partial logs.
10. **Take Base44 checkpoints before meaningful mutation and after every accepted implementation slice.**
11. **Record every accepted slice in GitHub status docs before moving to the next slice.**
12. **A failing verifier does not authorize an automatic architecture change.** Patch implementation only when the canonical behavior is already clear; stop if architecture would have to change.
13. **Communication/Notification/Outbox remains excluded.**
14. **Conduct remains excluded.**
15. **SharedCompetition remains excluded.**
16. **Game CoachScope matching remains deferred.**
17. **No runtime implementation may use a projection as provenance or authorization truth.**

---

# 2. Layer 2 scope

## Layer 2A — Events / Practice / Attendance / Availability

Persistent entities:

- Event
- RecurringEventSeries
- EventParticipationExpectation
- EventParticipationAdjustment
- AvailabilityResponse
- AttendanceRecord
- Practice
- PracticeActivity
- PracticeActivityTemplate

Base44-only internal recovery entity:

- EventMaterializationBatch

## Layer 2B — Equipment

Persistent entities:

- EquipmentAssetType
- EquipmentAsset
- EquipmentAssetAllocation
- EquipmentAssignment
- EquipmentConditionAssessment
- EquipmentIssueReport
- EquipmentServiceRecord

Derived surface:

- EquipmentProjection

## New reconciliation

- I18–I30
- R18–R30
- R10 monitoring expands to the full active sweep set

---

# 3. Implementation order

The implementation order is intentionally staged. Layer 2A and 2B are architecturally parallel, but both depend on the shared Layer 2 schema/resolver/policy substrate.

Do not skip gates.

---

# Layer 2.0 — Schema substrate

## Scope

Create the exact Amendment 005 schemas only.

### Layer 2A schemas

- Event
- RecurringEventSeries
- EventParticipationExpectation
- EventParticipationAdjustment
- AvailabilityResponse
- AttendanceRecord
- Practice
- PracticeActivity
- PracticeActivityTemplate
- EventMaterializationBatch

### Layer 2B schemas

- EquipmentAssetType
- EquipmentAsset
- EquipmentAssetAllocation
- EquipmentAssignment
- EquipmentConditionAssessment
- EquipmentIssueReport
- EquipmentServiceRecord

### Reconciliation schema changes

Extend:

- ReconciliationHeartbeat.sweep_key
- ReconciliationFinding.sweep_key

to include:

- R18
- R19
- R20
- R21
- R22
- R23
- R24
- R25
- R26
- R27
- R28
- R29
- R30

Retain every frozen prior key.

## Requirements

- exact canonical field names/types/enums;
- portable application UUIDs;
- immutable Organization/scope FK chain;
- exact correction/supersession fields;
- exact request/recovery fields from the Base44 profile;
- `version` where required;
- direct CRUD RLS deny-all for governed persistent entities;
- EventMaterializationBatch is backend/internal-only and RestrictedStudent;
- no operation dispatcher additions yet;
- no policy activation;
- no domain rows created.

## Verification gate L2.0

Create a read-only schema verifier proving:

- every required schema exists;
- required fields/enums are exact;
- direct CRUD RLS is denied;
- reconciliation enums contain frozen + R18–R30;
- no unauthorized Layer 2 entity appears;
- Layer 2 domain counts are zero;
- active policy remains `1g`.

**Acceptance:** exact all-pass raw result.

Then:

- independent Base44 readback;
- post-pass checkpoint;
- GitHub status record.

---

# Layer 2.1 — Loaders + resolver containment

## Scope

Build shared server loaders and pure containment predicates only.

Required resolution chains:

### Event

- Event → TeamSeason → Team → Organization
- Practice → Event → TeamSeason
- PracticeActivity → Practice → Event
- participation/availability/attendance → Event
- RecurringEventSeries → TeamSeason
- EventMaterializationBatch → Event

### Equipment

- AssetType → Organization
- Asset → Organization + AssetType
- Allocation → Asset + Organization + target scope
- Assignment → Asset + assignee
- Condition/Issue/Service → Asset / assignment tenure
- EquipmentProjection sources → self Assignment/Issue only

## Resolver predicates

Implement explicitly fail-closed:

- `viewer_has_expectation`
- Event CoachScope containment
- `equipment_allocation_scope_match`
- `equipment_self_assignment_match`
- `equipment_issue_report_window_match`

Unknown/missing/duplicate-current/cross-org state denies.

## Gate L2.1

Read-only pure verifier proving:

- OrganizationWide / Team / TeamSeason Event containment;
- Game scope does not match;
- orphan/missing scope target denies;
- viewer_has_expectation false on draft Event;
- viewer_has_expectation true only with exactly one current expected row;
- duplicate-current expectation denies;
- Allocation containment works for OrganizationWide / Team / TeamSeason;
- duplicate-active Allocation denies;
- Player pending Assignment does not count as assigned;
- Player active own Assignment matches;
- issue-report return window matches only persisted exact pending return state.

No production policy activation yet.

---

# Layer 2.2 — Candidate policy + read/write preflight

## Candidate policy

Create the next policy version after `1g-layer1-read-ratified`.

Naming convention:

`2a-layer2-foundation-ratified`

unless implementation discovers a preexisting reserved version label; if so, stop and report before choosing another.

Candidate must:

- inherit every frozen `1g` rule exactly;
- add only Amendment 005 Layer 2 grants;
- not widen Layer 1;
- not admit Game scope;
- not admit Communication/Conduct/SharedCompetition.

## Read/write matrix

Encode exact canonical grants for:

- Event / Practice / PracticeActivity / Template;
- participation expectations/adjustments;
- AvailabilityResponse;
- AttendanceRecord;
- AssetType / Asset / Allocation;
- Assignment / Condition / Issue / Service;
- EquipmentProjection.

## Policy preflight

Read-only verifier must prove:

- candidate registry presence;
- code hash == registry hash;
- exact rule parity;
- frozen 1g rule set is unchanged as prefix/base;
- candidate adds only expected Layer 2 rows;
- no Player raw equipment overread;
- no Player Allocation/Service read;
- EquipmentProjection self-only;
- Event Player read uses viewer_has_expectation;
- Coach uses exact containment predicates;
- Game scope absent;
- active production policy remains 1g.

Only after this preflight passes may candidate activation be requested.

## Activation gate

Activation itself is a separate controlled step.

After activation:

- exactly one active policy;
- previous 1g superseded;
- expected new hash;
- no domain rows;
- R8 clean;
- R9 clean.

Take checkpoint and record activation before proceeding.

---

# Layer 2A.1 — Event core lifecycle

## Operations

Implement:

- `event.create`
- `event.update`
- `event.transition` excluding draft→scheduled materialization path until L2A.2
- `event.cancel`
- `event.postpone`
- `recurring_series.create`
- `recurring_series.update`
- `recurring_series.end`
- `recurring_series.expand`

## Rules

- Event always TeamSeason-scoped;
- `event.create` cannot create Practice type;
- draft-only editable fields;
- terminal completed/cancelled semantics;
- postponement = draft successor + predecessor cancel;
- recurring generation = draft only;
- eight-week forward window;
- revision updates draft occurrences only;
- scheduled/terminal occurrences immutable to series edit.

## Acceptance gate

Synthetic scenarios must cover:

- OrgAdmin and Coach(scope) allows;
- wrong scope denies;
- Game scope denies;
- create replay;
- changed-input conflict;
- legal/illegal lifecycle transitions;
- cancel restrictions;
- postpone replay and partial-recovery markers;
- series occurrence uniqueness/revision;
- no Player draft visibility;
- exact audit correlations;
- cleanup.

---

# Layer 2A.2 — Expectation materialization

## Operation

Implement service-only:

- `event.materialize_expectations`

owned by:

- `event.transition(draft→scheduled)`

## Required ordering

1. validate draft Event under CAS;
2. derive active/reserve roster snapshot with active Membership;
3. compute deterministic material hash;
4. persist one immutable EventMaterializationBatch;
5. mark Event pending;
6. create/replay expectations from batch;
7. stable-read verify exact identities/count;
8. write transition AuditLog;
9. Event→scheduled last;
10. persist accepted request/hash/count/batch;
11. clear pending metadata.

## Acceptance gate

Must prove:

- active/reserve included;
- inactive/completed/removed excluded;
- inactive Membership excluded;
- Player role not required;
- exact immutable batch;
- partial expectations while Event draft remain Player-invisible;
- replay uses persisted batch, not current roster;
- roster changes after batch do not alter snapshot;
- scheduled Event has exact expectation set;
- same request/same material replays;
- same request/different material conflicts;
- R18 deterministic repair from batch;
- missing/ambiguous batch detect-only;
- cleanup.

---

# Layer 2A.3 — Availability / Adjustment / Attendance

## Operations

- `event_expectation.supersede`
- `event_adjustment.append`
- `availability.respond`
- `availability.correct`
- `attendance.record`
- `attendance.correct`

## Required semantics

- Availability is immutable append history;
- No-Response = no row;
- coach correction appends;
- adjustment is independent;
- attendance is independent;
- absent requires expected;
- attendance correction supersedes;
- no automatic discipline/fault inference.

## Acceptance gate

Cover:

- self-response allow;
- other-player deny;
- response after Event start deny for Player;
- current-response deterministic derivation;
- coach correction;
- expectation supersession;
- adjustment sequence;
- absent without expected denial;
- attendance correction chain;
- duplicate-current detection;
- R19/R29 findings;
- audit rules including successful self-response exception;
- cleanup.

---

# Layer 2A.4 — Practice / activities / templates

## Operations

- `practice.create`
- `practice_activity.create`
- `practice_activity.update`
- `practice_activity.transition`
- `practice_activity.replace`
- `practice_template.create`
- `practice_template.update`
- `practice_template.archive`

## Acceptance

Prove:

- Practice Event + Practice 1:1;
- no Practice→non-practice Event;
- no duplicate Practice;
- draft orphan recovery only when request unambiguous;
- activity sequence uniqueness;
- legal transitions;
- replacement creates exactly one successor;
- archived template cannot be newly used;
- historical references remain readable;
- R20 behavior;
- cleanup.

---

# Layer 2A.5 — Event read boundary

Build resolver-gated read adapter support for:

- Event
- Practice
- PracticeActivity
- PracticeActivityTemplate
- EventParticipationExpectation
- EventParticipationAdjustment
- AvailabilityResponse
- AttendanceRecord

EventMaterializationBatch has no human read path.

## Acceptance

Player:

- allowed only via expected non-draft Event;
- self participation records only;
- active templates same org;
- no teammate attendance/availability.

Coach:

- exact TeamSeason containment.

OrgAdmin:

- same Organization.

Cross-org and ambiguous scope deny.

---

# Layer 2B.1 — Equipment catalog + allocation

## Operations

- `equipment_asset_type.create`
- `equipment_asset_type.update`
- `equipment_asset_type.archive`
- `equipment_asset.create`
- `equipment_asset.update_identity`
- `equipment_asset.administrative_status`
- `equipment_allocation.create`
- `equipment_allocation.transition`

## Acceptance

Prove:

- unique org asset_tag;
- archived AssetType blocked for new Asset;
- generic status mutation absent;
- legal/illegal administrative status transitions;
- one active Allocation;
- same-org target enforcement;
- Coach cannot manage Allocation;
- Game allocation absent;
- R23/R24 behavior as applicable;
- cleanup.

---

# Layer 2B.2 — Assignment / condition / issue / service

## Operations

- `equipment_assignment.assign`
- `equipment_assignment.correct`
- `equipment_condition.record`
- `equipment_condition.correct`
- `equipment_issue.report`
- `equipment_issue.correct`
- `equipment_service.record`
- `equipment_service.correct`

## Required semantics

- pending Assignment is inert;
- exactly one active Assignment per Asset;
- correction retains assignment_tenure_id;
- correction cannot reopen closed tenure;
- Player issue create window exact;
- Player may not correct after create;
- ServiceRecord carries no Player reference;
- no narrative/blame field.

## Acceptance

Cover:

- pending invisibility;
- activation;
- duplicate active rejection;
- Coach allocation-scoped allow/deny;
- self issue report;
- return-window issue report;
- closed-window deny;
- correction chains;
- ServiceRecord privacy;
- R22/R27/R28/R29;
- cleanup.

---

# Layer 2B.3 — Return / administrative closure / transfer

## Operations

- `equipment.return`
- `equipment.administrative_closure`
- `equipment.transfer`

## Ordering

Implement the exact Base44 profile order.

### Return

- pending return marker;
- ConditionAssessment;
- deterministic Asset.status;
- AuditLog;
- Asset status;
- Assignment close last;
- stable zero-active verification.

### Administrative closure

- pending marker;
- AuditLog;
- explicit legal Asset status;
- Assignment close last.

### Transfer

- source pending marker;
- destination pending/inert;
- AuditLog;
- source close;
- exact destination activation;
- Asset remains assigned;
- stable exactly-one-active verification.

## Acceptance

Prove:

- deterministic status mapping;
- damaged/needs_service → maintenance;
- good/worn → available;
- no fault inference;
- transfer never creates two effective assignments;
- stalled transfer R25 detect-only;
- R26 deterministic repair constraints;
- cleanup.

---

# Layer 2B.4 — Equipment read boundary + EquipmentProjection

## Raw reads

Player:

- AssetType same org;
- Asset only currently assigned-to-self;
- own Assignment;
- own linked Condition;
- own Issue;
- never Allocation;
- never Service.

Coach:

- Allocation-contained raw reads.

OrgAdmin:

- same-org raw reads.

## EquipmentProjection

Exact DTO:

- assignment_reference
- asset_reference
- asset_type_name
- asset_display_name
- purpose_code
- due_at
- action_needed
- reported_issues[]:
  - issue_reference
  - issue_type
  - issue_status
  - reported_at

## Leak tests

Must prove absence of:

- raw Membership UUID;
- raw Asset UUID;
- raw Assignment UUID;
- serial_number;
- location_reference;
- ServiceRecord;
- another Player's data;
- blame/disciplinary content.

## Derivation tests

- issue_open precedence;
- overdue;
- due within 72h;
- contact_coach;
- none;
- UTC clock basis;
- closed tenure only while own current issue remains open.

---

# Layer 2.3 — Reconciliation closure

Implement R18–R30 and update R10.

## Required sweeps

- R18 incomplete Event materialization
- R19 duplicate current Event expectation
- R20 Practice/Event integrity
- R21 recurring occurrence drift
- R22 multiple active EquipmentAssignment
- R23 equipment allocation/containment anomaly
- R24 Asset/Assignment divergence
- R25 incomplete transfer
- R26 incomplete return/admin closure
- R27 duplicate current Equipment correction chain
- R28 incomplete Assignment activation
- R29 incomplete Layer 2 supersession replacement
- R30 incomplete Event postponement

## Rules

- cadence no slower than profile;
- every run writes heartbeat;
- every sweep idempotent/re-derivable;
- authority/student-state ambiguity never auto-selects a winner;
- deterministic repair only where explicitly ratified;
- finding sensitivity preserved;
- R10 monitors full active sweep set.

## Gate

Require:

- schema enum parity;
- direct sweep verifier;
- scheduled execution evidence;
- latest R18–R30 clean;
- latest R10 clean;
- latest overall clean;
- no synthetic residue.

---

# Layer 2.4 — Full read/policy closure

After both tracks pass individually:

- run exact Layer 2 read matrix verifier;
- verify policy registry/hash parity;
- exactly one active policy;
- verify no Layer 1 rule drift;
- rerun Layer 1 read/projection regression;
- rerun selected Layer 1 mutation smoke/regression gates where resolver changes could affect them;
- verify all Layer 2 domain counts zero after cleanup;
- verify all open Layer 2 reconciliation findings zero.

No freeze until this is green.

---

# Layer 2.5 — Final freeze audit

The final audit must verify all of the following.

## Architecture parity

- implementation matches Amendment 005 incorporation;
- no hidden Layer 1 amendment;
- no Game scope;
- no Communication/Conduct/SharedCompetition.

## Runtime

- exact schemas;
- exact operations;
- exact read boundary;
- exact EquipmentProjection;
- active policy exact expected version/hash;
- exactly one active policy;
- direct client CRUD deny-all on governed entities;
- EventMaterializationBatch internal-only;
- scheduled reconciliation active;
- R18–R30 clean;
- R10 clean;
- overall clean.

## Data state

- no real student data;
- all synthetic fixtures removed;
- Layer 2 domain counts zero unless a deliberately retained non-student operational row is explicitly documented;
- no stale synthetic R9/R18–R30 findings.

## Regression

- Layer 1 regression green;
- frozen policy behavior retained;
- Team/Roster counts clean;
- existing reconciliation still clean.

## Repository

- implementation branch based on `c1c49d0...`;
- all accepted slice commits recorded;
- CI green;
- final freeze record written;
- PR into `main` uses exact head SHA guard.

Only then may Layer 2 be declared frozen.

---

# 4. Checkpoint discipline

Take checkpoints at minimum:

1. pre-L2.0 schema mutation;
2. post-L2.0 pass;
3. post-L2.1 resolver pass;
4. pre-policy activation;
5. post-policy activation;
6. after every accepted L2A/L2B slice;
7. pre-reconciliation activation;
8. post-reconciliation clean scheduled run;
9. final freeze candidate;
10. final frozen checkpoint.

Every checkpoint id + runtime commit is recorded in GitHub status.

---

# 5. GitHub implementation status record

Create:

`docs/implementation/layer-2-status.md`

Record each slice:

- baseline SHA;
- Base44 checkpoint;
- runtime commit;
- policy version/hash if relevant;
- verifier name;
- total/pass/fail;
- cleanup state;
- domain counts;
- reconciliation findings;
- GitHub commit.

Do not rely on chat history as the only implementation record.

---

# 6. Policy version discipline

The next policy version is expected to be:

`2a-layer2-foundation-ratified`

but the policy preflight must confirm the label is unused and registry-safe before activation.

Once activated:

- never edit its rule artifact in place;
- correction requires the next version;
- exactly one active pointer at all times;
- active hash must match in-code canonical artifact;
- resolver denies on mismatch/ambiguity.

---

# 7. Synthetic-data discipline

All implementation verification uses synthetic records only.

Synthetic identifiers must have an obvious run prefix.

Each mutation verifier:

- creates only its own fixtures;
- tracks every created row;
- cleans in reverse dependency order;
- paces/retries cleanup to avoid Base44 rate limits;
- returns explicit cleanup status;
- sets `allPassed=true` only if assertions **and cleanup** pass.

If a scheduled sweep observes synthetic fixtures in flight:

- confirm the exact finding belongs to that synthetic run;
- confirm referenced fixtures are gone;
- resolve only those stale synthetic findings;
- never suppress the sweep globally to accommodate tests.

---

# 8. Hard-stop conditions

Stop implementation and request a new architecture decision if any of these occur:

- a required field is absent from the canonical contract;
- an enum needs a value not frozen in Amendment 005;
- a required write has no named operation key;
- Event scope needs something other than TeamSeason;
- Game CoachScope would be required;
- a second production Organization becomes relevant;
- Communication/Notification/Outbox is required;
- Conduct/disciplinary data is required;
- SharedCompetition is required;
- Equipment workflow needs a status/repair not frozen;
- reconciliation would need to choose between competing student/authority records;
- implementation would alter Layer 1 semantics;
- real student data would be required before institutional approval.

---

# 9. Immediate execution order

Begin with:

**Layer 2.0 — Schema substrate**

Do not begin Event mutations, Equipment mutations, or policy activation before L2.0 and L2.1 pass.

The first runtime action should therefore be:

1. create a pre-Layer-2 Base44 checkpoint;
2. add Layer 2 schemas + reconciliation enum extensions only;
3. create the read-only L2.0 schema verifier;
4. run it;
5. independently verify zero domain rows + active policy still 1g;
6. checkpoint and record L2.0 pass.

