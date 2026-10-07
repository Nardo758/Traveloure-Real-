/**
 * THE ROUTING ENGINE — the pure contract (step 9a, ledger `2026-10-07-step9a-routing-engine`; surface
 * spec §14.1 R-ar/R-at; step 9 brief L1, L2 as amended by ruling 4, L4 as ruled by ruling 9, L6).
 *
 * One interface, `RoutingAdapter`, answers one leg: origin → destination in one mode at one departure.
 * Google Routes is the first implementation (`server/services/routing/google-routing-adapter.ts`); a
 * stub stands in for it in CI. Both pass ONE contract test (`server/__tests__/routing-adapter-contract.test.ts`).
 *
 * WHAT A ROUTE IS — and the whole of what the cache may hold (decision-maker, Oct 7, 2026): duration,
 * distance, line name, fare and provenance. NEVER a polyline and NEVER step-by-step directions —
 * `toRouteCacheEntry` is an allowlist projection, so a field an adapter adds later is dropped rather
 * than stored by default. Google's terms on route geometry are why the geometry is never kept
 * (`routes.service.ts` `getRoutePathForMode`).
 *
 * Fares (L6): only when the source returns one, in the source's currency — never converted, never
 * estimated. Minutes are in-plan only (R-h): nothing here is read by a public surface.
 *
 * No I/O here.
 */
import { haversineMeters } from "./geo";
import { metersPerMinute, type LegMode } from "./travel-speeds";

export type RoutingMode = LegMode;

export interface RoutePoint {
  lat: number;
  lng: number;
  /** The Google place ID when one is known (an unexpired Places fact); else null. */
  placeId?: string | null;
}

export interface RouteFare {
  /** In the source's own currency units (220 for ¥220). */
  amount: number;
  /** ISO 4217, as the source gave it. */
  currency: string;
}

export interface RouteProvenance {
  /** Who answered: "google_routes" | "stub". */
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

/** `paused` = the caller's daily cap is reached (step 9a ruling 8); `no_route` = the source had no answer. */
export type RouteOutcome = { kind: "ok"; route: RouteAnswer } | { kind: "no_route" } | { kind: "paused" };

export interface RoutingAdapter {
  /** The provenance `source` this adapter stamps. */
  readonly source: string;
  route(origin: RoutePoint, destination: RoutePoint, mode: RoutingMode, departAt: Date | null): Promise<RouteOutcome>;
}

/** The ONLY fields a cache row carries (decision-maker, Oct 7, 2026). */
export const ROUTE_CACHE_FIELDS = ["durationMin", "distanceM", "line", "fare", "provenance"] as const;

/** Allowlist projection: whatever an adapter returned, only the five facts survive. */
export function toRouteCacheEntry(route: RouteAnswer): RouteAnswer {
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

// ── The cache key (L2, amended by step 9a ruling 4) ─────────────────────────────────────────────

/** A stop's key: its place ID when known, else its coordinate rounded to 4 decimals. Mixed keys are fine. */
export function routePointKey(p: RoutePoint): string {
  const id = typeof p.placeId === "string" ? p.placeId.trim() : "";
  if (id) return `place:${id}`;
  return `pt:${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
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

export function routeCacheKey(origin: RoutePoint, destination: RoutePoint, mode: RoutingMode, hourBucket: number | null): string {
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

// ── The one line a routed leg reads (spec §3 LegRow; L6) ────────────────────────────────────────

const MODE_WORD: Readonly<Record<RoutingMode, string>> = { walk: "walk", cycle: "cycle", transit: "transit", drive: "drive" };
const SOURCE_LABEL: Readonly<Record<string, string>> = { google_routes: "Google", stub: "Test routes" };

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
