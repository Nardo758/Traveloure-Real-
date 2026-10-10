/**
 * THE NIGHTLY LITEAPI SYNC (S1-d-1; ledger `2026-10-10-s1-d1-liteapi`). Kyoto only, daily, incremental.
 *
 * Static content only — name, coordinates, type, stars, address, description, the guest rating and the
 * main image URL (hot-linked from LiteAPI's CDN; bytes are never copied). Reviews and sentiment are never
 * read or stored, and rates never touch this table (S1-d-1 rulings).
 *
 * Lifecycle, owned by this sync and never by the expiry sweep (`hotel-cache-retention.ts`):
 *   · a row is UPSERTED on (provider, provider_hotel_id) — migration 365's unique index;
 *   · `fetched_at` = the run's start; `content_updated_at` moves only when a stored field changed;
 *   · a row LiteAPI marks deleted is lapsed (`expires_at` = the run's start) and never removed;
 *   · a COMPLETED pass confirms every live row in the city (`expires_at` = start + staleAfterDays).
 * The incremental watermark is the last COMPLETED pass — read back from that confirmation, so a pass
 * that dies part-way never advances it (the next run re-reads the window; the upsert is idempotent).
 * Every row records `raw_data.provenance = { source, env, fetchedAt }`, so sandbox rows are purgeable.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { hotelCache } from "@shared/schema";
import { LITEAPI_PROVIDER, type LiteapiEnv } from "@shared/liteapi";
import {
  liteapiConfig,
  LITEAPI_PAGE_SIZE,
  LITEAPI_SYNC_OVERLAP_MS,
  LITEAPI_SYNC_TARGETS,
  type LiteapiConfig,
} from "../config/liteapi.config";
import { createLiteapiClient, type LiteapiClient } from "./liteapi-client";
import { liteapiCityCode, liteapiHotelRow, type LiteapiRowContext } from "./liteapi-rows";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface LiteapiSyncTargetResult {
  market: string;
  mode: "full" | "incremental";
  pages: number;
  upserted: number;
  lapsed: number;
  skipped: number;
  completed: boolean;
  error?: string;
}

export interface LiteapiSyncResult {
  skipped?: "not_configured";
  env?: LiteapiEnv;
  targets: LiteapiSyncTargetResult[];
  error?: string;
}

export interface LiteapiSyncDeps {
  config: () => LiteapiConfig | null;
  client: (cfg: LiteapiConfig) => LiteapiClient;
  targets: typeof LITEAPI_SYNC_TARGETS;
  pageSize: number;
}
export const defaultLiteapiSyncDeps: LiteapiSyncDeps = {
  config: () => liteapiConfig(),
  client: (cfg) => createLiteapiClient(cfg),
  targets: LITEAPI_SYNC_TARGETS,
  pageSize: LITEAPI_PAGE_SIZE,
};

const rowScope = (cityName: string, env: LiteapiEnv) =>
  and(
    eq(hotelCache.provider, LITEAPI_PROVIDER),
    eq(hotelCache.cityCode, liteapiCityCode(cityName)),
    sql`${hotelCache.rawData} -> 'provenance' ->> 'env' = ${env}`,
  );

/** The last COMPLETED pass for this city and env, or null (⇒ a full pass). */
export async function completedSyncWatermark(cityName: string, env: LiteapiEnv, staleAfterDays: number): Promise<Date | null> {
  const [r] = await db
    .select({ maxExpires: sql<Date | null>`max(${hotelCache.expiresAt})` })
    .from(hotelCache)
    .where(and(rowScope(cityName, env), sql`${hotelCache.expiresAt} > ${hotelCache.fetchedAt}`));
  if (!r?.maxExpires) return null;
  return new Date(new Date(r.maxExpires).getTime() - staleAfterDays * DAY_MS);
}

