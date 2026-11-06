/**
 * VD-1b → CAP-2 Phase 3 (FU-CAP2-2; ruling, Nov 5, 2026: the Viator server add path is retired with the PlanActions
 * sweep). Viator is not a PlanItemRef kind — it has no row of ours to re-read — so nothing new takes a Viator code.
 *
 *   A1 the add-body builder, the admission module and the shared Viator item module are gone
 *   A2 the item-create rail refuses a body naming `viatorProductCode` (400 `unknown_kind`) before it parses the item
 *   A3 storage takes no Viator option; a client-sent content pair is still stripped
 *   A4 the suggestion replay drops a stray code and never stamps it
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/vd1b-viator-add-to-plan.db.test.ts
 */
import crypto from "node:crypto";
import fs from "node:fs";
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

test("A1 the Viator add modules are gone", () => {
  assert.equal(fs.existsSync("server/services/viator-item-admission.ts"), false);
  assert.equal(fs.existsSync("shared/viator-item.ts"), false);
  for (const f of ["server/routes.ts", "server/storage.ts", "client/src/components/add-to-experience-dialog.tsx", "client/src/lib/catalogue-search-copy.ts"]) {
    const src = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(src, /admitViatorAdd|viatorAddBody|itineraryItemViatorLinkSchema/, f);
  }
});

test("A2 the create rail refuses a Viator body by name, before the item parse", () => {
  const routes = fs.readFileSync("server/routes.ts", "utf8");
  const i = routes.indexOf('hasOwnProperty.call(req.body ?? {}, "viatorProductCode")');
  assert.ok(i > 0, "the refusal is on the rail");
  assert.match(routes.slice(i, i + 200), /status\(400\)\.json\(\{ code: "unknown_kind"/);
  assert.doesNotMatch(routes, /\.\.\.\(viatorProductCode \? \{ viatorProductCode \}/);
});

test("A3 storage stamps no Viator pair; a client content pair is still stripped", async () => {
  const forged = await storage.createItineraryItem({ tripId: TRIP, title: "forged", itemType: "activity", dayNumber: 1, contentType: "viator_product", contentId: "FORGED" } as any);
  const [row] = (await db.execute(sql`SELECT content_type, content_id FROM itinerary_items WHERE id = ${forged.id}`)).rows as any[];
  assert.equal(row.content_type, null);
  assert.equal(row.content_id, null);
  assert.doesNotMatch(fs.readFileSync("server/storage.ts", "utf8"), /opts\.viatorProductCode/);
});

test("A4 the replay drops a stray code and never stamps it", () => {
  const src = fs.readFileSync("server/services/expert-suggestions.service.ts", "utf8");
  assert.match(src, /const \{ viatorProductCode: _retired, contentLink, \.\.\.item \} = v/);
  assert.doesNotMatch(src, /\{ viatorProductCode \} :/);
});
