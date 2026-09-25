/**
 * D-14 ON THE WIRE: WHAT EACH ARCHETYPE'S CART RAIL ACCEPTS, AND WHAT IT REFUSES BY NAME.
 *
 * (decision-maker ruling 2026-09-15, punchlist **D-14**, option A; ledger
 *  `2026-09-15-d14-quantity-is-units`; CLAUDE.md §13, §14, §15, §18 rule 1, §19, Locked
 *  Decision 39; ruling 83 / migration 206)
 *
 * `shared/__tests__/cart-quantity.test.ts` proves the RULES. This file proves the RAILS run them —
 * the half a pure test cannot see, because the defect was never in the arithmetic: a villa added
 * twice came back `quantity: 2` and was priced `rate × 2` by `resolveItemBaseAmount`, and a bundle
 * drew a unit stepper that did the same thing on purpose.
 *
 *   V1  a STAY refuses `quantity: 2` at `POST /api/cart` — 400, `reason: "units_not_asked"`, the
 *       rule named — and NOTHING is added (a refusal is not a one-unit add).
 *   V2  a BUNDLE refuses it identically, and an ARTIFACT/async listing does too. These are the two
 *       shapes that had no protection at all before this lane.
 *   V3  `POST /api/cart/items` — the second live add rail — refuses the same body the same way
 *       (one derivation, one more caller; §18 rule 1).
 *   V4  `PATCH /api/cart/:id` refuses it too, so a line that carted honestly cannot be walked up
 *       to three afterwards.
 *   V5  RE-ADD DOES NOT INCREMENT a units-pinned archetype. Adding the same villa twice is ONE
 *       booking; the dedupe branch's `+ 1` is how D-14 reached a charge.
 *   V11 (Locked Decision 56, ledger `2026-09-25-price-basis`) a PER-BOOKING place service (basis
 *       never stated) records `partySize: 4` and stays ONE unit at the add and PATCH rails, and a
 *       multi-unit body is refused with `rule: "booking"`. On `main` the same add stored quantity 4.
 *   V6  a SEAT-shaped (PER-PERSON) listing: `partySize: 7` DERIVES `quantity = 7` server-side (§14's posture on
 *       the multiplier), and a body-supplied `quantity` alongside it is not consulted.
 *   V7  clearing the seat count (`partySize: null`) returns the line to ONE unit.
 *   V8  the PARTY answer is admitted on an archetype that asks no units — the stated asymmetry: a
 *       party count is never a multiplier, and ruling 83's D7 eligibility input keeps working.
 *   V9  an UNRULED listing (a `video` consult) is byte-for-byte unchanged: `quantity: 3` carts.
 *   V10 CHECKOUT MATH IS UNTOUCHED (§14): a per-night stay's cart total is nights × rate whatever
 *       its stored `quantity` is — asserted against a LEGACY row seeded directly at quantity 3,
 *       which the rails would now refuse but which is exactly what is on disk.
 *
 * THE NEGATIVE: V1–V4 fail against any implementation that clamps instead of refusing (they assert
 * the status AND that no row landed); V5 fails against the pre-lane `+ 1`; V6 fails against one
 * that lets the body's quantity win.
 *
 * NEGATIVE SPACE (§18d): nothing here asserts slot CAPACITY. `storage.bookSlot` used to increment
 * `booked_count` by exactly one per slot-bound line whatever the line held — recorded by this lane
 * and deliberately NOT changed by it, then CLOSED as punchlist V-26 (ledger
 * `2026-09-15-v26-slot-units`), whose own suite owns those proofs.
 *
 * SERVER REQUIRED (JOURNEY_BASE_URL, default :5000) + DISPOSABLE DB ONLY. Every row this file
 * writes is created and deleted by it. No Stripe key is exercised — nothing here checks out.
 *
 * Run solo against a local dev server:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-force-exit \
 *     server/__tests__/cart-quantity-admission.http.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

import { db, pool } from "../db";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

const buyerEmail = `cartqty-${RUN}-buyer@t.test`;
const ids = {
  provider: `cartqty-${RUN}-prov`,
  stay: `cartqty-${RUN}-svc-stay`,
  bundle: `cartqty-${RUN}-svc-bundle`,
  artifact: `cartqty-${RUN}-svc-pdf`,
  seats: `cartqty-${RUN}-svc-seats`,
  booking: `cartqty-${RUN}-svc-booking`,
  unruled: `cartqty-${RUN}-svc-video`,
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
      `[cart-quantity] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not a ` +
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

/** A priced, approved listing carrying exactly the archetype facts under test. */
async function makeService(
  id: string,
  opts: { deliveryMethod: string; productShape?: string | null; pricingUnit?: string | null; price?: string; priceBasis?: string | null },
): Promise<void> {
  await db.execute(sql`
    INSERT INTO provider_services
      (id, user_id, service_name, description, price, status, approval_status,
       delivery_method, product_shape, pricing_unit, price_basis)
    VALUES (${id}, ${ids.provider}, ${`Cart qty ${RUN}`}, 'fixture', ${opts.price ?? "100.00"},
            'active', 'approved', ${opts.deliveryMethod},
            ${opts.productShape ?? null}, ${opts.pricingUnit ?? null}, ${opts.priceBasis ?? null})
  `);
}

