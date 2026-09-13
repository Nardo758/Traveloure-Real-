/**
 * A LISTING THAT PUBLISHES NO PRICE IS REFUSED AT EVERY CART RAIL — V-11, one endpoint over.
 *
 * Ledger `2026-09-13-cart-priceless-gap`. Sibling of `booking-birth-provenance.db.test.ts` B9,
 * which proved the same refusal on `POST /api/bookings`.
 *
 * WHY IT EXISTS — FOUND BY CLICKING, NOT BY READING. With the app stood up against a throwaway
 * Postgres and a real traveler registered through `POST /api/auth/register`, the custom-quote
 * archetype fixture (`archetype-fixture-p5`, `price` NULL) was carted: `POST /api/cart` → **201**;
 * `GET /api/cart` → `subtotal: "0.00", total: "0.00", itemCount: 1`; `GET /api/cart/fee-preview`
 * agreed; and `POST /api/checkout` reached the **Stripe call** with nothing in front of it. The
 * SAME listing at `POST /api/bookings` was refused 400. So V-11's fix held on the rail it covered
 * and the cart rail had the identical hole — "no price stated" rendered to the traveler as FREE,
 * which is the §13 lie V-11 exists to refuse, and a pricing rule enforced only by Stripe's own
 * minimum-amount check is not enforced by the platform at all.
 *
 * THE RULE IS RULING 9's, NOT THIS SUITE'S. `resolveBuyAction` is the sole author of the buy
 * button and the landing rule; its row 11 lands a priceless listing on `booking_request` in every
 * branch and never on `checkout`. These proofs assert that the rails agree with it.
 *
 *   C1  `POST /api/cart` refuses a NULL-price listing — 400, `reason: "no_published_price"` — and
 *       NO cart row exists afterwards (a refusal is not a $0 add).
 *   C2  a `0.00` price is the same fact wearing a number, and is refused identically.
 *   C3  `POST /api/cart/items` — the second live add rail — refuses it the same way.
 *   C4  A PRICED LISTING IS UNAFFECTED: 201, and `GET /api/cart` reports its real subtotal with
 *       NO `unpriceableItemIds` key at all (present-only-when-set).
 *   C5  AN EMPTY CART IS GENUINELY ZERO: `subtotal "0.00"`, `total "0.00"`, `itemCount 0`, and no
 *       `unpriceableItemIds`. "Nothing in the cart" and "a line we cannot price" stay different
 *       answers — this is the distinction the fix must not destroy.
 *   C6  A ROW ALREADY ON DISK IS NAMED, NEVER ZERO-FILLED (§13): a legacy priceless row seeded
 *       DIRECTLY (bypassing the rails, exactly as a pre-fix add or a later price-unpublish left
 *       one) is reported in `unpriceableItemIds` by BOTH `GET /api/cart` and
 *       `GET /api/cart/fee-preview`. Nothing is deleted on the traveler's behalf.
 *   C7  `POST /api/checkout` on that cart answers 409 `no_published_price` and **writes nothing**:
 *       no `service_bookings` row for the listing, so no claim was taken and no Stripe call was
 *       made (§15b — the refusal is in the same pre-flight block as its archived-listing sibling,
 *       before any slot claim, booking row or PaymentIntent).
 *   C8  THE LD 39 PROJECTION RAIL: an `itinerary_items` row naming a priceless listing, routed
 *       `ready_for_checkout`, projects NOTHING — `syncItemProjection` answers
 *       `{action:"noop", reason:"no_published_price"}` and writes no cart row — while a priced
 *       item on the same trip still upserts its projection exactly as before.
 *   C9  ONE REFUSAL, NOT TWO VOICES: the cart rail's `reason` AND `message` are byte-identical to
 *       `POST /api/bookings`'s, because both read the same exported constant (§18 rule 1).
 *   C10 STATIC PIN over the file SET (comments stripped): every server file that prices a cart
 *       line off `service.price` consults `hasPublishedPrice`. Derived from the file set, never
 *       from a call-site count — a pin that breaks because code moved is repaired, not deleted.
 *
 * SERVER REQUIRED (JOURNEY_BASE_URL, default :5000) + DISPOSABLE DB ONLY. Every row this file
 * writes is created and deleted by it. No Stripe key is exercised: C7 proves the rail refuses
 * BEFORE any Stripe call, which is the whole point.
 *
 * Run solo against a local dev server:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-force-exit \
 *     server/__tests__/cart-priceless-listing.http.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";

import { db, pool } from "../db";
import * as cartProjection from "../services/cart-projection.service";
import { hasPublishedPrice, PRICELESS_LISTING_REFUSAL } from "../services/buy-action-payload";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

const buyerEmail = `cartpl-${RUN}-buyer@t.test`;
const ids = {
  provider: `cartpl-${RUN}-prov`,
  priced: `cartpl-${RUN}-svc-priced`,
  nullPrice: `cartpl-${RUN}-svc-null`,
  zeroPrice: `cartpl-${RUN}-svc-zero`,
  trip: `cartpl-${RUN}-trip`,
  itemPriceless: `cartpl-${RUN}-item-null`,
  itemPriced: `cartpl-${RUN}-item-priced`,
};
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
      `[cart-priceless] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not a ` +
        `recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
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

/** A listing owned by the fixture provider. `price` NULL is the custom-quote shape. */
async function makeService(id: string, price: string | null): Promise<void> {
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, status, approval_status, delivery_method)
    VALUES (${id}, ${ids.provider}, ${`Cart priceless ${RUN}`}, 'fixture', ${price}, 'active', 'approved', 'in_person')
  `);
}

async function cartRowCount(serviceId: string): Promise<number> {
  const r = await db.execute(sql`
    SELECT count(*)::int AS n FROM cart_items WHERE user_id = ${buyerId} AND service_id = ${serviceId}
  `);
  return (r.rows[0] as any).n as number;
}

async function clearBuyerCart(): Promise<void> {
  await db.execute(sql`DELETE FROM cart_items WHERE user_id = ${buyerId}`);
}

/** Seed a cart row DIRECTLY — what a pre-fix add, or a seller unpublishing a price after an add,
 *  leaves on disk. Deliberately not through any rail: the rails now refuse it. */
async function seedLegacyCartRow(serviceId: string): Promise<string> {
  const id = `cartpl-${RUN}-legacy-${crypto.randomUUID().slice(0, 6)}`;
  await db.execute(sql`
    INSERT INTO cart_items (id, user_id, service_id, quantity)
    VALUES (${id}, ${buyerId}, ${serviceId}, 1)
  `);
  return id;
}

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `server must be running on ${BASE_URL}`);
  await assertDisposableDb();

  const reg = await api("/api/auth/register", undefined, "POST", {
    email: buyerEmail,
    password: PASSWORD,
    firstName: "Cart",
    lastName: "Priceless",
  });
  if (reg.status !== 201) {
    assert.fail(`register buyer failed (${reg.status}): ${await reg.text().catch(() => "")}`);
  }
  const setCookie = reg.headers.get("set-cookie");
  assert.ok(setCookie, "register must set a session cookie");
  buyerCookie = setCookie!.split(";")[0];
  buyerId = ((await reg.json()) as any).user.id;

  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.provider}, ${`cartpl-${RUN}-prov@t.test`}, 'Prov', 'Fixture', 'service_provider')`);
  await makeService(ids.priced, "250.00");
  await makeService(ids.nullPrice, null);
  await makeService(ids.zeroPrice, "0.00");

  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${ids.trip}, ${buyerId}, 'Cart priceless trip', 'Kyoto', CURRENT_DATE + 30, CURRENT_DATE + 35)`);
});

after(async () => {
  try {
    await db.execute(sql`DELETE FROM cart_items WHERE user_id = ${buyerId}`);
    await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${ids.trip}`);
    await db.execute(sql`DELETE FROM service_bookings WHERE traveler_id = ${buyerId}`);
    await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`);
    await db.execute(
      sql`DELETE FROM provider_services WHERE id IN (${ids.priced}, ${ids.nullPrice}, ${ids.zeroPrice})`,
    );
    await db.execute(sql`DELETE FROM users WHERE id = ${ids.provider}`);
    await db.execute(sql`DELETE FROM users WHERE email = ${buyerEmail}`);
  } finally {
    await pool.end();
  }
});

// ── C1 ────────────────────────────────────────────────────────────────────────────────────────
test("C1: POST /api/cart refuses a listing with NO published price, and adds nothing", async () => {
  const res = await api("/api/cart", buyerCookie, "POST", { serviceId: ids.nullPrice, quantity: 1 });
  const body = (await res.json()) as any;
  assert.equal(res.status, 400, `expected 400, got ${res.status}: ${JSON.stringify(body)}`);
  assert.equal(body.reason, "no_published_price", "the resolver's OWN refusal vocabulary");
  assert.equal(
    await cartRowCount(ids.nullPrice),
    0,
    "a refusal is not a $0 add — no cart row may exist",
  );
});

// ── C2 ────────────────────────────────────────────────────────────────────────────────────────
test("C2: a 0.00 price is the same fact wearing a number, and is refused identically", async () => {
  const res = await api("/api/cart", buyerCookie, "POST", { serviceId: ids.zeroPrice, quantity: 1 });
  const body = (await res.json()) as any;
  assert.equal(res.status, 400, `expected 400, got ${res.status}: ${JSON.stringify(body)}`);
  assert.equal(body.reason, "no_published_price");
  assert.equal(await cartRowCount(ids.zeroPrice), 0);

  // The predicate directly — the ONE translation both the button and every rail read.
  assert.equal(hasPublishedPrice(null), false);
  assert.equal(hasPublishedPrice("0.00"), false);
  assert.equal(hasPublishedPrice("250.00"), true);
});

// ── C3 ────────────────────────────────────────────────────────────────────────────────────────
test("C3: POST /api/cart/items — the second live add rail — refuses it the same way", async () => {
  const res = await api("/api/cart/items", buyerCookie, "POST", { serviceId: ids.nullPrice, quantity: 1 });
  const body = (await res.json()) as any;
  assert.equal(res.status, 400, `expected 400, got ${res.status}: ${JSON.stringify(body)}`);
  assert.equal(body.reason, "no_published_price");
  assert.equal(await cartRowCount(ids.nullPrice), 0);
});

// ── C4 ────────────────────────────────────────────────────────────────────────────────────────
test("C4: a PRICED listing is unaffected — it carts, and the cart reports its real subtotal", async () => {
  await clearBuyerCart();
  const add = await api("/api/cart", buyerCookie, "POST", { serviceId: ids.priced, quantity: 1 });
  assert.equal(add.status, 201, `a priced listing must still cart, got ${add.status}`);

  const cart = (await (await api("/api/cart", buyerCookie)).json()) as any;
  assert.equal(cart.itemCount, 1);
  assert.equal(cart.subtotal, "250.00", "the catalog price, unchanged");
  assert.ok(
    !("unpriceableItemIds" in cart),
    "a fully-priced cart carries NO unpriceable key at all (present-only-when-set)",
  );

  const preview = (await (await api("/api/cart/fee-preview", buyerCookie)).json()) as any;
  assert.equal(preview.subtotal, 250, "the quote prices the line the same way");
  assert.ok(!("unpriceableItemIds" in preview), "and names nothing it could not price");
  await clearBuyerCart();
});

// ── C5 ────────────────────────────────────────────────────────────────────────────────────────
test("C5: an EMPTY cart is genuinely zero — that distinction is not what this lane broke", async () => {
  await clearBuyerCart();
  const cart = (await (await api("/api/cart", buyerCookie)).json()) as any;
  assert.equal(cart.itemCount, 0);
  assert.equal(cart.subtotal, "0.00", "an empty cart really does total nothing");
  assert.equal(cart.total, "0.00");
  assert.ok(
    !("unpriceableItemIds" in cart),
    "nothing is unpriceable in an empty cart — zero here is an answer, not an absence",
  );
});

// ── C6 ────────────────────────────────────────────────────────────────────────────────────────
test("C6: a priceless row ALREADY on disk is NAMED by both reads, never zero-filled (§13)", async () => {
  await clearBuyerCart();
  const legacyId = await seedLegacyCartRow(ids.nullPrice);

  const cart = (await (await api("/api/cart", buyerCookie)).json()) as any;
  assert.equal(cart.itemCount, 1, "the row is still in the traveler's cart — nothing is deleted for them");
  assert.deepEqual(cart.unpriceableItemIds, [legacyId], "and the response NAMES the line it could not price");
  assert.equal(cart.unpriceableReason, "no_published_price");

  const preview = (await (await api("/api/cart/fee-preview", buyerCookie)).json()) as any;
  assert.deepEqual(preview.unpriceableItemIds, [legacyId], "the quote says the same thing");
  assert.equal(preview.unpriceableReason, "no_published_price");
});

// ── C7 ────────────────────────────────────────────────────────────────────────────────────────
test("C7: POST /api/checkout refuses that cart BEFORE any claim or Stripe call", async () => {
  await clearBuyerCart();
  await seedLegacyCartRow(ids.nullPrice);

  const res = await api("/api/checkout", buyerCookie, "POST", {
    idempotencyKey: `cartpl-${RUN}-${crypto.randomUUID()}`,
    tripId: ids.trip,
  });
  const body = (await res.json()) as any;
  assert.equal(res.status, 409, `expected 409, got ${res.status}: ${JSON.stringify(body)}`);
  assert.equal(body.reason, "no_published_price", "the same typed reason every rail answers with");

  // §15b: the refusal sits with the archived-listing pre-flight, ahead of the first booking
  // insert — so nothing was claimed and there is nothing to unwind.
  const booked = await db.execute(sql`
    SELECT count(*)::int AS n FROM service_bookings WHERE traveler_id = ${buyerId}
  `);
  assert.equal((booked.rows[0] as any).n, 0, "no booking row — no claim was taken, no PaymentIntent minted");
  await clearBuyerCart();
});

// ── C8 ────────────────────────────────────────────────────────────────────────────────────────
test("C8: the LD 39 projection holds nothing it cannot price, and still projects a priced item", async () => {
  await clearBuyerCart();
  await db.execute(sql`
    INSERT INTO itinerary_items (id, trip_id, title, provider_service_id, routing_status, day_number)
    VALUES (${ids.itemPriceless}, ${ids.trip}, 'Quote-only line', ${ids.nullPrice}, 'ready_for_checkout', 1)
  `);
  await db.execute(sql`
    INSERT INTO itinerary_items (id, trip_id, title, provider_service_id, routing_status, day_number)
    VALUES (${ids.itemPriced}, ${ids.trip}, 'Priced line', ${ids.priced}, 'ready_for_checkout', 1)
  `);

  const refused = await cartProjection.syncItemProjection(ids.itemPriceless);
  assert.equal(refused.action, "noop");
  assert.equal(
    (refused as any).reason,
    "no_published_price",
    "the projection says WHY it holds nothing (§13), rather than writing a $0 line",
  );
  assert.equal(await cartRowCount(ids.nullPrice), 0, "and no cart row was written");

  const projected = await cartProjection.syncItemProjection(ids.itemPriced);
  assert.equal(projected.action, "upserted", "a priced item projects exactly as before");
  assert.equal(await cartRowCount(ids.priced), 1);

  await clearBuyerCart();
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${ids.trip}`);
});

