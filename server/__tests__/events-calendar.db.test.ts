/**
 * The /events calendar read against a disposable database (ledger `2026-10-06-events-calendar`,
 * events-page brief 2a).
 *
 *   V1  an event already UNDER WAY is in the calendar and reads "On now"; the landing strip's
 *       `listUpcomingCityEvents` still leaves it out (GET /api/city-events/upcoming is unchanged)
 *   V2  a one-night show today, stored at local midnight with no end, is listed; one that ended
 *       yesterday, a withdrawn one and one past the twelve months are not
 *   V3  only approved month-level `destination_events` become bands: a DATED row never does (E1), a
 *       pending row never does, a country outside the eight markets never does; a country band names
 *       the COUNTRY and applies to that country's markets (E5)
 *   V4  "Where to go" carries all eight markets, whatever the season table holds (E6)
 *   V5  the vertical is carried; an unstated one is null
 *
 * DISPOSABLE DB ONLY: rows keyed by a per-run prefix and deleted afterwards.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { cityEvents, destinationEvents } from "@shared/schema";
import { countdownLabel, localDate } from "@shared/city-events";
import { OPERATING_MARKETS } from "@shared/operating-markets";
import { loadEventsCalendar } from "../services/events-calendar.service";
import { listUpcomingCityEvents } from "../services/city-events.service";

const RUN = crypto.randomUUID().slice(0, 8);
const sid = (s: string) => `calendar-${RUN}-${s}`;
const now = new Date();
const TZ = "Asia/Tokyo";
const ids: Record<string, string> = {};
const bandIds: Record<string, string> = {};

/** Local midnight in Kyoto, `days` from today. */
function kyotoMidnight(days: number): Date {
  const today = localDate(now, TZ);
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days) - 9 * 3_600_000);
}

async function insertEvent(key: string, startDays: number, endDays: number | null, over: Partial<typeof cityEvents.$inferInsert> = {}) {
  const startsAt = kyotoMidnight(startDays);
  const endsAt = endDays === null ? null : kyotoMidnight(endDays);
  const nights = endDays === null ? 1 : endDays - startDays + 1;
  const [row] = await db
    .insert(cityEvents)
    .values({ source: "manual", sourceId: sid(key), title: `Calendar ${RUN} ${key}`, city: "Kyoto", venue: "Hall", startsAt, endsAt, nights, ...over })
    .returning({ id: cityEvents.id });
  ids[key] = row.id;
}

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  await insertEvent("underway", -2, 2, { vertical: "other" });
  await insertEvent("tonight", 0, null, { vertical: "music" });
  await insertEvent("ended", -3, -1);
  await insertEvent("withdrawn", 3, null, { withdrawnAt: new Date() });
  await insertEvent("future", 10, null);
  await insertEvent("beyond", 400, null);

  const band = async (key: string, v: Partial<typeof destinationEvents.$inferInsert>) => {
    const [row] = await db
      .insert(destinationEvents)
      .values({ country: "Japan", title: `Band ${RUN} ${key}`, status: "approved", startMonth: 1, endMonth: 12, ...v })
      .returning({ id: destinationEvents.id });
    bandIds[key] = row.id;
  };
  await band("season", {});
  await band("dated", { specificDate: localDate(now, TZ) });
  await band("pending", { status: "pending" });
  await band("france", { country: "France" });
});

after(async () => {
  await db.execute(sql`DELETE FROM city_events WHERE source_id LIKE ${`calendar-${RUN}-%`}`);
  await db.execute(sql`DELETE FROM destination_events WHERE title LIKE ${`Band ${RUN} %`}`);
  await pool.end();
});

test("V1 an event under way is in the calendar and reads On now; upcoming still leaves it out", async () => {
  const cal = await loadEventsCalendar(now);
  const e = cal.events.find((x) => x.id === ids.underway);
  assert.ok(e, "under way is listed");
  assert.ok(e!.daysUntil < 0);
  assert.equal(countdownLabel(e!.daysUntil), "On now");
  const upcoming = await listUpcomingCityEvents(now, 500);
  assert.ok(!upcoming.events.some((x) => x.id === ids.underway), "the strip's read is unchanged");
  assert.ok(upcoming.events.some((x) => x.id === ids.future), "and still returns what starts later");
  assert.ok(cal.events.some((x) => x.id === ids.future));
});

test("V2 tonight is listed; ended, withdrawn and beyond the window are not", async () => {
  const cal = await loadEventsCalendar(now);
  const listed = new Set(cal.events.map((x) => x.id));
  assert.ok(listed.has(ids.tonight), "a one-night show today, stored at local midnight with no end");
  assert.ok(!listed.has(ids.ended));
  assert.ok(!listed.has(ids.withdrawn));
  assert.ok(!listed.has(ids.beyond));
  assert.equal(cal.months.length, 12);
});

test("V3 only approved month-level rows in our countries become bands, named by country", async () => {
  const cal = await loadEventsCalendar(now);
  const mine = cal.bands.filter((b) => Object.values(bandIds).includes(b.id));
  assert.deepEqual(mine.map((b) => b.id), [bandIds.season]);
  const b = mine[0];
  assert.equal(b.place, "Japan", "a country row names the country, never a city");
  assert.deepEqual(b.marketKeys, ["kyoto"]);
  assert.deepEqual(b.months, cal.months, "a January–December season spans all twelve months");
});

test("V4 Where to go carries all eight markets", async () => {
  const cal = await loadEventsCalendar(now);
  assert.deepEqual(cal.places.map((p) => p.marketKey), OPERATING_MARKETS.map((m) => m.marketKey));
});

test("V5 the vertical is carried; unstated is null", async () => {
  const cal = await loadEventsCalendar(now);
  assert.equal(cal.events.find((x) => x.id === ids.tonight)!.vertical, "music");
  assert.equal(cal.events.find((x) => x.id === ids.future)!.vertical, null);
  assert.equal(cal.events.find((x) => x.id === ids.future)!.venueLocality, null, "no locality stored, none claimed");
});
