# Amendment 005 — Layer 2 Events/Attendance + Equipment Architecture Closure

**Status:** INCORPORATED DRAFT — PENDING RATIFICATION  
**Drafted:** 2026-09-27  
**Pinned predecessor:** `main@ae22063a8471875f9940fe46dd954cbfe57916c7`  
**Applies to:** Canonical contract + Base44 v1 profile  
**Frozen predecessor changed:** No — Layer 0/1 semantics remain unchanged

## 0. Purpose

This amendment closes the architecture for canonical **Layer 2**, which the dependency graph already defines as two parallel tracks that depend only on frozen Layer 0 + Layer 1:

- **Layer 2A — Events / Practice / Attendance / Availability**
- **Layer 2B — Equipment**

This amendment does not authorize runtime implementation by itself. After ratification and incorporation, the architecture amendment must merge to `main`; the resulting `main` SHA becomes the authoritative Layer 2 implementation baseline.

Where this amendment adds Base44-only request identity, recovery metadata, ordering or reconciliation, canonical domain semantics remain unchanged.

---

# 1. Layer 2 invariants

The following are binding across both Layer 2 tracks.

1. **Organization remains the sole tenant/privacy boundary.**
2. **Every Layer 2 resource resolves Organization through an immutable chain.**
3. **Coach authority remains the frozen Layer 1 CoachScope model.** No new Game-scope behavior is activated.
4. **Player access never broadens because an entity is StandardOperational.** Player read paths still require the specific frozen audience predicate.
5. **No Layer 2 projection is provenance or authorization input.**
6. **No generic client CRUD is admitted for governed Layer 2 entities.** All writes occur through named operations; reads occur through resolver-gated read adapters/projections.
7. **Communication remains excluded in Base44 v1.** No Layer 2 Base44 v1 operation creates Notification or OutboxEvent.
8. **Conduct remains excluded.** Attendance, availability, equipment damage, equipment missing state and overdue return state never imply fault or discipline.
9. **Real student data remains unauthorized until the separate institutional governance gate is satisfied.**
10. **Layer 1 is frozen.** This amendment introduces no change to Team, TeamSeason, RosterAssignment, CaptainAssignment, RosterDisplayProjection, Layer 1 authorization, or Layer 1 reconciliation semantics.

---

# 2. Layer 2A — Events / Practice / Attendance / Availability

## 2.1 Event

**Mutability:** Ctrl  
**Sensitivity:** StandardOperational

### Persistent fields

- `event_uuid: uuid` — application-generated row identity.
- `team_season_id: uuid` — immutable; authoritative scope chain is Event → TeamSeason → Team → Organization.
- `event_type: practice | competition | meeting | other_operational`.
- `event_display_name: string` — required, bounded, max 120 chars.
- `scheduled_start_at: timestamp` — UTC instant.
- `scheduled_end_at: timestamp` — UTC instant; must be greater than start.
- `time_zone: string` — required IANA zone used for display/recurrence interpretation.
- `location_label: string|null` — bounded, max 160 chars; operational location only, no sensitive narrative.
- `status: draft | scheduled | in_progress | completed | cancelled`.
- `recurring_event_series_id: uuid|null` — immutable once set; same TeamSeason.
- `series_occurrence_local_start: string|null` — immutable local date-time identity for a generated occurrence; null for non-series Events.
- `series_revision: integer|null` — series revision from which a draft occurrence was generated; null for non-series Events.
- `supersedes_event_id: uuid|null` — set only for postponement/supersession; predecessor must be same TeamSeason.
- `scheduled_materialization_request_id: uuid|null` — set only when `draft→scheduled` completes.
- `scheduled_materialization_hash: string|null` — server-computed material-input hash for the accepted expectation snapshot.
- `scheduled_materialization_count: integer|null` — accepted snapshot size.
- `scheduled_materialization_batch_id: uuid|null` — Base44-only internal batch used to recover the accepted snapshot.
- `pending_operation: null | materialize_expectations | postpone`.
- `pending_request_id: uuid|null`.
- `pending_material_hash: string|null`.
- `created_at`, `updated_at`.
- `created_by_actor_type`, `created_by_actor_reference`.
- `correlation_id`.
- `creation_request_id` — immutable logical identity for `event.create`.
- `version` — application compare-and-set version.

### Uniqueness / integrity

- `event_uuid` unique.
- `creation_request_id` unique for Event creation.
- `supersedes_event_id` may be referenced by at most one accepted postponement successor.
- Event Organization is always derived through TeamSeason and must never be supplied as authorization proof.

### Lifecycle

Canonical lifecycle remains:

- `draft → scheduled → in_progress → completed`
- `draft → cancelled`
- `scheduled → cancelled`

No other status transition exists.

`completed` and `cancelled` are terminal.

Postponement is **not** a status. It is:

1. cancel the predecessor Event;
2. create one successor Event with `supersedes_event_id` pointing to the predecessor.

Core schedule/scope fields are immutable after `scheduled`, except that a postponement creates a successor row rather than modifying the prior event.

## 2.2 Canonical Event scope

Every Event is scoped to exactly one TeamSeason through immutable `team_season_id`.

This decision closes the prior ambiguity and is intentionally narrow for v1.

Consequences:

- OrganizationWide CoachScope contains every Event whose TeamSeason belongs to the Organization.
- Team CoachScope contains Events whose TeamSeason is a child of that Team.
- TeamSeason CoachScope contains Events for that exact TeamSeason.
- Game CoachScope remains deferred and never matches a Layer 2 Event.
- missing/orphaned TeamSeason/Team references deny.

No Organization-wide or Team-only Event scope exists in Layer 2 v1. A future need for an Organization-wide calendar event is a separate architecture decision.

## 2.3 Player Event read predicate — `viewer_has_expectation`

A Player may read Event/Practice only when all are true:

1. viewer has an active Membership in the Event Organization;
2. a current EventParticipationExpectation exists for `(event_id, viewer_membership_id)`;
3. that expectation has `expectation_state = expected`;
4. Event.status is not `draft`;
5. Event resolves unambiguously to the same Organization.

Draft Events are never exposed to Players, even if partial materialization rows exist.

Unknown/missing/duplicate-current expectation state denies.

---

## 2.4 RecurringEventSeries

**Mutability:** Ctrl  
**Sensitivity:** StandardOperational

