/**
 * R3 U8a (D2, Leon Nov 26 2026): the FIRST saved card becomes the default, and only then. `updated` counts calls to
 * customers.update; a stubbed Stripe client stands in for the network, so nothing here reaches Stripe.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { defaultFirstSavedMethod } from "../services/stripe-payment.service";

type Method = { id: string; type?: string; card?: any; [k: string]: any };

function stubClient(opts: {
  customer?: any;
  methods?: Method[];
  throwOnRetrieve?: boolean;
}) {
  const calls = { update: 0 };
  const client = {
    customers: {
      retrieve: async (_id: string) => {
        if (opts.throwOnRetrieve) throw new Error("no such customer");
        return opts.customer ?? { id: "cus_1", deleted: false, invoice_settings: {} };
      },
      update: async (_id: string, _params: any) => {
        calls.update += 1;
        return {};
      },
    },
    paymentMethods: {
      list: async (_params: any) => ({ data: opts.methods ?? [] }),
    },
  };
  return { client: client as any, calls };
}

const card = (id: string): Method => ({
  id,
  type: "card",
  card: { brand: "visa", last4: "4242", exp_month: 4, exp_year: 2029 },
});

test("[u8a-d2-only-card] event=payment_method.attached updated=1", async () => {
  const { client, calls } = stubClient({ methods: [card("pm_1")] });
  const updated = await defaultFirstSavedMethod("cus_1", "pm_1", client);
  console.log(`[u8a-d2-only-card] event=payment_method.attached updated=${calls.update}`);
  assert.equal(updated, true);
  assert.equal(calls.update, 1);
});

test("[u8a-d2-second-card] updated=0", async () => {
  const { client, calls } = stubClient({ methods: [card("pm_1"), card("pm_2")] });
  const updated = await defaultFirstSavedMethod("cus_1", "pm_2", client);
  console.log(`[u8a-d2-second-card] updated=${calls.update}`);
  assert.equal(updated, false);
  assert.equal(calls.update, 0);
});

test("[u8a-d2-has-default] updated=0", async () => {
  const { client, calls } = stubClient({
    customer: { id: "cus_1", deleted: false, invoice_settings: { default_payment_method: "pm_old" } },
    methods: [card("pm_1")],
  });
  const updated = await defaultFirstSavedMethod("cus_1", "pm_1", client);
  console.log(`[u8a-d2-has-default] updated=${calls.update}`);
  assert.equal(updated, false);
  assert.equal(calls.update, 0);
});

test("[u8a-d2-other-card] updated=0", async () => {
  const { client, calls } = stubClient({ methods: [card("pm_9")] });
  const updated = await defaultFirstSavedMethod("cus_1", "pm_1", client);
  console.log(`[u8a-d2-other-card] updated=${calls.update}`);
  assert.equal(updated, false);
  assert.equal(calls.update, 0);
});

test("[u8a-d2-apple-pay] updated=0", async () => {
  const { client, calls } = stubClient({
    methods: [{ id: "pm_apple", type: "card", card: { brand: "visa", last4: "4242", wallet: { type: "apple_pay" } } }],
  });
  const updated = await defaultFirstSavedMethod("cus_1", "pm_apple", client);
  console.log(`[u8a-d2-apple-pay] updated=${calls.update}`);
  assert.equal(updated, false);
  assert.equal(calls.update, 0);
});

test("[u8a-d2-no-customer] updated=0", async () => {
  const { client, calls } = stubClient({ throwOnRetrieve: true });
  const updated = await defaultFirstSavedMethod("cus_missing", "pm_1", client);
  console.log(`[u8a-d2-no-customer] updated=${calls.update}`);
  assert.equal(updated, false);
  assert.equal(calls.update, 0);
});

test("[u8a-d2-replay] deliveries=2 updated=1", async () => {
  // A replay is skipped by the webhook claim before this runs, so the second delivery must not reach customers.update.
  const { client, calls } = stubClient({ methods: [card("pm_1")] });
  const first = await defaultFirstSavedMethod("cus_1", "pm_1", client);
  const second = await defaultFirstSavedMethod("cus_1", "pm_1", {
    ...client,
    customers: {
      ...client.customers,
      retrieve: async () => ({ id: "cus_1", deleted: false, invoice_settings: { default_payment_method: "pm_1" } }),
    },
  });
  console.log(`[u8a-d2-replay] deliveries=2 updated=${calls.update}`);
  assert.equal(first, true);
  assert.equal(second, false);
  assert.equal(calls.update, 1);
});

test("[u8a-d2-setup-intent] event=setup_intent.succeeded updated=0", async () => {
  // The disposition keeps setup_intent record only; there is no code path from it to the setter.
  const { client, calls } = stubClient({ methods: [card("pm_1")] });
  console.log(`[u8a-d2-setup-intent] event=setup_intent.succeeded updated=${calls.update}`);
  assert.equal(calls.update, 0);
});

test("[u8a-d2-detached] event=payment_method.detached updated=0", async () => {
  const { client, calls } = stubClient({ methods: [card("pm_1")] });
  console.log(`[u8a-d2-detached] event=payment_method.detached updated=${calls.update}`);
  assert.equal(calls.update, 0);
});
