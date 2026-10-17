#!/usr/bin/env bash
# Build the Kyoto OSRM data for the `driving` and `foot` profiles (ledger `2026-10-17-9a-ii-osrm-vm`).
#
# Run in the WORKSPACE (it needs more memory than the 2 GB VM), never on the VM. The VM only serves what
# this writes to ./data. Needs osrm-backend, osmium-tool and curl on PATH (Replit: replit.nix).
#
# Source: Geofabrik's Kansai extract (a permitted download; ODbL — the adapter's label carries the
# attribution). Driving covers Kyoto prefecture plus Osaka Bay/KIX for airport legs.
# Foot uses a separate Kyoto-city-only clip.
#
# Writes data/{driving,foot}/kyoto.osrm* and data/EXTRACT.txt (source URL, md5, OSM replication timestamp
# — the extract date that is the "checked <date>" on every leg — both bboxes, build time). The previous data/ is
# replaced only after both profiles build.
set -euo pipefail

cd "$(dirname "$0")"
SOURCE_URL="https://download.geofabrik.de/asia/japan/kansai-latest.osm.pbf"
# minlon,minlat,maxlon,maxlat — Kyoto prefecture (≈134.85–136.06 E, 34.70–35.78 N) + ~0.05° margin,
# south to 34.33 N for KIX (34.43 N, 135.23 E) and Osaka Bay.
BBOX="134.80,34.33,136.11,35.83"
FOOT_BBOX="135.55,34.85,135.90,35.15"
WORK="${OSRM_WORK_DIR:-./build}"
OUT="${OSRM_DATA_DIR:-./data}"

for bin in curl osmium osrm-extract osrm-partition osrm-customize md5sum; do
  command -v "$bin" >/dev/null || { echo "missing: $bin" >&2; exit 1; }
done
PROFILES="${OSRM_PROFILES_DIR:-$(dirname "$(readlink -f "$(command -v osrm-extract)")")/../share/osrm/profiles}"
[ -f "$PROFILES/car.lua" ] && [ -f "$PROFILES/foot.lua" ] || { echo "OSRM profiles not found in $PROFILES (set OSRM_PROFILES_DIR)" >&2; exit 1; }

mkdir -p "$WORK"
echo "== download $SOURCE_URL"
curl -fL --retry 3 -o "$WORK/kansai.osm.pbf" "$SOURCE_URL"
curl -fsSL --retry 3 -o "$WORK/kansai.osm.pbf.md5" "$SOURCE_URL.md5"
MD5="$(md5sum "$WORK/kansai.osm.pbf" | cut -d' ' -f1)"
grep -q "^$MD5" "$WORK/kansai.osm.pbf.md5" || { echo "md5 mismatch for $SOURCE_URL" >&2; exit 1; }
OSM_TS="$(osmium fileinfo -g header.option.osmosis_replication_timestamp "$WORK/kansai.osm.pbf")"
echo "   extract timestamp: $OSM_TS"

echo "== driving clip to $BBOX"
osmium extract --overwrite -b "$BBOX" -o "$WORK/driving.osm.pbf" "$WORK/kansai.osm.pbf"
echo "== foot clip to $FOOT_BBOX"
osmium extract --overwrite -b "$FOOT_BBOX" -o "$WORK/foot.osm.pbf" "$WORK/kansai.osm.pbf"

NEXT="$OUT.next"
rm -rf "$NEXT"
for pair in driving:car foot:foot; do
  name="${pair%%:*}"; lua="${pair##*:}"
  echo "== $name ($lua.lua)"
  mkdir -p "$WORK/$name" "$NEXT/$name"
  cp "$WORK/$name.osm.pbf" "$WORK/$name/kyoto.osm.pbf"
  osrm-extract -p "$PROFILES/$lua.lua" "$WORK/$name/kyoto.osm.pbf"
  osrm-partition "$WORK/$name/kyoto.osrm"
  osrm-customize "$WORK/$name/kyoto.osrm"
  find "$WORK/$name" -maxdepth 1 -name 'kyoto.osrm*' -exec mv {} "$NEXT/$name/" \;
done

cat > "$NEXT/EXTRACT.txt" <<EOF
source=$SOURCE_URL
md5=$MD5
osm_replication_timestamp=$OSM_TS
bbox=$BBOX
foot_bbox=$FOOT_BBOX
built_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
licence=ODbL 1.0 — © OpenStreetMap contributors
EOF

rm -rf "$OUT.prev"
[ -d "$OUT" ] && mv "$OUT" "$OUT.prev"
mv "$NEXT" "$OUT"
rm -rf "$OUT.prev"
echo "== done"; cat "$OUT/EXTRACT.txt"; du -sh "$OUT"/*
