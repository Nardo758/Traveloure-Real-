/**
 * BUNDLE COMPONENT STATES — birth, the atomic component claims, the partial flip and its ONE reduced
 * mint, against a real database (punchlist D-32 / D-33 / D-34 / D-35, all option A; ledger
 * `2026-09-16-d32-d35-bundle-components`; migration 306). Content of record:
 * `docs/design/BUNDLE_PARTIAL_COMPLETION_BRIEF.md`.
 *
 * WHAT THESE PROOFS ARE. Every rail is exercised through the SAME functions the routes call —
 * `storage.createServiceBooking` (the checkout claim's composer), `recordBundleComponentCompletion`,
 * `recordBundleComponentFailure`, `settleBundlePartialCompletion`, `resolveCompletionEligibility`,
 * `storage.mintCompletionEarningsForBooking` — never a reconstruction of a handler. The PURE
 * derivation beneath them is proven with no database in `shared/__tests__/bundle-component-states.test.ts`.
 *
 * NEGATIVE SPACE (§18d): these say nothing about the HTTP gates (`providerId` from the session — the
 * routes' own, unchanged), nothing about the component REFUND (brief lane 4 — recorded, not built:
 * the whole-row refund rail cannot express it), and nothing about SURFACES.
 *
 * NO FEE LITERALS (§8): fixture amounts are arbitrary fixture money (100.00 / 25.00 / 75.00, the same
 * shape `declared-completion.db.test.ts` uses); the assertions are about the SHARE arithmetic over the
 * snapshot and the PRESENCE/ABSENCE/COUNT of a mint, never about a rate.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 * No Stripe key and no network.
 *
 * Run solo: npx tsx --test server/__tests__/bundle-component-states.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";

import { db } from "../db";
import { storage } from "../storage";
import {
  COMPLETION_ALLOWED_FROM_STATUSES,
  recordBundleComponentCompletion,
  recordBundleComponentFailure,
  resolveCompletionEligibility,
  settleBundlePartialCompletion,
} from "../services/booking-completion.service";
import { readBundleComponentRows } from "../services/bundle-component-states.service";
import Stripe from "stripe";
import {
  DISPUTABLE_FROM_STATUSES,
  PARTIAL_COMPLETION_FROM_STATUSES,
} from "../utils/booking-from-states";
import { PARTIALLY_COMPLETED_STATUS } from "@shared/bundle-component-states";
import { SERVER_AUTHORED_BOOKING_DETAIL_KEYS } from "@shared/booking-details-admission";
import { TRANSACTED_BOOKING_STATUSES } from "@shared/booking-visibility";
import { readPurchaseStatus } from "../../client/src/lib/purchase-status";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  provider: `bcs-${RUN}-prov`,
  traveler: `bcs-${RUN}-trav`,
  bundle: `bcs-${RUN}-bundle`,
  compA: `bcs-${RUN}-a`,
  compB: `bcs-${RUN}-b`,
  compC: `bcs-${RUN}-c`,
};
const COMPONENTS = [
  { id: ids.compA, serviceName: `Bundle comp A ${RUN}`, price: "40.00", priceCents: 4000 },
  { id: ids.compB, serviceName: `Bundle comp B ${RUN}`, price: "40.00", priceCents: 4000 },
  { id: ids.compC, serviceName: `Bundle comp C ${RUN}`, price: "20.00", priceCents: 2000 },
];
const createdBookingIds: string[] = [];

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const src = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
/** Source with COMMENTS STRIPPED (docs/OPERATING_PROCEDURE.md §3) — a pin over prose proves nothing. */
const code = (rel: string) =>
  src(rel).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

