/**
 * PROVIDER MONEY HARDENING — behavioural proof (DECISIONS.md ruling 42).
 *
 * Fixes the three findings the provider-sigma Phase-0 audit rated CRITICAL/HIGH
 * (`docs/testing/PROVIDER_SIGMA_AUDIT.md`, audited@d4f59bb7), each proven here against real rows
 * in a real database rather than by reading the fixed code:
 *
 *   MI-1 (P1/P2) — `provider_services.revenueShareRate` was a CLIENT-SETTABLE commission split that
 *                  beat the fee_bands-resolved rate at the real Stripe charge. Proven stripped on
 *                  BOTH the insert and the update path (the audit found it stripped on NEITHER),
 *                  with the persisted rate equal to the band value READ FROM THE DB — never a
 *                  literal in this file (§8), and never the client's number.
 *   SD-1 (P3/P4/P5) — a provider's "accept" could flip an unauthorized PROVISIONAL claim
 *                  (`status='payment_pending' AND stripe_payment_intent_id IS NULL`, §15b) to
 *                  `confirmed`, after which BOTH recovery predicates matched zero rows and the
 *                  claimed availability slot was stranded with no code path to give it back.
 *                  Proven rejected (P3), proven still recoverable by BOTH recovery layers after
 *                  the rejection (P4 — the point of the fix is the row stays reclaimable), and
 *                  proven single-winner under concurrency (P5, the §15 atomic-conditional shape).
 *   AC-1 (P6)    — `POST /api/vendor-availability/:id/book` (ungated, no booking row, no release
 *                  path, zero consumers) is proven ABSENT from the route inventory, while the
 *                  legitimate `storage.bookSlot` claim path is proven still wired to checkout.
 *
 * NO FEE LITERALS (§8). Every expected rate in P1/P2 is computed from a `fee_bands` row SELECTed at
 * assertion time. P2 additionally EDITS the band and re-derives, which is ruling 32's own proof that
 * an admin band edit changes the resolved value — and is what makes the assertion discriminating:
 * the seeded `expert_standard` share happens to equal the column's hardcoded DEFAULT, so a test
 * that only checked "rate == 0.75" would pass just as well against the unfixed code.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 * No Stripe key and no network: the sweep's Stripe half is injected, as in the sweep suite.
 *
 * Run solo: npx tsx --test server/__tests__/provider-money-hardening.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { insertProviderServiceSchema } from "@shared/schema";
import {
  CHECKOUT_CLAIM_TTL_MINUTES,
  CLAIM_EXPIRED_STATUS,
  promotePaidCheckout,
  sweepExpiredCheckoutClaims,
} from "../services/checkout-claim.service";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  provider: `pmh-${RUN}-prov`,
  traveler: `pmh-${RUN}-trav`,
  trip: `pmh-${RUN}-trip`,
};
const createdServiceIds: string[] = [];
const createdSlotIds: string[] = [];
const createdBookingIds: string[] = [];

// ── Disposable-DB guard (mirrors checkout-claim-sweep.db.test.ts; never defaults open) ───────
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
      `[provider-money-hardening] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is ` +
        `not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

/** The provider band, read live. `active_provider_commission_policy` is `beta_flat` by default, and
 *  `decideBandKey` routes a provider-owned line to that band. Never hardcoded here (§8). */
async function providerBandExpertShare(): Promise<number> {
  const r = await db.execute(sql`
    SELECT CAST(default_rate AS FLOAT) AS rate FROM fee_bands
    WHERE band_key = (SELECT setting_value FROM platform_settings WHERE setting_key = 'active_provider_commission_policy')
      AND is_active = true AND rate_type = 'percent' LIMIT 1
  `);
  const rate = (r.rows[0] as any)?.rate;
  assert.equal(typeof rate, "number", "the provider band must be readable from fee_bands");
  return 1 - rate;
}

