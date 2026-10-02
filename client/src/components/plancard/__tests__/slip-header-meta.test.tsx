/**
 * B5 — the slip header says how many days the plan is (smoke test 4, ledger
 * `2026-10-02-smoke4-draft-fixes`).
 *
 * M1 a freshly created, confirmed Nov 11–15 plan with no party and no events reads exactly
 *    "Nov 11 – Nov 15, 2026 · 5 days" — no trailing separator, no empty slot.
 * M2 the separators sit only between present segments (party, events).
 * M3 §13 — a missing window prints no range and no day count, and never "0 days".
 * M4 the day count is the calendar rule: a one-day plan is "1 day".
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/slip-header-meta.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GuestTripProvider } from "@/contexts/GuestTripContext";
import { SlipHeaderMeta, type SlipHeaderMetaProps } from "../SlipHeaderMeta";

(globalThis as any).React = React;

function metaText(over: Partial<SlipHeaderMetaProps> = {}): string {
  const props: SlipHeaderMetaProps = {
    tripId: "d3a29ec0",
    startDate: "2026-11-11",
    endDate: "2026-11-15",
    datesConfirmed: true,
    isOwner: true,
    partyLabel: "",
    eventCount: 0,
    ...over,
  };
  const html = renderToString(
    React.createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      React.createElement(GuestTripProvider, null, React.createElement(SlipHeaderMeta, props)),
    ),
  );
  // Text content of the meta paragraph: strip tags, decode the few entities React emits.
  return html
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");
}

describe("slip header meta line (B5)", () => {
  it("M1 a fresh Nov 11–15 plan reads exactly 'Nov 11 – Nov 15, 2026 · 5 days'", () => {
    assert.equal(metaText(), "Nov 11 – Nov 15, 2026 · 5 days");
  });

  it("M1b a server ISO timestamp for the dates reads the same", () => {
    assert.equal(
      metaText({ startDate: "2026-11-11T00:00:00.000Z", endDate: "2026-11-15T00:00:00.000Z" }),
      "Nov 11 – Nov 15, 2026 · 5 days",
    );
  });

  it("M2 separators only between present segments", () => {
    assert.equal(
      metaText({ partyLabel: "2 travelers", eventCount: 3 }),
      "Nov 11 – Nov 15, 2026 · 5 days · 2 travelers · 3 events",
    );
    assert.equal(
      metaText({ onAskParty: () => {} }),
      "Nov 11 – Nov 15, 2026 · 5 days · Who's coming?",
    );
  });

  it("M3 §13 — no window, no range, no day count, never '0 days'", () => {
    const text = metaText({ startDate: null, endDate: null, partyLabel: "2 travelers" });
    assert.equal(text, "2 travelers");
    assert.doesNotMatch(text, /0 days/);
  });

  it("M4 a one-day plan is '1 day'", () => {
    assert.equal(metaText({ endDate: "2026-11-11" }), "Nov 11 – Nov 11, 2026 · 1 day");
  });
});
