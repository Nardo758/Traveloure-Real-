/**
 * The tools tray, rendered per group (surface spec v1.2 §4; step 2, ledger
 * `2026-10-03-surface-step2-tools-tray`).
 *   T1  each group draws exactly its manifest's chips, in order, with §4's labels; unknown → Trip
 *   T2  a tool with no existing component is a DISABLED chip saying "coming soon"; one with a
 *       component is enabled — and the split is the documented one
 *   T3  a hidden occasion (LD 28) draws no guest or traveling-party chip
 *   T4  Show / Festival adds "The show" and "Getting back late"
 *   T5  day 1's travel row: the placeholder ("Add your flight") until a flight anchor exists, then
 *       the REAL anchor — its own time, "Anchor · fixed · from Getting there", and the flight
 *   T6  addendum: an AI arrival item that absorbs the placeholder draws the glyph and "Add your
 *       flight" with no "fixed" label; once a flight exists it reads the flight's time and line
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/tools-tray.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { ToolsTray, type ToolsTrayProps } from "../../plan/ToolsTray";
import { GETTING_THERE_TOOL, TravelAnchorPlaceholder, flightAnchorFor, flightRowText } from "../../plan/AnchorRow";
import { ItemRow } from "../../plan/ItemRow";
import { GROUP_MANIFEST, TOOL_LABEL } from "@shared/group-manifest";

(globalThis as any).React = React;

const base: ToolsTrayProps = {
  tripId: "t1",
  group: "trips",
  occasionSlug: null,
  isHidden: false,
  whereToStay: React.createElement("div", null, "where to stay"),
  trip: { destination: "Kyoto, Japan", startDate: "2026-11-11", endDate: "2026-11-15" },
};
const render = (over: Partial<ToolsTrayProps>) => renderToString(React.createElement(ToolsTray, { ...base, ...over }));
const chips = (html: string) => {
  const out: Array<readonly [string, boolean]> = [];
  const re = /data-testid="tool-chip-([a-z_]+)"[^>]*data-available="(true|false)"/g;
  for (let m = re.exec(html); m; m = re.exec(html)) out.push([m[1], m[2] === "true"] as const);
  return out;
};

const NO_COMPONENT = new Set(["getting_around", "getting_home", "budget", "arrivals_split_groups", "split_activities", "who_pays_what", "getting_back_late"]);

describe("tools tray", () => {
  it("T1 each group draws its manifest's chips, in order; unknown → Trip", () => {
    const groups: Array<[string, keyof typeof GROUP_MANIFEST]> = [
      ["trips", "trip"],
      ["moments", "moment"],
      ["celebrations", "celebration"],
      ["hosted_events", "hosted_event"],
      ["group_travel", "group_travel"],
      ["plain_plan", "trip"],
    ];
    for (const [group, row] of groups) {
      const html = render({ group });
      assert.deepEqual(chips(html).map(([k]) => k), [...GROUP_MANIFEST[row].tools], group);
      for (const k of GROUP_MANIFEST[row].tools) assert.ok(html.includes(TOOL_LABEL[k].replace("&", "&amp;").replace("'", "&#x27;")), `${group}: ${k}`);
    }
  });

  it("T2 coming-soon chips are disabled; the rest open an existing tool", () => {
    for (const group of ["trips", "moments", "celebrations", "hosted_events", "group_travel"]) {
      for (const [k, available] of chips(render({ group }))) assert.equal(available, !NO_COMPONENT.has(k), `${group}/${k}`);
    }
    const html = render({ group: "trips" });
    assert.match(html, /<button[^>]*disabled=""[^>]*data-testid="tool-chip-getting_around"/);
    assert.ok(html.includes("coming soon"));
  });

  it("T3 a hidden occasion has no guest or party chip", () => {
    assert.ok(!chips(render({ group: "celebrations", isHidden: true })).some(([k]) => k === "guests"));
    assert.ok(!chips(render({ group: "trips", isHidden: true })).some(([k]) => k === "travel_party"));
    assert.ok(!chips(render({ group: "group_travel", isHidden: true })).some(([k]) => k === "whos_coming"));
  });

  it("T4 Show / Festival overlay", () => {
    const keys = chips(render({ group: "moments", occasionSlug: "show" })).map(([k]) => k);
    assert.deepEqual(keys.slice(-2), ["the_show", "getting_back_late"]);
  });

  it("T5 the travel row: placeholder until a flight anchor exists, then the real anchor", () => {
    const placeholder = renderToString(React.createElement(TravelAnchorPlaceholder, { kind: "arrival", city: "Kyoto, Japan", onAddFlight: () => {} }));
    assert.ok(placeholder.includes("Arrival in Kyoto"));
    assert.ok(placeholder.includes("Add your flight"));
    assert.ok(!placeholder.includes("Anchor · fixed"));
    const flight = flightAnchorFor(
      [{ anchorType: "flight_arrival", anchorDatetime: "2026-11-11T15:25:00.000Z", location: "KIX", description: "JL 61 · LAX → KIX · arrives T1" }],
      "flight_arrival",
    );
    assert.deepEqual(flight, { time: "15:25", location: "KIX", description: "JL 61 · LAX → KIX · arrives T1", bufferMinutes: null });
    const real = renderToString(React.createElement(TravelAnchorPlaceholder, { kind: "arrival", city: "Kyoto, Japan", flight }));
    assert.ok(real.includes('data-anchor-real="true"'));
    assert.ok(real.includes("15:25"));
    assert.ok(real.includes("Anchor · fixed · from Getting there"));
    // Smoke 8 item 3: the stored line is the whole line (the airport is no longer appended).
    assert.ok(real.includes("JL 61 · LAX → KIX · arrives T1"));
    assert.ok(!real.includes("arrives T1 · KIX"));
    const line = flightAnchorFor(
      [{ anchorType: "flight_arrival", anchorDatetime: "2026-11-11T09:05:00.000Z", location: "KIX", description: "JL 061 · lands KIX 09:05 · entered by you" }],
      "flight_arrival",
    );
    assert.equal(flightRowText(line), "JL 061 · lands KIX 09:05 · entered by you");
    assert.equal(flightRowText({ time: "09:05", location: "KIX", description: null }), "KIX", "the airport stands in only for a flight stored with no line");
    assert.equal(flightRowText(null), null);
    assert.ok(!real.includes("Add your flight"));
    assert.equal(flightAnchorFor([], "flight_departure"), null);
  });
});

describe("travel row absorbed by an AI item (step 2 addendum)", () => {
  const item = { id: "ai-arr", name: "Arrive at Kansai Airport", time: "10:00", origin: "ai", type: "transport" } as any;
  const row = (anchor: any) =>
    renderToString(React.createElement(ItemRow, { item, mode: "edit", role: "traveler", anchor, menu: { onRemove: () => {} } }));
  it("T6 placeholder form, then the real flight", () => {
    const open = row({ fromTool: null, action: { label: "Add your flight", onClick: () => {} } });
    assert.match(open, /data-testid="slip-anchor-row-ai-arr"[^>]*data-anchor-placeholder="true"/);
    assert.match(open, /data-testid="slip-anchor-action-ai-arr"[^>]*>Add your flight</);
    assert.doesNotMatch(open, /Anchor · fixed/);
    const fixed = row({ fromTool: GETTING_THERE_TOOL, time: "09:35", detail: "JL 61 · HND → KIX" });
    assert.match(fixed, /Anchor · fixed · from Getting there/);
    assert.match(fixed, /09:35/);
    assert.doesNotMatch(fixed, />10:00</);
    assert.match(fixed, /data-testid="slip-anchor-detail-ai-arr"[^>]*>JL 61 · HND → KIX</);
    assert.doesNotMatch(fixed, /slip-anchor-action-ai-arr/);
  });
});
