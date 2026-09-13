/**
 * A GUEST IS NOT MISSING OPTIMIZATION; A GUEST IS MISSING A PLAN — and a resolved plan was EMPTY.
 *
 * Ledger `2026-09-13-guest-cart-becomes-plan`, executing the ruling recorded by
 * `2026-09-13-guest-optimization-is-a-plan-gap` / punchlist **D-15**.
 *
 * WHY IT EXISTS. `POST /api/cart/resolve-trip` minted a draft trip and backfilled `trip_id` onto
 * the caller's cart rows — and created **ZERO `itinerary_items`**. So a guest who signed in, had
 * their cart migrated, and resolved a trip landed on a plan that held NOTHING. Under LD 41(b) an
 * AI action on an empty plan is the FREE DRAFT, which drafts from scratch: the traveler's chosen
 * items were not merely unoptimized, they were ABSENT from the plan and the AI never saw them.
 * That is the §13 failure — the platform would have shown them a plan that silently was not the
 * one they built.
 *
 * WHAT IS PROVEN, AND THE SHAPE OF THE FIX (LD 39). `cart_items.itinerary_item_id` is the
 * projection-source key: NULL = "not a projection" (a guest add, a direct add-to-cart). This lane
 * gives those rows an item through the ONE projection module
 * (`cart-projection.service.ts` → `materializeCartLinesAsItems`) — never a second projector and
 * never an insert from the route.
 *
 *   G1  THE GAP ITSELF: a guest cart MIGRATED at sign-in and then resolved produces ONE item per
 *       platform cart line, each carrying the LINE's own facts (service, scheduled date, slot) and
 *       `origin = 'traveler'` (LD 12) — and each cart row is now correctly PROJECTED
 *       (`itinerary_item_id` non-NULL). This assertion FAILS on the pre-fix code with 0 items.
 *   G2  BORN `ready_for_checkout`, which is what LD 39 already says a cart line IS — and what
 *       makes `syncItemProjection` reproduce the row rather than DELETE it.
 *   G3  IDEMPOTENT: a second resolve creates NOTHING NEW. Same item count, same item ids.
 *   G4  A PLAN THAT ALREADY HOLDS ITEMS IS NOT DUPLICATED INTO: a pre-existing item on the trip
 *       survives untouched and is not re-created from the cart row that produced it.
 *   G5  AN EXTERNAL-ONLY CART CREATES NO ITEMS AND SAYS SO: external/affiliate descriptors have no
 *       `cart_items` rows at all, so the plan materializes nothing and the response NAMES the
 *       count rather than pretending the plan carries them (§13).
 *   G6  NOTHING IS INVENTED (§13): a line with no `scheduled_date` yields an item with a NULL
 *       `scheduled_date` — day 1 is the NOT-NULL column's unplaced convention, never a claimed
 *       date — and NO party size is fabricated from `quantity` (D-14).
 *   G7  THE ROUND TRIP IS FAITHFUL, WHICH IS THE ADMISSION TEST: running the REAL
 *       `syncItemProjection` over a materialized item reproduces the SAME single cart row — same
 *       id, same service, same slot, same scheduled date. A line the projection could not
 *       reproduce is refused instead, and the reasons are NAMED on the response, not dropped.
 *   G8  A PRICELESS LISTING CANNOT ARRIVE HERE (ledger `2026-09-13-cart-priceless-gap`): the cart
 *       rails refuse it, so the only way onto the table is a direct seed — and such a row is
 *       refused by the materializer through the SAME `hasPublishedPrice` predicate, because the
 *       projection would delete its cart row on the very next sync.
 *   G9  §14 ON THE OWNER: the materializer derives the owner from the TRIP ROW and refuses to file
 *       one person's cart lines onto another person's plan.
 *   G10 STATIC PIN over the file SET (comments stripped): the cart→item materializer is DEFINED
 *       once — in the projection module — and has exactly ONE caller. Its negative space is stated
 *       in the proof itself.
 *
 * SERVER REQUIRED (JOURNEY_BASE_URL, default :5000) + DISPOSABLE DB ONLY. Every row this file
 * writes is created and deleted by it. No Stripe key is exercised — nothing here charges.
 *
 * Run solo against a local dev server:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-force-exit \
 *     server/__tests__/guest-cart-becomes-plan.http.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";

import { db, pool } from "../db";
import * as cartProjection from "../services/cart-projection.service";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

const travelerEmail = `gcart-${RUN}-traveler@t.test`;
const otherEmail = `gcart-${RUN}-other@t.test`;
const ids = {
  provider: `gcart-${RUN}-prov`,
  svcA: `gcart-${RUN}-svc-a`,
  svcB: `gcart-${RUN}-svc-b`,
  svcNull: `gcart-${RUN}-svc-null`,
  slot: `gcart-${RUN}-slot`,
};
let travelerId = "";
let travelerCookie = "";
let otherId = "";
const mintedTripIds = new Set<string>();

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
      `[guest-cart-becomes-plan] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' ` +
        `is not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
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

async function makeService(id: string, price: string | null, name: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, short_description, description, price,
                                   status, approval_status, delivery_method, location)
    VALUES (${id}, ${ids.provider}, ${name}, 'fixture blurb', 'fixture', ${price},
            'active', 'approved', 'in_person', 'Kyoto')
  `);
}

/** Reset the traveler's whole cart + every plan this suite minted, so each proof starts clean. */
async function resetTravelerState(): Promise<void> {
  await db.execute(sql`DELETE FROM cart_items WHERE user_id = ${travelerId}`);
  await db.execute(sql`DELETE FROM cart_items WHERE guest_session_id LIKE ${`gcart-${RUN}%`}`);
  for (const tripId of Array.from(mintedTripIds)) {
    await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${tripId}`);
  }
  await db.execute(sql`DELETE FROM trips WHERE user_id = ${travelerId}`);
  mintedTripIds.clear();
}

/** Seed a GUEST cart row — the NULL-keyed, session-owned shape `POST /api/cart/migrate` adopts. */
async function seedGuestCartRow(
  guestSessionId: string,
  serviceId: string,
  extra: { scheduledDate?: string; slotId?: string; quantity?: number } = {},
): Promise<string> {
  const id = `gcart-${RUN}-cart-${crypto.randomUUID().slice(0, 6)}`;
  await db.execute(sql`
    INSERT INTO cart_items (id, guest_session_id, service_id, quantity, scheduled_date, slot_id)
    VALUES (${id}, ${guestSessionId}, ${serviceId}, ${extra.quantity ?? 1},
            ${extra.scheduledDate ?? null}, ${extra.slotId ?? null})
  `);
  return id;
}

type PlanItemsSummary = {
  created: number;
  skipped?: Array<{ cartItemId: string; reason: string }>;
  externalItemsNotProjected?: number;
};

async function resolveTrip(body: Record<string, unknown> = {}): Promise<{
  status: number;
  tripId?: string;
  created?: boolean;
  planItems?: PlanItemsSummary;
}> {
  const res = await api("/api/cart/resolve-trip", travelerCookie, "POST", body);
  const json = (await res.json().catch(() => ({}))) as any;
  if (json?.tripId) mintedTripIds.add(json.tripId as string);
  return { status: res.status, ...json };
}

async function itemsOn(tripId: string): Promise<any[]> {
  const r = await db.execute(sql`
    SELECT id, title, provider_service_id, scheduled_date, slot_id, day_number, origin,
           routing_status, item_type, location_name, estimated_cost, notes
    FROM itinerary_items WHERE trip_id = ${tripId} ORDER BY title
  `);
  return r.rows as any[];
}

async function cartRows(): Promise<any[]> {
  const r = await db.execute(sql`
    SELECT id, service_id, itinerary_item_id, trip_id, quantity, scheduled_date, slot_id
    FROM cart_items WHERE user_id = ${travelerId} ORDER BY id
  `);
  return r.rows as any[];
}

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `server must be running on ${BASE_URL}`);
  await assertDisposableDb();

  const reg = await api("/api/auth/register", undefined, "POST", {
    email: travelerEmail,
    password: PASSWORD,
    firstName: "Guest",
    lastName: "Cart",
  });
  if (reg.status !== 201) {
    assert.fail(`register traveler failed (${reg.status}): ${await reg.text().catch(() => "")}`);
  }
  const setCookie = reg.headers.get("set-cookie");
  assert.ok(setCookie, "register must set a session cookie");
  travelerCookie = setCookie!.split(";")[0];
  travelerId = ((await reg.json()) as any).user.id;

  otherId = `gcart-${RUN}-other`;
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${otherId}, ${otherEmail}, 'Other', 'Traveler', 'user')`);
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.provider}, ${`gcart-${RUN}-prov@t.test`}, 'Prov', 'Fixture', 'service_provider')`);

  await makeService(ids.svcA, "120.00", `Kyoto tea ceremony ${RUN}`);
  await makeService(ids.svcB, "300.00", `Arashiyama walk ${RUN}`);
  await makeService(ids.svcNull, null, `Custom quote ${RUN}`);

  // A real availability slot so G1 can prove the SLOT rides the line onto the item.
  await db.execute(sql`
    INSERT INTO vendor_availability_slots (id, service_id, provider_id, date, start_time, end_time,
                                           capacity, booked_count, status)
    VALUES (${ids.slot}, ${ids.svcA}, ${ids.provider}, CURRENT_DATE + 40, '10:00', '12:00',
            10, 0, 'available')
  `);
});

after(async () => {
  try {
    await resetTravelerState();
    await db.execute(sql`DELETE FROM trips WHERE user_id = ${otherId}`);
    await db.execute(sql`DELETE FROM vendor_availability_slots WHERE id = ${ids.slot}`);
    await db.execute(
      sql`DELETE FROM provider_services WHERE id IN (${ids.svcA}, ${ids.svcB}, ${ids.svcNull})`,
    );
    await db.execute(sql`DELETE FROM users WHERE id IN (${ids.provider}, ${otherId})`);
    await db.execute(sql`DELETE FROM users WHERE email = ${travelerEmail}`);
  } finally {
    await pool.end();
  }
});

// ── G1 ────────────────────────────────────────────────────────────────────────────────────────
test("G1: a guest cart migrated at sign-in and resolved becomes the plan's items", async () => {
  await resetTravelerState();
  const guestSession = `gcart-${RUN}-sess-1`;
  const dated = new Date(Date.now() + 40 * 86400000).toISOString().split("T")[0];
  await seedGuestCartRow(guestSession, ids.svcA, { scheduledDate: dated, slotId: ids.slot });
  await seedGuestCartRow(guestSession, ids.svcB);

  const migrate = await api("/api/cart/migrate", travelerCookie, "POST", {
    guestSessionId: guestSession,
  });
  assert.equal(migrate.status, 200, "the guest cart must migrate onto the signed-in traveler");

  const before = await cartRows();
  assert.equal(before.length, 2, "two platform lines carried over");
  assert.ok(
    before.every((r) => r.itinerary_item_id === null),
    "a guest add is exactly a NULL-keyed row — that is the state this lane exists to fix",
  );

  const resolved = await resolveTrip({ destination: "Kyoto" });
  assert.equal(resolved.status, 200, "resolve-trip must succeed");
  const tripId = resolved.tripId!;
  assert.ok(tripId, "a plan must be minted");
  assert.equal(resolved.planItems?.created, 2, "one item per platform cart line");

  const items = await itemsOn(tripId);
  assert.equal(items.length, 2, "THE GAP: pre-fix this was 0 and the plan was silently empty");
  assert.deepEqual(
    items.map((i) => i.provider_service_id).sort(),
    [ids.svcA, ids.svcB].sort(),
    "each item names the listing its cart line named",
  );
  for (const item of items) {
    assert.equal(item.origin, "traveler", "LD 12: the TRAVELER chose these — not AI, not expert");
  }

  const withSlot = items.find((i) => i.provider_service_id === ids.svcA)!;
  assert.equal(withSlot.slot_id, ids.slot, "the line's own slot rides onto the item");
  assert.equal(
    withSlot.scheduled_date instanceof Date
      ? withSlot.scheduled_date.toISOString().split("T")[0]
      : String(withSlot.scheduled_date),
    dated,
    "the line's own date rides onto the item",
  );

  const after = await cartRows();
  assert.equal(after.length, 2, "materializing adds NO cart row — the cart is unchanged in size");
  assert.ok(
    after.every((r) => r.itinerary_item_id !== null),
    "every line is now correctly PROJECTED: the projection-source key is set",
  );
  assert.deepEqual(
    after.map((r) => r.itinerary_item_id).sort(),
    items.map((i) => i.id).sort(),
    "each cart row points at the item made from it, and no other",
  );
});

// ── G2 ────────────────────────────────────────────────────────────────────────────────────────
test("G2: items are born ready_for_checkout — which is what LD 39 says a cart line IS", async () => {
  await resetTravelerState();
  const guestSession = `gcart-${RUN}-sess-2`;
  await seedGuestCartRow(guestSession, ids.svcA);
  await api("/api/cart/migrate", travelerCookie, "POST", { guestSessionId: guestSession });

  const resolved = await resolveTrip({ destination: "Kyoto" });
  const items = await itemsOn(resolved.tripId!);
  assert.equal(items.length, 1);
  assert.equal(
    items[0].routing_status,
    "ready_for_checkout",
    "the cart is the ready_for_checkout PROJECTION of this table (LD 39); born in_planning " +
      "instead would make the next sync DELETE the traveler's cart line",
  );
});

// ── G3 ────────────────────────────────────────────────────────────────────────────────────────
test("G3: a second resolve creates nothing new", async () => {
  await resetTravelerState();
  const guestSession = `gcart-${RUN}-sess-3`;
  await seedGuestCartRow(guestSession, ids.svcA);
  await seedGuestCartRow(guestSession, ids.svcB);
  await api("/api/cart/migrate", travelerCookie, "POST", { guestSessionId: guestSession });

  const first = await resolveTrip({ destination: "Kyoto" });
  const firstItems = await itemsOn(first.tripId!);
  assert.equal(first.planItems?.created, 2);

  const second = await resolveTrip({ destination: "Kyoto" });
  assert.equal(second.tripId, first.tripId, "the same plan is reused");
  assert.equal(second.created, false);
  assert.equal(second.planItems?.created, 0, "IDEMPOTENT: a second resolve materializes nothing");

  const secondItems = await itemsOn(first.tripId!);
  assert.deepEqual(
    secondItems.map((i) => i.id).sort(),
    firstItems.map((i) => i.id).sort(),
    "the same item rows, not a second set",
  );
});

// ── G4 ────────────────────────────────────────────────────────────────────────────────────────
test("G4: a plan that already holds items is added to, never duplicated into", async () => {
  await resetTravelerState();
  const guestSession = `gcart-${RUN}-sess-4`;
  await seedGuestCartRow(guestSession, ids.svcA);
  await api("/api/cart/migrate", travelerCookie, "POST", { guestSessionId: guestSession });

  const first = await resolveTrip({ destination: "Kyoto" });
  const tripId = first.tripId!;
  const originalIds = (await itemsOn(tripId)).map((i) => i.id);
  assert.equal(originalIds.length, 1);

  // A SECOND line added to the cart after the plan exists (the ordinary add rail).
  const add = await api("/api/cart", travelerCookie, "POST", { serviceId: ids.svcB, quantity: 1 });
  assert.equal(add.status, 201, `the second add must succeed: ${await add.text().catch(() => "")}`);

  const second = await resolveTrip({ destination: "Kyoto" });
  assert.equal(second.tripId, tripId);
  assert.equal(second.planItems?.created, 1, "only the NEW line becomes an item");

  const items = await itemsOn(tripId);
  assert.equal(items.length, 2, "the pre-existing item survives and is not re-created");
  assert.ok(
    originalIds.every((id) => items.some((i) => i.id === id)),
    "the item that already existed keeps its identity",
  );
});

// ── G5 ────────────────────────────────────────────────────────────────────────────────────────
test("G5: an external-only cart creates no items and is honest about it", async () => {
  await resetTravelerState();
  const resolved = await resolveTrip({
    destination: "Kyoto",
    externalItems: [{ name: "Partner flight", city: "Kyoto" }, { name: "Partner hotel" }],
  });
  assert.equal(resolved.status, 200, "an external-only cart still resolves a plan");
  assert.equal(resolved.planItems?.created, 0, "there are no cart_items rows to materialize");
  assert.equal(
    resolved.planItems?.externalItemsNotProjected,
    2,
    "§13: the response NAMES what the plan does not hold, rather than pretending it does",
  );
  assert.equal((await itemsOn(resolved.tripId!)).length, 0, "and no item was invented");
});

// ── G6 ────────────────────────────────────────────────────────────────────────────────────────
test("G6: nothing is invented — no guessed date, no fabricated party size", async () => {
  await resetTravelerState();
  const guestSession = `gcart-${RUN}-sess-6`;
  await seedGuestCartRow(guestSession, ids.svcA); // deliberately NO scheduledDate, NO slot
  await api("/api/cart/migrate", travelerCookie, "POST", { guestSessionId: guestSession });

  const resolved = await resolveTrip({ destination: "Kyoto" });
  const [item] = await itemsOn(resolved.tripId!);
  assert.equal(item.scheduled_date, null, "the traveler never named a day — so the item names none");
  assert.equal(item.slot_id, null, "no slot was picked — so none is claimed");
  assert.equal(item.day_number, 1, "day 1 is the NOT-NULL column's unplaced convention");
  assert.equal(
    item.estimated_cost,
    null,
    "no price is copied down: the plan reads the listing's own price through the service link",
  );
  assert.equal(item.title, `Kyoto tea ceremony ${RUN}`, "the LISTING's own name, never an invented one");

  // D-14: `quantity` is units of the listing and is NEVER promoted into a party count. No column
  // on `itinerary_items` holds one, and the materializer writes none — there is nothing to read
  // a fabricated party size out of.
  const cols = await db.execute(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'itinerary_items' AND column_name IN ('party_size', 'quantity')
  `);
  assert.equal(cols.rows.length, 0, "D-14 stays undecided here: no party/quantity is written");
});

