/**
 * `leg-google-coords` — the daily refresh-or-clear of Google coordinates on legs (R312, ledger
 * `2026-10-04-leg-google-coords-refresh`; the follow-up R311 named — LD 57 extends to transport_legs).
 *
 * A leg built from a Google Places point says so (`coord_source = 'google'`, `coord_fetched_at`,
 * migration 350). Today's only writer is the stay re-route (`stay-reroute.service.ts`), so every such
 * leg is a re-routed end leg on a ready-made copy, and the point is the copy's STAY. Per plan holding a
 * Google leg within `LEG_GOOGLE_COORD_REFRESH_LEAD_DAYS` of the max age (`legGoogleCoordMaxAgeDays`):
 *
 *   1. REFRESH the stay's facts through the ONE place-facts writer (`enrichPlanItems`, the stay item
 *      only) — the Places spine's shared cache first, a miss billed under its own gate and caps.
 *   2. RE-ROUTE through the ONE re-route (`rerouteCopyForStay`): an unexpired point (the item's own
 *      coordinate first, else a live Google fact) rebuilds both end legs with a new fetch time.
 *   3. CLEAR what is still Google-sourced past the max age — one conditional DELETE. `from/to_lat/lng`
 *      are NOT NULL (and stay so), so the coordinate cannot be blanked; the leg goes, and the day's end
 *      shows no leg rather than a point Google's terms no longer let us hold (§13 — never invented).
 *      A leg with `coord_fetched_at` NULL has no recorded age and is cleared the same way.
 *
 * Never throws for one plan (a failed plan is counted); only a failed candidate scan is an `error`,
 * which never stamps a success heartbeat. Idempotent: a second run the same day finds nothing due.
 * Registered as `POST /internal/jobs/leg-google-coords` (daily `JOB_CADENCE` + `BUCKET_ROUTES`).
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { LEG_GOOGLE_COORD_REFRESH_LEAD_DAYS, legGoogleCoordMaxAgeDays } from "../config/leg-google-coords.config";

export interface LegGoogleCoordsResult {
  checked: number;
  refreshed: number;
  cleared: number;
  failed: number;
  error?: string;
}

export interface LegGoogleCoordsDeps {
  /** Plans holding at least one Google-sourced leg fetched at or before `dueBefore` (or with no fetch time). */
  candidates: (dueBefore: Date) => Promise<string[]>;
  /** Re-run the stay item's facts lookup (cache first, a miss billed). */
  relookupStay: (tripId: string) => Promise<void>;
  /** The one re-route; rebuilds the end legs from the stay's current point. */
  reroute: (tripId: string) => Promise<void>;
  /** Delete the plan's Google-sourced legs fetched at or before `expiredBefore` (or with no fetch time). */
  clearExpired: (tripId: string, expiredBefore: Date) => Promise<number>;
  /** Count the plan's Google-sourced legs still due after the reroute. */
  stillDue: (tripId: string, dueBefore: Date) => Promise<number>;
}

const DAY_MS = 86_400_000;

export const defaultLegGoogleCoordsDeps: LegGoogleCoordsDeps = {
  async candidates(dueBefore) {
    const r = await db.execute(sql`
      SELECT DISTINCT trip_id FROM transport_legs
      WHERE coord_source = 'google'
        AND (coord_fetched_at IS NULL OR coord_fetched_at <= ${dueBefore.toISOString()}::timestamptz)
      ORDER BY trip_id`);
    return ((r as any).rows ?? []).map((x: any) => String(x.trip_id));
  },
  async relookupStay(tripId) {
    const { stayItemIdForPlan } = await import("../services/stay-reroute.service");
    const itemId = await stayItemIdForPlan(tripId);
    if (!itemId) return;
    const r = await db.execute(sql`
      SELECT i.id, i.title, i.item_type, i.day_number, i.location_name, i.google_place_id, t.destination, t.market_slug
      FROM itinerary_items i JOIN trips t ON t.id = i.trip_id
      WHERE i.id = ${itemId} AND i.trip_id = ${tripId}`);
    const it = ((r as any).rows ?? [])[0];
    if (!it) return;
    const { enrichPlanItems } = await import("../services/content-facts/place-facts.service");
    await enrichPlanItems({
      tripId,
      market: it.market_slug ?? null,
      city: it.destination ?? null,
      items: [{ id: it.id, title: it.title, type: it.item_type ?? null, dayNumber: it.day_number ?? null, locationName: it.location_name ?? null, googlePlaceId: it.google_place_id ?? null }],
    });
  },
  async reroute(tripId) {
    const { rerouteCopyForStay } = await import("../services/stay-reroute.service");
    await rerouteCopyForStay(tripId);
  },
  async clearExpired(tripId, expiredBefore) {
    const r = await db.execute(sql`
      DELETE FROM transport_legs
      WHERE trip_id = ${tripId} AND coord_source = 'google'
        AND (coord_fetched_at IS NULL OR coord_fetched_at <= ${expiredBefore.toISOString()}::timestamptz)
      RETURNING id`);
    return ((r as any).rows ?? []).length;
  },
  async stillDue(tripId, dueBefore) {
    const r = await db.execute(sql`
      SELECT count(*)::int AS n FROM transport_legs
      WHERE trip_id = ${tripId} AND coord_source = 'google'
        AND (coord_fetched_at IS NULL OR coord_fetched_at <= ${dueBefore.toISOString()}::timestamptz)`);
    return Number(((r as any).rows ?? [])[0]?.n ?? 0);
  },
};

export async function runLegGoogleCoordsRefresh(
  now: Date = new Date(),
  deps: LegGoogleCoordsDeps = defaultLegGoogleCoordsDeps,
): Promise<LegGoogleCoordsResult> {
  const result: LegGoogleCoordsResult = { checked: 0, refreshed: 0, cleared: 0, failed: 0 };
  const maxAge = legGoogleCoordMaxAgeDays();
  const dueBefore = new Date(now.getTime() - Math.max(0, maxAge - LEG_GOOGLE_COORD_REFRESH_LEAD_DAYS) * DAY_MS);
  const expiredBefore = new Date(now.getTime() - maxAge * DAY_MS);
  let plans: string[];
  try {
    plans = await deps.candidates(dueBefore);
  } catch (err: any) {
    return { ...result, error: err?.message ?? String(err) };
  }
  for (const tripId of plans) {
    try {
      result.checked += 1;
      // A failed lookup or re-route never blocks the clear: an expired coordinate goes either way.
      try {
        await deps.relookupStay(tripId);
        await deps.reroute(tripId);
      } catch (err) {
        console.error(`[leg-google-coords] refresh failed plan_id=${tripId}:`, (err as Error)?.message ?? err);
      }
      if ((await deps.stillDue(tripId, dueBefore)) === 0) result.refreshed += 1;
      result.cleared += await deps.clearExpired(tripId, expiredBefore);
    } catch (err) {
      result.failed += 1;
      console.error(`[leg-google-coords] plan ${tripId} failed:`, (err as Error)?.message ?? err);
    }
  }
  return result;
}
