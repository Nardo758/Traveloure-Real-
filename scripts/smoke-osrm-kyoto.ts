/**
 * 9b-a smoke — ONE real Kyoto leg through the self-hosted OSRM (9b spec v1.0 §6 gate; ledger
 * `2026-10-16-9b-a-osrm-adapter`). Run once the Reserved VM is up (9a-ii operator steps):
 *
 *   OSRM_BASE_URL=<the VM's URL> npx tsx scripts/smoke-osrm-kyoto.ts
 *
 * Asks Gion (Yasaka Shrine) → Kiyomizu-dera by car and on foot through the SAME adapter the engine uses,
 * prints the minutes, metres and label, and exits non-zero unless both answer with a plausible route.
 * Read-only: no database, no plan, nothing stored. Prints no URL or credential beyond the base URL host.
 */
import { OsrmRoutingAdapter } from "../server/services/routing/osrm-routing-adapter";
import { osrmBaseUrl } from "../server/config/osrm.config";
import { routedLegLine, type RoutingMode } from "../shared/routing-engine";

const YASAKA = { lat: 35.003674, lng: 135.778519 };
const KIYOMIZU = { lat: 34.994856, lng: 135.785046 };
/** Straight line ≈ 1.2 km; a real route is longer, and well under 10 km either way. */
const PLAUSIBLE_M: [number, number] = [1000, 10000];

async function main(): Promise<void> {
  const base = osrmBaseUrl();
  if (!base) {
    console.error("OSRM_BASE_URL is not set — nothing to smoke.");
    process.exit(2);
  }
  console.log(`OSRM host: ${new URL(base).host}`);
  const adapter = new OsrmRoutingAdapter();
  let ok = true;
  for (const mode of ["drive", "walk"] as RoutingMode[]) {
    const out = await adapter.route(YASAKA, KIYOMIZU, mode, null);
    if (out.kind !== "ok") {
      console.error(`${mode}: ${out.kind}`);
      ok = false;
      continue;
    }
    const plausible = out.route.distanceM >= PLAUSIBLE_M[0] && out.route.distanceM <= PLAUSIBLE_M[1] && out.route.durationMin >= 1;
    console.log(`${mode}: ${routedLegLine({ mode, route: out.route }, "Asia/Tokyo")} · ${out.route.distanceM} m${plausible ? "" : "  ← IMPLAUSIBLE"}`);
    if (!plausible) ok = false;
  }
  process.exit(ok ? 0 : 1);
}

void main();
