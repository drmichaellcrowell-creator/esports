# Layer 1 Team/Roster — Implementation Status

**Architecture baseline:** `c3270ed7f1dd10642e82793b84833990b712e9ec`  
**Implementation branch:** `layer-1-foundation-substrate-v2`  
**Base44 app:** `6aaa835ffde8688971351551` (Esports Platform)  
**Pre-slice Base44 checkpoint:** `6ab2dce361b7be758874d0cd` (`28db45b3e4121571e9fa5eceef7a0aa3090d6eb7`)

## Slice 1A — Schema foundation

Status: **implemented in Base44, verified; no resolver/dispatcher/policy/data work yet.**

### Layer 0 amendments applied

- Membership: added optional `display_name`.
- Membership: no `gamer_tag` field.
- CaptainAssignment: added required canonical `creation_request_id`.
- CaptainAssignment: added Base44 profile recovery fields:
  - `last_operation_key` (required)
  - `last_operation_correlation_id` (required)
  - `last_operation_request_id` (nullable)
  - `last_operation_payload_hash` (nullable)

### Layer 1 entities created

- Team
- TeamSeason
- RosterAssignment
- OrganizationGameOffering

All direct client CRUD is denied by RLS.

### Verified architecture constraints

- Team lifecycle enum: `active | archived`.
- TeamSeason lifecycle enum: `planning | active | completed | withdrawn`.
- TeamSeason carries no `organization_id`.
- RosterAssignment lifecycle enum: `active | reserve | inactive | completed | removed`.
- RosterAssignment carries no `organization_id`, `is_current`, or `supersedes_id`.
- RosterAssignment `gamer_tag` is optional.
- OrganizationGameOffering lifecycle enum: `active | inactive`.
- All five Layer 1/Captain entities contain zero records at this checkpoint.

## Explicitly not yet implemented

- Team/Roster shared lifecycle/load helpers.
- Layer 1 CoachScope containment.
- Resolver Layer 1 changes.
- Dispatcher operation admission.
- Layer 1 operation handlers.
- Production policy activation.
- Reconciliation R4/R14/R15/R16/R17 activation.
- Frontend registry changes.
- Synthetic test fixtures.
- Real student data.

## Next gate

Proceed only to **Slice 1B — shared loaders + centralized CoachScope containment** after reviewing this schema checkpoint. No Layer 1 mutation operation is admitted in Slice 1B.


## Slice 1B — Shared loaders + centralized CoachScope containment

Status: **implemented in Base44, boundary-audited; no Layer 1 mutation authority admitted.**

**Accepted Base44 checkpoint:** `6ab2e061a8c658f80a2d361a` (`bd326968174bb7711f1a8efb59fc2a712d6181e6`)

### Shared module

Created:

- `base44/shared/team-roster-lifecycle.ts`

It provides centralized Layer 1 loading/normalization for:

- Team
- TeamSeason
- RosterAssignment
- OrganizationGameOffering
- TeamSeason → Team → Organization resolution
- RosterAssignment → TeamSeason → Team → Organization resolution
- same-Organization roster/Membership verification
- non-terminal roster lookup
- TeamSeason child roster lookup
- current TeamSeason captain lookup

### CoachScope containment

Added centralized containment support for:

- `OrganizationWide`
- `Team`
- `TeamSeason`

`Game` remains deferred and ineffective in Layer 1.

OrganizationGameOffering read containment is resolved server-side by loading the scoped Team/TeamSeason and comparing its persisted `game_id`; handlers do not manufacture game/scope context.

Duplicate-current scope for the same scope key fails closed.

The resolved authority result preserves the matching `coach_scope_assignment_uuid` so later AuditLog can record the actual authority path.

### Resolver seam

`base44/shared/resolver.ts` now accepts a server-computed `coachScopeMatch` result only for policy rules whose `scopeMatch` is `coach_scope`.

No production authority changed in Slice 1B:

- production policy contains **0** `coach_scope` rules;
- dispatcher contains **0** Layer 1 mutation operation keys;
- no Layer 1 handlers were added;
- no policy version was activated.

### Verification

Boundary audit confirmed:

- 14 schemas remain present;
- no Layer 1 mutation operation key is admitted to the dispatcher;
- production policy is unchanged and contains no `coach_scope` rule;
- Game scope remains deferred;
- resolver records matching CoachScopeAssignment authority identity;
- no synthetic or real Team/Roster records were created by Slice 1B.

The Base44 shell build command is unavailable in this sandbox because its shell workspace exposes no package manifest; this was not treated as a code/build failure. Verification used Base44 file/schema inspection and boundary auditing instead.

## Next gate

Proceed only to **Slice 1C — non-mutating verification coverage for loaders/containment/resolver seam**. Do not admit Layer 1 mutation operations or activate Layer 1 production policy yet.


## Slice 1C — Non-mutating verification coverage

Status: **verification harness implemented and statically boundary-audited; execution pending because the current Base44 connector does not expose backend-function invocation.**

**Pre-slice checkpoint:** `6ab2f58de983698c77d64845` (`bd326968174bb7711f1a8efb59fc2a712d6181e6`)  
**Staged verification checkpoint:** `6ab2f609c890907560d5fe8a` (`4f319f7decbf9ec9eaf5bfb1723cb52807b0b646`)

### Verification function

Created:

- `base44/functions/layer1_foundation_verification/entry.ts`

The function is intentionally read-only. It:

- reads six entity schemas via `.schema()`;
- tests pure CoachScope containment with in-memory synthetic values;
- tests the resolver `coach_scope` seam with in-memory synthetic policy/context;
- does not create, update, or delete any entity record;
- does not activate policy;
- does not invoke Layer 1 operations.

### Coverage

Schema assertions cover:

- Membership `display_name`;
- absence of Membership `gamer_tag`;
- CaptainAssignment `creation_request_id`;
- CaptainAssignment recovery-field required/nullability rules;
- Team lifecycle and creation request field;
- TeamSeason lifecycle, no `organization_id`, creation request field;
- RosterAssignment lifecycle, no `organization_id`, no `is_current`, no `supersedes_id`, optional `gamer_tag`, recovery-field required/nullability rules;
- OrganizationGameOffering lifecycle and creation request field.

Pure containment assertions cover:

- OrganizationWide → Team/TeamSeason/Roster/Offering;
- Team self and descendants;
- Team mismatch denial;
- TeamSeason self/roster and parent denial;
- wrong TeamSeason denial;
- Game-scope deferred denial;
- Offering matching/non-matching game behavior;
- duplicate-current scope detection and fail-closed behavior;
- preservation of matching `coach_scope_assignment_uuid`.

Resolver seam assertions cover:

- `coach_scope` match allows when server-computed match is present;
- missing/false scope match denies;
- matching scope identity is preserved in the authority source;
- existing `same_organization` behavior remains unchanged;
- cross-Organization denial remains effective even when a positive scope match is supplied.

### Static non-mutation audit

Verified directly from the function source:

- no entity `.create()` calls;
- no entity `.update()` / `.updateMany()` calls;
- no entity `.delete()` calls;
- no bulk create path;
- only schema reads plus pure in-memory tests.

Runtime state after staging remains:

- Team: 0 records
- TeamSeason: 0 records
- RosterAssignment: 0 records
- OrganizationGameOffering: 0 records
- CaptainAssignment: 0 records

Boundary remains closed:

- dispatcher contains 0 Layer 1 mutation operation keys;
- production policy contains 0 `coach_scope` rules.

### Execution limitation

The current Base44 connector available in this chat supports creating/reading sandbox functions but does not expose a backend-function invocation action. Therefore this status does **not** claim the verification function has executed.

Slice 1C may be considered **implementation-complete but execution-gated** until `layer1_foundation_verification` is invoked through a supported Base44 execution surface and returns `allPassed: true`.

Do not admit Layer 1 mutation operations before that execution gate is satisfied.


## Slice 1C — Execution result

Status: **PASSED — 25/25 read-only assertions successful.**

