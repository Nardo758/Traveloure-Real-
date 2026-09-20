#!/usr/bin/env bash
#
# post-internal-jobs.test.sh — proves the cold-start warm-up + bounded retry logic in
# scripts/ci/post-internal-jobs.sh against a tiny local stub server
# (scripts/ci/post-internal-jobs-stub-server.cjs, node http built-ins, no deps), never against
# production and never waiting out the real 5s/10s/20s backoff (the timings below are overridden
# to sub-second so this test suite runs fast).
#
# Ledger 2026-09-20-jobs-cron-cold-start-retry. Wired into scheduler-jobs-gate.yml.
#
# Five cases, matching the lane's own spec:
#   T1 — 404 twice then 200 JSON {ok:true}        ⇒ exit 0, with exactly two "retrying in" lines.
#   T2 — 404 forever                                ⇒ exit 1 (a truly dead route still reads red —
#                                                      L3 is preserved: the retry budget cannot be
#                                                      outlasted).
#   T3 — 401                                        ⇒ exit 1 immediately, with NO retry line (a
#                                                      wrong secret is never transient).
#   T4 — 500                                        ⇒ exit 1 immediately, with NO retry line (the
#                                                      job ran and failed; retrying risks a double
#                                                      run).
#   T5 — readiness never reports ready:true          ⇒ exit 1, naming the readiness path, and NO
#                                                      route is ever attempted.
#
# Exit: 0 if all five cases pass, 1 otherwise.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/scripts/ci/post-internal-jobs.sh"
STUB="$ROOT/scripts/ci/post-internal-jobs-stub-server.cjs"

if ! command -v node >/dev/null 2>&1; then
  echo "::error title=node missing::node is required to run the stub server for this test." >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "::error title=jq missing::jq is required by post-internal-jobs.sh itself." >&2
  exit 1
fi

pass=0
fail=0
STUB_PID=""

start_stub() {
  # $1: STUB_READY_MODE, $2: STUB_ROUTE_SEQUENCE
  local log
  log="$(mktemp)"
  STUB_READY_MODE="$1" STUB_ROUTE_SEQUENCE="$2" node "$STUB" >"$log" 2>&1 &
  STUB_PID=$!
  local waited=0
  while [[ ! -s "$log" ]]; do
    sleep 0.1
    waited=$((waited + 1))
    if (( waited > 50 )); then
      echo "stub server never printed a port (see $log)" >&2
      cat "$log" >&2
      kill "$STUB_PID" 2>/dev/null || true
      rm -f "$log"
      return 1
    fi
  done
  STUB_PORT="$(head -n1 "$log" | tr -d '[:space:]')"
  rm -f "$log"
}

stop_stub() {
  if [[ -n "$STUB_PID" ]]; then
    kill "$STUB_PID" 2>/dev/null || true
    wait "$STUB_PID" 2>/dev/null || true
    STUB_PID=""
  fi
}
trap stop_stub EXIT

check() {
  local name="$1" ok="$2"
  if [[ "$ok" == "1" ]]; then
    echo "[PASS] $name"
    pass=$((pass + 1))
  else
    echo "[FAIL] $name"
    fail=$((fail + 1))
  fi
}

# Runs post-internal-jobs.sh with fast test timings against the currently-running stub, capturing
# stdout+stderr into RUN_OUT and the exit code into RUN_EXIT.
run_script() {
  RUN_OUT="$(mktemp)"
  BASE_URL="http://127.0.0.1:$STUB_PORT" \
  ROUTES="fake-route" \
  INTERNAL_JOB_SECRET="test-secret" \
  READY_PATH="/api/ready" \
  WARMUP_MAX_SECONDS="2" \
  WARMUP_POLL_SECONDS="0.2" \
  POST_RETRIES="3" \
  POST_RETRY_BACKOFF_SECONDS="0.1 0.1 0.1" \
    bash "$SCRIPT" >"$RUN_OUT" 2>&1
  RUN_EXIT=$?
}

echo "== T1: 404, 404, 200 -> exit 0, two retries =="
start_stub "ok" "404,404,200"
run_script
stop_stub
t1_ok=0
if [[ "$RUN_EXIT" -eq 0 ]] && [[ "$(grep -c 'retrying in' "$RUN_OUT")" -eq 2 ]]; then
  t1_ok=1
fi
check "T1: 404,404,200 -> exit 0, two retries logged" "$t1_ok"
sed 's/^/    T1> /' "$RUN_OUT"
rm -f "$RUN_OUT"

echo "== T2: 404 forever -> exit 1 =="
start_stub "ok" "404"
run_script
stop_stub
t2_ok=0
if [[ "$RUN_EXIT" -eq 1 ]] && grep -q 'still failing after' "$RUN_OUT"; then
  t2_ok=1
fi
check "T2: 404 forever -> exit 1 (dead route still reads red)" "$t2_ok"
sed 's/^/    T2> /' "$RUN_OUT"
rm -f "$RUN_OUT"

echo "== T3: 401 -> exit 1, no retry =="
start_stub "ok" "401"
run_script
stop_stub
t3_ok=0
if [[ "$RUN_EXIT" -eq 1 ]] && ! grep -q 'retrying in' "$RUN_OUT"; then
  t3_ok=1
fi
check "T3: 401 -> exit 1, no retry" "$t3_ok"
sed 's/^/    T3> /' "$RUN_OUT"
rm -f "$RUN_OUT"

echo "== T4: 500 -> exit 1, no retry =="
start_stub "ok" "500"
run_script
stop_stub
t4_ok=0
if [[ "$RUN_EXIT" -eq 1 ]] && ! grep -q 'retrying in' "$RUN_OUT"; then
  t4_ok=1
fi
check "T4: 500 -> exit 1, no retry" "$t4_ok"
sed 's/^/    T4> /' "$RUN_OUT"
rm -f "$RUN_OUT"

echo "== T5: readiness never ready:true -> exit 1, names the readiness path, no route attempted =="
start_stub "never" "200"
run_script
stop_stub
t5_ok=0
if [[ "$RUN_EXIT" -eq 1 ]] && grep -q '/api/ready' "$RUN_OUT" && ! grep -q '\[fake-route\]' "$RUN_OUT"; then
  t5_ok=1
fi
check "T5: readiness never ready:true -> exit 1, names /api/ready, no route attempted" "$t5_ok"
sed 's/^/    T5> /' "$RUN_OUT"
rm -f "$RUN_OUT"

echo
echo "post-internal-jobs.test.sh: $pass passed, $fail failed"
exit $(( fail > 0 ? 1 : 0 ))
