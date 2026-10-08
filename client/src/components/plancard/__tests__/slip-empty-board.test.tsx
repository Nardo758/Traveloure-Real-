/**
 * Slip conformance — the Empty board (boards rev 15; ledger `2026-10-08-conformance-slip-phase0`).
 *
 *   E1  the placeholder-dates subline reads "Dates not set yet · JST" for a Kyoto plan, with no window
 *   E2  the owner gets the two chips; a non-owner gets the sentence only (D16)
 *   E3  a confirmed plan keeps the window line unchanged (no "Dates not set yet", no chips)
 *   E4  the zone: alphabetic names from the runtime's zone data, an offset otherwise, nothing for NULL
 *   E5  the draft card says only what the press will do (dates first; Google Maps only when on)
 *   E6  the city reading matches the map's Browse layer ("Kyoto, Japan" → "Kyoto")
 * Run: npx tsx --test client/src/components/plancard/__tests__/slip-empty-board.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GuestTripProvider } from "@/contexts/GuestTripContext";
import { SlipHeaderMeta, SLIP_DATES_NOT_SET, type SlipHeaderMetaProps } from "../SlipHeaderMeta";
import { slipZoneAbbrev } from "@/lib/slip-zone-label";
import { emptyDraftDetail, planCityName } from "@/components/plan/SlipEmptyStart";

(globalThis as any).React = React;

function render(over: Partial<SlipHeaderMetaProps> = {}): string {
  const props: SlipHeaderMetaProps = {
    tripId: "t1",
    startDate: "2026-11-11",
    endDate: "2026-11-15",
    datesConfirmed: false,
    isOwner: true,
    partyLabel: "",
    eventCount: 0,
    timezone: "Asia/Tokyo",
    ...over,
  };
  return renderToString(
    React.createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      React.createElement(GuestTripProvider, null, React.createElement(SlipHeaderMeta, props)),
    ),
  );
}

const text = (html: string) =>
  html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

describe("Empty board — the placeholder-dates header", () => {
  it("E1 'Dates not set yet · JST', and no filled-in window", () => {
    const html = render({ onAskParty: () => {} });
    const t = text(html);
    assert.match(t, new RegExp(`^${SLIP_DATES_NOT_SET} · JST`));
    assert.doesNotMatch(t, /Nov 11/);
    assert.doesNotMatch(t, /placeholder dates/);
  });

  it("E2 the owner gets both chips; a non-owner gets the sentence only", () => {
    const owner = render({ onAskParty: () => {} });
    assert.match(owner, /data-testid="slip-dates-set-cta"[^>]*>Set your dates</);
    assert.match(owner, /data-testid="slip-meta-ask-party"[^>]*>Who&#x27;s coming\?</);
    const guest = render({ isOwner: false });
    assert.match(text(guest), /Dates not set yet · JST/);
    assert.doesNotMatch(guest, /slip-meta-chips|slip-dates-set-cta|slip-meta-ask-party/);
  });

  it("E2b a stated party rides the subline, and the party chip is not drawn", () => {
    const t = text(render({ partyLabel: "2 travelers" }));
    assert.match(t, /Dates not set yet · 2 travelers · JST/);
    assert.doesNotMatch(t, /Who's coming/);
  });

  it("E3 a confirmed plan keeps its window line", () => {
    const t = text(render({ datesConfirmed: true, partyLabel: "2 travelers" }));
    assert.match(t, /Nov 11 – Nov 15, 2026 · 5 days · 2 travelers/);
    assert.doesNotMatch(t, /Dates not set yet/);
  });

  it("E4 the zone label", () => {
    const nov = new Date("2026-11-11T12:00:00Z");
    assert.equal(slipZoneAbbrev("Asia/Tokyo", nov), "JST");
    assert.equal(slipZoneAbbrev("America/New_York", nov), "EST");
    assert.equal(slipZoneAbbrev("Asia/Kolkata", nov), "IST");
    assert.equal(slipZoneAbbrev(null, nov), null);
    assert.equal(slipZoneAbbrev("  ", nov), null);
    assert.equal(slipZoneAbbrev("Not/AZone", nov), null);
    assert.doesNotMatch(text(render({ timezone: null })), /·\s*$/, "no dangling separator without a zone");
  });

  it("E5 the draft card says only what the press will do", () => {
    assert.equal(
      emptyDraftDetail({ asksDatesFirst: true, placesFactsOn: true }),
      "Free. About a minute. We'll ask for your dates first, then sketch real places with hours and addresses checked on Google Maps — you'll swap and reorder from there.",
    );
    assert.doesNotMatch(emptyDraftDetail({ asksDatesFirst: false, placesFactsOn: true }), /dates first/);
    assert.doesNotMatch(emptyDraftDetail({ asksDatesFirst: true, placesFactsOn: false }), /Google Maps/);
  });

  it("E6 the city reading", () => {
    assert.equal(planCityName("Kyoto, Japan"), "Kyoto");
    assert.equal(planCityName(""), null);
    assert.equal(planCityName(null), null);
  });
});
