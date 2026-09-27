/**
 * LOCKED DECISION 56 — A LISTING SAYS WHETHER ITS PRICE IS PER PERSON OR PER BOOKING
 * (ledger `2026-09-25-price-basis`; migration 325; decision-maker, Sep 25, 2026: "go with all your
 * recommendations").
 *
 * THE DEFECT, REPRODUCED ON `main` BEFORE THE FIX. D-14's archetype rule gave every `in_person` /
 * `hybrid` listing the SEAT rule (units = party size) and checkout prices a line `rate × units`
 * (`resolveItemBaseAmount`). A $300 fixed-price photographer, added to the cart for a party of four
 * through the real admission (`resolveCartLineCounts`) and the real cart writer (`storage.addToCart`),
 * read back through the real cart reader (`storage.getCartItems`) with `resolveItemUnitCount` = 4 and
 * `resolveItemBaseAmount` = 1200. P1 below is that exact path; it failed on `main` (4 / 1200).
 *
 * WHAT THIS FILE PROVES
 *   P1  NULL basis, in_person, party 4 ⇒ ONE unit, amount = price, party recorded (the repro)
 *   P2  explicit `per_booking` ⇒ the same; `hybrid` ⇒ the same
 *   P3  `per_person`, party 4 ⇒ FOUR units, amount = 4 × price (the seat rule, preserved)
 *   P4  a legacy line admitted under the old seat rule (quantity 4) on a per-booking listing is
 *       charged ONE unit — the charge follows the listing, never a stale seat count
 *   P5  unchanged rules: a per-day async listing still multiplies by days (LD 54 c); an unruled
 *       video line keeps its count; a per-night stay is still nights × rate
 *   P6  the listing write refuses an invalid basis at BOTH layers — the pick-based admission (400
 *       shape) and the storage writer (throws) — and round-trips a valid one
 *   P7  static pins: both `/api/provider/services` rails run the ONE admission, and the generic
 *       insert schema never carries the column (§19)
 *
 * STATED NEGATIVE SPACE (§18d). These proofs exercise the admission, the cart writer/reader and the
 * money path's pure amount/unit functions against a real database. They do not boot the HTTP
 * checkout (no Stripe), so the slot CLAIM is proven only by the static V-26 pin in slot-units S7
 * (the claim reads the same `resolveItemUnitCount`, which P1/P4 prove returns 1 here). `price_type
 * = 'hourly'` is out of scope and deliberately untested beyond "it is not re-priced here".
 *
 * DISPOSABLE DB ONLY; no Stripe; every row written here is deleted in after().
 * Run solo: npx tsx --test --test-force-exit server/__tests__/price-basis.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { archetypeAsks, resolveCartLineCounts, PINNED_UNIT_QUANTITY } from "../../shared/cart-quantity";
import { insertProviderServiceSchema } from "../../shared/schema";
import { resolveItemBaseAmount, resolveItemUnitCount } from "../routes/payments.routes";
import { admitPriceBasis } from "../services/price-basis.service";

const RUN = crypto.randomUUID().slice(0, 8);
const PROVIDER = `pb-${RUN}-prov`;
const TRAVELER = `pb-${RUN}-trav`;
const createdServiceIds: string[] = [];
const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

// ── Disposable-DB guard (the slot-units.db.test.ts shape; never defaults open) ────────────────────
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  if (host === null || !DISPOSABLE_HOSTS.has(host)) {
    throw new Error(
      `[price-basis] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not a ` +
        `recognized disposable database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

async function seedListing(opts: {
  price: string;
  deliveryMethod: string;
  priceBasis?: string | null;
  pricingUnit?: string | null;
}): Promise<string> {
  const id = `pb-${RUN}-svc-${crypto.randomUUID().slice(0, 6)}`;
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, price, status, approval_status,
                                   delivery_method, price_basis, pricing_unit)
    VALUES (${id}, ${PROVIDER}, ${`PB listing ${id}`}, ${opts.price}, 'active', 'approved',
            ${opts.deliveryMethod}, ${opts.priceBasis ?? null}, ${opts.pricingUnit ?? null})
  `);
  createdServiceIds.push(id);
  return id;
}

async function clearCart(): Promise<void> {
  await db.execute(sql`DELETE FROM cart_items WHERE user_id = ${TRAVELER}`);
}

/**
 * The SUPPORTED add path, end to end below the HTTP layer: the listing row is read from the DB, the
 * ONE admission decides the counts, the cart writer stores them with the same `unitsPinnedToOne`
 * the two add rails pass, and the cart READER (the checkout's own `storage.getCartItems`) returns
 * the enriched line the money path prices.
 */
