#!/bin/bash
set -e
npm install
echo "" | npm run db:push -- --force 2>/dev/null || npx drizzle-kit push --force 2>/dev/null || true
