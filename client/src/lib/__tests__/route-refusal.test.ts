/**
 * A FINALIZED PLAN'S CHECKOUT REFUSALS READ AS THEMSELVES (ledger
 * `2026-09-26-finalized-checkout-messages`, numeric citation R123).
 *
 * The routing rail refuses a finalized plan with named 409s (`not_in_final`, `plan_finalized`,
 * `already_purchased`). Before this lane three of the five client callers showed a generic
 * "couldn't be moved to checkout" and one showed the raw `409: {json}` text. These hold:
 *   R1  `not_in_final` ⇒ "This plan is finalized", the server's message, and a Reopen offer.
 *   R2  `plan_finalized` ⇒ the same title and a Reopen offer.
 *   R3  `already_purchased` ⇒ "Already purchased", no Reopen (reopening changes nothing).
 *   R4  an unnamed failure keeps the surface's own fallback, no Reopen.
 *   R5  the bulk runner records each failure's code; Reopen is offered only when a finalized-plan
 *       refusal is among them.
 *   R6  source pins: every caller of the rail reads the refusal through the one hook.
 *
 * Run: npx tsx --test client/src/lib/__tests__/route-refusal.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bulkOffersReopen, readRouteRefusal, routeRefusalNotice } from "../route-refusal";
import { runBulkRouteToCheckout } from "../slip-plan-actions";

const ROOT = resolve(import.meta.dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

/** What `apiRequest` throws on a non-2xx response. */
const refusal = (code: string, message: string) =>
  new Error(`409: ${JSON.stringify({ code, message, from: "in_planning", to: "ready_for_checkout" })}`);

const NOT_IN_FINAL = refusal(
  "not_in_final",
  "This item is not part of the finalized plan. Reopen the plan and finalize it again to book it.",
);

describe("one refused item", () => {
  it("R1: not_in_final says the plan is finalized and offers Reopen", () => {
    const n = routeRefusalNotice(NOT_IN_FINAL, "Added to your plan");
    assert.equal(n.title, "This plan is finalized");
    assert.match(n.description, /not part of the finalized plan/);
    assert.equal(n.offerReopen, true);
    assert.equal(readRouteRefusal(NOT_IN_FINAL).code, "not_in_final");
  });

  it("R2: plan_finalized offers Reopen", () => {
    const n = routeRefusalNotice(refusal("plan_finalized", "This plan is finalized. Reopen it on the slip."), "x");
    assert.equal(n.title, "This plan is finalized");
    assert.equal(n.offerReopen, true);
  });

  it("R3: already_purchased is named and offers no Reopen", () => {
    const n = routeRefusalNotice(refusal("already_purchased", "This item is already purchased."), "x");
    assert.equal(n.title, "Already purchased");
    assert.equal(n.description, "This item is already purchased.");
    assert.equal(n.offerReopen, false);
  });

  it("R4: an unnamed failure keeps the surface's fallback and never a raw 409 body", () => {
    const net = routeRefusalNotice(new Error("Failed to fetch"), "Couldn't update item");
    assert.equal(net.title, "Couldn't update item");
    assert.equal(net.offerReopen, false);
    const plain = routeRefusalNotice(new Error(`500: ${JSON.stringify({ message: "Failed to route" })}`), "Couldn't update item");
    assert.equal(plain.description, "Failed to route");
    assert.doesNotMatch(plain.description, /^\d{3}:/);
  });
});

describe("bulk", () => {
  it("R5: failures carry the server's code; Reopen only when a finalized-plan refusal is among them", async () => {
    const items = [
      { id: "a", routingStatus: "in_planning" },
      { id: "b", routingStatus: "in_planning" },
      { id: "c", routingStatus: "in_planning" },
    ];
    const answers: Record<string, Error | null> = {
      a: null,
      b: NOT_IN_FINAL,
      c: refusal("already_purchased", "This item is already purchased."),
    };
    const result = await runBulkRouteToCheckout({
      items,
      postRoute: async (id) => {
        if (answers[id]) throw answers[id];
      },
      invalidate: () => {},
    });
    assert.equal(result.succeeded, 1);
    assert.deepEqual(result.failed.map((f) => f.code).sort(), ["already_purchased", "not_in_final"]);
    assert.equal(bulkOffersReopen(result.failed), true);
    assert.equal(bulkOffersReopen(result.failed.filter((f) => f.code === "already_purchased")), false);
  });
});

describe("R6: every caller of the routing rail reads the refusal through the one hook", () => {
  const callers = [
    "client/src/pages/service-detail.tsx",
    "client/src/components/plancard/FinalizeBookingModal.tsx",
    "client/src/components/plancard/PlanApprovalBanner.tsx",
    "client/src/components/plancard/ExpertSuggestionsPanel.tsx",
    "client/src/components/plancard/ActivitiesSection.tsx",
  ];
  for (const file of callers) {
    it(file, () => {
      const src = read(file);
      assert.ok(src.includes("/route`"), "still calls the routing rail");
      assert.ok(src.includes("useRouteRefusalToast("), "reads refusals through the one hook");
    });
  }
  it("the owner row no longer toasts the raw error text", () => {
    assert.equal(read("client/src/components/plancard/ActivitiesSection.tsx").includes("err?.message ||"), false);
  });
});
