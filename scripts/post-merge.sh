#!/bin/bash
set -e
npm install
npx drizzle-kit push --force 2>/dev/null || true
