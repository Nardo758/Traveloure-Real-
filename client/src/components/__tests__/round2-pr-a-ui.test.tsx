/**
 * PR A — round-2 UI fixes, second commit (Coding Bot's round-2 Doc, Nov 10; Leon rulings 12:34 PM ET).
 *
 *   TB2.7-1 a spine chip with a zero count is not drawn; "All gems" always is; an active hidden chip reads as "all"
 *   TB2.7-2 every selected listing type with no listings says so through ONE template (the concierge sentence's shape)
 *   TB2.8-1 the city-feed drawer and the recommendation "why" dialogs name `aria-describedby={undefined}` (Radix's
 *           "no separate description"), so no Description warning and no invented sentence
 *   TB3.9-1 a day that HOLDS stops is dated by the plan window exactly as an empty day is (`mapDayChips`)
 *   TB3.10-1 a stored location equal to the stop's name draws no place line ("Kibune / Kibune")
 *   TB4.11-1 ONE `ApplicationStepTracker` over both wizards: it wraps, never scrolls, and every step title is in the DOM
 *            for a 7-step and a 5-step list; neither page keeps an inline tracker
 *   TB4.12/13-1 /earn draws both approved sentences from `EARN_ROUND2_COPY`, verbatim
 *
 * Run: npx tsx --test client/src/components/__tests__/round2-pr-a-ui.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
// tsconfig keeps `jsx: preserve`; under tsx the classic runtime needs React in scope (the suite's own convention).
(globalThis as any).React = React;
import { SPINE_CHIPS, effectiveSpineFilter, shownSpineChips } from "../../lib/spine-chips";
import { emptyConciergeLine, emptyServiceTypeLine } from "../../lib/service-type-filter";
import { mapDayChips } from "../../lib/map-days";
import { itemPlaceLine } from "../../lib/place-facts";
import { ApplicationStepTracker } from "../application-step-tracker";
import { EARN_ROUND2_COPY } from "@shared/earn-round2-copy";

const read = (p: string) => readFileSync(p, "utf8");

describe("TB2.7 — zero-supply filters", () => {
  it("TB2.7-1 hides zero-count spine chips, keeps All, and reconciles the active chip", () => {
    const counts = { all: 29, eat: 4, do: 15, events: 8, photo_spots: 2 };
    assert.deepEqual(shownSpineChips(counts).map((c) => c.id), ["all", "eat", "do", "events", "photo_spots"]);
    assert.equal(effectiveSpineFilter("stay", counts), "all", "a hidden chip never filters the feed");
    assert.equal(effectiveSpineFilter("do", counts), "do");
    assert.deepEqual(shownSpineChips({}).map((c) => c.id), ["all"], "no counts yet ⇒ only All");
    assert.equal(SPINE_CHIPS.length, 9);
    const page = read("client/src/pages/discover-location.tsx");
    assert.match(page, /\{shownSpineChips\(counts\)\.map\(\(chip\) => \{/);
    assert.match(page, /const spineFilter = effectiveSpineFilter\(activeFilter, chipCounts\);/);
    assert.match(page, /<SpineChipRail active=\{spineFilter\}/);
    assert.match(page, /activeFilter=\{spineFilter\}/);
  });

  it("TB2.7-2 one empty-state template for every listing type; concierge output unchanged", () => {
    assert.equal(emptyServiceTypeLine("concierge", "Kyoto"), emptyConciergeLine("Kyoto"));
    assert.equal(emptyServiceTypeLine("planning", "Kyoto"), "No trip planning listings in Kyoto yet.");
    assert.equal(emptyServiceTypeLine("", "Kyoto"), null, "no filter ⇒ no line");
    assert.equal(emptyServiceTypeLine("bogus", "Kyoto"), null, "an unknown type is the server's refusal, not a line");
    const page = read("client/src/pages/discover-location.tsx");
    assert.match(page, /serviceType !== "" && servicesForFeed\.length === 0 && [^\n]*emptyServiceTypeLine\(serviceType, displayCity\) && \(/);
  });
});

describe("TB2.8 — dialog descriptions", () => {
  it("TB2.8-1 the feed drawer and both recommendation dialogs declare no separate description", () => {
    const card = read("client/src/components/city-feed-card.tsx");
    assert.match(card, /<SheetContent[\s\S]{0,600}aria-describedby=\{undefined\}[\s\S]{0,200}data-testid=\{`city-feed-card-sheet-\$\{cardType\}`\}/);
    const rec = read("client/src/components/city-feed-card-recommendation.tsx");
    assert.equal((rec.match(/<DialogContent className="max-w-md" aria-describedby=\{undefined\}/g) ?? []).length, 2);
    const panel = read("client/src/components/feed/tile-detail-panel.tsx");
    assert.match(panel, /<SheetDescription className="sr-only">/, "the tile panel already carried one (the Phase 0 pin was the drawer, not this file)");
  });
});

describe("TB3.9 / TB3.10 — the guest plan's days and rows", () => {
  it("TB3.9-1 a day with stops keeps the window's date", () => {
    const withStop = { dayNum: 2, date: "", label: "Day 2", activities: [{ id: "a", name: "Gion" }], transports: [] } as any;
    const days = mapDayChips([withStop], { startDate: "2026-12-01", endDate: "2026-12-04", datesConfirmed: true });
    assert.deepEqual(days.map((d) => [d.dayNum, (d as any).dateIso]), [[1, "2026-12-01"], [2, "2026-12-02"], [3, "2026-12-03"], [4, "2026-12-04"]]);
    assert.equal(days[1].activities.length, 1, "the stop is kept");
    assert.ok(days[1].date, "the day with the stop is dated");
    // Unconfirmed dates: no day is dated, stops or not (R5-5 unchanged).
    const undated = mapDayChips([withStop], { startDate: "2026-12-01", endDate: "2026-12-04", datesConfirmed: false });
    assert.equal((undated[1] as any).dateIso ?? null, null);
    // A day the caller already dated keeps its own.
    const own = { ...withStop, date: "Dec 2", dateIso: "2026-12-02" };
    assert.equal((mapDayChips([own], { startDate: "2026-12-01", endDate: "2026-12-04", datesConfirmed: true })[1] as any).dateIso, "2026-12-02");
  });

  it("TB3.10-1 a location that repeats the name is not a place line", () => {
    assert.equal(itemPlaceLine(undefined, { name: "Kibune", location: "Kibune" }), null);
    assert.equal(itemPlaceLine(undefined, { name: "Kibune", location: " kibune " }), null);
    assert.deepEqual(itemPlaceLine(undefined, { name: "Kibune", location: "Kifune Shrine" }), { text: "Kifune Shrine", provenance: null, checked: null, sourceUrl: null });
    assert.deepEqual(itemPlaceLine(undefined, { location: "Kibune" }), { text: "Kibune", provenance: null, checked: null, sourceUrl: null }, "no name to compare ⇒ unchanged");
  });
});

describe("TB4.11 — the application step tracker", () => {
  const seven = [1, 2, 3, 4, 5, 6, 7].map((id) => ({ id, title: `Step title ${id}` }));
  const five = [1, 2, 3, 4, 5].map((id) => ({ id, title: `Provider ${id}` }));
  it("TB4.11-1 wraps, never scrolls, and names every step", () => {
    for (const [steps, current] of [[seven, 3], [five, 5]] as const) {
      const html = renderToString(<ApplicationStepTracker steps={steps} currentStep={current} testId="t" />);
      assert.doesNotMatch(html, /overflow-x-auto/);
      assert.match(html, /flex flex-wrap/);
      for (const s of steps) assert.ok(html.includes(s.title), `${s.title} is in the DOM`);
      assert.equal((html.match(/data-testid="t-step-/g) ?? []).length, steps.length);
      assert.match(html, /aria-current="step"/);
      assert.doesNotMatch(html, /sm:w-8|md:w-12|md:w-20/, "no fixed-width connector");
    }
    for (const p of ["client/src/pages/travel-experts.tsx", "client/src/pages/services-provider.tsx"]) {
      const src = read(p);
      assert.match(src, /<ApplicationStepTracker steps=\{steps\} currentStep=\{currentStep\}/);
      assert.doesNotMatch(src, /overflow-x-auto/);
      assert.doesNotMatch(src, /currentStep > step\.id/, "no inline tracker left");
    }
  });
});

describe("TB4.12 / TB4.13 — /earn", () => {
  it("TB4.12/13-1 both approved sentences are drawn verbatim", () => {
    assert.equal(EARN_ROUND2_COPY.localExpertsApplyNow, "Local experts, apply now");
    assert.equal(EARN_ROUND2_COPY.payoutSentence, "Payouts go through Stripe to your bank details. As a partner you never enter a card.");
    const earn = read("client/src/pages/earn.tsx");
    assert.match(earn, /data-testid="earn-local-experts-apply-now"[\s\S]{0,80}\{EARN_ROUND2_COPY\.localExpertsApplyNow\}/);
    assert.match(earn, /data-testid="earn-payout-sentence">\s*\{EARN_ROUND2_COPY\.payoutSentence\}/);
    assert.match(earn, /onClick=\{applyAsLocalExpert\}[\s\S]{0,200}data-testid="earn-local-experts-apply-now"/, "the same door as the catalog's apply button");
  });
});