**Verification function:** `layer1_foundation_verification_v2`  
**Post-pass Base44 checkpoint:** `6ab305fae52900e318c4608e` (`31c51a37e4d854baae2e5efbdc3147b7a1e24862`)

Execution result:

- `verifier = layer1_foundation_verification_v2`
- `readOnly = true`
- `total = 25`
- `passed = 25`
- `failed = 0`
- `allPassed = true`
- `failures = []`

Verified behaviors include:

- OrganizationWide containment for Team/TeamSeason/Roster/Offering;
- Team self/descendant containment and mismatch denial;
- TeamSeason self/roster containment and parent/wrong-season denial;
- Game-scope deferred denial;
- Offering match/non-match by game identity;
- duplicate-current CoachScope detection and fail-closed behavior;
- preservation of matching `coach_scope_assignment_uuid`;
- resolver `coach_scope` allow on positive server-computed match;
- resolver deny on missing/false match;
- existing `same_organization` behavior unchanged;
- cross-Organization denial remains effective despite positive scope input.

No runtime entity records were created, updated, or deleted by the verifier.

### Slice 1C verdict

`LAYER 1 SLICE 1C — PASSED`

The foundation verification gate is closed. The project may proceed to the first controlled Layer 1 mutation slice. Mutation admission must remain incremental and must not activate unrelated Layer 1 operations.


## First mutation slice — Team operations (pre-activation)

Status: **staged; candidate policy not yet active.**

**Pre-activation Base44 checkpoint:** `6ab3083b0ccd6cab9bca4f41` (`d783bb64afd7ed91fd52b6404b428e63fae3cd98`)

### Operations staged

Only these Layer 1 mutation operations are admitted to the dispatcher:

- `team.create`
- `team.update`
- `team.archive`

No TeamSeason, RosterAssignment, OrganizationGameOffering, or CaptainAssignment mutation key is admitted.

### Team operation semantics

`team.create`:
- OrgAdmin only;
- creates Team at `active`;
- durable `creation_request_id`;
- same request id + same material input returns prior Team;
- same request id + different material input conflicts;
- same-Organization serialization uses the existing Organization CAS guard;
- post-create bounded stable-read confirmation;
- Organization-scoped audit.

`team.update`:
- OrgAdmin only;
- active Team only;
- updates `team_display_name` in place;
- same requested display name = target-state idempotent no-op;
- version CAS + bounded stable-read confirmation;
- Organization-scoped audit.

`team.archive`:
- OrgAdmin only;
- terminal `active → archived`;
- denies while any child TeamSeason is `planning` or `active`;
- already archived = target-state idempotent no-op;
- version CAS + bounded stable-read confirmation;
- Organization-scoped audit.

### Candidate production policy

Staged candidate:

- policy key: `esports_v1`
- version label: `1a-team-ratified`
- adds exactly three OrganizationAdministrator Team mutation grants:
  - Team/create
  - Team/update
  - Team/archive
- no CoachScope mutation grant;
- no TeamSeason/Roster/Offering/Captain mutation grant.

The historical `0b.3-ratified` rules remain frozen in the version registry.

At this checkpoint the active persisted policy remains:

- `0b.3-ratified`
- hash `6fb07410c24825e2d092a5132ff3257216f4a9d82db87e7031cb765628177105`

Therefore the new Team operations are currently dispatcher-reachable but authorization-fail-closed until the candidate policy is explicitly activated.

### Verification functions staged

`layer1_team_policy_preflight`
- read-only;
- computes candidate policy hash;
- verifies registry/candidate rules match;
- verifies exactly the three intended Team grants;
- verifies no other Layer 1 mutation grant;
- verifies active policy is still `0b.3-ratified`.

`layer1_team_mutation_verification`
- post-activation synthetic-only acceptance harness;
- creates a synthetic Organization/Membership/OrgAdmin authority context;
- invokes the real `execute_operation` path;
- tests create, request replay, request-id conflict, authorization denial, update, target-state idempotency, archive, archive replay, archived-update denial, and audit presence;
- no TeamSeason/Roster/Offering/Captain writes;
- no policy mutation;
- cleans its own synthetic fixtures.

### Pre-activation boundary audit

Verified:

- dispatcher Layer 1 keys = exactly `team.create`, `team.update`, `team.archive`;
- candidate production version = `1a-team-ratified`;
- candidate Team mutation rule count = 3;
- policy registry contains `1a-team-ratified`;
- active persisted policy remains `0b.3-ratified`;
- policy preflight contains no entity mutation calls;
- mutation verifier does not modify AuthorizationPolicyVersion;
- mutation verifier contains no TeamSeason/Roster/Offering/Captain writes.

## Next gate

1. Execute read-only `layer1_team_policy_preflight`.
2. Require `allPassed: true`.
3. Only then invoke existing `policy.activate` through the production `execute_operation` path to activate `1a-team-ratified`.
4. Verify exactly one active policy and correct candidate hash/version.
5. Run `layer1_team_mutation_verification`.
6. Do not proceed to OrganizationGameOffering until the Team mutation slice passes.


## Team policy preflight — PASSED

**Base44 checkpoint:** `6ab30946ca33453a472fa677` (`24f8dfefc8038369f4a31f2cc110662f8d157a70`)

Read-only `layer1_team_policy_preflight` result:

- candidate version: `1a-team-ratified`
- candidate hash: `d2daa3a72e60827627b70b9eaadfe8b0b2edcb639f97111da8a67622acba61bf`
- active version before activation: `0b.3-ratified`
- candidate hash matches registry: true
- candidate rules match registry: true
- exactly three Team mutation rules: true
- Team actions exact: create/update/archive
- Team rules OrgAdmin-only: true
- no other Layer 1 mutation rules: true
- allPassed: true
- failures: []

Policy activation is now authorized for the candidate `1a-team-ratified` through the existing production `policy.activate` path only.


## Team mutation policy activation — PASSED

**Activation correlation:** `51716602-dedc-4f66-9b41-03eba0cdc7d7`  
**Activated version:** `1a-team-ratified`  
**Activated hash:** `d2daa3a72e60827627b70b9eaadfe8b0b2edcb639f97111da8a67622acba61bf`  
**New policy UUID:** `4e48c67c-d014-406c-860a-487b803e33d0`  
**Superseded policy UUID:** `5fbb73b6-8649-4db8-8e87-04bc5e1a4b49`

**Post-activation Base44 checkpoint:** `6ab309d36e81263ff9ee6d64` (`24f8dfefc8038369f4a31f2cc110662f8d157a70`)

Verified directly after activation:

- exactly one active AuthorizationPolicyVersion;
- active version = `1a-team-ratified`;
- active hash = `d2daa3a72e60827627b70b9eaadfe8b0b2edcb639f97111da8a67622acba61bf`;
- Team = 0 records;
- TeamSeason = 0 records;
- RosterAssignment = 0 records;
- OrganizationGameOffering = 0 records;
- CaptainAssignment = 0 records.

The Team mutation acceptance harness may now run. Do not admit any additional Layer 1 mutation family until it passes.


## First mutation slice — Team operations — PASSED

Status: **accepted — 12/12 synthetic-only assertions green.**

**Post-pass Base44 checkpoint:** `6ab30aaf5500cdec7b35b963` (`24f8dfefc8038369f4a31f2cc110662f8d157a70`)

Active policy:

- `1a-team-ratified`
- hash `d2daa3a72e60827627b70b9eaadfe8b0b2edcb639f97111da8a67622acba61bf`

Acceptance verifier:

- `layer1_team_mutation_verification`
- `syntheticOnly = true`
- `total = 12`
- `passed = 12`
- `failed = 0`
- `allPassed = true`
- `failures = []`

Verified behavior:

- `team.create` succeeds for authorized OrgAdmin;
- same `creation_request_id` + same material input replays to the same Team;
- same request id + different material input conflicts;
- cross-Organization create is denied;
- `team.update` succeeds only for active Team;
- update target-state replay performs no additional domain version mutation;
- `team.archive` succeeds with no open TeamSeason;
- archive target-state replay performs no additional domain version mutation;
- archived Team cannot be updated;
- success audit events are present for create/update/archive.

