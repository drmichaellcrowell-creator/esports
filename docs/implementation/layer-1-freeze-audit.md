# Layer 1 Closure / Freeze Audit

**Audit date:** 2026-09-23  
**Architecture baseline:** `c3270ed7f1dd10642e82793b84833990b712e9ec`  
**GitHub implementation/status branch:** `layer-1-foundation-substrate-v2`  
**Audited branch head:** `a7ec1f7d1a64390908697897e9b3a43349011b8a`  
**Base44 audit checkpoint:** `6ab42621523301df5fb1d937`  
**Base44 runtime commit:** `a4ea81e9e1fa61110e4fa252bceedd2212e83c33`  
**Active production policy:** `1f-captain-ratified`  
**Active policy hash:** `1038852cb36d906d88c88747d7a99b77899139d48f3c2e1523ac8ed2694c5f8f`

## Verdict

**NOT READY TO FREEZE**

All Layer 1 mutation families have individually passed their synthetic acceptance gates, but the cross-cutting closure audit found four freeze blockers. Layer 2 must not begin until these are closed.

## What passed

### Mutation families

Accepted and recorded:

- Team — 12/12
- OrganizationGameOffering — 14/14
- TeamSeason standalone lifecycle — 14/14
- TeamSeason completion cascade — 15/15
- RosterAssignment lifecycle — 22/22
- roster.move + R14 — 16/16
- CaptainAssignment + R4/R5/R6/R17 — 20/20

### Dispatcher surface

The production dispatcher exposes the intended Layer 1 controlled mutation keys:

- `team.create`
- `team.update`
- `team.archive`
- `team_season.create`
- `team_season.transition`
- `offering.create`
- `offering.transition`
- `roster.assign`
- `roster.transition`
- `roster.complete`
- `roster.remove`
- `roster.move`
- `captain.assign`
- `captain.close`

No later-layer domain operation was admitted.

### Entity/RLS posture

Direct CRUD RLS remains denied for:

- Team
- TeamSeason
- RosterAssignment
- OrganizationGameOffering
- CaptainAssignment

Layer 1 domain row counts at audit time:

- Team = 0
- TeamSeason = 0
- RosterAssignment = 0
- OrganizationGameOffering = 0
- CaptainAssignment = 0

### Reconciliation execution

The scheduled reconciliation workflow exists at `*/5 * * * *`.

Recent live heartbeats confirm R4, R5, R6, R14, R15, R16 and R17 execute. At audit time:

- open R4 findings = 0
- open R5 findings = 0
- open R6 findings = 0
- open R14 findings = 0
- open R15 findings = 0
- open R16 findings = 0
- open R17 findings = 0

### Repository state

The Layer 1 branch is:

- 31 commits ahead of `main`
- 0 commits behind
- merge base = architecture baseline `c3270ed7f1dd10642e82793b84833990b712e9ec`

No GitHub commit status checks or PR-triggered workflow runs are configured on the audited branch head. This is recorded as repository state, not treated as an automatic failure by itself.

---

# Freeze blockers

## F1 — TeamSeason completion ordering diverges from the ratified Base44 profile

**Severity:** architecture parity blocker.

The ratified Base44 profile states:

1. TeamSeason → `completed`
2. complete nonterminal child rosters
3. close affected captains
4. R16 repairs leftover child state

The accepted runtime deliberately implements a different order:

1. close affected captains
2. complete nonterminal child rosters
3. stably verify zero current captains + zero nonterminal rosters
4. TeamSeason → `completed` last

The runtime order was deliberately chosen during implementation because it fails toward less authority and prevents a completed parent from becoming visible before its dependent authority is closed. It passed the 15/15 completion acceptance gate.

However, this remains an **unratified deviation from the canonical Base44 profile**. The handoff explicitly forbids silently accepting deviations not written into the profile.

**Closure required:** either:
- amend/ratify the Base44 profile to make the accepted fail-toward-less-authority order canonical for v1; or
- change runtime back to the currently ratified parent-first order and rerun the completion/R16 acceptance gates.

