#!/usr/bin/env bash
# check-lane-base.sh — lane worktree base guard (ledger 2026-08-24-worktree-base-guard).
#
# A build lane's FIRST action is to run this with the expected dispatch-time HEAD SHA
# from its brief. If the worktree it was given is not based on that exact commit, the
# lane HARD-STOPS and reports instead of building on a stale base.
#
# Why: worktrees have twice been handed a base (f660ed75) older than the integration
# branch HEAD at dispatch time. The second time the merge was safe only because the one
# touched file happened to be identical across the two bases — luck, not design.
#
# Usage (from inside the lane's worktree):
#   bash scripts/check-lane-base.sh <expected-head-sha>
#
# NEGATIVE SPACE (§18d — stated bounds): this guard runs at LANE runtime, not in CI —
# it protects only lanes whose brief (a) includes the dispatch-time SHA and (b) orders
# this script as the first action. It cannot catch a lane that skips it, and it does
# not validate anything about the brief's content beyond the base commit.

set -euo pipefail

EXPECTED="${1:-}"
if [ -z "$EXPECTED" ]; then
  echo "check-lane-base: FAIL — no expected SHA given. The dispatch brief must carry the"
  echo "dispatch-time HEAD SHA. HARD STOP: report to the integrator; do not build."
  exit 2
fi

ACTUAL="$(git rev-parse HEAD)"
case "$ACTUAL" in
  "$EXPECTED"*)
    echo "check-lane-base: OK — worktree based at expected dispatch-time HEAD $ACTUAL."
    ;;
  *)
    echo "check-lane-base: FAIL — worktree base $ACTUAL != expected $EXPECTED."
    echo "This worktree was branched from a stale base. HARD STOP: report the two SHAs to"
    echo "the integrator and do not build. Do NOT fetch/rebase yourself."
    exit 1
    ;;
esac
