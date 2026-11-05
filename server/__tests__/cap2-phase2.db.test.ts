/**
 * CAP-2 Phase 2 (ledger `2026-11-05-cap2-phase2-cards`): the server half.
 *
 *   D1  "Plan around it" (`landRefOnNewPlan`): the city event lands on the new plan as an item — server identity, its
 *       own day, its known time and its venue point.
 *   D2  a refused event (withdrawn) writes no item and never throws — the plan stands.
 *   D3  an event's start hint is used for the day only when the event row states none; the row's own start wins.
 *
 * Disposable database only. Every row this file writes is removed in after().
 *
 * Run: npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/cap2-phase2.db.test.ts
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { itineraryItems } from "@shared/schema";
import { landRefOnNewPlan } from "../services/plan-item-ref-write.service";
import { resolvePlanItemRef, setFeverEventLookupForTests } from "../services/guest-item-source.service";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
if (process.env.JOURNEY_DB_WRITES_OK !== "1") {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://x@invalid/x").hostname.toLowerCase();
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`refusing to write to non-disposable database host ${host}`);
}

const R = `cap2b-${crypto.randomUUID().slice(0, 6)}`;
const USER = `${R}-user`;
const TRIP = `${R}-trip`;
const KYOTO = new Set(["kyoto"]);

before(async () => {
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${USER}, ${`${R}@traveloure-qa.test`}, 'user')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, market_slug)
    VALUES (${TRIP}, ${USER}, 'CAP-2 phase 2', 'Kyoto, Japan', '2026-12-09', '2026-12-12', 'kyoto')`);
  await db.execute(sql`INSERT INTO city_events (id, source, source_id, title, city, venue, venue_lat, venue_lng, starts_at, nights, start_time_known, withdrawn_at) VALUES
    (${`${R}-ce`}, 'manual', ${`${R}-around`}, 'CAP-2 night temple', 'Kyoto', 'Kodai-ji', 35.0006, 135.7810, '2026-12-10T09:30:00Z', 1, true, NULL),
    (${`${R}-ce-w`}, 'manual', ${`${R}-gone`}, 'CAP-2 gone', 'Kyoto', 'To-ji', 34.98, 135.74, '2026-12-10T09:30:00Z', 1, true, NOW())`);
});

after(async () => {
  setFeverEventLookupForTests(null);
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${TRIP}`);
  await db.execute(sql`DELETE FROM trips WHERE id = ${TRIP}`);
  await db.execute(sql`DELETE FROM city_events WHERE id LIKE ${R + "%"}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${USER}`);
});

describe("CAP-2 Phase 2 — server", () => {
  it("D1 Plan around it lands the city event as an item", async () => {
    const out = await landRefOnNewPlan({ id: TRIP, startDate: "2026-12-09", endDate: "2026-12-12" }, { kind: "city_event", source_id: `${R}-around`, city: "Kyoto" });
    assert.ok(out.ok, JSON.stringify(out));
    const [row] = await db.select().from(itineraryItems).where(eq(itineraryItems.id, (out as any).itemId));
    assert.equal(row.contentType, "city_event");
    assert.equal(row.contentId, `${R}-around`);
    assert.equal(row.title, "CAP-2 night temple");
    assert.equal(String(row.scheduledDate).slice(0, 10), "2026-12-10");
    assert.equal(row.dayNumber, 2);
    assert.equal(row.startTime, "18:30");
    assert.equal(String(row.latitude), "35.0006000");
    assert.equal(row.origin, "traveler");
    // A second landing answers the same item (one per source, migration 436).
    const again = await landRefOnNewPlan({ id: TRIP, startDate: "2026-12-09", endDate: "2026-12-12" }, { kind: "city_event", source_id: `${R}-around`, city: "Kyoto" });
    assert.ok(again.ok && (again as any).itemId === (out as any).itemId);
  });

  it("D2 a withdrawn event writes nothing and does not throw", async () => {
    const before = (await db.select().from(itineraryItems).where(eq(itineraryItems.tripId, TRIP))).length;
    const out = await landRefOnNewPlan({ id: TRIP, startDate: "2026-12-09", endDate: "2026-12-12" }, { kind: "city_event", source_id: `${R}-gone`, city: "Kyoto" });
    assert.deepEqual(out, { ok: false, reason: "source_withdrawn" });
    assert.equal((await db.select().from(itineraryItems).where(eq(itineraryItems.tripId, TRIP))).length, before);
  });

  it("D3 an event's start hint fills the day only when the row has none", async () => {
    setFeverEventLookupForTests(async (id) => (id === `${R}-live` ? { title: "Live, no dates", city: { name: "Kyoto" } } as any : null));
    const hinted = await resolvePlanItemRef({ kind: "event", source_id: `${R}-live`, city: "Kyoto", placement: { starts_at: "2026-12-11T09:00:00Z" } }, { markets: KYOTO });
    assert.ok(hinted.ok && hinted.source.eventDate === "2026-12-11", JSON.stringify(hinted));
    const rowWins = await resolvePlanItemRef({ kind: "city_event", source_id: `${R}-around`, city: "Kyoto", placement: { starts_at: "2026-12-12T09:00:00Z" } }, { markets: KYOTO });
    assert.ok(rowWins.ok && rowWins.source.eventDate === "2026-12-10", "the row's own start wins");
    const none = await resolvePlanItemRef({ kind: "event", source_id: `${R}-live`, city: "Kyoto" }, { markets: KYOTO });
    assert.ok(none.ok && none.source.eventDate == null, "no hint, no row date ⇒ no day");
  });
});
