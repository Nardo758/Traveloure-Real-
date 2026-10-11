/**
 * R394 on the card: "Close to N of M days" (ledger `2026-10-09-stay-card-closeness`). The card reads S1's own
 * `closeness` (FU-S1-3, R394) and computes nothing.
 *
 *   CC1 pure: the routed line, the free line says "by straight line", singular day, clamped, and every
 *       absent/null/zero-located case draws nothing (never "0 of 0")
 *   CC2 render, routed: the one pick carries the line from the stay block's closeness
 *   CC3 render, free: each listed stay carries its own line, labelled by straight line
 *   CC4 render, absent: a payload with no closeness (pre-R394) draws no line at all
 *   CC5 source: the card file imports no threshold and computes no distance
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/stay-card-closeness.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import type { WhereToStayView } from "@shared/where-to-stay";
import { AnchorPanelView, type AnchorPanelViewProps } from "../../plan/AnchorPanel";
import { stayClosenessLine, STAY_CLOSE_STRAIGHT_SUFFIX } from "../../../lib/stay-card";

(globalThis as any).React = React;

const render = (p: Partial<AnchorPanelViewProps>) =>
  renderToString(
    React.createElement(AnchorPanelView, { stage: "drafted", question: "Where are you staying?", anchorKind: "lodging", canChoose: true, ...p } as AnchorPanelViewProps),
  );
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const hotel = (id: string, name: string) => ({ kind: "hotel_cache" as const, id, name, starRating: 4 });
const base = (stay: WhereToStayView["stay"]): WhereToStayView => ({ eligible: true, city: "Kyoto", basis: "travel_time", hotelsAvailable: true, neighborhoods: [], stay });

describe("R394 on the stay card", () => {
  it("CC1 the line, and nothing when there is nothing to say", () => {
    assert.equal(stayClosenessLine({ closeDays: 4, locatedDays: 5, basis: "routed" }), "Close to 4 of 5 days");
    assert.equal(stayClosenessLine({ closeDays: 2, locatedDays: 5, basis: "straight_line" }), `Close to 2 of 5 days ${STAY_CLOSE_STRAIGHT_SUFFIX}`);
    assert.equal(stayClosenessLine({ closeDays: 1, locatedDays: 1, basis: "routed" }), "Close to 1 of 1 day");
    assert.equal(stayClosenessLine({ closeDays: 0, locatedDays: 3, basis: "routed" }), "Close to 0 of 3 days");
    assert.equal(stayClosenessLine({ closeDays: 9, locatedDays: 3, basis: "routed" }), "Close to 3 of 3 days");
    assert.equal(stayClosenessLine(null), null);
    assert.equal(stayClosenessLine(undefined), null);
    assert.equal(stayClosenessLine({ closeDays: 0, locatedDays: 0, basis: "routed" }), null, "never 0 of 0");
  });

  it("CC2 routed: the pick carries the stay block's closeness", () => {
    const html = render({
      view: base({ tier: "routed", pick: hotel("h1", "Hotel Kanra"), scoredCount: 9, candidateCount: 12, changed: false, computedAt: "2026-10-09T00:00:00Z", closeness: { closeDays: 4, locatedDays: 5, basis: "routed" } }),
    });
    assert.match(html, /data-testid="stay-pick-closeness-h1"/);
    assert.match(text(html), /Close to 4 of 5 days/);
    assert.doesNotMatch(text(html), /by straight line/);
  });

  it("CC3 free: each stay carries its own line, by straight line", () => {
    const html = render({
      view: base({
        tier: "straight_line",
        hotels: [
          { ...hotel("a", "A"), closeness: { closeDays: 3, locatedDays: 4, basis: "straight_line" } },
          { ...hotel("b", "B"), closeness: { closeDays: 1, locatedDays: 4, basis: "straight_line" } },
          { ...hotel("c", "C"), closeness: null },
        ],
      }),
    });
    const t = text(html);
    assert.match(t, /Close to 3 of 4 days by straight line/);
    assert.match(t, /Close to 1 of 4 days by straight line/);
    assert.equal((html.match(/data-testid="stay-pick-closeness-/g) ?? []).length, 2, "a null closeness draws no line");
  });

  it("CC4 a payload from before R394 draws no line", () => {
    const html = render({ view: base({ tier: "straight_line", hotels: [hotel("a", "A")] }) });
    assert.doesNotMatch(html, /stay-pick-closeness-/);
    const routed = render({ view: base({ tier: "routed", pick: hotel("h1", "Hotel Kanra"), scoredCount: 1, candidateCount: 1, changed: false, computedAt: "t" }) });
    assert.doesNotMatch(routed, /stay-pick-closeness-/);
  });

  it("CC5 the card reads, never computes", () => {
    const src = readFileSync(new URL("../../../lib/stay-card.ts", import.meta.url), "utf8");
    assert.doesNotMatch(src, /STAY_CLOSE_ROUTED_MINUTES|STAY_CLOSE_STRAIGHT_KM|haversine|stayDayCloseness/);
  });
});