async function readRate(serviceId: string): Promise<number> {
  const r = await db.execute(sql`SELECT CAST(revenue_share_rate AS FLOAT) AS v FROM provider_services WHERE id = ${serviceId}`);
  return (r.rows[0] as any)?.v as number;
}

async function readBooking(id: string): Promise<any> {
  const r = await db.execute(sql`
    SELECT status, confirmed_at, cancelled_at, stripe_payment_intent_id, slot_id
    FROM service_bookings WHERE id = ${id}
  `);
  return r.rows[0];
}

async function readSlotBookedCount(id: string): Promise<number> {
  const r = await db.execute(sql`SELECT COALESCE(booked_count, 0) AS c FROM vendor_availability_slots WHERE id = ${id}`);
  return Number((r.rows[0] as any)?.c ?? -1);
}

async function makeSlot(serviceId: string, capacity = 1): Promise<string> {
  const id = `pmh-${RUN}-slot-${crypto.randomUUID().slice(0, 6)}`;
  await db.execute(sql`
    INSERT INTO vendor_availability_slots (id, provider_id, service_id, date, start_time, end_time, capacity, booked_count, status)
    VALUES (${id}, ${ids.provider}, ${serviceId}, CURRENT_DATE + 21, '10:00', '12:00', ${capacity}, 1, 'available')
  `);
  createdSlotIds.push(id);
  return id;
}

/** A PROVISIONAL claim exactly as /api/checkout writes it pre-Stripe (§15b): payment_pending with
 *  NO PaymentIntent. `ageMinutes` ages it past the TTL so the sweep will consider it. */
async function makeProvisionalClaim(serviceId: string, slotId: string | null, ageMinutes: number): Promise<string> {
  const id = `pmh-${RUN}-bk-${crypto.randomUUID().slice(0, 6)}`;
  await db.execute(sql`
    INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, trip_id, slot_id,
                                  status, total_amount, platform_fee, provider_earnings, created_at)
    VALUES (${id}, ${serviceId}, ${ids.traveler}, ${ids.provider}, ${ids.trip}, ${slotId},
            'payment_pending', '100.00', '10.00', '90.00', NOW() - (${ageMinutes} || ' minutes')::interval)
  `);
  createdBookingIds.push(id);
  return id;
}

async function makePendingBooking(serviceId: string): Promise<string> {
  const id = `pmh-${RUN}-bk-${crypto.randomUUID().slice(0, 6)}`;
  await db.execute(sql`
    INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, trip_id,
                                  status, total_amount, platform_fee, provider_earnings)
    VALUES (${id}, ${serviceId}, ${ids.traveler}, ${ids.provider}, ${ids.trip},
            'pending', '100.00', '10.00', '90.00')
  `);
  createdBookingIds.push(id);
  return id;
}

