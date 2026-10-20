/**
 * P0-e additions 5, 5b, 7, 8 (decision-maker, Oct 12, 2026 — after Chrome's read of the Trip Card at
 * dc72f272f; ledger `2026-10-12-p0e-findings-and-gaps`).
 *
 *   PA1 5: the hero says "Travel legs", never "Transit legs"
 *   PA2 5: the selected day's panel line — "Thu Nov 12 · 2 legs · 6 stops", stays in neither count
 *   PA3 5: the maps header follows the day it is given; transport counts the card's legs
 *   PA4 5b: every stop-to-stop leg on the card is labelled "From → To"
 *   PA5 7: the closing warning reads the SHOWN hours fact — Google with its caveat, official when shown
 *   PA6 7: the hours line is printed once
 *   PA8 7: a last-entry fact covering the date is preferred ("Last entry 4:30 PM · …")
 *   PA7 8: no budget strip on the card; other surfaces keep theirs
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/p0e-card-additions.test.tsx
 */
// Node 20 (CI) has no global navigator and the card's map code reads it on load — the stub is imported first.
import "./node-navigator-stub";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PlanCardHeader } from "../PlanCardHeader";
import { CollapsedSections } from "../CollapsedSections";
import { TripCardDays, cardDayPanelLine, cardLegEndsLabel } from "../TripCardDays";
import { ItemRow } from "@/components/plan/ItemRow";
import { PlanRowLookProvider } from "@/components/plan/row-look";
import { itemClosingWarning, itemFactsLine } from "@/lib/place-facts";
import type { FactView } from "@shared/content-facts";

(globalThis as any).React = React;
const text = (html: string) => html.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const withQuery = (el: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return renderToString(React.createElement(QueryClientProvider, { client: qc, children: el }));
};

const act = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, time: "10:00", location: "", type: "activity", ...extra }) as any;
// Thu Nov 12 2026: a stay, six stops, two own legs (a→b, c→d), plus the stay legs the engine writes.
const thu = {
  dayNum: 2,
  date: "Nov 12",
  dateIso: "2026-11-12",
  activities: [act("s", "Hotel Kyoto", { type: "accommodation", category: "lodging" }), act("a", "Bamboo Grove"), act("b", "Tenryu-ji"), act("c", "Nanzen-ji"), act("d", "Nishiki Market"), act("e", "Gion"), act("f", "Pontocho")],
  transports: [
    { id: "L1", fromActivityId: "a", toActivityId: "b", legOrder: 1, mode: "driving", estimatedDurationMinutes: 5 },
    { id: "L2", fromActivityId: "c", toActivityId: "d", legOrder: 2, mode: "driving", estimatedDurationMinutes: 16 },
    { id: "LS", fromActivityId: "s", toActivityId: "a", legOrder: 0, mode: "driving", estimatedDurationMinutes: 20 },
  ],
} as any;

const googleHours: FactView = {
  factType: "hours",
  need: "stop.hours",
  value: { weekdayDescriptions: ["Thursday: 8:30 AM – 5:00 PM"] },
  origin: "places_api",
  sourceUrl: "https://maps.google.com/?cid=1",
  provenance: "Google Maps · checked 4 Oct",
  checkedAt: "2026-10-04T09:00:00Z",
  stale: true,
  publishable: false,
} as any;
const officialHours: FactView = {
  factType: "hours",
  need: "stop.hours",
  value: { weekdayDescriptions: ["Thursday: 8:30 AM – 5:00 PM"], season: { from: "03-01", to: "11-30" } },
  origin: "official_refresh",
  sourceUrl: "https://www.shokoku-ji.jp/en/ginkakuji/",
  provenance: "Ginkaku-ji official site · checked 12 Oct",
  checkedAt: "2026-10-12T09:00:00Z",
  stale: false,
  publishable: true,
} as any;

