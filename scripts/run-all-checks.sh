#!/bin/bash
# Run EVERY scripts/check-*.cjs before a push (decision-maker pre-push rule, Oct 9, 2026). Exits NON-ZERO
# when any check fails, and names each failing script with the tail of its output — so a wrapper that
# pipes this through `tail` must still read the exit code (Oct 10, 2026: a
# wrapper that printed FAILED and exited 0 let a push through). Every check reads stdin from /dev/null:
# check-spec-arming.cjs reads a diff from stdin when given no --diff, and an inherited open stdin hung it
# until the timeout — the intermittent FAILED of Oct 10.
#   usage: scripts/run-all-checks.sh [DATABASE_URL]   (check-undeclared-tables gets the URL)
cd "$(dirname "$0")/.." || exit 2
DB="${1:-${DATABASE_URL:-}}"
fail=0
for f in scripts/check-*.cjs; do
  if [ "$f" = scripts/check-undeclared-tables.cjs ]; then
    [ -n "$DB" ] || { echo "== SKIP $f (no DATABASE_URL)"; continue; }
    out=$(timeout 180 node "$f" "$DB" 2>&1 < /dev/null)
  else
    out=$(timeout 180 node "$f" 2>&1 < /dev/null)
  fi
  rc=$?
  if [ $rc -ne 0 ]; then echo "== FAIL $f (rc=$rc)"; echo "$out" | tail -5; fail=1; fi
done
echo "run-all-checks: $([ $fail = 0 ] && echo CLEAN || echo FAILED)"
exit $fail
