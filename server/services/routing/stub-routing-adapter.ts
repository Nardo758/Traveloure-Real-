/**
 * The CI stand-in for Google Routes (step 9a ruling 11, ledger `2026-10-07-step9a-routing-engine`).
 * ON only where `ROUTING_ADAPTER_STUB=1` (the kyoto-slice job), on the `E2E_AI_STUB` pattern. It makes
 * no network call and no Maps gate call, answers deterministically from the straight line at the ONE
 * speeds table (so a test can predict it), names a line and a fare on transit legs so the full LegRow
 * line is exercised, and stamps provenance `stub` — never "Google". It passes the same contract test.
 */
import { haversineMeters } from "@shared/geo";
import { straightLineMinutes } from "@shared/travel-speeds";
import type { RouteOutcome, RoutePoint, RoutingAdapter, RoutingMode } from "@shared/routing-engine";

export const STUB_ROUTES_SOURCE = "stub";

export function routingStubEnabled(): boolean {
  return process.env.ROUTING_ADAPTER_STUB === "1";
}

export class StubRoutingAdapter implements RoutingAdapter {
  readonly source = STUB_ROUTES_SOURCE;
  /** Calls made, for tests (the reuse and changed-legs gates count these). */
  calls = 0;
  constructor(private readonly opts: { now?: () => Date; paused?: boolean; noRoute?: boolean } = {}) {}

  async route(origin: RoutePoint, destination: RoutePoint, mode: RoutingMode, _departAt: Date | null): Promise<RouteOutcome> {
    if (this.opts.paused) return { kind: "paused" };
    this.calls++;
    if (this.opts.noRoute) return { kind: "no_route" };
    const meters = haversineMeters(origin.lat, origin.lng, destination.lat, destination.lng);
    return {
      kind: "ok",
      route: {
        durationMin: straightLineMinutes(meters, mode),
        distanceM: Math.round(meters),
        line: mode === "transit" ? "Stub Line" : null,
        fare: mode === "transit" ? { amount: 220, currency: "JPY" } : null,
        provenance: { source: STUB_ROUTES_SOURCE, checkedAt: (this.opts.now?.() ?? new Date()).toISOString() },
      },
    };
  }
}
