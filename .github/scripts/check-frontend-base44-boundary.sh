#!/usr/bin/env bash
#
# Frontend Base44 boundary check.
#
# Base44 is the active v1 substrate (docs/architecture/base44-implementation-profile-v1.md).
# Profile Section 10.1 allows the browser exactly one dependency on it, behind
# one adapter, and forbids everything else in the frontend from knowing the
# substrate exists. This check makes that a build failure rather than advice.
#
# It replaces the earlier "Frontend must not depend on Base44" rule, which was
# correct while Base44 was only a preview harness and is now too blunt: the
# adapter legitimately needs the SDK. Nothing else does, and the bans below are
# strictly wider than what that rule enforced.
#
# What it enforces:
#   1. The Base44 SDK is imported only inside the designated adapter directory.
#      No page, component, hook, application or domain module may import it.
#   2. Entity access is unreachable anywhere in frontend source. Profile
#      Section 2.4 and Contract Global Invariant 17 put governed entities
#      behind backend functions; the UI calls operations, never entities.
#   3. Elevated service-role access appears nowhere. It exists only inside
#      backend functions, and a browser cannot hold it.
#   4. No Base44 or backend credential appears in frontend source.
#   5. No direct Supabase or database access from the frontend (Option B,
#      carried over unchanged).
#   6. Test-only infrastructure is not imported by shipped code, so a fake
#      executor can never stand in for authorization.
#
# Pure: the tree to scan is an argument, so the logic is testable against
# fixtures without GitHub. See check-frontend-base44-boundary.test.sh.
#
#   $1  root of the frontend source tree (default: frontend/src)
set -uo pipefail

ROOT="${1:-frontend/src}"

# Paths are matched relative to ROOT, so a fixture tree behaves exactly as the
# real one does.
ADAPTER_DIR='infrastructure/base44'
TEST_ONLY_DIR='testing'

failures=0

if [ ! -d "${ROOT}" ]; then
  echo "frontend boundary: cannot scan '${ROOT}' — no such directory"
  exit 1
fi

# Every scanned source file, relative to ROOT.
sources() {
  find "${ROOT}" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' \) \
    | sed "s|^${ROOT}/||" \
    | sort
}

# report <rule> <explanation> <offenders>
#
# Takes the offending lines as an argument rather than on stdin. A pipeline
# runs its right-hand side in a subshell, so a failure counter incremented
# there is discarded when the subshell exits — the check would print every
# violation and still exit 0.
report() {
  local rule="$1" explanation="$2" offenders="$3"
  [ -z "${offenders}" ] && return 0

  echo "::error title=Frontend Base44 boundary::${rule}"
  echo ''
  echo "BOUNDARY VIOLATION — ${rule}"
  echo "${explanation}"
  echo ''
  printf '%s\n' "${offenders}" | sed 's/^/  - /'
  echo ''
  failures=$((failures + 1))
}

# scan <extended-regex> [path-filter-mode] — prints "path:line:text"
#   path-filter-mode 'outside-adapter' skips files under the adapter directory.
#   path-filter-mode 'outside-test-only' skips the test-only directory itself.
scan() {
  local pattern="$1" mode="${2:-all}" file
  while IFS= read -r file; do
    case "${mode}" in
      outside-adapter) case "${file}" in "${ADAPTER_DIR}"/*) continue ;; esac ;;
      outside-test-only) case "${file}" in "${TEST_ONLY_DIR}"/*) continue ;; esac ;;
    esac
    # Test files are scanned like any other source: a rule that tests may break
    # is a rule the next refactor inherits from a test.
    grep -nE "${pattern}" "${ROOT}/${file}" 2>/dev/null \
      | sed "s|^|${file}:|"
  done < <(sources)
}

report \
  "The Base44 SDK may be imported only inside '${ADAPTER_DIR}/'." \
  'Pages, components, hooks and application modules depend on the operation contract, never on the substrate.' \
  "$(scan '@base44' outside-adapter)"

report \
  'Base44 entity access is not permitted in frontend source.' \
  'Governed entities are reachable only through backend functions (profile Section 2.4, Contract Global Invariant 17). The UI calls operations.' \
  "$(scan '\.entities\b')"

report \
  'Elevated service-role access is not permitted in frontend source.' \
  'Service-role access exists only inside backend functions. No such credential or capability reaches the browser bundle.' \
  "$(scan 'asServiceRole|SERVICE_ROLE|serviceToken|service_token|SERVICE_TOKEN|createClientFromRequest')"

report \
  'No credential may appear in frontend source.' \
  'Every VITE_* value is inlined into the browser bundle. Only public configuration, such as the Base44 app id, belongs here.' \
  "$(scan 'apiKey|api_key|API_KEY|JWT_SECRET|DATABASE_URL|VITE_[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD)')"

report \
  'The frontend has no direct Supabase or database access.' \
  'Option B: the browser never touches application tables. This is unchanged by Base44 becoming the active v1 substrate.' \
  "$(scan '@supabase/|postgres://|postgresql://')"

report \
  "A substrate client may be constructed only inside '${ADAPTER_DIR}/'." \
  'Constructing a client elsewhere is how a second, unreviewed substrate dependency appears.' \
  "$(scan 'createClient\(' outside-adapter)"

# Test files may use the fake; that is what it is for. Shipped modules may not.
report \
  "Shipped code may not import test-only infrastructure from '${TEST_ONLY_DIR}/'." \
  'The in-memory executor is a fake. A fake that reaches production is a permissive default standing in for authorization.' \
  "$(scan "from '(\.{1,2}/)+${TEST_ONLY_DIR}/" outside-test-only | grep -vE '\.test\.(ts|tsx|js|jsx):')"

if [ "${failures}" -gt 0 ]; then
  echo "FRONTEND BASE44 BOUNDARY FAILED — ${failures} rule(s) violated in '${ROOT}'."
  exit 1
fi

echo "frontend boundary: ok — ${ROOT} respects the Base44 adapter boundary"
exit 0