### Persistent fields

- `recurring_event_series_uuid`.
- `team_season_id` — immutable.
- `event_type: practice | competition | meeting | other_operational`.
- `series_display_name` — required, max 120.
- `time_zone` — IANA zone.
- `series_start_date` — local calendar date.
- `series_end_date` — local calendar date, nullable.
- `local_start_time` — local wall-clock time.
- `duration_minutes` — positive bounded integer.
- `recurrence_frequency: weekly`.
- `interval_weeks` — integer 1–12.
- `days_of_week` — non-empty subset of `monday|tuesday|wednesday|thursday|friday|saturday|sunday`.
- `location_label|null`.
- `status: active | ended`.
- `revision` — positive integer, incremented by every accepted series edit.
- `created_at`, `updated_at`, provenance, `correlation_id`.
- `creation_request_id`.
- `version`.

### Rules

- Layer 2 v1 supports weekly recurrence only.
- Series edits may alter only still-`draft` occurrences.
- Scheduled/in-progress/completed/cancelled occurrences are historical facts and are never rewritten by a series edit.
- `ended` is terminal.
- Series occurrence generation creates draft Event rows only.
- occurrence identity is unique by `(recurring_event_series_id, series_occurrence_local_start)`.
- every generated draft Event records the producing `series_revision`.
- series update increments `revision`, then updates only draft occurrences to that revision; scheduled or terminal occurrences remain untouched.
- recurrence generation never schedules/materializes expectations by itself.
- the forward-generation window is eight weeks from the service run's local-calendar date in the series time zone.

---

## 2.5 EventParticipationExpectation

**Mutability:** AO+S  
**Sensitivity:** RestrictedStudent

### Persistent fields

- `event_participation_expectation_uuid`.
- `event_id` — immutable.
- `membership_id` — immutable.
- `roster_assignment_id|null` — immutable snapshot reference; required for materialized expectations, nullable for authorized manual correction.
- `expectation_state: expected | not_expected`.
- `source_type: roster_materialization | manual_correction`.
- `materialization_request_id|null`.
- `supersedes_id|null`.
- `is_current: boolean`.
- `replacement_request_id: uuid|null` — written to the superseded row before replacement creation.
- `replacement_material_hash: string|null` — server-computed recovery hash.
- `created_at`, provenance, `correlation_id`.
- `creation_request_id`.
- `version`.

### Uniqueness

At most one current expectation exists per `(event_id, membership_id)`.

A `roster_materialization` expectation is valid only when:

- RosterAssignment belongs to the Event TeamSeason;
- RosterAssignment was `active|reserve` at materialization execution;
- Membership was active at materialization execution.

### Historical rule

Expectation is a snapshot fact. Later roster transition, Membership deactivation, or role change does not rewrite or regenerate the materialized expectation.

A current expectation may be superseded only through `event_expectation.supersede`.

Expectation is distinct from Availability, Adjustment and Attendance.

---

## 2.6 EventParticipationAdjustment

**Mutability:** AO+Seq  
**Sensitivity:** RestrictedStudent

### Persistent fields

- `event_participation_adjustment_uuid`.
- `event_id`.
- `membership_id`.
- `adjustment_type: excused_absence | excused_late_arrival | excused_early_departure`.
- `effective_at`.
- `sequence_number` — monotonically increasing within `(event_id,membership_id)`, server-assigned.
- `created_at`, provenance, `correlation_id`.
- `creation_request_id`.

Adjustments never alter expectation, availability or attendance rows.

Multiple sequential adjustments may legitimately exist.

---

## 2.7 AvailabilityResponse

**Mutability:** AO insert-only  
**Sensitivity:** RestrictedStudent

This amendment resolves the prior “create/update” wording ambiguity.

### Decision

**“Update own AvailabilityResponse” means append a newer response row. Existing response rows are never updated or superseded.**

### Persistent fields

- `availability_response_uuid`.
- `event_id`.
- `membership_id`.
- `response_value: available | unavailable | unsure`.
- `response_source: self | coach_correction`.
- `corrects_response_id|null` — optional pointer used only by coach correction.
- `responded_at`.
- `created_at`, provenance, `correlation_id`.
- `creation_request_id`.

### Current-response derivation

Current response = maximum by:

1. `responded_at`;
2. then `created_at`;
3. then `availability_response_uuid` lexical tie-break.

No-Response = absence of any row.

Coach correction appends a new row; it does not rewrite the Player's historical response.

Availability does not alter expectation and does not determine attendance.

---

## 2.8 AttendanceRecord

**Mutability:** AO+S correction  
**Sensitivity:** RestrictedStudent

### Persistent fields

- `attendance_record_uuid`.
- `event_id`.
- `membership_id`.
- `attendance_state: present | absent | late | partial`.
- `recorded_at`.
- `supersedes_id|null`.
- `is_current`.
- `replacement_request_id: uuid|null`.
- `replacement_material_hash: string|null`.
- `created_at`, provenance, `correlation_id`.
- `creation_request_id`.
- `version`.

### Rules

- at most one current AttendanceRecord per `(event_id,membership_id)`;
- `absent` may be created only when the current expectation is `expected`;
- `late` and `partial` are attendance observations, not disciplinary conclusions;
- correction creates a superseding row; historical rows remain immutable.

---

## 2.9 Practice

**Mutability:** Ctrl  
**Sensitivity:** StandardOperational

### Persistent fields

- `practice_uuid`.
- `event_id` — immutable, unique.
- `created_at`, `updated_at`, provenance, `correlation_id`.
- `creation_request_id`.
- `version`.

### Integrity

- exactly one Practice may reference an Event;
- referenced Event must have `event_type=practice`;
- Practice has **no `team_season_id`**; scope resolves through Practice → Event → TeamSeason;
- Practice existence does not alter Event lifecycle.

---

## 2.10 PracticeActivityTemplate

**Mutability:** Ctrl  
**Sensitivity:** StandardOperational

### Persistent fields

- `practice_activity_template_uuid`.
- `organization_id` — immutable.
- `template_display_name` — max 120.
- `default_duration_minutes|null`.
- `status: active | archived`.
- `created_at`, `updated_at`, provenance, `correlation_id`.
- `creation_request_id`.
- `version`.

`archived` is terminal for new use but does not invalidate historical PracticeActivity references.

