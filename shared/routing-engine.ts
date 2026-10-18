/**
 * THE ROUTING ENGINE — the pure contract (step 9a, ledger `2026-10-07-step9a-routing-engine`; surface
 * spec §14.1 R-ar/R-at; step 9 brief L1, L2 as amended by ruling 4, L4 as ruled by ruling 9, L6).
 *
 * One interface, `RoutingAdapter`, answers one leg: origin → destination in one mode at one departure.
 * Google Routes is the first implementation (`server/services/routing/google-routing-adapter.ts`); a
 * stub stands in for it in CI. Both pass ONE contract test (`server/__tests__/routing-adapter-contract.test.ts`).
 *
 * WHAT A ROUTE IS (decision-maker, Oct 7, 2026): duration, distance, line name, fare and provenance.
 * NEVER a polyline and NEVER step-by-step directions — `toRouteFacts` is an allowlist projection, so a
 * field an adapter adds later is dropped rather than kept by default.
 *
 * WHAT MAY BE CACHED (decision-maker, Oct 7, 2026, on #1325 — Google Maps Platform service terms of
 * June 10, 2026: Routes content may be cached only as place IDs and lat/lng; durations and distances
 * have no grant): a GOOGLE result is NEVER written to a cache. It lives only on the plan's own
 * `transport_legs` rows, with its provenance. Within one run, de-duplication is in memory
 * (`RouteRunMemo`). The ONE boundary a future cache writer must pass is `cacheableRouteEntry`, which
 * refuses every source not in `CACHEABLE_ROUTE_SOURCES` (the self-hosted OSRM adapter joins it in 9a-ii).
 *
 * Fares (L6): only when the source returns one, in the source's currency — never converted, never
 * estimated. Minutes are in-plan only (R-h): nothing here is read by a public surface.
 *
 * No I/O here.
 */
import { haversineMeters } from "./geo";
import { metersPerMinute, type LegMode } from "./travel-speeds";
import { isOpenCoordOrigin, type CoordOrigin } from "./open-coords";

export type RoutingMode = LegMode;

export interface RoutePoint {
  lat: number;
  lng: number;
  /** The Google place ID when one is known (an unexpired Places fact); else null. */
  placeId?: string | null;
  /**
   * LG-1: where the coordinate came from (`shared/open-coords.ts`). The OSRM adapter routes only between
   * `isOpenCoordOrigin` points; an untagged point is treated as Google.
   */
  coordOrigin?: CoordOrigin | null;
}

export interface RouteFare {
  /** In the source's own currency units (220 for ¥220). */
  amount: number;
  /** ISO 4217, as the source gave it. */
  currency: string;
}

export interface RouteProvenance {
  /** Who answered: "google_routes" | "osrm" | "stub". */
  source: string;
  /** ISO instant the source answered. A cache hit keeps the ORIGINAL instant, never "now". */
  checkedAt: string;
}

/** A routed leg — the five facts the cache may hold. */
export interface RouteAnswer {
  durationMin: number;
  distanceM: number;
  /** A transit line name ("Keihan Main Line"), else null. */
  line: string | null;
  fare: RouteFare | null;
  provenance: RouteProvenance;
}

/**
 * `paused` = the caller's daily cap is reached (step 9a ruling 8); `no_route` = the source had no answer.
 * 9b-d: a `no_route` MAY say the question went unanswered — `unsupported_mode` (the source does not serve
 * that mode, e.g. OSRM and transit) or `failed` (the call itself failed: timeout, non-200, unreadable body).
 * Without `unanswered` it is the source's own answer: there is no route. A re-check reads an unanswered
 * `no_route` as "learned nothing" and keeps the leg's last label (§13); every other caller is unchanged.
 * LG-1: `coords_not_open` — the OSRM adapter was handed a point that is not an open coordinate
 * (`shared/open-coords.ts`) and asked nothing.
 */
export type RouteUnanswered = "unsupported_mode" | "failed" | "coords_not_open";

/**
 * 9b-d (Leon's ruling, Oct 17, 2026): the `source` an ENGINE row carries when the router's own answer was
 * "no route" — the pair shows a labelled straight-line estimate instead of nothing. It is NOT a routed leg:
 * `routedFactsOf` and `legIsRouted` both answer no for it, so every surface reads it as "est.". It is outside
 * `CACHEABLE_ROUTE_SOURCES`, so the next engine run asks the pair again (a route found later replaces it).
 */
export const STRAIGHT_LINE_EST_SOURCE = "straight_line_est";
export type RouteOutcome = { kind: "ok"; route: RouteAnswer } | { kind: "no_route"; unanswered?: RouteUnanswered } | { kind: "paused" };

export interface RoutingAdapter {
  /** The provenance `source` this adapter stamps. */
  readonly source: string;
  route(origin: RoutePoint, destination: RoutePoint, mode: RoutingMode, departAt: Date | null): Promise<RouteOutcome>;
  /**
   * LG-1: may this adapter be given this point at all? Absent ⇒ every point. The OSRM adapter answers true only
   * for an open origin; the engine treats a refused stop as unlocated for routing (no routed leg in or out).
   */
  acceptsPoint?(p: RoutePoint): boolean;
}

