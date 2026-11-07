/**
 * The group manifest (surface spec v1.2 §4; step 2, ledger `2026-10-03-surface-step2-tools-tray`).
 *   G1  every experience group resolves to its §4 row; `plain_plan` / unknown / null → Trip
 *   G2  the rows are §4 verbatim (eyebrow, anchor question, time unit, tools, threshold)
 *   G3  Show / Festival is an overlay: the parent's eyebrow and threshold, its own question, +2 tools
 *   G4  travelItemKind (addendum): an AI row naming a transport hub AND a direction
 *   G5  absorbedTravelItemId: the first arrival / the last departure absorbs the placeholder
 *   G6  PLAN-2 C2: the coming-soon build order — Budget → Getting home → the group package → Getting back late; all still coming soon
 *   G7  QW-1 and C2 are different axes: each group's row order (anchor → no-supply → supply) and the coming-soon ship
 *       order live on different keys, and both hold at once
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { COMING_SOON_BUILD_ORDER, GROUP_MANIFEST, GROUP_PACKAGE_TOOLS, SHOW_FESTIVAL_OVERLAY, TOOL_LABEL, TOOL_STATE, manifestFor, toolIsLive, type ToolKey } from "../group-manifest";

test("G1: every group resolves; unknown → Trip", () => {
  assert.equal(manifestFor("trips").group, "trip");
  assert.equal(manifestFor("moments").group, "moment");
  assert.equal(manifestFor("celebrations").group, "celebration");
  assert.equal(manifestFor("hosted_events").group, "hosted_event");
  assert.equal(manifestFor("group_travel").group, "group_travel");
  for (const unknown of ["plain_plan", "nonsense", "", null, undefined]) assert.equal(manifestFor(unknown as any).group, "trip");
});

test("G2: the rows are §4 verbatim", () => {
  const labels = (g: keyof typeof GROUP_MANIFEST) => GROUP_MANIFEST[g].tools.map((k) => TOOL_LABEL[k]).join(" · ");
  assert.equal(labels("trip"), "Where to stay · Travel party · Getting around · Pace · Getting there");
  assert.equal(labels("moment"), "The reservation · Timing check · Getting home");
  assert.equal(labels("celebration"), "The venue · Guests · Budget · Vendors");
  assert.equal(labels("hosted_event"), "The venue · Run of show · Guest invites · Arrivals & split groups · Vendor contracts");
  assert.equal(labels("group_travel"), "Shared lodging · Who's coming · Split activities · Who pays what · Getting there");
  assert.deepEqual(
    Object.values(GROUP_MANIFEST).map((r) => [r.eyebrow, r.anchorQuestion, r.timeUnit]),
    [
      ["Your plan · Trip", "Where are you staying?", "days"],
      ["Your plan · Moment", "What's the reservation?", "hours"],
      ["Your plan · Celebration", "Where's it happening?", "one day, hours"],
      ["Your plan · Event", "Where's the venue?", "run of show"],
      ["Your plan · Group", "Where is everyone staying?", "days"],
    ],
  );
  assert.deepEqual(GROUP_MANIFEST.trip.anchorPanelThreshold, { kind: "min_days", days: 2 });
  assert.deepEqual(GROUP_MANIFEST.group_travel.anchorPanelThreshold, { kind: "min_days", days: 2 });
  for (const g of ["moment", "celebration", "hosted_event"] as const) assert.deepEqual(GROUP_MANIFEST[g].anchorPanelThreshold, { kind: "always" });
});

test("G2b (QW-1): every row is anchor -> no-supply -> supply", () => {
  // The dispatch's rule, stated once. A tool is "supply" when it needs a local supplier or inventory
  // (a stay, a venue, vendors, a flight); the rest are answered from the plan itself.
  const SUPPLY = new Set<ToolKey>(["where_to_stay", "the_venue", "vendors", "vendor_contracts", "shared_lodging", "getting_there", "the_show", "the_reservation"]);
  const ANCHOR: Record<keyof typeof GROUP_MANIFEST, ToolKey | null> = {
    trip: "where_to_stay",
    moment: "the_reservation",
    celebration: "the_venue",
    hosted_event: "the_venue",
    group_travel: "shared_lodging",
  };
  for (const [group, row] of Object.entries(GROUP_MANIFEST)) {
    const tools = row.tools as readonly ToolKey[];
    const anchor = ANCHOR[group as keyof typeof GROUP_MANIFEST];
    if (anchor) assert.equal(tools[0], anchor, `${group}: the anchor is first`);
    const rest = anchor ? tools.slice(1) : tools;
    const firstSupply = rest.findIndex((k) => SUPPLY.has(k));
    if (firstSupply >= 0) {
      for (const k of rest.slice(firstSupply)) assert.ok(SUPPLY.has(k), `${group}: ${k} is a no-supply tool after a supply tool`);
    }
  }
});

test("G3: Show / Festival overlays its parent group", () => {
  const show = manifestFor("moments", "show");
  assert.equal(show.eyebrow, GROUP_MANIFEST.moment.eyebrow);
  assert.equal(show.timeUnit, GROUP_MANIFEST.moment.timeUnit);
  assert.deepEqual(show.anchorPanelThreshold, GROUP_MANIFEST.moment.anchorPanelThreshold);
  assert.equal(show.anchorQuestion, "Which night(s)? (ticket = anchor)");
  assert.deepEqual(show.tools.slice(-2).map((k) => TOOL_LABEL[k]), ["The show", "Getting back late"]);
  assert.deepEqual(SHOW_FESTIVAL_OVERLAY.extraTools, ["the_show", "getting_back_late"]);
  assert.deepEqual(manifestFor("moments", "date-night"), GROUP_MANIFEST.moment, "another occasion gets no overlay");
});

// Step 2 addendum: an AI airport/station arrival on day 1 / departure on the last day absorbs the
// placeholder — one arrival row, one departure row.
import { absorbedTravelItemId, travelItemKind } from "../getting-there";

test("G4: travelItemKind reads a hub word plus a direction word, AI rows only", () => {
  assert.equal(travelItemKind({ name: "Arrive at Kansai Airport", origin: "ai" }), "arrival");
  assert.equal(travelItemKind({ name: "Arrival", location: "Kyoto Station", origin: "ai" }), "arrival");
  assert.equal(travelItemKind({ name: "Depart from Kyoto Station", origin: "ai" }), "departure");
  assert.equal(travelItemKind({ name: "Shinkansen home — leave Kyoto", origin: "ai" }), "departure");
  assert.equal(travelItemKind({ name: "Kyoto Station shopping", origin: "ai" }), null, "a hub with no direction is a stop");
  assert.equal(travelItemKind({ name: "Arrive at the ryokan", origin: "ai" }), null, "a direction with no hub is not a flight");
  assert.equal(travelItemKind({ name: "Arrive at Kansai Airport", origin: "traveler" }), null, "a traveler's row is theirs");
  assert.equal(travelItemKind({ name: "Arrive at Kansai Airport" }), null);
});

test("G5: absorbedTravelItemId — first arrival, last departure, else none", () => {
  const day = [
    { id: "a", name: "Arrive at Kansai Airport", origin: "ai" },
    { id: "b", name: "Lunch in Gion", origin: "ai" },
    { id: "c", name: "Arrive at Kyoto Station", origin: "ai" },
    { id: "d", name: "Depart from Kyoto Station", origin: "ai" },
    { id: "e", name: "Leave from Kansai Airport", origin: "ai" },
  ];
  assert.equal(absorbedTravelItemId(day, "arrival"), "a");
  assert.equal(absorbedTravelItemId(day, "departure"), "e");
  assert.equal(absorbedTravelItemId([{ id: "x", name: "Temple walk", origin: "ai" }], "arrival"), null);
});

test("G6: PLAN-2 C2 — the coming-soon build order, all still coming soon", () => {
  assert.deepEqual(
    COMING_SOON_BUILD_ORDER.map((k) => TOOL_LABEL[k]),
    ["Budget", "Getting home", "Arrivals & split groups", "Split activities", "Who pays what", "Getting back late"],
  );
  assert.deepEqual(GROUP_PACKAGE_TOOLS, ["arrivals_split_groups", "split_activities", "who_pays_what"]);
  const at = COMING_SOON_BUILD_ORDER.indexOf(GROUP_PACKAGE_TOOLS[0]);
  assert.deepEqual(COMING_SOON_BUILD_ORDER.slice(at, at + 3), GROUP_PACKAGE_TOOLS, "the group package is contiguous");
  for (const k of COMING_SOON_BUILD_ORDER) {
    assert.deepEqual(TOOL_STATE[k], { kind: "coming_soon" }, `${k} is still coming soon`);
    assert.equal(toolIsLive(k, { FLIGHT_LOOKUP_ENABLED: true }), false, `${k} draws nothing`);
  }
  // Every coming-soon tool is ordered — none is left out of the build order, none listed twice.
  const soon = (Object.keys(TOOL_STATE) as ToolKey[]).filter((k) => TOOL_STATE[k].kind === "coming_soon");
  assert.deepEqual([...soon].sort(), [...COMING_SOON_BUILD_ORDER].sort());
  assert.equal(new Set(COMING_SOON_BUILD_ORDER).size, COMING_SOON_BUILD_ORDER.length);
});

test("G7: QW-1's row order and C2's build order coexist on different keys", () => {
  // Row order within an occasion (QW-1): GROUP_MANIFEST[group].tools.
  const labels = (g: keyof typeof GROUP_MANIFEST) => GROUP_MANIFEST[g].tools.map((k) => TOOL_LABEL[k]);
  assert.deepEqual(labels("trip"), ["Where to stay", "Travel party", "Getting around", "Pace", "Getting there"]);
  assert.deepEqual(labels("moment"), ["The reservation", "Timing check", "Getting home"]);
  assert.deepEqual(labels("celebration"), ["The venue", "Guests", "Budget", "Vendors"]);
  assert.deepEqual(labels("hosted_event"), ["The venue", "Run of show", "Guest invites", "Arrivals & split groups", "Vendor contracts"]);
  assert.deepEqual(labels("group_travel"), ["Shared lodging", "Who's coming", "Split activities", "Who pays what", "Getting there"]);
  // Ship order of the coming-soon tools (C2): COMING_SOON_BUILD_ORDER — unchanged by QW-1.
  assert.deepEqual(COMING_SOON_BUILD_ORDER.map((k) => TOOL_LABEL[k]), ["Budget", "Getting home", "Arrivals & split groups", "Split activities", "Who pays what", "Getting back late"]);
  // Different keys: no row IS the build order, and the build order is not read off any row.
  for (const row of Object.values(GROUP_MANIFEST)) assert.notEqual(row.tools, COMING_SOON_BUILD_ORDER);
  // The two orders are allowed to disagree: a row places a coming-soon tool by need-for-supply, not by ship date.
  const celebration = GROUP_MANIFEST.celebration.tools as readonly ToolKey[];
  assert.ok(celebration.includes("budget") && COMING_SOON_BUILD_ORDER[0] === "budget");
});