## 2.11 PracticeActivity

**Mutability:** Ctrl  
**Sensitivity:** StandardOperational

### Persistent fields

- `practice_activity_uuid`.
- `practice_id` — immutable.
- `template_id|null` — immutable once set.
- `activity_display_name` — max 120.
- `sequence_index` — positive integer.
- `planned_duration_minutes|null`.
- `status: planned | completed | modified | replaced | skipped`.
- `replacement_activity_id|null`.
- `created_at`, `updated_at`, provenance, `correlation_id`.
- `creation_request_id`.
- `version`.

### Transition rules

- `planned → completed|modified|replaced|skipped`.
- `modified → completed|replaced|skipped`.
- `completed|replaced|skipped` are terminal.
- `replaced` requires exactly one successor PracticeActivity in the same Practice.
- sequence ordering is unique among non-replaced activities within a Practice.

---

# 3. Layer 2A operation catalog

All client-reachable writes use backend operations.

## Class A — logical creation/replacement request

- `event.create`
- `event.postpone`
- `recurring_series.create`
- `recurring_series.expand`
- `practice.create`
- `practice_activity.create`
- `practice_activity.replace`
- `practice_template.create`
- `event_expectation.supersede`
- `event_adjustment.append`
- `availability.respond`
- `availability.correct`
- `attendance.record`
- `attendance.correct`

Class A requires immutable `creation_request_id`. Same request + same server-computed material hash replays idempotently; same request + different material hash conflicts.

## Class B — target-state / editable-field operation

- `event.update`
- `event.transition`
- `event.cancel`
- `recurring_series.update`
- `recurring_series.end`
- `practice_activity.update`
- `practice_activity.transition`
- `practice_template.update`
- `practice_template.archive`

Class B replays to the already-achieved target state as success; incompatible target/material input conflicts.

## System operation

- `event.materialize_expectations`

This remains a named service operation invoked as part of `event.transition(draft→scheduled)`. It is not client-callable and has no frontend adapter.

### Actor rules

- `event.create` may create only non-Practice Event types. A Practice Event is created only by `practice.create`.
- `practice.create` creates the draft Event first and then its 1:1 Practice row under one logical request; the Event remains draft until the Practice row exists.
- Event / recurring / Practice / activity writes: OrgAdmin or Coach with matching Event TeamSeason scope, except template management also permits OrgAdmin and Coach in the same Organization.
- Event expectation supersession / adjustment / Attendance: OrgAdmin or Coach(scope).
- Availability self-response: Player self for an Event where current expectation exists.
- Availability correction: Coach(scope).
- PracticeTemplate archive/update: OrgAdmin or Coach in same Organization.
- system materialization: service only, scope derived from Event.

### Audit

Every Layer 2A client-callable write above is audit-required **except** `availability.respond`, which records an operational AuditLog event only when denied/failed, not for successful self-response.

`event.materialize_expectations` itself is not a second human-action audit event. The enclosing `event.transition` records the human/system transition correlation. Materialization uses the same correlation and service authority path in recovery metadata.

Communication is excluded in Base44 v1, so no Layer 2A operation writes Notification or OutboxEvent.

---

# 3.1 Practice creation recovery

`practice.create` is an ordered Base44 two-row workflow:

1. create/replay Event with `event_type=practice`, status `draft`, and the logical request id;
2. create/replay the unique Practice row linked to that Event;
3. write the operation AuditLog event;
4. stable verify the 1:1 pair.

A draft Practice Event without its Practice row grants no Player visibility and is safe but incomplete. R20 may deterministically create the missing Practice row only when the Event was created by `practice.create`, is still draft, and the request identity is unambiguous. Duplicate Practice rows are never auto-repaired.

# 3.2 Exact Layer 2A operation matrix

| Operation | Actor | Preconditions | Writes | Audit | Idempotency |
|---|---|---|---|---|---|
| `event.create` | OrgAdmin, Coach(scope) | active TeamSeason in actor scope; event_type != practice | draft Event | required | Class A |
| `event.update` | OrgAdmin, Coach(scope) | Event draft | display/schedule/time-zone/location fields under CAS | required | Class B |
| `event.transition` | OrgAdmin, Coach(scope) forward only | legal transition; draft→scheduled invokes materialization | Event status; expectation batch/set when scheduling | required | Class B + internal materialization request |
| `event.cancel` | OrgAdmin, Coach(scope) | draft or scheduled | Event→cancelled | required | Class B |
| `event.postpone` | OrgAdmin, Coach(scope) | predecessor draft or scheduled; successor schedule valid | draft successor + predecessor cancel | required | Class A |
| `recurring_series.create` | OrgAdmin, Coach(scope) | active TeamSeason; valid weekly rule | series | required | Class A |
| `recurring_series.update` | OrgAdmin, Coach(scope) | series active | series revision + draft occurrence reconciliation | required | Class B |
| `recurring_series.end` | OrgAdmin, Coach(scope) | series active | series→ended | required | Class B |
| `recurring_series.expand` | service | persisted active series | missing draft occurrences (+ Practice rows for practice series) | no separate human audit; service correlation recorded | Class A per occurrence identity |
| `practice.create` | OrgAdmin, Coach(scope) | active TeamSeason | draft practice Event + 1:1 Practice | required | Class A |
| `practice_activity.create` | OrgAdmin, Coach(scope) | Practice Event draft/scheduled; unique sequence | activity planned | required | Class A |
| `practice_activity.update` | OrgAdmin, Coach(scope) | activity planned/modified; parent Event draft/scheduled | editable activity fields | required | Class B |
| `practice_activity.transition` | OrgAdmin, Coach(scope) | legal activity transition; parent not cancelled | activity status | required | Class B |
| `practice_activity.replace` | OrgAdmin, Coach(scope) | source planned/modified | successor activity + source→replaced | required | Class A |
| `practice_template.create` | OrgAdmin, Coach(same org) | — | active template | required | Class A |
| `practice_template.update` | OrgAdmin, Coach(same org) | template active | name/default duration | required | Class B |
| `practice_template.archive` | OrgAdmin, Coach(same org) | template active | template→archived | required | Class B |
| `event_expectation.supersede` | OrgAdmin, Coach(scope) | Event non-draft; one current expectation | old non-current + replacement | required | Class A replacement |
| `event_adjustment.append` | OrgAdmin, Coach(scope) | Event non-draft | adjustment row | required | Class A |
| `availability.respond` | Player self | Event scheduled; current expected expectation; Event not started | response row | success audit not required; denied/failed audit | Class A |
| `availability.correct` | Coach(scope) | Event scheduled/in_progress/completed; target member belongs to Event org | correction response row | required | Class A |
| `attendance.record` | OrgAdmin, Coach(scope) | Event in_progress/completed; target member valid; absent requires expected | current attendance row | required | Class A |
| `attendance.correct` | OrgAdmin, Coach(scope) | one current AttendanceRecord | old non-current + replacement | required | Class A replacement |
| `event.materialize_expectations` | service only | enclosing draft→scheduled transition | batch + expectation rows | no separate audit; enclosing event.transition audit | internal resumable workflow |

