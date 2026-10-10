/**
 * S1-d-1 — LiteAPI rows against a disposable database (ledger `2026-10-10-s1-d1-liteapi`; migration 365).
 *
 *   LS1 the expiry sweep never deletes a LiteAPI row, nor ANY row a plan option or a stay pick references;
 *       a plain expired row still goes
 *   LS2 a full pass pages, upserts on (provider, provider_hotel_id), records the env, and confirms the city
 *   LS3 the next pass is incremental from the last completed pass; content_updated_at moves only for a row
 *       whose content changed; a re-run creates no duplicate
 *   LS4 a hotel LiteAPI marks deleted is lapsed, never removed, and a completed pass does not revive it
 *   LS5 a pass that fails part-way reports the error and does not advance the watermark
 *   LS6 no key or no env ⇒ skipped, no call
 *   LS7 the pool reads a LiteAPI row as kind `liteapi`; the bind accepts it only under that kind
 *
 * DISPOSABLE DB ONLY. LiteAPI is a fake.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { cacheService } from "../services/cache.service";
import { completedSyncWatermark, runLiteapiSync, type LiteapiSyncDeps } from "../services/liteapi-sync.service";
import { liteapiCityCode } from "../services/liteapi-rows";
import { cityHotels, bindWhereToStay } from "../services/where-to-stay.service";
import type { LiteapiHotel } from "../services/liteapi-client";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (k: string) => `lsy-${RUN}-${k}`;
const CITY = `Litecity${RUN}`;
const cfg = { apiKey: "k", env: "sandbox" as const, dataBaseUrl: "https://api.test/v3.0", bookBaseUrl: "https://book.test/v3.0", maxRps: 1000, staleAfterDays: 2 };
const hotels = (n: number, over: Partial<LiteapiHotel> = {}): LiteapiHotel[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${RUN}-lp${i}`, name: `Lite Hotel ${i}`, latitude: 35 + i / 1000, longitude: 135.7, stars: 3, ...over }));

/** A fake client: serves `pages` for a full pass and `changed` for an incremental one; records queries. */
function fakeDeps(feed: { full: LiteapiHotel[]; changed?: LiteapiHotel[]; failAtOffset?: number }, queries: any[] = []): LiteapiSyncDeps {
  return {
    config: () => cfg,
    targets: [{ market: "litecity", countryCode: "JP", cityName: CITY }],
    pageSize: 2,
    client: () =>
      ({
        listHotels: async (q: any) => {
          queries.push(q);
          if (feed.failAtOffset != null && q.offset >= feed.failAtOffset) throw new Error("boom");
          const all = q.lastUpdatedAt ? (feed.changed ?? []) : feed.full;
          return { data: all.slice(q.offset, q.offset + q.limit), total: all.length };
        },
      }) as any,
  };
}
const rows = async () =>
  ((await db.execute(sql`SELECT * FROM hotel_cache WHERE provider = 'liteapi' AND city_code = ${liteapiCityCode(CITY)} ORDER BY provider_hotel_id`)) as any).rows as any[];

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${id("owner")}, ${`${id("owner")}@t.test`}, 'LS', 'Fixture', 'user')`);
});

after(async () => {
  await db.execute(sql`DELETE FROM trips WHERE id LIKE ${`lsy-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM hotel_cache WHERE id LIKE ${`lsy-${RUN}-%`} OR provider_hotel_id LIKE ${`${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id LIKE ${`lsy-${RUN}-%`}`).catch(() => {});
  await pool.end();
});

test("LS1 the sweep spares LiteAPI rows and every referenced row; a plain expired row goes", async () => {
  const past = new Date(Date.now() - 86_400_000);
  const ins = (k: string, provider: string) =>
    db.execute(sql`INSERT INTO hotel_cache (id, hotel_id, city_code, name, latitude, longitude, city, provider, expires_at)
      VALUES (${id(k)}, ${id(k)}, 'SWP', ${k}, 35, 135, ${CITY}, ${provider}, ${past})`);
  await ins("plain", "booking_com");
  await ins("lite", "liteapi");
  await ins("optioned", "booking_com");
  await ins("picked", "booking_com");
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status, stay_pick)
    VALUES (${id("trip")}, ${id("owner")}, 'LS', ${`${CITY}, Japan`}, '2027-05-01', '2027-05-03', 'planning',
      ${JSON.stringify({ hotelId: id("picked"), hotelKind: "hotel_cache" })}::jsonb)`);
  await db.execute(sql`INSERT INTO plan_option_sets (id, trip_id, status) VALUES (${id("set")}, ${id("trip")}, 'open')`);
  await db.execute(sql`INSERT INTO plan_options (id, set_id, position, source_kind, title, hotel_cache_id) VALUES (${id("opt")}, ${id("set")}, 1, 'engine', 'Optioned', ${id("optioned")})`);
  await cacheService.cleanupExpiredCache();
  const left = ((await db.execute(sql`SELECT id FROM hotel_cache WHERE id LIKE ${`lsy-${RUN}-%`}`)) as any).rows.map((r: any) => r.id).sort();
  assert.deepEqual(left, [id("lite"), id("optioned"), id("picked")].sort());
  await db.execute(sql`DELETE FROM trips WHERE id = ${id("trip")}`);
});

