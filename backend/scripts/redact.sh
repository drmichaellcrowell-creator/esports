#!/usr/bin/env bash
#
# Redact anything credential-shaped from a stream, so command output can be
# shared or pasted into a review safely.
#
# The verification tools are already written not to print secrets; this is a
# second, independent layer rather than the primary defence.
#
# Usage:  npm run verify:substrate 2>&1 | backend/scripts/redact.sh
set -euo pipefail
sed -E \
  -e 's#(postgres(ql)?://[^:/?#[:space:]]+):[^@[:space:]]+@#\1:***REDACTED***@#g' \
  -e 's#(password[[:space:]]*[=:][[:space:]]*)[^[:space:],;"'"'"']+#\1***REDACTED***#gI' \
  -e 's#eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+#***REDACTED-JWT***#g' \
  -e 's#(sb_secret_|sbp_)[A-Za-z0-9_-]+#***REDACTED-KEY***#g'
