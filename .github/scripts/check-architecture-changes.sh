#!/usr/bin/env bash
#
# Canonical architecture guard.
#
# The canonical architecture is authoritative and is not edited during ordinary
# implementation work. This check makes that a build failure rather than advice.
#
# The same protection covers the substrate profile documents. They are where the
# only permitted deviations from the canonical contract are written down, so an
# edit to one can weaken a guarantee exactly as an edit to the contract can.
#
# A dedicated architecture-amendment pull request is the intended exception, and
# it must be declared deliberately: apply the `architecture-amendment` label.
# The label is the whole escape hatch — there is no environment variable, commit
# trailer, or file-based override, because each of those can be set by the same
# commit that makes the change.
#
# Decision:
#   not a pull_request event            -> pass (pushes go through normal CI)
#   no canonical file changed           -> pass
#   canonical changed + exact label     -> pass, and say loudly that it applied
#   canonical changed, no label         -> FAIL
#
# Pure: every input arrives by environment variable, so the logic is testable
# without GitHub. See check-architecture-changes.test.sh.
#
#   EVENT_NAME     github.event_name
#   CHANGED_FILES  newline-separated paths changed by this PR
#   PR_LABELS      newline-separated label names on this PR
set -euo pipefail

EXCEPTION_LABEL='architecture-amendment'

EVENT_NAME="${EVENT_NAME:-}"
CHANGED_FILES="${CHANGED_FILES:-}"
PR_LABELS="${PR_LABELS:-}"

# Paths the guard protects. Anchored, so `docs/architecture/notes.md` and
# anything outside docs/architecture/ is unaffected.
#
#   implementation-contract.md          the canonical architecture
#   implementation-handoff.md           how it is to be implemented
#   amendments/**                       amendments to the canonical architecture
#   base44-implementation-profile-v1.md the active v1 substrate profile — the
#                                       only place deviations from the contract
#                                       are permitted to exist
#   reference-profile-status.md         the preserved Reference Profile's
#                                       disposition, including deferred checks
#
# Profile filenames are matched exactly, not by prefix: a future
# base44-implementation-profile-v2.md is deliberately NOT covered until it is
# added here, so introducing a new profile is itself a visible decision.
CANONICAL_PATTERN='^docs/architecture/(implementation-contract\.md|implementation-handoff\.md|base44-implementation-profile-v1\.md|reference-profile-status\.md|amendments/.+)$'

if [ "${EVENT_NAME}" != 'pull_request' ]; then
  echo "architecture guard: not a pull_request event (${EVENT_NAME:-none}) — not applicable"
  exit 0
fi

changed_canonical="$(printf '%s\n' "${CHANGED_FILES}" | grep -E "${CANONICAL_PATTERN}" || true)"

if [ -z "${changed_canonical}" ]; then
  echo 'architecture guard: ok — no canonical architecture document changed'
  exit 0
fi

# Exact, case-sensitive, whole-line match. `architecture-amendment-draft` and
# `Architecture-Amendment` are deliberately not the label.
if printf '%s\n' "${PR_LABELS}" | grep -Fxq "${EXCEPTION_LABEL}"; then
  echo "::notice title=Architecture amendment exception active::This pull request carries the '${EXCEPTION_LABEL}' label, so changes to canonical architecture documents are permitted here."
  echo ''
  echo "ARCHITECTURE AMENDMENT EXCEPTION ACTIVE — label '${EXCEPTION_LABEL}' is present."
  echo 'Canonical architecture documents changed by this pull request:'
  printf '%s\n' "${changed_canonical}" | sed 's/^/  - /'
  echo ''
  echo 'Review these as an architecture amendment, not as implementation.'
  exit 0
fi

echo "::error title=Canonical architecture document changed::This pull request modifies canonical architecture documents but does not carry the '${EXCEPTION_LABEL}' label."
echo ''
echo 'ARCHITECTURE GUARD FAILED.'
echo ''
echo 'The canonical architecture is authoritative and is not edited during ordinary'
echo 'implementation work. This pull request changes:'
printf '%s\n' "${changed_canonical}" | sed 's/^/  - /'
echo ''
echo 'If this is an intentional, dedicated architecture-amendment pull request, apply'
echo "the '${EXCEPTION_LABEL}' label and re-run. Otherwise revert these files."
exit 1
