#!/usr/bin/env bash
# Traveloure smoke test runner — batched to avoid resource exhaustion
# Usage: ./playwright/run-smoke.sh [--bail] [--reporter=line]
# Exit code: 0 = all pass, 1 = any failure

set -euo pipefail

REPORTER="${REPORTER:-line}"
TIMEOUT="${TIMEOUT:-60000}"
BAIL=""
BAIL_ON_FAILURE=false

for arg in "$@"; do
  case $arg in
    --bail) BAIL_ON_FAILURE=true ;;
    --reporter=*) REPORTER="${arg#*=}" ;;
    --timeout=*) TIMEOUT="${arg#*=}" ;;
  esac
done

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TESTS="$DIR/tests/smoke"

PASS=0
FAIL=0
FAIL_SUITES=()

run_batch() {
  local batch_name="$1"
  shift
  local specs=("$@")

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Batch: $batch_name (${#specs[@]} suites)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  local batch_args=()
  for spec in "${specs[@]}"; do
    batch_args+=("$TESTS/$spec")
  done

  if npx playwright test "${batch_args[@]}" \
      --reporter="$REPORTER" \
      --timeout="$TIMEOUT" 2>&1; then
    PASS=$((PASS + ${#specs[@]}))
    echo "  ✅ Batch $batch_name passed"
  else
    local exit_code=$?
    FAIL=$((FAIL + ${#specs[@]}))
    for spec in "${specs[@]}"; do
      FAIL_SUITES+=("$spec")
    done
    echo "  ❌ Batch $batch_name FAILED (exit $exit_code)"
    if [ "$BAIL_ON_FAILURE" = true ]; then
      echo ""
      echo "Bailing early (--bail flag set)."
      print_summary
      exit 1
    fi
  fi
}

print_summary() {
  local total=$((PASS + FAIL))
  echo ""
  echo "══════════════════════════════════════════════════════════"
  echo "  SMOKE TEST SUMMARY"
  echo "══════════════════════════════════════════════════════════"
  echo "  Total suites : $total"
  echo "  Passed       : $PASS  ✅"
  echo "  Failed       : $FAIL  $([ $FAIL -gt 0 ] && echo '❌' || echo '')"
  if [ ${#FAIL_SUITES[@]} -gt 0 ]; then
    echo ""
    echo "  Failed suites:"
    for s in "${FAIL_SUITES[@]}"; do
      echo "    ❌ $s"
    done
  fi
  echo "══════════════════════════════════════════════════════════"
}

START_TIME=$(date +%s)
echo ""
echo "🧪 Traveloure Smoke Tests — $(date '+%Y-%m-%d %H:%M:%S')"
echo "   Reporter : $REPORTER"
echo "   Timeout  : ${TIMEOUT}ms per test"
echo ""

# ── Batch 1 ── Admin & Affiliate ──────────────────────────────
run_batch "01-admin-affiliate" \
  admin-analytics.spec.ts \
  admin-dashboard.spec.ts \
  admin.spec.ts \
  affiliate-analytics.spec.ts

# ── Batch 2 ── AI ─────────────────────────────────────────────
run_batch "02-ai" \
  ai-grok.spec.ts \
  ai-itinerary.spec.ts

# ── Batch 3 ── Core Auth & Booking ────────────────────────────
run_batch "03-auth-booking" \
  api-health.spec.ts \
  auth.spec.ts \
  booking.spec.ts \
  cart-checkout.spec.ts

# ── Batch 4 ── Catalog & Content ──────────────────────────────
run_batch "04-catalog-content" \
  catalog-integrations.spec.ts \
  content-types.spec.ts \
  coordination-hub.spec.ts \
  credits.spec.ts

# ── Batch 5 ── Dashboards & Expert ────────────────────────────
run_batch "05-dashboards-expert" \
  dashboards.spec.ts \
  expert-chat.spec.ts \
  expert-dashboard.spec.ts \
  expert.spec.ts

# ── Batch 6 ── Expert Templates & Intelligence ────────────────
run_batch "06-expert-intelligence" \
  expert-templates.spec.ts \
  intelligence-pulse.spec.ts \
  itinerary.spec.ts \
  misc-platform.spec.ts

# ── Batch 7 ── Platform Health & Provider ─────────────────────
run_batch "07-platform-provider" \
  platform-health.spec.ts \
  provider-dashboard.spec.ts \
  provider-services.spec.ts \
  provider.spec.ts

# ── Batch 8 ── Bookings & Payments ────────────────────────────
run_batch "08-bookings-payments" \
  service-bookings.spec.ts \
  stripe-payouts.spec.ts \
  transport.spec.ts

# ── Batch 9 ── Trips & Users ──────────────────────────────────
run_batch "09-trips-users" \
  trip-budget-group.spec.ts \
  trips-itinerary.spec.ts \
  trips-plancard.spec.ts \
  user-features.spec.ts \
  user.spec.ts \
  wallet-profile.spec.ts

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

print_summary
echo "  Duration     : ${ELAPSED}s"
echo ""

[ $FAIL -eq 0 ]
