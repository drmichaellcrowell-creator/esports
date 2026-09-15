# Esports Platform — Canonical Implementation Contract

**Status: AUTHORITATIVE.** This document supersedes all prior phase documents, correction gates, infrastructure gates, and review gates wherever language differs. Historical documents remain design provenance only (see Section 12). Where this contract is silent, implementation must stop and request an explicit architecture decision — it must never infer, assume, or simplify.

No contradictions were found between frozen sources during compilation that the Final Verification Gate had not already resolved. One implicit composition (Section 7, AuditLog+Outbox combined transaction) was made explicit per the Final Verification Gate's own closing invariant.

---

## 1. Global Invariants

These rules apply across every domain without exception.

1. **Organization is the sole tenant/privacy boundary.** Every Organization-owned resource carries an explicit, immutable `organization_id` or resolves one via an immutable FK chain, validated at every write.
2. **Client-supplied Organization context is a selector, never proof of authorization.** The server always re-derives the actor's actual Memberships and independently verifies the target resource's true Organization.
3. **`SharedCompetition` is the only cross-tenant exception**, and it is narrow: only Match/MatchSchedule/MatchParticipant identity, competition-roster identity, submitted score (via `SharedMatchSubmissionProjection`), `AcceptedResult`, `MatchResultConfirmation` state, and discrepancy/dispute state ever cross the boundary. Attendance, Availability, Eligibility, Conduct, Development, Equipment, and private Notification/audit content never cross it, under any condition.
4. **Authorization is centralized.** A single resolver evaluates: actor → organization context → membership → role/scope → resource → resource's true organization/boundary → action → sensitivity → policy decision, for every protected operation. No domain re-implements its own authorization logic.
5. **Native platform role fields are never the authorization root.** Membership, RoleAssignment, CoachScopeAssignment, and CaptainAssignment — all application-owned entities — are the sole source of truth for Organization-scoped authority.
6. **Default deny.** Absence of a matching policy row, malformed input, unresolvable Organization/scope/sensitivity, or an unresolvable active policy version all deny. Nothing defaults to permissive.
7. **Sensitivity is independent of authorization.** A resource's sensitivity classification (`StandardOperational | RestrictedStudent | HighlyRestricted`) never changes because of who is or isn't authorized to read it, and no role automatically inherits `HighlyRestricted` visibility, including Organization Administrator.
8. **Grants are additive, never "highest role wins."** Multiple concurrent Role/Scope Assignments each independently authorize their own resource/action; they are never merged into one blended privilege.
9. **Provenance is preserved, never collapsed.** Restrictions preserve their triggering source; corrections preserve what they corrected; reviews preserve what they reviewed — nothing overwrites the record of why something happened.
10. **Historical records are immutable; corrections/transitions use explicit supersession (`supersedes_*_id` + `is_current`), sequential append, or controlled one-way lifecycle closure — never in-place mutation of a fact once recorded.** The exact pattern per entity is fixed in Section 2/5; no implementation may substitute one pattern for another.
11. **Membership deactivation closes all currently-effective dependent Role/Scope/Captain grants** as part of the same transaction; reactivation restores Membership standing only — closed grants are never silently resurrected. A new authorization tenure requires a fresh grant.
12. **Safe projections are the only path to cross-role or cross-sensitivity visibility.** A projection's field set is fixed by its own frozen definition (Section 8); it is never expanded ad hoc, and it is never treated as source-of-truth provenance.
13. **AuditLog is required for every operation this contract designates audit-required** (Section 4), commits atomically with the domain change, is fully append-only (no update/delete/supersession/`is_current`), records both actor identity and authority path, and is classified `HighlyRestricted`.
14. **Durable Outbox is required for every operation this contract designates as requiring asynchronous downstream work**, commits atomically with the domain change, and guarantees at-least-once, idempotent, crash-recoverable processing. For `SharedCompetition` events, one `OutboxEvent` row exists per participating Organization, each independently processed.
15. **When an operation requires both AuditLog and Durable Outbox, the domain state change, the AuditLog event, and every required OutboxEvent row commit or fail together in one single atomic transaction.** No implementation may split this into sequential, independently-committing transactions.
16. **No client ever authors actor identity, outcome, policy version, Organization scope, or resource identity as trusted input** to AuditLog, Outbox, or any authorization decision — these are always server-derived from actual execution context.
17. **Backend/internal-only entities have no client-facing CRUD path of any kind**, regardless of role. They are manipulated only through the controlled operations that own them (Section 4).
18. **Service/background execution derives Organization scope only from authoritative persisted source data**, never ambient session state or hardcoded tenant IDs, and never fabricates a human actor.
19. **Damage, missing status, overdue status, and disciplinary/academic fault are never automatically inferred from one another**, across every domain where this pattern applies (Equipment, Eligibility, Accountability, Conduct).
20. **No free-text field anywhere in the frozen architecture may hold sensitive narrative from a higher-sensitivity domain.** Where a field could plausibly become such a leak path, it has been replaced with a closed, controlled enum (see `EligibilityEvaluation.reason_code`, `RestrictionReview.review_reason_code`, and all Notification/Outbox closed-template models).

---

## 2. Canonical Entity Catalog

Legend: **Mut.** = mutability model (`AO+S` = append-only + supersession `is_current`; `AO+Seq` = append-only, sequential, non-superseding; `Temporal` = ordinary open/close, no supersession; `Immut` = fully immutable, no update path at all; `Ctrl` = mutable only via named controlled operation). **Sens.** = sensitivity (`SO` = StandardOperational, `RS` = RestrictedStudent, `HR` = HighlyRestricted). **Client R/W** = raw client read / raw client write policy (`—` = no client path of any kind; role names = who is granted).

### Identity / Access / Policy

| Entity | Mut. | Sens. | Client R / Client W | Notes |
|---|---|---|---|---|
| Organization | Ctrl | SO | Player/Coach/OrgAdmin R / OrgAdmin W | `manage` action reserved to OrgAdmin |
| Membership | AO+S (status) | RS | self, OrgAdmin R / OrgAdmin W | `invited\|active\|inactive\|removed`; unique `(user_id, org_id)` regardless of status |
| RoleAssignment | AO+S | RS | self, OrgAdmin R / OrgAdmin W | unique active per `(membership_id, role_category)` |
| CoachScopeAssignment | AO+S | RS | self, OrgAdmin R / OrgAdmin W | discriminated `(scope_type, scope_reference_id)`: `OrganizationWide\|Game\|Team\|TeamSeason` |
| CaptainAssignment | AO+S | RS | self, OrgAdmin, coach_scope R / OrgAdmin, coach_scope W | effectiveness requires active Membership + active Player role + RosterAssignment `IN(active,reserve)` |
| AuthorizationPolicyVersion | Ctrl (pointer only) | — (metadata) | none | rule content in code; record holds `policy_key/version_label/policy_hash/status/effective_from` only; platform singleton active version |

### Team / Roster

