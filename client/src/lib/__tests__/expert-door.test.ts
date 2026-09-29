/**
 * The expert door's slip words (ledger `2026-09-29-expert-door`).
 *   X1  the door lands on the plan's slip with the help card asked for
 *   X2  a level's line: band and count, or nothing numeric when nobody offers it
 *   X3  a listing's price: its own published price, else "By quote" — never "$0"; only a priced
 *       listing is requestable on the storefront rail (which refuses a priceless one)
 *   X4  the three choices, in order, and the "Handle it for me" line never says the expert pays (LD 42 D19)
 *   X5  the empty state's action promises no message — it says the interest is recorded (#1183 rulings)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HELP_LEVEL_CHOICES, emptyActionLabel, expertDoorHref, levelBandLine, offeringPriceLabel, offeringRequestable } from "../expert-door";

describe("expert door words", () => {
  it("X1: the door's address", () => {
    assert.equal(expertDoorHref("t1"), "/plans/t1?help=expert");
  });
  it("X2: band and count, or no number", () => {
    assert.equal(levelBandLine("$60", 1), "$60 · 1 local expert");
    assert.equal(levelBandLine("$60–$240", 2), "$60–$240 · 2 local experts");
    assert.equal(levelBandLine("By quote", 1), "By quote · 1 local expert");
    assert.equal(levelBandLine(null, 0), null);
  });
  it("X3: price and requestability", () => {
    assert.equal(offeringPriceLabel("60.00", true), "$60");
    assert.equal(offeringPriceLabel(null, null), "By quote");
    assert.equal(offeringPriceLabel("0", true), "By quote");
    assert.equal(offeringPriceLabel("80", false), "By quote");
    assert.equal(offeringRequestable("60", null), true);
    assert.equal(offeringRequestable(null, null), false);
    assert.equal(offeringRequestable("80", false), false);
  });
  it("X4: the choices", () => {
    assert.deepEqual(HELP_LEVEL_CHOICES.map((c) => c.title), ["Check my plan", "Plan it with me", "Handle it for me"]);
    const handle = HELP_LEVEL_CHOICES.find((c) => c.level === "handle")!;
    assert.match(handle.line, /you approve and pay/);
  });
  it("X5: the empty action records, it does not promise", () => {
    assert.equal(emptyActionLabel("Kyoto"), "Start with the free AI draft. We record your interest so a Kyoto expert can pick it up.");
    assert.equal(emptyActionLabel(null), "Start with the free AI draft. We record your interest so a local expert can pick it up.");
    assert.doesNotMatch(emptyActionLabel("Kyoto"), /tell you|notify|let you know|email/i);
  });
});
