#!/bin/bash
set -e
npm install
# npm install above runs inside the Replit workspace (invoked by the
# .replit [postMerge] hook) and resolves through Replit's package-firewall
# proxy, baking unreachable package-firewall.replit.local URLs into the
# lockfile — the root cause of the CI-wide npm ci crashes. Scrub them
# immediately so the pollution never survives a merge. URL-only rewrite.
node scripts/scrub-lockfile.cjs
npx tsx scripts/run-migrations.ts