describe("P0-e card additions", () => {
  it("PA1 the hero says Travel legs and Travel time, never Transit", () => {
    const html = renderToString(React.createElement(PlanCardHeader, { title: "Kyoto", destination: "Kyoto", dateRange: "", statusLabel: null, metrics: { days: 3, activities: 9, legs: 4, transitTime: "-" } } as any));
    assert.match(text(html), /Travel legs/);
    assert.match(text(html), /Travel time/);
    assert.doesNotMatch(text(html), /Transit/);
  });

  it("PA2 the selected day's panel line counts its legs and stops, stays in neither", () => {
    assert.equal(cardDayPanelLine(thu), "Thu Nov 12 · 2 legs · 6 stops");
    assert.equal(cardDayPanelLine({ dayNum: 3, dateIso: null, activities: [act("x", "One")], transports: [] } as any), "Day 3 · 0 legs · 1 stop");
  });

  it("PA3 the maps header follows the day it is given; transport counts the card's legs", () => {
    const html = renderToString(
      React.createElement(CollapsedSections, { tripId: "t", tripDestination: "Kyoto", day: thu, changeLog: [], isViewer: true, allowTransportActions: false, cardSurface: true } as any),
    );
    assert.match(text(html), /Thu Nov 12 · 2 legs · 6 stops/);
    assert.doesNotMatch(text(html), /stops · Day 2/);
    assert.match(text(html), /Transport 2 legs/);
  });

  it("PA4 every stop-to-stop leg on the card is labelled From → To", () => {
    assert.equal(cardLegEndsLabel("Bamboo Grove", "Tenryu-ji"), "Bamboo Grove → Tenryu-ji");
    const html = withQuery(
      React.createElement(TripCardDays, { tripId: "t", destination: "Kyoto", days: [thu], timeZone: "Asia/Tokyo", optimized: true, showTravelMinutes: true, advisorName: null, isOwner: false, now: new Date("2026-11-12T01:00:00Z") } as any),
    );
    assert.match(html, /data-testid="card-leg-ends-L1"/);
    assert.match(html, /data-testid="card-leg-ends-L2"/);
    assert.match(text(html), /Bamboo Grove → Tenryu-ji/);
    assert.match(text(html), /Nanzen-ji → Nishiki Market/);
    assert.doesNotMatch(html, /card-leg-ends-LS/, "the stay leg is not a stop-to-stop leg");
  });

  it("PA5 the closing warning reads the shown hours fact, whatever its source", () => {
    const at1710 = { time: "17:10" };
    assert.equal(itemClosingWarning([googleHours], "2026-11-12", at1710, "Asia/Tokyo")?.text, "Closes 5:00 PM · Google Maps · checked 4 Oct");
    // The official fact, ranked first by the server, replaces the Google line and names its own source.
    assert.equal(itemClosingWarning([officialHours, googleHours], "2026-11-12", at1710, "Asia/Tokyo")?.text, "Closes 5:00 PM · Ginkaku-ji official site · checked 12 Oct");
    assert.match(itemFactsLine([officialHours, googleHours], "2026-11-12", "Asia/Tokyo")!.text, /Ginkaku-ji official site/);
    // Out of the official fact's season, the next shown fact (Google) answers.
    assert.equal(itemClosingWarning([officialHours, googleHours], "2026-12-10", { time: "17:10" }, "Asia/Tokyo")?.text, "Closes 5:00 PM · Google Maps · checked 4 Oct");
    // Open on arrival, the visit runs past closing ⇒ the warning; inside the hours ⇒ none.
    assert.match(itemClosingWarning([googleHours], "2026-11-12", { time: "16:30", durationMinutes: 60 }, "Asia/Tokyo")!.text, /^Closes 5:00 PM/);
    assert.equal(itemClosingWarning([googleHours], "2026-11-12", { time: "15:00", durationMinutes: 60 }, "Asia/Tokyo"), null);
    assert.equal(itemClosingWarning([googleHours], "2026-11-12", { time: "07:30" }, "Asia/Tokyo"), null, "before opening is not a closing warning");
    assert.equal(itemClosingWarning(undefined, "2026-11-12", at1710, "Asia/Tokyo"), null);
    assert.equal(itemClosingWarning([googleHours], "2026-11-12", { time: "" }, "Asia/Tokyo"), null);
  });

  for (const look of ["plain", "board"] as const) {
    it(`PA6 the row draws its warning and prints the hours line once (${look})`, () => {
      const el = React.createElement(ItemRow, { item: act("g", "Ginkaku-ji", { time: "17:10" }), facts: [googleHours], dateIso: "2026-11-12", timeZone: "Asia/Tokyo", mode: "read", role: "traveler" } as any);
      const html = renderToString(look === "board" ? React.createElement(PlanRowLookProvider, { look: "board", children: el }) : el);
      assert.match(text(html), /Closes 5:00 PM · Google Maps · checked 4 Oct/);
      assert.equal((text(html).match(/8:30 AM – 5:00 PM/g) ?? []).length, 1, "the hours print once");
    });
  }

  it("PA8 a last-entry fact covering the date is preferred, arriving at it is still in", () => {
    const entry = { factType: "last_admission", need: "stop.hours", value: { byWeekday: { "4": "16:30" }, season: { from: "03-01", to: "11-30" }, quote: "Last entry 16:30" }, origin: "official_refresh", sourceUrl: "https://www.shokoku-ji.jp/en/ginkakuji/", provenance: "Ginkaku-ji official site · checked 12 Oct", checkedAt: "2026-10-12T09:00:00Z", stale: false, publishable: true } as any;
    assert.equal(itemClosingWarning([entry, googleHours], "2026-11-12", { time: "16:45" }, "Asia/Tokyo")?.text, "Last entry 4:30 PM · Ginkaku-ji official site · checked 12 Oct");
    assert.equal(itemClosingWarning([entry, googleHours], "2026-11-12", { time: "16:30" }, "Asia/Tokyo"), null, "at the last entry is still in");
    // Out of the last entry's season, the closing rule answers.
    assert.equal(itemClosingWarning([entry, googleHours], "2026-12-10", { time: "17:10" }, "Asia/Tokyo")?.text, "Closes 5:00 PM · Google Maps · checked 4 Oct");
  });

  it("PA7 no budget strip on the card; other surfaces keep theirs", () => {
    const props = { tripId: "t", tripDestination: "Kyoto", day: thu, changeLog: [], isViewer: true, allowTransportActions: false, totalCostNum: 400, budgetNum: 1000 } as any;
    assert.doesNotMatch(renderToString(React.createElement(CollapsedSections, { ...props, cardSurface: true })), /collapsed-budget-t/);
    assert.match(renderToString(React.createElement(CollapsedSections, props)), /collapsed-budget-t/);
  });
});
