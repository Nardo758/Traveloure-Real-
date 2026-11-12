/**
 * QA round 3 Major 4 (Leon, Nov 12, 2026): "fix the guest existing-plan branch dropping adults/kids".
 *
 * TB4 started a plan with 40 adults and read "2 adults". `createGuestPlan` is get-or-create: a session that already had a
 * guest plan was answered with that plan as it stood, and the party the create stated was dropped.
 *
 *   P1 a create with no occasion on an existing plan saves the stated party (40 adults, 3 kids ⇒ total 43)
 *   P2 a create with an occasion on an existing plan saves the party beside the occasion (R3-3 unchanged otherwise)
 *   P3 a create that states no party leaves the existing party as it was (a city-page save never touches it)
 *   P4 adults alone keeps the stored kids and re-derives the total; kids alone with no adults stated keeps total NULL (LD 33)
 *   P5 the ONE party patch: `updateGuestPlan` writes the same columns through it (G4 unchanged)
 *
 * Disposable database only. Every row this file writes is removed in after().
 *
 * Run: npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/qa3-guest-party.db.test.ts
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { experienceTypes, trips } from "@shared/schema";
import { createGuestPlan, guestPartyPatch, hashGuestSession, updateGuestPlan } from "../services/guest-plan.service";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb() {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const host = new URL(process.env.DATABASE_URL ?? "postgres://x@invalid/x").hostname.toLowerCase();
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`refusing to write to non-disposable database host ${host}`);
}

const tripIds = new Set<string>();
const insertedTypeIds: string[] = [];
const SLUG = "wedding";

before(async () => {
  assertDisposableDb();
  await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES ('launch_market_slug', 'kyoto')
    ON CONFLICT (setting_key) DO NOTHING`);
  const rows = await db
    .insert(experienceTypes)
    .values({ name: `${SLUG} (qa3 party)`, slug: SLUG } as any)
    .onConflictDoNothing({ target: experienceTypes.slug })
    .returning({ id: experienceTypes.id });
  if (rows[0]) insertedTypeIds.push(rows[0].id);
});

after(async () => {
  const ids = Array.from(tripIds);
  if (ids.length) await db.delete(trips).where(inArray(trips.id, ids));
  if (insertedTypeIds.length) await db.delete(experienceTypes).where(inArray(experienceTypes.id, insertedTypeIds));
});

async function create(hash: string, body: Record<string, unknown>) {
  const out = await createGuestPlan(hash, { destination: "Kyoto, Japan", ...body } as any);
  assert.equal(out.ok, true, JSON.stringify(out));
  const id = (out as any).view.plan.id as string;
  tripIds.add(id);
  return { id, view: (out as any).view, created: (out as any).created as boolean };
}
const row = async (id: string) => (await db.select().from(trips).where(eq(trips.id, id)))[0];
const session = () => hashGuestSession(crypto.randomUUID())!;

describe("QA round 3 Major 4 — the guest create keeps the stated party on an existing plan", () => {
  it("P1 no occasion: the existing plan takes the stated party (TB4's 40 adults)", async () => {
    const hash = session();
    const first = await create(hash, {});
    const again = await create(hash, { adults: 40, kids: 3 });
    assert.equal(again.created, false);
    assert.equal(again.id, first.id, "still one plan per session");
    const r = await row(first.id);
    assert.equal(r.adults, 40);
    assert.equal(r.kids, 3);
    assert.equal(r.numberOfTravelers, 43);
    assert.equal(again.view.plan.adults, 40, "the answer reads the saved party");
  });

  it("P2 with an occasion: the party is saved beside the occasion", async () => {
    const hash = session();
    const first = await create(hash, {});
    await create(hash, { occasionSlug: SLUG, adults: 40 });
    const r = await row(first.id);
    assert.equal(r.occasionSlug, SLUG);
    assert.equal(r.adults, 40);
    assert.equal(r.numberOfTravelers, 40);
  });

  it("P3 a create that states no party leaves the stored party alone", async () => {
    const hash = session();
    const first = await create(hash, { adults: 5, kids: 1 });
    await create(hash, {});
    await create(hash, { occasionSlug: SLUG });
    const r = await row(first.id);
    assert.equal(r.adults, 5);
    assert.equal(r.kids, 1);
    assert.equal(r.numberOfTravelers, 6);
  });

  it("P4 adults alone keeps the stored kids; kids alone with no adults keeps the total NULL", async () => {
    const hash = session();
    const first = await create(hash, { adults: 2, kids: 2 });
    await create(hash, { adults: 40 });
    let r = await row(first.id);
    assert.equal(r.kids, 2, "kids kept");
    assert.equal(r.numberOfTravelers, 42);

    const hash2 = session();
    const second = await create(hash2, {});
    await create(hash2, { kids: 3 });
    r = await row(second.id);
    assert.equal(r.adults, null, "an unstated party is NULL, never 2 (LD 33)");
    assert.equal(r.kids, 3);
    assert.equal(r.numberOfTravelers, null);
  });

  it("P5 one party patch: the pure rule, and updateGuestPlan through it", async () => {
    assert.equal(guestPartyPatch({}, { adults: 4, kids: 1 }), null);
    assert.deepEqual(guestPartyPatch({ adults: 40 }, { adults: 2, kids: 3 }), { adults: 40, numberOfTravelers: 43 });
    assert.deepEqual(guestPartyPatch({ kids: 1 }, { adults: null, kids: null }), { kids: 1, numberOfTravelers: null });
    const hash = session();
    const plan = await create(hash, {});
    await updateGuestPlan(hash, { adults: 40, kids: 0 } as any);
    const r = await row(plan.id);
    assert.equal(r.adults, 40);
    assert.equal(r.numberOfTravelers, 40);
  });
});
