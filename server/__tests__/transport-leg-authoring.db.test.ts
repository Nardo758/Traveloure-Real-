/**
 * L1-1 — transport_legs authoring columns (work plan docs/planning/expert-console-ready-made-work-plan.md;
 * rulings R-ay author's tip, R-az via host pickup, R-bf checked stamp; migration 346).
 *
 *   T1  the trip author PATCHes a tip; it round-trips, blank clears it to NULL
 *   T2  a tip over 140 chars is refused 400 and nothing is written
 *   T3  the traveler-owner and a PENDING advisor are refused 403 on a tip; an ACCEPTED advisor may
 *   P1  a host pickup naming a listing that does not offer pickup ⇒ 400 pickup_not_offered;
 *       an unknown listing ⇒ 400 pickup_listing_not_found; a pickup-capable listing ⇒ 400
 *       pickup_not_provider_confirmed (no confirmation column until L1-7 — the stated limit)
 *   C1  a confirm by the author stamps checked_by/checked_at; a confirm by the owner stamps nothing;
 *       `checkedBy` in the body is refused (strict allow-list)
 *   R1  regenerate leaves a confirmed leg's new columns exactly as they were
 *   U1  `legPickupRefusal` pure cases, including the pass case a future L1-7 column unlocks
 *
 * NEGATIVE SPACE (§18d): `origin`, `leg_check_status` and `leg_checked_at` are declared by migration
 * 346 and have no writer in this lane (writers: L1-3, L1-4, L1-5); nothing here asserts them beyond
 * staying NULL. No proof covers a SUCCESSFUL host pickup, because none can pass before L1-7.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test server/__tests__/transport-leg-authoring.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";
import { db } from "../db";
import transportLegsRoutes from "../routes/transport-legs.routes";
import { generateTripTransportLegs, legPickupRefusal } from "../services/trip-transport-legs.service";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  owner: `l11-${RUN}-owner`,
  author: `l11-${RUN}-author`,
  pending: `l11-${RUN}-pending`,
  accepted: `l11-${RUN}-accepted`,
  provider: `l11-${RUN}-provider`,
  trip: `l11-${RUN}-trip`,
  itemA: `l11-${RUN}-a`,
  itemB: `l11-${RUN}-b`,
  leg: `l11-${RUN}-leg`,
  meetListing: `l11-${RUN}-meet`,
  pickupListing: `l11-${RUN}-pickup`,
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
    throw new Error(`[transport-leg-authoring] REFUSING to write fixtures to '${host}'. Opt in with JOURNEY_DB_WRITES_OK=1.`);
  }
}

async function patchAs(userId: string, body: unknown) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: userId } };
    (req as any).isAuthenticated = () => true;
    next();
  });
  app.use(transportLegsRoutes);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/trips/${ids.trip}/transport-legs/${ids.leg}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

async function legRow(): Promise<any> {
  const r = await db.execute(sql`SELECT * FROM transport_legs WHERE id = ${ids.leg}`);
  return r.rows[0];
}

async function resetLeg(): Promise<void> {
  await db.execute(sql`UPDATE transport_legs SET author_tip = NULL, pickup_provider_service_id = NULL,
    checked_by = NULL, checked_at = NULL, proposal_status = 'proposed' WHERE id = ${ids.leg}`);
}

before(async () => {
  assertDisposableDb();
  for (const [id, role] of [
    [ids.owner, "traveler"],
    [ids.author, "local_expert"],
    [ids.pending, "local_expert"],
    [ids.accepted, "local_expert"],
    [ids.provider, "service_provider"],
  ] as const) {
    await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role)
      VALUES (${id}, ${`${id}@t.test`}, 'L11', ${role}, ${role})`);
  }
  await db.execute(sql`INSERT INTO trips (id, user_id, author_id, title, destination, start_date, end_date, status)
    VALUES (${ids.trip}, ${ids.owner}, ${ids.author}, 'L1-1 plan', 'Kyoto, Japan', '2027-05-01', '2027-05-03', 'draft')`);
  await db.execute(sql`INSERT INTO trip_expert_advisors (id, trip_id, local_expert_id, status) VALUES
    (${`${ids.trip}-p`}, ${ids.trip}, ${ids.pending}, 'pending'),
    (${`${ids.trip}-a`}, ${ids.trip}, ${ids.accepted}, 'accepted')`);
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, day_number, sort_order, latitude, longitude) VALUES
    (${ids.itemA}, ${ids.trip}, 'Kiyomizu-dera', 1, 0, 34.9949, 135.7850),
    (${ids.itemB}, ${ids.trip}, 'Yasaka Shrine', 1, 1, 35.0037, 135.7785)`);
  await db.execute(sql`INSERT INTO transport_legs (id, trip_id, day_number, leg_order, from_activity_id, from_name, from_lat, from_lng,
      to_activity_id, to_name, to_lat, to_lng, distance_meters, distance_display, recommended_mode,
      estimated_duration_minutes, proposal_status)
    VALUES (${ids.leg}, ${ids.trip}, 1, 0, ${ids.itemA}, 'Kiyomizu-dera', 34.9949, 135.7850,
      ${ids.itemB}, 'Yasaka Shrine', 35.0037, 135.7785, 1100, '1.1 km', 'walk', 15, 'proposed')`);
  await db.execute(sql`INSERT INTO provider_services (id, user_id, service_name, transport_provision) VALUES
    (${ids.meetListing}, ${ids.provider}, 'Meet at the gate', 'meet_at_point'),
    (${ids.pickupListing}, ${ids.provider}, 'Hotel pickup tour', 'pickup_included')`);
});

after(async () => {
  await db.execute(sql`DELETE FROM provider_services WHERE id IN (${ids.meetListing}, ${ids.pickupListing})`);
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`);
  await db.execute(sql`DELETE FROM itinerary_changes WHERE trip_id = ${ids.trip}`).catch(() => undefined);
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.owner}, ${ids.author}, ${ids.pending}, ${ids.accepted}, ${ids.provider})`);
});

test("T1: the author's tip round-trips; blank clears it", async () => {
  await resetLeg();
  const set = await patchAs(ids.author, { authorTip: "  Take the back lane past Ninenzaka — quieter before 9.  " });
  assert.equal(set.status, 200);
  assert.equal(set.body.leg.authorTip, "Take the back lane past Ninenzaka — quieter before 9.");
  assert.equal((await legRow()).author_tip, "Take the back lane past Ninenzaka — quieter before 9.");
  const clear = await patchAs(ids.author, { authorTip: "   " });
  assert.equal(clear.status, 200);
  assert.equal((await legRow()).author_tip, null);
});

test("T2: a tip over 140 chars is refused and nothing is written", async () => {
  await resetLeg();
  const r = await patchAs(ids.author, { authorTip: "x".repeat(141) });
  assert.equal(r.status, 400);
  assert.equal((await legRow()).author_tip, null);
  const ok = await patchAs(ids.author, { authorTip: "y".repeat(140) });
  assert.equal(ok.status, 200);
});

test("T3: owner and pending advisor may not write a tip; an accepted advisor may", async () => {
  await resetLeg();
  for (const who of [ids.owner, ids.pending]) {
    const r = await patchAs(who, { authorTip: "nope" });
    assert.equal(r.status, 403, who);
    const p = await patchAs(who, { pickupProviderServiceId: ids.pickupListing });
    assert.equal(p.status, 403, who);
  }
  assert.equal((await legRow()).author_tip, null);
  const a = await patchAs(ids.accepted, { authorTip: "Bus 206 is quicker in rain." });
  assert.equal(a.status, 200);
  assert.equal((await legRow()).author_tip, "Bus 206 is quicker in rain.");
});

test("P1: host pickup refusals (R-az), and nothing written", async () => {
  await resetLeg();
  const meet = await patchAs(ids.author, { pickupProviderServiceId: ids.meetListing });
  assert.equal(meet.status, 400);
  assert.equal(meet.body.reason, "pickup_not_offered");
  const unknown = await patchAs(ids.author, { pickupProviderServiceId: `${ids.meetListing}-x` });
  assert.equal(unknown.body.reason, "pickup_listing_not_found");
  const unconfirmed = await patchAs(ids.author, { pickupProviderServiceId: ids.pickupListing });
  assert.equal(unconfirmed.status, 400);
  assert.equal(unconfirmed.body.reason, "pickup_not_provider_confirmed");
  assert.equal((await legRow()).pickup_provider_service_id, null);
  const cleared = await patchAs(ids.author, { pickupProviderServiceId: null });
  assert.equal(cleared.status, 200);
});

test("C1: an author's confirm stamps the check; an owner's does not; checkedBy is not body-settable", async () => {
  await resetLeg();
  const forged = await patchAs(ids.owner, { proposalStatus: "confirmed", checkedBy: ids.owner });
  assert.equal(forged.status, 400);
  const byOwner = await patchAs(ids.owner, { proposalStatus: "confirmed" });
  assert.equal(byOwner.status, 200);
  let row = await legRow();
  assert.equal(row.proposal_status, "confirmed");
  assert.equal(row.checked_by, null);
  assert.equal(row.checked_at, null);
  const byAuthor = await patchAs(ids.author, { proposalStatus: "confirmed", userSelectedMode: "walk" });
  assert.equal(byAuthor.status, 200);
  row = await legRow();
  assert.equal(row.checked_by, ids.author);
  assert.ok(row.checked_at instanceof Date || typeof row.checked_at === "string");
  // A later owner edit that is not a confirm leaves the stamp alone.
  await patchAs(ids.owner, { pickupPoint: "Hotel lobby" });
  assert.equal((await legRow()).checked_by, ids.author);
});

test("R1: regenerate leaves a confirmed leg's authoring columns untouched", async () => {
  await resetLeg();
  await patchAs(ids.author, { authorTip: "Walk it — the slope is the point.", proposalStatus: "confirmed" });
  const before = await legRow();
  assert.equal(before.author_tip, "Walk it — the slope is the point.");
  const result = await generateTripTransportLegs(ids.trip);
  assert.equal(result.keptConfirmed, 1);
  const after = await legRow();
  for (const col of ["author_tip", "pickup_provider_service_id", "checked_by", "origin", "leg_check_status", "leg_checked_at", "proposal_status"]) {
    assert.deepEqual(after[col], before[col], col);
  }
  assert.equal(String(after.checked_at), String(before.checked_at));
  assert.equal(after.origin, null);
  assert.equal(after.leg_check_status, null);
});

test("U1: legPickupRefusal", () => {
  assert.equal(legPickupRefusal(null), "pickup_listing_not_found");
  assert.equal(legPickupRefusal({ transportProvision: null }), "pickup_not_offered");
  assert.equal(legPickupRefusal({ transportProvision: "meet_at_point", pickupConfirmedAt: new Date() }), "pickup_not_offered");
  assert.equal(legPickupRefusal({ transportProvision: "pickup_available" }), "pickup_not_provider_confirmed");
  assert.equal(legPickupRefusal({ transportProvision: "pickup_available", pickupConfirmedAt: new Date() }), null);
  assert.equal(legPickupRefusal({ transportProvision: "pickup_included", pickupConfirmedAt: "2026-10-04T00:00:00Z" }), null);
});
