/**
 * 9b-b — THE REBUILD OF GOOGLE-SOURCED ROUTE DATA (9b spec v1.0 T1/T3, §6 9b-b; Phase 0 rulings 1, 2 and 5;
 * ledger `2026-10-16-9b-b-legs-off-google`).
 *
 * Google's terms allow only place IDs and coordinates to be stored, so every Google duration, distance and
 * route answer the platform holds is rebuilt through the routing engine's current adapter (self-hosted OSRM)
 * and then — in a SEPARATE PR, after "delete approved — Leon" — deleted. This module does the first half and
 * DELETES NOTHING:
 *
 *   countGoogleRouteData()   the five numbers the dry-run reports and the deletion PR is checked against:
 *                            plans holding Google-sourced legs, legs with Google answers but no `source`,
 *                            Optimize version legs with a Google source, `travel_time_matrix` rows, and plan
 *                            items whose `travel_from_previous` names Google.
 *   rebuildGoogleRouteData() for each plan holding Google-sourced legs that still earns routed legs, ONE run of
 *                            the engine (`computePlanLegs`), which recomputes a proposed Google leg and re-routes
 *                            a confirmed one (superseded, never deleted — `legNeedsRebuild`); for each Optimize
 *                            version holding Google-sourced legs, ONE recompute of that version's legs
 *                            (`recalculateVariantLegs`). Idempotent: a second run finds nothing left to rebuild.
 *
 * It refuses to rebuild unless the adapter is OSRM (or the CI stub, with `allowStub`), because rebuilding
 * through anything else is not the ruling. The matrix and `travel_from_previous` are not rebuilt: the matrix is
 * retired as a source (no reader reads it) and `travel_from_previous` is no longer written from Google; both are
 * counted so the deletion PR knows exactly what it removes.
 */
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { CACHEABLE_ROUTE_SOURCES, OSRM_ROUTES_SOURCE, STRAIGHT_LINE_EST_SOURCE } from "@shared/routing-engine";
import { routingAdapter } from "./index";
import { computePlanLegs, recalculateVariantLegs } from "./plan-legs-engine.service";
import { tripGetsRoutedLegs } from "./plan-routed-legs.service";

export interface GoogleRouteDataCounts {
  /** Plans (trip-scoped legs) holding at least one leg whose source is Google — superseded rows included. */
  tripsWithGoogleLegs: number;
  /** Trip-scoped Google-sourced legs a traveler is SHOWN (`proposal_status` set). Zero after the rebuild. */
  shownGoogleLegs: number;
  /** Trip-scoped legs carrying Google-derived minutes with no `source` (reason `routes` | `matrix`). */
  provenanceLessGoogleLegs: number;
  /** Optimize version legs whose source is Google. */
  variantGoogleLegs: number;
  /** Rows in the retired `travel_time_matrix`. */
  matrixRows: number;
  /** Plan items whose `travel_from_previous` names Google as its provider. */
  itemsWithGoogleTravelFromPrevious: number;
}

// Sources that are NOT a stored Google answer: the cacheable routers, and 9b-d's straight-line estimate (an
// engine "no route" stand-in — re-asked by the engine every run, never a rebuild target).
const cacheable = () => sql.join([...Array.from(CACHEABLE_ROUTE_SOURCES), STRAIGHT_LINE_EST_SOURCE].map((s) => sql`${s}`), sql`, `);
const n = (rows: any): number => Number(((rows as any).rows ?? rows)[0]?.n ?? 0);

