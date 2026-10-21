/**
 * In-flight PaymentIntent keys stay put when the body gains a customer or
 * drops off_session. Ledger `2026-10-21-saved-method-onsession`.
 *
 * Run: npx tsx --test server/__tests__/stripe-intent-key.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { savedMethodConfirmsOnClick } from "../../shared/saved-payment-method";
import { createPaymentIntentPreservingKey, isIdempotencyParamMismatch } from "../services/stripe-intent-key";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

test("a parameter mismatch is the only error that replays the previous body", async () => {
  assert.equal(isIdempotencyParamMismatch({ type: "idempotency_error" }), true);
  assert.equal(isIdempotencyParamMismatch({ raw: { code: "idempotency_error" } }), true);
  assert.equal(isIdempotencyParamMismatch({ type: "card_error", code: "card_declined" }), false);
  const calls: string[] = [];
  const created = await createPaymentIntentPreservingKey(
    async (params: { customer?: string }) => {
      calls.push(params.customer ?? "legacy");
      if (params.customer) {
        const err = new Error("mismatch");
        (err as { type?: string }).type = "idempotency_error";
        throw err;
      }
      return { id: "pi_old" };
    },
    { customer: "cus_new" },
    {},
  );
  assert.deepEqual(calls, ["cus_new", "legacy"]);
  assert.equal(created.id, "pi_old");
});

test("an unchanged body is not sent twice, and a card decline is not replayed", async () => {
  let calls = 0;
  const same = { amount: 1 };
  const once = await createPaymentIntentPreservingKey(async () => {
    calls += 1;
    return { id: "pi_same" };
  }, same, same);
  assert.equal(once.id, "pi_same");
  assert.equal(calls, 1);
  await assert.rejects(
    createPaymentIntentPreservingKey(
      async () => {
        throw Object.assign(new Error("declined"), { type: "card_error" });
      },
      { customer: "cus" },
      {},
    ),
    /declined/,
  );
});

test("saved Apple Pay is not confirmed from a click; a card and Link are", () => {
  assert.equal(savedMethodConfirmsOnClick({ wallet: "apple_pay" }), false);
  assert.equal(savedMethodConfirmsOnClick({ wallet: "google_pay" }), true);
  assert.equal(savedMethodConfirmsOnClick({ wallet: null }), true);
  assert.equal(savedMethodConfirmsOnClick(null), false);
});

test("Trip Pass, ready-made, expert service, and handoff keep their keys and attach a customer", () => {
  const trip = read("server/routes/trip-pass.routes.ts");
  const ready = read("server/routes/ready-made.routes.ts");
  const payment = read("server/services/stripe-payment.service.ts");
  assert.match(trip, /idempotencyKey:\s*`tp-buy-\$\{trip!\.id\}-\$\{userId\}`/);
  assert.match(ready, /idempotencyKey:\s*`rm-buy-\$\{listing\.id\}-\$\{userId\}`/);
  assert.match(trip, /createPaymentIntentPreservingKey/);
  assert.match(ready, /createPaymentIntentPreservingKey/);
  assert.match(trip, /setup_future_usage:\s*"off_session"/);
  assert.match(ready, /setup_future_usage:\s*"off_session"/);
  const handoff = payment.slice(payment.indexOf("async createHandoffAuthorization"), payment.indexOf("async retrieveHandoffPaymentIntent"));
  const expert = payment.slice(payment.indexOf("async createExpertServicePaymentIntent"), payment.indexOf("return {", payment.indexOf("async createExpertServicePaymentIntent")));
  assert.match(handoff, /createPaymentIntentPreservingKey/);
  assert.match(handoff, /setup_future_usage: 'off_session'/);
  assert.match(handoff, /idempotencyKey: input\.idempotencyKey/);
  assert.match(expert, /createPaymentIntentPreservingKey/);
  assert.match(expert, /expert-svc-/);
  const click = payment.slice(payment.indexOf("async chargeSavedMethod"), payment.indexOf("async createPaymentIntent"));
  assert.match(click, /savedMethodConfirmsOnClick/);
  assert.match(click, /confirm: true/);
  assert.match(click, /off_session: true/);
  assert.match(click, /createPaymentIntentPreservingKey/);
});
