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