async function cartRow(serviceId: string): Promise<{ id: string; quantity: number; party_size: number | null } | null> {
  const r = await db.execute(sql`
    SELECT id, quantity, party_size FROM cart_items
    WHERE user_id = ${buyerId} AND service_id = ${serviceId} LIMIT 1
  `);
  return (r.rows?.[0] as any) ?? null;
}

async function clearBuyerCart(): Promise<void> {
  await db.execute(sql`DELETE FROM cart_items WHERE user_id = ${buyerId}`);
}

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `server must be running on ${BASE_URL}`);
  await assertDisposableDb();

  const reg = await api("/api/auth/register", undefined, "POST", {
    email: buyerEmail,
    password: PASSWORD,
    firstName: "Cart",
    lastName: "Quantity",
  });
  if (reg.status !== 201) {
    assert.fail(`register buyer failed (${reg.status}): ${await reg.text().catch(() => "")}`);
  }
  const setCookie = reg.headers.get("set-cookie");
  assert.ok(setCookie, "register must set a session cookie");
  buyerCookie = setCookie!.split(";")[0];
  buyerId = ((await reg.json()) as any).user.id;

  // WAIT FOR THE SESSION TO BE READABLE, and do it as a PRECONDITION rather than by loosening an
  // assertion. `express-session` persists the row as the response is being written, so a request
  // that follows the register immediately can arrive before the store has it and be answered 401 —
  // reproduced locally at roughly one register in two. Every 401 below would then be a false
  // failure that says nothing about D-14. Bounded, and it fails loudly if the session never lands.
  let sessionReady = false;
  for (let attempt = 0; attempt < 50 && !sessionReady; attempt += 1) {
    const me = await api("/api/auth/user", buyerCookie);
    if (me.status === 200) sessionReady = true;
    else await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(sessionReady, "the registered session never became readable — the server is not usable");

  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.provider}, ${`cartqty-${RUN}-prov@t.test`}, 'Prov', 'Fixture', 'service_provider')`);

  // The §9 archetype rows, in the fields that move this decision.
  await makeService(ids.stay, { deliveryMethod: "in_person", productShape: "property" });
  await makeService(ids.bundle, { deliveryMethod: "in_person", productShape: "bundle" });
  await makeService(ids.artifact, { deliveryMethod: "pdf" });
  // Locked Decision 56: the SEAT row is a listing whose price is PER PERSON; a place service that
  // never stated a basis is ONE booking (V11).
  await makeService(ids.seats, { deliveryMethod: "in_person", priceBasis: "per_person" });
  await makeService(ids.booking, { deliveryMethod: "in_person" });
  await makeService(ids.unruled, { deliveryMethod: "video" });
});

after(async () => {
  try {
    await db.execute(sql`DELETE FROM cart_items WHERE user_id = ${buyerId}`);
    await db.execute(sql`DELETE FROM provider_services WHERE user_id = ${ids.provider}`);
    await db.execute(sql`DELETE FROM users WHERE id = ${ids.provider}`);
    await db.execute(sql`DELETE FROM users WHERE email = ${buyerEmail}`);
  } finally {
    await pool.end();
  }
});

// ── V1 ────────────────────────────────────────────────────────────────────────────────────────
test("V1: a STAY refuses quantity 2 at POST /api/cart, names the rule, and adds nothing", async () => {
  await clearBuyerCart();
  const res = await api("/api/cart", buyerCookie, "POST", { serviceId: ids.stay, quantity: 2 });
  const body = (await res.json()) as any;
  assert.equal(res.status, 400, `expected 400, got ${res.status}: ${JSON.stringify(body)}`);
  assert.equal(body.reason, "units_not_asked");
  assert.equal(body.rule, "stay");
  assert.match(String(body.message), /stay/i, "the refusal names the rule, not just 'invalid'");
  assert.equal(await cartRow(ids.stay), null, "a refusal is NOT a silent one-unit add");
});

// ── V2 ────────────────────────────────────────────────────────────────────────────────────────
test("V2: a BUNDLE and an ARTIFACT refuse it identically — the two shapes with no protection before", async () => {
  await clearBuyerCart();
  for (const [id, rule] of [[ids.bundle, "bundle"], [ids.artifact, "artifact"]] as const) {
    const res = await api("/api/cart", buyerCookie, "POST", { serviceId: id, quantity: 3 });
    const body = (await res.json()) as any;
    assert.equal(res.status, 400, `${rule}: expected 400, got ${res.status}`);
    assert.equal(body.reason, "units_not_asked", rule);
    assert.equal(body.rule, rule);
    assert.equal(await cartRow(id), null, rule);
  }
});

// ── V3 ────────────────────────────────────────────────────────────────────────────────────────
test("V3: POST /api/cart/items — the second live add rail — refuses the same body the same way", async () => {
  await clearBuyerCart();
  const res = await api("/api/cart/items", buyerCookie, "POST", { serviceId: ids.stay, quantity: 2 });
  const body = (await res.json()) as any;
  assert.equal(res.status, 400, `expected 400, got ${res.status}: ${JSON.stringify(body)}`);
  assert.equal(body.reason, "units_not_asked");
  assert.equal(await cartRow(ids.stay), null);
});

// ── V4 ────────────────────────────────────────────────────────────────────────────────────────
test("V4: PATCH /api/cart/:id refuses it too — an honest line cannot be walked up afterwards", async () => {
  await clearBuyerCart();
  const add = await api("/api/cart", buyerCookie, "POST", { serviceId: ids.bundle, quantity: 1 });
  assert.equal(add.status, 201, "one unit of a bundle carts normally");
  const row = await cartRow(ids.bundle);
  assert.ok(row, "the bundle line exists");

  const patch = await api(`/api/cart/${row!.id}`, buyerCookie, "PATCH", { quantity: 4 });
  const body = (await patch.json()) as any;
  assert.equal(patch.status, 400, `expected 400, got ${patch.status}: ${JSON.stringify(body)}`);
  assert.equal(body.reason, "units_not_asked");
  assert.equal((await cartRow(ids.bundle))!.quantity, 1, "and the stored count did not move");
});

// ── V5 ────────────────────────────────────────────────────────────────────────────────────────
test("V5: RE-ADD does not increment a units-pinned archetype — a villa added twice is one booking", async () => {
  await clearBuyerCart();
  for (const attempt of [1, 2, 3]) {
    const res = await api("/api/cart", buyerCookie, "POST", { serviceId: ids.stay, quantity: 1 });
    assert.equal(res.status, 201, `add ${attempt} must succeed`);
  }
  const row = await cartRow(ids.stay);
  assert.ok(row, "one line");
  assert.equal(row!.quantity, 1, "THE NEGATIVE: the pre-lane dedupe branch would report 3 here");
});

// ── V6 ────────────────────────────────────────────────────────────────────────────────────────
test("V6: a SEAT-shaped listing derives quantity from the party, and ignores a body-supplied quantity", async () => {
  await clearBuyerCart();
  const add = await api("/api/cart", buyerCookie, "POST", { serviceId: ids.seats, quantity: 1 });
  assert.equal(add.status, 201);
  const row = await cartRow(ids.seats);
  assert.ok(row);

  const patch = await api(`/api/cart/${row!.id}`, buyerCookie, "PATCH", { quantity: 1, partySize: 7 });
  assert.equal(patch.status, 200, await patch.text().catch(() => ""));
  const after = await cartRow(ids.seats);
  assert.equal(after!.party_size, 7, "the party answer is stored as given");
  assert.equal(after!.quantity, 7, "and the multiplier is DERIVED from it, not read off the body");
});

// ── V7 ────────────────────────────────────────────────────────────────────────────────────────
test("V7: clearing the seat count returns the line to ONE unit", async () => {
  const row = await cartRow(ids.seats);
  assert.ok(row, "V6 left the seat line in place");
  const patch = await api(`/api/cart/${row!.id}`, buyerCookie, "PATCH", { partySize: null });
  assert.equal(patch.status, 200);
  const after = await cartRow(ids.seats);
  assert.equal(after!.party_size, null, "§13: back to 'the traveler never told us'");
  assert.equal(after!.quantity, 1, "and it may not keep billing for seats nobody claimed");
});

// ── V8 ────────────────────────────────────────────────────────────────────────────────────────
test("V8: the PARTY answer is admitted on an archetype that asks no units — the stated asymmetry", async () => {
  await clearBuyerCart();
  const add = await api("/api/cart", buyerCookie, "POST", { serviceId: ids.stay, quantity: 1 });
  assert.equal(add.status, 201);
  const row = await cartRow(ids.stay);
  const patch = await api(`/api/cart/${row!.id}`, buyerCookie, "PATCH", { partySize: 7 });
  assert.equal(patch.status, 200, "ruling 83's D7 eligibility input keeps working on every line");
  const after = await cartRow(ids.stay);
  assert.equal(after!.party_size, 7);
  assert.equal(after!.quantity, 1, "a villa for seven is still ONE villa — the party is not a multiplier");
});

// ── V9 ────────────────────────────────────────────────────────────────────────────────────────
test("V9: an UNRULED listing is byte-for-byte unchanged — the lane states no rule for it (§13)", async () => {
  await clearBuyerCart();
  const res = await api("/api/cart", buyerCookie, "POST", { serviceId: ids.unruled, quantity: 3 });
  assert.equal(res.status, 201, await res.text().catch(() => ""));
  assert.equal((await cartRow(ids.unruled))!.quantity, 3);
});

// ── V11 ───────────────────────────────────────────────────────────────────────────────────────
test("V11 (Locked Decision 56): a per-booking place service records the party and stays ONE unit at every rail", async () => {
  await clearBuyerCart();
  // The add rail: a party of four on a fixed-price, never-stated-basis listing is ONE booking.
  const add = await api("/api/cart", buyerCookie, "POST", { serviceId: ids.booking, partySize: 4 });
  assert.equal(add.status, 201, await add.text().catch(() => ""));
  const row = await cartRow(ids.booking);
  assert.ok(row);
  assert.equal(row!.party_size, 4, "the party answer is still recorded");
  assert.equal(row!.quantity, 1, "and it never multiplies a per-booking price (main stored 4 here)");

  // The PATCH rail: a new party answer moves the party, never the unit count.
  const patch = await api(`/api/cart/${row!.id}`, buyerCookie, "PATCH", { partySize: 6 });
  assert.equal(patch.status, 200, await patch.text().catch(() => ""));
  const after = await cartRow(ids.booking);
  assert.equal(after!.party_size, 6);
  assert.equal(after!.quantity, 1);

  // And a multi-unit body is REFUSED with the rule named, never clamped (§13).
  const refused = await api(`/api/cart/${row!.id}`, buyerCookie, "PATCH", { quantity: 4 });
  assert.equal(refused.status, 400);
  const body = await refused.json();
  assert.equal(body.rule, "booking");
  assert.equal((await cartRow(ids.booking))!.quantity, 1, "nothing moved");
});

// ── V10 ───────────────────────────────────────────────────────────────────────────────────────
test("V10: CHECKOUT MATH UNTOUCHED — a stay is nights × rate whatever its stored quantity is", async () => {
  await clearBuyerCart();
  // A LEGACY multi-unit stay row, seeded directly: the rails refuse this shape now, and rows like
  // it are on disk. Nothing in this lane rewrites them (§13 — a row that was added was added).
  const legacyId = `cartqty-${RUN}-legacy`;
  const checkIn = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const checkOut = new Date(Date.now() + 32 * 86400000).toISOString().slice(0, 10);
  await db.execute(sql`
    INSERT INTO cart_items (id, user_id, service_id, quantity, content_meta)
    VALUES (${legacyId}, ${buyerId}, ${ids.stay}, 3,
            ${JSON.stringify({ checkIn, checkOut })}::jsonb)
  `);
  await db.execute(sql`UPDATE provider_services SET pricing_unit = 'per_night' WHERE id = ${ids.stay}`);

  const cart = (await (await api("/api/cart", buyerCookie)).json()) as any;
  // `itemCount` is the server's own `items.length` — LINES, not units. Asserted so the distinction
  // stays visible: this lane changed neither that count nor the money below it.
  assert.equal(cart.itemCount, 1, "one cart LINE, whatever its stored unit count");
  assert.equal(
    cart.subtotal,
    "200.00",
    "2 nights × 100.00 — the quantity of 3 does not multiply a stay, exactly as before this lane",
  );

  await db.execute(sql`UPDATE provider_services SET pricing_unit = NULL WHERE id = ${ids.stay}`);
  await clearBuyerCart();
});