### Event postponement ordering

Base44 `event.postpone` uses:

1. create/replay the successor as a **draft** Event with `supersedes_event_id` and full new schedule intent;
2. CAS predecessor pending postpone metadata to reference the logical request;
3. write AuditLog;
4. cancel predecessor **last**;
5. clear predecessor pending metadata and stable-verify one successor.

A stray draft successor does not grant Player visibility. R30 detects orphan/incomplete postponement intent.

# 4. Event scheduling / materialization algorithm

## 4.0 Base44-only EventMaterializationBatch

Base44 v1 adds one implementation-only recovery entity that is **not** a canonical product-domain object:

**EventMaterializationBatch** — backend/internal-only, RestrictedStudent, immutable.

Fields:

- `event_materialization_batch_uuid`
- `event_id`
- `materialization_request_id`
- `material_hash`
- `expected_count`
- `snapshot_items` — structured array of exact `{membership_id, roster_assignment_id}` pairs sorted by membership_id then roster_assignment_id
- `created_at`, provenance, `correlation_id`
- `creation_request_id`

Rules:

- exactly one batch per materialization_request_id;
- direct client CRUD/read is denied for every role;
- snapshot_items is validated structured data, not free text;
- the batch is created as one durable record before any expectation row is emitted;
- the batch is never projection/provenance/authorization input outside the materialization workflow itself;
- canonical domain semantics remain the Event + Expectation model; this entity exists only because Base44 lacks the Reference Profile multi-row transaction.

## 4.1 Authoritative participant source

The expectation snapshot for `draft→scheduled` is the Event's TeamSeason roster.

A Membership qualifies when exactly one non-terminal RosterAssignment exists for that Membership + TeamSeason and its status is:

- `active`; or
- `reserve`.

`inactive|completed|removed` do not qualify.

Membership must be active at snapshot execution.

Player RoleAssignment is **not** required. Roster participation remains independent of Player role.

## 4.2 Materialization order in Base44 v1

Base44 cannot atomically create the full expectation set and transition Event.

The ratified fail-toward-less-visibility sequence is:

1. validate Event still `draft` and CAS version;
2. derive the qualifying roster snapshot;
3. compute server material hash over sorted immutable `(membership_id, roster_assignment_id)` pairs plus Event id;
4. create/replay one immutable EventMaterializationBatch containing the full snapshot as one record;
5. set Event recovery metadata `pending_operation=materialize_expectations`, request id, batch id and material hash while leaving Event `draft`;
6. create/replay one expectation row per batch snapshot item using the same materialization request id;
7. stable-read verify the exact batch count and identities for that request;
8. write the operational audit for `event.transition`;
9. transition Event to `scheduled`, set accepted request/hash/count/batch id, clear pending metadata **last**.

### Safe partial state

A draft Event with partial, request-tagged expectation rows is allowed because Player read requires Event.status != draft.

### Unsafe partial state

A scheduled Event with incomplete accepted expectations is never intentionally produced.

## 4.3 Replay / changed roster

- same request id replays from the persisted EventMaterializationBatch and never re-derives the snapshot from current roster state;
- same request id with caller material that would imply a different hash conflicts;
- R18 may deterministically create missing expectation rows from the persisted immutable batch;
- a different request id may begin only after operator disposition of an incomplete prior materialization finding;
- roster changes after batch creation or successful scheduling never alter that batch and never regenerate expectations.

---

# 5. Recurring series algorithm

`recurring_series.expand` is a service operation that creates missing **draft** Event occurrences only.

For each expected occurrence, logical identity is:

`(recurring_event_series_id, local_occurrence_start)`.

Exactly one draft/successor occurrence may occupy that identity.

Series update:

- changes series metadata under CAS;
- updates only still-draft, non-postponed occurrences;
- never edits scheduled/in-progress/completed/cancelled occurrences;
- never schedules or materializes expectations.

---

# 6. Layer 2B — Equipment

## 6.1 EquipmentAssetType

**Mutability:** Ctrl  
**Sensitivity:** StandardOperational

Fields:

- `equipment_asset_type_uuid`
- `organization_id`
- `type_display_name` max 120
- `status: active | archived`
- timestamps/provenance/correlation
- `creation_request_id`
- `version`

Archived types remain valid for historical Assets but may not be used for new Asset creation.

## 6.2 EquipmentAsset

**Mutability:** Ctrl-narrow  
**Sensitivity:** StandardOperational

Fields:

- `equipment_asset_uuid`
- `organization_id` immutable
- `asset_type_id` immutable
- `asset_tag` required, bounded, unique within Organization
- `asset_display_name` max 120
- `serial_number|null` max 120
- `status: available | assigned | maintenance | missing | retired`
- timestamps/provenance/correlation
- `creation_request_id`
- `version`

`current_location` is not persisted.

### Status rules

- `available → assigned` only when an Assignment is successfully activated.
- `assigned → available|maintenance|missing|retired` only through return/administrative closure.
- `assigned → assigned` through transfer.
- `maintenance → available|retired` via OrgAdmin service/asset administrative operation.
- `missing → available|maintenance|retired` via OrgAdmin administrative operation.
- `retired` terminal.

Generic asset update may modify only `asset_display_name` and `serial_number`; it may never write status.

## 6.3 EquipmentAssetAllocation

**Mutability:** Ctrl  
**Sensitivity:** StandardOperational

Fields:

