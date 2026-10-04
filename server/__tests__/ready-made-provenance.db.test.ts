/**
 * L1-6 — provenance on a buyer's copy (work plan docs/planning/expert-console-ready-made-work-plan.md;
 * ruling R-be). Derived from `ready_made_purchases.clone_trip_id`; no migration.
 *
 *   V1  the plancard for a copy carries `readyMadeSource` { listing id, title, author first name,
 *       handle, lastVerifiedAt }, and the Trip Card read (`?surface=card`) carries the same object
 *   V2  the plancard for a plan that is no purchase's clone carries `readyMadeSource: null`
 *   V3  the author's `users.id` appears nowhere in the provenance object (LD 40)
 *   V4  a refunded purchase still names its source (provenance is a fact, not an entitlement)
 *   V5  an author with no first name ⇒ `authorDisplayName: null`; a never-checked listing ⇒
 *       `lastVerifiedAt: null` (§13 — never invented)
 *
 * NEGATIVE SPACE: the line the slip header and the Trip Card draw from this is Lane 2 (L2-6); nothing
 * here asserts a rendering.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test server/__tests__/ready-made-provenance.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";

process.env.STRIPE_SECRET_KEY ||= "sk_test_ready_made_provenance";
const { db } = await import("../db");
const plancardRoutes = (await import("../routes/plancard.routes")).default;
const { readyMadeProvenanceForTrip } = await import("../services/ready-made-provenance.service");

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  author: `l16-${RUN}-author`,
  buyer: `l16-${RUN}-buyer`,
  build: `l16-${RUN}-build`,
  copy: `l16-${RUN}-copy`,
  plain: `l16-${RUN}-plain`,
  listing: `l16-${RUN}-listing`,
  purchase: `l16-${RUN}-purchase`,
};

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb(): void {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host = "<none>";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    /* refuse below */
  }
  if (!DISPOSABLE_HOSTS.has(host)) {
    throw new Error(`[ready-made-provenance] REFUSING to write fixtures to '${host}'. Opt in with JOURNEY_DB_WRITES_OK=1.`);
  }
}

async function plancardAs(userId: string, tripId: string, surface?: string) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: userId } };
    (req as any).isAuthenticated = () => true;
    next();
  });
  app.use(plancardRoutes);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as AddressInfo;
  try {
    const q = surface ? `?surface=${surface}` : "";
    const res = await fetch(`http://127.0.0.1:${port}/api/trips/${tripId}/plancard${q}`);
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

before(async () => {
  assertDisposableDb();
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role, handle) VALUES
    (${ids.author}, ${`${ids.author}@t.test`}, 'Haruka', 'L16', 'local_expert', ${`haruka-${RUN}`}),
    (${ids.buyer}, ${`${ids.buyer}@t.test`}, 'Buyer', 'L16', 'traveler', NULL)`);
  for (const [id, owner, author] of [
    [ids.build, null, ids.author],
    [ids.copy, ids.buyer, null],
    [ids.plain, ids.buyer, null],
  ] as const) {
    await db.execute(sql`INSERT INTO trips (id, user_id, author_id, title, destination, start_date, end_date, status)
      VALUES (${id}, ${owner}, ${author}, 'L1-6', 'Kyoto, Japan', '2027-05-01', '2027-05-02', 'draft')`);
  }
  // The plancard gate resolves an owner through `trip_collaborators` (the clone writes this row).
  await db.execute(sql`INSERT INTO trip_collaborators (trip_id, user_id, role) VALUES
    (${ids.copy}, ${ids.buyer}, 'owner'), (${ids.plain}, ${ids.buyer}, 'owner')`);
  await db.execute(sql`INSERT INTO ready_made_trips (id, author_id, source_trip_id, market, title, duration_days, status, active)
    VALUES (${ids.listing}, ${ids.author}, ${ids.build}, 'Kyoto', 'Two slow days in Higashiyama', 2, 'approved', true)`);
  await db.execute(sql`INSERT INTO ready_made_purchases (id, buyer_id, ready_made_trip_id, price_paid_cents, stripe_payment_intent_id, clone_trip_id, status)
    VALUES (${ids.purchase}, ${ids.buyer}, ${ids.listing}, 3900, ${`pi_l16_${RUN}`}, ${ids.copy}, 'cloned')`);
});

after(async () => {
  await db.execute(sql`DELETE FROM ready_made_purchases WHERE id = ${ids.purchase}`);
  await db.execute(sql`DELETE FROM ready_made_trips WHERE id = ${ids.listing}`);
  await db.execute(sql`DELETE FROM trips WHERE id IN (${ids.build}, ${ids.copy}, ${ids.plain})`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.author}, ${ids.buyer})`);
});

test("V1: the copy's plancard and Trip Card read carry the provenance", async () => {
  const expected = {
    sourceReadyMadeTripId: ids.listing,
    listingTitle: "Two slow days in Higashiyama",
    authorDisplayName: "Haruka",
    authorHandle: `haruka-${RUN}`,
    lastVerifiedAt: null,
  };
  const slip = await plancardAs(ids.buyer, ids.copy);
  assert.equal(slip.status, 200, JSON.stringify(slip.body));
  assert.deepEqual(slip.body.readyMadeSource, expected);
  const card = await plancardAs(ids.buyer, ids.copy, "card");
  assert.equal(card.status, 200);
  assert.deepEqual(card.body.readyMadeSource, expected);
});

test("V2: a plan that is no purchase's clone carries null", async () => {
  const r = await plancardAs(ids.buyer, ids.plain);
  assert.equal(r.status, 200);
  assert.equal(r.body.readyMadeSource, null);
});

test("V3: the author's user id is not in the provenance object", async () => {
  const r = await plancardAs(ids.buyer, ids.copy);
  assert.equal(JSON.stringify(r.body.readyMadeSource).includes(ids.author), false);
});

test("V4: a refunded purchase still names its source", async () => {
  await db.execute(sql`UPDATE ready_made_purchases SET status = 'refunded' WHERE id = ${ids.purchase}`);
  const p = await readyMadeProvenanceForTrip(ids.copy);
  assert.equal(p?.sourceReadyMadeTripId, ids.listing);
  await db.execute(sql`UPDATE ready_made_purchases SET status = 'cloned' WHERE id = ${ids.purchase}`);
});

test("V5: no first name ⇒ null display name; a verified listing reports its date", async () => {
  await db.execute(sql`UPDATE users SET first_name = '  ' WHERE id = ${ids.author}`);
  await db.execute(sql`UPDATE ready_made_trips SET last_verified_at = '2026-09-30T08:00:00Z' WHERE id = ${ids.listing}`);
  const p = await readyMadeProvenanceForTrip(ids.copy);
  assert.equal(p?.authorDisplayName, null);
  assert.equal(p?.lastVerifiedAt?.slice(0, 10), "2026-09-30");
  await db.execute(sql`UPDATE users SET first_name = 'Haruka' WHERE id = ${ids.author}`);
  await db.execute(sql`UPDATE ready_made_trips SET last_verified_at = NULL WHERE id = ${ids.listing}`);
});
