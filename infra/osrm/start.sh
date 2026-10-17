#!/usr/bin/env bash
# The OSRM VM's run command (ledger `2026-10-17-9a-ii-osrm-vm`): two loopback-only osrm-routed processes
# (car, foot) behind proxy.mjs, the one public port. Serves data/ as built by build.sh in the workspace;
# builds nothing. If any of the three exits, this exits, and the deployment restarts the VM.
set -euo pipefail

cd "$(dirname "$0")"
DATA="${OSRM_DATA_DIR:-./data}"
: "${OSRM_PATH_PREFIX:?OSRM_PATH_PREFIX must be set in the deployment secrets}"
export OSRM_DRIVING_PORT="${OSRM_DRIVING_PORT:-5001}" OSRM_FOOT_PORT="${OSRM_FOOT_PORT:-5002}"

for p in driving foot; do
  [ -f "$DATA/$p/kyoto.osrm.mldgr" ] || { echo "no $p data in $DATA — run build.sh in the workspace first" >&2; exit 1; }
done
[ -f "$DATA/EXTRACT.txt" ] && sed -n 's/^osm_replication_timestamp=/OSM extract: /p' "$DATA/EXTRACT.txt"

osrm-routed --algorithm mld --ip 127.0.0.1 --port "$OSRM_DRIVING_PORT" --max-viaroute-size 2 "$DATA/driving/kyoto.osrm" &
osrm-routed --algorithm mld --ip 127.0.0.1 --port "$OSRM_FOOT_PORT" --max-viaroute-size 2 "$DATA/foot/kyoto.osrm" &
node proxy.mjs &

wait -n
echo "a process exited — stopping so the deployment restarts" >&2
exit 1
