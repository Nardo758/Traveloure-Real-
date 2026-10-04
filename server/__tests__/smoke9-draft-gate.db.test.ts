/**
 * Smoke 9 S9-1 — anchor rows are not items for the free-draft gate (ledger `2026-10-04-smoke9-fixes`).
 *
 *   G1 a plan holding a hotel stay + a flight in + a flight out (and therefore two airport legs, which
 *      are derived and never stored) counts 0 draft items and is ELIGIBLE; the draft runs and the
 *      stay SURVIVES the snapshot's rebuild delete
 *   G2 a plan holding one ordinary stop is still REFUSED (409 `slip_has_items`, count 1)
 *   G3 the plancard carries the server's own count (`draftItemCount`) for "Draft it with AI"
 *
 * DISPOSABLE DB ONLY: every row is keyed by a per-run prefix and deleted afterwards.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { saveGeneratedItinerarySnapshot } from "../services/content-query.service";
import {
  AI_DRAFT_REFUSAL_ERROR,
  aiDraftRefusalBody,
  countTripItineraryItems,
  resolveAiDraftEligibility,
} from "../services/ai-draft-eligibility";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `s9g-${RUN}-${s}`;
const OWNER = id("owner");
const T_STAY = id("stay");
const T_STOP = id("stop");

async function trip(tripId: string) {
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status, event_type)
    VALUES (${tripId}, ${OWNER}, ${`S9 ${RUN}`}, 'Kyoto, Japan', '2027-11-11', '2027-11-14', 'draft', 'vacation')`);
}

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${OWNER}, ${`${OWNER}@t.test`}, 'traveler')`);
  for (const t of [T_STAY, T_STOP]) await trip(t);
  // The hotel stay is an itinerary item (a chosen lodging set writes one); the flights are anchors.
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, item_type, origin, routing_status)
    VALUES (${id("hotel")}, ${T_STAY}, 1, 'Hotel Granvia Kyoto', 'accommodation', 'traveler', 'in_planning')`);
  for (const [k, type, at] of [["in", "flight_arrival", "2027-11-11T09:05:00"], ["out", "flight_departure", "2027-11-14T17:40:00"]] as const) {
    await db.execute(sql`INSERT INTO temporal_anchors (id, trip_id, anchor_type, anchor_datetime, location, is_immovable)
      VALUES (${id(k)}, ${T_STAY}, ${type}, ${at}, 'KIX', true)`);
  }
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, item_type, origin)
    VALUES (${id("kinkaku")}, ${T_STOP}, 1, 'Kinkaku-ji', 'attraction', 'traveler')`);
});

after(async () => {
  for (const t of ["ai_generated_itineraries", "itinerary_comparisons", "itinerary_items", "temporal_anchors"]) {
    await db.execute(sql.raw(`DELETE FROM ${t} WHERE trip_id LIKE 's9g-${RUN}-%'`)).catch(() => {});
  }
  await db.execute(sql`DELETE FROM trips WHERE id LIKE ${`s9g-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${OWNER}`).catch(() => {});
});

test("G1 hotel + two flights (+ two derived airport legs) ⇒ draft allowed, and the stay survives the draft", async () => {
  assert.equal(await countTripItineraryItems(T_STAY), 0);
  const v = await resolveAiDraftEligibility(T_STAY);
  assert.equal(v.eligible, true);
  await saveGeneratedItinerarySnapshot({
    userId: OWNER,
    tripId: T_STAY,
    trip: { title: `S9 ${RUN}`, destination: "Kyoto, Japan", startDate: "2027-11-11", endDate: "2027-11-14", numberOfTravelers: 1, status: "draft", eventType: "", specialRequests: null },
    generatedPlan: { destination: "Kyoto, Japan", startDate: "2027-11-11", endDate: "2027-11-14" },
    canonicalItems: [{ title: `Kiyomizu-dera ${RUN}`, description: "", type: "activity", dayNumber: 2, time: "09:00", durationMinutes: 60, location: "Higashiyama", estimatedCost: "0" } as any],
    comparison: { destination: "Kyoto, Japan" },
  } as any);
  const rows = (await db.execute(sql`SELECT title, item_type FROM itinerary_items WHERE trip_id = ${T_STAY} ORDER BY title`)).rows as any[];
  assert.ok(rows.some((r) => r.title === "Hotel Granvia Kyoto" && r.item_type === "accommodation"), "the lodging anchor is never rebuilt");
  assert.ok(rows.some((r) => r.title === `Kiyomizu-dera ${RUN}`), "the draft landed");
});

test("G2 one ordinary stop ⇒ still refused with 409 slip_has_items", async () => {
  assert.equal(await countTripItineraryItems(T_STOP), 1);
  const v = await resolveAiDraftEligibility(T_STOP);
  assert.equal(v.eligible, false);
  if (v.eligible) return;
  const body = aiDraftRefusalBody(v);
  assert.equal(body.error, AI_DRAFT_REFUSAL_ERROR);
  assert.equal(body.itemCount, 1);
});

test("G3 the plancard carries the gate's own count for the slip's Draft button", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const route = readFileSync(path.join(here, "../routes/plancard.routes.ts"), "utf8");
  assert.match(route, /const draftItemCount = await countTripItineraryItems\(tripId\);/);
  assert.match(route, /\n\s+draftItemCount,\n/);
  const rail = readFileSync(path.join(here, "../../client/src/components/plancard/SlipRail.tsx"), "utf8");
  assert.match(rail, /slipBuildAiAction\(slipDraftItemCount\(planGate\?\.draftItemCount, activities\.length\)\)/);
  assert.doesNotMatch(rail, /slipBuildAiAction\(activities\.length\)/);
});
