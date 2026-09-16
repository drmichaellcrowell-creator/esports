#!/usr/bin/env bash
#
# Deterministic tests for the canonical architecture guard.
#
# Plain bash, because the subject is plain bash and the CI runner already has it.
# Run locally with: .github/scripts/check-architecture-changes.test.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GUARD="${SCRIPT_DIR}/check-architecture-changes.sh"

passed=0
failed=0

# expect <name> <expected-exit> <event> <changed-files> <labels> [expected-substring]
expect() {
  local name="$1" expected="$2" event="$3" files="$4" labels="$5" substring="${6:-}"
  local output status
  output="$(EVENT_NAME="${event}" CHANGED_FILES="${files}" PR_LABELS="${labels}" "${GUARD}" 2>&1)"
  status=$?

  if [ "${status}" -ne "${expected}" ]; then
    printf 'FAIL  %s\n      expected exit %s, got %s\n      output: %s\n' \
      "${name}" "${expected}" "${status}" "${output}"
    failed=$((failed + 1))
    return
  fi
  if [ -n "${substring}" ] && ! printf '%s' "${output}" | grep -qF -- "${substring}"; then
    printf 'FAIL  %s\n      expected output to contain: %s\n      output: %s\n' \
      "${name}" "${substring}" "${output}"
    failed=$((failed + 1))
    return
  fi
  printf 'ok    %s\n' "${name}"
  passed=$((passed + 1))
}

CONTRACT='docs/architecture/implementation-contract.md'
HANDOFF='docs/architecture/implementation-handoff.md'
AMENDMENT='docs/architecture/amendments/001-bootstrap-authority.md'
PROFILE='docs/architecture/base44-implementation-profile-v1.md'
REFSTATUS='docs/architecture/reference-profile-status.md'
LABEL='architecture-amendment'
IMPL=$'backend/src/api/app.ts\nfrontend/src/App.tsx'

echo '— passes when nothing canonical changed —'
expect 'no files changed at all'            0 pull_request ''       ''      'no canonical architecture document changed'
expect 'only implementation files changed'  0 pull_request "${IMPL}" ''     'no canonical architecture document changed'
expect 'unprotected file under docs/'       0 pull_request 'docs/architecture/notes.md' ''
expect 'unprotected file under docs/ root'  0 pull_request 'docs/README.md' ''
expect 'path merely containing the name'    0 pull_request 'backend/docs/architecture/implementation-contract.md' ''
expect 'operations runbook is unaffected'   0 pull_request 'docs/operations/supabase-bootstrap.md' ''
expect 'a future profile version is not covered until added' \
                                            0 pull_request 'docs/architecture/base44-implementation-profile-v2.md' ''
expect 'profile path merely containing the name' \
                                            0 pull_request 'backend/docs/architecture/base44-implementation-profile-v1.md' ''
expect 'reference-profile path elsewhere'   0 pull_request 'docs/reference-profile-status.md' ''

echo
echo '— FAILS when canonical files change without the label —'
expect 'contract changed, no labels'        1 pull_request "${CONTRACT}"  ''            'ARCHITECTURE GUARD FAILED'
expect 'handoff changed, no labels'         1 pull_request "${HANDOFF}"   ''            'ARCHITECTURE GUARD FAILED'
expect 'amendment changed, no labels'       1 pull_request "${AMENDMENT}" ''            'ARCHITECTURE GUARD FAILED'
expect 'Base44 profile changed, no labels'  1 pull_request "${PROFILE}"   ''            'ARCHITECTURE GUARD FAILED'
expect 'reference status changed, no labels' 1 pull_request "${REFSTATUS}" ''           'ARCHITECTURE GUARD FAILED'
expect 'canonical among implementation'     1 pull_request "${IMPL}"$'\n'"${CONTRACT}" '' 'ARCHITECTURE GUARD FAILED'
expect 'profile among implementation'       1 pull_request "${IMPL}"$'\n'"${PROFILE}" ''  'ARCHITECTURE GUARD FAILED'
expect 'canonical with unrelated labels'    1 pull_request "${CONTRACT}"  $'bug\nchore' 'ARCHITECTURE GUARD FAILED'
expect 'profile with unrelated labels'      1 pull_request "${PROFILE}"   $'bug\nchore' 'ARCHITECTURE GUARD FAILED'
expect 'reference status with unrelated labels' \
                                            1 pull_request "${REFSTATUS}" $'bug\nchore' 'ARCHITECTURE GUARD FAILED'
expect 'names the offending file'           1 pull_request "${CONTRACT}"  ''            "- ${CONTRACT}"
expect 'names the offending profile'        1 pull_request "${PROFILE}"   ''            "- ${PROFILE}"
expect 'names the offending reference status' \
                                            1 pull_request "${REFSTATUS}" ''            "- ${REFSTATUS}"