| Entity | Mut. | Sens. | Client R / W | Notes |
|---|---|---|---|---|
| Team | Ctrl | SO | Player/Coach/OrgAdmin R / OrgAdmin W | persists across Seasons; `game_id` immutable; cannot go inactive/archived with open TeamSeason beneath it |
| TeamSeason | Ctrl | SO | Player/Coach/OrgAdmin R / OrgAdmin, coach(scoped update) W | `planning\|active\|completed\|withdrawn` |
| RosterAssignment | Temporal | SO | OrgAdmin, coach(scope) R / OrgAdmin, coach(scope) W | never repointed to a different TeamSeason; in-tenure status changes reuse row |
| OrganizationGameOffering | Ctrl | SO | Player/Coach/OrgAdmin R / OrgAdmin W | unique `(org_id, game_id)` regardless of status |
| RosterDisplayProjection | derived | SO | Player (own team-season), coach(scope), OrgAdmin R | see Section 8 |

### Events / Practice / Attendance

| Entity | Mut. | Sens. | Client R / W | Notes |
|---|---|---|---|---|
| Event | Ctrl | SO | Player(has expectation), coach(scope), OrgAdmin R / coach(scope), OrgAdmin W | lifecycle `draft→scheduled→in_progress→completed`, `cancelled`; completed = immutable core fields |
| RecurringEventSeries | Ctrl | SO | coach(scope), OrgAdmin R / same W | series edits only touch still-`draft` occurrences |
| EventParticipationExpectation | AO+S | RS | self, coach(scope), OrgAdmin R / coach(scope), OrgAdmin W (create/supersede only, no update) | materialized once at `draft→scheduled`; never regenerated |
| EventParticipationAdjustment | AO+Seq | RS | self, coach(scope), OrgAdmin R / coach(scope), OrgAdmin W | e.g. `excused`; distinct from Availability |
| AvailabilityResponse | AO (insert-only) | RS | self, coach(scope) R / self(create), coach(coach_correction create) W | No-Response = row absence, never stored |
| AttendanceRecord | AO+S (correction) | RS | self, coach(scope), OrgAdmin R / coach(scope), OrgAdmin W | `absent` reserved for expected-but-didn't-attend |
| Practice | Ctrl | SO | same as Event | 1:1 with Event where `event_type=Practice`; no `team_season_id` field |
| PracticeActivity | Ctrl | SO | same as Event | ordered; `planned\|completed\|modified\|replaced\|skipped` |
| PracticeActivityTemplate | Ctrl | SO | Player/Coach/OrgAdmin R / OrgAdmin, coach W | reusable, Org-defined |

### Competition / Match / Scoring / Results

| Entity | Mut. | Sens. | Client R / W | Notes |
|---|---|---|---|---|
| CompetitionProvider | Ctrl | SO | all R / platform or OrgAdmin(internal) W | `League\|Tournament\|Internal\|Other` |
| Competition | Ctrl | SO | all R / provider-level W | Game-agnostic container |
| CompetitionGameOffering | Ctrl | SO | all R / provider-level W | unique `(competition_id, game_id)` |
| CompetitionRuleset / Version | Immut once active/referenced | SO | all R / provider-level W | `rules` payload incl. `score_schema`, `finalization_authority_model`, `match_authority_model` |
| InternalRulesetVersion | Immut once active/referenced | SO | coach(scope), OrgAdmin R / OrgAdmin W | Org-owned sibling of CompetitionRulesetVersion |
| TeamSeasonCompetitionEntry | AO+S (status) | SO | coach(scope), OrgAdmin R / OrgAdmin W | unique `(team_season_id, competition_game_offering_id)`; transitions AuditLog-required |
| ExternalOpponent | Ctrl | SO | Player/coach/OrgAdmin R / OrgAdmin, coach(scope) W | minimal identity only, no free-text notes; never a tenant |
| Match | Ctrl (state machine, Section 5) | SO | Player(involved), coach(scope), OrgAdmin R / via controlled ops only | no `event_id` 1:1 field; see OrganizationMatchEvent |
| MatchParticipant | Ctrl | SO | same as Match | `InternalTeam \| ExternalOpponent`; determines `boundary_type` |
| **OrganizationMatchEvent** | Ctrl | SO | **— (backend/internal-only, no client CRUD of any kind)** | 1:1 binds one participating Organization's own Event to the shared Match; created only inside controlled Match-participant/Event workflows |
| MatchSchedule | AO+S | SO | Player(involved), coach(scope), OrgAdmin R / coach(scope)+authority-selector, OrgAdmin W | single authoritative competitive time, independent of either Org's local Event schedule |
| MatchLineupEntry | Ctrl (pre-lock only) | SO | same as Match | frozen once `MatchParticipantLineupLock` effective |
| **MatchParticipantLineupLock** | Ctrl | **RS** | **— (backend/internal-only)** | authoritative pending⇄ready driver; created/destroyed only via `lineup.lock`/`lineup.unlock` |
| MatchParticipation | AO+S (correction) | SO | same as Match | carries immutable `roster_assignment_id`; sole source for PlayerCompetitiveResult |
| MatchSegment | Ctrl | SO | same as Match | Ruleset-configured terminology, not hardcoded "Set" |
| ProvisionalResultSubmission | AO+S | SO (role-restricted access) | coach(scope), OrgAdmin R / coach(scope), Captain(own team-season, create only), OrgAdmin W | all submissions provisional regardless of source |
| MatchDiscrepancyFlag | AO+S | SO (role-restricted) | coach(scope), OrgAdmin R / coach(scope), OrgAdmin W | conflicting evidence, not yet a formal dispute |
| MatchDispute | AO+S | SO (role-restricted) | coach(scope), OrgAdmin R / coach(scope), OrgAdmin W | formal, blocks finalization; no Captain authority |
| MatchResultConfirmation | AO+S | SO (role-restricted) | coach(scope + own-org-row), OrgAdmin(own-org-row) R / coach(scope+authority-selector), OrgAdmin W | cross-org sees only shared state/projection, never raw rows |
| AcceptedResult | AO+S (correction=OrgAdmin only) | SO | Player(involved), coach(scope), OrgAdmin R / system-derived at finalization only | separate immutable entity, never a status flag |
| PlayerCompetitiveResult | Immut, no own `is_current` | RS | self, coach(scope) R | bound to one AcceptedResult; aggregates filter on parent `is_current` |
| SharedMatchSubmissionProjection | derived | SO | opposing participant Org (coach/OrgAdmin) R | claim/state only, excludes submitter identity/evidence/audit |
| TeamMatchSummaryProjection | derived | SO | Player/coach/OrgAdmin, per audience R | see Section 8 |
| PlayerMatchResultProjection | derived | SO | Player/coach/OrgAdmin, per audience R | see Section 8 |
| SharedMatchStateProjection | derived | SO | Player/coach/OrgAdmin, per audience R | see Section 8 |

### Player Development / Goals / Skills