test("LS2 a full pass pages, upserts, records the env and confirms the city", async () => {
  const q: any[] = [];
  const t0 = new Date("2026-10-10T09:00:00Z");
  const r = await runLiteapiSync(t0, fakeDeps({ full: hotels(5) }, q));
  assert.equal(r.error, undefined);
  assert.equal(r.targets[0].mode, "full");
  assert.equal(r.targets[0].pages, 3);
  assert.equal(r.targets[0].upserted, 5);
  assert.ok(q.every((x) => x.lastUpdatedAt === undefined));
  const rs = await rows();
  assert.equal(rs.length, 5);
  assert.ok(rs.every((x) => x.raw_data.provenance.env === "sandbox" && new Date(x.fetched_at).getTime() === t0.getTime()));
  assert.ok(rs.every((x) => new Date(x.expires_at).getTime() === t0.getTime() + 2 * 86_400_000), "confirmed by the completed pass");
  assert.equal((await completedSyncWatermark(CITY, "sandbox", 2))?.getTime(), t0.getTime());
});

test("LS3 incremental from the last completed pass; content_updated_at moves only on change; no duplicate", async () => {
  const q: any[] = [];
  const t1 = new Date("2026-10-11T09:00:00Z");
  const changed = [{ ...hotels(5)[1], name: "Renamed Lite Hotel" }, hotels(5)[2]];
  const r = await runLiteapiSync(t1, fakeDeps({ full: hotels(5), changed }, q));
  assert.equal(r.targets[0].mode, "incremental");
  assert.equal(q[0].lastUpdatedAt, new Date(new Date("2026-10-10T09:00:00Z").getTime() - 3_600_000).toISOString());
  const rs = await rows();
  assert.equal(rs.length, 5, "the upsert creates no duplicate");
  const by = Object.fromEntries(rs.map((x) => [x.provider_hotel_id, x]));
  assert.equal(by[`${RUN}-lp1`].name, "Renamed Lite Hotel");
  assert.equal(new Date(by[`${RUN}-lp1`].content_updated_at).getTime(), t1.getTime());
  assert.equal(new Date(by[`${RUN}-lp2`].content_updated_at).getTime(), new Date("2026-10-10T09:00:00Z").getTime(), "unchanged content keeps its date");
  assert.equal(new Date(by[`${RUN}-lp2`].fetched_at).getTime(), t1.getTime());
});

test("LS4 a deleted hotel is lapsed, never removed, and not revived by the confirmation", async () => {
  const t2 = new Date("2026-10-12T09:00:00Z");
  const r = await runLiteapiSync(t2, fakeDeps({ full: [], changed: [{ id: `${RUN}-lp3`, name: "x", deletedAt: "2026-10-12T00:00:00Z" }] }));
  assert.equal(r.error, undefined);
  assert.equal(r.targets[0].lapsed, 1);
  const lp3 = (await rows()).find((x) => x.provider_hotel_id === `${RUN}-lp3`);
  assert.ok(lp3, "never deleted");
  assert.equal(new Date(lp3.expires_at).getTime(), t2.getTime());
  assert.equal(lp3.raw_data.provenance.deleted, true);
});

test("LS5 a pass that fails part-way does not advance the watermark", async () => {
  const before = await completedSyncWatermark(CITY, "sandbox", 2);
  const r = await runLiteapiSync(new Date("2026-10-13T09:00:00Z"), fakeDeps({ full: [], changed: hotels(5), failAtOffset: 2 }));
  assert.match(r.error ?? "", /litecity: boom/);
  assert.equal(r.targets[0].completed, false);
  assert.equal((await completedSyncWatermark(CITY, "sandbox", 2))?.getTime(), before?.getTime());
});

test("LS6 no config ⇒ skipped, nothing called", async () => {
  let called = false;
  const r = await runLiteapiSync(new Date(), { ...fakeDeps({ full: [] }), config: () => null, client: () => { called = true; return {} as any; } });
  assert.deepEqual(r, { skipped: "not_configured", targets: [] });
  assert.equal(called, false);
});

test("LS7 the pool reads kind liteapi; the bind accepts it only under that kind", async () => {
  const pool_ = await cityHotels(CITY);
  const lite = pool_.find((h) => h.name === "Lite Hotel 0");
  assert.equal(lite?.kind, "liteapi");
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status)
    VALUES (${id("trip2")}, ${id("owner")}, 'LS bind', ${`${CITY}, Japan`}, '2027-05-01', '2027-05-03', 'planning')`);
  await assert.rejects(bindWhereToStay(id("trip2"), id("owner"), { kind: "stay_here", hotel: { kind: "hotel_cache", id: lite!.id } }), (e: any) => e.status === 404);
  const out = await bindWhereToStay(id("trip2"), id("owner"), { kind: "stay_here", hotel: { kind: "liteapi", id: lite!.id } });
  assert.ok(out.setId);
  const opt: any = (await db.execute(sql`SELECT hotel_cache_id FROM plan_options WHERE set_id = ${out.setId}`)) as any;
  assert.equal(opt.rows[0].hotel_cache_id, lite!.id);
});
