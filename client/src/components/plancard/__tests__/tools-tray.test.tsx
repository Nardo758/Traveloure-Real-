/**
 * The tools tray, rendered per group (surface spec v1.2 §4; step 2, ledger
 * `2026-10-03-surface-step2-tools-tray`).
 *   T1  each group draws exactly its manifest's LIVE chips, in order, with §4's labels; unknown → Trip
 *       (ledger `2026-10-08-tools-tray-live-only`, sanctioned rewrite)
 *   T2  coming-soon tools draw nothing (no disabled chip, no "coming soon"); Getting there renders
 *       only while FLIGHT_LOOKUP_ENABLED is on; the component registry agrees with TOOL_STATE
 *       (sanctioned rewrite)
 *   T3  a hidden occasion (LD 28) draws no guest or traveling-party chip
 *   T4  Show / Festival adds "The show" (live); "Getting back late" is coming soon, so not drawn
 *       (sanctioned rewrite)
 *   T7  a tray with zero live tools renders nothing — no chips, no wrapper, no header
 *   T8  a tray with one live tool renders exactly one chip
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
import { ToolsTray, toolContent, type ToolsTrayProps } from "../../plan/ToolsTray";
import { GETTING_THERE_TOOL, TravelAnchorPlaceholder, flightAnchorFor, flightRowText } from "../../plan/AnchorRow";
import { ItemRow } from "../../plan/ItemRow";
import { GROUP_MANIFEST, TOOL_LABEL, TOOL_STATE, toolIsLive, type ToolKey } from "@shared/group-manifest";

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
  const re = /data-testid="tool-chip-([a-z_]+)"/g;
  for (let m = re.exec(html); m; m = re.exec(html)) out.push([m[1], true] as const);
  return out;
};

const NO_COMPONENT = new Set(["getting_around", "getting_home", "budget", "arrivals_split_groups", "split_activities", "who_pays_what", "getting_back_late"]);
const FLAG_ON = { FLIGHT_LOOKUP_ENABLED: true };
const live = (tools: readonly ToolKey[], flags: any) => tools.filter((k) => toolIsLive(k, flags));

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
    for (const flags of [null, FLAG_ON]) {
      for (const [group, row] of groups) {
        const html = render({ group, flags });
        const expected = live(GROUP_MANIFEST[row].tools, flags);
        assert.ok(expected.length > 0, `${group}: every group has a live tool today`);
        assert.deepEqual(chips(html).map(([k]) => k), expected, group);
        for (const k of expected) assert.ok(html.includes(TOOL_LABEL[k].replace("&", "&amp;").replace("'", "&#x27;")), `${group}: ${k}`);
      }
    }
  });

  it("T2 coming-soon tools draw nothing; Getting there follows its flag; registry agrees with TOOL_STATE", () => {
    for (const group of ["trips", "moments", "celebrations", "hosted_events", "group_travel"]) {
      for (const flags of [null, FLAG_ON]) {
        const html = render({ group, flags });
        for (const [k] of chips(html)) assert.ok(!NO_COMPONENT.has(k), `${group}/${k} is coming soon and must not render`);
        assert.ok(!html.includes("coming soon"), `${group}: no "coming soon" text`);
        assert.doesNotMatch(html, /disabled=""/, `${group}: no disabled chip`);
      }
    }
    assert.ok(!chips(render({ group: "trips" })).some(([k]) => k === "getting_there"), "flag unknown ⇒ hidden");
    assert.ok(!chips(render({ group: "trips", flags: { FLIGHT_LOOKUP_ENABLED: false } })).some(([k]) => k === "getting_there"), "flag off ⇒ hidden");
    assert.deepEqual(chips(render({ group: "trips", flags: FLAG_ON })).map(([k]) => k)[0], "getting_there", "flag on ⇒ live, in manifest order");
    // The registry and the manifest's state say the same thing for every tool.
    for (const k of Object.keys(TOOL_STATE) as ToolKey[]) {
      const hasComponent = toolContent(k, base) !== null;
      assert.equal(hasComponent, TOOL_STATE[k].kind !== "coming_soon", `${k}: registry vs TOOL_STATE`);
      assert.equal(hasComponent, !NO_COMPONENT.has(k), k);
    }
  });

  it("T3 a hidden occasion has no guest or party chip", () => {
    assert.ok(!chips(render({ group: "celebrations", isHidden: true })).some(([k]) => k === "guests"));
    assert.ok(!chips(render({ group: "trips", isHidden: true })).some(([k]) => k === "travel_party"));
    assert.ok(!chips(render({ group: "group_travel", isHidden: true })).some(([k]) => k === "whos_coming"));
  });

  it("T4 Show / Festival overlay", () => {
    const keys = chips(render({ group: "moments", occasionSlug: "show" })).map(([k]) => k);
    assert.equal(keys[keys.length - 1], "the_show");
    assert.ok(!keys.includes("getting_back_late"), "coming soon ⇒ not drawn");
  });

  it("T7 a tray with zero live tools renders nothing", () => {
    for (const flags of [null, { FLIGHT_LOOKUP_ENABLED: false }]) {
      const html = render({ manifestTools: ["getting_there", "getting_around", "budget"], flags });
      assert.equal(html, "", "no chips, no wrapper, no header");
    }
  });

  it("T8 a tray with one live tool renders one chip", () => {
    const html = render({ manifestTools: ["getting_around", "pace", "budget"] });
    assert.deepEqual(chips(html).map(([k]) => k), ["pace"]);
    assert.ok(html.includes('data-testid="slip-tools-tray"'));
    const flight = render({ manifestTools: ["getting_there", "getting_around"], flags: FLAG_ON });
    assert.deepEqual(chips(flight).map(([k]) => k), ["getting_there"]);
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