| Entity | Mut. | Sens. | Client R / W | Notes |
|---|---|---|---|---|
| PlayerDevelopmentProfile | Immut anchor | RS (existence only to OrgAdmin) | self, coach(scope) R; OrgAdmin (anchor-existence only) R / system-created | thin, content-free, keyed `(membership_id, game_id)` |
| Goal | AO+S | RS | self, coach(scope) R / self(create), coach(scope, create) W | no OrgAdmin content grant |
| SkillDefinition / GameSkillFramework | Ctrl | SO | all R / platform or OrgAdmin(future) W | game-specific vs universal |
| SkillFrameworkVersion | Immut once active/referenced | SO | all R | embedded skill snapshot |
| SkillEvaluation | AO+S | RS | self, coach(scope) R / coach(scope, create) W | `insufficient_evidence` first-class, no numeric field |
| CoachFeedback | AO+S | RS | self, coach(scope) R / coach(scope, create) W | Player-visible |
| PrivateCoachNote | AO+S | **HR** | coach(scope) R (staff-private via scope, not author-private) / coach(scope, create) W | no Player, Captain, or OrgAdmin grant, ever |
| PlayerReflection | AO+S | RS | self, coach(scope) R / self(create) W | no Captain access to teammates' |
| DevelopmentEvidenceLink | Immut | RS | coach(scope), self(via profile projection) R | discriminated, typed evidence_authority auto-derived |
| DevelopmentCheckpoint | Immut, no update | RS | self, coach(scope) R / coach(scope, create) W | pinned snapshot, never rewritten |
| PlayerDevelopmentProfileProjection | derived | RS | self R | see Section 8; no standalone sensitivity tier was named in the originating gate — classified RS here as the structurally-fixed consequence of sourcing exclusively from RS entities, self-only audience, consistent with every other safe projection in this catalog |

### Competitive Tier

| Entity | Mut. | Sens. | Client R / W | Notes |
|---|---|---|---|---|
| CompetitiveTierFramework | Ctrl | SO | all R / platform or OrgAdmin(org-owned) W | ownership ≠ use |
| CompetitiveTierFrameworkVersion | Immut once active/referenced | SO | all R | embedded tier_definitions, no separate Definition entity |
| OrganizationCompetitiveTierFrameworkAdoption | AO+S | SO | OrgAdmin R / OrgAdmin(own org) W | one active per `(org, game)`; never retouches existing Assessments |
| CompetitiveTierAssessment | AO+S | RS | coach(scope) R (raw); Player via projection only | `derivation_mode = coach_authored` only in v1 |
| CompetitiveTierEvidenceLink | Immut | RS | coach(scope) R | closed source-type enum; excludes ProvisionalResultSubmission/PrivateCoachNote |
| CompetitiveTierProjection | derived | RS | self R | see Section 8 |
| CompetitiveTierAdminStatusProjection | derived | SO | OrgAdmin R | existence + timestamp only, never label/rationale |

### Eligibility / Accountability / Conduct / Restriction

| Entity | Mut. | Sens. | Client R / W | Notes |
|---|---|---|---|---|
| EligibilityRequirement | AO+S | SO | all R / OrgAdmin W | no academic content fields exist |
| EligibilityEvaluation | AO+S | RS | self, coach(scope), OrgAdmin R / coach(scope,`coach_operational_status` only), OrgAdmin(`authorized_school_admin`/`manually_verified_documentation`) W | stores only `eligible\|ineligible\|pending`; `unknown` derived from absence |
| EligibilityCombinationPolicyVersion | Ctrl (pointer only) | — (metadata) | none | code-versioned, like AuthorizationPolicyVersion |
| EligibilityStatusProjection | derived | RS | self, coach(scope) R | see Section 8 |
| AccountabilityExpectation | AO+S | RS | self, coach(scope) R / coach(scope, create) W | materialized once |
| AccountabilityRecord | AO+S | RS | self, coach(scope), OrgAdmin R / coach(scope), OrgAdmin W | never auto-generates Conduct |
| ConductIncident | AO+S | **HR** | OrgAdmin R (org-wide), coach(own-reported only) R / coach(scope,create), OrgAdmin(create) W | Captain: zero access |
| ConductResponse | AO+Seq (correction narrow) | **HR** | OrgAdmin R / OrgAdmin W | multiple legitimate sequential rows per Incident; correction ≠ new sequential action |
| AccountabilityConcernReport | Immut-ish (review_status mutable) | **HR** | self(Captain, own only), coach(scope), OrgAdmin R / Captain(own team-season, create) W | no auto ConductIncident/Response/Restriction |
| ParticipationRestriction | AO+S | RS | self, coach(scope), OrgAdmin R / OrgAdmin W | preserves `source_type`/`source_reference_id` always |
| RestrictionReview | Immut, no supersession | RS | OrgAdmin R / OrgAdmin W | `review_reason_code` closed enum, no free-text rationale |

### Equipment

| Entity | Mut. | Sens. | Client R / W | Notes |
|---|---|---|---|---|
| EquipmentAssetType | Ctrl | SO | all R / OrgAdmin W | Org-defined category |
| EquipmentAsset | Ctrl-narrow (status via workflows only) | SO | Player(assigned/self), coach(scope), OrgAdmin R / OrgAdmin(identity fields), controlled ops(status) W | `current_location` not persisted; status never via generic update |
| EquipmentAssetAllocation | Ctrl | SO | coach(scope) R / OrgAdmin W | ownership ≠ usable pool |
| EquipmentAssignment | Temporal + AO+S (correction) | RS | self, coach(scope), OrgAdmin R / coach(scope, from allocated pool), OrgAdmin W | at most one active per Asset across ALL assignee types |
| EquipmentConditionAssessment | AO+S (correction) | RS | self(own), coach(scope), OrgAdmin R / coach(scope), OrgAdmin W | optional `location_reference` |
| EquipmentIssueReport | AO+S (correction) | RS | self(own), coach(scope), OrgAdmin R / self(active assignment/return-workflow only) W | narrow Player-authorization window, no undefined grace period |
| EquipmentServiceRecord | AO+S (correction) | **SO** | coach(scope), OrgAdmin R / OrgAdmin W | Asset-only, no Player-attributed field, never a conduct field |
| EquipmentProjection | derived | RS | self R | see Section 8 |

### Communication

| Entity | Mut. | Sens. | Client R / W | Notes |
|---|---|---|---|---|
| Announcement | AO+S (correction) + withdrawal | SO | Player(in audience), coach(scope), OrgAdmin R / coach(scope, non-org-wide), OrgAdmin W | correction inherits original audience; new announcement re-resolves current |
| **AnnouncementAudience** | Immut (materialized) | RS | **— (backend/internal-only)** | computes `viewer_in_audience` context only; no raw CRUD for any role |
| Notification | Immut (read/ack timestamps only mutable) | **RS (universal)** | self R | closed template rendering; source_reference ≠ deep-link target |
| **NotificationDeliveryAttempt** | Immut | RS | **— (no human read path in v1; service/diagnostic only)** | separate from Notification existence |
| ActionItem | live-derived or read-through cache | RS | self, coach(scope, exceptions) R | no `due_at` stored; no independently-toggleable completion |
| CommunicationPreference | Ctrl (current value only, no history) | RS | self R / self(non-mandatory categories), OrgAdmin(mandatory categories) W | never disables required notices |
| ActionCenterProjection | derived | RS | self, coach(scope) R | see Section 8 |

