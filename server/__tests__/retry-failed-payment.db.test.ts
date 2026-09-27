/**
 * retry-failed-payment.db.test.ts — R157: "Try again" after a failed payment puts the item back in
 * checkout (ledger `2026-09-27-retry-failed-payment`; decision-maker ruled Sep 27, 2026: "re-project
 * the item into the cart through the existing ready_for_checkout writer (no new add path), then open
 * checkout").
 *
 * THE DEFECT. Authorization flips a plan item `purchased` and clears its cart line (§15b); when the
 * card then FAILS, the `payment_intent.payment_failed` webhook moves the booking to `failed` and leaves
 * the item `purchased`. R154 draws "Payment didn't go through" + "Try again" on that row, and "Try
 * again" opened the checkout — which did not contain the item. On `main` the routing rail refuses the
 * only request that could fix it (`purchased → ready_for_checkout` is not an edge), so R1/R3 FAIL there.
 *
 * Proven over HTTP against the running server (the rail's own auth + gates) and read back from the DB:
 *   R1  failed booking, open plan: owner → ready_for_checkout ⇒ 200; the item is `ready_for_checkout`,
 *       ONE cart line projects it (the cart is the projection, LD 39), `booking_id` is kept as history,
 *       the diary records purchased → in_planning → ready_for_checkout by the traveler (not "refund").
 *   R2  a second press is idempotent: 200 changed:false, still ONE cart line.
 *   R3  failed booking on a FINALIZED plan, item in the current final ⇒ 200 (was `already_purchased`).
 *   R4  a CONFIRMED booking still refuses: open plan ⇒ 409 illegal edge, finalized ⇒ 409
 *       `already_purchased`; nothing moves, no cart line appears.
 *   R5  a stranger ⇒ 403; a disputed booking (a real booking) ⇒ 409; nothing moves.
 *
 * Runs against the ALREADY-RUNNING server (JOURNEY_BASE_URL, default http://127.0.0.1:5000). DISPOSABLE
 * DB ONLY.
 *
 * Run: JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 --test-force-exit \
 *        server/__tests__/retry-failed-payment.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
  if (host === null || !DISPOSABLE_HOSTS.has(host)) {
    throw new Error(`[retry-failed-payment] REFUSING to write fixtures to '${host ?? "<none>"}'. Set JOURNEY_DB_WRITES_OK=1.`);
  }
}

type Actor = { id: string; cookie: string };
const tripIds: string[] = [];
const bookingIds: string[] = [];

async function register(label: string): Promise<Actor> {
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `rfp-${label}-${RUN}@t.test`, password: PASSWORD, firstName: "RFP", lastName: label, userType: "user" }),
  });
  if (res.status !== 201) assert.fail(`register(${label}) failed (${res.status}): ${await res.text()}`);
  const body = await res.json();
  return { id: body.user.id as string, cookie: (res.headers.get("set-cookie") ?? "").split(";")[0] };
}

async function call(actor: Actor, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", cookie: actor.cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: res.status, json, text };
}

/**
 * A plan with ONE item, bought through a booking in `status`: the item `purchased` with its
 * `booking_id` stamped and NO cart line — exactly where authorization (markItemPurchased + the cart
 * clear) leaves it, and where the failed-payment webhook (which never touches the item) finds it.
 */
async function seedBought(owner: Actor, status: string, title: string): Promise<{ tripId: string; itemId: string; bookingId: string }> {
  const start = new Date(Date.now() + 40 * 86400_000).toISOString().slice(0, 10);
  const end = new Date(Date.now() + 43 * 86400_000).toISOString().slice(0, 10);
  const trip = await call(owner, "POST", "/api/trips", { title: `Retry ${RUN}`, destination: "Kyoto, Japan", startDate: start, endDate: end });
  assert.ok(trip.status < 300, `create trip: ${trip.status} ${trip.text}`);
  const tripId = trip.json.id as string;
  tripIds.push(tripId);
  const item = await call(owner, "POST", `/api/trips/${tripId}/itinerary-items`, { title, itemType: "activity", dayNumber: 1 });
  assert.ok(item.status < 300, `add item: ${item.status} ${item.text}`);
  const itemId = item.json.id as string;
  const bookingId = crypto.randomUUID();
  bookingIds.push(bookingId);
  await db.execute(sql`INSERT INTO service_bookings (id, traveler_id, trip_id, total_amount, status, stripe_payment_intent_id)
                       VALUES (${bookingId}, ${owner.id}, ${tripId}, '120.00', ${status}, ${`pi_rfp_${RUN}_${bookingId.slice(0, 8)}`})`);
  await db.execute(sql`UPDATE itinerary_items SET routing_status = 'purchased', booking_id = ${bookingId} WHERE id = ${itemId}`);
  await db.execute(sql`DELETE FROM cart_items WHERE itinerary_item_id = ${itemId}`);
  return { tripId, itemId, bookingId };
}

async function itemRow(itemId: string): Promise<{ routing_status: string | null; booking_id: string | null }> {
  const r: any = await db.execute(sql`SELECT routing_status, booking_id FROM itinerary_items WHERE id = ${itemId}`);
  return r.rows[0];
}