- `equipment_asset_allocation_uuid`
- `organization_id`
- `asset_id`
- `allocation_scope_type: organization | team | team_season`
- `allocation_scope_reference_id|null` — null only for organization scope
- `status: active | inactive`
- timestamps/provenance/correlation
- `creation_request_id`
- `version`

At most one active Allocation exists per Asset.

Allocation target must resolve to the same Organization.

Game allocation is not admitted in Layer 2 v1.

## 6.4 Coach allocation containment

A Coach may use an Asset only when:

1. exactly one active Allocation exists for the Asset; and
2. that Allocation is contained by one current effective CoachScopeAssignment.

Containment:

- OrganizationWide matches organization allocation and all Team/TeamSeason allocations.
- Team matches allocation to that Team or any child TeamSeason.
- TeamSeason matches that exact TeamSeason allocation.
- Game never matches in Layer 2 v1.

Missing, duplicate-active or cross-Organization Allocation denies.

---

## 6.5 EquipmentAssignment

**Mutability:** Temporal standing + AO+S factual correction  
**Sensitivity:** RestrictedStudent

This amendment makes the mixed mutability model executable.

### Stable tenure

Every assignment tenure has immutable `assignment_tenure_id`.

One or more correction rows may represent that tenure. Exactly one row is current.

### Persistent fields

- `equipment_assignment_uuid` — row identity.
- `assignment_tenure_id` — stable across correction rows.
- `asset_id` immutable.
- `assignee_type: membership | team | team_season`.
- `assignee_reference_id`.
- `purpose_code: individual_use | team_use | practice | competition | other_operational`.
- `assigned_at`.
- `due_at|null`.
- `standing: pending | active | closed`.
- `closure_reason: returned | administrative | transferred | null`.
- `closed_at|null`.
- `supersedes_id|null`.
- `is_current`.
- `replacement_request_id: uuid|null`.
- `replacement_material_hash: string|null`.
- `pending_operation: null | assign | return | administrative_closure | transfer`.
- `pending_request_id: uuid|null`.
- `pending_material_hash: string|null`.
- timestamps/provenance/correlation
- `creation_request_id`
- `version`

### Rules

- exactly one current row per `assignment_tenure_id`;
- `pending` is non-effective: it grants no Player read/possession semantics and does not appear in EquipmentProjection;
- at most one current active Assignment across all tenures for an Asset;
- assignee must resolve to the same Organization;
- correction creates a new current row for the same tenure and supersedes the prior row;
- lifecycle close mutates the current row standing in place under CAS;
- a correction may not reopen a closed tenure.

---

## 6.6 EquipmentConditionAssessment

**Mutability:** AO+S correction  
**Sensitivity:** RestrictedStudent

Fields:

- `equipment_condition_assessment_uuid`
- `asset_id`
- `assignment_tenure_id|null`
- `assessment_context: checkout | return | inspection | service`
- `condition_state: good | worn | damaged | needs_service`
- `location_reference|null` max 160
- `assessed_at`
- `supersedes_id|null`
- `is_current`
- `replacement_request_id: uuid|null`
- `replacement_material_hash: string|null`
- timestamps/provenance/correlation
- `creation_request_id`
- `version`

Condition state never implies blame or Conduct.

## 6.7 EquipmentIssueReport

**Mutability:** AO+S correction  
**Sensitivity:** RestrictedStudent

Fields:

- `equipment_issue_report_uuid`
- `asset_id`
- `assignment_tenure_id`
- `reporter_membership_id`
- `issue_type: damage | malfunction | missing_component | other_operational`
- `issue_status: open | resolved`
- `reported_at`
- `supersedes_id|null`
- `is_current`
- `replacement_request_id: uuid|null`
- `replacement_material_hash: string|null`
- timestamps/provenance/correlation
- `creation_request_id`
- `version`

No narrative field exists.

Issue correction may change issue_type/status only; reporter/asset/tenure are immutable.

## 6.8 EquipmentServiceRecord

**Mutability:** AO+S correction  
**Sensitivity:** StandardOperational

Fields:

- `equipment_service_record_uuid`
- `asset_id`
- `service_type: inspection | maintenance | repair | retirement_review`
- `service_outcome: completed | follow_up_required | asset_retired`
- `serviced_at`
- `supersedes_id|null`
- `is_current`
- `replacement_request_id: uuid|null`
- `replacement_material_hash: string|null`
- timestamps/provenance/correlation
- `creation_request_id`
- `version`

No Membership, Player or assignee reference is permitted.

---

# 7. Equipment operations

## Class A

- `equipment_asset_type.create`
- `equipment_asset.create`
- `equipment_allocation.create`
- `equipment_assignment.assign`
- `equipment_assignment.correct`
- `equipment_condition.record`
- `equipment_condition.correct`
- `equipment_issue.report`
- `equipment_issue.correct`
- `equipment_service.record`
- `equipment_service.correct`
- `equipment.return`
- `equipment.administrative_closure`
- `equipment.transfer`

All Class A operations require immutable request identity and material hash replay semantics.

## Class B

- `equipment_asset_type.update`
- `equipment_asset_type.archive`
- `equipment_asset.update_identity`
- `equipment_asset.administrative_status`
- `equipment_allocation.transition`

Target-state replay rules apply.

### Actor rules

- AssetType / Asset identity / Allocation / administrative asset status: OrgAdmin only.
- Assignment create: OrgAdmin or Coach whose scope contains the active Allocation and destination assignee.
- Assignment correction: OrgAdmin or same allocation-scoped Coach while tenure is active; closed-tenure correction is OrgAdmin-only.
- ConditionAssessment create/correct: OrgAdmin or allocation-scoped Coach.
- IssueReport:
  - Player self only under Section 8 authorization window;
  - allocation-scoped Coach;
  - OrgAdmin.
- ServiceRecord create/correct: OrgAdmin write; Coach read only when allocation scope matches.
- return / transfer / administrative closure: frozen actor rules from canonical contract — Coach(scope) or OrgAdmin, with allocation containment for Coach.

Every Equipment write is audit-required.

---

# 7.1 Exact Layer 2B operation matrix

