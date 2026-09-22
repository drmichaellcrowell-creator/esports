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
