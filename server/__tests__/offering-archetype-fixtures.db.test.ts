/**
 * ARCHETYPE FIXTURES — creation → activation → contract → booking → snapshot, per archetype.
 *
 * Ledger `2026-09-12-archetype-fixtures`. Fixtures: `server/fixtures/offering-archetypes.ts`.
 * Design: §9's master treatment matrix
 * (`docs/superpowers/specs/2026-09-08-offering-commerce-trip-slip-contract-design.md`).
 *
 * WHY IT EXISTS. `2026-09-11-oc-a1-ratified` ratified the archetype vocabulary WITHOUT being able
 * to check that the platform can actually sell each one: the resolver had no production caller,
 * and the pure suite proves only that a hand-built INPUT classifies correctly. This suite walks
 * the whole rail for each authorable archetype — a `provider_services` row is created, OC-A4's
 * activation gate judges it, `loadOfferingListingInput` reads it back off the DB, the resolver
 * classifies THAT, a booking commits through the spine's own objects, and OC-B1's
 * `offering_contract_snapshot` is read off the committed row.
 *
 * THE RESULT IS A REPORT, NOT A GREEN TICK. Four of the thirteen have NO working path and the
 * suite asserts the break rather than hiding it — see `listingRow` on each fixture and B2/B3/B4/B6
 * below. A test that made them pass would have to weaken a gate or invent a column; neither is
 * done here.
 *
 * WHAT THIS SUITE CHANGES ABOUT CHECKOUT: NOTHING. It commits bookings through the same objects
 * `POST /api/bookings` uses — `createBookingRequestSchema` (the §19 allowlist) and
 * `storage.createServiceBooking` (the server-derived amount and identity, §14) — and asserts the
 * CURRENT behaviour as the baseline OC-B2 must not break. No gate is carved out, no schema is
 * relaxed, and nothing reads the contract to make a decision.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 * No Stripe key, no network, no HTTP server.
 *
 * Run solo: npx tsx --test server/__tests__/offering-archetype-fixtures.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";

import { db } from "../db";
import { storage } from "../storage";
import { createBookingRequestSchema } from "@shared/schema";
import { resolveServiceOwnerShareRate } from "../services/commission";
import { hasPublishedPrice } from "../services/buy-action-payload";
import { resolveOfferingCommerceContract } from "../services/offering-commerce-contract";
import {
  checkOfferingActivationGate,
  ACTIVATION_BLOCKING_REASONS,
} from "../services/offering-activation-gate.service";
import { loadOfferingListingInput } from "../services/offering-listing-input";
import {
  ARCHETYPE_FIXTURES,
  NON_LISTING_ARCHETYPES,
  activationOverridesFor,
  contractInputFor,
  fixtureCategoryKeys,
  type ArchetypeFixture,
} from "../fixtures/offering-archetypes";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  expertOwner: `arcf-${RUN}-expert`,
  providerOwner: `arcf-${RUN}-provider`,
  traveler: `arcf-${RUN}-trav`,
  trip: `arcf-${RUN}-trip`,
};
const createdServiceIds: string[] = [];
const createdBookingIds: string[] = [];
const createdCategoryIds: string[] = [];

/** archetype → the id of the `provider_services` row this run created for it. */
const serviceIdFor = new Map<string, string>();
/** archetype → what OC-A4 answered when that row was created. `null` = the write may proceed. */
const gateRefusalFor = new Map<string, unknown>();
/** category_key → `service_categories.id`, resolved once in before(). */
const categoryIdFor = new Map<string, string>();

