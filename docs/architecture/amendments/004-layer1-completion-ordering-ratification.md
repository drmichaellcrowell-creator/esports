# Amendment 004 — Layer 1 TeamSeason Completion Ordering Ratification

**Status:** RATIFIED  
**Ratified:** 2026-09-23  
**Applies to:** Base44 v1 implementation profile only  
**Canonical domain semantics changed:** No

## Decision

For Base44 v1, `team_season.transition(active → completed)` uses this ordered non-atomic workflow:

1. close affected current CaptainAssignments;
2. complete each non-terminal child RosterAssignment;
3. require bounded stable-read confirmation that:
   - zero current CaptainAssignments remain for the TeamSeason; and
   - zero child RosterAssignments remain in `active|reserve|inactive`;
4. only then transition the TeamSeason itself to `completed`.

R16 remains the deterministic repair path for a `completed` TeamSeason that nevertheless has non-terminal child roster/captain residue because of legacy state, direct fixture injection, or an externally-created inconsistent record.

## Rationale

Base44 does not provide the Reference Profile's ACID transaction guarantee across the parent TeamSeason and all child authority records.

The previously written Base44 profile order transitioned the TeamSeason to `completed` first, then cleaned child authority. That creates a failure mode in which the parent advertises a terminal completed state while roster/captain authority is still effective.

The ratified order chooses the opposite partial-state bias:

- transient **active TeamSeason + less child authority** is acceptable;
- transient **completed TeamSeason + still-effective child authority** is not.

This is consistent with the v1 substrate rule to fail toward less authority and less exposure.

## Verification basis

The accepted runtime implementation using this order passed the Layer 1 TeamSeason completion synthetic acceptance gate:

- `layer1_teamseason_completion_verification`
- 15/15 assertions passed
- R16 repair behavior passed
- OrgAdmin and Coach(scope) completion passed
- captain closure and roster completion passed
- replay idempotency passed

## Incorporation

This amendment is incorporated into `../base44-implementation-profile-v1.md`.

It does not change the canonical TeamSeason lifecycle or the canonical requirement that completed TeamSeason implies terminal child rosters and closed affected captaincies.
