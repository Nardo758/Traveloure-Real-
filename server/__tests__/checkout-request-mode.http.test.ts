/**
 * A LISTING THE SELLER MUST ACCEPT IS NEVER CHARGED OFF THE CART.
 *
 * Ledger `2026-09-25-checkout-request-mode`. Sibling of `cart-priceless-listing.http.test.ts`
 * (the V-11 cart rails) — same boot, same throwaway database, same posture.
 *
 * THE DEFECT, REPRODUCED ON UNFIXED CODE BEFORE THE FIX. A `provider_services` listing whose
 * booking mode resolves to `request` (ruling 75's `resolveBookingMode` — an unset mode on an owner
 * with no instant flag is `request`, the platform's safe default: "the traveler asks, the seller
 * accepts, and no money moves without an acceptance") went into the cart at `POST /api/cart` 201,
 * and `POST /api/checkout` claimed a `service_bookings` row, took the slot and walked to the
 * Stripe call at LIST PRICE — the promotion then lands `confirmed` with no acceptance from anyone.
 * A `price_type = 'custom_quote'` listing carrying a price did the same, although Locked
 * Decision 49 prices a quote by an ISSUED `service_quotes` row and charges it only through
 * `POST /api/checkout { quoteBookingId }`. The button never offered either
 * (`resolveBuyAction` row 11 lands them on `booking_request`); the rails behind it never read the
 * mode at all.
 *
 *   R1  `POST /api/cart` refuses a request-mode listing — 400 `listing_requires_request` — and
 *       writes NO cart row.
 *   R2  `POST /api/cart/items` refuses a `custom_quote` listing EVEN WHEN it is declared instant
 *       and carries a price: a quote is a quote whatever the mode says (LD 49).
 *   R3  AN INSTANT LISTING IS UNAFFECTED — declared on the listing, or resolved from the OWNER'S
 *       account flag — and the cart read carries NO `requestOnlyItemIds` key at all.
 *   R4  `hidden` is refused as `listing_not_bookable`, a different fact with its own sentence.
 *   R5  A REQUEST-MODE ROW ALREADY ON DISK is NAMED by `GET /api/cart` and `/api/cart/fee-preview`
 *       and contributes NOTHING to their totals — neither read quotes a charge for it (§13).
 *   R6  `POST /api/checkout` refuses that cart 409 `listing_requires_request` BEFORE ANY CLAIM:
 *       no `service_bookings` row, and the slot the line names keeps its `booked_count` (§15b).
 *   R7  A custom-quote line on disk is refused at checkout the same way.
 *   R8  AN INSTANT-ONLY CART STILL CHECKS OUT past the pre-flight: the claim is taken (a
 *       `payment_pending` row exists) — the refusal did not become a blanket one.
 *   R9  THE LD 39 PROJECTION: a request-mode item routed `ready_for_checkout` projects NOTHING and
 *       says why (`listing_requires_request`), while an instant item on the same plan projects —
 *       and adding the request-mode listing TO THE PLAN still works.
 *   R10 THE ONE PREDICATE (pure): it calls `resolveBookingMode` and nothing else decides the mode.
 *
 * SERVER REQUIRED (JOURNEY_BASE_URL, default :5000) + DISPOSABLE DB ONLY. Every row this file
 * writes it deletes. No Stripe key is needed: every refusal lands BEFORE any Stripe call, and R8
 * asserts only that the claim was taken (the stub key then fails the call, which is not asserted).
 *
 * Run solo against a local server:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-force-exit \
 *     server/__tests__/checkout-request-mode.http.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

import { db, pool } from "../db";
import * as cartProjection from "../services/cart-projection.service";
import {
  listingRequiresRequest,
  REQUEST_ONLY_REFUSAL_MESSAGE,
} from "../services/buy-action-payload";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

const buyerEmail = `reqmode-${RUN}-buyer@t.test`;
const ids = {
  provider: `reqmode-${RUN}-prov`,
  instantProvider: `reqmode-${RUN}-prov-instant`,
  request: `reqmode-${RUN}-svc-request`,
  quote: `reqmode-${RUN}-svc-quote`,
  instant: `reqmode-${RUN}-svc-instant`,
  accountInstant: `reqmode-${RUN}-svc-acct-instant`,
  hidden: `reqmode-${RUN}-svc-hidden`,
  slot: `reqmode-${RUN}-slot`,
  trip: `reqmode-${RUN}-trip`,
  itemRequest: `reqmode-${RUN}-item-request`,
  itemInstant: `reqmode-${RUN}-item-instant`,
  form: `reqmode-${RUN}-form`,
};
const ALL_SERVICES = [ids.request, ids.quote, ids.instant, ids.accountInstant, ids.hidden];
let buyerId = "";
let buyerCookie = "";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  if (!(host !== null && DISPOSABLE_HOSTS.has(host))) {
    throw new Error(
      `[checkout-request-mode] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is ` +
        `not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

function api(path: string, cookie: string | undefined, method = "GET", body?: unknown) {
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function makeService(
  id: string,
  owner: string,
  opts: { bookingMode?: string | null; priceType?: string; price?: string },
): Promise<void> {
  await db.execute(sql`
    INSERT INTO provider_services
      (id, user_id, service_name, description, price, price_type, booking_mode, status, approval_status, delivery_method)
    VALUES
      (${id}, ${owner}, ${`Request mode ${RUN} ${id.slice(-8)}`}, 'fixture', ${opts.price ?? "150.00"},
       ${opts.priceType ?? "fixed"}, ${opts.bookingMode ?? null}, 'active', 'approved', 'call')
  `);
}

async function cartRowCount(serviceId: string): Promise<number> {
  const r = await db.execute(sql`
    SELECT count(*)::int AS n FROM cart_items WHERE user_id = ${buyerId} AND service_id = ${serviceId}
  `);
  return (r.rows[0] as any).n as number;
}
async function bookingCount(): Promise<number> {
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM service_bookings WHERE traveler_id = ${buyerId}`);
  return (r.rows[0] as any).n as number;
}
async function slotBooked(): Promise<number> {
  const r = await db.execute(sql`SELECT booked_count FROM vendor_availability_slots WHERE id = ${ids.slot}`);
  return Number((r.rows[0] as any)?.booked_count ?? -1);
}
async function clearBuyerCart(): Promise<void> {
  await db.execute(sql`DELETE FROM cart_items WHERE user_id = ${buyerId}`);
}
/** A cart row seeded DIRECTLY — what an add made before this lane leaves on disk. */
async function seedCartRow(serviceId: string, slotId?: string): Promise<string> {
  const id = `reqmode-${RUN}-cart-${crypto.randomUUID().slice(0, 6)}`;
  await db.execute(sql`
    INSERT INTO cart_items (id, user_id, service_id, quantity, trip_id, slot_id)
    VALUES (${id}, ${buyerId}, ${serviceId}, 1, ${ids.trip}, ${slotId ?? null})
  `);
  return id;
}
async function checkout() {
  const res = await api("/api/checkout", buyerCookie, "POST", {
    idempotencyKey: `reqmode-${RUN}-${crypto.randomUUID()}`,
    tripId: ids.trip,
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { status: res.status, body, text };
}

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `server must be running on ${BASE_URL}`);
  await assertDisposableDb();

  const reg = await api("/api/auth/register", undefined, "POST", {
    email: buyerEmail,
    password: PASSWORD,
    firstName: "Request",
    lastName: "Mode",
  });
  if (reg.status !== 201) assert.fail(`register buyer failed (${reg.status}): ${await reg.text().catch(() => "")}`);
  const setCookie = reg.headers.get("set-cookie");
  assert.ok(setCookie, "register must set a session cookie");
  buyerCookie = setCookie!.split(";")[0];
  buyerId = ((await reg.json()) as any).user.id;

  // An owner with NO provider form: an unset mode resolves `request` (the platform default).
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.provider}, ${`reqmode-${RUN}-prov@t.test`}, 'Prov', 'Fixture', 'service_provider')`);
  // An owner whose ACCOUNT says instant: an unset mode resolves `instant` from the flag.
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.instantProvider}, ${`reqmode-${RUN}-prov2@t.test`}, 'Prov', 'Instant', 'service_provider')`);
  await db.execute(sql`
    INSERT INTO service_provider_forms
      (id, user_id, business_name, name, email, mobile, country, address, business_type, instant_booking)
    VALUES
      (${ids.form}, ${ids.instantProvider}, 'Instant Co', 'Instant Owner', ${`reqmode-${RUN}-prov2@t.test`},
       '000', 'JP', 'Kyoto', 'tour', true)
  `);

  await makeService(ids.request, ids.provider, { bookingMode: null });
  await makeService(ids.quote, ids.provider, { bookingMode: "instant", priceType: "custom_quote" });
  await makeService(ids.instant, ids.provider, { bookingMode: "instant" });
  await makeService(ids.accountInstant, ids.instantProvider, { bookingMode: null });
  await makeService(ids.hidden, ids.provider, { bookingMode: "hidden" });

  const date = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
  await db.execute(sql`
    INSERT INTO vendor_availability_slots
      (id, service_id, provider_id, date, start_time, end_time, capacity, booked_count, status)
    VALUES (${ids.slot}, ${ids.request}, ${ids.provider}, ${date}, '10:00', '11:00', 5, 0, 'available')
  `);

  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${ids.trip}, ${buyerId}, 'Request mode trip', 'Kyoto', CURRENT_DATE + 30, CURRENT_DATE + 35)`);
});

after(async () => {
  try {
    await db.execute(sql`DELETE FROM cart_items WHERE user_id = ${buyerId}`);
    await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${ids.trip}`);
    await db.execute(sql`DELETE FROM service_bookings WHERE traveler_id = ${buyerId}`);
    await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`);
    await db.execute(sql`DELETE FROM vendor_availability_slots WHERE id = ${ids.slot}`);
    for (const id of ALL_SERVICES) await db.execute(sql`DELETE FROM provider_services WHERE id = ${id}`);
    await db.execute(sql`DELETE FROM service_provider_forms WHERE id = ${ids.form}`);
    await db.execute(sql`DELETE FROM users WHERE id IN (${ids.provider}, ${ids.instantProvider})`);
    await db.execute(sql`DELETE FROM users WHERE email = ${buyerEmail}`);
  } finally {
    await pool.end();
  }
});

// ── R1 ────────────────────────────────────────────────────────────────────────────────────────
test("R1: POST /api/cart refuses a request-mode listing and writes no cart row", async () => {
  await clearBuyerCart();
  const res = await api("/api/cart", buyerCookie, "POST", { serviceId: ids.request, quantity: 1 });
  const body = (await res.json()) as any;
  assert.equal(res.status, 400, `expected 400, got ${res.status}: ${JSON.stringify(body)}`);
  assert.equal(body.reason, "listing_requires_request");
  assert.equal(body.message, REQUEST_ONLY_REFUSAL_MESSAGE.listing_requires_request, "the ONE sentence");
  assert.equal(body.listingPath, `/services/${ids.request}`, "names where the request control lives");
  assert.equal(await cartRowCount(ids.request), 0, "a refusal is not an add");
});

// ── R2 ────────────────────────────────────────────────────────────────────────────────────────
test("R2: POST /api/cart/items refuses a custom-quote listing even when declared instant and priced", async () => {
  const res = await api("/api/cart/items", buyerCookie, "POST", { serviceId: ids.quote, quantity: 1 });
  const body = (await res.json()) as any;
  assert.equal(res.status, 400, `expected 400, got ${res.status}: ${JSON.stringify(body)}`);
  assert.equal(body.reason, "listing_requires_request");
  assert.equal(await cartRowCount(ids.quote), 0);
});

// ── R3 ────────────────────────────────────────────────────────────────────────────────────────
test("R3: an instant listing (declared, or from the owner's flag) carts exactly as before", async () => {
  await clearBuyerCart();
  const a = await api("/api/cart", buyerCookie, "POST", { serviceId: ids.instant, quantity: 1 });
  assert.equal(a.status, 201, `a declared-instant listing must cart, got ${a.status}: ${await a.text()}`);
  const b = await api("/api/cart", buyerCookie, "POST", { serviceId: ids.accountInstant, quantity: 1 });
  assert.equal(b.status, 201, `an account-instant listing must cart, got ${b.status}: ${await b.text()}`);

  const cart = (await (await api("/api/cart", buyerCookie)).json()) as any;
  assert.equal(cart.itemCount, 2);
  assert.equal(cart.subtotal, "300.00");
  assert.ok(!("requestOnlyItemIds" in cart), "an all-instant cart carries NO request-only key");
  await clearBuyerCart();
});

// ── R4 ────────────────────────────────────────────────────────────────────────────────────────
test("R4: a hidden listing is refused as listing_not_bookable — a different fact", async () => {
  const res = await api("/api/cart", buyerCookie, "POST", { serviceId: ids.hidden, quantity: 1 });
  const body = (await res.json()) as any;
  assert.equal(res.status, 400);
  assert.equal(body.reason, "listing_not_bookable");
  assert.equal(await cartRowCount(ids.hidden), 0);
});

// ── R5 ────────────────────────────────────────────────────────────────────────────────────────
test("R5: a request-mode row ALREADY on disk is named and quotes no charge on either read", async () => {
  await clearBuyerCart();
  const legacy = await seedCartRow(ids.request);
  await seedCartRow(ids.instant);

  const cart = (await (await api("/api/cart", buyerCookie)).json()) as any;
  assert.equal(cart.itemCount, 2, "nothing is deleted on the traveler's behalf");
  assert.deepEqual(cart.requestOnlyItemIds, [legacy]);
  assert.deepEqual(cart.requestOnlyReasons, { [legacy]: "listing_requires_request" });
  assert.equal(cart.subtotal, "150.00", "only the instant line is quoted");

  const preview = (await (await api(`/api/cart/fee-preview?tripId=${ids.trip}`, buyerCookie)).json()) as any;
  assert.deepEqual(preview.requestOnlyItemIds, [legacy]);
  assert.deepEqual(preview.requestOnlyReasons, cart.requestOnlyReasons, "the two reads agree, word for word");
  assert.equal(preview.subtotal, 150, "the fee preview quotes the same single line");
  await clearBuyerCart();
});

// ── R6 ────────────────────────────────────────────────────────────────────────────────────────
test("R6: POST /api/checkout refuses a request-mode line BEFORE any claim, slot or Stripe call", async () => {
  await clearBuyerCart();
  await seedCartRow(ids.request, ids.slot);
  const bookedBefore = await slotBooked();
  const bookingsBefore = await bookingCount();

  const res = await checkout();
  assert.equal(res.status, 409, `expected 409, got ${res.status}: ${res.text}`);
  assert.equal(res.body.error, "listing_requires_request");
  assert.equal(res.body.serviceId, ids.request, "the refusal NAMES the listing");
  assert.equal(res.body.listingPath, `/services/${ids.request}`);

  assert.equal(await bookingCount(), bookingsBefore, "no service_bookings row — no claim was taken");
  assert.equal(await slotBooked(), bookedBefore, "the slot keeps its capacity — nothing was reserved");
  assert.equal(await cartRowCount(ids.request), 1, "and the cart is intact");
  await clearBuyerCart();
});

// ── R7 ────────────────────────────────────────────────────────────────────────────────────────
test("R7: a custom-quote line on disk is refused at checkout the same way (LD 49)", async () => {
  await clearBuyerCart();
  await seedCartRow(ids.instant);
  await seedCartRow(ids.quote);
  const bookingsBefore = await bookingCount();
  const res = await checkout();
  assert.equal(res.status, 409, `expected 409, got ${res.status}: ${res.text}`);
  assert.equal(res.body.error, "listing_requires_request");
  assert.equal(res.body.serviceId, ids.quote);
  assert.equal(await bookingCount(), bookingsBefore, "not even the instant sibling line was claimed");
  await clearBuyerCart();
});

// ── R8 ────────────────────────────────────────────────────────────────────────────────────────
test("R8: an instant-only cart still gets past the pre-flight and takes its claim", async () => {
  await clearBuyerCart();
  await seedCartRow(ids.instant);
  const bookingsBefore = await bookingCount();
  const res = await checkout();
  assert.notEqual(res.body?.error, "listing_requires_request", `not refused as request-only: ${res.text}`);
  assert.notEqual(res.status, 409, `an instant cart is not a conflict: ${res.text}`);
  assert.ok((await bookingCount()) > bookingsBefore, `the claim was taken (status ${res.status}: ${res.text})`);
  await db.execute(sql`DELETE FROM service_bookings WHERE traveler_id = ${buyerId}`);
  await clearBuyerCart();
});

// ── R9 ────────────────────────────────────────────────────────────────────────────────────────
test("R9: the plan keeps the item; the LD 39 checkout projection declines it and says why", async () => {
  await clearBuyerCart();
  // Adding to the PLAN still works — only the move to checkout is refused.
  const add = await api(`/api/trips/${ids.trip}/itinerary-items`, buyerCookie, "POST", {
    title: "Request-mode listing on the plan",
    providerServiceId: ids.request,
    dayNumber: 1,
  });
  assert.ok(add.status === 200 || add.status === 201, `plan add must still work, got ${add.status}: ${await add.text()}`);

  await db.execute(sql`
    INSERT INTO itinerary_items (id, trip_id, title, provider_service_id, routing_status, day_number)
    VALUES (${ids.itemRequest}, ${ids.trip}, 'Request line', ${ids.request}, 'ready_for_checkout', 1)
  `);
  await db.execute(sql`
    INSERT INTO itinerary_items (id, trip_id, title, provider_service_id, routing_status, day_number)
    VALUES (${ids.itemInstant}, ${ids.trip}, 'Instant line', ${ids.instant}, 'ready_for_checkout', 1)
  `);
  const refused = await cartProjection.syncItemProjection(ids.itemRequest);
  assert.equal(refused.action, "noop");
  assert.equal((refused as any).reason, "listing_requires_request");
  assert.equal(await cartRowCount(ids.request), 0, "no cart row for the request-mode item");

  const projected = await cartProjection.syncItemProjection(ids.itemInstant);
  assert.equal(projected.action, "upserted", "an instant item projects exactly as before");
  assert.equal(await cartRowCount(ids.instant), 1);
  await clearBuyerCart();
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${ids.trip}`);
});

// ── R10 ───────────────────────────────────────────────────────────────────────────────────────
test("R10: the one predicate reads the resolved mode and the quote price type, nothing else", () => {
  // Unset mode: the owner's flag decides, through resolveBookingMode.
  assert.equal(listingRequiresRequest({ bookingMode: null }, undefined)?.reason, "listing_requires_request");
  assert.equal(listingRequiresRequest({ bookingMode: null }, null)?.reason, "listing_requires_request");
  assert.equal(listingRequiresRequest({ bookingMode: null }, false)?.reason, "listing_requires_request");
  assert.equal(listingRequiresRequest({ bookingMode: null }, true), null);
  // A declared mode wins over the flag.
  assert.equal(listingRequiresRequest({ bookingMode: "instant" }, false), null);
  assert.equal(listingRequiresRequest({ bookingMode: "request" }, true)?.reason, "listing_requires_request");
  assert.equal(listingRequiresRequest({ bookingMode: "hidden" }, true)?.reason, "listing_not_bookable");
  // A custom quote is a quote whatever the mode says.
  assert.equal(
    listingRequiresRequest({ bookingMode: "instant", priceType: "custom_quote" }, true)?.reason,
    "listing_requires_request",
  );
});