### Infrastructure

| Entity | Mut. | Sens. | Client R / W | Notes |
|---|---|---|---|---|
| AuditLogEvent | **Immut — zero mutable fields** | **HR** | OrgAdmin(own-org events) R / **—** (server-only write) | corrections = new compensating events only |
| SharedAuditEventProjection | derived | HR (narrow fields) | participant OrgAdmin R | timestamp/action-type/resource-ref/outcome/acting-participant only |
| OutboxEvent | Ctrl (processing_state machine) | **RS** (tenant-scoped) / SO (Platform-only, non-student) | **—** (backend/internal-only, no client CRUD) | one row per participant Org for SharedCompetition |
| OutboxHealthProjection | derived | SO | OrgAdmin(own org) R | aggregate counts only, no raw payload |

**No unclassified entity remains** — every entity above carries an explicit sensitivity tier (Section 9 restates this as a flat registry).

---

## 3. Authorization Contract

Absence of a row below = **deny**. All rows are additive across concurrently-held Role/Scope Assignments (Global Invariant 8).

### Player
| Operation/Entity | Scope/Context | Notes |
|---|---|---|
| Read own Membership/RoleAssignment/CoachScopeAssignment/CaptainAssignment | self | — |
| Read Organization, Team, TeamSeason, RosterDisplayProjection | same_organization / viewer_team_season_member (roster projection) | — |
| Read own EventParticipationExpectation/Adjustment, AvailabilityResponse, AttendanceRecord | self | — |
| Create/update own AvailabilityResponse | self | — |
| Read Event/Practice where a materialized Expectation exists | viewer_has_expectation | — |
| Read Match/MatchSegment/AcceptedResult involving their TeamSeason | match_involves_viewer_team_season | — |
| Read own PlayerCompetitiveResult | self | — |
| Read/create own Goal, PlayerReflection; read own SkillEvaluation, CoachFeedback, DevelopmentCheckpoint, PlayerDevelopmentProfile | self | never PrivateCoachNote |
| Read own CompetitiveTierProjection | self | never raw Assessment |
| Read own EligibilityStatusProjection, ParticipationRestriction, AccountabilityExpectation/Record | self | never raw ConductIncident/Response |
| Read own EquipmentProjection; create EquipmentIssueReport | self, active assignment or return-workflow only | — |
| Read Announcement (in audience), own Notification/ActionItem; update own CommunicationPreference (non-mandatory) | viewer_in_audience / self | — |

### Coach
| Operation/Entity | Scope/Context | Notes |
|---|---|---|
| Read/manage Team/TeamSeason/RosterAssignment, OrganizationGameOffering(read) | coach_scope_match | TeamSeason update only, no create/revoke |
| Read Membership, RoleAssignment (self only, not org-wide) | self | **no non-self grant** |
| Read/create Event/Practice/PracticeActivity/RecurringEventSeries, EventParticipationExpectation(supersede)/Adjustment, AttendanceRecord, AvailabilityResponse(coach_correction) | coach_scope_match | — |
| Read/create TeamSeasonCompetitionEntry, InternalRulesetVersion(read); read Match/MatchLineupEntry/MatchParticipation/MatchSegment/ProvisionalResultSubmission/MatchDiscrepancyFlag/MatchDispute; execute lineup.lock/unlock; create MatchResultConfirmation | coach_scope_match + Org is MatchParticipant + authority selector (confirmation/lifecycle ops) | finalize (create AcceptedResult) requires no open discrepancy/dispute |
| Read own-org MatchResultConfirmation rows | coach_scope_match AND own org row | never other participant's raw row |
| Read/create Goal, SkillEvaluation, CoachFeedback, PrivateCoachNote(scope-wide staff-private), read PlayerReflection, DevelopmentEvidenceLink, DevelopmentCheckpoint(create); read PlayerDevelopmentProfile | coach_scope_match | — |
| Read/create CompetitiveTierAssessment, CompetitiveTierEvidenceLink | coach_scope_match | v1 `coach_authored` only |
| Read EligibilityStatusProjection, ParticipationRestriction; create EligibilityEvaluation(`coach_operational_status` only); create ConductIncident, read own-reported only; create AccountabilityExpectation/Record | coach_scope_match | no ConductResponse authority; no RestrictionReview access |
| Read/create EquipmentAssignment/ConditionAssessment/IssueReport/ServiceRecord from allocated pool; read EquipmentAsset(scope) | coach_scope_match, allocation-scoped | no allocation-management authority |
| Author Announcement (Team/TeamSeason/Game/SelectedMembers only, never OrganizationWide); read own Notification/ActionCenter exception view | coach_scope_match | — |