Post-verifier cleanup independently confirmed:

- Team = 0
- TeamSeason = 0
- RosterAssignment = 0
- OrganizationGameOffering = 0
- CaptainAssignment = 0

### Slice verdict

`FIRST LAYER 1 MUTATION SLICE — TEAM — PASSED`

The Team family is accepted. Proceed next to a separate OrganizationGameOffering mutation slice; do not combine it with TeamSeason/Roster/Captain cascades.


## OrganizationGameOffering mutation slice — pre-activation staged

Status: **staged; candidate policy not yet active.**

**Pre-activation Base44 checkpoint:** `6ab30eaf164386b96bb884ab` (`dde2b26649572b9affa04d987052331678292b83`)

### Operations staged

New dispatcher keys:

- `offering.create`
- `offering.transition`

Existing accepted Team keys remain:

- `team.create`
- `team.update`
- `team.archive`

No TeamSeason, RosterAssignment, or CaptainAssignment mutation key is admitted.

### Offering semantics

`offering.create`:
- OrgAdmin only;
- creates at `active`;
- durable `creation_request_id`;
- same request id + same material input replays prior logical result;
- same request id + different material input conflicts;
- canonical uniqueness is one row per `(organization_id, game_id)` regardless of status;
- application-enforced pre-create uniqueness + Organization CAS fence;
- post-create stable confirmation must still resolve to exactly one key row;
- duplicate/ambiguous state fails closed and is not auto-repaired;
- Organization-scoped audit required.

`offering.transition`:
- OrgAdmin only;
- `active ⇄ inactive`;
- exact target-state replay is success with no second domain mutation;
- canonical key ambiguity fails closed;
- version CAS + bounded stable-read confirmation;
- Organization-scoped audit required.

### Reconciliation

R15 is implemented and wired into the regular reconciliation run:

- detects more than one OrganizationGameOffering per `(organization_id, game_id)`;
- detection-only;
- writes StandardOperational operator-review finding;
- no automatic repair.

R10 now monitors R15 heartbeat.

R9 domain collection now includes:

- Team
- OrganizationGameOffering

This closes the previously missing Layer 1 entity coverage in the current R9 implementation, without redefining the broader existing limitation that in-place mutations retain their original row correlation id.

### Candidate policy

Staged candidate:

- key: `esports_v1`
- version: `1b-offering-ratified`
- retains the accepted `1a-team-ratified` Team grants;
- adds exactly:
  - OrganizationGameOffering/create
  - OrganizationGameOffering/transition
- OrganizationAdministrator only;
- same-Organization scope;
- no TeamSeason/Roster/Captain mutation grants.

Historical `1a-team-ratified` remains frozen in the registry.

Current persisted active policy remains `1a-team-ratified`.

### Verification staged

`layer1_offering_policy_preflight`
- read-only;
- canonical candidate/registry hash + rule equality;
- exactly two Offering mutation grants;
- accepted Team grants retained;
- no TeamSeason/Roster/Captain mutation grants;
- confirms active policy still `1a-team-ratified`.

`layer1_offering_mutation_verification`
- synthetic-only;
- invokes real production `execute_operation` path;
- tests create, durable replay, request-id conflict, unique-key conflict, cross-org denial;
- tests inactive transition, target-state idempotency, active transition;
- verifies success audits;
- directly injects one synthetic duplicate to prove dependent key lookup fails closed;
- invokes R15 and verifies operator-review finding;
- cleans its own synthetic fixtures/findings/heartbeats.

### Pre-activation boundary audit

Verified:

- current active persisted policy = `1a-team-ratified`;
- dispatcher Layer 1 keys = Team family + Offering family only;
- candidate = `1b-offering-ratified`;
- Offering candidate rule count = 2;
- policy registry contains `1b-offering-ratified`;
- read-only preflight contains no entity mutation calls;
- mutation verifier does not mutate AuthorizationPolicyVersion;
- mutation verifier contains no TeamSeason/Roster/Captain writes;
- R15 is wired to reconciliation;
- R9 includes Team + Offering;
- R10 monitors R15;
- all Team/Offering/TeamSeason/Roster/Captain entity counts remain 0 before verification.

The Base44 shell workspace still does not expose `/workspace/package.json`, so `npm run typecheck` is unavailable there and was not treated as a code failure.

## Next gate

1. Run read-only `layer1_offering_policy_preflight`.
2. Require `allPassed: true`.
3. Only then activate `1b-offering-ratified` through production `policy.activate`.
4. Verify one active policy and expected hash/version.
5. Run `layer1_offering_mutation_verification`.
6. Do not begin TeamSeason/Roster/Captain mutations until this slice passes.


## Offering policy preflight — PASSED

**Base44 checkpoint:** `6ab31a02b20cb5ea6379e7a1` (`dde2b26649572b9affa04d987052331678292b83`)

Read-only `layer1_offering_policy_preflight` result:

- candidate version: `1b-offering-ratified`
- candidate hash: `78626cd58f032ca9a25b0437e87bf9165ca69bef9ce6230f47e77c12c6f33b9f`
- active version before activation: `1a-team-ratified`
- candidate hash matches registry: true
- candidate rules match registry: true
- exactly two Offering mutation rules: true
- Offering actions exact: create/transition
- Offering rules OrgAdmin-only: true
- accepted Team rules retained: true
- no TeamSeason/Roster/Captain mutation rules: true
- allPassed: true
- failures: []

Policy activation is now authorized for candidate `1b-offering-ratified` through the existing production `policy.activate` path only.


## Offering mutation policy activation — PASSED

**Activation correlation:** `policy-activate-1b-offering-ratified-2026-09-23T1915CST`  
**Activated version:** `1b-offering-ratified`  
**Activated hash:** `78626cd58f032ca9a25b0437e87bf9165ca69bef9ce6230f47e77c12c6f33b9f`  
**New policy UUID:** `7ef16e2b-9805-433a-b0d4-f155b13e09ac`  
**Superseded policy UUID:** `4e48c67c-d014-406c-860a-487b803e33d0`

**Post-activation Base44 checkpoint:** `6ab31c327fc6c86c8d5e899a` (`dde2b26649572b9affa04d987052331678292b83`)

Verified directly after activation:

- exactly one active AuthorizationPolicyVersion;
- active version = `1b-offering-ratified`;
- active hash = `78626cd58f032ca9a25b0437e87bf9165ca69bef9ce6230f47e77c12c6f33b9f`;
- Team = 0 records;
- TeamSeason = 0 records;
- RosterAssignment = 0 records;
- OrganizationGameOffering = 0 records;
- CaptainAssignment = 0 records.

The Offering mutation acceptance harness may now run. Do not admit TeamSeason/Roster/Captain mutation families until it passes.


## OrganizationGameOffering mutation slice — PASSED

Status: **accepted — 14/14 synthetic-only assertions green.**

**Post-pass Base44 checkpoint:** `6ab320b00bc75bff4a586947` (`dde2b26649572b9affa04d987052331678292b83`)

Active policy:

- `1b-offering-ratified`
- hash `78626cd58f032ca9a25b0437e87bf9165ca69bef9ce6230f47e77c12c6f33b9f`

Acceptance verifier:

- `layer1_offering_mutation_verification`
- `syntheticOnly = true`
- `total = 14`
- `passed = 14`
- `failed = 0`
- `allPassed = true`
- `failures = []`

Verified behavior includes:

- `offering.create` succeeds for authorized OrgAdmin;
- same `creation_request_id` + same material input replays prior Offering;
- same request id + different material input conflicts;
- second Offering for the same `(organization_id, game_id)` conflicts regardless of status;
- cross-Organization create is denied;
- `offering.transition` supports `active ⇄ inactive`;
- exact target-state replay is idempotent with no second domain version mutation;
- success audit events are present;
- duplicate-key dependent lookup fails closed;
- R15 detects synthetic duplicate Offering state;
- R15 writes an open operator-review finding and performs no automatic repair.

Post-verifier cleanup independently confirmed:

- Team = 0
- TeamSeason = 0
- RosterAssignment = 0
- OrganizationGameOffering = 0
- CaptainAssignment = 0
- open R15 findings = 0

R15 heartbeat history remains present because the normal scheduled reconciliation sweep is now running; these are expected operational records, not leaked test fixtures.

### Slice verdict

`ORGANIZATION GAME OFFERING MUTATION SLICE — PASSED`

The Offering family and R15 posture are accepted. The next mutation work should move to TeamSeason as its own slice before Roster/Captain cascades are admitted.


## TeamSeason mutation slice — pre-activation staged

Status: **staged; candidate policy not yet active.**

**Pre-activation Base44 checkpoint:** `6ab3226aff3e9bb3bf73769f` (`157c0aed8d0e33cb2665af370d18d21aeaded162`)

### Operations staged

New dispatcher keys:

- `team_season.create`
- `team_season.transition`

Existing accepted Team + Offering keys remain.

No RosterAssignment or CaptainAssignment mutation key is admitted.

### TeamSeason lifecycle admitted in this slice

`team_season.create`:
- OrgAdmin only;
- parent Team must be active;
- creates TeamSeason at `planning`;
- durable `creation_request_id`;
- same request id + same material input replays prior logical result;
- same request id + different material input conflicts;
- Organization-scoped audit required.

`team_season.transition`:
- `planning → active`: OrgAdmin or Coach(scope);
- `planning → withdrawn`: OrgAdmin only;
- `active → withdrawn`: OrgAdmin only;
- `withdrawn` and `completed` are terminal;
- exact target-state replay is idempotent;
- version CAS + stable-read confirmation;
- Coach authority path preserves matching `coach_scope_assignment_uuid`;
- Organization-scoped audit required.

### Completion boundary

Canonical `active → completed` is **not admitted in this slice**.

The handler fails closed for target `completed` because canonical completion owns the RosterAssignment completion + CaptainAssignment closure cascade. Those mutation paths are not yet admitted, so allowing TeamSeason status to become `completed` would violate Amendment 003.

R16 is therefore intentionally **not active yet**. It becomes mandatory when TeamSeason completion itself is admitted.

### Policy candidate

Staged candidate:

- key: `esports_v1`
- version: `1c-teamseason-ratified`
- retains accepted Team + Offering grants;
- adds exactly:
  - OrgAdmin TeamSeason/create — same organization
  - OrgAdmin TeamSeason/transition — same organization
  - Coach TeamSeason/transition — `coach_scope`
- no Roster/Captain mutation grants.

Historical `1b-offering-ratified` remains frozen in the registry.

Current persisted active policy remains `1b-offering-ratified`.

### Reconciliation

R9 domain collection now includes TeamSeason in addition to Team and OrganizationGameOffering.

R16 remains deferred until completion/cascade admission.

### Verification staged

`layer1_teamseason_policy_preflight`
- read-only;
- canonical candidate/registry hash + rule equality;
- exactly three TeamSeason rules;
- exact OrgAdmin create/transition and Coach scoped transition rules;
- no Roster/Captain mutation grants;
- confirms active policy still `1b-offering-ratified`.

`layer1_teamseason_mutation_verification`
- synthetic-only;
- tests OrgAdmin creation, durable replay, request-id conflict;
- denies creation under archived Team;
- tests OrgAdmin planning→withdrawn;
- tests target-state idempotency and terminal behavior;
- uses a separate Coach-only Organization to prove Team-scoped planning→active;
- proves wrong Team scope denies;
- proves Coach withdrawal denies;
- proves completion fails closed pending cascade;
- verifies CoachScope audit provenance and create/transition audit events;
- contains no Roster/Captain writes;
- cleans its own fixtures.

### Pre-activation boundary audit

Verified:

- current active policy = `1b-offering-ratified`;
- dispatcher Layer 1 keys = accepted Team + Offering + TeamSeason only;
- candidate = `1c-teamseason-ratified`;
- TeamSeason candidate rule count = 3;
- policy registry contains `1c-teamseason-ratified`;
- read-only preflight contains no entity mutations;
- acceptance verifier contains no Roster/Captain writes;
- acceptance verifier does not mutate AuthorizationPolicyVersion;
- R9 includes TeamSeason;
- R16 is not active;
- Team/TeamSeason/Roster/Offering/Captain counts remain 0.

## Next gate

1. Run read-only `layer1_teamseason_policy_preflight`.
2. Require `allPassed: true`.
3. Only then activate `1c-teamseason-ratified` through production `policy.activate`.
4. Verify exactly one active policy and expected hash/version.
5. Run `layer1_teamseason_mutation_verification`.
6. Do not admit TeamSeason completion, Roster, Captain, or R16 until a later cascade slice.


## TeamSeason policy preflight — PASSED

**Base44 checkpoint:** `6ab3241600dbebbd1304f6de` (`157c0aed8d0e33cb2665af370d18d21aeaded162`)

Read-only `layer1_teamseason_policy_preflight` result:

- candidate version: `1c-teamseason-ratified`
- candidate hash: `f4feb56d0c838c12f60ccec6fe4f1698dcb531234c86cc800e64ea44cf4f1882`
- active version before activation: `1b-offering-ratified`
- candidate hash matches registry: true
- candidate rules match registry: true
- exactly three TeamSeason rules: true
- OrgAdmin create exact: true
- OrgAdmin transition exact: true
- Coach transition is `coach_scope` exact: true
- no Roster/Captain mutation rules: true
- allPassed: true
- failures: []

Policy activation is now authorized for candidate `1c-teamseason-ratified` through the existing production `policy.activate` path only.


## TeamSeason mutation policy activation — PASSED

**Activation correlation:** `policy-activate-1790125165646-1c-teamseason-ratified`  
**Activated version:** `1c-teamseason-ratified`  
**Activated hash:** `f4feb56d0c838c12f60ccec6fe4f1698dcb531234c86cc800e64ea44cf4f1882`  
**New policy UUID:** `c63bc844-fb27-49ae-abd6-a7330f5ff449`  
**Superseded policy UUID:** `bf2071fd-ec85-49a5-a8c8-0ddb0f513e99`

**Post-activation Base44 checkpoint:** `6ab324980a9ad5f5e8395aaf` (`157c0aed8d0e33cb2665af370d18d21aeaded162`)

Verified directly after activation:

- exactly one active AuthorizationPolicyVersion;
- active version = `1c-teamseason-ratified`;
- active hash = `f4feb56d0c838c12f60ccec6fe4f1698dcb531234c86cc800e64ea44cf4f1882`;
- Team = 0;
- TeamSeason = 0;
- RosterAssignment = 0;
- OrganizationGameOffering = 0;
- CaptainAssignment = 0.

Historical duplicate superseded rows with the same version label do not create an authorization ambiguity because the production loader requires exactly one active policy and one active row is present.

The TeamSeason acceptance harness may now run. Completion remains intentionally fail-closed pending the later Roster/Captain cascade slice.


## TeamSeason standalone lifecycle slice — PASSED

Status: **accepted — 14/14 synthetic-only assertions green.**

**Post-pass Base44 checkpoint:** `6ab32577d41dc82f5d106786` (`157c0aed8d0e33cb2665af370d18d21aeaded162`)

Active policy:

- `1c-teamseason-ratified`
- hash `f4feb56d0c838c12f60ccec6fe4f1698dcb531234c86cc800e64ea44cf4f1882`

Acceptance verifier:

- `layer1_teamseason_mutation_verification`
- `syntheticOnly = true`
- `total = 14`
- `passed = 14`
- `failed = 0`
- `allPassed = true`
- `failures = []`

Verified behavior:

- TeamSeason create at `planning`;
- durable create replay;
- conflicting request-id reuse denied as conflict;
- create denied under archived Team;
- OrgAdmin `planning → withdrawn`;
- withdrawn target-state replay is idempotent with no second version mutation;
- withdrawn is terminal;
- Coach(scope) `planning → active`;
- Coach wrong-scope denial;
- Coach withdrawal denial;
- `active → completed` explicitly fails closed while completion cascade is not admitted;
- CoachScope authority identity is preserved in audit;
- successful create and transition audits are present.