/** Read only. The same five numbers Replit reads against production (Oct 16: 1 · 0 · 24 · 192 · 9). */
export async function countGoogleRouteData(): Promise<GoogleRouteDataCounts> {
  const [trips, shown, provenanceLess, variants, matrix, items] = await Promise.all([
    db.execute(sql`SELECT count(DISTINCT trip_id)::int AS n FROM transport_legs
      WHERE variant_id IS NULL AND source IS NOT NULL AND source NOT IN (${cacheable()})`),
    db.execute(sql`SELECT count(*)::int AS n FROM transport_legs
      WHERE variant_id IS NULL AND proposal_status IS NOT NULL AND source IS NOT NULL AND source NOT IN (${cacheable()})`),
    db.execute(sql`SELECT count(*)::int AS n FROM transport_legs
      WHERE source IS NULL AND alternative_modes -> 0 ->> 'reason' IN ('routes', 'matrix')`),
    db.execute(sql`SELECT count(*)::int AS n FROM transport_legs
      WHERE variant_id IS NOT NULL AND source IS NOT NULL AND source NOT IN (${cacheable()})`),
    db.execute(sql`SELECT count(*)::int AS n FROM travel_time_matrix`),
    db.execute(sql`SELECT count(*)::int AS n FROM itinerary_items WHERE travel_from_previous ->> 'provider' = 'google_routes'`),
  ]);
  return {
    tripsWithGoogleLegs: n(trips),
    shownGoogleLegs: n(shown),
    provenanceLessGoogleLegs: n(provenanceLess),
    variantGoogleLegs: n(variants),
    matrixRows: n(matrix),
    itemsWithGoogleTravelFromPrevious: n(items),
  };
}

export interface RebuildPlanResult {
  tripId: string;
  outcome: "rebuilt" | "not_routed" | "skipped";
  detail?: unknown;
}
export interface RebuildVariantResult {
  variantId: string;
  outcome: "rebuilt" | "refused";
  legs?: number;
  detail?: unknown;
}
export interface RebuildReport {
  dryRun: boolean;
  before: GoogleRouteDataCounts;
  plans: RebuildPlanResult[];
  variants: RebuildVariantResult[];
  after: GoogleRouteDataCounts | null;
}

/** The plans and versions the rebuild would touch — what the dry run lists. */
export async function googleRebuildTargets(): Promise<{ tripIds: string[]; variantIds: string[] }> {
  // Plans: only legs still SHOWN — a superseded Google row is already replaced and waits for the deletion PR,
  // so a second run finds nothing to do.
  const trips = await db.execute(sql`SELECT DISTINCT trip_id AS id FROM transport_legs
    WHERE variant_id IS NULL AND trip_id IS NOT NULL AND proposal_status IS NOT NULL
      AND source IS NOT NULL AND source NOT IN (${cacheable()}) ORDER BY 1`);
  const variants = await db.execute(sql`SELECT DISTINCT variant_id AS id FROM transport_legs
    WHERE variant_id IS NOT NULL AND source IS NOT NULL AND source NOT IN (${cacheable()}) ORDER BY 1`);
  const ids = (r: any) => (((r as any).rows ?? r) as Array<{ id: string }>).map((x) => String(x.id));
  return { tripIds: ids(trips), variantIds: ids(variants) };
}

export async function rebuildGoogleRouteData(opts: { dryRun: boolean; allowStub?: boolean }): Promise<RebuildReport> {
  const before = await countGoogleRouteData();
  const { tripIds, variantIds } = await googleRebuildTargets();
  if (opts.dryRun) {
    return {
      dryRun: true,
      before,
      plans: tripIds.map((tripId) => ({ tripId, outcome: "skipped" as const, detail: "dry_run" })),
      variants: variantIds.map((variantId) => ({ variantId, outcome: "refused" as const, detail: "dry_run" })),
      after: null,
    };
  }
  const adapter = routingAdapter();
  const allowed = adapter && (adapter.source === OSRM_ROUTES_SOURCE || (opts.allowStub && adapter.source === "stub"));
  if (!allowed) throw new Error(`rebuild refused: the routing adapter is ${adapter ? adapter.source : "off"}, not OSRM`);

  const plans: RebuildPlanResult[] = [];
  for (const tripId of tripIds) {
    if (!(await tripGetsRoutedLegs(tripId))) {
      // A plan that no longer earns routed legs never gets a new one (R-e); its Google rows are the deletion PR's.
      plans.push({ tripId, outcome: "not_routed" });
      continue;
    }
    const r: any = await computePlanLegs(tripId);
    plans.push({ tripId, outcome: r?.skipped ? "skipped" : "rebuilt", detail: r });
  }
  const variants: RebuildVariantResult[] = [];
  for (const variantId of variantIds) {
    const r = await recalculateVariantLegs(variantId);
    variants.push("refused" in r ? { variantId, outcome: "refused", detail: r.refused } : { variantId, outcome: "rebuilt", legs: r.legs.length });
  }
  return { dryRun: false, before, plans, variants, after: await countGoogleRouteData() };
}
