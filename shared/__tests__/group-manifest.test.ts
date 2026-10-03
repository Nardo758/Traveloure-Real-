/**
 * The group manifest (surface spec v1.2 §4; step 2, ledger `2026-10-03-surface-step2-tools-tray`).
 *   G1  every experience group resolves to its §4 row; `plain_plan` / unknown / null → Trip
 *   G2  the rows are §4 verbatim (eyebrow, anchor question, time unit, tools, threshold)
 *   G3  Show / Festival is an overlay: the parent's eyebrow and threshold, its own question, +2 tools
 *   G4  travelItemKind (addendum): an AI row naming a transport hub AND a direction
 *   G5  absorbedTravelItemId: the first arrival / the last departure absorbs the placeholder
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { GROUP_MANIFEST, SHOW_FESTIVAL_OVERLAY, TOOL_LABEL, manifestFor } from "../group-manifest";

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
  assert.equal(labels("trip"), "Getting there · Where to stay · Travel party · Getting around · Pace");
  assert.equal(labels("moment"), "The reservation · Timing check · Getting home");
  assert.equal(labels("celebration"), "The venue · Guests · Vendors · Budget");
  assert.equal(labels("hosted_event"), "Run of show · Guest invites · Vendor contracts · Arrivals & split groups");
  assert.equal(labels("group_travel"), "Getting there · Shared lodging · Who's coming · Split activities · Who pays what");
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