Post-verifier cleanup independently confirmed:

- Team = 0
- TeamSeason = 0
- RosterAssignment = 0
- OrganizationGameOffering = 0
- CaptainAssignment = 0

### Slice verdict

`TEAMSEASON STANDALONE LIFECYCLE SLICE — PASSED`

The next work should be a separate completion-cascade slice that admits `active → completed` only together with RosterAssignment completion, CaptainAssignment closure, and R16 reconciliation.


## TeamSeason completion cascade slice — staged preflight

Status: **staged; no new policy activation required.**

**Base44 checkpoint:** `6ab32867829777c26beaa07e` (`842fd46ad34556d2cf87386fac29d193ab81749c`)

### Completion workflow

`team_season.transition` now admits canonical `active → completed` using one owned workflow:

1. close current CaptainAssignments for the TeamSeason;
2. complete every child RosterAssignment still `active|reserve|inactive`;
3. require stable confirmation that no current captain and no nonterminal roster remains;
4. only then CAS TeamSeason to `completed`.

Ordering is deliberately toward less authority/visibility. Partial failure cannot make a TeamSeason completed before its children are closed/completed.

Exact replay against an already-completed TeamSeason re-runs only the invariant confirmation/repair seam and performs no second mutation when the invariant is already satisfied.

### Shared cascade helper

Created:

- `base44/shared/teamseason-completion.ts`

The helper is idempotent/resumable and shared by the live operation and R16.

Cascade mutations update Base44 recovery metadata on affected RosterAssignment/CaptainAssignment rows using the owning operation/correlation.

### R16

Created:

- `base44/shared/reconciliation/sweeps-layer1.ts`

R16:

- scans TeamSeason rows with `status=completed`;
- uses a 60-second operational settling window measured from `TeamSeason.updated_at`;
- detects leftover `active|reserve|inactive` child rosters;
- deterministically invokes the same shared completion helper;
- writes Organization-scoped service audit for repair;
- writes finding/heartbeat;
- returns operator review only if deterministic repair fails.

R16 is wired into the normal reconciliation run and R10 monitors its heartbeat.

R9 domain collection now also includes RosterAssignment and CaptainAssignment.

### Policy boundary

No new policy version is needed.

The active policy remains:

- `1c-teamseason-ratified`
- hash `f4feb56d0c838c12f60ccec6fe4f1698dcb531234c86cc800e64ea44cf4f1882`

The already-ratified TeamSeason transition rules authorize OrgAdmin and Coach(scope) forward completion. No new operation key or authority category is introduced.

### Verification staged

`layer1_teamseason_completion_preflight`
- read-only;
- confirms active policy is still `1c-teamseason-ratified`;
- confirms OrgAdmin TeamSeason transition authority;
- confirms Coach scoped TeamSeason transition authority.

`layer1_teamseason_completion_verification`
- synthetic-only;
- tests OrgAdmin `active → completed`;
- verifies active/reserve/inactive child rosters become completed;
- verifies pre-existing completed and removed rosters remain unchanged;
- verifies current captain closes;
- verifies completion replay is target-state idempotent with no second domain version mutation;
- verifies completion audit;
- verifies Coach(scope) completion + scope audit provenance;
- injects stale completed TeamSeason with nonterminal roster/current captain;
- runs R16 and verifies deterministic repair, finding, and Organization-scoped repair audit;
- cleans its own synthetic fixtures.

### Staged boundary audit

Verified:

- active policy remains `1c-teamseason-ratified`;
- completion helper is attached to `team_season.transition`;
- captain close occurs before roster completion;
- stable confirmation requires zero current captains + zero nonterminal rosters;
- R16 is wired;
- R16 settling window is measured from `TeamSeason.updated_at`;
- R16 uses the shared completion helper;
- R16 audit resolves the Organization chain;
- R10 monitors R16;
- R9 includes RosterAssignment + CaptainAssignment;
- preflight is read-only;
- verifier does not mutate policy;
- Team/TeamSeason/Roster/Offering/Captain counts remain 0.

## Next gate

Run read-only `layer1_teamseason_completion_preflight`. No policy activation follows this gate. If it passes, run `layer1_teamseason_completion_verification`.


## TeamSeason completion cascade preflight — PASSED

**Base44 checkpoint:** `6ab32c35c9357a0c2df47f39` (`842fd46ad34556d2cf87386fac29d193ab81749c`)

Read-only `layer1_teamseason_completion_preflight` result:

- active version: `1c-teamseason-ratified`
- active hash: `f4feb56d0c838c12f60ccec6fe4f1698dcb531234c86cc800e64ea44cf4f1882`
- activePolicy1c: true
- teamSeasonTransitionAuthorized: true
- coachScopedCompletionAuthorityPresent: true
- allPassed: true
- failures: []

No new policy activation is required. The synthetic completion-cascade verifier may now run directly.


## TeamSeason completion cascade slice — PASSED

Status: **accepted — 15/15 synthetic-only assertions green.**

**Post-pass Base44 checkpoint:** `6ab3e2a8b5c3b02cac86eec5` (`90dcf0babe58102e211469e92f0663870e8d15fa`)

Active policy remains unchanged:

- `1c-teamseason-ratified`
- hash `f4feb56d0c838c12f60ccec6fe4f1698dcb531234c86cc800e64ea44cf4f1882`

Acceptance verifier:

- `layer1_teamseason_completion_verification`
- `syntheticOnly = true`
- `total = 15`
- `passed = 15`
- `failed = 0`
- `allPassed = true`
- `failures = []`

Verified behavior:

- OrgAdmin `active → completed` succeeds;
- TeamSeason persists at `completed`;
- child RosterAssignments in `active|reserve|inactive` transition to `completed`;
- already-`completed` RosterAssignment remains unchanged;
- `removed` RosterAssignment remains unchanged;
- current CaptainAssignment closes;
- completion target-state replay is idempotent and does not produce second domain version mutations;
- completion success audit is present;
- Coach(scope) `active → completed` succeeds;
- CoachScope authority identity is preserved in the completion audit;
- R16 detects a stale completed TeamSeason with nonterminal roster/current captain;
- R16 deterministically completes the leftover roster;
- R16 deterministically closes the leftover captain;
- R16 writes its finding;
- R16 repair audit remains Organization-scoped.

Accepted completion ordering:

1. close current CaptainAssignments;
2. complete nonterminal RosterAssignments;
3. require stable zero-current-captain / zero-nonterminal-roster confirmation;
4. only then persist TeamSeason `completed`.

This ordering fails toward less authority/visibility and allows resumable repair after partial execution.

Post-verifier cleanup independently confirmed:

- Team = 0
- TeamSeason = 0
- RosterAssignment = 0
- OrganizationGameOffering = 0
- CaptainAssignment = 0
- open R16 findings = 0

### Slice verdict

`TEAMSEASON COMPLETION CASCADE SLICE — PASSED`

The TeamSeason lifecycle is now complete through terminal completion, including deterministic child repair posture. The next clean Layer 1 mutation family is RosterAssignment lifecycle (`roster.assign`, `roster.transition`, `roster.complete`, `roster.remove`) before `roster.move` and CaptainAssignment replacement are admitted.


## RosterAssignment lifecycle slice — pre-activation staged

Status: **staged; candidate policy not yet active.**

**Pre-activation Base44 checkpoint:** `6ab3e4ec60134aa009873ab8` (`5b8b16c02e036ed28d7d6544c7759d8d4576c0b9`)

### Operations staged

New dispatcher keys:

- `roster.assign`
- `roster.transition`
- `roster.complete`
- `roster.remove`

Deferred and still absent:

- `roster.move`
- `captain.assign`
- `captain.close`

### RosterAssignment semantics staged

