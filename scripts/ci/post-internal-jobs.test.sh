#!/usr/bin/env bash
#
# post-internal-jobs.test.sh — proves the cold-start warm-up + bounded retry logic AND the
# due-bucket logic in scripts/ci/post-internal-jobs.sh against a tiny local stub server
# (scripts/ci/post-internal-jobs-stub-server.cjs, node http built-ins, no deps), never against
# production and never waiting out the real 5s/10s/20s backoff (the timings below are overridden
# to sub-second so this test suite runs fast), and never waiting for the real wall clock to reach a
# fixed hour (NOW_UTC injects a fake one).
#
# Ledger 2026-09-20-jobs-cron-cold-start-retry (T1-T5) and
# 2026-09-20-jobs-trigger-replit-scheduled (T6-T10). Wired into scheduler-jobs-gate.yml.
#
# Ten cases, matching the lanes' own specs:
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
#   T6 — NOW_UTC=09:00Z, --due                      ⇒ backstops+hourly+daily posted, in that order
#                                                      (hour 9 satisfies ONLY the daily rule —
#                                                      neither four- nor six-hourly's mod conditions
#                                                      hold at hour 9 — see the script's DUE RULES).
#   T7 — NOW_UTC=03:15Z, --due                      ⇒ backstops+hourly ONLY (hour 3 satisfies none
#                                                      of the four-/six-hourly/daily conditions).
#   T8 — NOW_UTC=04:00Z, --due                      ⇒ backstops+hourly+four-hourly (hour 4 % 4 == 0).
#   T9 — NOW_UTC=06:00Z, --due                      ⇒ backstops+hourly+six-hourly (hour 6 % 6 == 0).
#   T10 — FORCE_BUCKET=daily, --due                 ⇒ daily ONLY, ignoring NOW_UTC/the due
#                                                      computation entirely (the workflow_dispatch
#                                                      shape).
# T6-T9 each assert the EXACT route set posted to the stub, IN ORDER (BUCKET_ORDER's order,
# 200-on-first-attempt so no route appears twice).
#
# Exit: 0 if all ten cases pass, 1 otherwise.
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

# Runs post-internal-jobs.sh in --due mode (T6-T10) against the currently-running stub (every route
# it asks about answers 200 on the first attempt — STUB_ROUTE_SEQUENCE="200" — so the warm-up +
# retry lane above is exercised separately and stays out of the due-bucket assertions here).
# $1: NOW_UTC value (may be empty — the script then falls back to the real wall clock, which T10
#     relies on since FORCE_BUCKET overrides it regardless of the time).
# $2: FORCE_BUCKET value (may be empty).
run_due_script() {
  RUN_OUT="$(mktemp)"
  BASE_URL="http://127.0.0.1:$STUB_PORT" \
  INTERNAL_JOB_SECRET="test-secret" \
  READY_PATH="/api/ready" \
  WARMUP_MAX_SECONDS="2" \
  WARMUP_POLL_SECONDS="0.2" \
  POST_RETRIES="3" \
  POST_RETRY_BACKOFF_SECONDS="0.1 0.1 0.1" \
  NOW_UTC="$1" \
  FORCE_BUCKET="$2" \
    bash "$SCRIPT" --due >"$RUN_OUT" 2>&1
  RUN_EXIT=$?
}

