#!/bin/bash
set -e

# Auto-resolve recurring conflict in migration-files.ts caused by a stale branch
# that keeps injecting 060/061 concierge entries. Always keep HEAD side (062-066).
# sed pass 1: drop the <<<<<<< HEAD marker line
# sed pass 2: drop everything from ======= through >>>>>>> <hash> (the "theirs" block)
if grep -q "^<<<<<<< " server/migrations/migration-files.ts 2>/dev/null; then
  echo "[post-merge] Stripping stale conflict markers from migration-files.ts"
  sed -i '/^<<<<<<< /d' server/migrations/migration-files.ts
  sed -i '/^=======/,/^>>>>>>> /d' server/migrations/migration-files.ts
fi

npm install
npx tsx scripts/run-migrations.ts
