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

# Stop any server bound to $PORT so it releases its DB connections.
pgrep -f "^node dist/index.cjs" | xargs -r kill 2>/dev/null || true
sleep 1

echo "[reset-db] dropping + recreating database '$DB_NAME'"
PGPASSWORD="${PGPASSWORD:-postgres}" psql -h "${PGHOST:-localhost}" -U "${PGUSER:-postgres}" -d postgres -v ON_ERROR_STOP=1 <<SQL
DROP DATABASE IF EXISTS "$DB_NAME" WITH (FORCE);
CREATE DATABASE "$DB_NAME";
SQL

echo "[reset-db] booting server once to run migrations"
DATABASE_URL="$DATABASE_URL" NODE_ENV=production PORT="$PORT" \
  SESSION_SECRET="${SESSION_SECRET:-e2e-reset-secret}" \
  STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-sk_test_ci_stub_no_real_calls}" \
  node dist/index.cjs &
SERVER_PID=$!

echo "[reset-db] waiting for /api/ready (pid $SERVER_PID)"
ready=0
for i in $(seq 1 60); do
  if curl -sf "http://localhost:$PORT/api/ready" | grep -q '"ready":true'; then
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

echo "[reset-db] seeding CI test users"
DATABASE_URL="$DATABASE_URL" npx tsx scripts/seed-ci-test-users.ts

echo "[reset-db] done"
