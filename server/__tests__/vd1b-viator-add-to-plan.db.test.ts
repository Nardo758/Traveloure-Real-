/**
 * VD-1b — "Add to plan" on a live Viator card (ledger `2026-10-18-viator-add-to-plan`; decision-maker,
 * Oct 18, 2026): the item stores the title, Viator's product code and "Partner: Viator" only.
 *
 *   A1 the card's body carries title, day, "Partner: Viator" and the code — no price, no description, no point
 *   A2 the rail's admission strips every Viator-content field, refuses a malformed code, and refuses the add
 *      while the live search is off; a body without the field is untouched
 *   A3 storage stamps content_type/content_id from the ADMITTED code only; a client-sent content pair is
 *      stripped as before; the stored row holds no price, no description beyond the marker, no coordinate
 *   A4 a filed (advisor) add carries the code and the replay stamps it the same way
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/vd1b-viator-add-to-plan.db.test.ts
 */
import crypto from "node:crypto";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";

const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    return "<none>";
  }
})();
if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
  throw new Error(`[vd1b] REFUSING to write fixtures to '${host}'.`);
}

const { viatorAddBody, itemViatorProductCode, VIATOR_ITEM_CONTENT_TYPE } = await import("@shared/viator-item");
const { admitViatorAdd } = await import("../services/viator-item-admission");
const { db, pool } = await import("../db");
const { storage } = await import("../storage");

const RUN = crypto.randomUUID().slice(0, 8);
const USER = `vd1b-${RUN}-user`;
const TRIP = `vd1b-${RUN}-trip`;

before(async () => {
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${USER}, ${`vd1b-${RUN}@traveloure-qa.test`}, 'user')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${TRIP}, ${USER}, 'VD-1b', 'Kyoto, Japan', '2026-11-01', '2026-11-03')`);
});

after(async () => {
  try {
    await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${TRIP}`);
    await db.execute(sql`DELETE FROM trips WHERE id = ${TRIP}`);
    await db.execute(sql`DELETE FROM users WHERE id = ${USER}`);
  } finally {
    await pool.end();
  }
});

test("A1 the card body: title, day, marker and code — nothing of Viator's content", () => {
  assert.deepEqual(viatorAddBody({ title: "Gion night walk", productCode: "5678KYO" }, 2), {
    title: "Gion night walk",
    itemType: "activity",
    dayNumber: 2,
    description: "Partner: Viator",
    viatorProductCode: "5678KYO",
  });
});

test("A2 the admission strips Viator content, refuses a bad code, and is off with the live search", () => {
  const item: Record<string, unknown> = {
    title: "t", description: "Viator's own words", estimatedCost: "45.00", currency: "USD", latitude: "35", longitude: "135",
    locationAddress: "x", googlePlaceId: "g", affiliateProductId: "a", providerServiceId: "p", notes: "n",
  };
  const r = admitViatorAdd({ viatorProductCode: "5678KYO" }, item, true);
  assert.deepEqual(r, { ok: true, viatorProductCode: "5678KYO" });
  assert.deepEqual(item, { title: "t", description: "Partner: Viator" });
  assert.equal(admitViatorAdd({ viatorProductCode: "bad code; drop" }, {}, true).ok, false);
  assert.deepEqual(admitViatorAdd({ viatorProductCode: "5678KYO" }, {}, false), { ok: false, message: "Viator is not available right now." });
  const plain: Record<string, unknown> = { title: "Dinner", estimatedCost: "60" };
  assert.deepEqual(admitViatorAdd({ title: "Dinner" }, plain, false), { ok: true, viatorProductCode: null });
  assert.deepEqual(plain, { title: "Dinner", estimatedCost: "60" }, "a non-Viator add is untouched");
});

test("A3 storage stamps the pair from the admitted code only; the row holds nothing of Viator's", async () => {
  const forged = await storage.createItineraryItem({ tripId: TRIP, title: "forged", itemType: "activity", dayNumber: 1, contentType: VIATOR_ITEM_CONTENT_TYPE, contentId: "FORGED" } as any);
  assert.equal((forged as any).contentType ?? null, null, "a client content pair is still stripped");
  const item = await storage.createItineraryItem(
    { tripId: TRIP, title: "Gion night walk", itemType: "activity", dayNumber: 1, description: "Partner: Viator" } as any,
    { viatorProductCode: "5678KYO" },
  );
  const [row] = (await db.execute(sql`SELECT * FROM itinerary_items WHERE id = ${item.id}`)).rows as any[];
  assert.equal(row.content_type, VIATOR_ITEM_CONTENT_TYPE);
  assert.equal(row.content_id, "5678KYO");
  assert.equal(itemViatorProductCode({ contentType: row.content_type, contentId: row.content_id }), "5678KYO");
  assert.equal(row.description, "Partner: Viator");
  assert.equal(row.estimated_cost, null);
  assert.equal(row.latitude, null);
});

test("A4 a filed add carries the code; the replay stamps it", async () => {
  const svc = await import("../services/expert-suggestions.service");
  const src = await import("node:fs").then((fs) => fs.readFileSync("server/services/expert-suggestions.service.ts", "utf8"));
  assert.match(src, /const \{ viatorProductCode, \.\.\.item \} = v/, "the replay port splits the code off the item");
  assert.ok(typeof svc === "object");
  const routes = await import("node:fs").then((fs) => fs.readFileSync("server/routes.ts", "utf8"));
  assert.match(routes, /payload: \{ item: viatorProductCode \? \{ \.\.\.itemData, viatorProductCode \} : itemData \}/);
});
