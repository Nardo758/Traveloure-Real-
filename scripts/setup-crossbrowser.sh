#!/usr/bin/env bash
# Idempotent provisioning for the cross-browser Playwright matrix (playwright.crossbrowser.config.ts).
# Re-run after a Nixpkgs rebuild or `npx playwright install webkit`.
#
# What it does:
#  1. Resolves the glib-networking GIO module dir dynamically (no pinned store hash)
#     and records it in .cache/crossbrowser-env.json for the config to read.
#  2. Verifies/repairs the x86-64 helper libs in .cache/pw-extra-libs.
#  3. Copies those libs into the WebKit bundle's minibrowser-wpe/sys/lib (the MiniBrowser
#     wrapper overwrites LD_LIBRARY_PATH, so they must live inside the bundle).
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p .cache/pw-extra-libs

fail=0

# ── 1. glib-networking (WebKit TLS backend) ──────────────────────────────────
GIO_DIR="${GLIB_NETWORKING_GIO_MODULES:-}"
if [ -z "$GIO_DIR" ] || [ ! -f "$GIO_DIR/libgiognutls.so" ]; then
  # Reuse the previously recorded path if still valid, else rediscover in the store.
  GIO_DIR=$(node -e "try{const p=require('./.cache/crossbrowser-env.json').gioModules;require('fs').existsSync(p+'/libgiognutls.so')&&console.log(p)}catch{}" 2>/dev/null || true)
fi
if [ -z "$GIO_DIR" ]; then
  echo "[setup] discovering glib-networking in /nix/store (may take a minute)..."
  for n in $(ls /nix/store 2>/dev/null | grep 'glib-networking'); do
    d="/nix/store/$n"
    if [ -f "$d/lib/gio/modules/libgiognutls.so" ]; then GIO_DIR="$d/lib/gio/modules"; break; fi
  done
fi
if [ -z "$GIO_DIR" ]; then
  echo "[setup] ERROR: glib-networking not found. Install the 'glib-networking' Nix package first." >&2
  fail=1
else
  node -e "require('fs').writeFileSync('.cache/crossbrowser-env.json', JSON.stringify({gioModules: process.argv[1]}, null, 2))" "$GIO_DIR"
  echo "[setup] glib-networking GIO modules: $GIO_DIR"
fi

# ── 2. helper libs (must be x86-64; the store also carries 32-bit copies) ────
REQUIRED_LIBS="libatomic.so.1 libstdc++.so.6 libGLESv2.so.2 libharfbuzz-icu.so.0 libjpeg.so.8 libx264.so"
STORE_LIST="" # cached single listing of /nix/store (listing it repeatedly is slow)
find_lib() { # $1 = lib filename → prints a 64-bit source path or nothing
  [ -n "$STORE_LIST" ] || STORE_LIST=$(ls /nix/store 2>/dev/null)
  for n in $(echo "$STORE_LIST" | grep -E 'gcc.*lib|libglvnd|harfbuzz|libjpeg|x264'); do
    p="/nix/store/$n/lib/$1"
    if [ -e "$p" ] && file -L "$p" 2>/dev/null | grep -q 'ELF 64-bit'; then echo "$p"; return; fi
  done
}
for lib in $REQUIRED_LIBS; do
  tgt=".cache/pw-extra-libs/$lib"
  if [ -e "$tgt" ] && file -L "$tgt" 2>/dev/null | grep -q 'ELF 64-bit'; then
    continue # healthy
  fi
  echo "[setup] repairing $lib ..."
  src=$(find_lib "$lib")
  if [ -n "$src" ]; then ln -sf "$src" "$tgt"; echo "[setup]   -> $src"
  else echo "[setup] ERROR: no 64-bit $lib found in /nix/store; install its Nix package." >&2; fail=1; fi
done

# ── 3. copy into the WebKit bundle (wrapper clobbers LD_LIBRARY_PATH) ────────
WK_SYS=$(ls -d .cache/ms-playwright/webkit-*/minibrowser-wpe/sys/lib 2>/dev/null | head -1)
if [ -n "$WK_SYS" ]; then
  cp -Lf .cache/pw-extra-libs/* "$WK_SYS"/ 2>/dev/null && echo "[setup] copied helper libs into $WK_SYS"
else
  echo "[setup] NOTE: no webkit bundle found (run: PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 npx playwright install webkit), then re-run this script."
fi

[ "$fail" -eq 0 ] && echo "[setup] OK" || echo "[setup] finished with errors" >&2
exit $fail
