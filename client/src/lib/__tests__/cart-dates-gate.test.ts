/**
 * Audit A3, cart (architect dispatch CB-K; ledger `2026-10-25-cart-dates-gate`; ruling Oct 26 08:30 ET: CB-K
 * stands). The cart's paid Optimize taps ask for the plan's dates before any payment request.
 *   CD1  the fact: cartOptimizeDatesConfirmed fails closed and reads only this trip's own stamp
 *   CD2  the three pay controls sit behind one DatesGate and call guardedPay
 *   CD3  requestOptimizationGate runs only inside the two pay functions, reached only from the gate
 *   CD4  with no resolved trip (the ?step= landing) a tap re-runs handleOptimizeClick and makes no request
 *   CD5  after the dates are saved, the cart's context and resolved trip agree before the tap runs
 *   CD6  the existing header checks and the optimization-gate import are unchanged
 *   CD7  no new wording: the panel line is the slip's planDatesGateLine("Optimize")
 *
 * Run: npx tsx --test client/src/lib/__tests__/cart-dates-gate.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cartOptimizeDatesConfirmed } from "../cart-dates-gate";
import { datesGateBlocks } from "../../components/plan/SlipAnchorPanels";
import { planDatesGateLine } from "@shared/plan-dates";

const CART = readFileSync("client/src/pages/cart.tsx", "utf8");
const body = (name: string) => {
  const at = CART.indexOf(`const ${name} = async () => {`);
  assert.ok(at > 0, name);
  return CART.slice(at, CART.indexOf("\n  };\n", at));
};

describe("audit A3: the cart's Optimize payment asks for the plan's dates", () => {
  it("CD1 the fact fails closed", () => {
    const iso = "2026-10-01T12:00:00.000Z";
    assert.equal(cartOptimizeDatesConfirmed(null, "t1"), false);
    assert.equal(cartOptimizeDatesConfirmed(undefined, "t1"), false);
    assert.equal(cartOptimizeDatesConfirmed({ id: "t1", datesConfirmedAt: null }, "t1"), false);
    assert.equal(cartOptimizeDatesConfirmed({ id: "t1" }, "t1"), false);
    assert.equal(cartOptimizeDatesConfirmed({ id: "t1", datesConfirmedAt: iso }, "t1"), true);
    assert.equal(cartOptimizeDatesConfirmed({ id: "t1", datesConfirmedAt: true }, "t1"), true);
    assert.equal(cartOptimizeDatesConfirmed({ id: "t1", datesConfirmedAt: iso }, "t2"), false, "another trip's fact is not this trip's");
    assert.equal(cartOptimizeDatesConfirmed({ id: "t1", datesConfirmedAt: iso }, undefined), false);
    assert.equal(datesGateBlocks(cartOptimizeDatesConfirmed({ id: "t1", datesConfirmedAt: null }, "t1")), true);
    assert.equal(datesGateBlocks(cartOptimizeDatesConfirmed({ id: "t1", datesConfirmedAt: iso }, "t1")), false);
  });

  it("CD2 the three controls are behind the gate", () => {
    assert.equal((CART.match(/<DatesGate\b/g) ?? []).length, 1);
    assert.ok(CART.includes('action="Optimize"'));
    assert.ok(CART.includes('testId="cart-optimize-dates-gate"'));
    assert.ok(CART.includes("datesConfirmed: cartOptimizeDatesConfirmed(resolvedTrip, getTripContext().tripId),"));
    assert.ok(CART.includes("startDate: effectiveTripStartDate,") && CART.includes("endDate: effectiveTripEndDate,"));
    assert.doesNotMatch(CART, /onClick=\{payWithSavedCard\}|onClick=\{requestOptimizationPayment\}/);
    for (const [id, fn] of [
      ["button-pay-saved-card-optimization", "payWithSavedCard"],
      ["button-use-different-card-optimization", "requestOptimizationPayment"],
      ["button-unlock-optimization", "requestOptimizationPayment"],
    ]) {
      const at = CART.indexOf(`data-testid="${id}"`);
      assert.ok(at > 0, id);
      const control = CART.slice(CART.lastIndexOf("<", CART.lastIndexOf("onClick=", at)), at);
      assert.ok(control.includes(`onClick={() => guardedPay(guard, () => void ${fn}())}`), id);
    }
    assert.equal((CART.match(/onClick=\{\(\) => guardedPay\(guard, /g) ?? []).length, 3);
    const gate = CART.slice(CART.indexOf("<DatesGate"), CART.indexOf("</DatesGate>"));
    for (const id of ["button-pay-saved-card-optimization", "button-use-different-card-optimization", "button-unlock-optimization"]) {
      assert.ok(gate.includes(id), `${id} sits inside the gate`);
    }
  });

  it("CD3 no payment request starts outside the gate", () => {
    assert.equal((CART.match(/requestOptimizationGate\(/g) ?? []).length, 2);
    assert.ok(body("requestOptimizationPayment").includes("requestOptimizationGate({"));
    assert.ok(body("payWithSavedCard").includes("requestOptimizationGate({"));
    // Callers: the two guarded callbacks, and payWithSavedCard's own fall-back to requestOptimizationPayment().
    assert.equal((CART.match(/\bpayWithSavedCard\(\)/g) ?? []).length, 1);
    const reqCalls = (CART.match(/\brequestOptimizationPayment\(\)/g) ?? []).length;
    assert.equal(reqCalls, 3, "two guarded callbacks and the saved-card fall-back");
    assert.ok(body("payWithSavedCard").includes("await requestOptimizationPayment();"));
  });

  it("CD4 the ?step= landing makes no payment request", () => {
    const at = CART.indexOf("const guardedPay = ");
    const fn = CART.slice(at, CART.indexOf("\n  };\n", at));
    const landing = fn.indexOf("if (!resolvedTrip?.id) {");
    const entry = fn.indexOf("void handleOptimizeClick();");
    const returns = fn.indexOf("return;", entry);
    const guarded = fn.indexOf("guard((dates) => {");
    assert.ok(landing > 0 && entry > landing && returns > entry && guarded > returns, "the fall-back returns before any guard( call");
  });

  it("CD5 after a save the cart agrees before the tap runs", () => {
    const at = CART.indexOf("guard((dates) => {");
    const cb = CART.slice(at, CART.indexOf("\n    });", at));
    const ctx = cb.indexOf("updateTripContext({ startDate: dates.startDate, endDate: dates.endDate });");
    const trip = cb.indexOf("setResolvedTrip((t) => (t ? { ...t, startDate: dates.startDate, endDate: dates.endDate, datesConfirmedAt: new Date().toISOString() } : t));");
    const run = cb.indexOf("run();");
    assert.ok(ctx > 0 && trip > ctx && run > trip);
    assert.ok(CART.includes("numberOfTravelers: number; datesConfirmedAt?: string | null } | null>(null);"), "the resolved trip keeps the fact");
  });

  it("CD6 the old checks stay", () => {
    const click = body("handleOptimizeClick");
    assert.ok(click.includes('toast({ title: "Add your travel dates", description: "Set your trip dates to continue." });'));
    assert.ok(click.includes("openPlanModal();"));
    assert.ok(click.includes('title: "Invalid dates"'));
    assert.ok(click.includes("await proceedOptimize(effStart, effEnd);"));
    assert.ok(CART.includes('import { requestOptimizationGate, confirmOptimizationPayment } from "@/lib/optimization-gate";'));
  });

  it("CD7 no new wording", () => {
    assert.equal(planDatesGateLine("Optimize"), "Optimize needs your dates. Set them here and we'll carry on.");
    const gate = CART.slice(CART.indexOf("<DatesGate"), CART.indexOf("{(guard) =>"));
    assert.deepEqual(gate.match(/"[^"]*"/g), ['""', '"Optimize"', '"cart-optimize-dates-gate"'], "the gate's only literals");
  });
});
