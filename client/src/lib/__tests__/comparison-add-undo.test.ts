/**
 * Row 195 (CB-2026-10-25-C, ruling R3): single add with undo on the Optimize comparison page.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ADD_UNDO_STRINGS,
  undoOutcomeFromError,
  undoOutcomeFromStatus,
  undoOutcomeToast,
  undoTargetForAdopt,
  type AdoptStopResponse,
} from "../comparison-add-undo";

const PAGE = readFileSync("client/src/pages/itinerary-comparison.tsx", "utf8");
const OPEN = { finalizedAt: null };
const added = (item: Record<string, unknown>): AdoptStopResponse => ({ adopted: true, item } as AdoptStopResponse);

/** The source of one `const <name> = useMutation({ … });` block. */
function mutationBlock(name: string): string {
  const start = PAGE.indexOf(`const ${name} = useMutation({`);
  assert.ok(start >= 0, `${name} exists`);
  const end = PAGE.indexOf("\n  });\n", start);
  return PAGE.slice(start, end);
}

describe("row 195: single add with undo", () => {
  it("AU1: the add is instant — the + mutates directly and the toast fires on success, no confirm", () => {
    assert.match(PAGE, /onAdoptStop=\{\(variantItemId\) => \{\s*setAdoptingStopId\(variantItemId\);\s*adoptStopMutation\.mutate\(variantItemId\);/);
    const adopt = mutationBlock("adoptStopMutation");
    assert.match(adopt, /title: "Added to your plan",\s*description: "Added\. Your other stops are unchanged\."/);
    assert.match(adopt, /action:\s*tripId && undoItemId \?/);
  });

  it("AU2: undo targets exactly the added item id through the existing DELETE, then refreshes the plan", () => {
    assert.equal(undoTargetForAdopt(added({ id: "item-42" }), OPEN), "item-42");
    const undo = mutationBlock("undoAddMutation");
    assert.match(undo, /apiRequest\("DELETE", `\/api\/trips\/\$\{tripId\}\/itinerary-items\/\$\{itemId\}`\)/);
    assert.match(undo, /invalidateQueries\(\{ queryKey: \[`\/api\/trips\/\$\{vars\.tripId\}\/plancard`\] \}\)/);
    assert.match(mutationBlock("adoptStopMutation"), /undoAddMutation\.mutate\(\{ tripId, itemId: undoItemId \}\)/);
  });

  it("AU3: no undo for chose, adopted:false, a missing id, an unknown or finalized plan, or a booked/paid row", () => {
    assert.equal(undoTargetForAdopt({ adopted: true, chose: { setId: "s", optionId: "o" }, itemId: "i" }, OPEN), null);
    assert.equal(undoTargetForAdopt({ adopted: false, reason: "already-in-plan" }, OPEN), null);
    assert.equal(undoTargetForAdopt(added({}), OPEN), null);
    assert.equal(undoTargetForAdopt(added({ id: "" }), OPEN), null);
    assert.equal(undoTargetForAdopt(added({ id: "item-42" }), undefined), null);
    assert.equal(undoTargetForAdopt(added({ id: "item-42" }), { finalizedAt: "2026-10-25T12:00:00Z" }), null);
    assert.equal(undoTargetForAdopt(added({ id: "item-42", bookingId: "bk-1" }), OPEN), null);
    assert.equal(undoTargetForAdopt(added({ id: "item-42", routingStatus: "purchased" }), OPEN), null);
    // The page reads the plan's own finalizedAt.
    assert.match(mutationBlock("adoptStopMutation"), /undoTargetForAdopt\(r, slipPlancard\?\.trip\)/);
  });

  it("AU4: a 409 item_booked keeps the item; a 202 or any other error removes nothing and says so neutrally", () => {
    const booked = new Error(`409: ${JSON.stringify({ code: "item_booked", message: "anything" })}`);
    assert.equal(undoOutcomeFromError(booked), "item_stays");
    assert.deepEqual(undoOutcomeToast("item_stays"), ADD_UNDO_STRINGS.itemStays);
    // Matched on the code, never the prose.
    assert.equal(undoOutcomeFromError(new Error(`409: ${JSON.stringify({ message: "This item is booked." })}`)), "failed");
    assert.equal(undoOutcomeFromError(new Error("500: Internal Server Error")), "failed");
    assert.equal(undoOutcomeFromStatus(202), "failed");
    assert.equal(undoOutcomeFromStatus(200), "undone");
    assert.deepEqual(undoOutcomeToast("failed"), ADD_UNDO_STRINGS.undoFailed);
    assert.deepEqual(undoOutcomeToast("undone"), ADD_UNDO_STRINGS.undone);
  });

  it("AU5: no undo is wired to apply-version, version picks or any batch add", () => {
    assert.equal((PAGE.match(/<ToastAction\b/g) ?? []).length, 1);
    assert.equal((PAGE.match(/undoAddMutation\.mutate/g) ?? []).length, 1);
    for (const name of ["applyVariantMutation", "selectMutation", "applyToCartMutation"]) {
      assert.doesNotMatch(mutationBlock(name), /ToastAction|undo/i, name);
    }
    assert.doesNotMatch(PAGE, /adopt-stops/);
  });

  it("AU6: every string is Leon's approved text in ONE constant, with no banned words", () => {
    assert.deepEqual(ADD_UNDO_STRINGS, {
      undoLabel: "Undo",
      undone: { title: "Removed from your plan", description: "That stop is out again. Your plan is back to how it was." },
      undoFailed: {
        title: "We couldn't remove that stop",
        description: "It's still in your plan. We've refreshed your plan so you can see where things stand.",
      },
      itemStays: { title: "That stop is already booked", description: "It can't be removed here, so it stays in your plan." },
    });
    const all = [
      ADD_UNDO_STRINGS.undoLabel,
      ...[ADD_UNDO_STRINGS.undone, ADD_UNDO_STRINGS.undoFailed, ADD_UNDO_STRINGS.itemStays].flatMap((t) => [t.title, t.description]),
    ];
    for (const v of all) {
      assert.doesNotMatch(v, /TODO\(Leon\)/);
      assert.doesNotMatch(v, /trending|pulse|crowd|destination intelligence/i);
    }
    // The page reads the toasts from the constant; the existing add toasts are unchanged.
    assert.match(PAGE, /onSuccess: \(outcome\) => toast\(\{ \.\.\.undoOutcomeToast\(outcome\) \}\)/);
    assert.match(PAGE, /title: "Already in your plan", description: "That stop is already on your plan\."/);
    assert.doesNotMatch(PAGE, /travelpulse|pulse|crowd|destination intel/i);
  });
});