| Operation | Actor | Preconditions | Writes | Audit | Idempotency |
|---|---|---|---|---|---|
| `equipment_asset_type.create` | OrgAdmin | — | active AssetType | required | Class A |
| `equipment_asset_type.update` | OrgAdmin | AssetType active | display name | required | Class B |
| `equipment_asset_type.archive` | OrgAdmin | AssetType active | type→archived | required | Class B |
| `equipment_asset.create` | OrgAdmin | active AssetType; unique org asset_tag | Asset available | required | Class A |
| `equipment_asset.update_identity` | OrgAdmin | Asset not retired | display name / serial only | required | Class B |
| `equipment_asset.administrative_status` | OrgAdmin | no active/pending Assignment; legal transition | Asset status | required | Class B |
| `equipment_allocation.create` | OrgAdmin | Asset not retired; no active Allocation; target same org | active Allocation | required | Class A |
| `equipment_allocation.transition` | OrgAdmin | active Allocation; no active/pending Assignment when deactivating | active→inactive | required | Class B |
| `equipment_assignment.assign` | OrgAdmin, Coach(allocation scope) | Asset available; active Allocation; no active/pending Assignment; destination valid | pending Assignment→active + Asset assigned | required | Class A |
| `equipment_assignment.correct` | OrgAdmin; Coach while tenure active/in scope | one current row; asset/assignee immutable | superseding corrected row | required | Class A replacement |
| `equipment_condition.record` | OrgAdmin, Coach(allocation scope) | Asset exists; context refs valid | current ConditionAssessment | required | Class A |
| `equipment_condition.correct` | OrgAdmin, Coach(allocation scope) | one current assessment | superseding assessment | required | Class A replacement |
| `equipment_issue.report` | Player window, Coach(allocation scope), OrgAdmin | Section 8 predicate for Player; Asset/tenure valid | current IssueReport | required | Class A |
| `equipment_issue.correct` | OrgAdmin; Coach(allocation scope); never Player after create | one current issue | superseding issue | required | Class A replacement |
| `equipment_service.record` | OrgAdmin | Asset exists | current ServiceRecord | required | Class A |
| `equipment_service.correct` | OrgAdmin | one current ServiceRecord | superseding ServiceRecord | required | Class A replacement |
| `equipment.return` | OrgAdmin, Coach(allocation scope) | current active Assignment | ConditionAssessment + Asset disposition + Assignment close | required | Class A workflow |
| `equipment.administrative_closure` | OrgAdmin, Coach(allocation scope) | current active Assignment; explicit legal resulting status | Asset disposition + Assignment close | required | Class A workflow |
| `equipment.transfer` | OrgAdmin, Coach(allocation scope) | current active source; destination valid in same allocation containment | pending destination + source close + destination activation | required | Class A workflow |

# 8. Player EquipmentIssueReport authorization window

A Player may create `equipment_issue.report` only when all are true:

1. reporter Membership is active;
2. current Assignment row has `assignee_type=membership`;
3. assignee_reference_id equals reporter Membership;
4. either:
   - Assignment.standing = `active`; or
   - Assignment.pending_operation = `return` and pending_request_id is non-null;
5. Asset and Assignment resolve to the same Organization.

### Return-workflow window

The narrow return window begins when the return operation successfully CAS-writes `pending_operation=return` on the current Assignment.

It ends when:

- Assignment is closed and pending metadata cleared; or
- the return attempt is explicitly abandoned/compensated and pending metadata cleared.

A Player report created during this window may carry the same execution correlation but has its own creation_request_id.

After closure, Player may read the historical own IssueReport through EquipmentProjection but may not create/correct it. Corrections after closure are Coach/OrgAdmin only.

---

# 9. EquipmentProjection

**Derived**  
**Sensitivity:** RestrictedStudent  
**Audience:** self only

Exact DTO:

- `assignment_reference` — opaque stable reference derived from assignment_tenure_id.
- `asset_reference` — opaque stable reference derived from asset_id.
- `asset_type_name`.
- `asset_display_name`.
- `purpose_code`.
- `due_at`.
- `action_needed: none | return_due_soon | return_overdue | issue_open | contact_coach`.
- `reported_issues`: array of:
  - `issue_reference` opaque;
  - `issue_type`;
  - `issue_status`;
  - `reported_at`.

No raw Membership UUID, Asset UUID, Assignment UUID, service record, location reference, serial number, other Player assignment, or blame field appears.

### Derivation

Projection includes every current active Assignment tenure for the viewer plus any closed viewer tenure that still has a current own IssueReport with `issue_status=open`. No arbitrary historical lookback is used.

`action_needed` precedence:

1. any current own issue_status=open → `issue_open`;
2. active Assignment due_at in past → `return_overdue`;
3. active Assignment due_at within 72 hours → `return_due_soon`;
4. Assignment pending administrative state requiring staff disposition → `contact_coach`;
5. otherwise `none`.

All clock comparison uses UTC `now`; UI localizes for display.

---

# 10. Equipment workflow ordering in Base44 v1

## 10.0 `equipment_assignment.assign`

Order:

1. validate active Allocation, destination assignee and actor authority;
2. create/replay destination Assignment with `standing=pending` and `pending_operation=assign`;
3. write AuditLog event;
4. CAS Asset.status to `assigned`;
5. CAS Assignment `pending→active`, clear pending metadata **last**;
6. stable verify exactly one active Assignment exists for the Asset.

A pending Assignment is inert and invisible to Player possession/projection rules. If the workflow stalls, R28 reports it.

## 10.1 `equipment.return`

Server material hash covers:

- assignment tenure/current row;
- asset id/current version;
- condition_state;
- location_reference.

Order:

1. validate active Assignment and actor authority;
2. CAS Assignment pending metadata to `return` while standing remains active;
3. create/replay return ConditionAssessment;
4. derive target Asset.status:
   - `good|worn → available`
   - `damaged|needs_service → maintenance`
5. write AuditLog event;
6. CAS Asset.status to target;
7. CAS Assignment `active→closed`, closure_reason=`returned`, clear pending metadata **last**;
8. stable verify no active Assignment remains for Asset.

Fail bias: leaving an Assignment active with pending return and a conservative Asset state is acceptable; exposing a closed Assignment before Asset disposition is not.

## 10.2 `equipment.administrative_closure`

Caller provides explicit resulting status from:

- `available|maintenance|missing|retired`.

Order:

1. validate active Assignment;
2. CAS pending metadata;
3. write AuditLog;
4. CAS Asset.status to explicit result;
5. close Assignment with reason `administrative`, clear pending metadata last.

