#!/usr/bin/env bash
# WebKit (Safari-engine) smoke check launcher.
# Sets the NixOS env WebKit needs (see .agents/memory/webkit-testing-setup.md),
# then runs scripts/webkit-smoke.mjs. Requires the app serving on port 5000.
set -euo pipefail
cd "$(dirname "$0")/.."

LDPATH_FILE="scripts/webkit-ldpath.txt"
if [ ! -f "$LDPATH_FILE" ]; then
  echo "ERROR: $LDPATH_FILE missing — see .agents/memory/webkit-testing-setup.md to regenerate." >&2
  exit 1
fi

# glib-networking GIO module dir (TLS). Without it, js.stripe.com silently fails to load.
GIO_DIR="$(ls -d /nix/store/*-glib-networking-*/lib/gio/modules 2>/dev/null | head -1 || true)"
if [ -z "$GIO_DIR" ]; then
  echo "ERROR: no glib-networking in /nix/store — install system dependency 'glib-networking'." >&2
  exit 1
fi

# Private empty gst plugin dir (avoids libsoup2/3 clash; not a shared /tmp path)
GST_DIR="$(mktemp -d)"
trap 'rm -rf "$GST_DIR"' EXIT

export LD_LIBRARY_PATH="$(cat "$LDPATH_FILE")"
export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1
export GST_PLUGIN_SYSTEM_PATH_1_0="$GST_DIR"
export GST_REGISTRY_1_0="$GST_DIR/registry.bin"
export LIBGL_ALWAYS_SOFTWARE=1
export GIO_EXTRA_MODULES="$GIO_DIR"
export SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt

exec node scripts/webkit-smoke.mjs
