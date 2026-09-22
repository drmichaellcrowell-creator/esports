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
