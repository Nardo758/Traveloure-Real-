#!/usr/bin/env bash
# teardown.sh — reset-db.sh, then diff whole-database row counts against the
# baseline captured right after the FIRST reset (R-4: proves teardown restores
# the database to its post-seed state, not just "some" state).
#
# Baseline file: test-results/row-counts-baseline.txt. If absent, this run
# captures it (first call in a session establishes the baseline rather than
# failing) and prints a note; every subsequent call diffs against it.
set -euo pipefail

cd "$(dirname "$0")/../.."

BASELINE="test-results/row-counts-baseline.txt"
DIFF_OUT="test-results/teardown-rowcount-diff.txt"
mkdir -p test-results

echo "[teardown] resetting database"
bash scripts/e2e/reset-db.sh

echo "[teardown] capturing row counts"
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/traveloure}" \
  npx tsx scripts/e2e/row-counts.ts > test-results/row-counts-current.txt

if [ ! -f "$BASELINE" ]; then
  echo "[teardown] no baseline yet — this reset establishes it"
  cp test-results/row-counts-current.txt "$BASELINE"
  echo "no prior baseline; this run's counts are now the baseline" > "$DIFF_OUT"
  exit 0
fi

echo "[teardown] diffing against baseline"
if diff -u "$BASELINE" test-results/row-counts-current.txt > "$DIFF_OUT"; then
  echo "[teardown] PASS: row counts match baseline exactly"
  exit 0
else
  echo "[teardown] FAIL: row counts diverge from baseline (see $DIFF_OUT)" >&2
  cat "$DIFF_OUT" >&2
  exit 1
fi