`roster.assign`:
- OrgAdmin or Coach(scope);
- active Membership required;
- destination TeamSeason must be `planning|active`;
- Membership and TeamSeason must resolve to the same Organization;
- Player RoleAssignment is not required;
- initial status defaults to `active`, may be `reserve`, and may not be `inactive`;
- at most one nonterminal assignment per `(membership_id, team_season_id)`;
- durable Class-A `creation_request_id`;
- same request + same material input replays the prior row;
- same request + different material input conflicts;
- recovery metadata is populated;
- Organization-scoped audit required.

`roster.transition`:
- OrgAdmin or Coach(scope);
- same record transitions among `active|reserve|inactive`;
- exact target-state replay succeeds without a second version mutation;
- terminal rows cannot re-enter tenure;
- `inactive` does not close CaptainAssignment;
- Class-B recovery metadata updated.

`roster.complete` / `roster.remove`:
- OrgAdmin or Coach(scope);
- valid from any nonterminal roster state;
- exact same terminal target replays idempotently;
- incompatible terminal target conflicts;
- affected current CaptainAssignment is closed before the roster becomes terminal;
- terminal change uses version guard + stable confirmation;
- Class-B recovery metadata updated;
- Organization-scoped audit required.

Shared terminal helper:

- `base44/shared/roster-terminal.ts`
- closes matching current captain(s) for Membership + TeamSeason;
- bounded stable read requires zero matching current captain rows before terminal roster mutation proceeds;
- ordering fails toward less authority.

### Policy candidate

Staged candidate:

- key: `esports_v1`
- version: `1d-roster-ratified`

It retains the accepted Team, Offering, and TeamSeason grants and adds exactly eight RosterAssignment lifecycle rules:

- OrgAdmin: assign / transition / complete / remove — same Organization
- Coach: assign / transition / complete / remove — `coach_scope`

No `roster.move` rule and no CaptainAssignment mutation rule is added.

Historical `1c-teamseason-ratified` remains frozen in the registry.

Current persisted active policy remains `1c-teamseason-ratified`.

### Reconciliation posture

No new sweep is added in this slice.

- R9 already includes RosterAssignment and CaptainAssignment domain rows.
- R14 remains deferred because `roster.move` is not admitted.
- Captain replacement reconciliation remains deferred with CaptainAssignment mutation admission.

### Verification staged

`layer1_roster_policy_preflight`
- read-only;
- validates candidate hash/rules against registry;
- requires exactly eight RosterAssignment lifecycle rules;
- requires exact actions assign/transition/complete/remove;
- requires four OrgAdmin same-org rules;
- requires four Coach `coach_scope` rules;
- requires no `roster.move` grant;
- requires no CaptainAssignment mutation grant;
- confirms active policy still `1c-teamseason-ratified`.

`layer1_roster_mutation_verification`
- synthetic-only;
- tests Class-A assign + replay + request-reuse conflict;
- tests nonterminal duplicate conflict;
- tests invalid initial inactive;
- tests inactive Membership denial;
- tests completed TeamSeason denial;
- tests active→reserve and target-state replay;
- verifies inactive roster leaves captain current;
- verifies complete closes captain;
- verifies complete replay is idempotent;
- verifies incompatible terminal target conflicts;
- verifies remove closes captain;
- uses a separate Coach-only Organization to prove scoped assign/transition/complete;
- proves wrong Coach scope denial;
- verifies CoachScope audit provenance;
- verifies assign success audit;
- cleans its own fixtures.

### Pre-activation boundary audit

Verified:

- current active policy = `1c-teamseason-ratified`;
- candidate = `1d-roster-ratified`;
- candidate registry entry exists;
- production roster policy rule count = 8;
- dispatcher exposes accepted Team + Offering + TeamSeason + four roster lifecycle keys only;
- `roster.move` dispatcher key absent;
- Captain mutation dispatcher keys absent;
- assign requires active Membership and planning/active TeamSeason;
- assign does not require Player role;
- assign enforces nonterminal uniqueness;
- Coach assign containment resolves through destination TeamSeason;
- terminal roster path closes captain before roster mutation;
- inactive is nonterminal and does not use terminal helper;
- preflight is read-only;
- mutation verifier does not mutate policy;
- Team/TeamSeason/RosterAssignment/OrganizationGameOffering/CaptainAssignment counts remain 0.

## Next gate

1. Run read-only `layer1_roster_policy_preflight`.
2. Require `allPassed: true`.
3. Only then activate `1d-roster-ratified` through production `policy.activate`.
4. Verify exactly one active policy and expected hash/version.
5. Run `layer1_roster_mutation_verification`.
6. Keep `roster.move` and CaptainAssignment replacement/close as separate later slices.


## RosterAssignment policy preflight — PASSED

**Base44 checkpoint:** `6ab3eb70b935172208258ada` (`5b8b16c02e036ed28d7d6544c7759d8d4576c0b9`)

Read-only `layer1_roster_policy_preflight` result:

- candidate version: `1d-roster-ratified`
- candidate hash: `fc9748423f821489e7e4246ea15e8d4d985778e57dac87dc9c9a8e07db42b2ce`
- active version before activation: `1c-teamseason-ratified`
- candidate hash matches registry: true
- candidate rules match registry: true
- exactly eight RosterAssignment lifecycle rules: true
- roster actions exact: assign / transition / complete / remove
- OrgAdmin roster rules exact: true
- Coach scoped roster rules exact: true
- no roster.move rule: true
- no CaptainAssignment mutation rules: true
- allPassed: true
- failures: []

Policy activation is now authorized for candidate `1d-roster-ratified` through the existing production `policy.activate` path only.


## RosterAssignment mutation policy activation — PASSED

**Activation correlation:** `2211be7f-febb-4489-b2bc-39fded9986da`  
**Activated version:** `1d-roster-ratified`  
**Activated hash:** `fc9748423f821489e7e4246ea15e8d4d985778e57dac87dc9c9a8e07db42b2ce`  
**New policy UUID:** `3f91bf5b-8d4c-4fc9-a1a2-e932cbb7301d`  
**Superseded policy UUID:** `c63bc844-fb27-49ae-abd6-a7330f5ff449`

**Post-activation Base44 checkpoint:** `6ab3ede634d06b7c305f7973` (`5b8b16c02e036ed28d7d6544c7759d8d4576c0b9`)

Verified directly after activation:

- exactly one active AuthorizationPolicyVersion;
- active version = `1d-roster-ratified`;
- active hash = `fc9748423f821489e7e4246ea15e8d4d985778e57dac87dc9c9a8e07db42b2ce`;
- Team = 0;
- TeamSeason = 0;
- RosterAssignment = 0;
- OrganizationGameOffering = 0;
- CaptainAssignment = 0;
- no `roster.move`, `captain.assign`, or `captain.close` operation was run.

The RosterAssignment lifecycle acceptance harness may now run.


## RosterAssignment lifecycle slice — PASSED

Status: **accepted — 22/22 synthetic-only assertions green.**

**Post-pass Base44 checkpoint:** `6ab3f2879316b59d6b64c695` (`5b8b16c02e036ed28d7d6544c7759d8d4576c0b9`)

Active policy:

- `1d-roster-ratified`
- hash `fc9748423f821489e7e4246ea15e8d4d985778e57dac87dc9c9a8e07db42b2ce`

Acceptance verifier:

- `layer1_roster_mutation_verification`
- `syntheticOnly = true`
- `total = 22`
- `passed = 22`
- `failed = 0`
- `allPassed = true`
- `failures = []`

Verified behavior:

- roster.assign succeeds for valid active Membership + planning/active TeamSeason;
- Class-A assignment replay returns the same RosterAssignment;
- same request id + different material input conflicts;
- second nonterminal assignment for the same Membership + TeamSeason conflicts;
- initial `inactive` status is invalid;
- inactive Membership assignment is denied;
- completed TeamSeason assignment is denied;
- in-tenure active→reserve transition succeeds;
- exact target-state transition replay is idempotent with no second version mutation;
- transition to `inactive` leaves current CaptainAssignment open;
- roster.complete succeeds and closes affected captain;
- roster.complete replay is idempotent;
- roster.remove after completed conflicts as a different terminal target;
- separate roster.remove succeeds and closes affected captain;
- Coach(scope) roster.assign succeeds;
- Coach wrong-scope assign is denied;
- Coach(scope) transition succeeds;
- Coach(scope) complete succeeds;
- CoachScope authority identity is preserved in audit;
- roster.assign success audit is present.

