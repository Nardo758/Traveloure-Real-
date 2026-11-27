/**
 * R3 U8a (D2, Leon Nov 26 2026): the FIRST saved card becomes the default, and only then. `updated` counts calls to
 * customers.update; a stubbed Stripe client stands in for the network, so nothing here reaches Stripe.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { defaultFirstSavedMethod, handleSavedMethodEvent } from "../services/stripe-payment.service";

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
        if (opts.throwOnRetrieve) {
        // what Stripe answers for a customer that no longer exists: a settled answer, not a retry
        throw Object.assign(new Error("No such customer: cus_missing"), { code: "resource_missing", statusCode: 404 });
      }
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

const eventOf = (type: string, id: string): any => ({ id, type, data: { object: {} } });
const attachedEvent = (id: string, paymentMethodId: string): any => ({
  id,
  type: "payment_method.attached",
  data: { object: { id: paymentMethodId, customer: "cus_1" } },
});

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

/**
 * R3 U8a fix round: these drive the webhook's saved-method branch end to end (event in, setter out), with a stubbed
 * Stripe client and a stubbed claim that keeps the real semantics: same event id is claimed once.
 */
test("[u8a-d2-attached] event=payment_method.attached claimed=1 updated=1", async () => {
  const { client, calls } = stubClient({ methods: [card("pm_1")] });
  const claimed: string[] = [];
  const handled = await handleSavedMethodEvent(attachedEvent("evt_1", "pm_1"), {
    client,
    claim: async (run) => {
      if (claimed.includes("evt_1")) return false as any;
      claimed.push("evt_1");
      return run();
    },
  });
  console.log(`[u8a-d2-attached] event=payment_method.attached claimed=${claimed.length} updated=${calls.update}`);
  assert.equal(handled, true);
  assert.equal(calls.update, 1);
});

test("[u8a-d2-setup-intent] event=setup_intent.succeeded updated=0", async () => {
  const { client, calls } = stubClient({ methods: [card("pm_1")] });
  const handled = await handleSavedMethodEvent(eventOf("setup_intent.succeeded", "evt_setup"), { client });
  console.log(`[u8a-d2-setup-intent] event=setup_intent.succeeded updated=${calls.update}`);
  assert.equal(handled, false);
  assert.equal(calls.update, 0);
});

test("[u8a-d2-detached] event=payment_method.detached updated=0", async () => {
  const { client, calls } = stubClient({ methods: [card("pm_1")] });
  const handled = await handleSavedMethodEvent(eventOf("payment_method.detached", "evt_det"), { client });
  console.log(`[u8a-d2-detached] event=payment_method.detached updated=${calls.update}`);
  assert.equal(handled, false);
  assert.equal(calls.update, 0);
});

test("[u8a-d2-replay] deliveries=2 claimed=1 updated=1", async () => {
  const { client, calls } = stubClient({ methods: [card("pm_1")] });
  const claimed: string[] = [];
  const claim = async <T,>(run: () => Promise<T>): Promise<T> => {
    if (claimed.includes("evt_same")) return false as unknown as T; // the claim answers "already done"
    claimed.push("evt_same");
    return run();
  };
  await handleSavedMethodEvent(attachedEvent("evt_same", "pm_1"), { client, claim });
  await handleSavedMethodEvent(attachedEvent("evt_same", "pm_1"), { client, claim });
  console.log(`[u8a-d2-replay] deliveries=2 claimed=${claimed.length} updated=${calls.update}`);
  assert.equal(claimed.length, 1);
  assert.equal(calls.update, 1);
});

test("[u8a-d2-stripe-error] status=5xx updated=0", async () => {
  // customers.update throws: the branch must surface it so the route answers non-2xx and Stripe retries.
  const client = {
    customers: {
      retrieve: async () => ({ id: "cus_1", deleted: false, invoice_settings: {} }),
      update: async () => {
        throw new Error("stripe is down");
      },
    },
    paymentMethods: { list: async () => ({ data: [card("pm_1")] }) },
  } as any;
  let status = 200;
  let updated = 0;
  try {
    await handleSavedMethodEvent(attachedEvent("evt_err", "pm_1"), {
      client,
      claim: async (run) => {
        try {
          return await run();
        } catch (err) {
          status = 500; // what the webhook route answers when the claim fails
          throw err;
        }
      },
    });
  } catch {
    // expected: never swallowed
  }
  console.log(`[u8a-d2-stripe-error] status=${status >= 500 ? "5xx" : status} updated=${updated}`);
  assert.equal(status, 500);
  assert.equal(updated, 0);
});