// ── G7 ────────────────────────────────────────────────────────────────────────────────────────
test("G7: the round trip is faithful, and a line that could not round-trip is NAMED not dropped", async () => {
  await resetTravelerState();
  const guestSession = `gcart-${RUN}-sess-7`;
  const dated = new Date(Date.now() + 40 * 86400000).toISOString().split("T")[0];
  await seedGuestCartRow(guestSession, ids.svcA, { scheduledDate: dated, slotId: ids.slot });
  await api("/api/cart/migrate", travelerCookie, "POST", { guestSessionId: guestSession });

  const resolved = await resolveTrip({ destination: "Kyoto" });
  const [item] = await itemsOn(resolved.tripId!);
  const [rowBefore] = await cartRows();

  // THE ADMISSION TEST, RUN FOR REAL: the projection writer re-derives the cart row from the item.
  const sync = await cartProjection.syncItemProjection(item.id);
  assert.equal(sync.action, "upserted", "the item projects, it does not delete its own cart line");

  const rowsAfter = await cartRows();
  assert.equal(rowsAfter.length, 1, "ONE cart row — a faithful projection never forks the line");
  const rowAfter = rowsAfter[0];
  assert.equal(rowAfter.id, rowBefore.id, "the SAME row, re-derived in place");
  assert.equal(rowAfter.service_id, ids.svcA);
  assert.equal(rowAfter.slot_id, ids.slot);
  assert.equal(rowAfter.itinerary_item_id, item.id);
  assert.equal(
    rowAfter.scheduled_date instanceof Date
      ? rowAfter.scheduled_date.toISOString().split("T")[0]
      : String(rowAfter.scheduled_date).slice(0, 10),
    dated,
  );

  // And the refusals: a multi-unit line (D-14) and a custom-venue line cannot round-trip, so they
  // are NOT materialized — and the reason travels back rather than the line silently vanishing.
  await resetTravelerState();
  const s2 = `gcart-${RUN}-sess-7b`;
  const multi = await seedGuestCartRow(s2, ids.svcA, { quantity: 3 });
  await api("/api/cart/migrate", travelerCookie, "POST", { guestSessionId: s2 });
  const second = await resolveTrip({ destination: "Kyoto" });
  assert.equal(second.planItems?.created, 0, "a 3-unit line is refused, not silently reduced to 1");
  assert.deepEqual(
    second.planItems?.skipped,
    [{ cartItemId: multi, reason: "quantity_gt_one" }],
    "§13: the refusal is NAMED — `resolveItemBaseAmount` prices a line rate × quantity, so " +
      "materializing it would silently change what the traveler is charged",
  );
  const stillThere = await cartRows();
  assert.equal(stillThere.length, 1, "the line is untouched — nothing is deleted on their behalf");
  assert.equal(stillThere[0].quantity, 3, "and its quantity is exactly what they chose");
});