Post-verifier cleanup independently confirmed:

- Team = 0
- TeamSeason = 0
- RosterAssignment = 0
- OrganizationGameOffering = 0
- CaptainAssignment = 0

### Slice verdict

`ROSTERASSIGNMENT LIFECYCLE SLICE — PASSED`

The next clean mutation family is `roster.move`, which should be admitted separately with its Class-A move request semantics, source-first safety ordering, destination-create continuation, source-captain closure, and R14 incomplete-move detection.


## roster.move + R14 slice — pre-activation staged

Status: **staged; candidate policy not yet active.**

**Pre-activation Base44 checkpoint:** `6ab3f804dc0387c307a885cb` (`74ef00d2bebf77873cdfed3d1d43f13eea533f72`)

### Operation staged

New dispatcher key:

- `roster.move`

Captain mutation dispatcher keys remain absent.

### Canonical move behavior staged

`roster.move`:

- Class-A durable logical request;
- nonterminal source required;
- destination TeamSeason must differ from source TeamSeason;
- destination TeamSeason must be `planning|active`;
- source and destination must resolve to the same Organization;
- no nonterminal destination assignment may already exist for the same Membership;
- destination status defaults to `active`, may be `reserve`;
- optional destination `gamer_tag` is material move input;
- source current CaptainAssignment closes before source terminalization;
- source RosterAssignment transitions to `removed` before destination creation;
- source recovery metadata stores `roster.move`, execution correlation, durable request id, and server-computed material-input hash;
- destination row carries the move request as immutable `creation_request_id` and move recovery metadata;
- same request + same material input returns/resumes the prior logical result;
- same request + different material input conflicts;
- retry may resume from a source already removed by the same durable move request when the destination is missing;
- destination captaincy is never created automatically;
- Organization-scoped audit required.

### Coach scope boundary

Coach authorization is server-derived against both:

1. source RosterAssignment containment; and
2. destination TeamSeason containment.

Both must match. This prevents a coach scoped only to the source from moving a member into a destination they do not control. Additive scopes may satisfy source and destination independently.

### Policy candidate

Staged candidate:

- key: `esports_v1`
- version: `1e-roster-move-ratified`

It retains all accepted `1d-roster-ratified` rules and adds exactly:

- OrgAdmin `RosterAssignment/move` — same Organization
- Coach `RosterAssignment/move` — `coach_scope`

No CaptainAssignment mutation grant is admitted.

Current persisted active policy remains `1d-roster-ratified`.

### R14 recovery posture

R14 is now active as detection-only:

- detects a source RosterAssignment with:
  - `participation_status = removed`;
  - `last_operation_key = roster.move`;
  - non-null move request id;
  - non-null payload hash;
  - no destination RosterAssignment carrying the same `creation_request_id` and `last_operation_key = roster.move`;
- uses a 60-second operational settling window measured from source `updated_at`;
- writes StandardOperational operator-review finding;
- performs **no repair** and never guesses destination intent;
- is wired into the scheduled reconciliation run;
- R10 monitors the R14 heartbeat.

### Verification staged

`layer1_roster_move_policy_preflight`
- read-only;
- validates candidate hash/rules against registry;
- requires exactly two move rules;
- requires exact OrgAdmin same-org + Coach scoped move grants;
- requires accepted eight-rule roster lifecycle retained;
- requires no Captain mutation grants;
- confirms active policy still `1d-roster-ratified`.

`layer1_roster_move_verification`
- synthetic-only;
- tests successful source-first move;
- verifies source recovery metadata;
- verifies destination request identity/status/gamer tag;
- verifies source captain closure;
- verifies same-request replay with no second source/destination/captain version mutation;
- verifies material-input request reuse conflict;
- rejects same-TeamSeason move;
- rejects pre-existing nonterminal destination before source/captain mutation;
- rejects terminal destination before source mutation;
- verifies Coach move with source + destination scope;
- denies Coach with source scope but no destination scope;
- injects stale incomplete move metadata;
- verifies R14 detection, finding, and no repair;
- verifies successful move audit;
- cleans its synthetic fixtures.

### Pre-activation boundary audit

Verified:

- current active policy = `1d-roster-ratified`;
- candidate = `1e-roster-move-ratified`;
- exactly two production move rules;
- candidate registry entry exists;
- dispatcher exposes `roster.move`;
- Captain mutation dispatcher keys remain absent;
- source captain closes before source terminalization;
- source terminalizes before destination create;
- durable request + payload hash recovery metadata is present;
- resume path is present;
- Coach authorization checks source and destination containment;
- same-TeamSeason move is rejected;
- destination must be planning/active;
- R14 is wired, monitored, detection-only, metadata-driven, and uses settling window;
- policy preflight is read-only;
- mutation verifier does not mutate policy;
- Team/TeamSeason/RosterAssignment/OrganizationGameOffering/CaptainAssignment counts remain 0.

## Next gate

1. Run read-only `layer1_roster_move_policy_preflight`.
2. Require `allPassed: true`.
3. Only then activate `1e-roster-move-ratified` through production `policy.activate`.
4. Verify exactly one active policy and expected hash/version.
5. Run `layer1_roster_move_verification`.
6. Keep CaptainAssignment assign/replacement/manual-close as the next separate mutation family.


## roster.move policy preflight — PASSED

**Base44 checkpoint:** `6ab3fd7d0ad8977b1d17f1e7` (`74ef00d2bebf77873cdfed3d1d43f13eea533f72`)

Read-only `layer1_roster_move_policy_preflight` result:

- candidate version: `1e-roster-move-ratified`
- candidate hash: `b7f75e00cae427d85c3b0f4f954a7d5edce1dfbe8a1ad1da22034d9b3104b00d`
- active version before activation: `1d-roster-ratified`
- candidate hash matches registry: true
- candidate rules match registry: true
- exactly two move rules: true
- OrgAdmin move exact: true
- Coach scoped move exact: true
- accepted roster lifecycle rules retained: true
- no CaptainAssignment mutation rules: true
- allPassed: true
- failures: []

Policy activation is now authorized for candidate `1e-roster-move-ratified` through the existing production `policy.activate` path only.


## roster.move mutation policy activation — PASSED

**Activation correlation:** `1a69dec3-f2c2-4dcc-89e4-ea837fe44104`  
**Activated version:** `1e-roster-move-ratified`  
**Activated hash:** `b7f75e00cae427d85c3b0f4f954a7d5edce1dfbe8a1ad1da22034d9b3104b00d`  
**New policy UUID:** `d230d418-5a3a-4b8c-824b-7ad6f20ef647`  
**Superseded policy UUID:** `3f91bf5b-8d4c-4fc9-a1a2-e932cbb7301d`

**Post-activation Base44 checkpoint:** `6ab3fe7091e386b0460371de` (`74ef00d2bebf77873cdfed3d1d43f13eea533f72`)

Verified directly after activation:

- exactly one active AuthorizationPolicyVersion;
- active version = `1e-roster-move-ratified`;
- active hash = `b7f75e00cae427d85c3b0f4f954a7d5edce1dfbe8a1ad1da22034d9b3104b00d`;
- Team = 0;
- TeamSeason = 0;
- RosterAssignment = 0;
- OrganizationGameOffering = 0;
- CaptainAssignment = 0;
- no roster.move, captain.assign, or captain.close operation was run.

The roster.move + R14 synthetic acceptance harness may now run.


## roster.move + R14 slice — PASSED

Status: **accepted — 16/16 synthetic-only assertions green.**

**Post-pass Base44 checkpoint:** `6ab3ff39a3d1c9b9c86a15f3` (`74ef00d2bebf77873cdfed3d1d43f13eea533f72`)

Active policy:

- `1e-roster-move-ratified`
- hash `b7f75e00cae427d85c3b0f4f954a7d5edce1dfbe8a1ad1da22034d9b3104b00d`

Acceptance verifier:

