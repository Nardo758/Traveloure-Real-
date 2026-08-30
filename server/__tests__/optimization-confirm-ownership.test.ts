/**
 * Focused regression coverage for optimization PaymentIntent ownership.
 *
 * The Stripe PaymentIntents resource is patched before the route is imported, so these tests
 * execute the real confirm handler without making a Stripe network request.
 *
 * Run with:
 *   npx tsx --test server/__tests__/optimization-confirm-ownership.test.ts
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";

process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://localhost:5432/traveloure_test";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_dummy";

type FakeIntent = {
  id: string;
  status: "succeeded";
  amount: number;
  currency: string;
  metadata: Record<string, string>;
};

let intent: FakeIntent;
let stripeRetrievals = 0;
const stripeProbe = new Stripe("sk_test_dummy");
const paymentIntentsPrototype = Object.getPrototypeOf(stripeProbe.paymentIntents);
const originalRetrieve = paymentIntentsPrototype.retrieve;
paymentIntentsPrototype.retrieve = async () => {
  stripeRetrievals += 1;
  return intent;
};

const { default: optimizationRouter } = await import("../routes/optimization.routes");
const { db } = await import("../db");
const { revenueTrackingService } = await import("../services/revenue-tracking.service");

const confirmLayer = (optimizationRouter as any).stack.find(
  (layer: any) => layer.route?.path === "/api/optimization-payments/confirm",
);
assert.ok(confirmLayer, "real optimization confirmation route must be mounted on the router");
const confirmHandler = confirmLayer.route.stack.at(-1).handle as Function;

const originalDbSelect = db.select;
const originalDbUpdate = db.update;
const originalDbInsert = db.insert;
const originalRecordRevenueEvent = revenueTrackingService.recordRevenueEvent;

let dbReads = 0;
let dbWrites = 0;
let revenueWrites = 0;

before(() => {
  (db as any).select = () => {
    dbReads += 1;
    return {
      from: () => ({
        where: () => ({
          limit: async () => [{ id: "already-recorded" }],
        }),
      }),
    };
  };
  (db as any).update = () => {
    dbWrites += 1;
    throw new Error("unexpected DB update");
  };
  (db as any).insert = () => {
    dbWrites += 1;
    throw new Error("unexpected DB insert");
  };
  (revenueTrackingService as any).recordRevenueEvent = async () => {
    revenueWrites += 1;
    throw new Error("unexpected revenue write");
  };
});

after(() => {
  paymentIntentsPrototype.retrieve = originalRetrieve;
  (db as any).select = originalDbSelect;
  (db as any).update = originalDbUpdate;
  (db as any).insert = originalDbInsert;
  (revenueTrackingService as any).recordRevenueEvent = originalRecordRevenueEvent;
});

async function confirmAs(metadata: Record<string, string>) {
  intent = {
    id: "pi_optimization_ownership_test",
    status: "succeeded",
    amount: 599,
    currency: "usd",
    metadata: { type: "optimization_fee", eventType: "vacation", ...metadata },
  };
  stripeRetrievals = 0;
  dbReads = 0;
  dbWrites = 0;
  revenueWrites = 0;

  const req = {
    user: { claims: { sub: "session-user" } },
    body: { paymentIntentId: intent.id },
  };
  let statusCode = 200;
  let responseBody: any;
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(body: any) {
      responseBody = body;
      return this;
    },
  };

  await confirmHandler(req, res);
  return { statusCode, responseBody };
}

test("missing metadata.userId is forbidden before any DB or revenue mutation", async () => {
  const result = await confirmAs({});

  assert.equal(result.statusCode, 403);
  assert.equal(result.responseBody.error, "payment_belongs_to_another_user");
  assert.equal(stripeRetrievals, 1, "the stubbed Stripe intent must be verified");
  assert.equal(dbReads, 0, "ownership must fail before DB access");
  assert.equal(dbWrites, 0);
  assert.equal(revenueWrites, 0);
  console.log(JSON.stringify({ audit: "optimization-confirm-ownership", endpoint: "POST /api/optimization-payments/confirm", case: "missing-user-id" }));
});

test("another user's metadata.userId is forbidden before any DB or revenue mutation", async () => {
  const result = await confirmAs({ userId: "another-user" });

  assert.equal(result.statusCode, 403);
  assert.equal(result.responseBody.error, "payment_belongs_to_another_user");
  assert.equal(stripeRetrievals, 1, "the stubbed Stripe intent must be verified");
  assert.equal(dbReads, 0, "ownership must fail before DB access");
  assert.equal(dbWrites, 0);
  assert.equal(revenueWrites, 0);
  console.log(JSON.stringify({ audit: "optimization-confirm-ownership", endpoint: "POST /api/optimization-payments/confirm", case: "wrong-user-id" }));
});

test("same-user metadata proceeds to the intended idempotency check", async () => {
  const result = await confirmAs({ userId: "session-user" });

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.responseBody, { success: true });
  assert.equal(stripeRetrievals, 1, "the stubbed Stripe intent must be verified");
  assert.equal(dbReads, 1, "same-user confirmation must reach the revenue idempotency query");
  assert.equal(dbWrites, 0, "the existing-revenue fixture requires no DB mutation");
  assert.equal(revenueWrites, 0, "an already-recorded intent must not duplicate revenue");
  console.log(JSON.stringify({ audit: "optimization-confirm-ownership", endpoint: "POST /api/optimization-payments/confirm", case: "same-user" }));
});