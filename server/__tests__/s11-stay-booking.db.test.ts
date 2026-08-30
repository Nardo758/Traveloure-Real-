/**
 * S11 STAY BOOKING — behavioural proof (DECISIONS.md ledger row 107, docs/briefs/
 * S11_STAY_BOOKING_PROPOSAL.md, ratified as recommended, decision-maker Aug 13, 2026).
 *
 * HEADLINE: the §15 claim/promote/void mechanics for a multi-night stay ALREADY EXIST and are
 * LIVE in POST /api/checkout (the ratified PROPERTY rung) — this suite proves the genuinely NEW
 * S11 surface (migration 213's provenance column, the date-range materializer, the shared
 * `resolveStayNightlyRates` resolver, the redacted calendar endpoint, price-edit propagation) and
 * proves it INTEGRATES correctly with the existing, unchanged claim machine — it does not
 * re-prove §15/§15b/§15c/§17 themselves (those are re-run as regressions: checkout-claim-sweep,
 * checkout-payment-promotion, stay-release-all-nights — see the lane report for exact counts).
 *
 * WHY NO LIVE STRIPE CALL: this sandbox has no outbound network reach to api.stripe.com (proven
 * during this lane — a direct HTTPS probe timed out), so a full POST /api/checkout HTTP round
 * trip cannot reach the Stripe leg. The §14 guarantee under test — "the amount quoted and the
 * amount charged can never disagree" — is proven the same way the codebase already proves it for
 * B1 travel surcharges and the 1C direct-rate lane: by showing the CHARGE loop
 * (payments.routes.ts) and every QUOTE surface (GET /api/cart, GET /api/cart/fee-preview) call
 * the SAME EXPORTED function (`resolveItemBaseAmount`/`resolveStayNightlyRates`) with the SAME
 * map — verified here both by direct unit call AND by a live HTTP GET /api/cart integration proof
 * (no Stripe on the read path), which is the strongest end-to-end proof available in this
 * environment. See the lane report for the source-citation of the shared call sites.
 *
 * NEGATIVES FIRST, per house convention:
 *   N1  quote/charge disagree impossible — resolveStayNightlyRates' own output, independently
 *       recomputed, matches EXACTLY what the live GET /api/cart route returns for the identical
 *       mixed-rate stay (the SAME function both surfaces call).
 *   N2  a crafted req.body field (price/amount/nightlyRate injected on the POST /api/cart body)
 *       never reaches the quoted total — GET /api/cart still reflects the SERVER-DERIVED
 *       materialized rate, not the injected value (§14).
 *   N3  double-claim on the same materialized night is refused — the SAME atomic
 *       `storage.bookSlot` conditional that already guards double-checkout (§15) governs an
 *       S11-materialized row identically to a manually-created or pattern-materialized one.
 *   N4  (not re-implemented here — see the lane report) void of a multi-night stay returns every
 *       night: re-run via `stay-release-all-nights.db.test.ts` as a regression, still green.
 *   N5  a blackout blocks a night from EVER being published — the exact date the checkout claim
 *       loop's own query (`SELECT id FROM vendor_availability_slots WHERE service_id=… AND date
 *       IN (…)`) would find zero rows for, causing an honest 409 `nights_unavailable`.
 *   N6  a non-stay cart item is completely unaffected by the stay-rate machinery — byte-identical
 *       pre-S11 price × quantity, and resolveStayNightlyRates does zero work for an all-non-stay
 *       cart.
 *
 * POSITIVES:
 *   P1  materialize → redacted calendar → quote → claim = nights × EACH NIGHT'S OWN rate,
 *       INCLUDING a mixed-rate stay spanning two service_date_ranges (3 nights @120 + 3 @150).
 *       Also proves: sentinel start_time='00:00' (never NULL), materialized_from='date_range',
 *       the calendar endpoint never leaks bookedCount/capacity/providerId.
 *   P2  a price-edit on date-ranges propagates to UNBOOKED materialized nights only — a booked
 *       night's snapshotted rate survives untouched (§18b posture).
 *   P3  re-materializing the same date-ranges twice creates zero duplicate slot rows (ADD-ONLY /
 *       ON CONFLICT DO NOTHING against the migration-210 index).
 *
 * Runs against the ALREADY-RUNNING dev server (JOURNEY_BASE_URL, default http://127.0.0.1:5000).
 * DISPOSABLE DB ONLY — every row created here is cleaned up in after().
 * Serialize: npx tsx --test --test-concurrency=1 server/__tests__/s11-stay-booking.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { resolveStayNightlyRates, resolveItemBaseAmount } from "../routes/payments.routes";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

const createdEmails: string[] = [];
const createdServiceIds: string[] = [];

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch { /* local socket ⇒ disposable */ }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) throw new Error(`[s11-stay-booking] REFUSING to write: '${host ?? "<none>"}' is not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`);
}

