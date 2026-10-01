/**
 * A6 (4) — an expert confirms a crawled fact into a verified nugget (ledger
 * `2026-10-01-a6-expert-confirm`; content sourcing brief §8).
 *
 *   F1  isConfirmableFact: only an unverified `crawled` fact outside partner/restricted licenses —
 *       never a Google Maps fact, never a traveler note
 *   F2  confirming writes a NEW `expert_nugget` row (verified_by, verified_at, the statement, a pointer
 *       back; no quote, no source URL, no license) that `isPublishable` accepts, and the crawled row
 *       now points at it; the plan's facts show the nugget, not the crawled fact
 *   F3  a second confirm — repeated or concurrent — is refused; exactly one nugget exists
 *   F4  a Places fact is not confirmable (409); a fact on another plan is 404
 *   F5  the plan's fact views carry the row id and the server's `confirmable` answer
 *   F6  the route checks the §12 write-status advisor and the byline gate BEFORE it writes
 *
 * DISPOSABLE DB ONLY: rows keyed by a per-run prefix and deleted afterwards.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../db";
import { placeFacts } from "@shared/schema";
import { isConfirmableFact, isPublishable } from "@shared/content-facts";
import { FactConfirmError, confirmFactAsNugget, factsForTrip, recordFacts } from "../services/content-facts/place-facts.service";
import type { FactDraft } from "../services/content-facts/source-adapter";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `a6c-${RUN}-${s}`;
const ids = { owner: id("owner"), expert: id("expert"), trip: id("trip"), other: id("other"), item: id("item"), item2: id("item2"), item3: id("item3") };

const draft = (over: Partial<FactDraft>): FactDraft => ({
  placeRefKind: "free_text", placeRef: "Kinkaku-ji Kyoto", placeLat: null, placeLng: null, market: "kyoto",
  need: "stop.hours", factType: "hours", value: { text: "Open 9:00–17:00 daily.", quote: "9:00 to 17:00 every day" },
  origin: "crawled", sourceId: null, sourceUrl: "https://kyoto.travel/kinkakuji", license: "official",
  fetchedAt: new Date(), expiresAt: new Date(Date.now() + 7 * 86_400_000), costCents: 2.4, ...over,
});

async function factIdFor(itemId: string, origin: string): Promise<string> {
  const [r] = await db.select({ id: placeFacts.id }).from(placeFacts).where(sql`${placeFacts.itineraryItemId} = ${itemId} AND ${placeFacts.origin} = ${origin}`);
  return r.id;
}

before(async () => {
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES
    (${ids.owner}, ${`${ids.owner}@t.test`}, 'A6', 'Owner', 'traveler'),
    (${ids.expert}, ${`${ids.expert}@t.test`}, 'A6', 'Expert', 'expert')`);
  for (const t of [ids.trip, ids.other]) {
    await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status, event_type)
      VALUES (${t}, ${ids.owner}, 'A6 plan', 'Kyoto, Japan', '2027-05-03', '2027-05-06', 'draft', 'vacation')`);
  }
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, item_type, origin) VALUES
    (${ids.item}, ${ids.trip}, 1, 'Kinkaku-ji', 'attraction', 'ai'),
    (${ids.item2}, ${ids.trip}, 1, 'Ryoan-ji', 'attraction', 'ai'),
    (${ids.item3}, ${ids.other}, 1, 'Ginkaku-ji', 'attraction', 'ai')`);
  await recordFacts([draft({})], { planId: ids.trip, itemId: ids.item });
  await recordFacts([draft({ origin: "places_api", license: "restricted", value: { weekdayDescriptions: ["Monday: 9–5"] } })], { planId: ids.trip, itemId: ids.item2 });
  await recordFacts([draft({ placeRef: "Ginkaku-ji" })], { planId: ids.other, itemId: ids.item3 });
});

after(async () => {
  await db.execute(sql`DELETE FROM place_facts WHERE plan_id IN (${ids.trip}, ${ids.other})`);
  await db.execute(sql`DELETE FROM trips WHERE id IN (${ids.trip}, ${ids.other})`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.owner}, ${ids.expert})`);
  await pool.end();
});

test("F1: only an unverified crawled fact outside partner/restricted is confirmable", () => {
  assert.equal(isConfirmableFact({ origin: "crawled", license: "official" }), true);
  assert.equal(isConfirmableFact({ origin: "crawled", license: "editorial" }), true);
  assert.equal(isConfirmableFact({ origin: "crawled", license: "partner" }), false);
  assert.equal(isConfirmableFact({ origin: "crawled", license: "restricted" }), false);
  assert.equal(isConfirmableFact({ origin: "crawled", license: "official", verifiedAt: new Date() }), false);
  assert.equal(isConfirmableFact({ origin: "places_api", license: "restricted" }), false);
  assert.equal(isConfirmableFact({ origin: "traveler_note", license: null }), false);
  assert.equal(isConfirmableFact({ origin: "expert_nugget", license: null }), false);
});

test("F5: the plan's fact views carry the row id and the server's confirmable answer", async () => {
  const views = await factsForTrip(ids.trip);
  const crawled = views[ids.item]?.[0];
  assert.ok(crawled?.id);
  assert.equal(crawled?.confirmable, true);
  assert.equal(views[ids.item2]?.[0]?.confirmable, false);
});

test("F2: confirming writes a verified, publishable nugget and supersedes the crawled row", async () => {
  const crawledId = await factIdFor(ids.item, "crawled");
  const { nuggetId } = await confirmFactAsNugget({ tripId: ids.trip, factId: crawledId, expertId: ids.expert });
  const [n] = await db.select().from(placeFacts).where(eq(placeFacts.id, nuggetId));
  assert.equal(n.origin, "expert_nugget");
  assert.equal(n.verifiedBy, ids.expert);
  assert.ok(n.verifiedAt);
  assert.equal(n.license, null);
  assert.equal(n.sourceUrl, null);
  assert.deepEqual(n.value, { text: "Open 9:00–17:00 daily.", confirmedFromFactId: crawledId });
  assert.equal(Number(n.costCents), 0);
  assert.equal(isPublishable({ origin: n.origin, license: n.license, verifiedAt: n.verifiedAt }), true);
  const [old] = await db.select().from(placeFacts).where(eq(placeFacts.id, crawledId));
  assert.equal(old.supersededBy, nuggetId);
  const views = await factsForTrip(ids.trip);
  assert.equal(views[ids.item]?.[0]?.id, nuggetId);
  assert.match(views[ids.item]?.[0]?.provenance ?? "", /A local expert · verified/);
});

test("F3: a second confirm is refused and only one nugget exists", async () => {
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, item_type, origin) VALUES (${id("race")}, ${ids.trip}, 2, 'Nijo', 'attraction', 'ai')`);
  await recordFacts([draft({ placeRef: "Nijo" })], { planId: ids.trip, itemId: id("race") });
  const factId = await factIdFor(id("race"), "crawled");
  const results = await Promise.allSettled([1, 2, 3].map(() => confirmFactAsNugget({ tripId: ids.trip, factId, expertId: ids.expert })));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  for (const r of results) if (r.status === "rejected") assert.ok(r.reason instanceof FactConfirmError && r.reason.status === 409);
  const nuggets: any = await db.execute(sql`SELECT count(*)::int AS n FROM place_facts WHERE itinerary_item_id = ${id("race")} AND origin = 'expert_nugget'`);
  assert.equal((nuggets.rows ?? nuggets)[0].n, 1);
  await assert.rejects(confirmFactAsNugget({ tripId: ids.trip, factId, expertId: ids.expert }), (e: unknown) => e instanceof FactConfirmError && e.code === "already_superseded");
});

test("F4: a Places fact is not confirmable; another plan's fact is 404", async () => {
  const placesId = await factIdFor(ids.item2, "places_api");
  await assert.rejects(confirmFactAsNugget({ tripId: ids.trip, factId: placesId, expertId: ids.expert }), (e: unknown) => e instanceof FactConfirmError && e.code === "not_confirmable" && e.status === 409);
  const otherId = await factIdFor(ids.item3, "crawled");
  await assert.rejects(confirmFactAsNugget({ tripId: ids.trip, factId: otherId, expertId: ids.expert }), (e: unknown) => e instanceof FactConfirmError && e.status === 404);
});

test("F6: the route gates on the write-status advisor and the byline before writing", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "server/routes/content-facts.routes.ts"), "utf8");
  const handler = src.slice(src.indexOf('"/api/trips/:tripId/place-facts/:factId/confirm"'));
  const advisor = handler.indexOf("isTripAdvisorWithWriteAccess(");
  const byline = handler.indexOf("checkBylineEligibility(");
  const write = handler.indexOf("confirmFactAsNugget(");
  assert.ok(advisor > 0 && byline > advisor && write > byline, "advisor gate, then byline gate, then the write");
  assert.match(handler, /expertId: userId/);
});
