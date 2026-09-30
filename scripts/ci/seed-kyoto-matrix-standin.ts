/**
 * seed-kyoto-matrix-standin.ts — the kyoto-slice job's ONE stand-in for the Google Routes API
 * (ledger `2026-09-29-matrix-daily`; R216 follow-up).
 *
 * The compare view's "no est. on a located pair" test (§3 A4) runs only where a Kyoto matrix refresh
 * has completed. Production's first refresh is confirmed (operator, Sep 29, 2026: run 1b261a5a, 128
 * elements, 64/64, outcome ok); the kyoto-slice job's database is built from empty and CI never calls
 * Google, so this script completes one refresh there through the REAL writer (`refreshMarketMatrix`)
 * with its injectable fetch replaced by a deterministic stand-in — the same seam the DB suite
 * (M1–M8) uses, and the posture `E2E_AI_STUB` takes for the draft model.
 *
 * WHAT IT PROVES AND WHAT IT DOES NOT (§18d): the batching, the UPSERT, the refresh row and every
 * read after it are real code; the minutes are NOT Google's — they are straight-line distance at a
 * fixed speed per mode. So a green §3 A4 test proves the compare view reads the matrix when one
 * exists, never what a real matrix says about Kyoto.
 *
 * Refuses any database that is not local (house disposable-DB guard) — it must never write a
 * stand-in matrix where a real one could be read by a traveler.
 *
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure \
 *     npx tsx scripts/ci/seed-kyoto-matrix-standin.ts
 */

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);
let host = "";
try {
  host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
} catch {
  /* unparseable ⇒ refused below */
}
if (!DISPOSABLE_HOSTS.has(host)) {
  console.error(`[matrix-standin] REFUSING: DATABASE_URL host '${host}' is not a local disposable database.`);
  process.exit(1);
}

const { refreshMarketMatrix } = await import("../../server/services/travel-time-matrix.service");
type Element = import("../../server/services/travel-time-matrix.service").RouteMatrixElement;
const { pool } = await import("../../server/db");

/** Stand-in speeds (km/h). Not Google's; stated above. Transit adds a fixed wait. */
const SPEED_KMH: Record<string, number> = { WALK: 4.8, TRANSIT: 18 };
const TRANSIT_WAIT_S = 6 * 60;

function metersBetween(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function standInFetch(body: any): Promise<Element[]> {
  const mode = String(body.travelMode);
  const speed = (SPEED_KMH[mode] ?? SPEED_KMH.WALK) * (1000 / 3600);
  const at = (w: any) => w.waypoint.location.latLng;
  const out: Element[] = [];
  body.origins.forEach((o: any, oi: number) =>
    body.destinations.forEach((d: any, di: number) => {
      const meters = Math.round(metersBetween(at(o), at(d)));
      const seconds = Math.round(meters / speed) + (mode === "TRANSIT" && oi !== di ? TRANSIT_WAIT_S : 0);
      out.push({ originIndex: oi, destinationIndex: di, duration: `${seconds}s`, distanceMeters: meters, condition: "ROUTE_EXISTS" });
    }),
  );
  return out;
}

try {
  const outcome: any = await refreshMarketMatrix({ marketSlug: "kyoto", force: true, fetchMatrix: standInFetch });
  console.log(`[matrix-standin] ${JSON.stringify(outcome)}`);
  if (outcome?.status !== "complete") {
    console.error("[matrix-standin] the stand-in refresh did not complete — §3 A4 would stay a fixme.");
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
