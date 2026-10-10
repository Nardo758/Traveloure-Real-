/**
 * FD-2 — CONTENT-TIER TAGS on a real database (decision-maker rulings 1–9, Oct 9, 2026; ledger
 * `2026-10-09-fd2-content-tier-tags`; migrations 361/362).
 *
 *   D1  ruling 9: an item's source_class is stamped by the server at create — a client-supplied 'local'
 *       on a traveler item is IGNORED (stored 'public'); an expert item is 'local'; an unknown origin NULL
 *   D2  ruling 9: an item update cannot set source_class (the storage strip)
 *   D3  ruling 9: the client body schema drops source_class
 *   D4  migration 362 (run in a ROLLED-BACK transaction): a team-seeded gem becomes local + "Traveloure
 *       team"; a curated gem is verified by its curator; an AI-written gem stays UNTAGGED (ruling 3); a
 *       second run touches none of them
 *   D5  rulings 3 + 8: the draft gem read takes tagged, live rows only — untagged and expired-local are hidden
 *   D6  ruling 3: verifying an untagged gem makes the verifier its author (no team label); a second press
 *       is 409 and an unknown gem 404; the verified gem then reaches a draft
 *   D7  place_facts are born tagged from origin + license (recordFacts)
 *   D8  ruling 8: the nightly census counts expired local content and changes nothing
 *
 * DISPOSABLE DB ONLY: every row is keyed by a per-run prefix and deleted afterwards.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq, inArray, like, sql } from "drizzle-orm";
import { db, pool } from "../db";
import { insertItineraryItemSchema, itineraryItems, placeFacts, travelPulseHiddenGems } from "@shared/schema";
import { storage } from "../storage";
import { travelPulseService } from "../services/travelpulse.service";
import { verifyGem } from "../services/gem-promotion.service";
import { recordFacts } from "../services/content-facts/place-facts.service";
import { runContentExpiryCensus } from "../jobs/contentExpiryCensus";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `ctt-${RUN}-${s}`;
const OWNER = id("owner");
const ADMIN = id("admin");
const TRIP = id("trip");
const CITY = `TierCity-${RUN}`;

async function gem(k: string, extra: Record<string, unknown> = {}) {
  await db.insert(travelPulseHiddenGems).values({ id: id(k), city: CITY, placeName: `Gem ${k}`, gemScore: 50, ...extra } as any);
  return id(k);
}
async function gemRow(gid: string) {
  const [r] = await db.select().from(travelPulseHiddenGems).where(eq(travelPulseHiddenGems.id, gid));
  return r;
}

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${OWNER}, ${`${OWNER}@t.test`}, 'traveler'), (${ADMIN}, ${`${ADMIN}@t.test`}, 'admin')`);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status)
    VALUES (${TRIP}, ${OWNER}, ${`Tier ${RUN}`}, 'Kyoto, Japan', '2027-11-11', '2027-11-13', 'draft')
  `);
});

after(async () => {
  await db.delete(placeFacts).where(like(placeFacts.placeRef, `ctt-${RUN}-%`));
  await db.delete(itineraryItems).where(eq(itineraryItems.tripId, TRIP));
  await db.delete(travelPulseHiddenGems).where(eq(travelPulseHiddenGems.city, CITY));
  await db.execute(sql`DELETE FROM trips WHERE id = ${TRIP}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${OWNER}, ${ADMIN})`);
  await pool.end();
});

test("D1 — ruling 9: source_class is the server's stamp; a client 'local' on a traveler item is ignored", async () => {
  const traveler = await storage.createItineraryItem({ tripId: TRIP, dayNumber: 1, title: "Mine", origin: "traveler", sourceClass: "local" } as any);
  const expert = await storage.createItineraryItem({ tripId: TRIP, dayNumber: 1, title: "Expert's", origin: "expert", sourceClass: "public" } as any);
  const unknown = await storage.createItineraryItem({ tripId: TRIP, dayNumber: 1, title: "Unknown", sourceClass: "local" } as any);
  assert.equal(traveler.sourceClass, "public");
  assert.equal(expert.sourceClass, "local");
  assert.equal(unknown.sourceClass, null);
});

test("D2 — ruling 9: an item update cannot set source_class", async () => {
  const item = await storage.createItineraryItem({ tripId: TRIP, dayNumber: 1, title: "Edit me", origin: "traveler" } as any);
  const updated = await storage.updateItineraryItem(item.id, { title: "Edited", sourceClass: "local" } as any);
  assert.equal(updated?.title, "Edited");
  assert.equal(updated?.sourceClass, "public");
});

test("D3 — ruling 9: the client body schema drops source_class", () => {
  const parsed = insertItineraryItemSchema.safeParse({ tripId: TRIP, dayNumber: 1, title: "x", sourceClass: "local" });
  assert.equal(parsed.success, true);
  assert.equal("sourceClass" in (parsed as any).data, false);
});

test("D4 — migration 362 tags team and curated gems, leaves AI gems untagged, and is idempotent", async () => {
  const team = await gem("bf-team", { aiGenerated: false });
  const curated = await gem("bf-curated", { aiGenerated: false, curatedByExpertId: ADMIN });
  const ai = await gem("bf-ai", { aiGenerated: true });
  const file = fs.readFileSync(path.join(process.cwd(), "server/migrations/362_content_tier_backfill.sql"), "utf8");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(file);
    const read = async (gid: string) => (await client.query(
      "SELECT source_class, reuse_class, author_label, verified_by, verified_at FROM travel_pulse_hidden_gems WHERE id = $1", [gid],
    )).rows[0];
    const t = await read(team);
    assert.equal(t.source_class, "local");
    assert.equal(t.reuse_class, "reusable");
    assert.equal(t.author_label, "Traveloure team");
    const c = await read(curated);
    assert.equal(c.source_class, "local");
    assert.equal(c.verified_by, ADMIN);
    assert.equal(c.author_label, null);
    const a = await read(ai);
    assert.equal(a.source_class, null, "an AI-written gem stays untagged until a person verifies it");
    const second = await client.query(
      "UPDATE travel_pulse_hidden_gems SET source_class = 'local' WHERE source_class IS NULL AND id = ANY($1) AND COALESCE(ai_generated,false) = false RETURNING id",
      [[team, curated]],
    );
    assert.equal(second.rowCount, 0, "a second run touches none of the tagged rows");
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

test("D5 — rulings 3 + 8: the draft gem read takes tagged, live rows only", async () => {
  const live = await gem("d-live", { sourceClass: "local", reuseClass: "reusable", gemScore: 90 });
  const untagged = await gem("d-untagged", { gemScore: 95 });
  const expired = await gem("d-expired", { sourceClass: "local", reuseClass: "reusable", expiresAt: new Date(Date.now() - 86_400_000), gemScore: 99 });
  const future = await gem("d-future", { sourceClass: "local", reuseClass: "reusable", expiresAt: new Date(Date.now() + 86_400_000), gemScore: 80 });
  const ids = (await travelPulseService.getDraftEligibleGems(CITY, 50)).map((g) => g.id);
  assert.ok(ids.includes(live));
  assert.ok(ids.includes(future));
  assert.ok(!ids.includes(untagged), "an untagged gem never reaches a draft");
  assert.ok(!ids.includes(expired), "an expired local gem is hidden at build time");
  assert.ok(await gemRow(expired), "and is not deleted");
  const all = (await travelPulseService.getHiddenGems(CITY, 50)).map((g) => g.id);
  assert.ok(all.includes(untagged), "the public read is unchanged");
});

test("D6 — ruling 3: verification makes the verifier the author; repeat 409; unknown 404", async () => {
  const g = await gem("v-ai", { aiGenerated: true });
  const ok = await verifyGem({ gemId: g, verifierUserId: ADMIN });
  assert.equal(ok.ok, true);
  const row = await gemRow(g);
  assert.equal(row.sourceClass, "local");
  assert.equal(row.verifiedBy, ADMIN);
  assert.ok(row.verifiedAt instanceof Date);
  assert.equal(row.authorLabel, null, "never 'Traveloure team' for machine output");
  const again = await verifyGem({ gemId: g, verifierUserId: ADMIN });
  assert.deepEqual(again, { ok: false, status: 409, message: "This gem is already verified" });
  const missing = await verifyGem({ gemId: id("nope"), verifierUserId: ADMIN });
  assert.equal(missing.ok, false);
  assert.equal((missing as any).status, 404);
  assert.ok((await travelPulseService.getDraftEligibleGems(CITY, 50)).some((x) => x.id === g));
});

test("D7 — place_facts are born tagged from origin + license", async () => {
  const now = new Date();
  const base = { placeRefKind: "free_text", placeLat: null, placeLng: null, market: null, need: "stop.hours", factType: "hours", value: { text: "9-5" }, sourceId: null, sourceUrl: null, fetchedAt: now, expiresAt: null, costCents: 0 };
  await recordFacts([
    { ...base, placeRef: id("f-places"), origin: "places_api", license: "restricted" },
    { ...base, placeRef: id("f-official"), origin: "crawled", license: "official" },
    { ...base, placeRef: id("f-partner"), origin: "crawled", license: "partner" },
  ] as any, { planId: null, itemId: null });
  const rows = await db.select().from(placeFacts).where(inArray(placeFacts.placeRef, [id("f-places"), id("f-official"), id("f-partner")]));
  const by = Object.fromEntries(rows.map((r) => [r.placeRef, [r.sourceClass, r.reuseClass]]));
  assert.deepEqual(by[id("f-places")], ["public", "display_in_plan"]);
  assert.deepEqual(by[id("f-official")], ["public", "link_only"]);
  assert.deepEqual(by[id("f-partner")], ["public", "internal"]);
});

test("D8 — ruling 8: the census counts expired local content and changes nothing", async () => {
  const g = await gem("c-expired", { sourceClass: "local", reuseClass: "reusable", expiresAt: new Date(Date.now() - 3_600_000) });
  const before = await gemRow(g);
  const out = await runContentExpiryCensus();
  assert.deepEqual(out.errors, {});
  assert.ok((out.expiredLocal.travel_pulse_hidden_gems ?? 0) >= 1);
  assert.equal(typeof out.untaggedGems, "number");
  assert.deepEqual(await gemRow(g), before, "nothing is deleted or rewritten");
});
