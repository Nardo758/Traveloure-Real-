/**
 * Slip conformance — the Moment board (boards rev 15; ledger `2026-10-08-slip-moment-board`).
 *
 *   MO1  "evening" only when every timed stop starts at or after 17:00, on a one-day plan
 *   MO2  the optimizer card's Moment title, and an intro only for a timed, LOCKED anchor
 *   MO3  the sketch line counts stops and needs at least one
 *   MO4  the anchor card prints only what the row carries ("19:30 · fixed" only when locked)
 *   MO5  the one-day window reads "Fri Nov 13, 2026 · one evening"
 *   MO6  the board optimizer card: badges, coral CTA testid kept, no "where you stay" on a Moment
 *   MO7  the tray marks a done tool with ✓ and leaves the rest outlined
 * Run: npx tsx --test client/src/components/plancard/__tests__/slip-moment-board.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GuestTripProvider } from "@/contexts/GuestTripContext";
import { momentLeadIntro, momentLeadTitle, momentSketchLine, momentSpanWord } from "@/lib/slip-moment";
import { momentAnchorTimeLine } from "@/components/plan/MomentAnchorCard";
import { OptimizerLead, findingBadge, LEAD_ZERO_NO_STAY } from "@/components/plan/OptimizerLead";
import { ToolsTray } from "@/components/plan/ToolsTray";
import type { ToolKey } from "@shared/group-manifest";
import { SlipHeaderMeta } from "../SlipHeaderMeta";

(globalThis as any).React = React;
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
const wrap = (el: React.ReactElement) =>
  renderToString(React.createElement(QueryClientProvider, { client: new QueryClient() }, React.createElement(GuestTripProvider, null, el)));

describe("Moment board", () => {
  it("MO1 the span word", () => {
    assert.equal(momentSpanWord("2026-11-13", "2026-11-13", [{ time: "17:00" }, { time: "22:00" }]), "evening");
    assert.equal(momentSpanWord("2026-11-13", "2026-11-13", [{ time: "12:30" }, { time: "19:30" }]), "day");
    assert.equal(momentSpanWord("2026-11-13", "2026-11-13", []), "day", "no timed stop ⇒ never 'evening'");
    assert.equal(momentSpanWord("2026-11-13", "2026-11-14", [{ time: "19:00" }]), null);
  });

  it("MO2 title and intro", () => {
    assert.equal(momentLeadTitle("evening"), "Make the evening flow");
    assert.equal(momentLeadTitle(null), "Make it flow");
    assert.match(String(momentLeadIntro({ time: "19:30", locked: true })), /around 19:30, which stays fixed/);
    assert.equal(momentLeadIntro({ time: "19:30" }), null, "unlocked ⇒ Optimize may move it ⇒ no 'fixed'");
    assert.equal(momentLeadIntro({ time: "", locked: true }), null);
    assert.equal(momentLeadIntro(null), null);
  });

  it("MO3 the sketch line", () => {
    assert.equal(momentSketchLine(4), "4 stops · around your reservation");
    assert.equal(momentSketchLine(1), "1 stop · around your reservation");
    assert.equal(momentSketchLine(0), null);
  });

  it("MO4 the anchor card's time line", () => {
    assert.equal(momentAnchorTimeLine({ time: "19:30", locked: true }), "19:30 · fixed");
    assert.equal(momentAnchorTimeLine({ time: "19:30" }), "19:30");
    assert.equal(momentAnchorTimeLine({ time: "" }), null);
  });

  it("MO5 the one-day window", () => {
    const html = wrap(
      React.createElement(SlipHeaderMeta, {
        tripId: "t", startDate: "2026-11-13", endDate: "2026-11-13", datesConfirmed: true, isOwner: true,
        partyLabel: "2 people", eventCount: 0, daySpan: "evening",
      }),
    );
    assert.equal(text(html), "Fri Nov 13, 2026 · one evening · 2 people");
  });

  it("MO6 the board optimizer card", () => {
    const fee = { feeCents: 599, currency: "USD", coveredByTripPass: false, aiDisabled: false } as any;
    const findings = [
      { kind: "closed_on_arrival", count: 2, days: [2, 4] },
      { kind: "walking_saved_km", count: 6, days: [1], est: true },
    ] as any;
    const html = renderToString(
      React.createElement(OptimizerLead, { tone: "board", findings, hasPricedItems: false, fee, onClick: () => {}, onLocalExpert: () => {} }),
    );
    assert.match(html, /data-lead-tone="board"/);
    assert.match(html, /data-testid="slip-action-optimize"/);
    assert.match(html, /optimizer-lead-local-expert/);
    assert.deepEqual(findingBadge(findings[0]), { badge: "2", rest: "stops are reached when they're closed" });
    assert.equal(findingBadge(findings[1]).badge, "↓");
    const moment = renderToString(
      React.createElement(OptimizerLead, { tone: "board", findings: [], hasPricedItems: false, fee, onClick: () => {}, title: "Make the evening flow", noStay: true }),
    );
    assert.match(text(moment), /Make the evening flow/);
    assert.ok(text(moment).includes(LEAD_ZERO_NO_STAY));
    assert.doesNotMatch(text(moment), /where you stay/);
  });

  it("MO7 the tray's done tool", () => {
    const html = wrap(
      React.createElement(ToolsTray, {
        tripId: "t", group: "moments", occasionSlug: null, isHidden: false, whereToStay: null,
        trip: { destination: "Kyoto", startDate: null, endDate: null }, flags: {}, doneTools: new Set<ToolKey>(["the_reservation"]),
      }),
    );
    assert.match(html, /data-testid="tool-chip-the_reservation"[^>]*data-tool-done="true"[^>]*>The reservation<!-- --> ✓/);
    assert.doesNotMatch(html, /data-testid="tool-chip-timing_check"[^>]*data-tool-done/);
  });
});