before(async () => {
  await assertDisposableDb();
  // The owner is a SERVICE_PROVIDER — the canonical stored token (shared/roles.ts) — so the rate
  // derivation routes through the provider band, which is the surface this lane audits.
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.provider}, ${`pmh-${RUN}-prov@t.test`}, 'PMH', 'Provider', 'service_provider')
  `);
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.traveler}, ${`pmh-${RUN}-trav@t.test`}, 'PMH', 'Traveler')
  `);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${ids.trip}, ${ids.traveler}, 'PMH fixture trip', 'Kyoto', CURRENT_DATE + 30, CURRENT_DATE + 35)
  `);
});

after(async () => {
  for (const id of createdBookingIds) {
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM item_transition_log WHERE trip_id = ${ids.trip}`).catch(() => {});
  for (const id of createdSlotIds) {
    await db.execute(sql`DELETE FROM vendor_availability_slots WHERE id = ${id}`).catch(() => {});
  }
  for (const id of createdServiceIds) {
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM provider_services WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.provider}, ${ids.traveler})`).catch(() => {});
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// MI-1 — a client-supplied commission split never reaches the row
// ─────────────────────────────────────────────────────────────────────────────────────────────

test("P1: MI-1 INSERT — a client's revenueShareRate is stripped by the schema and the row carries the fee_bands value", async () => {
  // The exact hostile body the audit describes: a crafted request setting the provider's own share
  // to 100 %, which made the platform fee 0.00 at the real Stripe charge. No UI ever sent this field.
  const hostileBody: Record<string, unknown> = {
    serviceName: `PMH hostile ${RUN}`,
    price: "100.00",
    revenueShareRate: "1.00",
  };

  // LAYER 1 — the schema. `insertProviderServiceSchema` is what POST /api/provider/services parses.
  const parsed = insertProviderServiceSchema.parse(hostileBody) as Record<string, unknown>;
  assert.equal(
    Object.prototype.hasOwnProperty.call(parsed, "revenueShareRate"),
    false,
    "the client-supplied commission split must not survive schema parsing",
  );

  // LAYER 2 — storage. Called with the field still attached, to prove the strip is not merely the
  // schema's doing: any caller (a seed, a future route, an internal helper) is covered.
  const created = await storage.createProviderService({
    ...(parsed as any),
    revenueShareRate: "1.00",
    userId: ids.provider,
  } as any);
  createdServiceIds.push(created.id);

  const stored = await readRate(created.id);
  const expected = await providerBandExpertShare();
  assert.notEqual(stored, 1, "the client's 1.00 must never be persisted — that is a 0.00 platform fee");
  assert.equal(
    stored.toFixed(4),
    expected.toFixed(4),
    "the persisted split must be the fee_bands-resolved provider share, read from the DB",
  );
});

test("P2: MI-1 UPDATE — a PATCH cannot move the split, and an admin BAND edit is what moves it", async () => {
  const created = await storage.createProviderService({
    serviceName: `PMH update ${RUN}`,
    price: "100.00",
    userId: ids.provider,
  } as any);
  createdServiceIds.push(created.id);
  const before = await readRate(created.id);

  // The update path was the easier of the two to reach: `insertProviderServiceSchema.partial()` let
  // a single-field PATCH set nothing but the commission split, on an already-approved listing.
  const parsedPatch = insertProviderServiceSchema.partial().parse({ revenueShareRate: "1.00" }) as Record<string, unknown>;
  assert.equal(
    Object.prototype.hasOwnProperty.call(parsedPatch, "revenueShareRate"),
    false,
    "the partial (PATCH) schema must strip the split too — the audit found it stripped on NEITHER path",
  );
  await storage.updateProviderService(created.id, { ...(parsedPatch as any), revenueShareRate: "1.00" } as any);
  assert.equal(await readRate(created.id), before, "a PATCH must not move the commission split");

  // Ruling 32's proof, and the discriminator for this whole assertion: the ONE thing that DOES move
  // the resolved rate is an admin edit to the band. Without this, "rate == 0.75" would also be
  // satisfied by the unfixed code, because the seeded expert share equals the column's DB DEFAULT.
  const original = await db.execute(sql`
    SELECT band_key, CAST(default_rate AS FLOAT) AS rate FROM fee_bands
    WHERE band_key = (SELECT setting_value FROM platform_settings WHERE setting_key = 'active_provider_commission_policy')
    LIMIT 1
  `);
  const bandKey = (original.rows[0] as any).band_key as string;
  const originalRate = (original.rows[0] as any).rate as number;
  // A platform take deliberately equal to NO seeded band and to no default in the codebase, so a
  // pass cannot be a coincidence.
  const editedTake = 0.37;
  try {
    await db.execute(sql`UPDATE fee_bands SET default_rate = ${String(editedTake)} WHERE band_key = ${bandKey}`);
    const afterEdit = await storage.createProviderService({
      serviceName: `PMH band-edit ${RUN}`,
      price: "100.00",
      userId: ids.provider,
      revenueShareRate: "1.00",
    } as any);
    createdServiceIds.push(afterEdit.id);
    const stored = await readRate(afterEdit.id);
    assert.equal(
      stored.toFixed(4),
      (1 - editedTake).toFixed(4),
      "an admin band edit must change the derived split — that is what 'resolves from fee_bands' means",
    );
    assert.notEqual(stored, 1, "and the client's number still never wins");
  } finally {
    await db.execute(sql`UPDATE fee_bands SET default_rate = ${String(originalRate)} WHERE band_key = ${bandKey}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// SD-1 — a provisional claim is unacceptable input, and stays recoverable
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The route's own from-state allow-list for "accept" (server/routes.ts OWNER_BOOKING_TRANSITIONS).
 *  Stated here as the contract under test: the owner rail may only accept a request-rail booking. */
