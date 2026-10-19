/**
 * LG-2 Ask 8 (ledger `2026-10-19-lg2-licence-geocoder`): wherever a figure computed over open coordinates shows, the
 * credit reads exactly "© OpenStreetMap contributors".
 *
 *   OC1 the stay card: a closeness line (routed or straight line) carries the credit, exactly
 *   OC2 a card with no closeness line carries none (nothing computed over open coordinates is shown)
 *   OC3 a routed leg answered by OSRM reads the credit as its source label, exactly
 *
 * NEGATIVE SPACE (§18d): open coordinates are not drawn on any map today (GC-1 draws a stop's neighbourhood centroid);
 * a future surface that draws them must carry the credit too.
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/lg2-osm-credit.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import type { WhereToStayView } from "@shared/where-to-stay";
import { OSM_COORD_ATTRIBUTION } from "@shared/open-coords";
import { routeProvenanceLabel } from "@shared/routing-engine";
import { AnchorPanelView, type AnchorPanelViewProps } from "../../plan/AnchorPanel";

(globalThis as any).React = React;

const render = (p: Partial<AnchorPanelViewProps>) =>
  renderToString(
    React.createElement(AnchorPanelView, { stage: "drafted", question: "Where are you staying?", anchorKind: "lodging", canChoose: true, ...p } as AnchorPanelViewProps),
  );
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&copy;/g, "©").replace(/\s+/g, " ");
const hotel = (id: string, name: string) => ({ kind: "hotel_cache" as const, id, name, starRating: 4 });
const base = (stay: WhereToStayView["stay"]): WhereToStayView => ({ eligible: true, city: "Kyoto", basis: "travel_time", hotelsAvailable: true, neighborhoods: [], stay });

describe("LG-2 Ask 8: the OpenStreetMap credit", () => {
  it("OC1 a closeness line carries the credit, exactly", () => {
    assert.equal(OSM_COORD_ATTRIBUTION, "© OpenStreetMap contributors");
    const routed = render({
      view: base({ tier: "routed", pick: hotel("h1", "Hotel A"), scoredCount: 3, candidateCount: 5, changed: false, computedAt: "t", closeness: { closeDays: 2, locatedDays: 3, basis: "routed" } }),
    });
    assert.match(routed, /data-testid="stay-pick-osm-credit"/);
    assert.ok(text(routed).includes("© OpenStreetMap contributors"));
    const free = render({ view: base({ tier: "straight_line", hotels: [{ ...hotel("a", "A"), closeness: { closeDays: 1, locatedDays: 2, basis: "straight_line" } }] }) });
    assert.match(free, /data-testid="stay-pick-osm-credit"/);
  });

  it("OC2 no closeness line, no credit", () => {
    const html = render({ view: base({ tier: "straight_line", hotels: [hotel("a", "A")] }) });
    assert.doesNotMatch(html, /stay-pick-osm-credit/);
  });

  it("OC3 an OSRM leg's source label is the credit, exactly", () => {
    const label = routeProvenanceLabel({ source: "osrm", checkedAt: "2026-10-19T00:00:00Z" } as any, "Asia/Tokyo");
    assert.equal(label, "© OpenStreetMap contributors · checked 19 Oct");
  });
});
