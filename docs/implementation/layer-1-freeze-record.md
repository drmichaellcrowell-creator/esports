# Layer 1 Freeze Record

**Status:** FROZEN  
**Freeze date:** 2026-09-23

## Architecture baseline

`c3270ed7f1dd10642e82793b84833990b712e9ec`

## Final Base44 state

- checkpoint: `6ab46ef874248a23b98366e7`
- runtime commit: `107c1ee5fad1b1977615551e9f478d71b76c21f8`
- active policy: `1g-layer1-read-ratified`
- policy hash: `f4624985e292b9c0b53f3f4bea7d8ea92328de90cb3ec6b636098aea48bc3cf4`

## Accepted Layer 1 surface

Persistent entities:
- Team
- TeamSeason
- RosterAssignment
- OrganizationGameOffering
- CaptainAssignment

Derived read surface:
- RosterDisplayProjection

Controlled mutation operations:
- team.create
- team.update
- team.archive
- team_season.create
- team_season.transition
- offering.create
- offering.transition
- roster.assign
- roster.transition
- roster.complete
- roster.remove
- roster.move
- captain.assign
- captain.close

Read authorization:
- canonical OrgAdmin same-Organization reads
- canonical Coach scope-contained reads
- canonical Player Team/TeamSeason/Offering same-Organization reads
- Player CaptainAssignment self-read
- Player RosterDisplayProjection via viewer_team_season_member
- no Player raw RosterAssignment read

Active Layer 1 reconciliation:
- R4
- R5
- R6
- R9
- R14
- R15
- R16
- R17
- R10 monitors the active sweep set

## Acceptance totals

- Team: 12/12
- Offering: 14/14
- TeamSeason standalone: 14/14
- TeamSeason completion: 15/15
- Roster lifecycle: 22/22
- roster.move + R14: 16/16
- CaptainAssignment: 20/20
- Layer 1 read access: 23/23
- RosterDisplayProjection: 7/7

## Final clean-state gate

At freeze:
- all Layer 1 domain counts = 0
- all active Layer 1 reconciliation findings = 0
- latest R9 = clean / 0 findings
- latest overall reconciliation = clean / 0 findings
- exactly one policy version active

## Amendment incorporated

- Amendment 004 — Layer 1 TeamSeason Completion Ordering Ratification

## Change control

Layer 1 is frozen as dependency substrate. Any future change to Layer 1 behavior or contract requires a new explicit architecture amendment before implementation.