No freeze declaration may hide this divergence.

## F2 — Canonical Layer 1 read/projection boundary is not implemented

**Severity:** functional architecture blocker.

The canonical contract grants Layer 1 reads including:

- Team — Player / Coach / OrgAdmin
- TeamSeason — Player / Coach / OrgAdmin
- OrganizationGameOffering — Player / Coach / OrgAdmin, with Coach game containment through Team/TeamSeason scope
- RosterAssignment — OrgAdmin / Coach(scope)
- CaptainAssignment — self / OrgAdmin / Coach(scope)
- RosterDisplayProjection — Player own team-season, Coach(scope), OrgAdmin

Current production policy contains Layer 1 mutation grants but does **not** contain the complete Layer 1 read grants.

There is also no production Layer 1 read adapter / backend read surface implementing those resolver-gated reads.

`RosterDisplayProjection` is not implemented as the required derived DTO. No production code currently constructs the canonical projection:

- opaque `member_reference`
- `display_name`
- `gamer_tag`
- `team_name`
- `game_id`
- `participation_status`
- live `captain_indicator`

The resolver also has no explicit implementation of `viewer_team_season_member`. Today it explicitly handles `coach_scope`; an unknown scope label would not safely enforce the Player team-season membership condition.

**Closure required:** implement the Layer 1 read/projection boundary, add the exact canonical read grants to a new policy version, explicitly enforce `viewer_team_season_member`, and acceptance-test allow/deny cases before activation.

## F3 — Reconciliation schema enums are stale

**Severity:** schema/runtime parity blocker.

Runtime writes and monitors these active Layer 1 sweep keys:

- R4
- R14
- R15
- R16
- R17

But the persisted schemas remain Layer-0-era:

`ReconciliationFinding.sweep_key` enum:
- R1, R2, R3, R5, R6, R7, R8, R9, R10, R11

`ReconciliationHeartbeat.sweep_key` enum:
- R1, R2, R3, R5, R6, R7, R8, R9, R10, R11, all

The service-role runtime has accepted new keys, but the schema contract is stale and therefore does not accurately describe the persisted data the runtime now writes.

**Closure required:** amend both schemas to include R4, R14, R15, R16 and R17, retain direct CRUD RLS denial, then rerun schema/read-only verification.

## F4 — R9 audit reconciliation is not freeze-clean

**Severity:** operational reconciliation blocker.

The live scheduled reconciliation run is currently:

- R4/R5/R6/R14/R15/R16/R17: clean
- R10: clean
- **R9: operator_review**
- overall: **operator_review**

The current live R9 finding is caused by two historical superseded `0b.3-ratified` AuthorizationPolicyVersion rows carrying synthetic correlation:

`lb02-restore-active`

There is no matching AuditLogEvent for that correlation, so R9 re-detects the mismatch on every scheduled run.

Separately, historical R9 findings show the current R9 algorithm also treats legitimate idempotent success replays / state-setting success-with-no-new-domain-row as `orphaned_audit`. That is a semantic false-positive class: a Class-A replay or Class-B target-state idempotent success may correctly write/return success without creating a new domain correlation.

There are at least 100 currently open historical R9 findings, many originating from synthetic acceptance fixtures and replay paths.

**Closure required:**
1. correct R9 semantics so legitimate replay/no-op success audits are not classified as orphaned domain mutations;
2. decide and document treatment of the two old `lb02-restore-active` synthetic policy-history rows without fabricating retrospective audit;
3. resolve/clean synthetic R9 findings after verifying their referenced test resources are gone;
4. require a subsequent scheduled reconciliation run with R9 clean and overall outcome clean before freeze.

---

# Non-blocking cleanup debt

These do not independently prevent freeze once the blockers above are closed, but should be corrected in the closure remediation:

- `reconciliation_sweep/entry.ts` comment still says R4 is deferred.
- `Reconciliation Sweep.jsonc` description still describes only R1–R11.
- R10 comment still lists the older monitored sweep set even though code monitors R4/R14/R15/R16/R17.
- TeamSeason transition header comments still describe active→completed as deferred even though completion is implemented.
- GitHub has no configured status checks on the Layer 1 branch head; freeze evidence is therefore primarily the recorded synthetic gates + Base44 checkpoints unless CI is added.