// ── C9 ────────────────────────────────────────────────────────────────────────────────────────
test("C9: the cart rail and the booking rail refuse in ONE voice, not two (§18 rule 1)", async () => {
  const cartRes = await api("/api/cart", buyerCookie, "POST", { serviceId: ids.nullPrice, quantity: 1 });
  const cartBody = (await cartRes.json()) as any;

  const bookRes = await api("/api/bookings", buyerCookie, "POST", {
    serviceId: ids.nullPrice,
    tripId: ids.trip,
    bookingDetails: {},
  });
  const bookBody = (await bookRes.json()) as any;
  assert.equal(bookRes.status, 400, `the booking rail's own V-11 refusal, got ${bookRes.status}`);

  assert.equal(cartBody.reason, bookBody.reason, "same typed reason");
  assert.equal(cartBody.message, bookBody.message, "same sentence — one constant, two callers");
  assert.equal(cartBody.message, PRICELESS_LISTING_REFUSAL.message, "and it is the exported one");
});

// ── C10 ───────────────────────────────────────────────────────────────────────────────────────
test("C10: every server file that prices a cart line off service.price consults the predicate", () => {
  const roots = ["server/routes.ts", "server/routes", "server/services"];
  const files: string[] = [];
  for (const root of roots) {
    const abs = path.join(process.cwd(), root);
    if (!fs.existsSync(abs)) continue;
    if (fs.statSync(abs).isFile()) files.push(root);
    else for (const f of fs.readdirSync(abs)) if (f.endsWith(".ts")) files.push(path.join(root, f));
  }
  assert.ok(files.length > 20, `expected the route/service file set, found ${files.length}`);

  const stripped = (rel: string) =>
    fs
      .readFileSync(path.join(process.cwd(), rel), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

  // The cart's own zero-fallback: `parseFloat(item?.service?.price || "0")` and its spellings.
  // Comments stripped, so a mention in prose cannot satisfy the pin.
  const cartZeroFallback = /parseFloat\(\s*item\??\.?\??\.service\??\.price\s*\|\|\s*"0"\s*\)/;
  const derivers = files.filter((rel) => cartZeroFallback.test(stripped(rel)));
  assert.ok(
    derivers.length > 0,
    "the cart's base-amount derivation this pin guards has moved — repair the pin, do not delete it",
  );
  for (const rel of derivers) {
    assert.ok(
      stripped(rel).includes("hasPublishedPrice"),
      `${rel} prices a cart line off a listing price with a "0" fallback and never consults ` +
        `hasPublishedPrice (ledger 2026-09-13-cart-priceless-gap)`,
    );
  }

  // NEGATIVE SPACE, stated: this pin sees a FILE, not a rail. It cannot tell that a NEW
  // cart-entry rail was added without the gate — only that a file which still prices a line the
  // old way stopped reading the predicate. A new rail is a human decision, and its absence here
  // is unchecked, not exonerated.
});