// ── Disposable-DB guard (mirrors declared-completion.db.test.ts; never defaults open) ────────────
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
      `[bundle-component-states] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' ` +
        `is not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────────

/**
 * A bundle booking BORN THE WAY CHECKOUT BIRTHS IT: through `storage.createServiceBooking` with the
 * purchase-time snapshot the checkout route composes (`payments.routes.ts` — id, name and, since
 * D-33, `priceCents`). The claim is then authorized the way the spine authorizes it — a PaymentIntent
 * id stamped AFTER birth (the PS15 strip forbids passing it in) and `confirmed`.
 */
async function bornBundleBooking(opts: { snapshot?: unknown[]; status?: string } = {}): Promise<string> {
  const booking = await storage.createServiceBooking({
    serviceId: ids.bundle,
    travelerId: ids.traveler,
    providerId: ids.provider,
    status: opts.status ?? "confirmed",
    totalAmount: "100.00",
    platformFee: "25.00",
    providerEarnings: "75.00",
    bookingDetails: {
      notes: "fixture",
      bundleComponents: opts.snapshot ?? COMPONENTS.map((c) => ({ id: c.id, serviceName: c.serviceName, priceCents: c.priceCents })),
    },
  } as any);
  await db.execute(sql`
    UPDATE service_bookings SET stripe_payment_intent_id = ${`pi_${RUN}_${booking.id}`}, confirmed_at = NOW() - interval '10 days'
    WHERE id = ${booking.id}
  `);
  createdBookingIds.push(booking.id);
  return booking.id;
}

/** A LEGACY bundle booking — born before migration 306: a snapshot with no prices, completions in jsonb, NO rows. */
async function legacyBundleBooking(completions: Record<string, string>): Promise<string> {
  const id = `bcs-${RUN}-legacy-${crypto.randomUUID().slice(0, 6)}`;
  const details = {
    bundleComponents: COMPONENTS.map((c) => ({ id: c.id, serviceName: c.serviceName })),
    componentCompletions: completions,
  };
  await db.execute(sql`
    INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, status,
                                  total_amount, platform_fee, provider_earnings,
                                  confirmed_at, booking_details, stripe_payment_intent_id)
    VALUES (${id}, ${ids.bundle}, ${ids.traveler}, ${ids.provider}, 'confirmed',
            '100.00', '25.00', '75.00',
            NOW() - interval '10 days', ${JSON.stringify(details)}::jsonb, ${`pi_${RUN}_${id}`})
  `);
  createdBookingIds.push(id);
  return id;
}

async function readBooking(id: string): Promise<any> {
  const r = await db.execute(sql`
    SELECT status, completed_at, total_amount, platform_fee, provider_earnings, booking_details
      FROM service_bookings WHERE id = ${id}
  `);
  return r.rows[0];
}

async function componentRows(bookingId: string) {
  return readBundleComponentRows(db, bookingId);
}

/** Every ledger row the completion mint can write for one booking, counted together. */
async function mintedRowCount(bookingId: string): Promise<number> {
  const r = await db.execute(sql`
    SELECT (SELECT COUNT(*) FROM provider_earnings WHERE source_id = ${bookingId})
         + (SELECT COUNT(*) FROM platform_revenue WHERE source_id = ${bookingId})
         + (SELECT COUNT(*) FROM expert_earnings WHERE reference_id = ${bookingId}) AS n
  `);
  return Number((r.rows[0] as any).n);
}

async function mintedAmounts(bookingId: string) {
  const pe = await db.execute(sql`SELECT amount FROM provider_earnings WHERE source_id = ${bookingId}`);
  const pr = await db.execute(sql`SELECT gross_amount, platform_fee, provider_earnings FROM platform_revenue WHERE source_id = ${bookingId} AND gross_amount >= 0`);
  const ee = await db.execute(sql`SELECT amount FROM expert_earnings WHERE reference_id = ${bookingId}`);
  return {
    providerEarning: (pe.rows[0] as any)?.amount ?? null,
    revenue: (pr.rows[0] as any) ?? null,
    expertEarning: (ee.rows[0] as any)?.amount ?? null,
  };
}

const actor = "provider_bundle_components" as const;

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.provider}, ${`bcs-${RUN}-prov@t.test`}, 'Bcs', 'Provider', 'service_provider')
  `);
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.traveler}, ${`bcs-${RUN}-trav@t.test`}, 'Bcs', 'Traveler')
  `);
  for (const c of COMPONENTS) {
    await db.execute(sql`
      INSERT INTO provider_services (id, user_id, service_name, description, price, status,
                                     approval_status, delivery_method)
      VALUES (${c.id}, ${ids.provider}, ${c.serviceName}, 'fixture component', ${c.price}, 'active',
              'approved', 'in_person')
    `);
  }
  // The BUNDLE listing (product_shape = 'bundle' ⇒ completion rule `bundle_components`), priced BELOW
  // the sum of its components (100.00 vs 40+40+20) — a discount is the ordinary case (D-33).
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, status,
                                   approval_status, delivery_method, product_shape)
    VALUES (${ids.bundle}, ${ids.provider}, ${`Bcs bundle ${RUN}`}, 'fixture bundle', '100.00', 'active',
            'approved', 'in_person', 'bundle')
  `);
  for (const [i, c] of COMPONENTS.entries()) {
    await db.execute(sql`
      INSERT INTO bundle_components (id, bundle_service_id, component_service_id, position)
      VALUES (${`bcs-${RUN}-bc-${i}`}, ${ids.bundle}, ${c.id}, ${i})
    `);
  }
  // D-51 (ledger `2026-09-16-bundle-partial-settlement`): reaching `partially_completed` now also runs
  // the MONEY LEG (one Stripe refund through the shared issuer). This suite proves the FLIP and the
  // MINT; the settlement has its own proofs (bundle-partial-settlement.db.test.ts). Stub the shared
  // prototype so no test here ever dials Stripe.
  stripeRefundsProto.create = async (params: any) => ({
    id: `re_bcs_${RUN}_${crypto.randomUUID().slice(0, 6)}`,
    status: "succeeded",
    amount: params?.amount,
    metadata: params?.metadata,
  });
});

