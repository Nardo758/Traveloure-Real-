/**
 * A4 — the compare view's words (ledger `2026-09-29-a4-plan-fit-compare`).
 *   C1  travel / day: minutes only when every scored day has a checked leg; otherwise "Not checked yet".
 *       A dash and a reason when unscored. Never "est."
 *   C2  walkable areas: "2 of 3" + "est."; "areas not known" when no area is; never a zero
 *   C3  price: the dated offer (the stay's total, "for your N nights"); a listing's stated price;
 *       otherwise "price from the hotel" — never "$0", never typed
 *   C4  M9's line (minutes only when every scored day is checked), the letters, the title and the foot
 *   C5  a day with a checked (routed) leg shows minutes; a day without shows "Not checked yet";
 *       Travel / day follows that same rule
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PlanFit } from "@shared/plan-fit";
import {
  areasCell,
  compareFitLine,
  compareFootLine,
  compareTitle,
  daysWithCheckedLeg,
  easierLine,
  optionLetter,
  PLAN_COMPARE_COPY,
  priceCell,
  savesLine,
  travelCell,
  dayStripCells,
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

const routed = {
  line: null,
  fare: null,
  provenance: { source: "osrm", checkedAt: "2026-10-25T12:00:00.000Z" },
};

describe("plan-compare words", () => {
  it("C1: travel / day shows minutes only when every scored day is checked", () => {
    assert.equal(PLAN_COMPARE_COPY.notCheckedYet, "Not checked yet");
    assert.deepEqual(travelCell(fit()), { value: "Not checked yet", note: "" }, "no scored days ⇒ not checked");
    assert.deepEqual(travelCell(fit({ basis: "matrix", minutesByDay: { 1: 31 } })), { value: "Not checked yet", note: "" });
    assert.deepEqual(travelCell(fit({ basis: "matrix", minutesByDay: { 1: 31 } }), new Set([1])), { value: "31 min", note: "per day" });
    assert.deepEqual(travelCell(fit({ basis: "est", minutesByDay: { 1: 10, 2: 20 } }), new Set([1])), { value: "Not checked yet", note: "" });
    assert.equal(travelCell(fit({ basis: "est", minutesByDay: { 1: 31 } }), new Set([1])).note, "per day");
    assert.doesNotMatch(travelCell(fit({ basis: "est", minutesByDay: { 1: 31 } }), new Set([1])).value, /est/);
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
    assert.equal(savesLine(21, fit()), "Not checked yet");
    assert.equal(savesLine(21, fit({ basis: "est", minutesByDay: { 1: 31 } }), new Set([1])), "21 min less travel per day than your choice");
    assert.doesNotMatch(savesLine(21, fit({ basis: "est", minutesByDay: { 1: 31 } }), new Set([1])), /est/);
    assert.equal(compareFitLine(fit()), "Not checked yet");
    assert.equal(compareFitLine({ scored: false, reason: "too_few_located", located: 1, total: 4 }), "Add a few things to your days to see how each place fits");
    assert.equal(
      compareFitLine(fit({ basis: "est", minutesByDay: { 1: 14 }, minutesPerDay: 14, located: 6, total: 9 }), new Set([1])),
      "14 min/day getting around · based on 6 of 9 located stops",
    );
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

  it("C5: a checked leg shows that day's minutes; a day without one says Not checked yet; Travel / day follows", () => {
    const days = [
      {
        dayNumber: 1,
        activities: [{ id: "a" }, { id: "b" }],
        transports: [{ id: "ab", fromActivityId: "a", toActivityId: "b", recommendedMode: "walk", estimatedDurationMinutes: 12, routed }],
      },
      {
        dayNumber: 2,
        activities: [{ id: "c" }, { id: "d" }],
        transports: [{
          id: "cd",
          fromActivityId: "c",
          toActivityId: "d",
          recommendedMode: "walk",
          estimatedDurationMinutes: 40,
          alternativeModes: [{ reason: "straight_line_est" }],
        }],
      },
      {
        dayNumber: 3,
        activities: [{ id: "e" }, { id: "f" }],
        legsNotChecked: [{ fromActivityId: "e", toActivityId: "f" }],
      },
    ];
    const checked = daysWithCheckedLeg(days);
    assert.deepEqual([...checked], [1], "only the leg that carries routed facts counts");
    const scored = fit({ minutesPerDay: 40, minutesByDay: { 2: 55.4, 1: 18, 3: 9 }, basis: "est" });
    const strip = dayStripCells(scored, checked);
    assert.deepEqual(strip.map((cell) => [cell.day, cell.minutes]), [
      [1, "18 min"],
      [2, "Not checked yet"],
      [3, "Not checked yet"],
    ]);
    assert.ok(strip.every((cell) => !cell.minutes.includes("~")));
    assert.deepEqual(travelCell(scored, checked), { value: "Not checked yet", note: "" }, "one unchecked day withholds the mean");
    const allChecked = daysWithCheckedLeg([
      days[0],
      {
        dayNumber: 2,
        activities: [{ id: "c" }, { id: "d" }],
        transports: [{ id: "cd", fromActivityId: "c", toActivityId: "d", recommendedMode: "transit", estimatedDurationMinutes: 22, routed }],
      },
    ]);
    const twoDays = fit({ minutesPerDay: 40, minutesByDay: { 1: 18, 2: 55 }, basis: "est" });
    assert.deepEqual([...allChecked].sort(), [1, 2]);
    assert.deepEqual(dayStripCells(twoDays, allChecked).map((cell) => cell.minutes), ["18 min", "55 min"]);
    assert.deepEqual(travelCell(twoDays, allChecked), { value: "40 min", note: "per day" });
  });
});
