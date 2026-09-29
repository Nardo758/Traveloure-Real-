/**
 * A4 — the compare view's words (ledger `2026-09-29-a4-plan-fit-compare`).
 *   C1  travel / day: minutes + "est." on a straight-line figure; a dash and a reason when unscored
 *   C2  walkable areas: "2 of 3" + "est."; "areas not known" when no area is; never a zero
 *   C3  price: the dated offer (the stay's total, "for your N nights"); a listing's stated price;
 *       otherwise "price from the hotel" — never "$0", never typed
 *   C4  M9's line, the letters, the title and the foot (no promise of a paid run)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PlanFit } from "@shared/plan-fit";
import {
  areasCell,
  compareFootLine,
  compareTitle,
  easierLine,
  optionLetter,
  priceCell,
  savesLine,
  travelCell,
} from "../plan-compare";

const fit = (over: Partial<Extract<PlanFit, { scored: true }>> = {}): PlanFit => ({
  scored: true,
  minutesPerDay: 31,
  basis: "est",
  coverage: 2 / 3,
  areasNear: 2,
  areasTotal: 3,
  located: 9,
  total: 12,
  ...over,
});

describe("plan-compare words", () => {
  it("C1: travel / day", () => {
    assert.deepEqual(travelCell(fit()), { value: "31 min", note: "est." });
    assert.deepEqual(travelCell(fit({ basis: "matrix" })), { value: "31 min", note: "per day" });
    assert.deepEqual(travelCell({ scored: false, reason: "option_unlocated", located: 3, total: 4 }), { value: "—", note: "no pin yet" });
    assert.deepEqual(travelCell({ scored: false, reason: "too_few_located", located: 1, total: 4 }), { value: "—", note: "not enough stops yet" });
  });

  it("C2: walkable areas", () => {
    assert.deepEqual(areasCell(fit()), { value: "2 of 3", note: "of your areas · est." });
    assert.deepEqual(areasCell(fit({ coverage: null, areasNear: 0, areasTotal: 0 })), { value: "—", note: "areas not known" });
    assert.deepEqual(areasCell(fit({ coverage: 0, areasNear: 0, areasTotal: 2 })), { value: "0 of 2", note: "of your areas · est." });
  });

  it("C3: price — dated offer, listing price, else 'price from the hotel'", () => {
    const dated = priceCell({ datedPrice: { amount: "812.40", currency: "USD", nights: 4 }, priceSnapshot: null, sourceKind: "engine" });
    assert.match(dated.value, /812/);
    assert.equal(dated.note, "for your 4 nights");
    assert.equal(priceCell({ datedPrice: { amount: "90", currency: "USD", nights: 1 }, priceSnapshot: null, sourceKind: "custom" }).note, "for your 1 night");
    assert.deepEqual(priceCell({ datedPrice: null, priceSnapshot: null, sourceKind: "custom" }), { value: "—", note: "price from the hotel" });
    assert.deepEqual(priceCell({ datedPrice: null, priceSnapshot: "0.00", sourceKind: "listing" }), { value: "—", note: "price from the hotel" }, "never $0");
    assert.equal(priceCell({ datedPrice: null, priceSnapshot: "140", sourceKind: "listing" }).note, "listed price");
    assert.deepEqual(priceCell({ datedPrice: null, priceSnapshot: "140", sourceKind: "custom" }), { value: "—", note: "price from the hotel" }, "a custom place's price is never typed");
  });

  it("C4: M9's line, letters, title, foot", () => {
    assert.equal(savesLine(21, fit()), "21 min less travel per day than your choice · est.");
    assert.equal(savesLine(21, fit({ basis: "matrix" })), "21 min less travel per day than your choice");
    assert.equal(easierLine(1), "1 place would make your days easier");
    assert.equal(easierLine(2), "2 places would make your days easier");
    assert.deepEqual([1, 2, 3].map(optionLetter), ["A", "B", "C"]);
    assert.equal(compareTitle(3), "Compare 3 places");
    assert.equal(compareTitle(1), "Compare 1 place");
    assert.equal(compareFootLine("open", null, 3), "Not chosen yet — your plan keeps all 3 open.");
    assert.equal(compareFootLine("chosen", "Ryokan B", 3), "You chose Ryokan B. You can change your mind until you book.");
    assert.doesNotMatch(compareFootLine("open", null, 3), /paid|run|version/i);
  });
});
