/**
 * THE OPTIMIZE PAY FLOW (ledger `2026-10-08-optimize-pay-flow`; decision-maker, Oct 8, 2026 — the f413eda smoke).
 *
 *   P1  reuse on a second press: the same plan's open intent is REPLAYED (one intent, two presses)
 *   P2  Cancel cancels it, and the next press gets a FRESH intent (the canceled link is skipped)
 *   P3  a paid intent no run used is returned (run on it); one a run already used is skipped
 *   P4  a replay Stripe refuses as a different request moves to the next link; the chain is bounded
 *   P5  Cancel on the slip's sheet posts the open intent's id to the cancel rail
 *   P6  the cancel rail reads the intent from Stripe and is bound to the session user's own optimize intent
 *   P7  the dialog: "You'll pay on the next screen…", the band price on the button, the plan named
 *   P6b cancel on an intent the caller does not own → 404, and NO cancel call reaches Stripe
 *   P8  heading per caller: every pay sheet passes its own heading; "Complete Your Booking" only for bookings
 *
 * Run: npx tsx --test client/src/lib/__tests__/optimize-pay-flow.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  cancelOwnOptimizationIntent,
  OPEN_INTENT_MAX_LINKS,
  OPTIMIZATION_INTENT_CANCELABLE,
  reuseOrCreateOptimizationIntent,
} from "../../../../server/services/optimization-intent.service";
import { OPTIMIZE_COVERED_LINE, OPTIMIZE_PAY_LINE, optimizeContinueLabel, optimizePayLine } from "../optimize-pay-copy";
import { BOOKING_CHECKOUT_HEADING, optimizeCheckoutHeading } from "../checkout-headings";
import { cancelOptimizationPayment } from "../optimization-gate";

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

/** A stand-in for Stripe's idempotent create: a key replays the intent it first made. */
function fakeStripe() {
  const byKey = new Map<string, { id: string; status: string; client_secret: string }>();
  let minted = 0;
  return {
    minted: () => minted,
    create: async (key: string) => {
      const hit = byKey.get(key);
      if (hit) return hit;
      minted += 1;
      const pi = { id: `pi_${minted}`, status: "requires_payment_method", client_secret: `cs_${minted}` };
      byKey.set(key, pi);
      return pi;
    },
    set: (id: string, status: string) => {
      for (const pi of byKey.values()) if (pi.id === id) pi.status = status;
    },
  };
}

describe("optimize: one open intent per plan", () => {
  it("P1 a second press replays the same open intent — nothing new is minted", async () => {
    const s = fakeStripe();
    const deps = { create: s.create, consumed: async () => false };
    const a = await reuseOrCreateOptimizationIntent("opt-fee-u-t-2026-10-08", deps);
    const b = await reuseOrCreateOptimizationIntent("opt-fee-u-t-2026-10-08", deps);
    assert.equal(a!.id, b!.id);
    assert.equal(s.minted(), 1);
  });

  it("P2 after Cancel the next press gets a fresh intent", async () => {
    const s = fakeStripe();
    const deps = { create: s.create, consumed: async () => false };
    const a = await reuseOrCreateOptimizationIntent("k", deps);
    s.set(a!.id, "canceled");
    const b = await reuseOrCreateOptimizationIntent("k", deps);
    assert.notEqual(b!.id, a!.id);
    assert.equal(b!.status, "requires_payment_method");
    const c = await reuseOrCreateOptimizationIntent("k", deps);
    assert.equal(c!.id, b!.id, "and that one is reused in turn");
  });

  it("P3 paid-and-unused is returned; paid-and-used is skipped", async () => {
    const s = fakeStripe();
    const used = new Set<string>();
    const deps = { create: s.create, consumed: async (id: string) => used.has(id) };
    const a = await reuseOrCreateOptimizationIntent("k", deps);
    s.set(a!.id, "succeeded");
    assert.equal((await reuseOrCreateOptimizationIntent("k", deps))!.id, a!.id, "no run used it ⇒ run on it");
    used.add(a!.id);
    const b = await reuseOrCreateOptimizationIntent("k", deps);
    assert.notEqual(b!.id, a!.id, "a run used it ⇒ a fresh intent");
  });

  it("P4 a replay Stripe refuses as a different request moves on; the chain is bounded", async () => {
    let calls = 0;
    const mismatch = Object.assign(new Error("Keys for idempotent requests can only be used with the same parameters"), { type: "StripeIdempotencyError" });
    const out = await reuseOrCreateOptimizationIntent("k", {
      create: async (key) => {
        calls += 1;
        if (key.endsWith("-a0")) throw mismatch;
        return { id: "pi_new", status: "requires_payment_method" };
      },
      consumed: async () => false,
    });
    assert.equal(out!.id, "pi_new");
    assert.equal(calls, 2);
    const spent = await reuseOrCreateOptimizationIntent("k", { create: async () => ({ id: "x", status: "canceled" }), consumed: async () => false });
    assert.equal(spent, null, `every one of the ${OPEN_INTENT_MAX_LINKS} links spent ⇒ refuse`);
    await assert.rejects(
      reuseOrCreateOptimizationIntent("k", { create: async () => { throw new Error("card_declined"); }, consumed: async () => false }),
      /card_declined/,
      "any other Stripe error is not swallowed",
    );
  });
});

