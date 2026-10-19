/**
 * FB-1 step 4b (ledger `2026-10-19-fb1-free-retime`), on a real database: a FREE plan's retime fix on tap.
 *
 * A two-day Kyoto plan, Mon–Tue 2027-11-08/09, no Trip Pass. Day 1: the Temple at 08:00 (opens 9:00), the Market at
 * 09:30 — the fix moves the Temple to 9:00 AM and the Market to 10:00 AM. Day 2: the Pagoda at 08:00 (opens 9:00), the
 * Garden at 09:30 but open only 9–10 — moving the Garden would make it start after closing, so day 2 gets no tap.
 *
 *   RT1 the read offers day 1's fix with its moves, and not day 2's (it would add a problem)
 *   RT2 preview writes nothing and returns the same moves
 *   RT3 apply writes the stored "h:mm AM/PM" times; the issue is gone; a second apply is 409 no_fix
 *   RT4 a stranger is one 404; a paid plan (Trip Pass) gets no fixes here and its apply is 409 paid_plan
 *
 * DISPOSABLE DB ONLY.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

process.env.STRIPE_SECRET_KEY ||= "sk_test_fb1_free";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.GOOGLE_MAPS_API_KEY;
delete process.env.TRAVEL_TIME_SERVICE_ENABLED;
const { db, pool } = await import("../db");
const { recordFacts } = await import("../services/content-facts/place-facts.service");
const { loadFreeRetimeFixes, applyFreeRetimeFix, FreeRetimeError } = await import("../services/free-retime.service");
const { loadPlanCheckInput } = await import("../services/optimizer-lead.service");
const { checkPlan } = await import("@shared/plan-check");

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `fb1r-${RUN}-${s}`;
const owner = id("owner");
const stranger = id("stranger");
const trip = id("trip");
const paid = id("paid");
const NOW = new Date();
const later = (d: number) => new Date(NOW.getTime() + d * 86_400_000);

const hours = (tripId: string, k: string, lines: string[]) =>
  recordFacts(
    [{
      placeRefKind: "place_id", placeRef: `ChIJ-fb1r-${RUN}-${tripId}-${k}`, placeLat: null, placeLng: null, market: "kyoto", need: "stop.hours", factType: "hours",
      value: { text: lines.join("; "), quote: lines.join("; "), weekdayDescriptions: lines },
      origin: "crawled", sourceId: null, sourceUrl: "https://official.example.jp/", license: "official", fetchedAt: NOW, expiresAt: later(30), costCents: 0,
    } as any],
    { planId: tripId, itemId: `${tripId}-${k}` },
  );
const WEEK = ["Monday: 9:00 AM – 5:00 PM", "Tuesday: 9:00 AM – 5:00 PM"];

async function seed(tripId: string) {
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, start_date, end_date, status)
    VALUES (${tripId}, ${owner}, 'FB-1 free', 'Kyoto, Japan', 'kyoto', '2027-11-08', '2027-11-09', 'draft')`);
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, item_type, start_time, duration_minutes, origin, sort_order) VALUES
    (${`${tripId}-t`}, ${tripId}, 1, 'Temple', 'activity', '08:00', 60, 'ai', 1),
    (${`${tripId}-m`}, ${tripId}, 1, 'Market', 'activity', '09:30', 60, 'ai', 2),
    (${`${tripId}-p`}, ${tripId}, 2, 'Pagoda', 'activity', '08:00', 60, 'ai', 1),
    (${`${tripId}-g`}, ${tripId}, 2, 'Garden', 'activity', '09:30', 30, 'ai', 2)`);
  await hours(tripId, "t", WEEK);
  await hours(tripId, "m", WEEK);
  await hours(tripId, "p", WEEK);
  await hours(tripId, "g", ["Monday: 9:00 AM – 10:00 AM", "Tuesday: 9:00 AM – 10:00 AM"]);
}
const times = async (tripId: string) =>
  Object.fromEntries(((await db.execute(sql`SELECT id, start_time FROM itinerary_items WHERE trip_id = ${tripId}`)).rows as any[]).map((r) => [r.id, r.start_time]));

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) throw new Error("refusing a non-disposable database");
  for (const u of [owner, stranger]) await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${u}, ${`${u}@t.test`}, 'traveler')`);
  await seed(trip);
  await seed(paid);
  await db.execute(sql`INSERT INTO trip_entitlements (id, trip_id, plan_key, status, source) VALUES (${`${paid}-pass`}, ${paid}, 'trip_pass', 'active', 'manual')`);
});

after(async () => {
  await db.execute(sql`DELETE FROM trips WHERE id IN (${trip}, ${paid})`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id IN (${owner}, ${stranger})`).catch(() => {});
  await pool.end();
});

test("RT1 the read offers day 1's fix with its moves, and not day 2's", async () => {
  const fixes = await loadFreeRetimeFixes(trip, owner);
  assert.deepEqual(fixes.map((f) => [f.day, f.itemId]), [[1, `${trip}-t`]]);
  assert.deepEqual(fixes[0].moves.map((m) => [m.itemId, m.fromMin, m.toMin]), [[`${trip}-t`, 480, 540], [`${trip}-m`, 570, 600]]);
});

test("RT2 preview writes nothing and returns the same moves", async () => {
  const before = await times(trip);
  const out = await applyFreeRetimeFix({ tripId: trip, userId: owner, itemId: `${trip}-t`, preview: true });
  assert.equal(out.moves.length, 2);
  assert.deepEqual(await times(trip), before);
});

test("RT3 apply writes the stored times; the issue is gone; a second apply is 409 no_fix", async () => {
  await applyFreeRetimeFix({ tripId: trip, userId: owner, itemId: `${trip}-t`, preview: false });
  const t = await times(trip);
  assert.equal(t[`${trip}-t`], "9:00 AM");
  assert.equal(t[`${trip}-m`], "10:00 AM");
  assert.equal(t[`${trip}-p`], "08:00", "day 2 untouched");
  const { input } = await loadPlanCheckInput(trip);
  assert.equal(checkPlan(input).issues.some((i) => i.stop?.itemId === `${trip}-t`), false);
  await assert.rejects(applyFreeRetimeFix({ tripId: trip, userId: owner, itemId: `${trip}-t`, preview: false }), (e: any) => e instanceof FreeRetimeError && e.status === 409 && e.code === "no_fix");
});

test("RT4 a stranger is one 404; a paid plan gets no fixes here", async () => {
  await assert.rejects(loadFreeRetimeFixes(trip, stranger), (e: any) => e instanceof FreeRetimeError && e.status === 404);
  await assert.rejects(applyFreeRetimeFix({ tripId: trip, userId: stranger, itemId: `${trip}-p`, preview: true }), (e: any) => e instanceof FreeRetimeError && e.status === 404);
  assert.deepEqual(await loadFreeRetimeFixes(paid, owner), []);
  await assert.rejects(applyFreeRetimeFix({ tripId: paid, userId: owner, itemId: `${paid}-t`, preview: true }), (e: any) => e instanceof FreeRetimeError && e.code === "paid_plan");
});
