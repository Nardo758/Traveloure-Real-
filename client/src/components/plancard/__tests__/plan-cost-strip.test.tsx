/**
 * The slip's per-person cost strip (fix-queue row 241; inventory row 221; ledger
 * `2026-10-26-per-person-cost-strip`; the BudgetStrip board).
 *
 *   CS1  the predicate: only a traveler-entered cost counts on an unbooked stop
 *   CS2  bookings: a booked amount counts; prepared, refunded and empty amounts do not
 *   CS3  total, booking dedupe and coverage
 *   CS4  per-person math, rounded at the cent
 *   CS5  the party: one count for the divisor, "N travelers" and "for N"
 *   CS6  nothing invented: no price and no budget prints no amount
 *   CS7  the three states, one per render
 *   CS8  the strings come from PLAN_COST_STRIP_COPY
 *   CS9  the bar: share of stops priced (A), budget used and coral when over (B)
 *   CS10 the budget is planBudgetTotal
 *   CS11 viewers never see C; a plan with no stops shows nothing
 *   CS12 one component across groups
 *   CS13 copy and token discipline
 *   CS14 the one mount in SlipView
 *   CS15 what did not move
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/plan-cost-strip.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { PlanCostStrip } from "@/components/plan/PlanCostStrip";
import {
  PLAN_COST_STRIP_COPY as COPY,
  planCostStripView,
  planCostSummary,
  stopOwnPrice,
} from "@/lib/plan-cost-strip";
import { formatPlanBudget, planBudgetTotal } from "@/lib/plan-budget";
import type { PlanCardActivity } from "../plancard-types";

(globalThis as any).React = React;
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const text = (html: string) =>
  html.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

let n = 0;
const stop = (over: Partial<PlanCardActivity> = {}): PlanCardActivity =>
  ({ id: `s${++n}`, name: "Stop", type: "activity", status: "planned", time: "", location: "", cost: 0, comments: 0, ...over }) as PlanCardActivity;
const booking = (over: Record<string, unknown> = {}) =>
  ({ id: "b1", serviceId: "svc", status: "confirmed", totalAmount: "300.00", serviceName: null, ...over }) as any;
const traveler = (cost: number) => stop({ origin: "traveler", cost });
const events = [{ id: "e1", budget: "1200" }, { id: "e2", budget: "400" }] as any[];
const render = (activities: PlanCardActivity[], travelers: number | null, planEvents: any[] = [], isOwner = true) =>
  renderToString(React.createElement(PlanCostStrip, { activities, travelers, planEvents, isOwner }));

const STRIP = "client/src/components/plan/PlanCostStrip.tsx";
const HELPER = "client/src/lib/plan-cost-strip.ts";
const SLIP = "client/src/components/plancard/SlipView.tsx";

describe("plan cost strip", () => {
  it("CS1 the predicate: only a traveler-entered cost counts on an unbooked stop", () => {
    assert.deepEqual(stopOwnPrice(stop({ origin: "traveler", cost: 120 })), { amount: 120, bookingId: null });
    for (const over of [
      { origin: "ai", cost: 80 },
      { origin: "expert", cost: 50 },
      { origin: undefined, cost: 40 },
      { origin: "constructor", cost: 40 },
      { origin: "traveler", cost: 0 },
      { origin: "traveler", cost: -5 },
      { origin: "traveler", cost: NaN },
    ]) {
      assert.equal(stopOwnPrice(stop(over as any)), null, JSON.stringify(over));
    }
  });

  it("CS2 bookings: a booked amount counts; prepared, refunded and empty amounts do not", () => {
    assert.deepEqual(stopOwnPrice(stop({ booking: booking() })), { amount: 300, bookingId: "b1" });
    assert.equal(stopOwnPrice(stop({ booking: booking({ status: "payment_pending" }) })), null);
    assert.equal(stopOwnPrice(stop({ booking: booking({ refundedOutOfBand: true }) })), null);
    assert.equal(stopOwnPrice(stop({ booking: booking({ totalAmount: null }) })), null);
    assert.equal(stopOwnPrice(stop({ booking: booking({ totalAmount: "0" }) })), null);
    // A draft stop with a real booking counts the booking's amount; without one it counts nothing.
    assert.equal(stopOwnPrice(stop({ origin: "ai", cost: 80, booking: booking() }))?.amount, 300);
    assert.equal(stopOwnPrice(stop({ origin: "ai", cost: 80 })), null);
  });

  it("CS3 total, booking dedupe and coverage", () => {
    const acts = [traveler(120), stop({ booking: booking() }), stop({ booking: booking() }), stop({ origin: "ai", cost: 999 })];
    const s = planCostSummary(acts, 3);
    assert.equal(s.pricedTotal, 420);
    assert.equal(s.pricedCount, 3);
    assert.equal(s.stopCount, 4);
    const html = render(acts, 3);
    assert.doesNotMatch(html, /999/);
  });

  it("CS4 per-person math, rounded at the cent", () => {
    assert.equal(planCostSummary([traveler(420)], 3).perPerson, 140);
    assert.equal(planCostSummary([traveler(100)], 3).perPerson, 33.33);
    assert.equal(planCostSummary([traveler(200)], 3).perPerson, 66.67);
    assert.equal(planCostSummary([traveler(1200.5)], 2).perPerson, 600.25);
    assert.equal(planCostSummary([traveler(0.1), traveler(0.2)], 1).pricedTotal, 0.3);
  });

  it("CS5 the party: one count for the divisor, 'N travelers' and 'for N'", () => {
    for (const t of [null, undefined, 0, -2, 2.5, NaN]) {
      const v = planCostStripView({ activities: [traveler(420)], travelers: t as any, planEvents: [] });
      assert.equal(v.summary.perPerson, null, String(t));
      assert.equal(v.party, null, String(t));
      assert.equal(v.summary.pricedTotal, 420, String(t));
    }
    assert.equal(planCostSummary([traveler(420)], 1).perPerson, 420);
    const a = text(render([traveler(420)], 3));
    assert.ok(a.includes(COPY.perPerson(formatPlanBudget(420 / 3))));
    assert.ok(a.includes(COPY.travelers(3)));
    const b = text(render([traveler(420)], 3, events));
    assert.ok(b.includes(COPY.budgetLabel(formatPlanBudget(1600), 3)));
    assert.ok(b.includes(COPY.perPerson(formatPlanBudget(140))));
  });

  it("CS6 nothing invented: no price and no budget prints no amount", () => {
    const acts = [stop({ origin: "ai", cost: 999 }), stop()];
    const v = planCostStripView({ activities: acts, travelers: 2, planEvents: [] });
    assert.equal(v.state, "none_priced");
    assert.equal(v.summary.pricedTotal, null);
    assert.equal(v.summary.perPerson, null);
    const html = render(acts, 2);
    assert.doesNotMatch(html, /\$\d/);
    assert.doesNotMatch(html, /\$/);
    assert.doesNotMatch(html, /999/);
  });

  it("CS7 the three states, one per render", () => {
    const cases: Array<[PlanCardActivity[], any[], string]> = [
      [[traveler(50), stop()], [], "priced_no_budget"],
      [[traveler(50)], events, "budget_set"],
      [[stop()], events, "budget_set"],
      [[stop()], [], "none_priced"],
    ];
    for (const [acts, ev, state] of cases) {
      assert.equal(planCostStripView({ activities: acts, travelers: 2, planEvents: ev }).state, state);
      const html = render(acts, 2, ev);
      assert.match(html, new RegExp(`data-state="${state}"`));
      assert.equal(html.match(/data-testid="plan-cost-strip"/g)?.length, 1);
    }
  });

  it("CS8 the strings come from PLAN_COST_STRIP_COPY", () => {
    const acts = [traveler(120), stop({ booking: booking() }), stop({ booking: booking() }), stop()];
    const a = text(render(acts, 3));
    assert.ok(a.includes(COPY.pricedSoFarLabel));
    assert.ok(a.includes(formatPlanBudget(420)));
    assert.ok(a.includes("$140 per person"));
    assert.ok(a.includes(COPY.travelers(3)));
    assert.ok(a.includes(COPY.coverageA(3, 4)));
    assert.ok(a.includes(COPY.unpriced(1)));
    assert.ok(a.includes(COPY.footnote));
    assert.ok(text(render([traveler(420)], 1)).includes(COPY.travelers(1)));
    const noParty = text(render([traveler(420)], null));
    assert.ok(!noParty.includes("per person") && !noParty.includes("traveler"));
    assert.doesNotMatch(render([traveler(420), traveler(10)], 2), /plan-cost-strip-unpriced/);
    const b = text(render([traveler(100)], 2, events));
    assert.ok(b.includes("Budget · $1,600 for 2"));
    assert.ok(b.includes(COPY.coverageB(1, 1)));
    const c = text(render([stop()], 2));
    assert.ok(c.includes(COPY.noneTitle) && c.includes(COPY.noneSub));
  });

  it("CS9 the bar: share of stops priced (A), budget used and coral when over (B)", () => {
    const seven = [...Array.from({ length: 7 }, () => traveler(10)), ...Array.from({ length: 17 }, () => stop())];
    assert.equal(planCostStripView({ activities: seven, travelers: 2, planEvents: [] }).barPercent, 29);
    const budget = [{ id: "e", budget: "1200" }] as any[];
    const b = planCostStripView({ activities: [traveler(744)], travelers: 2, planEvents: budget });
    assert.equal(b.barPercent, 62);
    assert.equal(b.remaining, 456);
    assert.ok(b.text.secondary?.startsWith("priced · $456 left · "));
    const notOver = render([traveler(744)], 2, budget);
    assert.match(notOver, /var\(--slip-teal\)/);
    assert.doesNotMatch(notOver, /data-over/);
    const over = planCostStripView({ activities: [traveler(1500)], travelers: 2, planEvents: budget });
    assert.equal(over.barPercent, 100);
    assert.equal(over.over, true);
    assert.equal(over.remaining, null);
    const overHtml = render([traveler(1500)], 2, budget);
    assert.doesNotMatch(text(overHtml), /left/);
    assert.match(overHtml, /data-over="true"/);
    assert.match(overHtml, /var\(--coral-fill\)/);
    const exact = planCostStripView({ activities: [traveler(1200)], travelers: 2, planEvents: budget });
    assert.equal(exact.over, false);
    assert.ok(exact.text.secondary?.includes("$0 left"));
    const zero = planCostStripView({ activities: [stop()], travelers: 2, planEvents: [{ id: "e", budget: "0" }] as any[] });
    assert.equal(zero.barPercent, 0);
    assert.equal(planCostStripView({ activities: [stop()], travelers: 2, planEvents: [] }).barPercent, null);
    assert.doesNotMatch(render([stop()], 2), /plan-cost-strip-bar/);
  });

  it("CS10 the budget is planBudgetTotal", () => {
    const v = planCostStripView({ activities: [stop()], travelers: 2, planEvents: events });
    assert.equal(v.budgetTotal, planBudgetTotal(events)!.total);
    assert.ok(v.text.label?.includes(formatPlanBudget(planBudgetTotal(events)!.total)));
    const html = text(render([stop()], 2, events));
    assert.ok(html.includes("$0") && html.includes(COPY.pricedWord) && html.includes("$1,600 left"));
    assert.ok(!html.includes("per person"));
  });

  it("CS11 viewers never see C; a plan with no stops shows nothing", () => {
    assert.equal(render([stop()], 2, [], false), "");
    assert.match(render([traveler(50)], 2, [], false), /data-state="priced_no_budget"/);
    assert.match(render([stop()], 2, events, false), /data-state="budget_set"/);
    assert.equal(render([], 2, events, true), "");
    assert.equal(render([], 2, events, false), "");
  });

  it("CS12 one component across groups", () => {
    assert.doesNotMatch(stripComments(read(STRIP)), /experienceGroup|manifestFor|occasion|\bgroup\b/);
    const acts = [traveler(120), stop()];
    const htmls = ["trip", "moment", "celebration", "hosted_event", "group_travel"].map(() => render(acts, 2, events));
    assert.ok(htmls.every((h) => h === htmls[0]));
  });

  it("CS13 copy and token discipline", () => {
    assert.ok(Object.isFrozen(COPY));
    const values = [
      COPY.pricedSoFarLabel, COPY.budgetLabel("$1", 2), COPY.budgetLabel("$1", null), COPY.perPerson("$1"), COPY.travelers(1),
      COPY.travelers(2), COPY.pricedWord, COPY.left("$1"), COPY.coverageA(1, 2), COPY.coverageA(1, 1), COPY.unpriced(1),
      COPY.coverageB(1, 2), COPY.coverageB(1, 1), COPY.footnote, COPY.noneTitle, COPY.noneSub,
    ];
    for (const v of values) assert.doesNotMatch(v, /\bAI\b|estimat|~|about |approx/i, v);
    const src = stripComments(read(STRIP));
    assert.doesNotMatch(src, /"[A-Z][a-z]+ [a-z]+/);
    for (const f of [STRIP, HELPER]) assert.doesNotMatch(stripComments(read(f)), /#[0-9a-fA-F]{3,8}\b/, f);
    assert.doesNotMatch(src, /<button|onClick/);
    assert.doesNotMatch(src, /slip-faint/);
    const tokens = read("client/src/styles/slip-tokens.css");
    for (const v of src.match(/var\(--slip-[a-z-]+\)/g) ?? []) assert.ok(tokens.includes(`${v.slice(4, -1)}:`), v);
    assert.match(read("client/src/index.css"), /--coral-fill:/);
    for (const id of src.match(/data-testid="[^"]+"/g) ?? []) assert.match(id, /^data-testid="plan-cost-strip/);
  });

  it("CS14 the one mount in SlipView", () => {
    const code = stripComments(read(SLIP));
    assert.equal(code.match(/<PlanCostStrip/g)?.length, 1);
    const at = code.indexOf("<PlanCostStrip");
    assert.ok(code.indexOf("<SlipHeader") < at && at < code.indexOf("<ToolsTray"));
    const before = code.slice(Math.max(0, at - 400), at);
    assert.doesNotMatch(before, /experienceGroup ===|isOwner &&|slipView ===/);
    assert.doesNotMatch(code.slice(at, code.indexOf("/>", at)), /data-testid/);
    for (const f of [
      "client/src/components/plancard/SlipRail.tsx",
      "client/src/components/plancard/PlanCard.tsx",
      "client/src/components/plancard/CollapsedSections.tsx",
    ]) {
      assert.doesNotMatch(read(f), /PlanCostStrip/, f);
    }
  });

  it("CS15 what did not move", () => {
    const collapsed = read("client/src/components/plancard/CollapsedSections.tsx");
    assert.ok(collapsed.includes("Per person") && collapsed.includes("collapsed-budget-"));
    assert.ok(
      read("client/src/lib/plan-budget.ts").includes(
        "return `Budget across ${summary.eventCount} ${unit}: ${formatPlanBudget(summary.total)}`;",
      ),
    );
    assert.ok(read("client/src/components/plancard/SlipRail.tsx").includes('data-testid="slip-plan-budget"'));
    assert.match(read("shared/group-manifest.ts"), /budget: SOON/);
    for (const f of [STRIP, HELPER]) assert.doesNotMatch(read(f), /@\/lib\/api|react-query|fetch\(/, f);
    // TN9's allowlist includes this file (an includes check, not a count).
    assert.ok(
      read("client/src/components/plancard/__tests__/b8-live-site-unchecked-minutes.test.tsx").includes(
        '"client/src/components/plancard/__tests__/plan-cost-strip.test.tsx",',
      ),
    );
  });
});