/** The ONLY fields a route carries anywhere it is kept (decision-maker, Oct 7, 2026). */
export const ROUTE_FACT_FIELDS = ["durationMin", "distanceM", "line", "fare", "provenance"] as const;

/**
 * The self-hosted OSRM adapter's provenance `source` (9b spec v1.0 T2, ledger `2026-10-16-9b-a-osrm-adapter`).
 * Its stored minutes read "© OpenStreetMap contributors · checked <date>".
 */
export const OSRM_ROUTES_SOURCE = "osrm";

/**
 * Sources whose answers MAY be written to a persistent cache. Google is not one and never will be under
 * the current terms (9b spec T1). The stub is (test data, no terms); OSRM is (self-hosted, OSM data).
 */
export const CACHEABLE_ROUTE_SOURCES: ReadonlySet<string> = new Set(["stub", OSRM_ROUTES_SOURCE]);

/** THE cache boundary: the projected facts when the source may be cached, else null. */
export function cacheableRouteEntry(route: RouteAnswer): RouteAnswer | null {
  return CACHEABLE_ROUTE_SOURCES.has(route.provenance.source) ? toRouteFacts(route) : null;
}

/** Allowlist projection: whatever an adapter returned, only the five facts survive. */
export function toRouteFacts(route: RouteAnswer): RouteAnswer {
  const fare =
    route.fare && Number.isFinite(route.fare.amount) && typeof route.fare.currency === "string" && route.fare.currency
      ? { amount: route.fare.amount, currency: route.fare.currency }
      : null;
  return {
    durationMin: Math.max(1, Math.round(route.durationMin)),
    distanceM: Math.max(0, Math.round(route.distanceM)),
    line: typeof route.line === "string" && route.line.trim() ? route.line.trim() : null,
    fare,
    provenance: { source: String(route.provenance.source), checkedAt: String(route.provenance.checkedAt) },
  };
}

// ── The leg key (L2, amended by step 9a ruling 4) — the in-run memo's key and the pair diff's ────

/**
 * A stop's key: its place ID when known, else its coordinate rounded to 4 decimals. Mixed keys are fine.
 * LG-1: a point from an open source carries its origin (`place:<id>~osm`), so a leg computed between Google points
 * for the same place never matches one computed between open points — the pair diff recomputes it. A Google or
 * untagged point keeps the key it always had.
 */
export function routePointKey(p: RoutePoint): string {
  const id = typeof p.placeId === "string" ? p.placeId.trim() : "";
  const suffix = isOpenCoordOrigin(p.coordOrigin) ? `~${p.coordOrigin}` : "";
  if (id) return `place:${id}${suffix}`;
  return `pt:${p.lat.toFixed(4)},${p.lng.toFixed(4)}${suffix}`;
}

/**
 * The hour bucket: the LOCAL hour of departure (0–23) read from the plan's own wall clock "HH:MM"
 * (LD 30 keeps times as wall-clock strings). No departure time ⇒ null, its own bucket — never a
 * guessed hour.
 */