// ── Disposable-DB guard (the provider-money-hardening / booking-birth-provenance shape) ───────
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch {
    /* local socket ⇒ NULL ⇒ disposable signal */
  }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) {
    throw new Error(
      `[archetype-fixtures] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' ` +
        `is not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

/**
 * Resolve a `service_categories.id` by key, creating a disposable row when the database carries
 * none. NOT a weakening of anything: the category row is a TAXONOMY PRECONDITION, not a gate. It
 * is needed because `custom_other` is assigned by `server/seed-categories.ts` — a BOOT seeder, not
 * a migration — so a migrations-only CI database has the catch-all offering type
 * (`service_offering_types.custom_other_offering`, migrations 189/208) pointing at a
 * `service_categories` row that does not exist. That gap is reported in this lane's ledger row; it
 * is not this suite's to fix.
 */
async function resolveCategoryId(key: string): Promise<string> {
  const found = await db.execute(
    sql`SELECT id FROM service_categories WHERE category_key = ${key} LIMIT 1`,
  );
  const existing = (found.rows[0] as any)?.id as string | undefined;
  if (existing) return existing;
  const id = `arcf-${RUN}-cat-${key}`;
  // `commission_band_key` is NOT NULL and is a BAND SELECTOR — a rate-bearing field (§18). It is
  // therefore COPIED from a row the taxonomy migrations already seeded rather than written as a
  // literal here (§8: no fee/commission literal outside `fee_bands`/config). Nothing in this suite
  // reads it; it exists only because the column refuses NULL.
  const inserted = await db.execute(sql`
    INSERT INTO service_categories (id, name, slug, category_key, commission_band_key)
    SELECT ${id}, ${`ARCF ${RUN} ${key}`}, ${`arcf-${RUN}-${key}`}, ${key}, sc.commission_band_key
      FROM service_categories sc
     WHERE sc.commission_band_key IS NOT NULL
     LIMIT 1
    RETURNING id
  `);
  assert.ok(
    inserted.rows[0],
    `cannot create a disposable '${key}' category: this database carries no service_categories row ` +
      "with a commission band to copy, so the taxonomy migrations have not been applied",
  );
  createdCategoryIds.push(id);
  return id;
}

function ownerIdFor(fx: ArchetypeFixture): string {
  return fx.ownerRole === "expert" ? ids.expertOwner : ids.providerOwner;
}

/**
 * Create the listing exactly as `POST /api/provider/services` does: the OC-A4 gate FIRST (a create
 * with `status:'active'` is a transition into active), then `storage.createProviderService`. The
 * born approval status is clamped to `submitted` by that writer (F2, migration 111), so the row is
 * then APPROVED by a direct update — the admin review queue's own action, performed here because a
 * bookable listing needs it and because no gate is being avoided by doing so.
 */
async function createFixtureListing(fx: ArchetypeFixture): Promise<{
  serviceId: string;
  gateRefusal: Awaited<ReturnType<typeof checkOfferingActivationGate>>;
}> {
  const categoryId = fx.row.categoryKey ? categoryIdFor.get(fx.row.categoryKey)! : null;
  const gateRefusal = await checkOfferingActivationGate({
    ownerUserId: ownerIdFor(fx),
    overrides: activationOverridesFor(fx, categoryId),
  });
  const service = await storage.createProviderService({
    userId: ownerIdFor(fx),
    serviceName: `[archetype-fixture] ${fx.archetype} — ${fx.sells}`,
    description: fx.sells,
    status: "active",
    serviceType: fx.row.serviceType,
    deliveryMethod: fx.row.deliveryMethod,
    productShape: fx.row.productShape ?? null,
    priceType: fx.row.priceType,
    bookingMode: fx.row.bookingMode,
    depositEnabled: fx.row.depositEnabled ?? false,
    meetingPoint: fx.row.meetingPoint ?? null,
    price: fx.row.price,
    categoryId,
  } as any);
  createdServiceIds.push(service.id);
  await db.execute(
    sql`UPDATE provider_services SET approval_status = 'approved' WHERE id = ${service.id}`,
  );
  return { serviceId: service.id, gateRefusal };
}

/** What the rail answers for a listing it cannot price (V-11). */
class PricelessListingRefused extends Error {
  constructor(readonly serviceId: string) {
    super(`no_published_price: ${serviceId}`);
  }
}

/**
 * Commit a booking the way `POST /api/bookings` does — the route's OWN objects, imported, never a
 * reconstruction: the §19 pick-based allowlist, the V-11 price gate, then the storage writer with
 * the amount derived from the catalog row and the identities from the caller's own server-side
 * facts (§14).
 */
async function commitBooking(serviceId: string): Promise<string> {
  const input = createBookingRequestSchema.parse({
    serviceId,
    tripId: ids.trip,
    bookingDetails: { notes: `archetype fixture ${RUN}` },
  });
  const service = await storage.getProviderServiceById(input.serviceId!);
  assert.ok(service, "fixture listing must exist");
  // V-11 (ledger `2026-09-12-booking-birth-holes`): the rail's OWN price gate, imported. A listing
  // that publishes no price is REFUSED rather than committed at `0.00` — N1 below is the proof,
  // and this helper carries the gate so the C loop cannot commit a row the real rail would not.
  if (!hasPublishedPrice(service!.price)) throw new PricelessListingRefused(serviceId);
  const totalAmount = Number(service!.price) || 0;
  const ownerShareRate = await resolveServiceOwnerShareRate({
    ownerUserId: service!.userId ?? null,
    ownerIsProvider: service!.userId === ids.providerOwner,
    feeCategory: null,
  });
  const booking = await storage.createServiceBooking({
    ...input,
    travelerId: ids.traveler,
    providerId: service!.userId,
    totalAmount: totalAmount.toFixed(2),
    ...(ownerShareRate !== null
      ? {
          platformFee: (totalAmount * (1 - ownerShareRate)).toFixed(2),
          providerEarnings: (totalAmount * ownerShareRate).toFixed(2),
        }
      : {}),
  } as any);
  createdBookingIds.push(booking.id);
  return booking.id;
}

async function readBooking(id: string): Promise<any> {
  const r = await db.execute(sql`
    SELECT status, stripe_payment_intent_id, total_amount, offering_contract_snapshot
    FROM service_bookings WHERE id = ${id}
  `);
  return r.rows[0];
}

/** Source text with comments stripped — every static pin below derives from the file SET. */
function sourceWithoutComments(rel: string): string {
  const raw = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  return raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.expertOwner}, ${`arcf-${RUN}-e@t.test`}, 'ARCF', 'Expert', 'expert')
  `);
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.providerOwner}, ${`arcf-${RUN}-p@t.test`}, 'ARCF', 'Provider', 'service_provider')
  `);
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.traveler}, ${`arcf-${RUN}-t@t.test`}, 'ARCF', 'Traveler')
  `);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${ids.trip}, ${ids.traveler}, 'ARCF fixture trip', 'Kyoto', CURRENT_DATE + 30, CURRENT_DATE + 35)
  `);
  for (const key of fixtureCategoryKeys()) {
    categoryIdFor.set(key, await resolveCategoryId(key));
  }
  for (const fx of ARCHETYPE_FIXTURES) {
    const { serviceId, gateRefusal } = await createFixtureListing(fx);
    serviceIdFor.set(fx.archetype, serviceId);
    // Recorded so B can assert it. A refusal here is a FIXTURE bug or a GATE bug — it is diagnosed
    // and reported, never routed around.
    gateRefusalFor.set(fx.archetype, gateRefusal);
  }
});

after(async () => {
  for (const id of createdBookingIds) {
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM item_transition_log WHERE trip_id = ${ids.trip}`).catch(() => {});
  for (const id of createdServiceIds) {
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM provider_services WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`).catch(() => {});
  for (const id of createdCategoryIds) {
    await db.execute(sql`DELETE FROM service_categories WHERE id = ${id}`).catch(() => {});
  }
  for (const id of [ids.expertOwner, ids.providerOwner, ids.traveler]) {
    await db.execute(sql`DELETE FROM users WHERE id = ${id}`).catch(() => {});
  }
});

// ── S1 · SCOPE ────────────────────────────────────────────────────────────────────────────────

test("S1 · the fixtures cover every LISTING archetype the resolver declares, and no other", () => {
  // Derived from the resolver's own source with comments stripped, never from a hand-kept list of
  // thirteen: a fourteenth archetype ratified later fails HERE rather than going untested.
  const src = sourceWithoutComments("server/services/offering-commerce-contract.ts");
  const decl = /export type CommerceArchetype\s*=([\s\S]*?);/.exec(src);
  assert.ok(decl, "CommerceArchetype union must be parseable from the resolver source");
  const declared = Array.from(decl![1].matchAll(/"([A-Z]\d)"/g)).map((m) => m[1]).sort();
  assert.ok(declared.length >= 17, `expected the full archetype union, parsed ${declared.length}`);

  const covered = ARCHETYPE_FIXTURES.map((f) => f.archetype).sort();
  const excluded = Object.keys(NON_LISTING_ARCHETYPES).sort();
  assert.deepEqual([...covered, ...excluded].sort(), declared);
  assert.equal(new Set(covered).size, covered.length, "one fixture per archetype, no duplicates");

  // E5 is deliberately absent from the union (§9.1: `specialized` is not a checkout archetype).
  assert.ok(!declared.includes("E5"), "E5 must not be reintroduced");
});

// ── A · THE FIXTURE IS CORRECTLY AUTHORED (pure) ──────────────────────────────────────────────

for (const fx of ARCHETYPE_FIXTURES) {
  test(`A · ${fx.archetype} resolves to ${fx.archetype} with every axis the matrix states`, () => {
    const r = resolveOfferingCommerceContract(contractInputFor(fx));
    assert.equal(r.resolved, true, `expected a contract, got ${JSON.stringify(r)}`);
    if (!r.resolved) return;
    assert.equal(r.contract.commerceArchetype, fx.archetype);
    assert.equal(r.contract.sellerClass, fx.ownerRole);
    for (const axis of [
      "commitmentMode",
      "commitmentModeSource",
      "fulfillmentMode",
      "inventoryAuthority",
      "priceAuthority",
      "chargeMode",
      "completionRule",
      "slipEffect",
    ] as const) {
      assert.equal((r.contract as any)[axis], (fx.expect as any)[axis], `${fx.archetype}.${axis}`);
    }
    assert.deepEqual(
      r.findings.map((f) => f.code).sort(),
      [...fx.expect.findings].sort(),
      `${fx.archetype} findings — a disagreement between §9 and the service fundamentals is REPORTED, ` +
        "never an override (§14 amendment, rule 4)",
    );
  });
}

// ── B · THE SAME LISTING, CREATED AND READ BACK OFF THE DATABASE ──────────────────────────────

for (const fx of ARCHETYPE_FIXTURES) {
  test(`B · ${fx.archetype} activates, and the DB round-trip ${fx.listingRow.reachable ? "resolves" : "CANNOT resolve"} it`, async () => {
    assert.equal(
      gateRefusalFor.get(fx.archetype),
      null,
      `OC-A4 refused a correctly-authored ${fx.archetype}: ${JSON.stringify(gateRefusalFor.get(fx.archetype))}`,
    );

    const serviceId = serviceIdFor.get(fx.archetype)!;
    const input = await loadOfferingListingInput({ serviceId });
    assert.ok(input, "the loader must describe a row that exists");
    // THE COLUMN THAT IS NOT THERE: no listing can carry an expert offering key, whoever owns it.
    assert.equal(
      input!.offeringTypeKey ?? null,
      null,
      "`provider_services` has no `offering_type_key` column — if this ever fails, the rail grew one",
    );
    assert.equal(input!.sellerClass, fx.ownerRole, "seller class comes from the OWNER's role");

    const r = resolveOfferingCommerceContract(input!);
    if (fx.listingRow.reachable) {
      assert.equal(r.resolved, true, `expected a contract, got ${JSON.stringify(r)}`);
      if (!r.resolved) return;
      assert.equal(r.contract.commerceArchetype, fx.archetype);
      for (const axis of [
        "commitmentMode",
        "fulfillmentMode",
        "inventoryAuthority",
        "priceAuthority",
        "chargeMode",
        "completionRule",
        "slipEffect",
      ] as const) {
        assert.equal((r.contract as any)[axis], (fx.expect as any)[axis], `${fx.archetype}.${axis}`);
      }
      return;
    }

    // BROKEN PATH, ASSERTED AS BROKEN (§13). The listing is live and unclassifiable, which is the
    // worse of the two outcomes: the gate does not block this reason, so the seller is never told.
    assert.equal(r.resolved, false, `${fx.archetype} unexpectedly resolved off a listing row`);
    if (r.resolved) return;
    assert.equal(r.reason, (fx.listingRow as any).reason);
    assert.ok(
      !ACTIVATION_BLOCKING_REASONS.has(r.reason),
      "OC-A4 does not block this reason — which is why the listing published",
    );
  });
}

// ── C · A BOOKING COMMITS, AND RECORDS THE TERMS IT WAS COMMITTED UNDER ───────────────────────

for (const fx of ARCHETYPE_FIXTURES.filter((f) => f.genericCheckout === "bookable")) {
  test(`C · ${fx.archetype} commits a booking whose snapshot records ${fx.listingRow.reachable ? "the contract" : "the refusal"}`, async () => {
    const bookingId = await commitBooking(serviceIdFor.get(fx.archetype)!);
    const row = await readBooking(bookingId);

    // §15/§19a BIRTH INVARIANTS, pinned as the baseline OC-B2 must not move: a booking request is
    // born `pending` from the column default and carries NO PaymentIntent — that column's sole
    // writers stay `stampAuthorization`/`resolveAndStamp`.
    assert.equal(row.status, "pending");
    assert.equal(row.stripe_payment_intent_id, null);

    const snap = row.offering_contract_snapshot;
    assert.ok(snap, "OC-B1 stamps the snapshot in the same INSERT that commits the booking");
    assert.equal(snap.snapshotVersion, 1);
    assert.equal(snap.listing.sellerClass, fx.ownerRole);

    if (fx.listingRow.reachable) {
      assert.equal(snap.resolution.resolved, true, JSON.stringify(snap.resolution));
      assert.equal(snap.resolution.contract.commerceArchetype, fx.archetype);
      assert.equal(snap.resolution.contract.chargeMode, fx.expect.chargeMode);
      assert.equal(snap.resolution.contract.completionRule, fx.expect.completionRule);
    } else {
      // §13 — the REFUSAL is recorded verbatim, never a nearest-looking archetype. So the platform
      // sells these and records, on the row, that it could not say what it sold.
      assert.equal(snap.resolution.resolved, false, JSON.stringify(snap.resolution));
      assert.equal(snap.resolution.reason, (fx.listingRow as any).reason);
    }
  });
}

// ── N · THE NEGATIVES ─────────────────────────────────────────────────────────────────────────

test("N1 · P5 is NOT sellable through generic checkout — the spine charges a price it does not have", async () => {
  const fx = ARCHETYPE_FIXTURES.find((f) => f.archetype === "P5")!;
  assert.equal(fx.genericCheckout, "refused_by_ruling");

  // The contract says the price is the SERVER's to quote, not the listing's to state.
  const input = await loadOfferingListingInput({ serviceId: serviceIdFor.get("P5")! });
  const r = resolveOfferingCommerceContract(input!);
  assert.equal(r.resolved, true);
  if (!r.resolved) return;
  assert.equal(r.contract.priceAuthority, "server_quote");
  assert.equal(r.contract.chargeMode, "after_quote");
  assert.equal(r.contract.commitmentMode, "quote_approve");

  // THE REFUSAL IS NOW REAL (punchlist V-11, ledger `2026-09-12-booking-birth-holes`). When this
  // suite landed, the generic spine had no quote rail to read and its own amount derivation
  // (`Number(service.price) || 0`) priced the booking at ZERO — this assertion committed the row to
  // prove it, because no refusal existed anywhere on that path and §9.2's "do not send this through
  // generic checkout" had nothing standing behind it. `POST /api/bookings` now consults the ONE
  // price predicate before it derives an amount, so the rail refuses instead of stating a price
  // nobody set (§13). The assertion is REPAIRED to the invariant, not deleted: what it guards is
  // that a `server_quote` listing never becomes a committed booking on this rail.
  await assert.rejects(
    () => commitBooking(serviceIdFor.get("P5")!),
    (err: unknown) => err instanceof PricelessListingRefused,
    "a custom-quote listing must be REFUSED by generic checkout, never committed at 0.00",
  );
  const committed = await db.execute(sql`
    SELECT count(*)::int AS n FROM service_bookings WHERE service_id = ${serviceIdFor.get("P5")!}
  `);
  assert.equal((committed.rows[0] as any).n, 0, "and no row exists — a refusal is not a $0 purchase");

  // WHAT IS STILL BROKEN, AND IS NOT THIS LANE'S TO FIX: the quote rail the contract describes
  // (`chargeMode: after_quote`, `commitmentMode: quote_approve`) does not exist, so a P5 listing is
  // publishable and unsellable. That is an honest refusal rather than a silent $0 sale — and it is
  // still a hole in the product, recorded here rather than papered over.
});

test("N2 · the catch-all category MISCLASSIFIES an expert's physical action as a provider's P1", () => {
  // The only category key an expert can honestly pick for a listing the provider catalog does not
  // describe is the `custom_other` catch-all. `impactClassFor`'s rule 3 then reads the DELIVERY
  // METHOD: place-anchored ⇒ `on_ground` ⇒ the provider branch ⇒ P1. So an E6 authored through the
  // only route a listing row offers is sold as a scheduled place service, with P1's required
  // context and P1's completion rule. That is worse than the refusal B asserts for the others,
  // because it looks like an answer.
  const e6 = ARCHETYPE_FIXTURES.find((f) => f.archetype === "E6")!;
  const asListingRow = { ...contractInputFor(e6), offeringTypeKey: null, categoryKey: "custom_other" };
  const r = resolveOfferingCommerceContract(asListingRow);
  assert.equal(r.resolved, true);
  if (!r.resolved) return;
  assert.equal(r.contract.commerceArchetype, "P1");
  assert.notEqual(r.contract.commerceArchetype, "E6");
  assert.equal(r.contract.slipEffect, "add_obligation", "and the plan gets an obligation, not support");
});