async function upsertRows(rows: NonNullable<ReturnType<typeof liteapiHotelRow>>[]): Promise<void> {
  if (!rows.length) return;
  const changed = sql`(
    ${hotelCache.name}, ${hotelCache.latitude}, ${hotelCache.longitude}, ${hotelCache.address}, ${hotelCache.postalCode},
    ${hotelCache.starRating}, ${hotelCache.hotelTypeId}, ${hotelCache.guestRating}, ${hotelCache.mainImageUrl},
    ${hotelCache.rawData} -> 'content'
  ) IS DISTINCT FROM (
    excluded.name, excluded.latitude, excluded.longitude, excluded.address, excluded.postal_code,
    excluded.star_rating, excluded.hotel_type_id, excluded.guest_rating, excluded.main_image_url,
    excluded.raw_data -> 'content'
  )`;
  await db
    .insert(hotelCache)
    .values(rows)
    .onConflictDoUpdate({
      target: [hotelCache.provider, hotelCache.providerHotelId],
      set: {
        hotelId: sql`excluded.hotel_id`,
        cityCode: sql`excluded.city_code`,
        city: sql`excluded.city`,
        countryCode: sql`excluded.country_code`,
        name: sql`excluded.name`,
        latitude: sql`excluded.latitude`,
        longitude: sql`excluded.longitude`,
        address: sql`excluded.address`,
        postalCode: sql`excluded.postal_code`,
        starRating: sql`excluded.star_rating`,
        hotelTypeId: sql`excluded.hotel_type_id`,
        guestRating: sql`excluded.guest_rating`,
        mainImageUrl: sql`excluded.main_image_url`,
        rawData: sql`excluded.raw_data`,
        fetchedAt: sql`excluded.fetched_at`,
        contentUpdatedAt: sql`CASE WHEN ${changed} THEN excluded.content_updated_at ELSE ${hotelCache.contentUpdatedAt} END`,
        lastUpdated: sql`now()`,
        // expires_at is left as it is: only a completed pass confirms a row.
      },
    });
}

/** LiteAPI says the hotel is gone: lapse the row we hold (never delete it — a plan may reference it). */
async function lapseRows(providerHotelIds: string[], runStartedAt: Date, env: LiteapiEnv): Promise<number> {
  if (!providerHotelIds.length) return 0;
  const out = await db
    .update(hotelCache)
    .set({
      expiresAt: runStartedAt,
      fetchedAt: runStartedAt,
      rawData: sql`jsonb_set(coalesce(${hotelCache.rawData}, '{}'::jsonb), '{provenance}', ${JSON.stringify({ source: LITEAPI_PROVIDER, env, fetchedAt: runStartedAt.toISOString(), deleted: true })}::jsonb)`,
    })
    .where(and(eq(hotelCache.provider, LITEAPI_PROVIDER), inArray(hotelCache.providerHotelId, providerHotelIds)))
    .returning({ id: hotelCache.id });
  return out.length;
}

/** A completed pass: every live row in the city for this env is confirmed current. */
async function confirmCity(cityName: string, env: LiteapiEnv, runStartedAt: Date, staleAfterDays: number): Promise<void> {
  await db
    .update(hotelCache)
    .set({ expiresAt: new Date(runStartedAt.getTime() + staleAfterDays * DAY_MS) })
    .where(and(rowScope(cityName, env), sql`coalesce((${hotelCache.rawData} -> 'provenance' ->> 'deleted')::boolean, false) = false`));
}

export async function runLiteapiSync(now: Date = new Date(), deps: LiteapiSyncDeps = defaultLiteapiSyncDeps): Promise<LiteapiSyncResult> {
  const cfg = deps.config();
  if (!cfg) return { skipped: "not_configured", targets: [] };
  const client = deps.client(cfg);
  const targets: LiteapiSyncTargetResult[] = [];
  for (const t of deps.targets) {
    const r: LiteapiSyncTargetResult = { market: t.market, mode: "full", pages: 0, upserted: 0, lapsed: 0, skipped: 0, completed: false };
    targets.push(r);
    try {
      const mark = await completedSyncWatermark(t.cityName, cfg.env, cfg.staleAfterDays);
      const lastUpdatedAt = mark ? new Date(mark.getTime() - LITEAPI_SYNC_OVERLAP_MS).toISOString() : undefined;
      r.mode = lastUpdatedAt ? "incremental" : "full";
      const ctx: LiteapiRowContext = { cityName: t.cityName, countryCode: t.countryCode, env: cfg.env, runStartedAt: now };
      for (let offset = 0; ; offset += deps.pageSize) {
        const page = await client.listHotels({ countryCode: t.countryCode, cityName: t.cityName, offset, limit: deps.pageSize, lastUpdatedAt });
        r.pages += 1;
        const live: NonNullable<ReturnType<typeof liteapiHotelRow>>[] = [];
        const gone: string[] = [];
        for (const h of page.data) {
          if (h.deletedAt) {
            if (typeof h.id === "string" && h.id) gone.push(h.id);
            continue;
          }
          const row = liteapiHotelRow(h, ctx);
          if (row) live.push(row);
          else r.skipped += 1;
        }
        await upsertRows(live);
        r.upserted += live.length;
        r.lapsed += await lapseRows(gone, now, cfg.env);
        if (page.data.length < deps.pageSize) break;
        if (page.total != null && offset + deps.pageSize >= page.total) break;
      }
      await confirmCity(t.cityName, cfg.env, now, cfg.staleAfterDays);
      r.completed = true;
    } catch (err: any) {
      r.error = err?.message ?? String(err);
    }
  }
  const failed = targets.find((x) => x.error);
  return { env: cfg.env, targets, ...(failed ? { error: `${failed.market}: ${failed.error}` } : {}) };
}
