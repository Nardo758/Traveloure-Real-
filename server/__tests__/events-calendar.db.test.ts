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
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { cityEvents, destinationEvents } from "@shared/schema";
import { countdownLabel, localDate } from "@shared/city-events";
import { windowMonths } from "@shared/events-calendar";
import { OPERATING_MARKETS } from "@shared/operating-markets";
import { firstWindowMonth, loadEventsCalendar } from "../services/events-calendar.service";
import { listUpcomingCityEvents } from "../services/city-events.service";
import { invalidatePlatformFlagCache } from "../services/platform-flags";
import { destinationCalendarSeed, destinationEventSeedRow } from "../seed-destination-calendar";

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

const OLD_HANAMI = "Cherry Blossom Festival (Hanami)";
const NEW_HANAMI = "Cherry blossom season (Hanami)";
const OLD_HANAMI_TIPS = "Book hotels 3-6 months in advance. Ueno Park and Shinjuku Gyoen are popular spots.";
const KOYO = "Autumn Foliage Season (Koyo)";
const OLD_KOYO_TIPS = "Kyoto's temples and Tokyo's gardens are spectacular during this time.";
const KOYO_DESCRIPTION = "Brilliant red and orange autumn colors across Japan.";
const MIGRATION_SQL = fs.readFileSync(path.resolve(import.meta.dirname, "../migrations/405_season_band_copy.sql"), "utf8");
const KOYO_TIPS_SQL = fs.readFileSync(path.resolve(import.meta.dirname, "../migrations/407_koyo_country_tips.sql"), "utf8");

