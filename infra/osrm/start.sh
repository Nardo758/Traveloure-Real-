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

osrm-routed --algorithm mld --mmap --ip 127.0.0.1 --port "$OSRM_DRIVING_PORT" --max-viaroute-size 3 "$DATA/driving/kyoto.osrm" &
osrm-routed --algorithm mld --mmap --ip 127.0.0.1 --port "$OSRM_FOOT_PORT" --max-viaroute-size 3 "$DATA/foot/kyoto.osrm" &

# Warm each profile with one loopback route before the proxy takes traffic: the first request after a start
# pages the mmapped graph in (the driving graph is ~1.2 GB) and would otherwise time out the first caller.
# Node's fetch, not curl (the VM image is not assumed to carry curl). Each profile gets a 15 s ceiling,
# retrying while osrm-routed is still coming up; a profile that does not answer is logged and skipped —
# the warm-up never stops the VM (a cold first request is slow, not wrong).
warm() {
  local port="$1" profile="$2"
  node -e '
    const [port, profile] = process.argv.slice(1);
    const url = `http://127.0.0.1:${port}/route/v1/${profile}/135.778519,35.003674;135.785046,34.994856?overview=false&steps=false&alternatives=false`;
    const deadline = Date.now() + 15000;
    (async () => {
      let last = "no attempt";
      while (Date.now() < deadline) {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) });
          if (res.ok) { await res.arrayBuffer(); console.log(`warm: ${profile}`); return; }
          last = `HTTP ${res.status}`;
        } catch (err) {
          last = err?.name === "TimeoutError" ? "timeout" : (err?.cause?.code ?? err?.message ?? String(err));
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      console.error(`warm: ${profile} did not answer within 15 s (${last}) — continuing`);
    })();
  ' "$port" "$profile" || echo "warm: ${profile} check could not run — continuing" >&2
}
warm "$OSRM_DRIVING_PORT" driving
warm "$OSRM_FOOT_PORT" foot

node proxy.mjs &

wait -n
echo "a process exited — stopping so the deployment restarts" >&2
exit 1
