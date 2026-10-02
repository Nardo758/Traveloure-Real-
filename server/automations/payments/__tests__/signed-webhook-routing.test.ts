import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import { supportedCheckoutType } from "../platform-checkout-session-completed";
import { supportedConnectTransfer } from "../connect-transfer-status";

const TEST_STRIPE_KEY = "sk_test_automation_registry_endpoint";
const PLATFORM_SECRET = "whsec_platform_automation_registry";
const CONNECT_SECRET = "whsec_connect_automation_registry";

function stripeSignature(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

async function sendSignedEvent(
  routeHandler: (req: any, res: any) => unknown,
  path: string,
  payload: Record<string, unknown>,
  secret: string,
): Promise<{ status: number; body: any }> {
  const app = express();
  app.use(express.json({
    verify: (req, _res, buffer) => {
      (req as any).rawBody = Buffer.from(buffer);
    },
  }));
  app.post(path, routeHandler as any);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  const body = JSON.stringify(payload);
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": stripeSignature(body, secret),
      },
      body,
    });
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function withTestStripeEnv<T>(callback: () => Promise<T>): Promise<T> {
  const names = [
    "NODE_ENV",
    "ENVIRONMENT",
    "STRIPE_SECRET_KEY_TEST",
    "STRIPE_WEBHOOK_SECRET_TEST",
    "STRIPE_CONNECT_WEBHOOK_SECRET_TEST",
  ];
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  process.env.NODE_ENV = "test";
  process.env.ENVIRONMENT = "TEST";
  process.env.STRIPE_SECRET_KEY_TEST = TEST_STRIPE_KEY;
  process.env.STRIPE_WEBHOOK_SECRET_TEST = PLATFORM_SECRET;
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET_TEST = CONNECT_SECRET;
  return callback().finally(() => {
    for (const name of names) {
      const value = previous.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

function signedEvent(type: string, object: Record<string, unknown>) {
  return {
    id: `evt_registry_${type.replaceAll(".", "_")}`,
    object: "event",
    api_version: "2024-12-18.acacia",
    created: 1_800_000_000,
    data: { object },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type,
  };
}

test("checkout-session condition reads the signed event's data.object.metadata.type", () => {
  const event = signedEvent("checkout.session.completed", {
    id: "cs_test_session",
    object: "checkout.session",
    metadata: { type: "expert_service" },
  });
  assert.equal(supportedCheckoutType({ event: "checkout.session.completed", signatureVerified: true, payload: event }), true);
  assert.equal(
    supportedCheckoutType({
      event: "checkout.session.completed",
      signatureVerified: true,
      payload: { metadata: { type: "expert_service" } },
    }),
    false,
  );
});

test("Connect-transfer condition reads signed data.object.metadata", () => {
  const event = signedEvent("transfer.paid", {
    id: "tr_test_transfer",
    object: "transfer",
    metadata: { payoutId: "payout-1", requesterType: "expert" },
  });
  assert.equal(supportedConnectTransfer({ event: "transfer.paid", signatureVerified: true, payload: event }), true);
  assert.equal(
    supportedConnectTransfer({
      event: "transfer.paid",
      signatureVerified: true,
      payload: { metadata: { payoutId: "payout-1", requesterType: "expert" } },
    }),
    false,
  );
});

test("signed platform checkout-session endpoint dispatches a supported session through the stubbed action seam", async () =>
  withTestStripeEnv(async () => {
    const { createPlatformStripeWebhookHandler } = await import("../../../routes/bookings");
    const calls: string[] = [];
    const handler = createPlatformStripeWebhookHandler({
      handlePaymentWebhook: async (event) => { calls.push(event.type); },
    });
    const response = await sendSignedEvent(
      handler,
      "/stripe",
      signedEvent("checkout.session.completed", {
        id: "cs_test_supported",
        object: "checkout.session",
        metadata: { type: "expert_service" },
      }),
      PLATFORM_SECRET,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { received: true });
    assert.deepEqual(calls, ["checkout.session.completed"]);
  }));

test("signed Connect transfer endpoint dispatches supported payout metadata through the stubbed action seam", async () =>
  withTestStripeEnv(async () => {
    const { createConnectStripeWebhookHandler } = await import("../../../routes/webhooks.routes");
    const calls: string[] = [];
    const handler = createConnectStripeWebhookHandler(async (event) => { calls.push(event.type); });
    const response = await sendSignedEvent(
      handler,
      "/stripe",
      signedEvent("transfer.paid", {
        id: "tr_test_supported",
        object: "transfer",
        metadata: { payoutId: "payout-1", requesterType: "expert" },
      }),
      CONNECT_SECRET,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { received: true });
    assert.deepEqual(calls, ["transfer.paid"]);
  }));