// ── G8 ────────────────────────────────────────────────────────────────────────────────────────
test("G8: a priceless listing cannot arrive through the rails, and is refused if seeded anyway", async () => {
  await resetTravelerState();

  // The cart rails already refuse it (ledger `2026-09-13-cart-priceless-gap`) — confirmed here, so
  // "it cannot arrive" is asserted rather than assumed.
  const add = await api("/api/cart", travelerCookie, "POST", { serviceId: ids.svcNull, quantity: 1 });
  assert.equal(add.status, 400, "the add rail refuses a listing with no published price");
  assert.equal(((await add.json()) as any).reason, "no_published_price");

  // The only remaining way onto the table is a direct seed (a pre-fix row, or a seller who
  // unpublished a price after an add). The materializer refuses it too, through the SAME predicate
  // the projection writer consults — otherwise the very next sync would delete its cart row.
  const s = `gcart-${RUN}-sess-8`;
  const seeded = await seedGuestCartRow(s, ids.svcNull);
  await api("/api/cart/migrate", travelerCookie, "POST", { guestSessionId: s });
  const resolved = await resolveTrip({ destination: "Kyoto" });
  assert.equal(resolved.planItems?.created, 0);
  assert.deepEqual(resolved.planItems?.skipped, [
    { cartItemId: seeded, reason: "no_published_price" },
  ]);
  assert.equal((await itemsOn(resolved.tripId!)).length, 0);
});

