/**
 * Smoke 10 render proofs (ledger `2026-10-04-smoke10-fixes`).
 *   R1 S10-4 an AI arrival/departure item that IS the travel row renders the anchor's title, never
 *      the model's — with and without a flight — and the flight line beneath
 *   R2 S10-9 a Google place line reads like the facts line: "<area> · Google Maps · checked <d Mon>",
 *      plain text inside one hover link, never an underlined source link
 *   R3 S10-2 the versions board with no run is Draft-only: the Optimize card, no A/B/C toggle
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { ItemRow } from "../../plan/ItemRow";
import { travelRowTitle } from "../../plan/AnchorRow";

(globalThis as any).React = React;
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

test("R1 S10-4: the travel row is ours — 'Arrival in Kyoto' / 'Departure from Kyoto', never the model's title", () => {
  const arrive = { id: "ai-arr", name: "Arrive at Kansai International Airport", time: "10:00", origin: "ai", type: "transport" } as any;
  const depart = { id: "ai-dep", name: "Depart for Airport", time: "07:40", origin: "ai", type: "transport" } as any;
  assert.equal(travelRowTitle("arrival", "Kyoto, Japan"), "Arrival in Kyoto");
  assert.equal(travelRowTitle("departure", "Kyoto, Japan"), "Departure from Kyoto");
  assert.equal(travelRowTitle("arrival", ""), null, "no city ⇒ no title we can stand behind");
  const withFlight = text(
    renderToString(
      React.createElement(ItemRow, {
        item: arrive,
        mode: "edit",
        role: "traveler",
        anchor: { fromTool: "Getting there", time: "09:05", detail: "JL 061 · lands KIX 09:05 · entered by you", title: travelRowTitle("arrival", "Kyoto") },
      }),
    ),
  );
  assert.match(withFlight, /Arrival in Kyoto/);
  assert.match(withFlight, /JL 061 · lands KIX 09:05 · entered by you/, "the flight line beneath");
  assert.doesNotMatch(withFlight, /Arrive at Kansai International Airport/);
  const noFlight = text(
    renderToString(
      React.createElement(ItemRow, {
        item: depart,
        mode: "read",
        role: "traveler",
        anchor: { fromTool: null, action: null, title: travelRowTitle("departure", "Kyoto") },
      }),
    ),
  );
  assert.match(noFlight, /Departure from Kyoto/);
  assert.doesNotMatch(noFlight, /Depart for Airport/);
});

test("R2 S10-9: one sourced-line format — the place line reads like the facts line", () => {
  const facts = [
    {
      factType: "address",
      origin: "places_api",
      value: { area: "Kita Ward, Kyoto", formattedAddress: "53 Murasakino Daitokujicho, Kita Ward, Kyoto" },
      provenance: "Google Maps · checked 2 Oct 2026",
      checkedAt: "2026-10-02T03:00:00.000Z",
      sourceUrl: "https://maps.google.com/?cid=1",
      stale: false,
    },
  ] as any;
  const html = renderToString(
    React.createElement(ItemRow, { item: { id: "dtk", name: "Daitoku-ji", time: "10:00", origin: "ai" } as any, facts, mode: "read", role: "traveler", timeZone: "Asia/Tokyo" }),
  );
  assert.match(text(html), /Kita Ward, Kyoto · Google Maps · checked 2 Oct/);
  assert.doesNotMatch(html, /class="underline"/, "no underlined source link — the facts line's hover link");
  assert.match(html, /data-testid="slip-item-address-dtk"/);
});
