/**
 * WHICH `hotel_cache` ROWS THE EXPIRY SWEEP MAY DELETE (S1-d-1 ruling; ledger `2026-10-10-s1-d1-liteapi`).
 *
 * `cleanupExpiredCache` used to delete every row past `expires_at`. That cascaded away the row's
 * `hotel_offer_cache` rows, set `plan_options.hotel_cache_id` to NULL and left `trips.stay_pick`
 * naming a row that no longer exists. An expired row is now deleted only when ALL of these hold:
 *   (a) it is not a LiteAPI row — the nightly sync owns that row's lifecycle, never the sweep;
 *   (b) no `plan_options` row references it;
 *   (c) no `trips.stay_pick` names it (jsonb `hotelId` match, whatever the provider).
 * One WHERE expression, read by the sweep's one delete (§18 rule 1).
 */
import { and, lte, sql, type SQL } from "drizzle-orm";
import { hotelCache } from "@shared/schema";
import { LITEAPI_PROVIDER } from "@shared/liteapi";

export function hotelCacheExpiredDeletable(now: Date): SQL {
  return and(
    lte(hotelCache.expiresAt, now),
    sql`${hotelCache.provider} IS DISTINCT FROM ${LITEAPI_PROVIDER}`,
    sql`NOT EXISTS (SELECT 1 FROM plan_options po WHERE po.hotel_cache_id = ${hotelCache.id})`,
    sql`NOT EXISTS (SELECT 1 FROM trips t WHERE t.stay_pick ->> 'hotelId' = ${hotelCache.id})`,
  ) as SQL;
}