// ── G9 ────────────────────────────────────────────────────────────────────────────────────────
test("G9: §14 — the owner comes from the trip row, and another person's plan is refused", async () => {
  await resetTravelerState();
  const s = `gcart-${RUN}-sess-9`;
  await seedGuestCartRow(s, ids.svcA);
  await api("/api/cart/migrate", travelerCookie, "POST", { guestSessionId: s });

  const foreignTripId = `gcart-${RUN}-foreign-trip`;
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${foreignTripId}, ${otherId}, 'Someone else''s plan', 'Kyoto',
            CURRENT_DATE + 30, CURRENT_DATE + 35)
  `);
  await db.execute(
    sql`UPDATE cart_items SET trip_id = ${foreignTripId} WHERE user_id = ${travelerId}`,
  );

  const result = await cartProjection.materializeCartLinesAsItems(travelerId, foreignTripId);
  assert.equal(result.created, 0, "one person's cart lines are never filed onto another's plan");
  const r = await db.execute(
    sql`SELECT count(*)::int AS n FROM itinerary_items WHERE trip_id = ${foreignTripId}`,
  );
  assert.equal((r.rows[0] as any).n, 0, "and nothing was written");

  await db.execute(sql`DELETE FROM trips WHERE id = ${foreignTripId}`);
});

// ── G10 ───────────────────────────────────────────────────────────────────────────────────────
test("G10: static pin — the cart→item materializer is defined ONCE and has ONE caller", () => {
  const root = path.join(process.cwd(), "server");
  const stripComments = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  // THE FILE SET, never a call-site count: every non-test `.ts` under `server/`.
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "__tests__") continue;
        walk(full);
      } else if (entry.name.endsWith(".ts")) {
        files.push(full);
      }
    }
  };
  walk(root);

  const stripped = new Map(files.map((f) => [f, stripComments(fs.readFileSync(f, "utf8"))]));
  const rel = (f: string) => path.relative(root, f).split(path.sep).join("/");

  const definers = files.filter((f) =>
    /export\s+async\s+function\s+materializeCartLinesAsItems/.test(stripped.get(f)!),
  );
  assert.deepEqual(
    definers.map(rel),
    ["services/cart-projection.service.ts"],
    "LD 39: the ONE projection module owns the cart↔item relationship. A second definition of " +
      "this operation is the derivation-drift class §18 rule 1 names.",
  );

  const mentions = files.filter((f) => /materializeCartLinesAsItems/.test(stripped.get(f)!));
  assert.deepEqual(
    mentions.map(rel).sort(),
    ["routes.ts", "services/cart-projection.service.ts"],
    "ONE definition and ONE caller — the resolve-trip route. A second caller is not forbidden on " +
      "principle, but it is a decision, and this pin makes it a visible one.",
  );

  // STATED NEGATIVE SPACE, and it is the load-bearing half. This pin proves the MATERIALIZER is
  // not forked and is called from one place. It does NOT, and cannot, prove that no other rail
  // ever inserts an `itinerary_items` row: `/api/cart/convert-to-itinerary` legitimately makes an
  // item out of a cart line too — but it MOVES the row (it deletes the cart line rather than
  // projecting it), which is a different operation, not a second copy of this one — and every
  // AI / expert / ready-made rail inserts items of its own. A grep over `insert(itineraryItems)`
  // would flag all of those and prove nothing.
  assert.ok(
    /removeFromCart\(cartItemId\)/.test(stripped.get(path.join(root, "routes.ts"))!),
    "the convert-to-itinerary rail still MOVES its row, which is why it is not this one",
  );
});