export function routeHourBucket(wallClock: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(wallClock ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  return h >= 0 && h <= 23 ? h : null;
}

export function routeLegKey(origin: RoutePoint, destination: RoutePoint, mode: RoutingMode, hourBucket: number | null): string {
  return `${routePointKey(origin)}|${routePointKey(destination)}|${mode}|${hourBucket == null ? "h-" : `h${hourBucket}`}`;
}

// ── The default mode per leg (L4, as ruled by step 9a ruling 9) ─────────────────────────────────

/** Walk at or under this straight-line distance (1,200 m — the A8 walk threshold, one speeds table). */
export const ROUTED_WALK_MAX_METERS = 15 * metersPerMinute("walk");

/** Profile mode names that mean rail, bus or transit (ruling 9). */
const TRANSIT_COVERAGE_MODES = new Set(["transit", "train", "rail", "tram", "metro", "subway", "light_rail", "bus"]);

/** Does the market's transport profile list an available rail, bus or transit mode? */
export function marketHasTransitCoverage(modes: ReadonlyArray<{ mode: string; available?: boolean }> | null | undefined): boolean {
  return (modes ?? []).some((m) => m.available !== false && TRANSIT_COVERAGE_MODES.has(String(m.mode).toLowerCase()));
}

/** Walk when ≤ 1.2 km straight line; else transit where the market has coverage; else drive. */
export function defaultRoutedMode(origin: RoutePoint, destination: RoutePoint, hasTransitCoverage: boolean): RoutingMode {
  const meters = haversineMeters(origin.lat, origin.lng, destination.lat, destination.lng);
  if (meters <= ROUTED_WALK_MAX_METERS) return "walk";
  return hasTransitCoverage ? "transit" : "drive";
}

/**
 * P0 legs ruling 2 (ledger `2026-10-10-p0-legs-baseline`): a default-transit leg Google answers with no
 * route is asked ONCE as a drive, and the row says so — `alternative_modes[0].reason` carries this marker
 * and the leg line reads `NO_TRANSIT_DRIVE_NOTE`. Transit and drive both without a route ⇒ no leg (E8).
 */
export const TRANSIT_UNAVAILABLE_REASON = "transit_unavailable";
export const NO_TRANSIT_DRIVE_NOTE = "No transit found — drive shown";

/**
 * P0-b item 8: a market whose profile carries `apiTransitCoverage: false` (Kyoto — Google's Routes API has
 * no transit coverage in Japan) is never asked transit; its default-transit legs are asked as a drive and
 * labelled with this reason — distinct from `transit_unavailable`, which is a transit ask that came back
 * empty. The line it reads is ruled wording.
 */
export const TRANSIT_API_UNCOVERED_REASON = "transit_api_uncovered";
export const TRANSIT_API_UNCOVERED_NOTE = "Taxi/drive time shown — train and bus times aren't available here yet.";

/**
 * The ONE reading of a market's transit routing (§18 rule 1): `hasTransitCoverage` feeds
 * `defaultRoutedMode`; `transitApiUncovered` says a drive leg there stands in for transit the API cannot
 * answer. A market with no rail/bus mode at all is neither — it drives because it has no transit.
 */
export function marketTransitRouting(profile: {
  availableModes?: ReadonlyArray<{ mode: string; available?: boolean }> | null;
  apiTransitCoverage?: boolean;
} | null | undefined): { hasTransitCoverage: boolean; transitApiUncovered: boolean } {
  const rail = marketHasTransitCoverage(profile?.availableModes);
  const uncovered = rail && profile?.apiTransitCoverage === false;
  return { hasTransitCoverage: rail && !uncovered, transitApiUncovered: uncovered };
}

/**
 * The `alternative_modes[0].reason` a routed leg is written with: the transit-fallback marker, else the
 * API-uncovered marker for an unpicked drive in an uncovered market, else the route's own source.
 */
export function routedLegReason(input: {
  transitUnavailable: boolean;
  transitApiUncovered: boolean;
  mode: RoutingMode;
  picked: boolean;
  source: string;
}): string {
  if (input.transitUnavailable) return TRANSIT_UNAVAILABLE_REASON;
  if (input.transitApiUncovered && input.mode === "drive" && !input.picked) return TRANSIT_API_UNCOVERED_REASON;
  return input.source;
}

/**
 * P0 legs ruling 3: a leg with no time of day departs at this LOCAL wall clock on its trip day — never
 * server-now. The hour bucket is unchanged ("no time ⇒ its own bucket"); only the departure time sent
 * moves, so route keys stay as they were.
 */
export const DEFAULT_LEG_DEPARTURE_WALL_CLOCK = "10:00";

// ── The one line a routed leg reads (spec §3 LegRow; L6) ────────────────────────────────────────

const MODE_WORD: Readonly<Record<RoutingMode, string>> = { walk: "walk", cycle: "cycle", transit: "transit", drive: "drive" };
// 9b T2: OSRM's answers are OpenStreetMap data — the ODbL attribution IS the label.
const SOURCE_LABEL: Readonly<Record<string, string>> = { google_routes: "Google", osrm: "© OpenStreetMap contributors", stub: "Test routes" };

/** "¥220" in the source's currency, never converted. Null when there is no fare. */
export function routeFareLabel(fare: RouteFare | null | undefined): string | null {
  if (!fare || !Number.isFinite(fare.amount) || !fare.currency) return null;
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: fare.currency, currencyDisplay: "narrowSymbol" }).format(fare.amount);
  } catch {
    return `${fare.amount} ${fare.currency}`;
  }
}

/** "Google · checked 7 Oct" — the date read in the plan's zone when it has one. */
export function routeProvenanceLabel(p: RouteProvenance | null | undefined, timeZone?: string | null): string | null {
  if (!p || !p.checkedAt) return null;
  const at = new Date(p.checkedAt);
  if (Number.isNaN(at.getTime())) return null;
  let day: string;
  try {
    day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", ...(timeZone ? { timeZone } : { timeZone: "UTC" }) }).format(at);
  } catch {
    day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(at);
  }
  return `${SOURCE_LABEL[p.source] ?? p.source} · checked ${day}`;
}

/** "24 min · Keihan Main Line · ¥220 · Google · checked 4 Oct" / "18 min · walk · Google · checked 4 Oct". */
export function routedLegLine(input: { mode: RoutingMode; route: RouteAnswer }, timeZone?: string | null): string {
  const r = input.route;
  const parts = [`${Math.max(1, Math.round(r.durationMin))} min`, r.line ?? MODE_WORD[input.mode]];
  const fare = routeFareLabel(r.fare);
  if (fare) parts.push(fare);
  const prov = routeProvenanceLabel(r.provenance, timeZone);
  if (prov) parts.push(prov);
  return parts.join(" · ");
}