describe("Cancel cancels it", () => {
  it("P5 the slip's sheet Cancel posts the open intent's id to the cancel rail", async () => {
    let seen: { url: string; body: any } | null = null;
    const ok = await cancelOptimizationPayment("pi_9", (async (url: string, init: any) => {
      seen = { url, body: JSON.parse(init.body) };
      return { ok: true, json: async () => ({ canceled: true }) } as any;
    }) as any);
    assert.equal(ok, true);
    assert.deepEqual(seen, { url: "/api/optimization-payments/cancel", body: { paymentIntentId: "pi_9" } });
    const rail = read("client/src/components/plancard/SlipRail.tsx");
    assert.match(rail, /onCancel=\{cancelPaySheet\}/);
    assert.match(rail, /if \(!open\) cancelPaySheet\(\)/, "closing the sheet cancels too");
    assert.match(rail, /void cancelOptimizationPayment\(open\.paymentIntentId\)/);
  });

  it("P6 the cancel rail is the session user's own optimize intent, never processing or succeeded", async () => {
    const route = read("server/routes/optimization.routes.ts");
    const start = route.indexOf('router.post("/api/optimization-payments/cancel"');
    const body = route.slice(start, route.indexOf("router.post(", start + 10));
    assert.ok(start > 0);
    assert.match(body, /cancelOwnOptimizationIntent\(userId, parsed\.data\.paymentIntentId/);
    assert.match(body, /status\(404\)/);
    const cancels: string[] = [];
    const own = await cancelOwnOptimizationIntent("u1", "pi_1", {
      retrieve: async () => ({ id: "pi_1", status: "requires_payment_method", metadata: { type: "optimization_fee", userId: "u1" } }),
      cancel: async (id) => (cancels.push(id), { status: "canceled" }),
    });
    assert.deepEqual(own, { httpStatus: 200, canceled: true, status: "canceled" });
    const paid = await cancelOwnOptimizationIntent("u1", "pi_1", {
      retrieve: async () => ({ id: "pi_1", status: "succeeded", metadata: { type: "optimization_fee", userId: "u1" } }),
      cancel: async (id) => (cancels.push(id), { status: "canceled" }),
    });
    assert.deepEqual(paid, { httpStatus: 200, canceled: false, status: "succeeded" }, "a paid intent is never canceled");
    assert.deepEqual(cancels, ["pi_1"]);
    assert.match(route, /const cancelOptimizationBody = z\.object\(\{ paymentIntentId: [^}]*\}\)\.strict\(\)/);
    assert.deepEqual([...OPTIMIZATION_INTENT_CANCELABLE].sort(), ["requires_action", "requires_confirmation", "requires_payment_method"]);
  });
});