## 10.3 `equipment.transfer`

Destination is another valid assignee within the same active Allocation containment.

Order:

1. validate source active Assignment, destination, Allocation and actor authority;
2. set source pending transfer metadata;
3. create/replay destination Assignment with `standing=pending`, the transfer request id, and no Player-effective authority;
4. write AuditLog before new authority/visibility is granted;
5. close source Assignment with reason `transferred`;
6. CAS destination Assignment `pending→active` and clear destination pending metadata;
7. keep Asset.status=`assigned`;
8. stable verify exactly one current active Assignment for Asset;
9. clear residual source pending metadata.

If failure occurs after source close but before destination activation, Asset remains `assigned` with one inert pending destination and zero active Assignment; R25 reports the incomplete transfer. The system never auto-selects or invents a different destination.

---

# 11. New Base44 application invariants

Add after I17.

- **I18 — Event scope integrity:** Event TeamSeason exists and resolves unambiguously to one Organization.
- **I19 — Event expectation currentness:** at most one current EventParticipationExpectation per `(event_id,membership_id)`.
- **I20 — Event materialization closure:** a scheduled Event's accepted materialization request/hash has the exact expected request-tagged current expectation set.
- **I21 — Practice/Event integrity:** exactly one Practice per Practice Event; Practice never references non-practice Event.
- **I22 — Recurring occurrence uniqueness:** at most one current occurrence identity per `(series_id,local_occurrence_start)`.
- **I23 — Equipment active assignment uniqueness:** at most one current active Assignment per Asset.
- **I24 — Equipment allocation uniqueness:** at most one active Allocation per Asset.
- **I25 — Equipment containment:** Allocation, Asset, Assignment and assignee resolve to the same Organization and Coach use is allocation-contained.
- **I26 — Equipment current-chain uniqueness:** at most one current correction row per assignment tenure / condition / issue / service correction key.
- **I27 — Equipment workflow completion:** pending return/admin/transfer metadata may not remain beyond settling window without a corresponding completed material result.
- **I28 — Equipment asset/assignment standing compatibility:** an active Assignment requires Asset.status=assigned; Asset.status=available may not coexist with an active Assignment.
- **I29 — Layer 2 supersession completion:** when an AO+S row is marked non-current with a replacement_request_id, exactly one replacement row with matching creation_request_id must appear after the settling window.
- **I30 — Event postponement completion:** a predecessor with pending postpone request may not remain non-cancelled past the settling window once its successor request is created.

---

# 12. New reconciliation sweeps

## R18 — Incomplete Event expectation materialization

Detect:

- Event pending_operation=materialize_expectations past settling window; or
- Event scheduled with accepted materialization metadata but request-tagged current expectation set does not match accepted count/identity hash.

**Repair:** Yes, but only from the immutable EventMaterializationBatch already bound to the pending/accepted request. Missing expectation rows may be created from that batch; reconciliation never re-derives membership from today's roster. If the batch itself is missing/ambiguous or the Event hash disagrees, no repair occurs.  
**Review:** report every deterministic repair; missing/ambiguous batch always operator review.  
**Cadence:** every 5 minutes.  
**Sensitivity:** RestrictedStudent.

## R19 — Multiple-current Event expectation

Detect >1 current expectation per `(event_id,membership_id)`.

**Repair:** No.  
**Review:** Always.  
**Cadence:** hourly.  
**Sensitivity:** RestrictedStudent.

## R20 — Practice/Event integrity

Detect missing/duplicate Practice for a practice Event or Practice pointing to non-practice Event.

**Repair:** No.  
**Review:** Always.  
**Cadence:** hourly.  
**Sensitivity:** StandardOperational.

## R21 — Recurring occurrence drift

Detect duplicate occurrence identity, active series with a missing expected draft occurrence inside the eight-week forward-generation window, or a draft occurrence whose `series_revision` does not equal the current series revision.

**Repair:** Missing draft occurrence may be deterministically created only when no conflicting row exists; a draft occurrence with stale series_revision may be deterministically updated to current series metadata; duplicates are detect-only.

**Review:** report every repair; duplicates always operator review.  
**Cadence:** hourly.  
**Sensitivity:** StandardOperational.

## R22 — Multiple active EquipmentAssignment

Detect >1 current active Assignment per Asset.

**Repair:** No.  
**Review:** Always; assignment authority/possession cannot be sweep-selected.  
**Cadence:** every 15 minutes.  
**Sensitivity:** RestrictedStudent.

## R23 — Equipment allocation / containment anomaly

Detect duplicate active Allocation, missing allocation target, or active Assignment outside active Allocation containment.

**Repair:** No.  
**Review:** Always.  
**Cadence:** hourly.  
**Sensitivity:** sensitivity of referenced assignment; RestrictedStudent when assignment involved.

## R24 — Equipment Asset/Assignment standing divergence

Detect:

- current active Assignment with Asset.status != assigned; or
- Asset.status=available while active Assignment exists.

**Repair:** If exactly one active current Assignment exists, Asset.status may be deterministically set to `assigned`. No inverse repair is permitted when there is no Assignment because the correct non-assigned status is not inferable.

**Review:** every repair; unresolved divergence operator review.  
**Cadence:** every 15 minutes.

## R25 — Incomplete equipment transfer

Detect source Assignment with transfer request metadata, source closed transferred, but no destination Assignment with matching creation_request_id after settling window.

**Repair:** No.  
**Review:** Always. Destination intent is authority/possession state.  
**Cadence:** hourly.  
**Sensitivity:** RestrictedStudent.

## R26 — Incomplete equipment return / administrative closure

Detect pending return/admin workflow past settling window.

Auto-repair only when all material inputs are persisted and unambiguous:

- return ConditionAssessment exists for request;
- target status is deterministically derivable or explicit;
- no competing active Assignment exists.

Repair may finish Asset status + Assignment closure.

Otherwise detect-only/operator review.

**Cadence:** every 5 minutes.  
**Sensitivity:** RestrictedStudent.

## R27 — Multiple-current Equipment correction chain

Detect multiple current rows within any Assignment tenure or Condition/Issue/Service correction chain.

**Repair:** No.  
**Review:** Always.  
**Cadence:** hourly.

## R28 — Incomplete Equipment assignment activation

