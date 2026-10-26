/**
 * A4 — the compare view's words (ledger `2026-09-29-a4-plan-fit-compare`).
 *   C1  travel / day: minutes only when every day is checked; otherwise "Not checked yet"
 *       (or, when some days are checked, a note that says so — never a total)
 *   C2  walkable areas: "2 of 3" + "est."; "areas not known" when no area is; never a zero
 *   C3  price: the dated offer (the stay's total, "for your N nights"); a listing's stated price;
 *       otherwise "price from the hotel" — never "$0", never typed
 *   C4  M9's line, the letters, the title and the foot (no promise of a paid run)
 *   C5  B8: a checked day shows its minutes; an unchecked day shows "Not checked yet";
 *       Travel / day does not total a mix
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PlanFit } from "@shared/plan-fit";
import {
  PLAN_COMPARE_MINUTE_COPY,
  areasCell,
  compareBurdenLine,
  compareFootLine,
  compareSavingsShown,
  compareTitle,
  dayStripCells,
  easierLine,
  optionLetter,
  priceCell,
  savesLine,
  travelCell,
} from "../plan-compare";

const fit = (over: Partial<Extract<PlanFit, { scored: true }>> = {}): PlanFit => ({
  scored: true,
  minutesPerDay: 31,
  minutesByDay: {},
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
    assert.equal(PLAN_COMPARE_MINUTE_COPY.notCheckedYet, "Not checked yet");
    // A straight-line figure (no checked day) is not a minute total.
    assert.deepEqual(travelCell(fit()), { value: "Not checked yet", note: "" });
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
    // Copy pin (held-batch-1 item 17, board copy ruled Oct 9, 2026).
    assert.equal(compareTitle(3), "Which one fits your days?");
    assert.equal(compareTitle(1), "Which one fits your days?");
    assert.equal(compareFootLine("open", null, 3), "Not chosen yet — your plan keeps all 3 open.");
    assert.equal(compareFootLine("chosen", "Ryokan B", 3), "You chose Ryokan B. You can change your mind until you book.");
    assert.doesNotMatch(compareFootLine("open", null, 3), /paid|run|version/i);
  });

  it("C5: a checked day shows minutes; an unchecked day says Not checked yet", () => {
    const mixed = fit({
      basis: "est",
      minutesPerDay: 40,
      minutesByDay: { 1: 42, 2: 18 },
      checkedByDay: { 1: true, 2: false },
    });
    assert.deepEqual(dayStripCells(mixed), [
      { day: 1, label: "Day 1", minutes: "42 min" },
      { day: 2, label: "Day 2", minutes: "Not checked yet" },
    ]);
    const none = fit({ minutesByDay: { 1: 42, 2: 18 }, checkedByDay: { 1: false, 2: false } });
    assert.equal(dayStripCells(none)[0].minutes, "Not checked yet");
    assert.equal(dayStripCells(none)[1].minutes, "Not checked yet");
    assert.doesNotMatch(dayStripCells(none).map((c) => c.minutes).join(" "), /\d|~/);
  });

  it("C5b: Travel / day does not total a mix, and does not count an unchecked day as zero", () => {
    const mixed = fit({
      basis: "est",
      minutesPerDay: 40,
      minutesByDay: { 1: 42, 2: 18 },
      checkedByDay: { 1: true, 2: false },
    });
    const cell = travelCell(mixed);
    assert.deepEqual(cell, { value: "—", note: PLAN_COMPARE_MINUTE_COPY.someDaysNotChecked });
    assert.equal(PLAN_COMPARE_MINUTE_COPY.someDaysNotChecked, "Some days are not checked yet");
    assert.doesNotMatch(`${cell.value} ${cell.note}`, /\d/);
    assert.notEqual(cell.value, "42 min");
    assert.notEqual(cell.value, "40 min");
    assert.notEqual(cell.value, "0 min");
    assert.notEqual(cell.value, "60 min");

    const all = fit({
      basis: "matrix",
      minutesPerDay: 33,
      minutesByDay: { 1: 42, 2: 18 },
      checkedByDay: { 1: true, 2: true },
    });
    assert.deepEqual(travelCell(all), { value: "33 min", note: "per day" });
    assert.deepEqual(
      dayStripCells(all).map((c) => c.minutes),
      ["42 min", "18 min"],
    );

    const none = fit({ minutesPerDay: 40, minutesByDay: { 1: 42 }, checkedByDay: { 1: false } });
    assert.deepEqual(travelCell(none), { value: "Not checked yet", note: "" });
    assert.notEqual(travelCell(none).value, "0 min");
  });

  it("C5c: the fit line and the savings line carry no straight-line minutes", () => {
    const estFit = fit({ minutesByDay: { 1: 12 }, checkedByDay: { 1: false } });
    assert.equal(compareBurdenLine(estFit), "based on 9 of 12 located stops");
    assert.doesNotMatch(compareBurdenLine(estFit), /min|~/);
    assert.equal(compareSavingsShown(estFit), false);
    const checked = fit({ basis: "matrix", minutesByDay: { 1: 12 }, checkedByDay: { 1: true } });
    assert.match(compareBurdenLine(checked), /^31 min\/day getting around/);
    assert.doesNotMatch(compareBurdenLine(checked), /est\./);
    assert.equal(compareSavingsShown(checked), true);
    for (const sentence of Object.values(PLAN_COMPARE_MINUTE_COPY)) {
      assert.doesNotMatch(sentence, /\bAI\b/);
    }
  });
});
