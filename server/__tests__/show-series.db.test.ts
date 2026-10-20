/**
 * SH-1 item 5 — a series of shows on a real database (ledger `2026-10-19-sh1-show-dates`).
 *
 *   SD1  the event page of one show, on a day between shows: countdown "Next show <later date>", the four show dates
 *   SD2  on a show date: "On now"
 *   SD3  a withdrawn sibling is not a show date
 *   SD4  migration 399 withdraws the continuous-run row only while it is live; a second run changes nothing; nothing
 *        is deleted
 *
 * DISPOSABLE DB ONLY: rows keyed by a per-run prefix and deleted afterwards (SD4 restores the row it touched).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { cityEvents } from "@shared/schema";
import { loadEventPage } from "../services/event-page.service";

const RUN = crypto.randomUUID().slice(0, 8);
const KEY = `shows-${RUN}`;
const sid = (d: string) => `shows-${RUN}-${d}`;
const SHOWS = ["2026-10-14", "2026-10-22", "2026-10-28", "2026-11-05"];
const deps = (now: Date) => ({
  now,
  facts: async () => ({ event: { ticketUrl: null, marketKey: "kyoto" }, attributedFacts: [] }) as any,
  verifiedCount: async () => 0,
});
let original: { withdrawn_at: Date | null } | null = null;

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  await db.insert(cityEvents).values([
    ...SHOWS.map((d) => ({
      source: "manual",
      sourceId: sid(d),
      series: "Series test",
      title: `Series test ${RUN}`,
      city: "Kyoto",
      venue: "Test hall",
      startsAt: new Date(`${d}T17:30:00+09:00`),
      endsAt: new Date(`${d}T19:00:00+09:00`),
      nights: 1,
      startTimeKnown: true,
      seriesKey: KEY,
    })),
    {
      source: "manual",
      sourceId: sid("withdrawn"),
      title: `Series test ${RUN}`,
      city: "Kyoto",
      venue: "Test hall",
      startsAt: new Date("2026-10-20T17:30:00+09:00"),
      nights: 1,
      seriesKey: KEY,
      withdrawnAt: new Date(),
    },
  ] as any);
});

after(async () => {
  await db.execute(sql`DELETE FROM city_events WHERE source_id LIKE ${`shows-${RUN}-%`}`);
  if (original) {
    await db.execute(sql`UPDATE city_events SET withdrawn_at = ${original.withdrawn_at} WHERE source = 'manual' AND source_id = 'imagine-noh-2026'`);
  } else {
    await db.execute(sql`DELETE FROM city_events WHERE source = 'manual' AND source_id = 'imagine-noh-2026' AND title = ${`fixture ${RUN}`}`);
  }
  await pool.end();
});

test("SD1 — between shows: Next show, and the four show dates", async () => {
  const page = await loadEventPage(sid("2026-10-22"), deps(new Date("2026-10-19T03:00:00Z")));
  assert.ok(page);
  assert.equal(page!.countdown, "Next show Thu 22 Oct");
  assert.deepEqual(page!.showDates, SHOWS);
  const later = await loadEventPage(sid("2026-11-05"), deps(new Date("2026-10-23T03:00:00Z")));
  assert.equal(later!.countdown, "Next show Wed 28 Oct", "the series' next show, whichever show's page is read");
});

test("SD2 — on a show date: On now", async () => {
  const page = await loadEventPage(sid("2026-10-28"), deps(new Date("2026-10-28T05:00:00Z")));
  assert.equal(page!.countdown, "On now");
});

test("SD3 — a withdrawn sibling is not a show date", async () => {
  const page = await loadEventPage(sid("2026-10-14"), deps(new Date("2026-10-15T03:00:00Z")));
  assert.equal(page!.showDates!.includes("2026-10-20"), false);
  assert.equal(page!.countdown, "Next show Thu 22 Oct");
});

test("SD4 — migration 399 withdraws the run only while it is live, and deletes nothing", async () => {
  const existing = ((await db.execute(sql`SELECT withdrawn_at FROM city_events WHERE source = 'manual' AND source_id = 'imagine-noh-2026'`)) as any).rows;
  if (existing.length) original = { withdrawn_at: existing[0].withdrawn_at };
  if (!existing.length) {
    await db.execute(sql`INSERT INTO city_events (id, source, source_id, series, title, city, venue, starts_at, ends_at, nights)
      VALUES (${crypto.randomUUID()}, 'manual', 'imagine-noh-2026', 'IMAGINE NOH', ${`fixture ${RUN}`}, 'Kyoto', 'x', '2026-10-14T00:00:00+09:00', '2026-11-05T00:00:00+09:00', 23)`);
  } else {
    await db.execute(sql`UPDATE city_events SET withdrawn_at = NULL WHERE source = 'manual' AND source_id = 'imagine-noh-2026'`);
  }
  const migration = fs.readFileSync(path.join(process.cwd(), "server/migrations/399_imagine_noh_run_withdrawn.sql"), "utf8");
  await pool.query(migration);
  const first = ((await db.execute(sql`SELECT withdrawn_at FROM city_events WHERE source = 'manual' AND source_id = 'imagine-noh-2026'`)) as any).rows;
  assert.equal(first.length, 1, "the row is kept");
  assert.ok(first[0].withdrawn_at, "withdrawn");
  await pool.query(migration);
  const second = ((await db.execute(sql`SELECT withdrawn_at FROM city_events WHERE source = 'manual' AND source_id = 'imagine-noh-2026'`)) as any).rows;
  assert.equal(new Date(second[0].withdrawn_at).getTime(), new Date(first[0].withdrawn_at).getTime(), "a second run changes nothing");
});
