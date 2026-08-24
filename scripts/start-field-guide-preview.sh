#!/usr/bin/env bash

# Run the preserved Traveloure backend behind the recovered Field Guide Vite
# frontend. The frontend remains the only public preview on port 5000.
set -euo pipefail

backend_pid=""

if ! (echo > /dev/tcp/127.0.0.1/8080) >/dev/null 2>&1; then
  PORT=8080 npm run dev &
  backend_pid=$!
fi

cleanup() {
  if [[ -n "$backend_pid" ]]; then
    kill "$backend_pid" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

for _ in $(seq 1 80); do
  if (echo > /dev/tcp/127.0.0.1/8080) >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

if ! (echo > /dev/tcp/127.0.0.1/8080) >/dev/null 2>&1; then
  echo "Traveloure backend did not open port 8080." >&2
  exit 1
fi

PORT=5000 BASE_PATH=/ npm --prefix artifacts/traveloure run dev