Detect pending Assignment with `pending_operation=assign` past settling window, or Asset.status=assigned with only a matching pending Assignment and no active Assignment.

**Repair:** when the pending Assignment, active Allocation, Asset version and audit correlation remain unambiguous, activate that exact pending Assignment; otherwise detect-only.

**Review:** report every repair; unresolved cases operator review.  
**Cadence:** every 5 minutes.  
**Sensitivity:** RestrictedStudent.

## R29 — Incomplete Layer 2 supersession replacement

Detect a superseded EventExpectation, AttendanceRecord, EquipmentAssignment correction row, ConditionAssessment, IssueReport or ServiceRecord carrying `replacement_request_id=R` with no replacement row whose `creation_request_id=R` after the settling window.

**Repair:** No. Replacement content is a human-authored fact and is never invented by reconciliation.  
**Review:** Always.  
**Cadence:** hourly.  
**Sensitivity:** sensitivity of the referenced chain.

## R30 — Incomplete Event postponement

Detect Event `pending_operation=postpone` past settling window where the intended successor is missing or the predecessor remains non-cancelled after successor creation.

**Repair:** No. Schedule intent is operator-reviewed.  
**Review:** Always.  
**Cadence:** hourly.  
**Sensitivity:** StandardOperational.

All Layer 2 settling windows are 5 minutes unless a workflow section states otherwise.

R10 must monitor R18–R30 in addition to the frozen prior sweep set.

---

# 13. Authorization additions

The post-Amendment policy version must add only the Layer 2 grants below while preserving every frozen Layer 1 rule.

## Player

May:

- read Event/Practice through `viewer_has_expectation`;
- read active PracticeActivityTemplate in own Organization;
- read own current/history EventParticipationExpectation, EventParticipationAdjustment, AvailabilityResponse, AttendanceRecord;
- append own `availability.respond`;
- read EquipmentAssetType in own Organization;
- read EquipmentAsset when currently assigned to self;
- read own EquipmentAssignment, EquipmentConditionAssessment and EquipmentIssueReport rows;
- read own EquipmentProjection;
- create `equipment_issue.report` only under Section 8 predicate.

May not:

- raw-read another Player's participation/attendance/equipment records;
- read EquipmentServiceRecord;
- mutate Event/Practice or equipment administration.

## Coach

May:

- read/create/update Event/Practice/RecurringSeries/PracticeActivity within CoachScope containment;
- read participation/availability/attendance in scope;
- supersede expectation, append adjustment, correct Availability, record/correct Attendance in scope;
- read EquipmentAsset when active Allocation is contained by CoachScope;
- create/correct Assignment/Condition/Issue in contained Allocation;
- read ServiceRecord for contained Asset;
- return/admin-close/transfer in contained Allocation;
- never manage Allocation itself.

## OrgAdmin

Same-Organization authority over all Layer 2A and Layer 2B resources, subject to named operation boundaries.

Asset.status remains operation-controlled, never generic.

---

# 13.1 Exact Layer 2 read matrix

| Resource | Player | Coach | OrgAdmin |
|---|---|---|---|
| Event / Practice | `viewer_has_expectation` | CoachScope through Event TeamSeason | same Organization |
| PracticeActivity | only through readable Practice | CoachScope through Event TeamSeason | same Organization |
| PracticeActivityTemplate | active template in viewer Organization | same Organization | same Organization |
| EventParticipationExpectation / Adjustment | self | CoachScope through Event | same Organization |
| AvailabilityResponse | self | CoachScope through Event | same Organization |
| AttendanceRecord | self | CoachScope through Event | same Organization |
| EquipmentAssetType | same Organization | same Organization | same Organization |
| EquipmentAsset | currently assigned-to-self | active Allocation contained by CoachScope | same Organization |
| EquipmentAssetAllocation | none | active Allocation contained by CoachScope | same Organization |
| EquipmentAssignment | self as membership assignee | Allocation contained by CoachScope | same Organization |
| EquipmentConditionAssessment | self when linked to own assignment tenure | Allocation contained by CoachScope | same Organization |
| EquipmentIssueReport | self as reporter / own tenure | Allocation contained by CoachScope | same Organization |
| EquipmentServiceRecord | none | Allocation contained by CoachScope | same Organization |
| EquipmentProjection | self only | none | none |
| EventMaterializationBatch | none | none | none |

# 14. Resolver additions

Add explicit fail-closed predicates:

- `viewer_has_expectation`
- `event_coach_scope_match` (implemented through centralized CoachScope containment, not a separate auth engine)
- `equipment_allocation_scope_match`
- `equipment_self_assignment_match`
- `equipment_issue_report_window_match`

Unknown scope/predicate state denies.

No predicate may accept client-supplied Organization as proof.

---

# 15. Verification gates required after implementation

Layer 2 implementation must be synthetic-only and independently gateable.

Minimum acceptance families:

1. schema/RLS gate;
2. Event scope + Player expectation read gate;
3. Event lifecycle gate;
4. expectation materialization / replay / partial recovery gate;
5. Availability/Adjustment/Attendance gate;
6. Practice/Activity/Template gate;
7. Equipment catalog/allocation gate;
8. Assignment/Condition/Issue/Service gate;
9. return/admin-closure/transfer gate;
10. EquipmentProjection leak/safety gate;
11. reconciliation R18–R27 gate;
12. Layer 1 regression gate;
13. final Layer 2 freeze gate.

Every synthetic mutation gate must clean its fixtures.

No final freeze while any Layer 2 reconciliation finding remains open or latest overall reconciliation is non-clean.

---

# 16. Incorporation

On ratification, incorporate this amendment into:

- `../implementation-contract.md`
- `../base44-implementation-profile-v1.md`
- `../implementation-handoff.md`

The canonical contract remains the sole implementation source of truth after incorporation.

The architecture PR must carry the `architecture-amendment` label.

After merge, capture the new `main` SHA and write the Layer 2 runtime implementation work order against that exact SHA.

---

# 17. Ratification boundary

This draft authorizes **no runtime mutation**.

No Layer 2 Base44 entity, function, policy version, scheduled sweep, frontend adapter or production record may be created from this draft until:

1. Amendment 005 is reviewed and ratified;
2. canonical incorporation is complete;
3. architecture CI passes;
4. the amendment PR is merged to `main`;
5. the post-merge SHA is captured as the implementation baseline.