# Extracts the sequence of routes that actually got a passing "[route] HTTP 200 ..." line, in the
# order they were posted, space-joined. Every route in T6-T10 answers 200 on its first attempt (see
# run_due_script's comment above), so this is exactly the ROUTES list the script computed and
# posted — the thing under test.
posted_routes() {
  grep -oE '^\[[a-z0-9-]+\] HTTP 200' "$1" | sed -E 's/^\[//; s/\] HTTP 200$//' | tr '\n' ' ' | sed -E 's/ $//'
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

echo "== T6: NOW_UTC=09:00Z, --due -> backstops+hourly+daily, in order =="
start_stub "ok" "200"
run_due_script "2026-09-20T09:00:00Z" ""
stop_stub
t6_ok=0
t6_expected="checkout-sweep itinerary-generation-sweep email-outbox earnings-release booking-auto-completion score-neighborhood-claims stripe-reconciliation availability-materialization"
if [[ "$RUN_EXIT" -eq 0 ]] && [[ "$(posted_routes "$RUN_OUT")" == "$t6_expected" ]]; then
  t6_ok=1
fi
check "T6: 09:00Z -> backstops+hourly+daily posted, in order (not four-/six-hourly: 9%4!=0, 9%6!=0)" "$t6_ok"
sed 's/^/    T6> /' "$RUN_OUT"
rm -f "$RUN_OUT"

echo "== T7: NOW_UTC=03:15Z, --due -> backstops+hourly only =="
start_stub "ok" "200"
run_due_script "2026-09-20T03:15:00Z" ""
stop_stub
t7_ok=0
t7_expected="checkout-sweep itinerary-generation-sweep email-outbox earnings-release booking-auto-completion score-neighborhood-claims"
if [[ "$RUN_EXIT" -eq 0 ]] && [[ "$(posted_routes "$RUN_OUT")" == "$t7_expected" ]]; then
  t7_ok=1
fi
check "T7: 03:15Z -> backstops+hourly only posted, in order" "$t7_ok"
sed 's/^/    T7> /' "$RUN_OUT"
rm -f "$RUN_OUT"

echo "== T8: NOW_UTC=04:00Z, --due -> backstops+hourly+four-hourly =="
start_stub "ok" "200"
run_due_script "2026-09-20T04:00:00Z" ""
stop_stub
t8_ok=0
t8_expected="checkout-sweep itinerary-generation-sweep email-outbox earnings-release booking-auto-completion score-neighborhood-claims booking-expiry"
if [[ "$RUN_EXIT" -eq 0 ]] && [[ "$(posted_routes "$RUN_OUT")" == "$t8_expected" ]]; then
  t8_ok=1
fi
check "T8: 04:00Z -> backstops+hourly+four-hourly posted, in order (hour%4==0)" "$t8_ok"
sed 's/^/    T8> /' "$RUN_OUT"
rm -f "$RUN_OUT"

echo "== T9: NOW_UTC=06:00Z, --due -> backstops+hourly+six-hourly =="
start_stub "ok" "200"
run_due_script "2026-09-20T06:00:00Z" ""
stop_stub
t9_ok=0
t9_expected="checkout-sweep itinerary-generation-sweep email-outbox earnings-release booking-auto-completion score-neighborhood-claims travelpayouts-report-poll"
if [[ "$RUN_EXIT" -eq 0 ]] && [[ "$(posted_routes "$RUN_OUT")" == "$t9_expected" ]]; then
  t9_ok=1
fi
check "T9: 06:00Z -> backstops+hourly+six-hourly posted, in order (hour%6==0)" "$t9_ok"
sed 's/^/    T9> /' "$RUN_OUT"
rm -f "$RUN_OUT"

echo "== T10: FORCE_BUCKET=daily, --due -> daily only, NOW_UTC/due computation ignored =="
start_stub "ok" "200"
run_due_script "2026-09-20T03:15:00Z" "daily"
stop_stub
t10_ok=0
t10_expected="stripe-reconciliation availability-materialization"
if [[ "$RUN_EXIT" -eq 0 ]] && [[ "$(posted_routes "$RUN_OUT")" == "$t10_expected" ]] && grep -q 'Forced bucket: daily' "$RUN_OUT"; then
  t10_ok=1
fi
check "T10: FORCE_BUCKET=daily -> daily only posted, due computation bypassed" "$t10_ok"
sed 's/^/    T10> /' "$RUN_OUT"
rm -f "$RUN_OUT"

echo
echo "post-internal-jobs.test.sh: $pass passed, $fail failed"
exit $(( fail > 0 ? 1 : 0 ))
