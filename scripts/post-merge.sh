#!/bin/bash
set -euo pipefail

# Install exactly what the workspace lockfile specifies. The shared API runs
# its versioned SQL migrations during service startup; `drizzle-kit push`
# requires interactive conflict choices and cannot run in the closed-stdin
# post-merge environment.
pnpm install --frozen-lockfile
