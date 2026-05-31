#!/bin/bash
set -e
npm install
echo "No" | npx drizzle-kit push 2>/dev/null || true