// Every `new Stripe()` shares this prototype (the traveler-fee-refund suite's recipe).
const stripeRefundsProto = Object.getPrototypeOf(new Stripe("sk_test_dummy").refunds);
const originalStripeRefundsCreate = stripeRefundsProto.create;

after(async () => {
  stripeRefundsProto.create = originalStripeRefundsCreate;
  for (const id of createdBookingIds) {
    await db.execute(sql`DELETE FROM refunds WHERE booking_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM provider_earnings WHERE source_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM expert_earnings WHERE reference_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM platform_revenue WHERE source_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM notifications WHERE related_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {}); // rows CASCADE
  }
  await db.execute(sql`DELETE FROM bundle_components WHERE bundle_service_id = ${ids.bundle}`).catch(() => {});
  for (const svc of [ids.bundle, ids.compA, ids.compB, ids.compC]) {
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${svc}`).catch(() => {});
    await db.execute(sql`DELETE FROM provider_services WHERE id = ${svc}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.provider}, ${ids.traveler})`).catch(() => {});
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// C1 — BIRTH: the checkout composer births one row per component WITH the server-derived price
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("C1 (D-32/D-33): the checkout claim's composer births one `pending` row per snapshot entry, carrying the SERVER-DERIVED price in cents", async () => {
  const bk = await bornBundleBooking();
  const rows = await componentRows(bk);
  assert.equal(rows.length, 3, "one row per component, in the SAME transaction as the booking row");
  assert.deepEqual(
    rows.map((r) => ({ id: r.componentServiceId, status: r.status, cents: r.snapshotPriceCents, position: r.position, name: r.serviceName })),
    COMPONENTS.map((c, i) => ({ id: c.id, status: "pending", cents: c.priceCents, position: i, name: c.serviceName })),
  );
  assert.ok(rows.every((r) => r.completedAt === null && r.failedAt === null), "§13: nothing is stamped at birth");

  // THE PRICE IS THE CATALOG'S, READ IN THE CHECKOUT'S OWN SELECT — never a body's. Pinned on the
  // comments-stripped source: the snapshot loop selects `providerServices.price` and derives
  // `priceCents` from it, and `req.body` appears nowhere in that block.
  const checkout = code("server/routes/payments.routes.ts");
  const start = checkout.indexOf("const bundleSnapshots = new Map");
  const end = checkout.indexOf("bundleSnapshots.set(", start);
  const block = checkout.slice(start, end);
  assert.ok(start > 0 && end > start, "the bundle snapshot block exists");
  assert.match(block, /price:\s*providerServices\.price/, "D-33: the component price is selected from the catalog row");
  assert.doesNotMatch(block, /req\.body/, "§14: no request body reaches the snapshot");
  assert.match(checkout.slice(end, end + 600), /priceCents:\s*cents/, "the snapshot carries `priceCents`, derived server-side");

  // The eligibility reader answers from the ROWS and SAYS so (§13).
  const e = await resolveCompletionEligibility(bk);
  assert.equal(e.rule, "bundle_components");
  assert.equal(e.eligible, false);
  assert.equal(e.reason, "bundle_components_incomplete");
  assert.equal((e.evidence as any).componentStateSource, "rows");
  assert.deepEqual((e.evidence as any).missingComponentIds, COMPONENTS.map((c) => c.id));
});

test("C1b (§19/§19d): the CLIENT-FACING birth rail strips the snapshot key and births NO component rows; the checkout composer is the ONE exemption", async () => {
  // A body that plants its own component list and prices through the request rail's writer.
  const planted = await storage.createServiceBookingAtomic({
    serviceId: ids.bundle,
    travelerId: ids.traveler,
    providerId: ids.provider,
    status: "pending",
    totalAmount: "100.00",
    platformFee: "25.00",
    providerEarnings: "75.00",
    bookingDetails: {
      notes: "legit",
      bundleComponents: [{ id: ids.compA, serviceName: "planted", priceCents: 1 }],
      componentCompletions: { [ids.compA]: new Date().toISOString() },
    },
  } as any);
  createdBookingIds.push(planted.id);
  const row = await readBooking(planted.id);
  assert.equal("bundleComponents" in (row.booking_details ?? {}), false, "the planted snapshot never reaches the row");
  assert.equal("componentCompletions" in (row.booking_details ?? {}), false, "nor does a planted completion map");
  assert.equal(row.booking_details?.notes, "legit", "the strip is not a rejection");
  assert.equal((await componentRows(planted.id)).length, 0, "no rows are born from a body");
  // The denylist names both keys (B7 in booking-birth-provenance pins the whole set).
  assert.ok((SERVER_AUTHORED_BOOKING_DETAIL_KEYS as readonly string[]).includes("bundleComponents"));
  assert.ok((SERVER_AUTHORED_BOOKING_DETAIL_KEYS as readonly string[]).includes("componentCompletions"));
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// C2 — §15: a component flip is ONE row under a double call
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("C2 (§15): a CONCURRENT double component completion is exactly ONE row flip — the second caller is told `alreadyRecorded`, completed_at is stamped once", async () => {
  const bk = await bornBundleBooking();
  const [a, b] = await Promise.all([
    recordBundleComponentCompletion({ bookingId: bk, componentServiceId: ids.compA, actor }),
    recordBundleComponentCompletion({ bookingId: bk, componentServiceId: ids.compA, actor }),
  ]);
  assert.ok(a.recorded && b.recorded, "both calls are a successful record of the SAME fact");
  assert.equal([a, b].filter((r) => r.alreadyRecorded).length, 1, "exactly one caller found the row already flipped");
  assert.equal(a.completed, false);
  assert.equal(a.partiallyCompleted, false);
  assert.equal(a.componentStateSource, "rows");

  const rows = await componentRows(bk);
  const rowA = rows.find((r) => r.componentServiceId === ids.compA)!;
  assert.equal(rowA.status, "completed");
  assert.ok(rowA.completedAt, "completed_at is stamped in the SAME guarded UPDATE");
  assert.equal(rows.filter((r) => r.status === "completed").length, 1, "one component moved, the other two are untouched");
  const firstStamp = String(rowA.completedAt);

  // A THIRD, sequential call re-reads the same fact and never re-stamps.
  const again = await recordBundleComponentCompletion({ bookingId: bk, componentServiceId: ids.compA, actor });
  assert.equal(again.recorded, true);
  assert.equal(again.alreadyRecorded, true);
  assert.equal(String((await componentRows(bk)).find((r) => r.componentServiceId === ids.compA)!.completedAt), firstStamp);

  // Parent untouched: still confirmed, nothing minted, the legacy jsonb map NOT written (new writes go to rows).
  const parent = await readBooking(bk);
  assert.equal(parent.status, "confirmed");
  assert.equal(await mintedRowCount(bk), 0);
  assert.equal(parent.booking_details?.componentCompletions, undefined, "D-32: the legacy map is written no more");

  // A component cannot be FAILED over a delivery, and the refusal names the state that refused it.
  const failOverDone = await recordBundleComponentFailure({ bookingId: bk, componentServiceId: ids.compA, actor });
  assert.equal(failOverDone.recorded, false);
  assert.equal((failOverDone.evidence as any).componentStatus, "completed");

  // Never invent a component.
  const unknown = await recordBundleComponentCompletion({ bookingId: bk, componentServiceId: `${ids.compA}-not-in-bundle`, actor });
  assert.equal(unknown.recorded, false);
  assert.equal(unknown.unknownComponent, true);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// C3 — D-34: `partially_completed` is reached EXACTLY when ruled
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("C3 (D-34): two delivered + one FAILED ⇒ `partially_completed`, the failed component NAMED, completed_at NOT stamped, total_amount NOT rewritten", async () => {
  const bk = await bornBundleBooking();
  const a = await recordBundleComponentCompletion({ bookingId: bk, componentServiceId: ids.compA, actor });
  const b = await recordBundleComponentCompletion({ bookingId: bk, componentServiceId: ids.compB, actor });
  assert.equal(a.partiallyCompleted, false);
  assert.equal(b.partiallyCompleted, false);
  assert.equal((await readBooking(bk)).status, "confirmed", "two of three delivered is still `confirmed` — the state needs every answer");

  const fail = await recordBundleComponentFailure({ bookingId: bk, componentServiceId: ids.compC, actor, reason: "venue closed" });
  assert.equal(fail.recorded, true, `expected the failure recorded, got ${fail.reason} ${JSON.stringify(fail.evidence)}`);
  assert.equal(fail.partiallyCompleted, true, "the last answer was a failure beside two deliveries ⇒ the partial flip");
  assert.equal(fail.reason, undefined);

  const parent = await readBooking(bk);
  assert.equal(parent.status, PARTIALLY_COMPLETED_STATUS);
  assert.equal(parent.completed_at, null, "NOT completed — `completed` still means EVERY component (brief §2 rule 2)");
  assert.equal(parent.total_amount, "100.00", "brief §2 rule 5: total_amount is NEVER rewritten by a partial outcome");
  const completion = parent.booking_details?.completion;
  assert.equal(completion?.partial, true);
  assert.equal(completion?.outcome, PARTIALLY_COMPLETED_STATUS);
  assert.deepEqual(completion?.failedComponentIds, [ids.compC], "WHICH component failed is on the row");
  assert.deepEqual(
    completion?.evidence?.undeliveredComponents,
    [{ id: ids.compC, serviceName: COMPONENTS[2].serviceName, status: "failed" }],
    "brief §4: the failed component is named by the name it was bought under, never a count",
  );
  assert.equal(completion?.evidence?.componentStateSource, "rows");
  const rowC = (await componentRows(bk)).find((r) => r.componentServiceId === ids.compC)!;
  // LD 50 remainder (ledger `2026-09-17-ld50-remainder-and-artifact-refund`): the D-51 settlement that
  // follows this flip now stamps `refunded` on the component whose allocation it refunded — that status
  // finally has a writer. The seller's answer is NOT lost: `failed_at` and `failure_reason` are still the
  // record of WHO said it would not be delivered and why, and the completion evidence above still names
  // the component with `status: "failed"` as the derivation saw it at the flip.
  assert.equal(rowC.status, "refunded");
  assert.ok(rowC.failedAt);
  assert.equal(rowC.failureReason, "venue closed");
  assert.equal(rowC.refundAmountCents, 2000);

  // The state is TERMINAL for this lane's writers: a further component write is refused by the parent guard.
  const late = await recordBundleComponentFailure({ bookingId: bk, componentServiceId: ids.compA, actor });
  assert.equal(late.recorded, false);
  assert.equal(late.reason, "wrong_status");
});

test("C3b (D-34): the SAME state is reached through the completion rail when the failure came first — and `completed` is untouched when every component delivers", async () => {
  // Failure first, then the last delivery flips the parent through recordBundleComponentCompletion.
  const bk = await bornBundleBooking();
  const fail = await recordBundleComponentFailure({ bookingId: bk, componentServiceId: ids.compC, actor });
  assert.equal(fail.recorded, true);
  assert.equal(fail.partiallyCompleted, false, "one failed, two pending: nothing flips yet");
  assert.equal(fail.reason, "bundle_components_incomplete");
  await recordBundleComponentCompletion({ bookingId: bk, componentServiceId: ids.compA, actor });
  assert.equal((await readBooking(bk)).status, "confirmed");
  const last = await recordBundleComponentCompletion({ bookingId: bk, componentServiceId: ids.compB, actor });
  assert.equal(last.recorded, true);
  assert.equal(last.completed, false, "not `completed` — one component failed");
  assert.equal(last.partiallyCompleted, true);
  assert.equal((await readBooking(bk)).status, PARTIALLY_COMPLETED_STATUS);

  // EVERY component delivered ⇒ the EXISTING flip and the EXISTING full mint, byte-for-byte.
  const full = await bornBundleBooking();
  await recordBundleComponentCompletion({ bookingId: full, componentServiceId: ids.compA, actor });
  await recordBundleComponentCompletion({ bookingId: full, componentServiceId: ids.compB, actor });
  const done = await recordBundleComponentCompletion({ bookingId: full, componentServiceId: ids.compC, actor });
  assert.equal(done.completed, true);
  assert.equal(done.partiallyCompleted, false, "stated, not omitted");
  const fullRow = await readBooking(full);
  assert.equal(fullRow.status, "completed");
  assert.ok(fullRow.completed_at);
  assert.equal(fullRow.booking_details?.completion?.partial, undefined);
  assert.equal((await mintedAmounts(full)).providerEarning, "75.00", "the full mint over the row's full figures");
});

test("C3c (D-34): EVERY component failed ⇒ the D-34 PARTIAL flip is still refused — and since 2026-09-17 the parent is CANCELLED instead, never left `confirmed`", async () => {
  const bk = await bornBundleBooking();
  let last: Awaited<ReturnType<typeof recordBundleComponentFailure>> | undefined;
  for (const c of COMPONENTS) {
    last = await recordBundleComponentFailure({ bookingId: bk, componentServiceId: c.id, actor });
    assert.equal(last.recorded, true);
    assert.equal(last.partiallyCompleted, false, "`partially_completed` still means SOME component was delivered");
  }
  // The D-34 derivation is UNCHANGED: this is `all_undelivered`, taken by the ONE derivation before the
  // parent moved, and it is NOT the partial rail's case. What changed (ledger
  // `2026-09-17-all-undelivered-parent`) is that the ONE component writer now CANCELS the parent for it
  // and releases the booking's claimed slot units once, instead of leaving a live row holding capacity
  // until a human acted. The full proof of that rail — cause, release, settlement, retry, concurrency —
  // is `server/__tests__/bundle-all-undelivered.db.test.ts` (U1-U8); this pins only that D-34 itself did
  // not widen, and that nothing minted.
  assert.equal(last!.parentOutcome, "all_undelivered");
  assert.equal(await mintedRowCount(bk), 0, "nothing was delivered, nothing mints — a cancelled parent mints nothing either");
  const settle = await settleBundlePartialCompletion({ bookingId: bk, actor });
  assert.equal(settle.settled, false, "the PARTIAL settle path never settles a bundle with no delivered component");
  const parent = await readBooking(bk);
  assert.equal(parent.status, "cancelled", "the all-undelivered parent rail owns the whole row now");
  assert.equal(parent.booking_details?.allUndelivered?.cause, "seller_failed");
  // And a DECIDED row is no longer a completion candidate at all — the resolver says so by name.
  const e = await resolveCompletionEligibility(bk);
  assert.equal(e.reason, "wrong_status");
  assert.equal((e.evidence as any).status, "cancelled");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// C4 — D-35: ONE mint over REDUCED figures, and a second run mints NOTHING
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("C4 (D-35): the partial flip mints ONCE over the REDUCED figures (pro-rata over the snapshot), and every second run mints nothing", async () => {
  const bk = await bornBundleBooking();
  await recordBundleComponentCompletion({ bookingId: bk, componentServiceId: ids.compA, actor });
  await recordBundleComponentCompletion({ bookingId: bk, componentServiceId: ids.compB, actor });
  const fail = await recordBundleComponentFailure({ bookingId: bk, componentServiceId: ids.compC, actor });
  assert.equal(fail.partiallyCompleted, true);

  // Component C = 2000 of 10000 snapshot cents ⇒ kept 0.8 ⇒ 100.00 → 80.00, 25.00 → 20.00, 75.00 → 60.00.
  const minted = await mintedAmounts(bk);
  assert.equal(minted.providerEarning, "60.00", "the provider's held earning is the DELIVERED share of the row's own provider_earnings");
  assert.equal(minted.expertEarning, "60.00");
  assert.equal(minted.revenue?.gross_amount, "80.00");
  assert.equal(minted.revenue?.platform_fee, "20.00", "the platform fee is the row's own fee scaled by the same share — no re-resolved band, no literal");
  assert.equal(minted.revenue?.provider_earnings, "60.00");
  assert.equal(await mintedRowCount(bk), 3, "ONE set: provider_earnings + platform_revenue + expert_earnings — never per component");
  const reduced = (await readBooking(bk)).booking_details?.completion?.evidence?.reduced;
  assert.deepEqual(
    { gross: reduced?.grossAmount, fee: reduced?.platformFee, earnings: reduced?.providerEarnings, deducted: reduced?.deductedAmount, kept: reduced?.keptFraction },
    { gross: "80.00", fee: "20.00", earnings: "60.00", deducted: "20.00", kept: 0.8 },
    "the reduction is RECORDED on the row beside the mint it produced",
  );

  // Second runs: the settle path is refused (wrong from-state), the mint is refused by the indexes.
  const again = await settleBundlePartialCompletion({ bookingId: bk, actor });
  assert.equal(again.settled, false);
  const fresh = await storage.getServiceBooking(bk);
  const remint = await storage.mintCompletionEarningsForBooking(fresh!);
  assert.equal(remint, false, "migration 203's one-row-per-booking indexes refuse a second mint");
  assert.equal(await mintedRowCount(bk), 3);
  assert.equal((await mintedAmounts(bk)).providerEarning, "60.00", "and the amounts did not move");

  // The from-state list is the guard: `partially_completed` is entered from `confirmed` only.
  assert.deepEqual([...PARTIAL_COMPLETION_FROM_STATUSES], ["confirmed"]);
});

test("C4b (§13): a bundle with an UNPRICED component can NOT be partially completed — the flip is refused, the parent stays confirmed, nothing mints", async () => {
  const bk = await bornBundleBooking();
  // A pre-D-33 shaped entry for C: no price captured — and therefore (D-51, migration 307) no
  // ALLOCATION either, since the allocation is derived from the snapshot prices at birth. Both columns
  // are nulled: a row whose allocation survived would be settled on the CONTRACT fact by design
  // (SP4 pins that), which is not the case this proof is about.
  await db.execute(sql`UPDATE booking_component_states SET snapshot_price_cents = NULL, allocation_cents = NULL WHERE booking_id = ${bk} AND component_service_id = ${ids.compC}`);
  await recordBundleComponentCompletion({ bookingId: bk, componentServiceId: ids.compA, actor });
  await recordBundleComponentCompletion({ bookingId: bk, componentServiceId: ids.compB, actor });
  const fail = await recordBundleComponentFailure({ bookingId: bk, componentServiceId: ids.compC, actor });
  assert.equal(fail.recorded, true, "the FAILURE is recorded — it is a fact about the component");
  assert.equal(fail.partiallyCompleted, false, "but the parent does not flip on a share nobody can derive");
  assert.equal(fail.reason, "component_prices_unknown");
  assert.equal((fail.evidence as any).reducedFiguresRefused, "component_price_unknown");
  const parent = await readBooking(bk);
  assert.equal(parent.status, "confirmed", "handed to a human, never a guessed fraction");
  assert.equal(await mintedRowCount(bk), 0);
  // The second layer: even a direct flip attempt cannot land without its reduced mint.
  await assert.rejects(
    storage.updateServiceBookingStatus(bk, PARTIALLY_COMPLETED_STATUS, "test", PARTIAL_COMPLETION_FROM_STATUSES),
    /reduced figures cannot be derived/,
    "the mint throws inside the flip's transaction",
  );
  assert.equal((await readBooking(bk)).status, "confirmed", "so the flip rolled back");
  assert.equal(await mintedRowCount(bk), 0);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// C5 — the LEGACY jsonb is still read, the source NAMED, and it can never become partial
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("C5 (§13, no backfill): a bundle born BEFORE migration 306 is read from `componentCompletions`, the reader SAYS so, a failure is refused, and the last delivery still completes it in full", async () => {
  const bk = await legacyBundleBooking({ [ids.compA]: new Date().toISOString(), [ids.compB]: new Date().toISOString() });
  assert.equal((await componentRows(bk)).length, 0, "no rows were manufactured for a legacy booking");

  const e = await resolveCompletionEligibility(bk);
  assert.equal(e.reason, "bundle_components_incomplete");
  assert.equal((e.evidence as any).componentStateSource, "legacy_jsonb", "the reader NAMES the source it read");
  assert.deepEqual((e.evidence as any).completedComponentIds, [ids.compA, ids.compB]);
  assert.deepEqual((e.evidence as any).missingComponentIds, [ids.compC]);

  const fail = await recordBundleComponentFailure({ bookingId: bk, componentServiceId: ids.compC, actor });
  assert.equal(fail.recorded, false);
  assert.equal(fail.reason, "bundle_component_states_unavailable", "the jsonb never held FAILED; a legacy bundle keeps the all-or-nothing rule");
  assert.equal(fail.componentStateSource, "legacy_jsonb");

  const last = await recordBundleComponentCompletion({ bookingId: bk, componentServiceId: ids.compC, actor });
  assert.equal(last.recorded, true);
  assert.equal(last.componentStateSource, "legacy_jsonb");
  assert.equal(last.completed, true, "the legacy write path is byte-for-byte the pre-306 jsonb merge, then the ONE completion");
  const parent = await readBooking(bk);
  assert.equal(parent.status, "completed");
  assert.ok(parent.booking_details?.componentCompletions?.[ids.compC], "the legacy map IS written for a legacy booking");
  assert.equal((await mintedAmounts(bk)).providerEarning, "75.00", "a legacy bundle mints the full figures — it has no prices to reduce by");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// C6 — the lists that learned `partially_completed`, and the ones that deliberately did not
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("C6 (D-34): the status joins the PAID lists and the invariant's SQL, does NOT join the terminal, disputable or timer-candidate lists, and has one label", () => {
  const recon = code("server/jobs/stripeReconciliation.ts");
  const paid = recon.match(/const PAID_EQUIVALENT_STATUSES = \[([^\]]*)\]/)?.[1] ?? "";
  const terminal = recon.match(/const TERMINAL_STATUSES = \[([^\]]*)\]/)?.[1] ?? "";
  assert.match(paid, /"partially_completed"/, "§17 must see a partially completed bundle as PAID");
  assert.doesNotMatch(terminal, /partially_completed/, "and never as TERMINAL — it still owes a component refund");

  const invariants = code("scripts/invariants.mjs");
  const inv = invariants.slice(invariants.indexOf("paid-service-bookings-have-payment-intent"));
  assert.match(inv.slice(0, 1500), /WHERE status IN \('confirmed', 'completed', 'partially_completed', 'disputed'\)/, "the money-integrity invariant names the state");

  assert.deepEqual([...COMPLETION_ALLOWED_FROM_STATUSES], ["confirmed"], "the timer's candidate predicate is NOT widened — a partial bundle has no pending component left to complete");
  assert.equal(DISPUTABLE_FROM_STATUSES.includes(PARTIALLY_COMPLETED_STATUS), false, "not ruled disputable; DISPUTE_REJECT restores to `completed`, which would misstate a partial");
  assert.ok((TRANSACTED_BOOKING_STATUSES as readonly string[]).includes(PARTIALLY_COMPLETED_STATUS), "money history — a listing with one cannot be deleted");

  assert.deepEqual(readPurchaseStatus(PARTIALLY_COMPLETED_STATUS), { kind: "booked", label: "Booked · partially completed" });

  // The owner rail's body is a `.strict()` pick admitting a component id and a reason — never a status or a price.
  const routes = code("server/routes.ts");
  const bodyStart = routes.indexOf("const componentFailureBody = z");
  const body = routes.slice(bodyStart, routes.indexOf(".strict()", bodyStart) + 9);
  assert.ok(bodyStart > 0, "the component-failed rail exists");
  assert.match(body, /componentServiceId: z\.string\(\)/);
  assert.match(body, /reason: z\.string\(\)/);
  assert.doesNotMatch(body, /status|price|amount|cents|At:/i, "§19: nothing money- or state-bearing is admissible from the body");
  assert.ok(body.endsWith(".strict()"), "an unknown key is REFUSED, not stripped");
  assert.equal((routes.match(/\/api\/(provider|expert)\/bookings\/:id\/component-failed/g) ?? []).length, 2, "mounted on both owner paths");
});
