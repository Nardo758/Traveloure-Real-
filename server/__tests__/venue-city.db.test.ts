/**
 * SH-1 item 4 — the seed rows and the admin setting on a real database (ledger `2026-10-19-sh1-venue-city`).
 *
 *   VD1  F1 Suzuka and both YOASOBI rows are outside Kyoto: built with a Kyoto neighbourhood candidate right beside the
 *        venue, they still get NO neighbourhood — the nearest-neighbourhood fallback never runs for them
 *   VD2  a stored row that still carries a Kyoto neighbourhood is read as outside, with no neighbourhood and "In Osaka"
 *   VD3  the admin setting: unset reads null; a stored positive number is read; it is restored afterwards
 *
 * DISPOSABLE DB ONLY.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { MANUAL_CITY_EVENTS } from "../seeds/city-events.manual";
import { buildCityEventRow, loadOutsideCityThresholdKm, toCityEventCard } from "../services/city-events.service";
import { EVENT_OUTSIDE_CITY_THRESHOLD_SETTING, venueCityLabel } from "@shared/city-events";

let original: string | null | undefined;

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  const r = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = ${EVENT_OUTSIDE_CITY_THRESHOLD_SETTING}`);
  original = ((r as any).rows?.[0]?.setting_value as string | undefined) ?? null;
});

after(async () => {
  if (original === null) await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${EVENT_OUTSIDE_CITY_THRESHOLD_SETTING}`);
  else await db.execute(sql`UPDATE platform_settings SET setting_value = ${original} WHERE setting_key = ${EVENT_OUTSIDE_CITY_THRESHOLD_SETTING}`);
  await pool.end();
});

const OUTSIDE = ["japanese-grand-prix-2027", "yoasobi-chowakusei-osaka-2026-10-24", "yoasobi-chowakusei-osaka-2026-10-25"];

test("VD1 — the outside seed rows get no Kyoto neighbourhood, whatever is nearest", () => {
  // A placeholder point beside a placeholder Kyoto neighbourhood (not real places).
  const candidates = [{ id: "hood-beside", city: "Kyoto", lat: 0, lng: 0 }];
  for (const sourceId of OUTSIDE) {
    const entry = MANUAL_CITY_EVENTS.find((e) => e.sourceId === sourceId)!;
    assert.ok(entry, sourceId);
    const built = buildCityEventRow({ ...entry, venueLat: 0.0001, venueLng: 0.0001 }, candidates, [], null);
    assert.ok("row" in built);
    assert.equal((built as any).row.neighbourhoodId, null, sourceId);
  }
  const inside = MANUAL_CITY_EVENTS.find((e) => e.sourceId === "mitsuko-uchida-kyoto-2026")!;
  const built = buildCityEventRow({ ...inside, venueLat: 0.0001, venueLng: 0.0001 }, candidates, [], null);
  assert.equal((built as any).row.neighbourhoodId, "hood-beside", "an in-city event still takes its neighbourhood");
});

test("VD2 — a stored row with a Kyoto neighbourhood is read as outside", () => {
  const entry = MANUAL_CITY_EVENTS.find((e) => e.sourceId === "yoasobi-chowakusei-osaka-2026-10-24")!;
  const built = buildCityEventRow(entry, [], [], null);
  const row = { ...(built as any).row, id: "x", createdAt: new Date(), withdrawnAt: null, neighbourhoodId: "stale" };
  const card = toCityEventCard(row, "Arashiyama", new Date("2026-10-01T00:00:00Z"), null);
  assert.equal(card.neighbourhood, null);
  assert.equal(card.outsideCity, true);
  assert.equal(venueCityLabel(card), "In Osaka");
});

test("VD3 — the admin setting", async () => {
  await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${EVENT_OUTSIDE_CITY_THRESHOLD_SETTING}`);
  assert.equal(await loadOutsideCityThresholdKm(), null, "unset");
  await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES (${EVENT_OUTSIDE_CITY_THRESHOLD_SETTING}, '12.5')`);
  assert.equal(await loadOutsideCityThresholdKm(), 12.5);
});