async function addAndRead(serviceId: string, input: { partySize?: number; quantity?: number }) {
  await clearCart();
  const service = await storage.getProviderServiceById(serviceId);
  assert.ok(service, "fixture listing exists");
  const counts = resolveCartLineCounts(service as any, input);
  assert.equal(counts.ok, true, `admission accepts ${JSON.stringify(input)}`);
  if (!counts.ok) throw new Error("unreachable");
  await storage.addToCart(TRAVELER, {
    serviceId,
    quantity: counts.quantity ?? PINNED_UNIT_QUANTITY,
    ...(input.partySize !== undefined ? { partySize: counts.partySize ?? null } : {}),
    unitsPinnedToOne: !archetypeAsks(service as any).asksUnits,
  });
  const lines = await storage.getCartItems(TRAVELER);
  assert.equal(lines.length, 1, "exactly one cart line");
  return lines[0];
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${PROVIDER}, ${`${PROVIDER}@t.test`}, 'PB', 'Provider', 'service_provider')
  `);
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${TRAVELER}, ${`${TRAVELER}@t.test`}, 'PB', 'Traveler')
  `);
});

after(async () => {
  try {
    await clearCart();
    for (const id of createdServiceIds) {
      await db.execute(sql`DELETE FROM cart_items WHERE service_id = ${id}`).catch(() => {});
      await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${id}`).catch(() => {});
      await db.execute(sql`DELETE FROM provider_services WHERE id = ${id}`).catch(() => {});
    }
    await db.execute(sql`DELETE FROM users WHERE id IN (${PROVIDER}, ${TRAVELER})`).catch(() => {});
  } catch {
    /* best-effort cleanup */
  }
});

test("P1 (the repro): a NULL-basis in-person listing booked for a party of 4 is ONE unit — amount = price", async () => {
  const id = await seedListing({ price: "300.00", deliveryMethod: "in_person" });
  const line = await addAndRead(id, { partySize: 4 });
  assert.equal(resolveItemUnitCount(line), 1, "main charged 4 units here");
  assert.equal(resolveItemBaseAmount(line), 300, "main charged 1200 here");
  assert.equal(line.partySize, 4, "the party answer is still recorded (capacity / eligibility)");
  assert.equal(line.quantity, 1, "the stored unit count is the booking, not the party");
});

test("P2: an explicit per_booking basis, and a hybrid listing, are one booking too", async () => {
  const booking = await seedListing({ price: "250.00", deliveryMethod: "in_person", priceBasis: "per_booking" });
  const a = await addAndRead(booking, { partySize: 6 });
  assert.equal(resolveItemUnitCount(a), 1);
  assert.equal(resolveItemBaseAmount(a), 250);

  const hybrid = await seedListing({ price: "80.00", deliveryMethod: "hybrid" });
  const b = await addAndRead(hybrid, { partySize: 3 });
  assert.equal(resolveItemUnitCount(b), 1);
  assert.equal(resolveItemBaseAmount(b), 80);
});

test("P3: a per_person listing keeps the seat rule — party 4 ⇒ 4 units, amount = 4 × price", async () => {
  const id = await seedListing({ price: "45.00", deliveryMethod: "in_person", priceBasis: "per_person" });
  const line = await addAndRead(id, { partySize: 4 });
  assert.equal(line.quantity, 4, "units are derived from the party, server-side");
  assert.equal(resolveItemUnitCount(line), 4);
  assert.equal(resolveItemBaseAmount(line), 180);
});

test("P4: a legacy seat-rule line (quantity 4) on a per-booking listing is charged ONE unit", async () => {
  const id = await seedListing({ price: "300.00", deliveryMethod: "in_person" });
  await clearCart();
  // Written directly — the shape the pre-LD-56 seat rule left behind (quantity = party size).
  await db.execute(sql`
    INSERT INTO cart_items (id, user_id, service_id, quantity, party_size)
    VALUES (${`pb-${RUN}-legacy`}, ${TRAVELER}, ${id}, 4, 4)
  `);
  const [line] = await storage.getCartItems(TRAVELER);
  assert.equal(line.quantity, 4, "the stored row is left exactly as it was (no backfill)");
  assert.equal(resolveItemUnitCount(line), 1, "the charge follows the listing, not a stale seat count");
  assert.equal(resolveItemBaseAmount(line), 300);
});

test("P5: unchanged rules — per-day async, an unruled video line and a per-night stay", async () => {
  const perDay = await seedListing({ price: "20.00", deliveryMethod: "async_messaging", pricingUnit: "per_day" });
  const days = await addAndRead(perDay, { quantity: 3 });
  assert.equal(resolveItemUnitCount(days), 3, "LD 54 (c): the price multiplies by the day count");
  assert.equal(resolveItemBaseAmount(days), 60);

  const video = await seedListing({ price: "50.00", deliveryMethod: "video" });
  const call = await addAndRead(video, { quantity: 2 });
  assert.equal(resolveItemUnitCount(call), 2, "an unruled line keeps its count exactly as before");
  assert.equal(resolveItemBaseAmount(call), 100);

  // A per-night stay prices nights × rate whatever the basis says — shape is checked first.
  const stay = { quantity: 1, service: { price: "100.00", pricingUnit: "per_night", deliveryMethod: "in_person", priceBasis: "per_person" }, contentMeta: { checkIn: "2027-01-10", checkOut: "2027-01-13" } };
  assert.equal(archetypeAsks(stay.service).rule, "stay");
  assert.equal(resolveItemBaseAmount(stay), 300, "3 nights × 100, not multiplied by any party");
});

test("P6: the listing write refuses an invalid basis at both layers and round-trips a valid one", async () => {
  // Layer 1 — the ONE admission both rails run.
  const bad = admitPriceBasis({ priceBasis: "per_head" });
  assert.equal(bad.present, true);
  assert.equal(bad.refusal?.status, 400);
  assert.equal(bad.refusal?.body.code, "INVALID_PRICE_BASIS");
  assert.equal(admitPriceBasis({ priceBasis: 2 }).refusal?.status, 400, "a non-string is refused");
  assert.equal(admitPriceBasis({ priceBasis: "PER_PERSON" }).refusal?.status, 400, "refused, never coerced");
  assert.deepEqual(admitPriceBasis({ serviceName: "x" }), { present: false, value: null, refusal: null }, "absent key ⇒ untouched");
  assert.deepEqual(admitPriceBasis({ priceBasis: null }), { present: true, value: null, refusal: null }, "null ⇒ back to never stated");
  assert.deepEqual(admitPriceBasis({ priceBasis: "per_person" }), { present: true, value: "per_person", refusal: null });

  // The generic body schema never carries the column (§19): a body naming it is stripped there.
  const parsed = insertProviderServiceSchema.partial().parse({ priceBasis: "per_person", serviceName: "x" }) as Record<string, unknown>;
  assert.equal("priceBasis" in parsed, false, "only the pick-based admission may reach the column");

  // Layer 2 — the storage writer refuses a value outside the set from ANY caller.
  const id = await seedListing({ price: "10.00", deliveryMethod: "in_person" });
  await assert.rejects(
    () => storage.updateProviderService(id, { priceBasis: "per_head" } as any),
    /priceBasis must be/,
  );
  const unchanged = await storage.getProviderServiceById(id);
  assert.equal((unchanged as any).priceBasis, null, "the refused write touched nothing");

  const updated = await storage.updateProviderService(id, { priceBasis: "per_person" } as any);
  assert.equal((updated as any)?.priceBasis, "per_person", "a valid basis round-trips");
  const cleared = await storage.updateProviderService(id, { priceBasis: null } as any);
  assert.equal((cleared as any)?.priceBasis, null, "null returns the listing to never stated");
});

test("P7: both /api/provider/services rails run the ONE admission and spread its patch", () => {
  const routes = fs
    .readFileSync(path.join(REPO_ROOT, "server/routes.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const post = routes.slice(routes.indexOf('app.post("/api/provider/services"'), routes.indexOf('app.patch("/api/provider/services/:id"'));
  const patchStart = routes.indexOf('app.patch("/api/provider/services/:id"');
  const patch = routes.slice(patchStart, routes.indexOf("app.", patchStart + 10));
  for (const [name, body] of [["POST", post], ["PATCH", patch]] as const) {
    assert.match(body, /admitPriceBasis\(bodyWithoutLocation\)/, `${name} runs the one admission`);
    assert.match(body, /\.\.\.priceBasisPatch/, `${name} writes the admitted value`);
  }
});