const ACCEPT_FROM = ["pending"] as const;

test("P3: SD-1 — provider accept on a PROVISIONAL claim is rejected; row, slot and diary unchanged", async () => {
  const svc = await storage.createProviderService({
    serviceName: `PMH sd1 ${RUN}`,
    price: "100.00",
    userId: ids.provider,
  } as any);
  createdServiceIds.push(svc.id);
  const slot = await makeSlot(svc.id);
  const booking = await makeProvisionalClaim(svc.id, slot, 1);

  const slotBefore = await readSlotBookedCount(slot);
  const diaryBefore = await db.execute(sql`SELECT COUNT(*)::int AS n FROM item_transition_log WHERE trip_id = ${ids.trip}`);

  // The exact call the provider's Accept button makes, post-fix.
  const result = await storage.updateServiceBookingStatus(booking, "confirmed", undefined, ACCEPT_FROM);

  assert.equal(result, undefined, "accept must not take on a payment_pending claim");
  const row = await readBooking(booking);
  assert.equal(row.status, "payment_pending", "the claim's status must be untouched");
  assert.equal(row.confirmed_at, null, "no confirmedAt may be stamped on an unpaid claim");
  assert.equal(row.stripe_payment_intent_id, null, "the claim is still unauthorized — that is the point");
  assert.equal(await readSlotBookedCount(slot), slotBefore, "the claimed slot's capacity must be untouched");
  const diaryAfter = await db.execute(sql`SELECT COUNT(*)::int AS n FROM item_transition_log WHERE trip_id = ${ids.trip}`);
  assert.equal(
    (diaryAfter.rows[0] as any).n,
    (diaryBefore.rows[0] as any).n,
    "a rejected transition writes no diary row — there was no transition to record",
  );
});

test("P4: SD-1 — a row that used to be STRANDED is still reclaimable by the sweep AND promotable by payment", async () => {
  const svc = await storage.createProviderService({
    serviceName: `PMH sd1-recover ${RUN}`,
    price: "100.00",
    userId: ids.provider,
  } as any);
  createdServiceIds.push(svc.id);

  // (a) RECOVERY LAYER 1 — the TTL sweep. Pre-fix, the accept above would have set status
  //     'confirmed', and voidClaim's `WHERE status='payment_pending' AND stripe_payment_intent_id
  //     IS NULL` would have matched 0 rows forever: capacity destroyed with no code path back.
  const slotA = await makeSlot(svc.id);
  const claimA = await makeProvisionalClaim(svc.id, slotA, CHECKOUT_CLAIM_TTL_MINUTES + 5);
  assert.equal(await storage.updateServiceBookingStatus(claimA, "confirmed", undefined, ACCEPT_FROM), undefined);
  const heldBefore = await readSlotBookedCount(slotA);
  const swept = await sweepExpiredCheckoutClaims({ stripeIntentLookup: async () => [] });
  assert.ok(swept.voidedUnreached >= 1, "the aged, never-attempted claim must still be a sweep candidate");
  const rowA = await readBooking(claimA);
  assert.equal(rowA.status, CLAIM_EXPIRED_STATUS, "the sweep must still be able to expire it");
  assert.equal(
    await readSlotBookedCount(slotA),
    heldBefore - 1,
    "and the availability capacity must come BACK — the inventory layer is what SD-1 destroyed",
  );

  // (b) RECOVERY LAYER 2 — the shared payment promotion. A traveler who actually pays must still
  //     be able to reach `confirmed` through the ONE promotion implementation (§15c), not through
  //     a provider's button.
  const slotB = await makeSlot(svc.id);
  const claimB = await makeProvisionalClaim(svc.id, slotB, 1);
  assert.equal(await storage.updateServiceBookingStatus(claimB, "confirmed", undefined, ACCEPT_FROM), undefined);
  const pi = `pi_pmh_${RUN}`;
  await db.execute(sql`UPDATE service_bookings SET stripe_payment_intent_id = ${pi} WHERE id = ${claimB}`);
  const promoted = await promotePaidCheckout({ paymentIntentId: pi, actor: "webhook" });
  assert.equal(promoted.promoted.length, 1, "the real payment must still promote the claim the provider could not");
  assert.equal((await readBooking(claimB)).status, "confirmed");
});