describe("P6b cancel on an intent the caller does not own", () => {
  it("is ONE 404 and makes no cancel call — another user's, another kind, and a missing intent alike", async () => {
    let cancelCalls = 0;
    const cancel = async () => (cancelCalls++, { status: "canceled" });
    const cases = [
      { id: "pi_other", status: "requires_payment_method", metadata: { type: "optimization_fee", userId: "someone-else" } },
      { id: "pi_booking", status: "requires_payment_method", metadata: { type: "service_booking", userId: "u1" } },
      null,
    ];
    for (const pi of cases) {
      const out = await cancelOwnOptimizationIntent("u1", "pi_x", { retrieve: async () => pi, cancel });
      assert.deepEqual(out, { httpStatus: 404 });
    }
    assert.equal(cancelCalls, 0, "no cancel reached Stripe");
  });
});

describe("the dialog and the sheet say what is being paid for", () => {
  const fee = { complexityTier: "standard", feeCents: 599, currency: "USD", aiDisabled: false, coveredByTripPass: false };
  it("P7 pay line, the band price on the button, the plan named", () => {
    assert.equal(OPTIMIZE_PAY_LINE, "You'll pay on the next screen; nothing runs until you do.");
    assert.equal(optimizeContinueLabel(fee), "Continue to pay $5.99");
    assert.equal(optimizePayLine(fee), OPTIMIZE_PAY_LINE);
    assert.equal(optimizeContinueLabel({ ...fee, coveredByTripPass: true }), "Generate 3 versions");
    assert.equal(optimizePayLine({ ...fee, coveredByTripPass: true }), OPTIMIZE_COVERED_LINE);
    assert.equal(optimizeContinueLabel(null), "Continue", "no quote ⇒ no number (§13)");
    const dialog = read("client/src/components/plancard/BuildAroundDialog.tsx");
    assert.match(dialog, /\{optimizeContinueLabel\(fee\)\}/);
    assert.match(dialog, /data-testid="build-around-plan"/);
    assert.doesNotMatch(dialog, /\$\d|5\.99|599/, "no price literal in the dialog");
    const rail = read("client/src/components/plancard/SlipRail.tsx");
    assert.match(rail, /planName=\{trip\.title \|\| trip\.destination\}\s+fee=\{leadData\.fee\}/);
  });

  it("P8 heading per caller", () => {
    assert.equal(optimizeCheckoutHeading("Kyoto trip"), "Pay for Optimize · Kyoto trip");
    assert.equal(optimizeCheckoutHeading(null), "Pay for Optimize");
    const sheet = read("client/src/components/booking/StripeCheckout.tsx");
    assert.doesNotMatch(sheet, />Complete Your Booking</, "the sheet carries no heading of its own");
    assert.match(sheet, /\{heading\}<\/h2>/);
    const CALLERS: Record<string, "booking" | "other"> = {
      "client/src/pages/my-bookings.tsx": "booking",
      "client/src/components/quotes/TravelerQuotesPanel.tsx": "booking",
      "client/src/pages/my-events.tsx": "other",
      "client/src/components/booking/VariantActionButtons.tsx": "other",
      "client/src/pages/ready-made-detail.tsx": "other",
      "client/src/components/plancard/TripPassCard.tsx": "other",
      "client/src/components/plancard/AskAiDrawer.tsx": "other",
      "client/src/components/plancard/SlipRail.tsx": "other",
    };
    for (const [file, kind] of Object.entries(CALLERS)) {
      const src = read(file);
      const mount = src.slice(src.indexOf("<StripeCheckout"), src.indexOf("<StripeCheckout") + 160);
      assert.match(mount, /heading=\{/, `${file} passes a heading`);
      assert.equal(/heading=\{BOOKING_CHECKOUT_HEADING\}/.test(mount), kind === "booking", `${file}: booking heading only for a booking`);
    }
    assert.match(read("client/src/components/plancard/SlipRail.tsx"), /heading=\{optimizeCheckoutHeading\(trip\.title \|\| trip\.destination\)\}/);
    const cart = read("client/src/pages/cart.tsx");
    assert.match(cart, /heading=\{optimizeCheckoutHeading\(\)\}/, "the cart's optimize sheet is not a booking");
    assert.match(cart, /heading=\{BOOKING_CHECKOUT_HEADING\}/, "the cart's checkout is");
    assert.equal(BOOKING_CHECKOUT_HEADING, "Complete Your Booking");
  });
});
