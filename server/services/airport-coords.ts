/**
 * AN AIRPORT'S POINT COMES FROM ITS IATA CODE, AND ONLY FROM ITS CODE (step 9b FU-9A-2 — ledger
 * `2026-10-07-step9b-optimizer-and-rechecks`; architect's ruling: "stamp anchor coordinates only when the
 * location is a real IATA code from iata-airports.json; a typed airport name stays without coordinates
 * and keeps the fixed buffer. Never guess.").
 *
 * The table is the vendored, platform-owned `server/data/iata-airports.json` (OurAirports-derived, the
 * same file the location-cache seed reads) — no network, no Places call, no fuzzy match. A location is
 * a code only when it is EXACTLY three upper-case letters that the table holds; "Kansai airport",
 * "kix" and "KIX T1" are not codes and get no point (§13).
 *
 * `flightAnchorPoint` is the ONE writer-side rule: the storage writer calls it on every flight anchor it
 * creates or updates, and any client-sent latitude/longitude on a flight anchor is replaced by its
 * answer — the point is server-derived, never client-trusted (§14 posture).
 */
import airports from "../data/iata-airports.json";

const FLIGHT_ANCHOR_TYPES = new Set(["flight_arrival", "flight_departure"]);

let byCode: Map<string, { lat: number; lng: number }> | null = null;
function table(): Map<string, { lat: number; lng: number }> {
  if (!byCode) {
    byCode = new Map();
    for (const a of airports as Array<{ iata: string; lat: number | null; lon: number | null }>) {
      if (a.iata && Number.isFinite(a.lat) && Number.isFinite(a.lon)) byCode.set(a.iata, { lat: a.lat as number, lng: a.lon as number });
    }
  }
  return byCode;
}

/** The airport's point for an exact IATA code the table holds; null for anything else. */
export function airportPointForCode(location: string | null | undefined): { lat: number; lng: number } | null {
  const code = typeof location === "string" ? location.trim() : "";
  if (!/^[A-Z]{3}$/.test(code)) return null;
  return table().get(code) ?? null;
}

export function isFlightAnchorType(anchorType: string | null | undefined): boolean {
  return FLIGHT_ANCHOR_TYPES.has(String(anchorType ?? ""));
}

/**
 * The latitude/longitude a FLIGHT anchor carries, as the decimal strings the columns hold — from its
 * code, else both NULL. Non-flight anchors are not this rule's business: returns undefined.
 */
export function flightAnchorPoint(anchorType: string | null | undefined, location: string | null | undefined): { latitude: string | null; longitude: string | null } | undefined {
  if (!isFlightAnchorType(anchorType)) return undefined;
  const p = airportPointForCode(location);
  return p ? { latitude: String(p.lat), longitude: String(p.lng) } : { latitude: null, longitude: null };
}
