#!/usr/bin/env bash
#
# Deterministic tests for the frontend Base44 boundary check.
#
# Each case builds a throwaway source tree, runs the real check against it, and
# asserts the outcome. Fixtures rather than the live tree, so the tests prove
# the check *catches* violations — a guard only ever exercised on clean code is
# indistinguishable from one that always passes.
#
# Run locally with: .github/scripts/check-frontend-base44-boundary.test.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECK="${SCRIPT_DIR}/check-frontend-base44-boundary.sh"

passed=0
failed=0
workspace="$(mktemp -d)"
trap 'rm -rf "${workspace}"' EXIT

# fixture <name> — creates a tree with the legitimate adapter already in place
# and echoes its root.
fixture() {
  local root="${workspace}/$1"
  rm -rf "${root}"
  mkdir -p "${root}/infrastructure/base44" "${root}/application/operations" \
           "${root}/application/react" "${root}/components" "${root}/pages" "${root}/testing"
  cat > "${root}/infrastructure/base44/client.ts" <<'EOF'
import { createClient } from '@base44/sdk'
export const make = (appId: string) => createClient({ appId })
EOF
  cat > "${root}/application/operations/contract.ts" <<'EOF'
export interface OperationExecutor { execute(name: string): Promise<unknown> }
EOF
  cat > "${root}/components/Panel.tsx" <<'EOF'
import { useOperation } from '../application/react'
export default function Panel() { return useOperation('assignRole') ? null : null }
EOF
  cat > "${root}/testing/in-memory.ts" <<'EOF'
export class InMemoryOperationExecutor {}
EOF
  echo "${root}"
}

# expect <name> <expected-exit> <root> [expected-substring]
expect() {
  local name="$1" expected="$2" root="$3" substring="${4:-}"
  local output status
  output="$("${CHECK}" "${root}" 2>&1)"
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

echo '— a clean tree passes —'
root="$(fixture clean)"
expect 'adapter may import the SDK'            0 "${root}" 'respects the Base44 adapter boundary'

echo
echo '— the SDK is confined to the adapter directory —'
for offender in components/Panel.tsx pages/Admin.tsx application/operations/contract.ts application/react/useThing.ts; do
  root="$(fixture "sdk-${offender//\//-}")"
  mkdir -p "$(dirname "${root}/${offender}")"
  printf "import { createClient } from '@base44/sdk'\n" > "${root}/${offender}"
  expect "SDK import in ${offender} fails"     1 "${root}" "- ${offender}:1"
done

root="$(fixture sdk-subpath)"
printf "import x from '@base44/sdk/dist/entities'\n" > "${root}/components/Sneaky.tsx"
expect 'SDK subpath import also fails'         1 "${root}" 'may be imported only inside'

root="$(fixture sdk-dynamic)"
printf "const m = await import('@base44/sdk')\n" > "${root}/components/Dyn.tsx"
expect 'dynamic SDK import also fails'         1 "${root}" 'may be imported only inside'

root="$(fixture sdk-nested-adapter)"
mkdir -p "${root}/infrastructure/base44/internal"
printf "import { createClient } from '@base44/sdk'\n" > "${root}/infrastructure/base44/internal/x.ts"
expect 'nested adapter file is still allowed'  0 "${root}"

echo
echo '— entity access is banned everywhere, adapter included —'
root="$(fixture entities-adapter)"
printf "const r = await base44.entities.Membership.list()\n" >> "${root}/infrastructure/base44/client.ts"
expect 'entity access inside the adapter fails' 1 "${root}" 'entity access is not permitted'

root="$(fixture entities-component)"
printf "const r = client.entities.Team.list()\n" > "${root}/components/Roster.tsx"
expect 'entity access in a component fails'    1 "${root}" 'entity access is not permitted'

echo
echo '— elevated access is banned everywhere —'
for literal in 'asServiceRole' 'SERVICE_ROLE' 'serviceToken' 'createClientFromRequest'; do
  root="$(fixture "elevated-${literal}")"
  printf 'const x = %s\n' "${literal}" > "${root}/components/Bad.tsx"
  expect "${literal} in frontend fails"        1 "${root}" 'service-role access is not permitted'
done

root="$(fixture elevated-adapter)"
printf "const c = base44.asServiceRole\n" >> "${root}/infrastructure/base44/client.ts"
expect 'elevated access inside the adapter also fails' 1 "${root}" 'service-role access is not permitted'

echo
echo '— credentials are banned everywhere —'
for literal in 'apiKey' 'API_KEY' 'JWT_SECRET' 'DATABASE_URL' 'VITE_BASE44_API_KEY' 'VITE_APP_SECRET'; do
  root="$(fixture "cred-${literal}")"
  printf 'const v = "%s"\n' "${literal}" > "${root}/components/Cfg.tsx"
  expect "${literal} in frontend fails"        1 "${root}" 'No credential may appear'
done

root="$(fixture cred-public-appid)"
printf "const id = import.meta.env.VITE_BASE44_APP_ID\n" > "${root}/components/Cfg.tsx"
expect 'the public app id is permitted'        0 "${root}"

echo
echo '— Option B: no direct Supabase or database access —'
for literal in '@supabase/supabase-js' 'postgres://user@host/db' 'postgresql://user@host/db'; do
  root="$(fixture "db-${literal//[^a-z]/}")"
  printf 'const v = "%s"\n' "${literal}" > "${root}/components/Db.tsx"
  expect "${literal} in frontend fails"        1 "${root}" 'no direct Supabase or database access'
done

root="$(fixture db-createclient)"
printf "const c = createClient({ url: 'x' })\n" > "${root}/components/Db.tsx"
expect 'createClient outside the adapter fails' 1 "${root}" 'may be constructed only inside'

echo
echo '— test-only infrastructure stays out of shipped code —'
root="$(fixture testonly-shipped)"
printf "import { InMemoryOperationExecutor } from '../testing/in-memory'\n" > "${root}/components/Bad.tsx"
expect 'a component importing the fake fails'  1 "${root}" 'may not import test-only infrastructure'

root="$(fixture testonly-main)"
printf "import { InMemoryOperationExecutor } from './testing/in-memory'\n" > "${root}/application/react/wire.ts"
expect 'an application module importing the fake fails' 1 "${root}" 'may not import test-only infrastructure'

root="$(fixture testonly-test)"
printf "import { InMemoryOperationExecutor } from '../testing/in-memory'\n" > "${root}/components/Panel.test.tsx"
expect 'a test importing the fake is permitted' 0 "${root}"

echo
echo '— several violations at once are all reported —'
root="$(fixture many)"
printf "import { createClient } from '@base44/sdk'\n" > "${root}/components/A.tsx"
printf "const x = asServiceRole\n" > "${root}/components/B.tsx"
expect 'reports every broken rule'             1 "${root}" '2 rule(s) violated'

echo
echo '— operational behaviour —'
expect 'a missing root is an error, not a pass' 1 "${workspace}/does-not-exist" 'no such directory'
root="$(fixture empty)"
rm -rf "${root:?}"/* && mkdir -p "${root}/x"
expect 'an empty tree passes'                  0 "${root}"

echo
echo "passed: ${passed}  failed: ${failed}"
[ "${failed}" -eq 0 ] || exit 1
