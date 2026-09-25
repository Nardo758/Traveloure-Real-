#!/usr/bin/env bash
# reset-db.sh — drop + recreate the e2e database, boot the built server once
# to run migrations, wait for health, stop it, then seed CI test users.
#
# Requires: DATABASE_URL pointing at the target DB (default matches
# $P2/server.env: postgresql://postgres:postgres@localhost:5432/traveloure),
# and dist/index.cjs already built (npm run build).
#
# IMPORTANT: a running dev server holds DB connections that block the DROP —
# stop it before calling this script (see teardown.sh, which does both).
set -euo pipefail

DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/traveloure}"
DB_NAME="${DB_NAME:-traveloure}"
PORT="${PORT:-5000}"

echo "[reset-db] target: $DATABASE_URL"

# ── Staleness guard (harness deliverable, lead-mandated) ────────────────────────────────────
# Found live: dist/index.cjs was built from a checkout BEFORE f018f2fe2 (the RC-11 fix), #1093
# (planning tolls / fee_ledger) and #1095 had landed on this branch — every e2e run against it
# silently tested pre-fix code, and a real fix (RC-11) read back as a fresh regression. Refuse
# to reset/boot against a bundle older than HEAD's own commit; this is the one place every run
# in this harness passes through, so it is the one place that can catch it for good.
DIST_FILE="dist/index.cjs"
if [ -z "${ALLOW_STALE_DIST:-}" ]; then
  if [ ! -f "$DIST_FILE" ]; then
    echo "[reset-db] ERROR: $DIST_FILE does not exist — run 'npm run build' first." >&2
    exit 1
  fi
  DIST_MTIME=$(date -r "$DIST_FILE" +%s 2>/dev/null || stat -c %Y "$DIST_FILE" 2>/dev/null || echo 0)
  HEAD_SHA=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
  HEAD_CTIME=$(git log -1 --format=%ct HEAD 2>/dev/null || echo "")
  if [ -n "$HEAD_CTIME" ] && [ "$DIST_MTIME" -lt "$HEAD_CTIME" ]; then
    echo "[reset-db] ERROR: $DIST_FILE (mtime $(date -u -d "@$DIST_MTIME" '+%Y-%m-%d %H:%M:%S UTC' 2>/dev/null || date -u -r "$DIST_MTIME" '+%Y-%m-%d %H:%M:%S UTC')) is OLDER than HEAD's own commit" >&2
    echo "         ($HEAD_SHA, $(date -u -d "@$HEAD_CTIME" '+%Y-%m-%d %H:%M:%S UTC' 2>/dev/null || date -u -r "$HEAD_CTIME" '+%Y-%m-%d %H:%M:%S UTC'))." >&2
    echo "         Run 'npm run build' before reset-db.sh, or set ALLOW_STALE_DIST=1 to override deliberately." >&2
    exit 1
  fi
  echo "[reset-db] dist freshness OK (mtime $DIST_MTIME >= HEAD commit time $HEAD_CTIME, HEAD=$HEAD_SHA)"
else
  echo "[reset-db] ALLOW_STALE_DIST=1 — staleness guard skipped by explicit override"
fi

# Stop any server bound to $PORT so it releases its DB connections.
pgrep -f "^node dist/index.cjs" | xargs -r kill 2>/dev/null || true
sleep 1

echo "[reset-db] dropping + recreating database '$DB_NAME'"
PGPASSWORD="${PGPASSWORD:-postgres}" psql -h "${PGHOST:-localhost}" -U "${PGUSER:-postgres}" -d postgres -v ON_ERROR_STOP=1 <<SQL
DROP DATABASE IF EXISTS "$DB_NAME" WITH (FORCE);
CREATE DATABASE "$DB_NAME";
SQL

echo "[reset-db] booting server once to run migrations"
# ALLOW_TEST_ACCOUNTS=1 is the documented CI escape hatch (server/validate-env.ts) —
# it boots the production bundle (NODE_ENV=production) against a throwaway DB with a
# sk_test_ stub key without the prod-strict Stripe-key guard refusing to start. Every
# *-gate.yml CI workflow that boots dist/index.cjs this way sets it; this script must
# match, since reset-db.sh boots the same production bundle for the same reason.
DATABASE_URL="$DATABASE_URL" NODE_ENV=production PORT="$PORT" \
  SESSION_SECRET="${SESSION_SECRET:-e2e-reset-secret}" \
  STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-sk_test_ci_stub_no_real_calls}" \
  ALLOW_TEST_ACCOUNTS="${ALLOW_TEST_ACCOUNTS:-1}" \
  node dist/index.cjs &
SERVER_PID=$!

echo "[reset-db] waiting for /api/ready (pid $SERVER_PID)"
ready=0
for i in $(seq 1 60); do
  # NOT -sf: /api/ready can return HTTP 503 while its body already says
  # "ready":true (e.g. a harmless missing-webhook-secret sub-check still
  # reports overall status:"fail") — `-f` would suppress that body on any
  # non-2xx and the loop would spin for the full timeout despite the server
  # actually being ready. Read the body regardless of status code.
  if curl -s "http://localhost:$PORT/api/ready" | grep -q '"ready":true'; then
    ready=1
    echo "[reset-db] server ready"
    break
  fi
  sleep 5
done

if [ "$ready" -ne 1 ]; then
  echo "[reset-db] ERROR: server did not become ready" >&2
  kill "$SERVER_PID" 2>/dev/null || true
  exit 1
fi

echo "[reset-db] stopping migration-boot server"
kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true
sleep 1

# connect-pg-simple 10.0.0's own table.sql uses WITH (OIDS=FALSE), incompatible with
# Postgres 12+ — the app relies on this table existing already rather than creating it
# itself (see .github/actions/ci-db-setup/action.yml, the same step, which this script
# must stay in sync with). Missing it does NOT fail migrations or boot — it fails the
# FIRST session write, i.e. every login, with a silent 500 long after this script exits.
echo "[reset-db] creating sessions table (connect-pg-simple workaround)"
DATABASE_URL="$DATABASE_URL" npx tsx scripts/create-sessions-table.ts

echo "[reset-db] seeding CI test users"
DATABASE_URL="$DATABASE_URL" npx tsx scripts/seed-ci-test-users.ts

echo "[reset-db] done"
