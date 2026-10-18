/**
 * EV-P0 — CLOSURE AND TICKETING RULES, on a real database (ledger `2026-10-18-closure-ticketing-feasibility`).
 *
 *   CD1  recordFacts stores an official closure and ticketing rule (public + link_only) and refuses a free-text one
 *   CD2  the loader reads them: a stop on a closed date is closed_on_arrival citing the closure; an unbooked stop
 *        under a reservation rule is flagged; the same rule on a booked stop is not
 *   CD3  a closure stored by ANOTHER plan for the same place id applies (the registry's stored fact)
 *   CD4  one stop's own lines carry the closure and reservation words
 *
 * DISPOSABLE DB ONLY: rows keyed by a per-run prefix and deleted afterwards.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { recordFacts } from "../services/content-facts/place-facts.service";
import { loadPlanCheckInput, loadStopHours } from "../services/optimizer-lead.service";
import { checkPlan } from "@shared/plan-check";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `ckd-${RUN}-${s}`;
const owner = id("owner");
const trip = id("trip");
const other = id("other");
const PLACE_K = id("place-kinkaku");
const PLACE_G = id("place-ghibli");
const PLACE_B = id("place-booked");
const SRC = "https://www.example-temple.jp/visit/";

const draft = (over: Record<string, unknown>) => ({
  placeRefKind: "place_id",
  placeRef: PLACE_K,
  placeLat: null,
  placeLng: null,
  market: "kyoto",
  need: "stop.hours",
  factType: "closure",
  value: {},
  origin: "crawled",
  sourceId: null,
  sourceUrl: SRC,
  license: "official",
  fetchedAt: new Date(),
  expiresAt: new Date(Date.now() + 30 * 86_400_000),
  costCents: 0,
  ...over,
}) as any;

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${owner}, ${`${owner}@t.test`}, 'traveler')`);
  for (const t of [trip, other]) {
    await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, start_date, end_date, status)
      VALUES (${t}, ${owner}, 'Closures', 'Kyoto, Japan', 'kyoto', '2026-12-29', '2026-12-31', 'draft')`);
  }
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, start_time, duration_minutes, origin, sort_order, google_place_id, booking_id, routing_status) VALUES
    (${id("k")}, ${trip}, 1, 'Kinkaku-ji', '10:00', 60, 'traveler', 1, ${PLACE_K}, NULL, 'in_planning'),
    (${id("g")}, ${trip}, 2, 'Ghibli Museum', '11:00', 120, 'traveler', 1, ${PLACE_G}, NULL, 'in_planning'),
    (${id("b")}, ${trip}, 3, 'Booked tea ceremony', '14:00', 60, 'traveler', 1, ${PLACE_B}, NULL, 'purchased')`);
});

after(async () => {
  await db.execute(sql`DELETE FROM place_facts WHERE place_ref IN (${PLACE_K}, ${PLACE_G}, ${PLACE_B})`);
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id IN (${trip}, ${other})`);
  await db.execute(sql`DELETE FROM trips WHERE id IN (${trip}, ${other})`);
  await db.execute(sql`DELETE FROM users WHERE id = ${owner}`);
  await pool.end();
});

test("CD1 — the writer stores structured official closures and rules, tagged, and refuses free text", async () => {
  // Stored by ANOTHER plan for Kinkaku-ji's place id (CD3): the year-end closure, printed in the quote.
  await recordFacts(
    [draft({ value: { closedRanges: [{ from: "2026-12-29", to: "2027-01-03" }], quote: "年末年始（12月29日～1月3日）は拝観休止", text: "Closed for the new year" } })],
    { planId: other, itemId: null },
  );
  await recordFacts(
    [draft({ placeRef: PLACE_G, factType: "ticketing_rule", need: "stop.ticketing", value: { reservationRequired: true, bookAheadDays: 30, quote: "Advance reservation required; tickets go on sale 30 days ahead.", text: "Reservation required" } })],
    { planId: trip, itemId: id("g") },
  );
  await recordFacts(
    [draft({ placeRef: PLACE_B, factType: "ticketing_rule", need: "stop.ticketing", value: { reservationRequired: true, quote: "Reservation required.", text: "Reservation required" } })],
    { planId: trip, itemId: id("b") },
  );
  await recordFacts([draft({ value: { text: "Closed on some days" } })], { planId: trip, itemId: id("k") });
  const rows: any = await db.execute(sql`SELECT fact_type, source_class, reuse_class, value FROM place_facts WHERE place_ref IN (${PLACE_K}, ${PLACE_G}, ${PLACE_B}) ORDER BY fact_type, place_ref`);
  const list = rows.rows ?? rows;
  assert.equal(list.length, 3, "the free-text closure is refused");
  for (const r of list) assert.deepEqual([r.source_class, r.reuse_class], ["public", "link_only"]);
});

test("CD2 + CD3 — the loader reads them into the plan check", async () => {
  const { input } = await loadPlanCheckInput(trip);
  const r = checkPlan(input);
  const closed = r.allFindings.find((f) => f.kind === "closed_on_arrival");
  assert.deepEqual(closed?.stops?.map((s) => s.itemId), [id("k")], "Kinkaku-ji on Dec 29, from the other plan's stored closure");
  const issue = r.issues.find((i) => i.stop?.itemId === id("k"))!;
  assert.equal(issue.why, "closed_day");
  assert.equal(issue.fix.action, "move_day");
  assert.equal(issue.source.kind, "official_fact");
  assert.equal(issue.source.url, SRC);
  const res = r.allFindings.find((f) => f.kind === "reservation_required");
  assert.deepEqual(res?.stops?.map((s) => s.itemId), [id("g")], "the purchased stop is not flagged");
  assert.equal(r.issues.some((i) => i.type === "reservation_required"), false);
});

test("CD4 — one stop's lines carry the closure and the reservation", async () => {
  const k = await loadStopHours(trip, id("k"));
  assert.deepEqual(k.lines, ["Kinkaku-ji · Day 1 · 10:00 is closed that day"]);
  const g = await loadStopHours(trip, id("g"));
  assert.deepEqual(g.lines, ["Ghibli Museum · Day 2 · 11:00 needs a reservation"]);
  const b = await loadStopHours(trip, id("b"));
  assert.deepEqual(b.lines, []);
});
