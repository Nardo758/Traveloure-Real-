/**
 * Row 217 — HTTP proof that a post-payment pin failure is returned as the
 * comparison's failed state, and that both live handlers do that before they
 * start the optimizer.
 *
 * The in-process route calls the same `recordUnresolvedPaidPin` the monolith
 * returns. Stripe is stubbed. DISPOSABLE DB ONLY.
 *
 * Run: npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/paid-pin-fallback.http.test.ts
 */
process.env.STRIPE_SECRET_KEY ||= "sk_test_dummy_paid_pin_http";
process.env.SESSION_SECRET ||= "paid-pin-fallback-http";

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import Stripe from "stripe";
import { sql } from "drizzle-orm";

const { db } = await import("../db");
const { paidPinFellBack, recordUnresolvedPaidPin } = await import("../services/paid-pin-resolution");
const { resolveOptimizerPinnedAnchor } = await import("../services/anchor-candidates");

const RUN = crypto.randomUUID().slice(0, 8);
const CENTS = 1599;
const userId = `pph-${RUN}-user`;
const tripId = `pph-${RUN}-trip`;
const email = `pph-${RUN}@t.test`;
const pi = `pi_pph_${RUN}_paid`;
const failedId = `pph-${RUN}-failed`;
const autoId = `pph-${RUN}-auto`;

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb(): void {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  if (host === null || !DISPOSABLE_HOSTS.has(host)) {
    throw new Error(`[paid-pin-fallback-http] refusing to write fixtures on '${host ?? "<none>"}'`);
  }
}

const probe = new Stripe("sk_test_dummy");
const refundsProto = Object.getPrototypeOf(probe.refunds);
const intentsProto = Object.getPrototypeOf(probe.paymentIntents);
const originalRefundCreate = refundsProto.create;
const originalIntentRetrieve = intentsProto.retrieve;
intentsProto.retrieve = async (id: string) => {
  if (id !== pi) throw new Error(`No such PaymentIntent (stub): ${id}`);
  return {
    id,
    status: "succeeded",
    amount: CENTS,
    amount_refunded: 0,
    currency: "usd",
    metadata: { type: "optimization_fee" },
  };
};
refundsProto.create = async (params: { amount: number }) => ({
  id: `re_${RUN}_http`,
  status: "succeeded",
  amount: params.amount,
  currency: "usd",
  charge: "ch_stub",
});

let server: http.Server;

