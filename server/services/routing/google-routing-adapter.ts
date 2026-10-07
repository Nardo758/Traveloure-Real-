/**
 * The Google Routes implementation of `RoutingAdapter` (step 9a, ledger
 * `2026-10-07-step9a-routing-engine`; brief L1). Every call goes through the R299 gate BY NAME:
 * walk / cycle → `routes_mode`, transit → `routes_transit`, drive → `routes_drive`. A cap refusal is
 * `paused` (ruling 8) and makes no request; a failed request records cost 0 and is `no_route`
 * (ruling 7). The parse keeps only the five facts the cache may hold — no polyline, no steps.
 */
import type { RouteAnswer, RouteOutcome, RoutePoint, RoutingAdapter, RoutingMode } from "@shared/routing-engine";
import type { MapsCallerKey } from "@shared/maps-billing";
import { gatedMapsCall } from "../maps-billing/maps-billing.service";
import {
  ROUTED_BASIC_FIELD_MASK,
  ROUTED_TRANSIT_FIELD_MASK,
  drivingRouteBody,
  modeRouteBody,
  transitRouteBody,
} from "../maps-billing/maps-requests";

const ROUTES_API_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
export const GOOGLE_ROUTES_SOURCE = "google_routes";

type GateFn = <T>(
  key: MapsCallerKey,
  call: (apiKey: string) => Promise<{ value: T; units?: number; success?: boolean }>,
) => Promise<{ value: T } | { refused: string }>;

export interface GoogleRoutingDeps {
  fetch: typeof fetch;
  gate: GateFn;
  now: () => Date;
}

const defaultDeps: GoogleRoutingDeps = {
  fetch: (...args) => fetch(...args),
  gate: (key, call) => gatedMapsCall(key, call),
  now: () => new Date(),
};

export function callerForMode(mode: RoutingMode): MapsCallerKey {
  return mode === "transit" ? "routes_transit" : mode === "drive" ? "routes_drive" : "routes_mode";
}

function seconds(duration: unknown): number {
  const m = /^(\d+(?:\.\d+)?)s$/.exec(String(duration ?? ""));
  return m ? Number(m[1]) : 0;
}

/**
 * Pure parse of one Compute Routes response into a `RouteAnswer`, or null when there is no route.
 * Reads duration, distance, the transit line names in order (deduped) and the fare — nothing else.
 */
export function parseRoutesResponse(data: unknown, checkedAt: Date): RouteAnswer | null {
  const route = (data as any)?.routes?.[0];
  if (!route) return null;
  const secs = seconds(route.duration);
  const meters = Number(route.distanceMeters);
  if (!secs || !Number.isFinite(meters)) return null;
  const lines: string[] = [];
  for (const leg of Array.isArray(route.legs) ? route.legs : []) {
    for (const step of Array.isArray(leg?.steps) ? leg.steps : []) {
      const tl = step?.transitDetails?.transitLine;
      const name = String(tl?.name || tl?.nameShort || "").trim();
      if (name && lines[lines.length - 1] !== name) lines.push(name);
    }
  }
  const money = route.travelAdvisory?.transitFare;
  let fare: RouteAnswer["fare"] = null;
  if (money && typeof money.currencyCode === "string" && money.currencyCode) {
    const amount = Number(money.units ?? 0) + Number(money.nanos ?? 0) / 1e9;
    if (Number.isFinite(amount) && amount > 0) fare = { amount: Math.round(amount * 100) / 100, currency: money.currencyCode };
  }
  return {
    durationMin: Math.max(1, Math.ceil(secs / 60)),
    distanceM: Math.round(meters),
    line: lines.length ? lines.join(" → ") : null,
    fare,
    provenance: { source: GOOGLE_ROUTES_SOURCE, checkedAt: checkedAt.toISOString() },
  };
}

export class GoogleRoutingAdapter implements RoutingAdapter {
  readonly source = GOOGLE_ROUTES_SOURCE;
  constructor(private readonly deps: GoogleRoutingDeps = defaultDeps) {}

  async route(origin: RoutePoint, destination: RoutePoint, mode: RoutingMode, departAt: Date | null): Promise<RouteOutcome> {
    const o = { lat: origin.lat, lng: origin.lng };
    const d = { lat: destination.lat, lng: destination.lng };
    const body =
      mode === "transit"
        ? transitRouteBody(o, d, departAt, this.deps.now())
        : mode === "drive"
          ? drivingRouteBody({ origin: o, destination: d })
          : modeRouteBody(o, d, mode === "walk" ? "WALK" : "BICYCLE");
    const mask = mode === "transit" ? ROUTED_TRANSIT_FIELD_MASK : ROUTED_BASIC_FIELD_MASK;
    try {
      const out = await this.deps.gate(callerForMode(mode), async (apiKey) => {
        const response = await this.deps.fetch(ROUTES_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": mask },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          console.error(`[routing] ${mode} route failed: ${response.status}`);
          return { value: null as RouteAnswer | null, success: false };
        }
        return { value: parseRoutesResponse(await response.json(), this.deps.now()) };
      });
      if ("refused" in out) return out.refused === "paused" ? { kind: "paused" } : { kind: "no_route" };
      return out.value ? { kind: "ok", route: out.value } : { kind: "no_route" };
    } catch (err: any) {
      console.error(`[routing] ${mode} route request threw:`, err?.message ?? err);
      return { kind: "no_route" };
    }
  }
}
