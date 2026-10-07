/**
 * The routing engine's adapter choice (step 9a, ledger `2026-10-07-step9a-routing-engine`). The engine
 * switch is `TRAVEL_TIME_SERVICE_ENABLED` (R-bq/R299): off ⇒ null, and no routed leg is computed
 * anywhere. On, the CI stub answers where `ROUTING_ADAPTER_STUB=1` (ruling 11), else Google Routes
 * through the R299 gate (whose own per-caller switches, key and caps still apply).
 */
import type { RoutingAdapter } from "@shared/routing-engine";
import { travelTimeServiceEnabled } from "../../config/travel-time.config";
import { GoogleRoutingAdapter } from "./google-routing-adapter";
import { StubRoutingAdapter, routingStubEnabled } from "./stub-routing-adapter";

let google: GoogleRoutingAdapter | null = null;
let stub: StubRoutingAdapter | null = null;

export function routingAdapter(): RoutingAdapter | null {
  if (!travelTimeServiceEnabled()) return null;
  if (routingStubEnabled()) return (stub ??= new StubRoutingAdapter());
  return (google ??= new GoogleRoutingAdapter());
}