function request(method: string, urlPath: string, body?: unknown): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const headers: Record<string, string | number> = {};
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    const req = http.request(
      { hostname: "127.0.0.1", port: addr.port, path: urlPath, method, headers },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => { raw += chunk; });
        res.on("end", () => {
          let data: unknown = raw;
          try { data = raw ? JSON.parse(raw) : null; } catch { /* keep text */ }
          resolve({ status: res.statusCode ?? 0, data });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

before(async () => {
  assertDisposableDb();
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${userId}, ${email}, 'user')`);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, start_date, end_date, destination)
    VALUES (${tripId}, ${userId}, 'Pin http', '2030-04-01', '2030-04-05', 'Kyoto')
  `);
  await db.execute(sql`
    INSERT INTO itinerary_comparisons (id, user_id, trip_id, status, optimization_payment_id, title, destination)
    VALUES
      (${failedId}, ${userId}, ${tripId}, 'generated', ${pi}, 'Paid pin', 'Kyoto'),
      (${autoId}, ${userId}, ${tripId}, 'generated', ${pi}, 'No pin', 'Kyoto')
  `);

  const app = express();
  app.use(express.json());
  // Same branch the live create and generate handlers take after payment:
  // a null resolution of a supplied pin is recorded and returned failed.
  app.post("/api/itinerary-comparisons/:id/generate", async (req, res) => {
    const rawPin = req.body?.pinnedAnchor;
    const resolved = await resolveOptimizerPinnedAnchor(rawPin, [], async () => null);
    if (paidPinFellBack(rawPin, resolved)) {
      const failed = await recordUnresolvedPaidPin(req.params.id);
      return res.status(200).json(failed);
    }
    return res.status(200).json({ status: "generating", message: "Optimization started" });
  });
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  refundsProto.create = originalRefundCreate;
  intentsProto.retrieve = originalIntentRetrieve;
  for (const id of [failedId, autoId]) {
    await db.execute(sql`DELETE FROM itinerary_variants WHERE comparison_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM fee_ledger WHERE source_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM email_outbox WHERE metadata->>'comparisonId' = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM refunds WHERE stripe_payment_intent_id = ${pi}`).catch(() => {});
  await db.execute(sql`DELETE FROM platform_revenue WHERE source_id = ${pi}`).catch(() => {});
  await db.execute(sql`DELETE FROM fee_ledger WHERE idempotency_key LIKE ${"%" + pi + "%"}`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_comparisons WHERE user_id = ${userId}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${tripId}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${userId}`).catch(() => {});
});

test("POST generate after payment returns failed when the pin does not resolve", async () => {
  const res = await request("POST", `/api/itinerary-comparisons/${failedId}/generate`, {
    pinnedAnchor: { type: "hotel", id: "missing-hotel", name: "Not on the list" },
  });
  assert.equal(res.status, 200);
  assert.equal(res.data?.status, "failed");
  assert.equal(res.data?.id, failedId);
  assert.notEqual(res.data?.message, "Optimization started");
  assert.notEqual(res.data?.status, "generating");
  assert.notEqual(res.data?.status, "generated");

  const stored = await db.execute(sql`SELECT status FROM itinerary_comparisons WHERE id = ${failedId}`);
  assert.equal((stored.rows[0] as { status: string }).status, "failed");
  const variants = await db.execute(sql`
    SELECT count(*)::int AS n FROM itinerary_variants WHERE comparison_id = ${failedId}
  `);
  assert.equal(Number((variants.rows[0] as { n: number }).n), 0);
  const refunds = await db.execute(sql`
    SELECT count(*)::int AS n FROM refunds
     WHERE stripe_payment_intent_id = ${pi} AND reason = 'optimizer_run_failed'
  `);
  assert.equal(Number((refunds.rows[0] as { n: number }).n), 1);
});

test("POST generate with no pin does not fail the paid comparison", async () => {
  const res = await request("POST", `/api/itinerary-comparisons/${autoId}/generate`, {});
  assert.equal(res.status, 200);
  assert.equal(res.data?.status, "generating");
  const stored = await db.execute(sql`SELECT status FROM itinerary_comparisons WHERE id = ${autoId}`);
  assert.equal((stored.rows[0] as { status: string }).status, "generated");
});

test("both live handlers fail an unresolved pin before they start the optimizer", () => {
  const routesSource = fs.readFileSync(path.resolve(process.cwd(), "server/routes.ts"), "utf8");
  const createStart = routesSource.indexOf('app.post("/api/itinerary-comparisons", isAuthenticated');
  const createEnd = routesSource.indexOf('app.get("/api/dashboard/trip-scores"', createStart);
  const generateStart = routesSource.indexOf('app.post("/api/itinerary-comparisons/:id/generate"');
  const generateEnd = routesSource.indexOf('app.post("/api/itinerary-comparisons/:id/select"', generateStart);
  assert.ok(createStart >= 0 && createEnd > createStart);
  assert.ok(generateStart >= 0 && generateEnd > generateStart);
  const create = routesSource.slice(createStart, createEnd);
  const generate = routesSource.slice(generateStart, generateEnd);

  for (const [name, handler] of [["create", create], ["generate", generate]] as const) {
    const toll = handler.indexOf("recordOptimizerRunTollFor(");
    const abort = handler.indexOf("paidPinFellBack(");
    const record = handler.indexOf("recordUnresolvedPaidPin(");
    const run = handler.indexOf("generateOptimizedItineraries(");
    assert.ok(toll > 0 && toll < abort, `${name}: payment toll is recorded before the pin check`);
    assert.ok(abort > 0 && abort < record && record < run, `${name}: unresolved pin is recorded before the optimizer starts`);
    assert.match(handler, /return res\.status\((200|201)\)\.json\(\{[\s\S]*?\.\.\.failed/);
  }

  const started = generate.indexOf('message: "Optimization started"');
  const abort = generate.indexOf("paidPinFellBack(");
  assert.ok(abort < started, "the started response is not sent when the pin failed");
  assert.equal(generate.split("resolveOptimizerPinnedAnchor(").length - 1, 1);
});