test("seed output: Hanami and Koyo are season bands with no city tips and no window dates", () => {
  const japan = destinationCalendarSeed.find((d) => d.country === "Japan");
  assert.ok(japan);
  const hanami = japan!.events.find((e) => e.title === NEW_HANAMI);
  const koyo = japan!.events.find((e) => e.title === KOYO);
  assert.ok(hanami && koyo);
  assert.equal(hanami!.eventType, "season");
  assert.equal(hanami!.tips, null);
  assert.equal(hanami!.startMonth, 3);
  assert.equal(hanami!.endMonth, 4);
  assert.equal(koyo!.eventType, "season");
  assert.equal(koyo!.tips, null);
  assert.equal(koyo!.title, KOYO);
  assert.equal(japan!.events.some((e) => e.title === OLD_HANAMI), false);
  assert.equal(japan!.events.find((e) => e.title === "Golden Week")!.eventType, "holiday");
  for (const event of japan!.events) {
    const row = destinationEventSeedRow("Japan", event);
    assert.equal("city" in row, false, `${event.title} is country-level`);
    assert.equal(row.country, "Japan");
    assert.equal(row.status, "approved");
  }
  assert.equal(destinationEventSeedRow("Japan", hanami!).tips, null);
  assert.equal(destinationEventSeedRow("Japan", hanami!).eventType, "season");
  const src = fs.readFileSync(path.resolve(import.meta.dirname, "../seed-destination-calendar.ts"), "utf8");
  const writer = src.slice(src.indexOf("export async function seedDestinationCalendar"));
  assert.ok(writer.startsWith("export async function seedDestinationCalendar"));
  assert.equal(writer.includes("season_windows"), false, "the seed writes no window setting");
  assert.equal(writer.includes("platform_settings"), false, "the seed writes no window setting");
  assert.equal(/\d{4}-\d{2}-\d{2}/.test(JSON.stringify(destinationCalendarSeed)), false, "the seed contains no window dates");
  assert.equal(/city:\s*["']Kyoto["']/.test(src), false, "the seed inserts no Kyoto city row");
});

test("V6 a window sets hasWindow, a windowless band is still returned, and a bad setting is no window", async () => {
  const months = windowMonths(firstWindowMonth(now));
  const march = months.find((m) => m.endsWith("-03"))!;
  const august = Number(months.find((m) => m.endsWith("-08"))!.slice(5));
  const marchMonth = Number(march.slice(5));
  const key = "season_windows_bogota";
  const prior = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = ${key}`);
  const priorValue = (prior.rows[0] as { setting_value?: string } | undefined)?.setting_value ?? null;
  const titles = [`Band ${RUN} bogota-march`, `Band ${RUN} bogota-august`];
  const restore = async () => {
    await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${key}`);
    if (priorValue !== null) {
      await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES (${key}, ${priorValue})`);
    }
    await db.execute(sql`DELETE FROM destination_events WHERE title IN (${titles[0]}, ${titles[1]})`);
    invalidatePlatformFlagCache(key);
  };
  try {
    await db.insert(destinationEvents).values([
      { country: "Colombia", title: titles[0], status: "approved", startMonth: marchMonth, endMonth: marchMonth, city: "Bogotá" },
      { country: "Colombia", title: titles[1], status: "approved", startMonth: august, endMonth: august, city: "Bogotá" },
    ]);
    await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${key}`);
    invalidatePlatformFlagCache(key);
    const none = await loadEventsCalendar(now);
    const marchBand = none.bands.find((b) => b.title === titles[0]);
    const augustBand = none.bands.find((b) => b.title === titles[1]);
    assert.ok(marchBand && augustBand, "both city bands are returned with no window entered");
    assert.equal(marchBand!.hasWindow, false);
    assert.equal(augustBand!.hasWindow, false);
    assert.equal(marchBand!.place, "Bogotá");
    assert.deepEqual(marchBand!.marketKeys, ["bogota"]);

    const windowJson = JSON.stringify([{ from: `${march}-10`, to: `${march}-20` }]);
    await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES (${key}, ${windowJson})`);
    invalidatePlatformFlagCache(key);
    const open = await loadEventsCalendar(now);
    assert.equal(open.bands.find((b) => b.title === titles[0])!.hasWindow, true);
    assert.equal(open.bands.find((b) => b.title === titles[1])!.hasWindow, false, "August does not overlap the March window, and is still returned");

    await db.execute(sql`UPDATE platform_settings SET setting_value = '{' WHERE setting_key = ${key}`);
    invalidatePlatformFlagCache(key);
    const bad = await loadEventsCalendar(now);
    assert.equal(bad.bands.find((b) => b.title === titles[0])!.hasWindow, false, "an unreadable setting is no window");
    assert.ok(bad.bands.some((b) => b.title === titles[0]));
  } finally {
    await restore();
  }
});

test("V7 a Kyoto city row overrides a same title and sits beside a different one", async () => {
  const same = `Band ${RUN} same-title`;
  const other = `Band ${RUN} city-only`;
  const countryOther = `Band ${RUN} country-other`;
  try {
    await db.insert(destinationEvents).values([
      { country: "Japan", title: same, status: "approved", startMonth: 3, endMonth: 4 },
      { country: "Japan", city: "Kyoto", title: same, status: "approved", startMonth: 3, endMonth: 4 },
      { country: "Japan", title: countryOther, status: "approved", startMonth: 7, endMonth: 7 },
      { country: "Japan", city: "Kyoto", title: other, status: "approved", startMonth: 7, endMonth: 7 },
    ]);
    const cal = await loadEventsCalendar(now);
    const sameBands = cal.bands.filter((b) => b.title === same);
    assert.equal(sameBands.length, 1, "the country row does not also show for Kyoto");
    assert.equal(sameBands[0].place, "Kyoto");
    assert.deepEqual(sameBands[0].marketKeys, ["kyoto"]);
    const cityOnly = cal.bands.find((b) => b.title === other);
    const country = cal.bands.find((b) => b.title === countryOther);
    assert.ok(cityOnly && country, "a different city title sits beside the country row");
    assert.equal(cityOnly!.place, "Kyoto");
    assert.equal(country!.place, "Japan");
    assert.deepEqual(country!.marketKeys, ["kyoto"]);
  } finally {
    await db.execute(sql`DELETE FROM destination_events WHERE title IN (${same}, ${other}, ${countryOther})`);
  }
});

test("migration 405 rewrites only the old country text, and a second run is a no-op", async () => {
  const client = await pool.connect();
  const id = (s: string) => `405-${RUN}-${s}`;
  const insert = async (key: string, v: { title: string; tips: string | null; eventType: string; city?: string | null; country?: string }) => {
    await client.query(
      `INSERT INTO destination_events (id, country, city, title, event_type, tips, status, start_month, end_month)
       VALUES ($1, $2, $3, $4, $5, $6, 'approved', 3, 4)`,
      [id(key), v.country ?? "Japan", v.city ?? null, v.title, v.eventType, v.tips],
    );
  };
  try {
    await client.query("BEGIN");
    await insert("hanami", { title: OLD_HANAMI, tips: OLD_HANAMI_TIPS, eventType: "festival" });
    await insert("hanami-blank-city", { title: OLD_HANAMI, tips: "city tip", eventType: "festival", city: "  " });
    await insert("hanami-edited", { title: "Cherry festivals of Kyoto", tips: OLD_HANAMI_TIPS, eventType: "festival" });
    await insert("hanami-city", { title: OLD_HANAMI, tips: "Kyoto parks", eventType: "festival", city: "Kyoto" });
    await insert("hanami-france", { title: OLD_HANAMI, tips: OLD_HANAMI_TIPS, eventType: "festival", country: "France" });
    await insert("koyo", { title: KOYO, tips: OLD_KOYO_TIPS, eventType: "season" });
    await insert("koyo-edited-tips", { title: KOYO, tips: "Edited by an admin", eventType: "cultural" });

    await client.query(MIGRATION_SQL);
    const one = async (key: string) => {
      const r = await client.query(`SELECT title, event_type, tips, city FROM destination_events WHERE id = $1`, [id(key)]);
      return r.rows[0] as { title: string; event_type: string; tips: string | null; city: string | null };
    };
    assert.deepEqual(await one("hanami"), { title: NEW_HANAMI, event_type: "season", tips: null, city: null });
    assert.equal((await one("hanami-blank-city")).title, NEW_HANAMI);
    assert.equal((await one("hanami-blank-city")).tips, null);
    assert.deepEqual(await one("hanami-edited"), { title: "Cherry festivals of Kyoto", event_type: "festival", tips: OLD_HANAMI_TIPS, city: null });
    assert.deepEqual(await one("hanami-city"), { title: OLD_HANAMI, event_type: "festival", tips: "Kyoto parks", city: "Kyoto" });
    assert.equal((await one("hanami-france")).title, OLD_HANAMI);
    assert.deepEqual(await one("koyo"), { title: KOYO, event_type: "season", tips: null, city: null });
    assert.deepEqual(await one("koyo-edited-tips"), { title: KOYO, event_type: "cultural", tips: "Edited by an admin", city: null });

    const snapshot = async () =>
      (await client.query(`SELECT id, country, city, title, event_type, tips FROM destination_events ORDER BY id`)).rows;
    const afterFirst = await snapshot();
    await client.query(MIGRATION_SQL);
    assert.deepEqual(await snapshot(), afterFirst, "a second run changes nothing");
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

test("migration 407 clears Koyo country tips only, a rerun is a no-op, and other bands are untouched", async () => {
  const client = await pool.connect();
  const id = (s: string) => `407-${RUN}-${s}`;
  const insert = async (key: string, v: {
    title: string;
    tips: string | null;
    eventType: string;
    city?: string | null;
    country?: string;
    description?: string;
    startMonth?: number;
    endMonth?: number;
  }) => {
    await client.query(
      `INSERT INTO destination_events (id, country, city, title, event_type, tips, description, status, start_month, end_month)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved', $8, $9)`,
      [
        id(key),
        v.country ?? "Japan",
        v.city ?? null,
        v.title,
        v.eventType,
        v.tips,
        v.description ?? KOYO_DESCRIPTION,
        v.startMonth ?? 10,
        v.endMonth ?? 11,
      ],
    );
  };
  type Row = {
    title: string;
    event_type: string;
    tips: string | null;
    description: string | null;
    city: string | null;
    country: string;
    start_month: number;
    end_month: number;
  };
  const one = async (key: string) => {
    const r = await client.query(
      `SELECT title, event_type, tips, description, city, country, start_month, end_month
       FROM destination_events WHERE id = $1`,
      [id(key)],
    );
    return r.rows[0] as Row;
  };
  try {
    await client.query("BEGIN");
    await insert("koyo", { title: KOYO, tips: OLD_KOYO_TIPS, eventType: "season" });
    await insert("koyo-blank-city", { title: KOYO, tips: OLD_KOYO_TIPS, eventType: "festival", city: "  " });
    await insert("koyo-city", { title: KOYO, tips: OLD_KOYO_TIPS, eventType: "season", city: "Kyoto" });
    await insert("koyo-edited", { title: KOYO, tips: "Edited by an admin", eventType: "cultural" });
    await insert("koyo-already-clear", { title: KOYO, tips: null, eventType: "season" });
    await insert("koyo-other-title", { title: "Autumn foliage in Kyoto", tips: OLD_KOYO_TIPS, eventType: "season" });
    await insert("koyo-france", { title: KOYO, tips: OLD_KOYO_TIPS, eventType: "season", country: "France" });
    await insert("hanami", { title: NEW_HANAMI, tips: null, eventType: "season", description: "Cherry blossoms.", startMonth: 3, endMonth: 4 });
    await insert("golden", {
      title: "Golden Week",
      tips: "Avoid traveling during this period as prices spike and attractions are crowded.",
      eventType: "holiday",
      description: "Week-long national holiday when many Japanese travel domestically.",
      startMonth: 5,
      endMonth: 5,
    });
    await insert("gion", {
      title: "Gion Matsuri",
      tips: "The main procession on July 17th draws massive crowds. Stay near Shijo Street.",
      eventType: "festival",
      description: "Kyoto's famous month-long festival with spectacular float processions.",
      startMonth: 7,
      endMonth: 7,
    });

    const before = {
      city: await one("koyo-city"),
      edited: await one("koyo-edited"),
      clear: await one("koyo-already-clear"),
      otherTitle: await one("koyo-other-title"),
      france: await one("koyo-france"),
      hanami: await one("hanami"),
      golden: await one("golden"),
      gion: await one("gion"),
    };

    await client.query(KOYO_TIPS_SQL);

    assert.deepEqual(await one("koyo"), {
      title: KOYO,
      event_type: "season",
      tips: null,
      description: KOYO_DESCRIPTION,
      city: null,
      country: "Japan",
      start_month: 10,
      end_month: 11,
    });
    assert.deepEqual(await one("koyo-blank-city"), {
      title: KOYO,
      event_type: "festival",
      tips: null,
      description: KOYO_DESCRIPTION,
      city: "  ",
      country: "Japan",
      start_month: 10,
      end_month: 11,
    });
    assert.deepEqual(await one("koyo-city"), before.city);
    assert.deepEqual(await one("koyo-edited"), before.edited);
    assert.deepEqual(await one("koyo-already-clear"), before.clear);
    assert.deepEqual(await one("koyo-other-title"), before.otherTitle);
    assert.deepEqual(await one("koyo-france"), before.france);
    assert.deepEqual(await one("hanami"), before.hanami);
    assert.deepEqual(await one("golden"), before.golden);
    assert.deepEqual(await one("gion"), before.gion);

    const snapshot = async () =>
      (await client.query(
        `SELECT id, country, city, title, event_type, tips, description, start_month, end_month
         FROM destination_events WHERE id LIKE $1 ORDER BY id`,
        [`407-${RUN}-%`],
      )).rows;
    const afterFirst = await snapshot();
    await client.query(KOYO_TIPS_SQL);
    assert.deepEqual(await snapshot(), afterFirst, "a second run changes nothing");
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