test("P5: SD-1 — CONCURRENT accepts on the same booking: exactly ONE wins", async () => {
  const svc = await storage.createProviderService({
    serviceName: `PMH sd1-race ${RUN}`,
    price: "100.00",
    userId: ids.provider,
  } as any);
  createdServiceIds.push(svc.id);
  const booking = await makePendingBooking(svc.id);

  // A double-click, or two tabs. Pre-fix this was a check-then-update against an unconditional
  // `WHERE id = ?`, so both callers wrote. The guard is now the transition itself (§15).
  const results = await Promise.all(
    Array.from({ length: 5 }, () => storage.updateServiceBookingStatus(booking, "confirmed", undefined, ACCEPT_FROM)),
  );
  const winners = results.filter((r) => r !== undefined);
  assert.equal(winners.length, 1, `exactly one accept may take; ${winners.length} did`);
  assert.equal((await readBooking(booking)).status, "confirmed");
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// AC-1 — the endpoint is gone, the legitimate claim path is not
// ─────────────────────────────────────────────────────────────────────────────────────────────

test("P6: AC-1 — no route registers POST /api/vendor-availability/:id/book, and storage.bookSlot is still checkout's", () => {
  // A ROUTE-INVENTORY assertion over the registration sites, in the shape
  // `scripts/check-unmounted-routers.cjs` (a ratified in-CI guard) already uses. It is deliberately
  // a source scan rather than a live-server probe: a dead endpoint answers 200-HTML through the
  // Vite catch-all (CLAUDE.md §9), so a 404 from a running server would prove nothing at all.
  const roots = ["server/routes.ts", "server/routes"];
  const files: string[] = [];
  const walk = (p: string) => {
    const abs = path.resolve(process.cwd(), p);
    if (!fs.existsSync(abs)) return;
    if (fs.statSync(abs).isDirectory()) {
      for (const e of fs.readdirSync(abs)) walk(path.join(p, e));
    } else if (abs.endsWith(".ts")) files.push(abs);
  };
  roots.forEach(walk);
  assert.ok(files.length > 5, "the route-file scan must actually have found the route files");

  const REGISTRATION = /\b(?:app|router)\.(?:get|post|put|patch|delete)\s*\(\s*["'`][^"'`]*vendor-availability[^"'`]*\/book/;
  const offenders = files.filter((f) => REGISTRATION.test(fs.readFileSync(f, "utf8")));
  assert.deepEqual(offenders, [], `the deleted slot-book endpoint is registered again in: ${offenders.join(", ")}`);

  // The deletion must not have taken the legitimate path with it: `bookSlot` is the checkout
  // spine's ATOMIC slot claim (§15/C3) and `releaseSlot` its counterpart.
  const checkout = fs.readFileSync(path.resolve(process.cwd(), "server/routes/payments.routes.ts"), "utf8");
  assert.match(checkout, /storage\.bookSlot\(/, "checkout must still claim slots through storage.bookSlot");
  assert.match(checkout, /storage\.releaseSlot\(/, "checkout must still release slots through storage.releaseSlot");
});
