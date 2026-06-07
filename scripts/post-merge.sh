#!/bin/bash
set -e
npm install
npx tsx scripts/run-migrations.ts
