/**
 * SH-1 Launch PR 5 on a real database (ledger `2026-10-22-sh1-launch-pr5`). Synthetic rows only, keyed per run.
 *
 *   LP1 Q14.3: the mint check refuses an ended event and an unknown or withdrawn row, and answers the market of a live one
 *   LP2 Q14.3: a series of shows has ended only when its last live show has
 *   LP3 Q14.3: the event page of an ended event says it has ended; a live one does not
 *   LP4 Q13.2: "More in <city>" rows carry their countdown (`daysUntil`)
 *   LP5 Q15.3: `POST /api/trips`'s clamp — the start moves to the market's today, a future start is kept
 *
 * STATED LIMIT (§18d): `POST /api/trips` lives in the `server/routes.ts` monolith, which no test mounts. LP1/LP5 prove
 * the two pieces the route calls (`checkMintEvent`, `clampToMarketToday`) on a real database, not the handler's wiring.
 *
 * DISPOSABLE DB ONLY.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { cityEvents } from "@shared/schema";
import { checkMintEvent } from "../services/plan-event-mint.service";
import { loadEventPage } from "../services/event-page.service";
import { clampToMarketToday } from "@shared/market-today";

const RUN = crypto.randomUUID().slice(0, 8);
const sid = (k: string) => `lp5-${RUN}-${k}`;
// 2027-03-10 23:30 UTC = 2027-03-11 in Kyoto.
const NOW = new Date("2027-03-10T23:30:00Z");
const deps = { now: NOW, facts: async () => ({ event: { ticketUrl: null, marketKey: "kyoto" }, attributedFacts: [] }) as any, verifiedCount: async () => 0 };

const row = (k: string, day: string, over: Record<string, unknown> = {}) => ({
  source: "manual",
  sourceId: sid(k),
  title: `Fixture ${k} ${RUN}`,
  city: "Kyoto",
  venue: "Test hall",
  startsAt: new Date(`${day}T18:00:00+09:00`),
  nights: 1,
  ...over,
});

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) throw new Error("refusing a non-disposable database");
  await db
    .insert(cityEvents)
    .values([
      row("ended", "2027-03-09"),
      row("live", "2027-03-20"),
      row("withdrawn", "2027-03-25", { withdrawnAt: new Date() }),
      row("show-a", "2027-03-05", { seriesKey: `lp5-${RUN}` }),
      row("show-b", "2027-03-14", { seriesKey: `lp5-${RUN}` }),
      row("past-a", "2027-03-01", { seriesKey: `lp5-past-${RUN}` }),
      row("past-b", "2027-03-03", { seriesKey: `lp5-past-${RUN}` }),
    ] as any);
});

after(async () => {
  await db.execute(sql`DELETE FROM city_events WHERE source_id LIKE ${`lp5-${RUN}-%`}`);
  await pool.end();
});

test("LP1 the mint check refuses ended, unknown and withdrawn; a live event answers its market", async () => {
  assert.deepEqual(await checkMintEvent(sid("ended"), NOW), { ok: false, reason: "event_ended" });
  assert.deepEqual(await checkMintEvent(sid("withdrawn"), NOW), { ok: false, reason: "event_not_found" });
  assert.deepEqual(await checkMintEvent(sid("missing"), NOW), { ok: false, reason: "event_not_found" });
  assert.deepEqual(await checkMintEvent(sid("live"), NOW), { ok: true, marketKey: "kyoto" });
});

test("LP2 a series has ended only when its last live show has", async () => {
  assert.deepEqual(await checkMintEvent(sid("show-a"), NOW), { ok: true, marketKey: "kyoto" }, "a later show is still to come");
  assert.deepEqual(await checkMintEvent(sid("past-a"), NOW), { ok: false, reason: "event_ended" });
});

test("LP3 the page of an ended event says so", async () => {
  const ended = await loadEventPage(sid("ended"), deps);
  assert.equal(ended?.ended, true);
  const live = await loadEventPage(sid("live"), deps);
  assert.equal(live?.ended, undefined);
  const series = await loadEventPage(sid("show-a"), deps);
  assert.equal(series?.ended, undefined, "a show past, a show to come: not ended");
});

test("LP4 More in the city rows carry their countdown", async () => {
  const page = await loadEventPage(sid("live"), deps);
  const mine = page!.moreInCity.find((m) => m.sourceId === sid("show-b"));
  assert.equal(mine?.daysUntil, 3);
  assert.equal(page!.moreInCity.some((m) => m.sourceId === sid("ended")), false, "an ended event is not listed");
});

test("LP5 the mint clamp", () => {
  assert.equal(clampToMarketToday("2027-03-09", "kyoto", NOW), "2027-03-11");
  assert.equal(clampToMarketToday("2027-03-20", "kyoto", NOW), "2027-03-20");
});