echo
echo '— the escape hatch is exact —'
expect 'exact label permits'                0 pull_request "${CONTRACT}" "${LABEL}"                 'ARCHITECTURE AMENDMENT EXCEPTION ACTIVE'
expect 'exact label permits the profile'    0 pull_request "${PROFILE}"  "${LABEL}"                 'ARCHITECTURE AMENDMENT EXCEPTION ACTIVE'
expect 'exact label permits reference status' \
                                            0 pull_request "${REFSTATUS}" "${LABEL}"                'ARCHITECTURE AMENDMENT EXCEPTION ACTIVE'
expect 'exact label among others permits'   0 pull_request "${CONTRACT}" $'chore\n'"${LABEL}"$'\ndocs' 'EXCEPTION ACTIVE'
expect 'exact label among others, profile'  0 pull_request "${PROFILE}"  $'chore\n'"${LABEL}"$'\ndocs' 'EXCEPTION ACTIVE'
expect 'exception is reported loudly'       0 pull_request "${AMENDMENT}" "${LABEL}"                "- ${AMENDMENT}"
expect 'profile is named in the exception'  0 pull_request "${PROFILE}"  "${LABEL}"                 "- ${PROFILE}"
expect 'reference status named in exception' \
                                            0 pull_request "${REFSTATUS}" "${LABEL}"                "- ${REFSTATUS}"
expect 'wrong case does NOT permit'         1 pull_request "${CONTRACT}" 'Architecture-Amendment'   'ARCHITECTURE GUARD FAILED'
expect 'wrong case does NOT permit profile' 1 pull_request "${PROFILE}"  'Architecture-Amendment'   'ARCHITECTURE GUARD FAILED'
expect 'wrong case does NOT permit ref status' \
                                            1 pull_request "${REFSTATUS}" 'Architecture-Amendment'  'ARCHITECTURE GUARD FAILED'
expect 'label prefix does NOT permit'       1 pull_request "${CONTRACT}" 'architecture-amendment-draft' 'ARCHITECTURE GUARD FAILED'
expect 'label prefix does NOT permit profile' \
                                            1 pull_request "${PROFILE}"  'architecture-amendment-draft' 'ARCHITECTURE GUARD FAILED'
expect 'label prefix does NOT permit ref status' \
                                            1 pull_request "${REFSTATUS}" 'architecture-amendment-draft' 'ARCHITECTURE GUARD FAILED'
expect 'label suffix does NOT permit'       1 pull_request "${CONTRACT}" 'pending-architecture-amendment' 'ARCHITECTURE GUARD FAILED'
expect 'label suffix does NOT permit profile' \
                                            1 pull_request "${PROFILE}"  'pending-architecture-amendment' 'ARCHITECTURE GUARD FAILED'
expect 'label suffix does NOT permit ref status' \
                                            1 pull_request "${REFSTATUS}" 'pending-architecture-amendment' 'ARCHITECTURE GUARD FAILED'
expect 'substring in another label fails'   1 pull_request "${CONTRACT}" 'needs architecture-amendment review' 'ARCHITECTURE GUARD FAILED'
expect 'substring in another label fails, profile' \
                                            1 pull_request "${PROFILE}"  'needs architecture-amendment review' 'ARCHITECTURE GUARD FAILED'
expect 'substring in another label fails, ref status' \
                                            1 pull_request "${REFSTATUS}" 'needs architecture-amendment review' 'ARCHITECTURE GUARD FAILED'

echo
echo '— applies to pull requests only —'
expect 'push to main is not gated'          0 push        "${CONTRACT}" ''  'not applicable'
expect 'push to main is not gated, profile' 0 push        "${PROFILE}"  ''  'not applicable'
expect 'workflow_dispatch is not gated'     0 workflow_dispatch "${CONTRACT}" '' 'not applicable'
expect 'missing event name is not gated'    0 ''          "${CONTRACT}" ''  'not applicable'

echo
echo '— every protected path, enumerated —'
for protected in "${CONTRACT}" "${HANDOFF}" "${AMENDMENT}" "${PROFILE}" "${REFSTATUS}"; do
  expect "blocked without label: ${protected}" 1 pull_request "${protected}" ''          'ARCHITECTURE GUARD FAILED'
  expect "allowed with label:    ${protected}" 0 pull_request "${protected}" "${LABEL}"  'EXCEPTION ACTIVE'
done

echo
echo "passed: ${passed}  failed: ${failed}"
[ "${failed}" -eq 0 ] || exit 1
