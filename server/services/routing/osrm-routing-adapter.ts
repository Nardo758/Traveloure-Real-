/**
 * The self-hosted OSRM implementation of `RoutingAdapter` (9b spec v1.0 T2/9b-a, ledger
 * `2026-10-16-9b-a-osrm-adapter`). Drive and walk only: `drive` asks the car profile, `walk` the foot
 * profile. Transit and cycle have no OSRM source, so they answer `no_route` WITHOUT a request (the engine's
 * transit fallback then asks a drive, P0 ruling 2; a cycle pair stays a thin connector).
 *
 * A failed call — a non-200, OSRM's own `code` other than `Ok`, a timeout, an unreadable body — is
 * `no_route` (a thin connector, cost 0). OSRM is never capped, so it is never `paused`. The parse keeps
 * only minutes and metres; `overview=false` asks for no geometry and `steps=false` for no directions.
 * Its answers are cacheable (`CACHEABLE_ROUTE_SOURCES`), unlike Google's (T1).
 *
 * "checked <date>" is DATA freshness: the VM's proxy sends the OSM extract's replication timestamp as
 * `X-OSRM-Extract` on every 200, and that is the leg's `checkedAt`. Only when the header is absent or
 * unreadable does the label fall back to the moment of the call.
 *
 * LG-1 (ledger `2026-10-17-lg1-osm-place-coords`): it routes ONLY between open coordinates — an OSM point from
 * `open_place_coords` (linked to the item, migration 390), an admin row, a ride's OSM node or an IATA airport (`isOpenCoordOrigin`). A Google point
 * (an item's own coordinate, a Places fact) or an untagged one is refused before any request:
 * `no_route` / `coords_not_open`.
 */
import { OSRM_ROUTES_SOURCE, type RouteAnswer, type RouteOutcome, type RoutePoint, type RoutingAdapter, type RoutingMode } from "@shared/routing-engine";
import { isOpenCoordOrigin } from "@shared/open-coords";
import { osrmBaseUrl, osrmCarProfile, osrmFootProfile, osrmTimeoutMs } from "../../config/osrm.config";

export interface OsrmRoutingDeps {
  fetch: typeof fetch;
  now: () => Date;
  baseUrl: () => string | null;
  profile: (mode: "drive" | "walk") => string;
  timeoutMs: () => number;
}

const defaultDeps: OsrmRoutingDeps = {
  fetch: (...args) => fetch(...args),
  now: () => new Date(),
  baseUrl: osrmBaseUrl,
  profile: (mode) => (mode === "drive" ? osrmCarProfile() : osrmFootProfile()),
  timeoutMs: osrmTimeoutMs,
};

/** Pure: the route request URL. OSRM takes `lng,lat`. */
export function osrmRouteUrl(baseUrl: string, profile: string, origin: RoutePoint, destination: RoutePoint): string {
  const coord = (p: RoutePoint) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`;
  return `${baseUrl}/route/v1/${encodeURIComponent(profile)}/${coord(origin)};${coord(destination)}?overview=false&steps=false&alternatives=false`;
}

/** The response header the OSRM VM's proxy sets to the extract's OSM replication timestamp. */
export const OSRM_EXTRACT_HEADER = "x-osrm-extract";

/** Pure: the extract date the proxy stated, or the call time when it stated none (or nothing readable). */
export function osrmCheckedAt(extractHeader: string | null | undefined, callTime: Date): Date {
  const raw = (extractHeader ?? "").trim();
  if (!raw) return callTime;
  const at = new Date(raw);
  return Number.isNaN(at.getTime()) ? callTime : at;
}

/** Pure: OSRM's own answer that no route exists (`NoRoute`, or a point with no road/path near it). */
export function osrmSaysNoRoute(data: unknown): boolean {
  const code = (data as { code?: unknown } | null)?.code;
  return code === "NoRoute" || code === "NoSegment";
}

/** Pure parse of one OSRM `route` response into a `RouteAnswer`, or null when there is no usable route. */
export function parseOsrmResponse(data: unknown, checkedAt: Date): RouteAnswer | null {
  const body = data as { code?: unknown; routes?: Array<{ duration?: unknown; distance?: unknown }> } | null;
  if (!body || body.code !== "Ok") return null;
  const route = Array.isArray(body.routes) ? body.routes[0] : null;
  const secs = Number(route?.duration);
  const meters = Number(route?.distance);
  if (!Number.isFinite(secs) || secs <= 0 || !Number.isFinite(meters) || meters < 0) return null;
  return {
    durationMin: Math.max(1, Math.ceil(secs / 60)),
    distanceM: Math.round(meters),
    line: null,
    fare: null,
    provenance: { source: OSRM_ROUTES_SOURCE, checkedAt: checkedAt.toISOString() },
  };
}

export class OsrmRoutingAdapter implements RoutingAdapter {
  readonly source = OSRM_ROUTES_SOURCE;
  constructor(private readonly deps: OsrmRoutingDeps = defaultDeps) {}

  /** LG-1: only an open coordinate may be routed by OSRM. */
  acceptsPoint(p: RoutePoint): boolean {
    return isOpenCoordOrigin(p.coordOrigin);
  }

  async route(origin: RoutePoint, destination: RoutePoint, mode: RoutingMode, _departAt: Date | null): Promise<RouteOutcome> {
    if (!this.acceptsPoint(origin) || !this.acceptsPoint(destination)) return { kind: "no_route", unanswered: "coords_not_open" };
    if (mode !== "drive" && mode !== "walk") return { kind: "no_route", unanswered: "unsupported_mode" };
    const base = this.deps.baseUrl();
    if (!base) return { kind: "no_route", unanswered: "failed" };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.deps.timeoutMs());
    try {
      const response = await this.deps.fetch(osrmRouteUrl(base, this.deps.profile(mode), origin, destination), { signal: controller.signal });
      if (!response.ok) {
        console.error(`[routing] osrm ${mode} route failed: ${response.status}`);
        return { kind: "no_route", unanswered: "failed" };
      }
      const body = await response.json();
      const route = parseOsrmResponse(body, osrmCheckedAt(response.headers?.get?.(OSRM_EXTRACT_HEADER), this.deps.now()));
      if (route) return { kind: "ok", route };
      // OSRM's own "no route between these points" is an answer; any other non-Ok body is a failed call.
      return osrmSaysNoRoute(body) ? { kind: "no_route" } : { kind: "no_route", unanswered: "failed" };
    } catch (err: any) {
      console.error(`[routing] osrm ${mode} route request threw:`, err?.name === "AbortError" ? "timeout" : err?.message ?? err);
      return { kind: "no_route", unanswered: "failed" };
    } finally {
      clearTimeout(timer);
    }
  }
}