---

# Freeze gate after remediation

Layer 1 may be declared frozen only after all of the following are true:

1. F1 has a ratified architecture disposition and runtime matches it.
2. Canonical Layer 1 read + projection boundary is implemented and verified.
3. Reconciliation schemas enumerate all active sweep keys.
4. R9 is semantically corrected and the scheduled reconciliation run is clean.
5. Active policy version/hash matches the final frozen rule set.
6. Exactly one policy version is active.
7. Layer 1 domain counts remain zero after synthetic verification.
8. Open Layer 1 reconciliation findings are zero.
9. Full closure verifier passes read-only.
10. Final Base44 checkpoint and GitHub closure commit are recorded.
11. Only then create the Layer 1 freeze record / PR for merge to `main`.

## Audit conclusion

**Layer 1 mutation implementation is accepted, but Layer 1 is not yet frozen.**

The next work should be a dedicated **Layer 1 Closure Remediation** slice addressing F1–F4, followed by one final read-only freeze gate.


---

# Remediation status — Closure Remediation A

**Completed:** 2026-09-23  
**Base44 checkpoint:** `6ab42906d346ec4c28e72855`  
**Runtime commit:** `050654b9666889472c8ea9f3af523b765e99deef`

Freeze blocker disposition:

- **F1 — CLOSED.** Amendment 004 and the Base44 profile now ratify the accepted fail-toward-less-authority TeamSeason completion ordering.
- **F3 — CLOSED.** ReconciliationHeartbeat/Finding schema enums now include R4/R14/R15/R16/R17 with deny-all RLS preserved.
- **F4 — CLOSED.** R9 semantics were corrected; legacy `lb02-restore-active` history is explicitly exempted without fabricated audit; stale synthetic findings were resolved; the scheduled R9 and overall reconciliation run are now clean with zero findings.
- **F2 — OPEN.** Canonical Layer 1 read adapters/policy and RosterDisplayProjection remain unimplemented.

## Updated freeze verdict

**NOT READY TO FREEZE — one blocker remains (F2).**

The next dedicated closure remediation slice is the Layer 1 read/projection boundary.


---

# Final Freeze Decision

**Date:** 2026-09-23  
**Verdict:** **LAYER 1 — FROZEN**

All four previously identified freeze blockers are closed:

- **F1 CLOSED** — TeamSeason completion ordering ratified in Amendment 004 and profile-aligned.
- **F2 CLOSED** — canonical Layer 1 read boundary and RosterDisplayProjection implemented and accepted.
- **F3 CLOSED** — reconciliation schema/runtime sweep-key parity restored.
- **F4 CLOSED** — R9 semantics corrected and scheduled reconciliation clean.

## Read/projection acceptance

Gate A:
- `layer1_read_access_verification`
- 23/23 passed
- cleanup passed

Gate B:
- `layer1_roster_projection_verification`
- 7/7 passed
- cleanup passed

Combined:
- 30/30 canonical read/projection assertions accepted.

## Final runtime posture

- active policy = `1g-layer1-read-ratified`
- active policy hash = `f4624985e292b9c0b53f3f4bea7d8ea92328de90cb3ec6b636098aea48bc3cf4`
- exactly one active policy
- all Layer 1 domain counts = 0
- all active Layer 1 reconciliation findings = 0
- latest R9 = clean
- latest overall reconciliation = clean
- direct client CRUD remains denied

## Freeze checkpoint

- Base44 checkpoint: `6ab46ef874248a23b98366e7`
- Base44 runtime commit: `107c1ee5fad1b1977615551e9f478d71b76c21f8`

## Freeze rule

Future implementation may depend on Layer 1 as stable substrate.

Any future change to Layer 1 authorization, lifecycle semantics, projection fields, reconciliation semantics, tenant containment, or persistent field shape requires an explicit architecture amendment before implementation.
