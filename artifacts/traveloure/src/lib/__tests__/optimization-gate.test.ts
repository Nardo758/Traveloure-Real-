/**
 * Lane A (console-fixes) — A3 proofs for the SHARED optimizer pay-gate helper
 * (client/src/lib/optimization-gate.ts), the single implementation cart.tsx and the slip's
 * "Optimize this plan" both consume. Fetches are mocked (DB-free, network-free); the suite
 * also proves the module's SCOPE: every request it makes targets the two optimization-payment
 * endpoints only — never /api/checkout, never an /api/cart write path.
 *
 * Run: npx tsx --test client/src/lib/__tests__/optimization-gate.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import {
  confirmOptimizationPayment,
  isTripEmptyRefusal,
  requestOptimizationGate,
} from "../optimization-gate";

interface RecordedCall {
  url: string;
  method?: string;
  body: any;
}

function mockFetch(status: number, body: unknown) {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (url: any, init?: any) => {
    calls.push({
      url: String(url),
      method: init?.method,
      body: init?.body ? JSON.parse(init.body) : undefined,
    });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("requestOptimizationGate — sheet path (no saved card)", () => {
  it("POSTs /api/optimization-payments with tripId + comparisonContext and returns payment_sheet", async () => {
    const { fetchImpl, calls } = mockFetch(200, {
      clientSecret: "cs_1",
      paymentIntentId: "pi_1",
      feeCents: 1500,
      currency: "USD",
    });
    const outcome = await requestOptimizationGate({
      tripId: "trip-1",
      destination: "Kyoto",
      fetchImpl,
    });
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, "/api/optimization-payments");
    assert.strictEqual(calls[0].method, "POST");
    assert.strictEqual(calls[0].body.tripId, "trip-1");
    assert.deepStrictEqual(calls[0].body.comparisonContext, { destination: "Kyoto" });
    assert.ok(!("useSavedCard" in calls[0].body), "sheet path must not send useSavedCard");
    assert.deepStrictEqual(outcome, {
      kind: "payment_sheet",
      payment: { clientSecret: "cs_1", paymentIntentId: "pi_1", feeCents: 1500, currency: "USD" },
    });
  });

  it("returns free_rerun without any payment state when the 24h window is active", async () => {
    const { fetchImpl } = mockFetch(200, { freeRerun: true });
    const outcome = await requestOptimizationGate({ tripId: "t", fetchImpl });
    assert.deepStrictEqual(outcome, { kind: "free_rerun" });
  });

  it("surfaces the fix-#971 trip_empty_convert_cart 409 as a refusal, not a throw", async () => {
    const { fetchImpl } = mockFetch(409, {
      error: "trip_empty_convert_cart",
      message: "Add your cart to the trip first",
    });
    const outcome = await requestOptimizationGate({ tripId: "t", fetchImpl });
    assert.strictEqual(outcome.kind, "refused");
    if (outcome.kind === "refused") {
      assert.strictEqual(outcome.status, 409);
      assert.strictEqual(outcome.body.error, "trip_empty_convert_cart");
    }
  });

  it("throws the server's message on any other error response", async () => {
    const { fetchImpl } = mockFetch(500, { message: "Stripe unavailable" });
    await assert.rejects(
      requestOptimizationGate({ tripId: "t", fetchImpl }),
      /Stripe unavailable/,
    );
  });

  it("falls back to the cart-identical generic message when the error body has none", async () => {
    const { fetchImpl } = mockFetch(500, {});
    await assert.rejects(
      requestOptimizationGate({ tripId: "t", fetchImpl }),
      /Could not create payment/,
    );
  });
});

describe("requestOptimizationGate — saved-card (FP-2 one-click) path", () => {
  it("sends useSavedCard:true and returns paid when the off-session charge succeeded", async () => {
    const { fetchImpl, calls } = mockFetch(200, {
      oneClick: true,
      status: "succeeded",
      paymentIntentId: "pi_saved",
    });
    const outcome = await requestOptimizationGate({ tripId: "t", useSavedCard: true, fetchImpl });
    assert.strictEqual(calls[0].body.useSavedCard, true);
    assert.deepStrictEqual(outcome, { kind: "paid", paymentIntentId: "pi_saved" });
  });

  it("falls back to the payment sheet on requiresAction (3DS)", async () => {
    const { fetchImpl } = mockFetch(200, {
      requiresAction: true,
      clientSecret: "cs_3ds",
      paymentIntentId: "pi_3ds",
      feeCents: 900,
      currency: "EUR",
    });
    const outcome = await requestOptimizationGate({ tripId: "t", useSavedCard: true, fetchImpl });
    assert.deepStrictEqual(outcome, {
      kind: "payment_sheet",
      payment: { clientSecret: "cs_3ds", paymentIntentId: "pi_3ds", feeCents: 900, currency: "EUR" },
    });
  });

  it("returns no_saved_card when no branch matched (caller re-requests the sheet)", async () => {
    const { fetchImpl } = mockFetch(200, {});
    const outcome = await requestOptimizationGate({ tripId: "t", useSavedCard: true, fetchImpl });
    assert.deepStrictEqual(outcome, { kind: "no_saved_card" });
  });

  it("throws the saved-card generic message when the error body has none", async () => {
    const { fetchImpl } = mockFetch(500, {});
    await assert.rejects(
      requestOptimizationGate({ tripId: "t", useSavedCard: true, fetchImpl }),
      /Could not start payment/,
    );
  });
});

describe("confirmOptimizationPayment", () => {
  it("POSTs /api/optimization-payments/confirm with the paymentIntentId", async () => {
    const { fetchImpl, calls } = mockFetch(200, {});
    await confirmOptimizationPayment("pi_9", fetchImpl);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, "/api/optimization-payments/confirm");
    assert.strictEqual(calls[0].method, "POST");
    assert.deepStrictEqual(calls[0].body, { paymentIntentId: "pi_9" });
  });

  it("swallows a network failure (non-critical by design — cart.tsx's original contract)", async () => {
    const failing = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    await assert.doesNotReject(confirmOptimizationPayment("pi_9", failing));
  });
});

describe("scope proof — the module talks ONLY to the optimization-payment endpoints", () => {
  it("never posts to /api/checkout or any /api/cart path in any outcome", async () => {
    const allCalls: RecordedCall[] = [];
    for (const [status, body, useSavedCard] of [
      [200, { clientSecret: "c", paymentIntentId: "p", feeCents: 1 }, false],
      [200, { freeRerun: true }, false],
      [409, { error: "trip_empty_convert_cart" }, false],
      [200, { oneClick: true, status: "succeeded", paymentIntentId: "p" }, true],
      [200, {}, true],
    ] as const) {
      const { fetchImpl, calls } = mockFetch(status as number, body);
      await requestOptimizationGate({
        tripId: "t",
        useSavedCard: useSavedCard as boolean,
        fetchImpl,
      }).catch(() => {});
      allCalls.push(...calls);
    }
    {
      const { fetchImpl, calls } = mockFetch(200, {});
      await confirmOptimizationPayment("pi", fetchImpl);
      allCalls.push(...calls);
    }
    assert.ok(allCalls.length >= 6);
    for (const call of allCalls) {
      assert.match(call.url, /^\/api\/optimization-payments(\/confirm)?$/);
      assert.doesNotMatch(call.url, /checkout|\/api\/cart/);
    }
  });
});

describe("isTripEmptyRefusal", () => {
  it("matches only the 409 + error:trip_empty_convert_cart pair", () => {
    assert.strictEqual(isTripEmptyRefusal(409, { error: "trip_empty_convert_cart" }), true);
    assert.strictEqual(isTripEmptyRefusal(409, { error: "other" }), false);
    assert.strictEqual(isTripEmptyRefusal(400, { error: "trip_empty_convert_cart" }), false);
    assert.strictEqual(isTripEmptyRefusal(409, null), false);
  });
});