### Organization Administrator
| Operation/Entity | Scope/Context | Notes |
|---|---|---|
| Manage Organization, Membership, RoleAssignment, CoachScopeAssignment, CaptainAssignment | same_organization | — |
| Manage Team, TeamSeason, RosterAssignment, OrganizationGameOffering | same_organization | — |
| Manage Event/Practice/RecurringEventSeries/PracticeActivityTemplate, read all Expectation/Availability/Attendance | same_organization | — |
| Manage TeamSeasonCompetitionEntry, InternalRulesetVersion, MatchSchedule(supersede, per authority selector); read Match/Lineup/Participation/Submission/Discrepancy/Dispute/Confirmation(own-org rows) | same_organization | finalize/correct AcceptedResult reserved to OrgAdmin specifically for post-final corrections |
| Read PlayerDevelopmentProfile (existence only) | same_organization | **no** Goal/SkillEvaluation/CoachFeedback/PrivateCoachNote/PlayerReflection/DevelopmentCheckpoint content grant |
| Manage own-org CompetitiveTierFramework/FrameworkVersion/Adoption; read CompetitiveTierAdminStatusProjection | same_organization | **no** raw Assessment/EvidenceLink/Projection access |
| Manage EligibilityRequirement; create/read `authorized_school_admin`/`manually_verified_documentation` EligibilityEvaluation; full ConductIncident/ConductResponse authority; manage ParticipationRestriction/RestrictionReview | same_organization | sole formal conduct-adjudicating authority in v1 |
| Manage EquipmentAssetType/Asset(identity fields)/AssetAllocation; read/create/correct Assignment/Condition/IssueReport/ServiceRecord org-wide | same_organization | asset status only via controlled workflows, never generic update |
| Organization-wide Announcement authority, communication configuration (mandatory-category enforcement) | same_organization | — |
| Read own-org AuditLogEvent | same_organization + boundary rules | narrow shared fields only for SharedCompetition |
| Read OutboxHealthProjection; execute OutboxDeadLetterReplay (own org's rows/participant-portion only) | same_organization | — |

### Captain (Player + effective CaptainAssignment)
| Operation/Entity | Scope/Context | Notes |
|---|---|---|
| Create ProvisionalResultSubmission | captain_team_season_match (own effective Team-Season only) | never finalize, never confirm, never resolve discrepancy/dispute |
| Create AccountabilityConcernReport; read own submitted report only | own effective Team-Season | no ConductIncident/Response/Restriction authority, no auto-creation path |
| Everything else | inherits ordinary Player grants only | **no** Announcement authoring, **no** equipment authority beyond self, **no** raw Eligibility/Conduct/Restriction/development/Tier access into any teammate, **no** RestrictionReview, **no** MatchResultConfirmation, **no** lineup.lock/unlock |

### Platform Administrator
No standing grant on any Organization's `RestrictedStudent`/`HighlyRestricted` content, any Organization's AuditLog, or any Organization's Outbox. Exists outside Organization hierarchy for platform-level catalog/registry/policy-activation actions only. Any tenant-data investigation requires a deliberate, scoped, time-boxed, audited break-glass grant — never ambient access.

### Service / Background actors
Never a fabricated human actor. Always carry `service_operation_key` + `service_source_record_reference`, deriving Organization scope only from the specific persisted record driving the job.

---

## 4. Controlled Operation Catalog

Format: `operation_key` — actors — preconditions — records touched — transaction/Audit/Outbox requirement.

| Operation | Authorized actors | Preconditions | Creates/Supersedes | Audit | Outbox |
|---|---|---|---|---|---|
| `membership.deactivate` | OrgAdmin | active Membership | Membership status; cascades close all dependent Role/Scope/Captain | Required | — |
| `role.assign` / `role.revoke` | OrgAdmin | — | RoleAssignment (new/superseded) | Required | — |
| `scope.assign` / `scope.revoke` | OrgAdmin | Role is Coach | CoachScopeAssignment | Required | — |
| `captain.assign` | OrgAdmin, coach(scope) | active Membership + active Player role + qualifying RosterAssignment | CaptainAssignment | Required | — |
| `captain.close` | system (cascade), OrgAdmin | RosterAssignment leaves active/reserve, or Player role closes | CaptainAssignment superseded | Required | — |
| `policy.activate` | Platform | new version passes validation | AuthorizationPolicyVersion pointer | Required | — |
| `roster.move` | coach(scope), OrgAdmin | valid destination TeamSeason | old RosterAssignment closed + new created (+ CaptainAssignment cascade if applicable) | Required | — |
| `event.materialize_expectations` | system | Event `draft→scheduled` | EventParticipationExpectation set | — | if Notification required |
| `team_season_competition_entry.transition` | OrgAdmin, coach(scope) | valid Offering/Entry | TeamSeasonCompetitionEntry status | Required | — |
| `lineup.lock` | coach(scope, own org), OrgAdmin(own org) | roster validity + eligibility=eligible + restrictions clear + ruleset constraints, all atomically | MatchParticipantLineupLock | Required | — |
| `lineup.unlock` | coach(scope, own org), OrgAdmin(own org) | Match.status ∈ {pending, ready} | MatchParticipantLineupLock closed | Required | — |
| `match.start` | authority per `lifecycle_start` selector (SharedCompetition) or scoped coach/OrgAdmin (OrganizationOwned) | Match.status = ready | Match.status → in_progress | Required | — |
| `match.mark_complete` | authority per `lifecycle_complete` selector / scoped local authority | Match.status = in_progress, no current submission yet | Match.status → awaiting_result | Required | — |
| `match.cancel` | authority per `lifecycle_cancel` selector / scoped local authority | Match.status ∈ {pending, ready} only | Match.status → cancelled | Required | — |
| `match_schedule.supersede` | authority per `schedule_change` selector / scoped local authority | — | new MatchSchedule row, old superseded | Required | Required (SharedCompetition: per-participant) |
| `result.submit` | coach(scope), Captain(own team-season) | Match reached awaiting_result or later, valid score schema | ProvisionalResultSubmission (new/superseding) | Required | if Notification required |
| `discrepancy.resolve_as_correct` / `.request_correction` / `.open_dispute` | coach(scope), OrgAdmin | open MatchDiscrepancyFlag | flag/dispute status | Required | — |
| `confirmation.record` | coach(scope)+authority selector, OrgAdmin | Org is MatchParticipant, selector permits | MatchResultConfirmation (new/superseding) | Required | — |
| `result.finalize` | coach(scope)+finalization_authority_model, OrgAdmin | no open discrepancy/dispute, confirmation model satisfied | AcceptedResult (new) + PlayerCompetitiveResult set | Required | if Notification required |
| `result.correct` | OrgAdmin only | prior AcceptedResult exists | AcceptedResult (superseding) + new PlayerCompetitiveResult set | Required | if Notification required |
| `eligibility.evaluate` | coach(scope, operational-status only), OrgAdmin(admin/documented) | valid Requirement | EligibilityEvaluation (new/superseding) | Required | if state-change Notification required |
| `restriction.create` / `.review` (`continue\|modify\|revoke\|expire`) | OrgAdmin | valid source provenance | ParticipationRestriction (new/superseding) + RestrictionReview (if reviewed) | Required | — |
| `conduct.report` | coach(scope), OrgAdmin | — | ConductIncident | Required | — |
| `conduct.respond` | OrgAdmin | existing Incident | ConductResponse (sequential) | Required | — |
| `concern.report` | Captain(own team-season) | effective Captain Assignment | AccountabilityConcernReport | Required | — |
| `equipment.return` | coach(scope), OrgAdmin | active Assignment | Assignment closed + ConditionAssessment + Asset.status derived, atomically | Required | — |
| `equipment.administrative_closure` | coach(scope), OrgAdmin | explicit resulting-status determination provided | Assignment closed + Asset.status set, atomically | Required | — |
| `equipment.transfer` | coach(scope, allocated pool), OrgAdmin | destination valid | old Assignment closed + new created, atomically | Required | — |
| `announcement.publish` | coach(scope, non-org-wide), OrgAdmin | valid audience | Announcement + AnnouncementAudience + OutboxEvent, atomically | Required | Required |
| `announcement.correct` | same as publish | prior Announcement exists | new Announcement inheriting original audience + OutboxEvent | Required | Required |
| `outbox.replay` | OrgAdmin, own-org/own-participant-portion only | event is dead_letter | processing_state reset | Required | n/a (is the outbox op) |

---

## 5. Lifecycle / State-Machine Catalog

### Match.status — the canonical, final lifecycle (no other transition exists)
```
pending ⇄ ready            (continuously derived from MatchParticipantLineupLock effectiveness on every required InternalTeam participant)
ready → in_progress         (controlled match.start, authority: lifecycle_start selector)
in_progress → awaiting_result (controlled match.mark_complete, authority: lifecycle_complete selector)
awaiting_result → result_submitted (system-derived: current ProvisionalResultSubmission exists)
result_submitted → disputed  (system-derived: open MatchDispute exists)
disputed → result_submitted  (system-derived: dispute resolved)
result_submitted → final     (system-derived: successful AcceptedResult finalization — NO direct disputed→final path)
pending | ready → cancelled  (controlled match.cancel, authority: lifecycle_cancel selector — NOT reachable from in_progress or later)
```

### Event.status (independent of Match.status)
`draft → scheduled → in_progress → completed`, plus `cancelled` (from draft/scheduled only). Postponement = cancel + supersession (new Event row), never a status value.

### Membership.status
`invited → active ⇄ inactive/removed` (temporal, no supersession — status itself is the current fact). Deactivation is a controlled-closure event, not merely a flag flip: it cascades to close dependent Role/Scope/Captain grants in the same transaction.

### RosterAssignment.participation_status
`active ⇄ reserve ⇄ inactive` (same row, in-tenure) → `completed | removed` (terminal for that row; a new TeamSeason requires a new row).

### CaptainAssignment effectiveness (live-computed, not a stored status alone)
Requires simultaneously: active Membership + active Player RoleAssignment + RosterAssignment `∈ {active, reserve}` (NOT `inactive` — that makes it temporarily non-effective without closing it) + CaptainAssignment itself active/in-window. Only `completed`/`removed` RosterAssignment status triggers controlled closure of the CaptainAssignment.

### TeamSeasonCompetitionEntry.status
`registered → active ⇄ withdrawn → completed`, all transitions AuditLog-required, historical transitions preserved via audit trail (not a field-level history array).

### ParticipationRestriction / RestrictionReview
Restriction: AO+S. Review: fully immutable, no supersession of its own; `continue` → no new Restriction; `modify|revoke|expire` → new superseding Restriction inheriting original `source_type`/`source_reference_id` by default.

### AcceptedResult
AO+S; correction = new superseding row (OrgAdmin only); PlayerCompetitiveResult has no independent currency — filtered entirely by parent's `is_current`.

### OutboxEvent.processing_state
`pending → processing (claimed+leased) → completed`, with `failed_retryable` (lease-expiry recoverable) and `dead_letter` (terminal, replayable by narrowly-authorized OrgAdmin only) branches. Infrastructure bookkeeping only — never domain truth.

---

## 6. Cross-Domain Dependency Graph

```
LAYER 0 — Foundation (must exist before anything else)
  Organization, Membership, RoleAssignment, CoachScopeAssignment, CaptainAssignment,
  AuthorizationPolicyVersion + resolver, AuditLogEvent, OutboxEvent

LAYER 1 — Team/Roster
  Team, TeamSeason, RosterAssignment, OrganizationGameOffering, RosterDisplayProjection
  (depends on Layer 0 only)

LAYER 2 — parallel, both depend only on Layer 0+1
  Events/Practice/Attendance/Availability         Equipment
  (Event, Practice, Expectation, Availability,     (AssetType, Asset, Allocation,
   Attendance)                                      Assignment, Condition, Issue, Service)

LAYER 3 — Competition/Match
  CompetitionProvider..AcceptedResult..PlayerCompetitiveResult
  (depends on Layer 1 for Team/Roster, Layer 2 for OrganizationMatchEvent binding)

LAYER 4 — parallel, both depend on Layer 1 (+ Layer 3 for objective evidence, non-blocking)
  Eligibility/Accountability/Conduct/Restriction   Development/Goals/Skills
  (consulted as a gate by Layer 3's lineup.lock)    (benefits from Layer 3 evidence)

LAYER 5 — Competitive Tier
  (depends on Layer 3 AND Layer 4/Development for evidence)

LAYER 6 — Communication
  Announcement/Notification/ActionItem/ActionCenter
  (depends on every prior layer — every Notification type's source_reference points into one)
```

Layer order must not be violated for security-relevant reasons: Layer 0's resolver and AuditLog/Outbox primitives are consulted by literally every controlled operation in every later layer, and Layer 3's lineup-lock gate directly consults Layer 4's Eligibility/Restriction state — a partial implementation that skips Layer 4 cannot safely implement `lineup.lock` at all.

---

## 7. Transaction Catalog

Every row below is one atomic transaction — partial commit is never acceptable.

| Transaction | Records that commit/fail together |
|---|---|
| Membership deactivation | Membership status + every dependent Role/Scope/Captain closure + AuditLog event(s) |
| Roster move | old RosterAssignment close + new RosterAssignment create + CaptainAssignment cascade (if applicable) + AuditLog event |
| Captain grant | 4-way prerequisite validation + CaptainAssignment create + AuditLog event |
| Event expectation materialization | Event status transition + full EventParticipationExpectation set + AuditLog event (if required) + OutboxEvent (if Notification required) |
| `lineup.lock` | 4-way validation (roster/eligibility/restriction/ruleset) + MatchParticipantLineupLock create + AuditLog event; Match.status re-derivation is a read-time consequence, not a separate write |
| `match.start` / `match.mark_complete` / `match.cancel` | Match.status transition + AuditLog event |
| `match_schedule.supersede` | old MatchSchedule superseded + new MatchSchedule created + AuditLog event + OutboxEvent(s) (per-participant for SharedCompetition) — **all in one transaction, per Global Invariant 15** |
| `result.finalize` / `result.correct` | discrepancy/dispute/confirmation preconditions verified + AcceptedResult create/supersede + full PlayerCompetitiveResult set + AuditLog event + OutboxEvent (if Notification required) |
| Eligibility lineup gate evaluation | combination computation + Match/Lineup lock decision + AuditLog event (both authorization and eligibility-combination provenance, kept as two distinct field groups) |
| `equipment.return` | Assignment closure + ConditionAssessment create + Asset.status derivation + AuditLog event — **structurally impossible to complete leaving Asset.status stale** |
| `equipment.transfer` | outgoing Assignment close + incoming Assignment create + AuditLog event |
| `announcement.publish` | Announcement + complete AnnouncementAudience materialization + OutboxEvent(s) + AuditLog event (if designated) — **if the OutboxEvent cannot be written, the whole publish fails** |
| `restriction.review` (any outcome) | RestrictionReview create + (if modify/revoke/expire) superseding ParticipationRestriction create + AuditLog event |

**Global Invariant 15 applies without exception**: wherever a transaction row above requires both AuditLog and Outbox, all three (domain change, audit event, outbox row(s)) are one transaction — never split.

---

## 8. Projection / Safe-Surface Catalog

| Projection | Source of truth | Audience | Exposes | Withholds | Provenance? |
|---|---|---|---|---|---|
| RosterDisplayProjection | RosterAssignment, Team, Membership(allowlist), CaptainAssignment(live) | Player(own team-season), coach(scope), OrgAdmin | display_name, gamer_tag, team/game context, live captain_indicator, member_reference (not raw membership_id) | raw membership_id, all Membership fields beyond allowlist | **No** |
| TeamMatchSummaryProjection | Match, MatchParticipant, AcceptedResult | Player/coach/OrgAdmin per audience | identity, opponent, schedule, result summary | raw submission/audit detail | **No** |
| PlayerMatchResultProjection | PlayerCompetitiveResult, MatchParticipation | self, coach(scope) | individual result, simply rendered | correction chain, raw audit | **No** |
| SharedMatchStateProjection | Match, MatchParticipant, MatchSchedule, AcceptedResult, dispute/discrepancy state | both participant Orgs | the narrow SharedCompetition surface only | all OrganizationOwned content of either side | **No** |
| SharedMatchSubmissionProjection | ProvisionalResultSubmission (narrowed) | opposing participant Org | claimed score/segment values, discrepancy/dispute state | submitter identity, evidence refs, correction history, audit metadata | **No** |
| PlayerDevelopmentProfileProjection | Goal, SkillEvaluation, CoachFeedback, DevelopmentCheckpoint, DevelopmentEvidenceLink | self | current goals, latest skill state (incl. insufficient_evidence), recent feedback, checkpoint summaries, evidence w/ authority label | PrivateCoachNote (structurally unreachable) | **No** |
| CompetitiveTierProjection | CompetitiveTierAssessment(current) | self | tier_state (or insufficient_evidence), evidence categories (not raw items), movement_indicator (new/unchanged/higher/lower/changed/not_comparable) | rationale, evaluator, derivation_mode | **No** |
| CompetitiveTierAdminStatusProjection | CompetitiveTierAssessment(existence check) | OrgAdmin | existence + last_assessment_at | label, rationale, evidence, evaluator | **No** |
| EligibilityStatusProjection | EligibilityEvaluation(s) + combination computation | self, coach(scope) | overall status, blocking requirement category/description, action hint | raw source_reference, reason_code detail beyond category | **No** |
| EquipmentProjection | EquipmentAssignment, EquipmentIssueReport(own) | self | assigned item, purpose, due date, action_needed, own reported issues | other Players' assignments, service notes, blame framing (none exists) | **No** |
| ActionCenterProjection | ActionItem, Notification | self, coach(scope, exceptions) | prioritized (hard_blocker/due_soon/overdue/informational) items with live-derived due dates and deep-links | — | **No** |
| SharedAuditEventProjection | AuditLogEvent(narrowed) | participant OrgAdmin | timestamp, shared action type, shared resource ref, outcome, acting participant Org | actor_user_id, actor_membership_id, private related-resource refs, private reason/detail, private changed-field metadata | **No** |
| OutboxHealthProjection | OutboxEvent(aggregated, own-org/own-target rows only) | OrgAdmin | pending/failed/dead_letter counts, oldest_pending_age | raw payload, source references, event type breakdown | **No** |

**No projection listed above, or anywhere else in the frozen architecture, may ever be used as `source_reference`/provenance for a Notification, AuditLog event, OutboxEvent, or any authorization decision.** Every one is a read-only derived surface.

---

## 9. Sensitivity Registry (complete, flat)

**StandardOperational**: Organization, Team, TeamSeason, OrganizationGameOffering, RosterAssignment, **RosterDisplayProjection**, Event, RecurringEventSeries, Practice, PracticeActivity, PracticeActivityTemplate, CompetitionProvider, Competition, CompetitionGameOffering, CompetitionRuleset(Version), InternalRulesetVersion, TeamSeasonCompetitionEntry, ExternalOpponent, Match, MatchParticipant, **OrganizationMatchEvent**, MatchSchedule, MatchLineupEntry, MatchSegment, ProvisionalResultSubmission (role-restricted access), MatchParticipation (role-restricted), MatchDiscrepancyFlag (role-restricted), MatchDispute (role-restricted), MatchResultConfirmation (role-restricted), AcceptedResult, **SharedMatchSubmissionProjection**, **TeamMatchSummaryProjection**, **PlayerMatchResultProjection**, **SharedMatchStateProjection**, SkillDefinition, GameSkillFramework, SkillFrameworkVersion, CompetitiveTierFramework, CompetitiveTierFrameworkVersion, OrganizationCompetitiveTierFrameworkAdoption, CompetitiveTierAdminStatusProjection, EligibilityRequirement, EquipmentAssetType, EquipmentAsset, EquipmentAssetAllocation, **EquipmentServiceRecord**, Announcement, OutboxEvent (Platform-boundary only), OutboxHealthProjection.

**RestrictedStudent**: Membership, RoleAssignment, CoachScopeAssignment, CaptainAssignment, **MatchParticipantLineupLock**, EventParticipationExpectation, EventParticipationAdjustment, AvailabilityResponse, AttendanceRecord, PlayerCompetitiveResult, PlayerDevelopmentProfile(content-adjacent, existence-only to OrgAdmin), **PlayerDevelopmentProfileProjection**, Goal, SkillEvaluation, CoachFeedback, PlayerReflection, DevelopmentEvidenceLink, DevelopmentCheckpoint, CompetitiveTierAssessment, CompetitiveTierEvidenceLink, CompetitiveTierProjection, EligibilityEvaluation, EligibilityStatusProjection, AccountabilityExpectation, AccountabilityRecord, ParticipationRestriction, **RestrictionReview**, EquipmentAssignment, EquipmentConditionAssessment, EquipmentIssueReport, EquipmentProjection, **AnnouncementAudience**, **Notification (universal, regardless of source sensitivity)**, **NotificationDeliveryAttempt**, ActionItem, CommunicationPreference, **ActionCenterProjection**, **OutboxEvent (OrganizationOwned/SharedCompetition — tenant-scoped default)**.

**HighlyRestricted**: PrivateCoachNote, ConductIncident, ConductResponse, AccountabilityConcernReport, **AuditLogEvent**, **SharedAuditEventProjection** (narrow fields, still HR-tier).

**No sensitivity classification (metadata/pointer entities only, not content)**: AuthorizationPolicyVersion (rule content is code, not stored data), EligibilityCombinationPolicyVersion (same reasoning).

**Confirmed final decisions, per this session's corrections**:
- `MatchParticipantLineupLock` = **RestrictedStudent** (individually-attributed competitive + gate-provenance content, despite zero client read path).
- `RestrictionReview` = **RestrictedStudent** (confirmed post-correction; no field can carry HighlyRestricted narrative).
- `OrganizationMatchEvent` = **StandardOperational**, backend/internal-only (no content of its own beyond an id-binding join).
- `AnnouncementAudience` = **RestrictedStudent**, backend/internal-only.
- `NotificationDeliveryAttempt` = **RestrictedStudent**, no human read path in v1.

---

## 10. Implementation Prohibitions

Implementation agents must **never**:

1. Write to `Match.status`, `EquipmentAsset.status`, or any other controlled-transition field through a generic entity `update` operation — only the named controlled operations in Section 4 may write these fields.
2. Allow a client to author `actor_user_id`, `actor_membership_id`, `outcome`, policy version/hash, Organization scope, or resource identity as trusted input to AuditLog, Outbox, or any authorization decision.
3. Grant Coach non-self access to raw `Membership` or `RoleAssignment` — Coach's own-record access is `self` only; broader visibility is scope-based on other entities, never these two.
4. Grant Organization Administrator any raw content access to `Goal`, `SkillEvaluation`, `CoachFeedback`, `PrivateCoachNote`, `PlayerReflection`, `DevelopmentCheckpoint` content, `CompetitiveTierAssessment`, `CompetitiveTierEvidenceLink`, or the Player-facing `CompetitiveTierProjection` — administrative authority is structurally separate from developmental-content visibility.
5. Grant Captain any authority beyond: creating `ProvisionalResultSubmission` for their own effective Team-Season; creating/reading their own `AccountabilityConcernReport`; and ordinary Player self-access. Never invent Captain finalization, dispute, confirmation, restriction-review, conduct, equipment-allocation, lineup-lock, or Announcement-authoring authority.
6. Cancel a Match once `Match.status = in_progress` or later. A Match that begins competitive play and stops early must proceed through the Result architecture with an appropriate `result_type` — never through cancellation.
7. Create a direct `disputed → final` transition. The only path is `disputed → result_submitted → final`.
8. Copy sensitive narrative from a higher-sensitivity source (ConductIncident, ConductResponse, PrivateCoachNote, raw academic detail) into a lower-sensitivity field — including `RestrictionReview.review_reason_code` (must remain a closed enum), `EligibilityEvaluation` (must use typed `source_reference` + `reason_code`, never free text), or any Notification `template_parameters`.
9. Expose `OrganizationMatchEvent`, `AnnouncementAudience`, `MatchParticipantLineupLock`, `NotificationDeliveryAttempt`, or `OutboxEvent` through any generic client-facing CRUD endpoint, for any role.
10. Treat any projection listed in Section 8 as source-of-truth provenance for a Notification, AuditLog event, OutboxEvent, or authorization decision.
11. Mutate a historical row where supersession or append-only correction is the defined pattern (Section 2's Mut. column) — this includes never hard-deleting Membership/Role/Scope/Captain/Goal/SkillEvaluation/etc. rows through ordinary product workflows.
12. Commit a protected domain mutation if its required AuditLog event and/or Outbox event(s) fail to write — the entire transaction must roll back (Global Invariant 15).
13. Allow one Organization's actor to lock, unlock, confirm, or otherwise write against another Organization's `MatchParticipant`, `MatchParticipantLineupLock`, or `MatchResultConfirmation` row — even within a `SharedCompetition` Match.
14. Apply a permissive default when a `SharedCompetition` Ruleset authority selector (`lifecycle_start/complete/cancel`, `schedule_change`, `finalization_authority_model`) is missing, malformed, or ambiguous — this must fail closed, never default to `any_participant_may_*`.
15. Allow Platform Administrator standing, unrestricted read access to any Organization's `RestrictedStudent`/`HighlyRestricted` content, AuditLog, or Outbox — any such access requires an explicit, scoped, time-boxed, audited break-glass grant that does not yet exist in this architecture and must not be implemented as an ambient capability.
16. Store `due_at` as an independently persisted field on `ActionItem`, or `rendered_summary`/free-text on `Notification` — both are structurally removed in favor of live derivation and closed templates respectively.
17. Infer fault, blame, or a disciplinary conclusion from `EquipmentConditionAssessment.condition_state = damaged`, `EquipmentAsset.status = missing`, an overdue `EquipmentAssignment`, or an `AccountabilityRecord.status = incomplete` — none of these may automatically create or imply a `ConductIncident`.

---

## 11. Implementation Verification Checklist

Run at the end of every implementation phase before declaring it complete:

- [ ] **Schema correctness**: every entity matches its Section 2 field/mutability/sensitivity definition exactly; no invented fields.
- [ ] **Authorization**: every read/write path checked against Section 3; no operation lacks an explicit policy row or explicit denial.
- [ ] **Organization isolation**: attempt a cross-Organization read/write for every entity type touched this phase; confirm denial in every case except explicitly frozen SharedCompetition paths.
- [ ] **Controlled-write enforcement**: confirm no client-facing generic `update` can reach a field designated controlled-transition-only (Section 4/10).
- [ ] **Sensitivity exposure**: confirm no response payload includes a field above the sensitivity tier the requester is authorized for; confirm no HighlyRestricted content reachable via any RestrictedStudent/StandardOperational surface.
- [ ] **Transaction atomicity**: for every transaction in Section 7 touched this phase, confirm a forced mid-transaction failure leaves no partial state (test by injecting failure at each named sub-step).
- [ ] **AuditLog**: every operation designated audit-required in Section 4 produces exactly one (or correctly correlated multiple) AuditLogEvent row(s), atomically with its domain change; confirm zero mutability on any written row.
- [ ] **Outbox**: every operation designated Outbox-required produces the correct row(s) — one for OrganizationOwned, one per participant for SharedCompetition — atomically; confirm idempotent reprocessing produces no duplicate downstream effect.
- [ ] **Lifecycle legality**: attempt every illegal state transition named in Section 5/10 (e.g., cancel from in_progress, disputed→final directly) and confirm rejection.
- [ ] **Supersession/current-state correctness**: for every `is_current`-pattern entity touched, confirm exactly one `is_current = true` row exists per key at all times, and that historical rows are unreachable as "current" through any query path.
- [ ] **Fail-closed behavior**: test malformed/missing policy version, missing Ruleset authority selector, unresolvable Organization context, and confirm denial (never a permissive fallback) in every case.
- [ ] **Tests**: automated coverage exists for every fail-closed case listed in this phase's relevant domain gate(s).
- [ ] **No direct client CRUD bypass**: confirm `OrganizationMatchEvent`, `AnnouncementAudience`, `MatchParticipantLineupLock`, `NotificationDeliveryAttempt`, `OutboxEvent` have zero client-reachable endpoints.

---

## 12. Traceability Appendix (provenance only — not required to interpret this contract)

| Contract section | Originating gate(s) |
|---|---|
| Identity/Access/Policy | Phases 1A, 1B, 1C, 1D |
| Team/Roster | Phases 2A, 2B |
| Events/Practice/Attendance | Phase 2C (as corrected) |
| Competition/Match/Scoring/Results | Phase 2D (original + two correction rounds: authorization/lifecycle completion, cancellation/lineup-lock finalization) |
| Development/Goals/Skills | Phase 2E (as corrected) |
| Competitive Tier | Phase 2F (as corrected, three rounds) |
| Eligibility/Accountability/Conduct/Restriction | Phase 2G (original + two correction rounds + RestrictionReview content-boundary correction) |
| Equipment | Phase 2H (original + two correction rounds) |
| Communication | Phase 2I (original + correction round) |
| AuditLog | AuditLog Infrastructure Gate (original + correction round) |
| Durable Outbox | Durable Outbox Infrastructure Gate (original + two correction rounds) |
| Cross-domain composition, register, minors closure | Cross-Domain Invariant + Integration Review, its revision, and the Final Verification Gate |

This document is the sole implementation source of truth going forward. The gates listed above remain available for historical design rationale only.