- `layer1_roster_move_verification`
- `syntheticOnly = true`
- `total = 16`
- `passed = 16`
- `failed = 0`
- `allPassed = true`
- `failures = []`

Verified behavior:

- roster.move succeeds;
- source RosterAssignment transitions to `removed`;
- source recovery metadata records `roster.move`, durable request id, and material payload hash;
- destination RosterAssignment is created with expected TeamSeason, status, gamer tag, and creation_request_id;
- source current CaptainAssignment closes;
- exact same move request replays to the same destination with no second source/destination/captain mutation;
- same request id with changed material input conflicts;
- same-TeamSeason move is rejected;
- pre-existing nonterminal destination conflicts before source/captain mutation;
- completed destination is denied before source mutation;
- Coach with source + destination scope succeeds;
- Coach scope authority identity is preserved in audit;
- Coach without destination scope is denied without source mutation;
- R14 detects stale incomplete move state;
- R14 writes `incomplete_roster_move` finding;
- R14 performs no repair;
- successful roster.move audit is present.

Post-verifier cleanup independently confirmed:

- Team = 0
- TeamSeason = 0
- RosterAssignment = 0
- OrganizationGameOffering = 0
- CaptainAssignment = 0
- open R14 findings = 0

### Slice verdict

`ROSTER.MOVE + R14 SLICE — PASSED`

The remaining Layer 1 mutation family is CaptainAssignment: captain.assign replacement semantics, manual OrgAdmin captain.close, Coach scoped assign with no manual close, current-captain ambiguity handling, and R17 incomplete-replacement detection.


## CaptainAssignment slice — pre-activation staged

Status: **staged; candidate policy not yet active.**

**Pre-activation Base44 checkpoint:** `6ab40360634294c18974287d` (`a4ea81e9e1fa61110e4fa252bceedd2212e83c33`)

### Operations staged

New dispatcher keys:

- `captain.assign`
- `captain.close`

### CaptainAssignment semantics staged

`captain.assign`:
- Class-A durable logical request;
- active Membership required;
- current Player RoleAssignment required;
- exactly one qualifying RosterAssignment in `active|reserve` for the target Membership + TeamSeason;
- TeamSeason must be `planning|active`;
- Membership and TeamSeason must resolve to the same Organization;
- OrgAdmin or Coach(scope) authorization;
- at most one current CaptainAssignment per TeamSeason; multiple-current ambiguity fails closed;
- TeamSeason-level CAS serialization fence;
- replacement ordering supersedes old current captain before creating new captain;
- replacement source metadata records `captain.assign`, execution correlation, durable request id, and server-computed payload hash over TeamSeason + incoming Membership;
- replacement row carries immutable `creation_request_id`;
- same request + same material input replays/resumes;
- same request + different material input conflicts;
- transient vacancy is permitted; two current captains are not intentionally created;
- Organization-scoped RestrictedStudent audit required.

`captain.close`:
- manual close is OrgAdmin-only;
- Coach has no manual-close grant;
- target-state idempotent;
- version-guarded `is_current → false`;
- recovery metadata records Class-B captain.close;
- Organization-scoped RestrictedStudent audit required.

### Dependency activation

Captain dependency semantics now activate:

- Player RoleAssignment revocation closes all current captaincies for that Membership;
- Membership deactivation closes all current captaincies for that Membership;
- existing roster terminal and TeamSeason completion paths continue to close affected captaincies;
- shared close behavior remains fail-toward-less-authority.

### Reconciliation activation

R4:
- detects >1 current CaptainAssignment per TeamSeason;
- RestrictedStudent;
- detection-only/operator review;
- no automatic winner selection.

R5:
- now also deterministically closes current CaptainAssignments attached to inactive Memberships;
- close-only repair;
- writes service audit.

R6:
- actual implementation is now extended to Layer 1 references:
  - Team → Organization
  - TeamSeason → Team
  - RosterAssignment → Membership + TeamSeason, including wrong-tenant chain
  - OrganizationGameOffering → Organization
  - CaptainAssignment → Membership + TeamSeason, including wrong-tenant chain

R17:
- detects old CaptainAssignment superseded by `captain.assign` recovery metadata with request/hash but no replacement row carrying that `creation_request_id`;
- 60-second operational settling window;
- RestrictedStudent;
- detection-only/operator review;
- never guesses or creates replacement authority.

R4 and R17 are wired into scheduled reconciliation and monitored by R10.

### Policy candidate

Staged candidate:

- key: `esports_v1`
- version: `1f-captain-ratified`

It retains all accepted 1e grants and adds exactly three CaptainAssignment mutation grants:

- OrgAdmin `captain.assign` — same Organization
- OrgAdmin `captain.close` — same Organization
- Coach `captain.assign` — `coach_scope`

No Coach manual `captain.close` grant is added.

An older OrgAdmin read grant for CaptainAssignment already exists in the inherited policy; this is not a new mutation grant.

Current persisted active policy remains `1e-roster-move-ratified`.

### Verification staged

`layer1_captain_policy_preflight`
- read-only;
- validates candidate hash/rules against registry;
- requires exactly three CaptainAssignment mutation rules;
- exact OrgAdmin assign + close;
- exact Coach scoped assign;
- explicitly requires no Coach manual close;
- confirms active policy still `1e-roster-move-ratified`.

`layer1_captain_mutation_verification`
- synthetic-only;
- tests initial captain assignment;
- Class-A replay and request-reuse conflict;
- active Membership prerequisite;
- Player Role prerequisite;
- qualifying active/reserve roster prerequisite;
- replacement old→closed/new→current/supersedes chain;
- replacement replay idempotency;
- OrgAdmin manual close + replay;
- Coach scoped assign;
- Coach manual close denial;
- CoachScope audit provenance;
- Player-role revoke closes captain;
- Membership deactivation closes captain;
- R4 detects multiple-current captains without repair;
- R5 closes stale captain on inactive Membership;
- R17 detects incomplete replacement without repair;
- R6 detects wrong-tenant captain chain;
- captain.assign success audit;
- cleans its own fixtures.

### Pre-activation boundary audit

Verified:

- current active policy = `1e-roster-move-ratified`;
- candidate = `1f-captain-ratified`;
- candidate registry entry exists;
- dispatcher exposes captain.assign + captain.close;
- active Membership / Player role / qualifying roster prerequisites are present;
- TeamSeason-level serialization is present;
- replacement vacates old captain before replacement create;
- recovery request id + payload hash are persisted;
- multiple-current state fails closed;
- R4 and R17 are wired and monitored;
- R4 and R17 are detection-only;
- R5 CaptainAssignment close-only repair is active;
- R6 Layer 1/captain reference checking is active;
- Player-role revoke and Membership deactivation captain cascades are active;
- policy preflight is read-only;
- mutation verifier does not mutate policy;
- Team/TeamSeason/RosterAssignment/OrganizationGameOffering/CaptainAssignment counts remain 0.

## Next gate

1. Run read-only `layer1_captain_policy_preflight`.
2. Require `allPassed: true`.
3. Only then activate `1f-captain-ratified` through production `policy.activate`.
4. Verify exactly one active policy and expected hash/version.
5. Run `layer1_captain_mutation_verification`.


## CaptainAssignment policy preflight — PASSED

**Base44 checkpoint:** `6ab404ea06004897e8bac251` (`a4ea81e9e1fa61110e4fa252bceedd2212e83c33`)

Read-only `layer1_captain_policy_preflight` result:

- candidate version: `1f-captain-ratified`
- candidate hash: `1038852cb36d906d88c88747d7a99b77899139d48f3c2e1523ac8ed2694c5f8f`
- active version before activation: `1e-roster-move-ratified`
- candidate hash matches registry: true
- candidate rules match registry: true
- exactly three CaptainAssignment mutation rules: true
- OrgAdmin assign exact: true
- OrgAdmin close exact: true
- Coach scoped assign exact: true
- no Coach manual close: true
- allPassed: true
- failures: []

Policy activation is now authorized for candidate `1f-captain-ratified` through the existing production `policy.activate` path only.