async function cartLines(itemId: string): Promise<number> {
  const r: any = await db.execute(sql`SELECT count(*)::int AS n FROM cart_items WHERE itinerary_item_id = ${itemId}`);
  return r.rows[0].n as number;
}

async function diary(itemId: string): Promise<Array<{ from_status: string; to_status: string; actor_type: string }>> {
  const r: any = await db.execute(sql`SELECT from_status, to_status, actor_type FROM item_transition_log
                                      WHERE item_id = ${itemId} AND event_type = 'status_transition'
                                      ORDER BY created_at, id`);
  return r.rows;
}

const tryAgain = (owner: Actor, tripId: string, itemId: string) =>
  call(owner, "POST", `/api/trips/${tripId}/items/${itemId}/route`, { to: "ready_for_checkout" });

let owner: Actor;
let stranger: Actor;

before(async () => {
  await assertDisposableDb();
  owner = await register("owner");
  stranger = await register("stranger");
});

after(async () => {
  for (const t of tripIds) {
    await db.execute(sql`DELETE FROM cart_items WHERE trip_id = ${t}`).catch(() => {});
    await db.execute(sql`UPDATE itinerary_items SET booking_id = NULL WHERE trip_id = ${t}`).catch(() => {});
  }
  for (const b of bookingIds) {
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${b}`).catch(() => {});
  }
});

test("R1/R2: a FAILED payment's item goes back to checkout with ONE cart line; a second press is idempotent", async () => {
  const { tripId, itemId, bookingId } = await seedBought(owner, "failed", `Kaiseki ${RUN}`);

  const r = await tryAgain(owner, tripId, itemId);
  assert.equal(r.status, 200, `Try again must be accepted for a failed payment (got ${r.status}: ${r.text})`);
  assert.equal(r.json?.to, "ready_for_checkout");
  const row = await itemRow(itemId);
  assert.equal(row.routing_status, "ready_for_checkout");
  assert.equal(row.booking_id, bookingId, "the failed booking stays on the item as history (§13)");
  assert.equal(await cartLines(itemId), 1, "the checkout now holds the item: ONE projected cart line (LD 39)");

  const steps = (await diary(itemId)).map((d) => `${d.from_status}->${d.to_status}:${d.actor_type}`);
  assert.ok(steps.includes("purchased->in_planning:traveler"), `revert attributed to the traveler, never "refund" (got ${steps})`);
  assert.ok(steps.includes("in_planning->ready_for_checkout:traveler"), `then the ordinary edge (got ${steps})`);

  const again = await tryAgain(owner, tripId, itemId);
  assert.equal(again.status, 200, again.text);
  assert.equal(again.json?.changed, false);
  assert.equal(await cartLines(itemId), 1, "still ONE cart line");
});

test("R3: on a FINALIZED plan, the failed payment's in-final item goes back to checkout", async () => {
  const { tripId, itemId } = await seedBought(owner, "failed", `Tea house ${RUN}`);
  assert.equal((await call(owner, "POST", `/api/trips/${tripId}/finalize`)).status, 200);

  const r = await tryAgain(owner, tripId, itemId);
  assert.equal(r.status, 200, `a failed payment is not "already purchased" (got ${r.status}: ${r.text})`);
  assert.equal((await itemRow(itemId)).routing_status, "ready_for_checkout");
  assert.equal(await cartLines(itemId), 1);
});

test("R4: a CONFIRMED booking still refuses — open plan and finalized — and nothing moves", async () => {
  const open = await seedBought(owner, "confirmed", `Garden ${RUN}`);
  const r = await tryAgain(owner, open.tripId, open.itemId);
  assert.equal(r.status, 409, r.text);
  assert.equal((await itemRow(open.itemId)).routing_status, "purchased");
  assert.equal(await cartLines(open.itemId), 0);

  const fin = await seedBought(owner, "confirmed", `Temple ${RUN}`);
  assert.equal((await call(owner, "POST", `/api/trips/${fin.tripId}/finalize`)).status, 200);
  const f = await tryAgain(owner, fin.tripId, fin.itemId);
  assert.equal(f.status, 409, f.text);
  assert.equal(f.json?.code, "already_purchased");
  assert.equal((await itemRow(fin.itemId)).routing_status, "purchased");
  assert.equal(await cartLines(fin.itemId), 0);
});

test("R5: a stranger is refused, and a DISPUTED booking is not a failed payment", async () => {
  const failed = await seedBought(owner, "failed", `Sake ${RUN}`);
  const s = await tryAgain(stranger, failed.tripId, failed.itemId);
  assert.equal(s.status, 403, s.text);
  assert.equal((await itemRow(failed.itemId)).routing_status, "purchased");
  assert.equal(await cartLines(failed.itemId), 0);

  const disputed = await seedBought(owner, "disputed", `Walk ${RUN}`);
  const d = await tryAgain(owner, disputed.tripId, disputed.itemId);
  assert.equal(d.status, 409, d.text);
  assert.equal((await itemRow(disputed.itemId)).routing_status, "purchased");
  assert.equal(await cartLines(disputed.itemId), 0);
});
