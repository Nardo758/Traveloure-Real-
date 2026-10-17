/**
 * The routing engine's adapter choice (step 9a, ledger `2026-10-07-step9a-routing-engine`). The engine
 * switch is `TRAVEL_TIME_SERVICE_ENABLED` (R-bq/R299): off ⇒ null, and no routed leg is computed
 * anywhere. On, the CI stub answers where `ROUTING_ADAPTER_STUB=1` (ruling 11); else self-hosted OSRM
 * where `OSRM_ENABLED=1` and `OSRM_BASE_URL` are set (9b spec T2, ledger `2026-10-16-9b-a-osrm-adapter` —
 * drive and walk only; transit and cycle answer no route); else NULL.
 *
 * 9b-b (ledger `2026-10-16-9b-b-legs-off-google`; 9b spec T1, Phase 0 ruling 2): every caller of this
 * function STORES what it is answered — engine legs, Optimize version legs, leg options — so Google Routes is
 * never returned here: a Google duration or distance is never stored. Without OSRM a routed plan gets no new
 * routed leg (it shows straight-line "est." legs, P0 ruling 4); its existing legs stay on screen until the
 * 9b-b rebuild and the deletion PR (T3). Live, unstored Google calls (leg-route-path, live directions) do not
 * come through here and are unchanged.
 */
import type { RoutingAdapter } from "@shared/routing-engine";
import { travelTimeServiceEnabled } from "../../config/travel-time.config";
import { StubRoutingAdapter, routingStubEnabled } from "./stub-routing-adapter";
import { OsrmRoutingAdapter } from "./osrm-routing-adapter";
import { osrmEnabled } from "../../config/osrm.config";

let stub: StubRoutingAdapter | null = null;
let osrm: OsrmRoutingAdapter | null = null;

export function routingAdapter(): RoutingAdapter | null {
  if (!travelTimeServiceEnabled()) return null;
  if (routingStubEnabled()) return (stub ??= new StubRoutingAdapter());
  if (osrmEnabled()) return (osrm ??= new OsrmRoutingAdapter());
  return null;
}
