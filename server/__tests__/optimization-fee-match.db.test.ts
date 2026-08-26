/**
 * optimization-fee-match.db.test.ts
 *
 * Regression proof that the optimizer fee shown by the preview and returned by the payment
 * endpoint is the same server-resolved amount sent to Stripe, including after an admin edits the
 * `optimization_fees` row. The payment handler is the real Express route handler; only Stripe's
 * PaymentIntent creation and customer lookup are stubbed, so this test never makes a network
 * request or charges a real card.
 *
 * Run with:
 *   npx tsx --test server/__tests__/optimization-fee-match.db.test.ts
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Stripe from "stripe";
import { sql } from "drizzle-orm";

process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://localhost:5432/traveloure_test";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_dummy";

const RUN = crypto.randomUUID().slice(0, 8);
const EVENT = `zz-fee-match-${RUN}`;
const USER_ID = `optimizer-fee-user-${RUN}`;
const TRIP_ID = `optimizer-fee-trip-${RUN}`;
const ITEM_ID = `optimizer-fee-item-${RUN}`;

// ── Disposable-DB guard (mirrors optimization-fee-determinism.db.test.ts; never defaults open) ──
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
let disposableDbConfirmed = false;

async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") {
    disposableDbConfirmed = true;
    return;
  }

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
      `[optimization-fee-match] REFUSING to write fixtures: DATABASE_URL host ` +
        `'${host ?? "<none>"}' is not a recognized disposable dev/CI database. ` +
        `Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1. Never against prod.`,
    );
  }
  disposableDbConfirmed = true;
}

async function clearFixtures(): Promise<void> {
  await db.execute(sql`DELETE FROM itinerary_items WHERE id = ${ITEM_ID}`);
  await db.execute(sql`DELETE FROM trips WHERE id = ${TRIP_ID}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${USER_ID}`);
  await db.execute(sql`DELETE FROM optimization_fees WHERE event_type = ${EVENT}`);
}

async function seedFixtures(priceCents: number): Promise<void> {
  await db.execute(sql`
    INSERT INTO users (id, email, role)
    VALUES (${USER_ID}, ${`${USER_ID}@traveloure.test`}, 'user')
  `);
  await db.execute(sql`
    INSERT INTO trips (
      id, user_id, title, event_type, start_date, end_date, destination, status
    )
    VALUES (
      ${TRIP_ID}, ${USER_ID}, 'Optimizer fee regression trip', ${EVENT},
      '2030-01-01', '2030-01-03', 'Kyoto', 'draft'
    )
  `);
  // A non-empty optimizer baseline keeps the payment route on its ordinary Stripe path rather
  // than the cart-conversion refusal introduced by fix #971.
  await db.execute(sql`
    INSERT INTO itinerary_items (id, trip_id, title, day_number, routing_status)
    VALUES (${ITEM_ID}, ${TRIP_ID}, 'Synthetic sightseeing item', 1, 'in_planning')
  `);
  await db.execute(sql`
    INSERT INTO optimization_fees (
      id, complexity_tier, event_type, price_cents, currency,
      is_active, is_disabled, created_at, updated_at
    )
    VALUES (
      ${crypto.randomUUID()}, 'simple', ${EVENT}, ${priceCents}, 'USD',
      true, false, NOW(), NOW()
    )
  `);
}

async function configuredFee(): Promise<number> {
  const result = await db.execute(sql`
    SELECT price_cents FROM optimization_fees
    WHERE event_type = ${EVENT} AND is_active = true
    ORDER BY updated_at DESC, id
    LIMIT 1
  `);
  const priceCents = Number((result.rows[0] as any)?.price_cents);
  assert.ok(Number.isFinite(priceCents), "the synthetic active optimization fee row must exist");
  return priceCents;
}

const stripeProbe = new Stripe("sk_test_dummy");
const paymentIntentsPrototype = Object.getPrototypeOf(stripeProbe.paymentIntents);
const originalCreate = paymentIntentsPrototype.create;
const stripeCreateParams: Array<Record<string, any>> = [];

paymentIntentsPrototype.create = async (params: Record<string, any>) => {
  stripeCreateParams.push(params);
  return {
    id: `pi_optimizer_fee_match_${stripeCreateParams.length}`,
    client_secret: `cs_optimizer_fee_match_${stripeCreateParams.length}`,
    amount: params.amount,
    currency: params.currency,
    status: "requires_payment_method",
    metadata: params.metadata,
  } as any;
};

const { db } = await import("../db");
const { stripePaymentService } = await import("../services/stripe-payment.service");
const { default: optimizationRouter } = await import("../routes/optimization.routes");

const previewLayer = (optimizationRouter as any).stack.find(
  (layer: any) => layer.route?.path === "/api/optimization-preview",
);
const paymentLayer = (optimizationRouter as any).stack.find(
  (layer: any) => layer.route?.path === "/api/optimization-payments",
);
assert.ok(previewLayer, "real optimizer preview route must be mounted on the router");
assert.ok(paymentLayer, "real optimizer payment route must be mounted on the router");
const previewHandler = previewLayer.route.stack.at(-1).handle as Function;
const paymentHandler = paymentLayer.route.stack.at(-1).handle as Function;

const originalGetOrCreateCustomer = stripePaymentService.getOrCreateCustomer;
stripePaymentService.getOrCreateCustomer = async () => null;

before(async () => {
  await assertDisposableDb();
  await clearFixtures();
  await seedFixtures(1299);
});

after(async () => {
  paymentIntentsPrototype.create = originalCreate;
  stripePaymentService.getOrCreateCustomer = originalGetOrCreateCustomer;
  if (disposableDbConfirmed) await clearFixtures();
});

function responseRecorder() {
  let statusCode = 200;
  let responseBody: any;
  return {
    res: {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(body: any) {
        responseBody = body;
        return this;
      },
    },
    result() {
      return { statusCode, responseBody };
    },
  };
}

async function previewFee() {
  const response = responseRecorder();
  await previewHandler(
    { body: { eventType: EVENT, items: [{ serviceType: "sightseeing", price: 100 }] } },
    response.res,
  );
  const result = response.result();
  assert.equal(result.statusCode, 200);
  return result.responseBody.feeCents as number;
}

async function paymentFee(bodyExtra: Record<string, unknown> = {}) {
  const response = responseRecorder();
  await paymentHandler(
    {
      user: { claims: { sub: USER_ID } },
      body: { tripId: TRIP_ID, comparisonContext: { destination: "Kyoto" }, ...bodyExtra },
    },
    response.res,
  );
  const result = response.result();
  assert.equal(result.statusCode, 200, JSON.stringify(result.responseBody));
  return result.responseBody.feeCents as number;
}

test("preview fee, payment response, and Stripe amount move together with the configured row", async () => {
  stripeCreateParams.length = 0;

  const initialPrice = await configuredFee();
  assert.equal(await previewFee(), initialPrice);
  assert.equal(await paymentFee(), initialPrice);
  assert.equal(stripeCreateParams.at(-1)?.amount, initialPrice);

  const editedPrice = 2875;
  await db.execute(sql`
    UPDATE optimization_fees
    SET price_cents = ${editedPrice}, updated_at = NOW()
    WHERE event_type = ${EVENT}
  `);
  const editedRowPrice = await configuredFee();

  assert.equal(await previewFee(), editedRowPrice);
  assert.equal(await paymentFee(), editedRowPrice);
  assert.equal(stripeCreateParams.at(-1)?.amount, editedRowPrice);
  assert.deepEqual(
    stripeCreateParams.map((params) => params.amount),
    [initialPrice, editedRowPrice],
    "each payment intent must receive the fee resolved for that request",
  );
});

test("a spoofed request amount cannot change the server-resolved or Stripe amount", async () => {
  const configuredPrice = await configuredFee();
  const createCountBefore = stripeCreateParams.length;

  const returnedFee = await paymentFee({
    amount: 1,
    amountCents: 1,
    fee: 1,
    feeCents: 1,
    price: 1,
    priceCents: 1,
  });

  assert.equal(returnedFee, configuredPrice);
  assert.equal(stripeCreateParams.length, createCountBefore + 1);
  assert.equal(stripeCreateParams.at(-1)?.amount, configuredPrice);
});