function api(pathname: string, cookie: string | undefined, method = "GET", body?: unknown) {
  return fetch(`${BASE_URL}${pathname}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
async function readOnce(res: Response): Promise<{ status: number; body: any; text: string }> {
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { status: res.status, body, text };
}

interface Actor { id: string; email: string; cookie: string; }
async function registerActor(label: string, role?: string): Promise<Actor> {
  const email = `s11-${RUN}-${label}@t.test`;
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, firstName: "S11", lastName: label }),
  });
  if (res.status !== 201) assert.fail(`register(${label}) failed (${res.status}): ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie, "register must set a session cookie");
  const body = (await res.json()) as any;
  createdEmails.push(email);
  if (role) await db.execute(sql`UPDATE users SET role = ${role} WHERE id = ${body.user.id}`);
  return { id: body.user.id, email, cookie: setCookie!.split(";")[0] };
}

/** A minimal property_room fixture, inserted directly (travel-surcharge.db.test.ts precedent) —
 *  the owner-gated date-ranges write rail only checks userId + productShape, not approval/status,
 *  but GET /api/cart and the public stay-availability read DO gate on approved+active, so this
 *  fixture is born that way. */
async function seedRoom(ownerId: string, label: string, price = "100.00"): Promise<string> {
  const id = `s11-${RUN}-${label}-${crypto.randomUUID().slice(0, 6)}`;
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, price, status, approval_status, delivery_method, product_shape, pricing_unit)
    VALUES (${id}, ${ownerId}, ${`S11 room ${label}`}, ${price}, 'active', 'approved', 'in_person', 'property_room', 'per_night')
  `);
  createdServiceIds.push(id);
  return id;
}

function dateAtOffset(days: number): string {
  const today = new Date();
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function slotsForService(serviceId: string): Promise<any[]> {
  const r = await db.execute(sql`SELECT * FROM vendor_availability_slots WHERE service_id = ${serviceId} ORDER BY date`);
  return r.rows as any[];
}

/** The shared `traveler` actor's cart must be empty before a test asserts an exact subtotal, so
 *  a prior test's cart line (even a cleaned-up one) can never leak in — order-independent. */
async function clearTravelerCart(travelerId: string): Promise<void> {
  await db.execute(sql`DELETE FROM cart_items WHERE user_id = ${travelerId}`);
}

let provider: Actor;
let traveler: Actor;

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `dev server must be running on ${BASE_URL}`);
  await assertDisposableDb();
  provider = await registerActor("owner", "service_provider");
  traveler = await registerActor("traveler");
});

after(async () => {
  try {
    await assertDisposableDb();
    for (const id of createdServiceIds) {
      await db.execute(sql`DELETE FROM cart_items WHERE service_id = ${id}`).catch(() => {});
      await db.execute(sql`DELETE FROM vendor_availability_slots WHERE service_id = ${id}`).catch(() => {});
      await db.execute(sql`DELETE FROM service_date_ranges WHERE service_id = ${id}`).catch(() => {});
      await db.execute(sql`DELETE FROM service_availability_blackouts WHERE service_id = ${id}`).catch(() => {});
      await db.execute(sql`DELETE FROM provider_services WHERE id = ${id}`).catch(() => {});
    }
    for (const email of createdEmails) {
      await db.execute(sql`DELETE FROM users WHERE email = ${email}`).catch(() => {});
    }
  } finally { /* shared pool — leave open */ }
});

// ═════════════════════════════════════ NEGATIVES FIRST ═════════════════════════════════════════

test("N3: double-claim on the same S11-materialized night is refused (§15 atomicity unchanged)", async () => {
  const room = await seedRoom(provider.id, "n3");
  const start = dateAtOffset(40);
  const end = dateAtOffset(41); // 2-night range, inclusive
  const res = await readOnce(await api(`/api/provider/services/${room}/date-ranges`, provider.cookie, "PUT", {
    ranges: [{ startDate: start, endDate: end, nightlyPrice: 100, capacity: 1 }],
  }));
  assert.equal(res.status, 200, res.text);
  const slots = await slotsForService(room);
  assert.equal(slots.length, 2, "2-night range materializes exactly 2 slots");

  const firstClaim = await storage.bookSlot(slots[0].id);
  assert.ok(firstClaim, "first claim on a fresh materialized night must succeed");
  const secondClaim = await storage.bookSlot(slots[0].id);
  assert.equal(secondClaim, undefined, "a second claim on the SAME night (capacity 1) must be refused — the atomic conditional still governs a date-range-materialized row");

  await storage.releaseSlot(slots[0].id);
});

test("N5: a blacked-out night is NEVER materialized — the exact predicate the checkout claim loop uses finds zero rows for it", async () => {
  const room = await seedRoom(provider.id, "n5");
  const start = dateAtOffset(50);
  const blackoutDate = dateAtOffset(51);
  const end = dateAtOffset(53);

  // Blackout FIRST — S7-Q3/S11: a blackout blocks FUTURE materialization only, so it must be on
  // the row before the date-range save that would otherwise publish that night.
  const blackoutRes = await readOnce(await api(`/api/provider/services/${room}/blackouts`, provider.cookie, "PUT", {
    blackouts: [{ startDate: blackoutDate, endDate: blackoutDate, reason: "S11 proof" }],
  }));
  assert.equal(blackoutRes.status, 200, blackoutRes.text);

  const rangeRes = await readOnce(await api(`/api/provider/services/${room}/date-ranges`, provider.cookie, "PUT", {
    ranges: [{ startDate: start, endDate: end, nightlyPrice: 90, capacity: 1 }],
  }));
  assert.equal(rangeRes.status, 200, rangeRes.text);
  assert.equal(rangeRes.body.materialized.created, 3, "4-night range minus 1 blacked-out night = 3 materialized slots");

  const allNights = [dateAtOffset(50), dateAtOffset(51), dateAtOffset(52), dateAtOffset(53)];
  // The EXACT query shape payments.routes.ts's C3 claim loop runs (:993-996) before claiming a
  // stay's nights — a night with no row here is what makes checkout 409 nights_unavailable.
  const found = await db.execute(sql`
    SELECT date FROM vendor_availability_slots
    WHERE service_id = ${room} AND date IN (${sql.join(allNights.map((d) => sql`${d}::date`), sql`, `)})
  `);
  const foundDates = (found.rows as any[]).map((r) => (r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date)));
  assert.equal(foundDates.length, 3, "only 3 of the 4 requested nights have a row");
  assert.ok(!foundDates.includes(blackoutDate), "the blacked-out night is honestly absent, never a guessed/fabricated slot (§13)");
});

test("N6: a non-stay cart item is unaffected by the stay-rate machinery", async () => {
  const nonStayItem = {
    id: "n6-item",
    serviceId: "n6-svc",
    service: { pricingUnit: "call", price: "50.00" },
    quantity: 3,
  };
  // A non-empty stayRates map (as if a sibling cart line WAS a stay) must not leak into this item.
  const foreignStayRates = new Map([["some-other-item", { perNight: [999], total: 999 }]]);
  assert.equal(resolveItemBaseAmount(nonStayItem, foreignStayRates), 150, "price × quantity, byte-identical to pre-S11 — the stay map is irrelevant to a non-stay item");

  const empty = await resolveStayNightlyRates([nonStayItem]);
  assert.equal(empty.size, 0, "resolveStayNightlyRates does zero work (and issues zero DB queries — see its own early-return) for an all-non-stay cart");
});

test("N2: a crafted req.body field never reaches the quoted total (§14)", async () => {
  const room = await seedRoom(provider.id, "n2");
  const start = dateAtOffset(60);
  const end = dateAtOffset(61); // 2 nights
  const rangeRes = await readOnce(await api(`/api/provider/services/${room}/date-ranges`, provider.cookie, "PUT", {
    ranges: [{ startDate: start, endDate: end, nightlyPrice: 130, capacity: 2 }],
  }));
  assert.equal(rangeRes.status, 200, rangeRes.text);

  const checkOutExclusive = dateAtOffset(62); // cart carrier is exclusive-checkout — 2 nights: 60,61
  await clearTravelerCart(traveler.id);
  // Inject amount/price/nightlyRate fields the POST /api/cart body schema never reads (§14 —
  // it destructures only serviceId/checkIn/checkOut/etc, never price/amount) — a crafted request.
  const addRes = await readOnce(await api("/api/cart", traveler.cookie, "POST", {
    serviceId: room,
    checkIn: start,
    checkOut: checkOutExclusive,
    price: 1,
    amount: 1,
    nightlyRate: 1,
  }));
  assert.equal(addRes.status, 201, addRes.text);

  const cartRes = await readOnce(await api("/api/cart", traveler.cookie));
  assert.equal(cartRes.status, 200, cartRes.text);
  assert.equal(cartRes.body.subtotal, "260.00", `expected 2 nights × $130 = $260.00 from the SERVER-DERIVED rate, got ${cartRes.body.subtotal} — a crafted body field must never win`);

  // Cleanup this test's cart row — the shared `traveler` actor's cart must be empty for the next
  // test's own subtotal assertion.
  await db.execute(sql`DELETE FROM cart_items WHERE service_id = ${room}`);
});

// ═════════════════════════════════════════ POSITIVES ═══════════════════════════════════════════

test("P1/N1: materialize → redacted calendar → quote → claim, nights × EACH NIGHT'S OWN rate, mixed-rate stay across two ranges", async () => {
  const room = await seedRoom(provider.id, "p1", "999.00"); // deliberately far from any real rate — a fallback leak would be obvious
  const rangeAStart = dateAtOffset(10);
  const rangeAEnd = dateAtOffset(12);   // 3 nights @ 120
  const rangeBStart = dateAtOffset(13);
  const rangeBEnd = dateAtOffset(15);   // 3 nights @ 150

  const rangeRes = await readOnce(await api(`/api/provider/services/${room}/date-ranges`, provider.cookie, "PUT", {
    ranges: [
      { startDate: rangeAStart, endDate: rangeAEnd, nightlyPrice: 120, capacity: 1 },
      { startDate: rangeBStart, endDate: rangeBEnd, nightlyPrice: 150, capacity: 1 },
    ],
  }));
  assert.equal(rangeRes.status, 200, rangeRes.text);
  assert.equal(rangeRes.body.materialized.created, 6, "two 3-night ranges materialize exactly 6 nights");
  assert.equal(rangeRes.body.repriced.repriced, 6, "the fresh reprice pass touches all 6 just-inserted, still-unbooked rows");

  // Provenance + sentinel (migration 213 / S11-Q2).
  const slots = await slotsForService(room);
  assert.equal(slots.length, 6);
  for (const row of slots) {
    assert.equal(row.start_time, "00:00", "date-range-materialized nights carry the sentinel, NEVER NULL");
    assert.equal(row.materialized_from, "date_range");
    assert.equal(row.capacity, 1);
  }

  // Redacted public calendar — never bookedCount/capacity/providerId/id.
  const calRes = await readOnce(await api(`/api/services/${room}/stay-availability?checkIn=${rangeAStart}&checkOut=${rangeBEnd}`, undefined));
  assert.equal(calRes.status, 200, calRes.text);
  assert.equal(calRes.body.nights.length, 6);
  for (const n of calRes.body.nights) {
    assert.deepEqual(Object.keys(n).sort(), ["available", "date", "nightlyRate"], "the calendar entry carries ONLY date/available/nightlyRate — no bookedCount/capacity/providerId/id");
  }
  const rates = calRes.body.nights.map((n: any) => n.nightlyRate);
  assert.deepEqual(rates, [120, 120, 120, 150, 150, 150]);
  assert.ok(calRes.body.nights.every((n: any) => n.available === true));

  // Direct resolver call — the SAME function the charge loop calls (cart carrier is
  // exclusive-checkout: [checkIn, checkOut) — 6 nights from rangeAStart to one past rangeBEnd).
  const checkOutExclusive = dateAtOffset(16);
  const cartItem = {
    id: "p1-item",
    serviceId: room,
    service: { pricingUnit: "per_night", price: "999.00" },
    contentMeta: { checkIn: rangeAStart, checkOut: checkOutExclusive },
  };
  const resolved = await resolveStayNightlyRates([cartItem]);
  const entry = resolved.get("p1-item");
  assert.ok(entry, "resolver must resolve the stay item");
  assert.deepEqual(entry!.perNight, [120, 120, 120, 150, 150, 150]);
  assert.equal(entry!.total, 810, "3×120 + 3×150 = 810 — NOT flat 999×6=5994, proving nights_×_flat_price is dead");
  assert.equal(resolveItemBaseAmount(cartItem, resolved), 810);

  // Live HTTP quote — N1: proves GET /api/cart (a DIFFERENT code path than the direct call above)
  // reaches byte-identically the same total, because it calls the SAME exported function.
  await clearTravelerCart(traveler.id);
  const addRes = await readOnce(await api("/api/cart", traveler.cookie, "POST", {
    serviceId: room,
    checkIn: rangeAStart,
    checkOut: checkOutExclusive,
  }));
  assert.equal(addRes.status, 201, addRes.text);
  const cartRes = await readOnce(await api("/api/cart", traveler.cookie));
  assert.equal(cartRes.status, 200, cartRes.text);
  assert.equal(cartRes.body.subtotal, "810.00", "GET /api/cart's quote matches the direct resolver call exactly — quote and charge share one function, so they cannot disagree");

  // Claim mechanism — proves an S11-materialized row participates in the EXISTING, unchanged §15
  // atomic claim exactly like a manual/pattern-materialized row (mirrors availability-model.db
  // .test.ts's own P-CLAIM).
  for (const row of slots) {
    const claimed = await storage.bookSlot(row.id);
    assert.ok(claimed, `night ${row.date} must be claimable`);
  }
  for (const row of slots) {
    await storage.releaseSlot(row.id);
  }

  // Cleanup this test's cart row so it doesn't leak into other tests' subtotal assertions.
  await db.execute(sql`DELETE FROM cart_items WHERE service_id = ${room}`);
});

test("P2: a price-edit propagates to UNBOOKED materialized nights only — a booked night's rate survives untouched", async () => {
  const room = await seedRoom(provider.id, "p2");
  const start = dateAtOffset(20);
  const end = dateAtOffset(22); // 3 nights: 20, 21, 22

  const first = await readOnce(await api(`/api/provider/services/${room}/date-ranges`, provider.cookie, "PUT", {
    ranges: [{ startDate: start, endDate: end, nightlyPrice: 100, capacity: 1 }],
  }));
  assert.equal(first.status, 200, first.text);

  const slots = await slotsForService(room);
  assert.equal(slots.length, 3);
  const middleNight = slots.find((s) => (s.date instanceof Date ? s.date.toISOString().slice(0, 10) : String(s.date)) === dateAtOffset(21));
  assert.ok(middleNight, "middle night must exist");

  // Book the middle night — simulating a real stay claim on it — BEFORE the price edit.
  const claimed = await storage.bookSlot(middleNight.id);
  assert.ok(claimed, "middle night must be claimable before the edit");

  const second = await readOnce(await api(`/api/provider/services/${room}/date-ranges`, provider.cookie, "PUT", {
    ranges: [{ startDate: start, endDate: end, nightlyPrice: 200, capacity: 1 }],
  }));
  assert.equal(second.status, 200, second.text);
  assert.equal(second.body.materialized.created, 0, "all 3 nights already exist — ON CONFLICT DO NOTHING, zero NEW rows");
  assert.equal(second.body.repriced.repriced, 2, "only the 2 STILL-UNBOOKED nights are repriced — the booked middle night is excluded");

  const after = await slotsForService(room);
  const byDate = new Map(after.map((r) => [(r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date)), r]));
  assert.equal(byDate.get(dateAtOffset(20))!.pricing.nightlyRate, 200, "unbooked night repriced to the new rate");
  assert.equal(byDate.get(dateAtOffset(22))!.pricing.nightlyRate, 200, "unbooked night repriced to the new rate");
  assert.equal(byDate.get(dateAtOffset(21))!.pricing.nightlyRate, 100, "the BOOKED night's rate survives untouched — §18b posture: booked inventory is never silently altered");

  await storage.releaseSlot(middleNight.id);
});

test("P3: re-materializing the same date-ranges twice creates zero duplicate slot rows", async () => {
  const room = await seedRoom(provider.id, "p3");
  const start = dateAtOffset(70);
  const end = dateAtOffset(72);
  const ranges = { ranges: [{ startDate: start, endDate: end, nightlyPrice: 80, capacity: 1 }] };

  const first = await readOnce(await api(`/api/provider/services/${room}/date-ranges`, provider.cookie, "PUT", ranges));
  assert.equal(first.status, 200, first.text);
  assert.equal(first.body.materialized.created, 3);

  const second = await readOnce(await api(`/api/provider/services/${room}/date-ranges`, provider.cookie, "PUT", ranges));
  assert.equal(second.status, 200, second.text);
  assert.equal(second.body.materialized.created, 0, "the second save materializes zero NEW rows (ON CONFLICT DO NOTHING)");

  const slots = await slotsForService(room);
  assert.equal(slots.length, 3, "no duplicate rows after materializing twice");

  const dupes = await db.execute(sql`
    SELECT date, start_time, count(*)::int AS n FROM vendor_availability_slots
    WHERE service_id = ${room} GROUP BY date, start_time HAVING count(*) > 1
  `);
  assert.equal((dupes.rows as any[]).length, 0, "zero duplicate (service_id, date, start_time) groups");
});

test("N-CAP: a date range exceeding the 730-night cap is REJECTED (400), never silently truncated (§13)", async () => {
  const room = await seedRoom(provider.id, "ncap");
  const start = dateAtOffset(100);
  const tooFarEnd = dateAtOffset(100 + 731); // 732 nights inclusive, one over the cap
  const res = await readOnce(await api(`/api/provider/services/${room}/date-ranges`, provider.cookie, "PUT", {
    ranges: [{ startDate: start, endDate: tooFarEnd, nightlyPrice: 100, capacity: 1 }],
  }));
  assert.equal(res.status, 400, `expected 400 for an oversized range, got ${res.status}: ${res.text}`);
  const slots = await slotsForService(room);
  assert.equal(slots.length, 0, "an oversized range is refused before any materialization — nothing is silently truncated and saved");
});
