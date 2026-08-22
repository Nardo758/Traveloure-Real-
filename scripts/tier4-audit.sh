#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TARGET="${TIER4_BASE_URL:-${BASE_URL:-http://127.0.0.1:5000}}"
TARGET_HOST="$(
  node -e '
    try {
      process.stdout.write(new URL(process.argv[1]).hostname);
    } catch {
      process.exit(2);
    }
  ' "$TARGET"
)" || {
  echo "Tier 4 audit refused: TIER4_BASE_URL is not a valid URL." >&2
  exit 2
}

case "$TARGET_HOST" in
  localhost|127.0.0.1)
    ;;
  *)
    echo "Tier 4 audit refused: this launcher only runs against localhost/127.0.0.1." >&2
    echo "Received host: $TARGET_HOST" >&2
    exit 2
    ;;
esac

# Keep the Playwright config and shared helpers on the exact same guarded target.
export TIER4_BASE_URL="$TARGET"
export BASE_URL="$TARGET"

if [[ $# -eq 0 ]]; then
  set -- npx playwright test --config playwright/tier4/playwright.config.ts
fi

printf -v AUDIT_COMMAND '%q ' "$@"
exec nix-shell scripts/tier4-browser-shell.nix --run "$AUDIT_COMMAND"