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
 */
import { OSRM_ROUTES_SOURCE, type RouteAnswer, type RouteOutcome, type RoutePoint, type RoutingAdapter, type RoutingMode } from "@shared/routing-engine";
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

  async route(origin: RoutePoint, destination: RoutePoint, mode: RoutingMode, _departAt: Date | null): Promise<RouteOutcome> {
    if (mode !== "drive" && mode !== "walk") return { kind: "no_route" };
    const base = this.deps.baseUrl();
    if (!base) return { kind: "no_route" };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.deps.timeoutMs());
    try {
      const response = await this.deps.fetch(osrmRouteUrl(base, this.deps.profile(mode), origin, destination), { signal: controller.signal });
      if (!response.ok) {
        console.error(`[routing] osrm ${mode} route failed: ${response.status}`);
        return { kind: "no_route" };
      }
      const route = parseOsrmResponse(await response.json(), this.deps.now());
      return route ? { kind: "ok", route } : { kind: "no_route" };
    } catch (err: any) {
      console.error(`[routing] osrm ${mode} route request threw:`, err?.name === "AbortError" ? "timeout" : err?.message ?? err);
      return { kind: "no_route" };
    } finally {
      clearTimeout(timer);
    }
  }
}
