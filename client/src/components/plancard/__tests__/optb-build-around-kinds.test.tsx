/**
 * OPT-B (ledger `2026-11-02-opt-b-build-around-place-date-event`): the Build-around dialog offers
 * Place, Date and Event from OPT-A's candidate read.
 *
 *   B1  three groups; Place shows the three type buttons; Date one row per day (disabled + reason when
 *       not anchorable); Event rows "name · Day n · HH:MM"; no custom field under Date or Event
 *   B2  an event pick posts { type:"event", id:<bare item id>, name }; a day { type:"day", id:"<n>",
 *       name:"Day n" }; a hotel pick and a typed place post exactly as before
 *   B3  the confirm label is one of the three pinned labels in every mode; the anchor line names the pick
 *   B4  a refusal with an event/day detail renders R1–R3 with pick-from-list and no-pin only; stale_pin unchanged
 *   B5  the strings come from the constants objects; no "AI", "best fit", "recommended" or minute figure;
 *       the straight-line distance helper and tooltip unchanged
 *   B6  under 430px the dialog is a full-height sheet with no horizontal overflow; from 430px the card
 *   B7  a day pin { id: "2" } opens on the Date group with day 2 chosen
 *
 * Harness: react-dom/server renderToString of the exported panel inside a <Dialog> root (no DOM library
 * is installed, so clicks are proven through the pure functions the handlers call), plus the source read
 * with fs. No git, no database, no network.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { Dialog } from "@/components/ui/dialog";
import {
  ANCHOR_CANDIDATE_DISTANCE_COPY,
  BUILD_AROUND_COPY,
  BuildAroundPanel,
  buildAroundPin,
  dayCandidateLabel,
  eventCandidateLabel,
  formatAnchorCandidateMedian,
  initialPlanAnchorPick,
  type AnchorMode,
  type BuildAroundPanelProps,
  type RankedAnchors,
} from "../BuildAroundDialog";
import {
  CUSTOM_PIN_REFUSAL_STRINGS,
  pinForRequest,
  pinnedAnchorDetail,
  readStoredPin,
  refusalFromError,
  refusalMessage,
  refusalOptions,
  type PinRefusal,
} from "@/lib/custom-pin-refusal";
import { optimizeContinueLabel } from "@/lib/optimize-pay-copy";
import { requestOptimizationGate } from "@/lib/optimization-gate";

(globalThis as any).React = React;

const DIALOG = fs.readFileSync("client/src/components/plancard/BuildAroundDialog.tsx", "utf8");
const RAIL = fs.readFileSync("client/src/components/plancard/SlipRail.tsx", "utf8");

const RANKED: RankedAnchors = {
  hotel: [
    { anchorId: "h1", type: "hotel", name: "Gion Inn", medianMeters: 640, estMedianWalkMinutes: 8, within15MinCount: 3, locatedStops: 4, totalStops: 5 },
  ],
  neighborhood: [],
  activity: [],
  event: [
    { anchorId: "event:item-tea", type: "event", name: "Tea Ceremony", dayNumber: 1, scheduledDate: null, startTime: "14:00", medianMeters: 900, locatedStops: 4, totalStops: 5 },
    { anchorId: "event:item-show", type: "event", name: "Show", dayNumber: 2, scheduledDate: null, startTime: "19:30", medianMeters: null, locatedStops: 4, totalStops: 5 },
  ],
  day: [
    { anchorId: "day:1", type: "day", name: "Day 1", dayNumber: 1, date: "2027-11-08", stopCount: 2, locatedStops: 2, anchorable: true },
    { anchorId: "day:2", type: "day", name: "Day 2", dayNumber: 2, date: "2027-11-09", stopCount: 3, locatedStops: 3, anchorable: true },
    { anchorId: "day:3", type: "day", name: "Day 3", dayNumber: 3, date: "2027-11-10", stopCount: 1, locatedStops: 0, anchorable: false },
    { anchorId: "day:4", type: "day", name: "Day 4", dayNumber: 4, date: "2027-11-11", stopCount: 2, locatedStops: 2, anchorable: false },
  ],
};

const FEE = { complexityTier: "standard", feeCents: 599, currency: "USD", aiDisabled: false, coveredByTripPass: false } as any;
const PINNED_LABELS = [optimizeContinueLabel(FEE), optimizeContinueLabel({ ...FEE, coveredByTripPass: true }), optimizeContinueLabel(null)];

const noop = () => {};
function groupOf(mode: AnchorMode) {
  return mode === "auto" ? null : mode === "event" ? "event" : mode === "day" ? "date" : "place";
}
function render(over: Partial<BuildAroundPanelProps> & { mode: AnchorMode }): string {
  const props: BuildAroundPanelProps = {
    planName: "Kyoto",
    fee: FEE,
    busy: false,
    hidePayLine: false,
    group: groupOf(over.mode) as any,
    ranked: RANKED,
    loading: false,
    loadError: null,
    selectedCandidate: null,
    customName: "",
    refusalShown: null,
    refusalChoices: null,
    selectedName: "",
    canConfirm: true,
    selectMode: noop,
    selectGroup: noop,
    setSelectedCandidate: noop,
    setCustomName: noop,
    setRefusalShown: noop,
    confirm: noop,
    onConfirm: noop,
    onOpenChange: noop,
    ...over,
  };
  return renderToString(
    <Dialog open>
      <BuildAroundPanel {...props} />
    </Dialog>,
  );
}
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const confirmLabel = (html: string) => text(html.match(/data-testid="build-around-confirm"[^>]*>([\s\S]*?)<\/button>/)?.[1] ?? "");

describe("OPT-B Build-around: Place · Date · Event", () => {
  it("B1 three groups; Place keeps its three types; Date and Event lists; no custom field outside Place", () => {
    const place = render({ mode: "hotel" });
    for (const g of ["place", "date", "event"]) assert.match(place, new RegExp(`data-testid="build-around-kind-${g}"`));
    assert.match(place, /data-testid="build-around-kind-place"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-testid="build-around-kind-place"/);
    for (const t of ["hotel", "neighborhood", "activity"]) assert.match(place, new RegExp(`data-testid="build-around-type-${t}"`));
    assert.match(place, /data-testid="build-around-custom"/);
    assert.match(place, /placeholder="Type an address or place name"/);
    assert.match(text(place), /Place Date Event/);

    const date = render({ mode: "day" });
    assert.doesNotMatch(date, /data-testid="build-around-type-hotel"/, "the place types are hidden under Date");
    assert.doesNotMatch(date, /data-testid="build-around-custom"/);
    assert.doesNotMatch(text(date), /Not listed\?/);
    for (const d of RANKED.day) assert.match(date, new RegExp(`data-testid="build-around-candidate-${d.anchorId}"`));
    assert.match(text(date), /Day 1 · Nov 8/);
    assert.match(text(date), /Day 2 · Nov 9/);
    const row3 = date.match(/<button[^>]*data-testid="build-around-candidate-day:3"[^>]*>/)![0];
    assert.match(row3, /disabled=""/);
    assert.match(row3, /aria-disabled="true"/);
    assert.match(date, /data-testid="build-around-day-reason-day:3"[^>]*>Nothing on this day has a location yet\./);
    assert.match(date, /data-testid="build-around-day-reason-day:4"[^>]*>Everything on this day is already fixed\./);
    assert.doesNotMatch(date, /build-around-day-reason-day:1/);
    assert.doesNotMatch(date.match(/<button[^>]*data-testid="build-around-candidate-day:1"[^>]*>/)![0], /disabled/);

    const event = render({ mode: "event" });
    assert.match(text(event), /Tea Ceremony · Day 1 · 14:00/);
    assert.match(text(event), /Show · Day 2 · 19:30/);
    assert.doesNotMatch(event, /data-testid="build-around-custom"/);
    assert.equal(eventCandidateLabel(RANKED.event[0]), "Tea Ceremony · Day 1 · 14:00");
    assert.equal(dayCandidateLabel({ dayNumber: 5, date: null }), "Day 5");

    const empty = render({ mode: "event", ranked: { ...RANKED, event: [] } });
    assert.match(empty, /data-testid="build-around-empty-event"[^>]*>No events with a time on your plan yet\. Add one with a start time first\./);
  });

  it("B2 posts: event and day by bare id; place exactly as before", () => {
    assert.deepEqual(buildAroundPin("event", { anchorId: "event:item-tea", name: "Tea Ceremony" }, ""), { type: "event", id: "item-tea", name: "Tea Ceremony" });
    assert.deepEqual(buildAroundPin("day", { anchorId: "day:2", name: "Day 2" }, ""), { type: "day", id: "2", name: "Day 2" });
    assert.deepEqual(buildAroundPin("hotel", { anchorId: "h1", name: "Gion Inn" }, ""), { type: "hotel", id: "h1", name: "Gion Inn" });
    assert.deepEqual(buildAroundPin("neighborhood", null, "  Gion  "), { type: "neighborhood", name: "Gion" });
    assert.equal(buildAroundPin("day", null, "Gion"), undefined, "no typed name under Date");
    assert.equal(buildAroundPin("event", null, "Gion"), undefined, "no typed name under Event");
    assert.equal(buildAroundPin("auto", null, ""), undefined);
    // The request path strips a prefixed id too, and leaves a place id alone.
    assert.deepEqual(pinForRequest({ type: "event", id: "event:item-tea", name: "Tea Ceremony" }, null), { type: "event", id: "item-tea", name: "Tea Ceremony" });
    assert.deepEqual(pinForRequest({ type: "day", id: "2", name: "Day 2" }, null), { type: "day", id: "2", name: "Day 2" });
    assert.deepEqual(pinForRequest({ type: "hotel", id: "event:x", name: "Odd" }, null), { type: "hotel", id: "event:x", name: "Odd" });
    // The confirm handler is the helper; no other pin shape is built in the dialog.
    assert.match(DIALOG, /onConfirm\(buildAroundPin\(mode, selectedCandidate, customLocationName\)\);/);
    // The comparison page's stored pin accepts the new kinds.
    assert.deepEqual(readStoredPin(JSON.stringify({ type: "day", name: "Day 2" })), { type: "day", name: "Day 2" });
  });

  it("B3 the confirm label is a pinned label in every mode; the anchor line names the pick", () => {
    const picks: Array<[AnchorMode, string]> = [["auto", ""], ["hotel", "Gion Inn"], ["day", "Day 2"], ["event", "Tea Ceremony"]];
    for (const fee of [FEE, { ...FEE, coveredByTripPass: true }, null]) {
      for (const [mode, name] of picks) {
        const html = render({ mode, fee, selectedName: name, selectedCandidate: name ? { anchorId: "x", name } : null });
        const label = confirmLabel(html);
        assert.ok(PINNED_LABELS.includes(label), `${mode}: ${label}`);
        if (name) {
          assert.ok(!label.includes(name), "the button never names the anchor");
          assert.match(text(html), new RegExp(`Three versions built around ${name}\\.`));
        }
      }
    }
    assert.match(DIALOG, /\{optimizeContinueLabel\(fee\)\}/);
  });

  it("B4 an event/day refusal says why, with the list and no-pin only; stale_pin unchanged", () => {
    const cases: Array<[PinRefusal, string]> = [
      ["event_not_anchorable", "That event can't be built around — it needs a place and a start time. You haven't been charged."],
      ["day_not_anchorable", "That day has no located stops to build around. You haven't been charged."],
      ["day_nothing_to_rebuild", "Everything on your plan is on that day, so there's nothing to rebuild around it. You haven't been charged."],
    ];
    for (const [reason, message] of cases) {
      assert.equal(refusalMessage(reason), message);
      const choices = refusalOptions(reason, true);
      assert.deepEqual(choices, { tryDifferentName: false, pickFromList: true, continueWithoutPin: true });
      const html = render({ mode: reason.startsWith("day") ? "day" : "event", refusalShown: reason, refusalChoices: choices });
      assert.match(html, new RegExp(`data-reason="${reason}"`));
      assert.ok(text(html).includes(message));
      assert.match(html, /data-testid="build-around-refusal-pick-list"/);
      assert.match(html, /data-testid="build-around-refusal-no-pin"/);
      assert.doesNotMatch(html, /data-testid="build-around-refusal-try-name"/);
      assert.doesNotMatch(html, /data-testid="build-around-confirm"/);
    }
    assert.equal(refusalMessage("stale_pin"), CUSTOM_PIN_REFUSAL_STRINGS.stalePin);
    assert.equal(refusalOptions("stale_pin", true).tryDifferentName, true);
    // The server's detail is read; an unknown detail is the generic stale pin.
    assert.equal(pinnedAnchorDetail({ error: "pinned_anchor_not_found", detail: "day_not_anchorable" }), "day_not_anchorable");
    assert.equal(pinnedAnchorDetail({ error: "pinned_anchor_not_found", detail: "something_else" }), undefined);
    assert.equal(refusalFromError(new Error('400: {"error":"pinned_anchor_not_found","detail":"event_not_anchorable"}')), "event_not_anchorable");
    assert.equal(refusalFromError(new Error('400: {"error":"pinned_anchor_not_found"}')), "stale_pin");
    // The slip routes a detail to its own refusal and keeps the stale-pin branch as it was.
    assert.match(RAIL, /setPinRefusal\(\{ reason: "stale_pin", pin: pinnedAnchor \}\);\s*\/\/[^\n]*\n\s*if \(outcome\.detail\) setPinRefusal\(\{ reason: outcome\.detail, pin: pinnedAnchor \}\);\s*setBuildAroundOpen\(true\);/);
  });

  it("B4 the pay gate passes the detail through", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ error: "pinned_anchor_not_found", detail: "day_nothing_to_rebuild" }), { status: 400 })) as unknown as typeof fetch;
    const outcome = await requestOptimizationGate({ tripId: "t1", pinnedAnchor: { type: "day", id: "2", name: "Day 2" }, fetchImpl });
    assert.equal(outcome.kind, "pinned_anchor_stale");
    assert.equal((outcome as any).detail, "day_nothing_to_rebuild");
    const plain = (async () => new Response(JSON.stringify({ error: "pinned_anchor_not_found" }), { status: 400 })) as unknown as typeof fetch;
    const o2 = await requestOptimizationGate({ tripId: "t1", pinnedAnchor: { type: "hotel", id: "gone" }, fetchImpl: plain });
    assert.equal((o2 as any).detail, undefined);
  });

  it("B5 strings from the constants; no AI, winner label or minute figure; distance helper unchanged", () => {
    for (const key of ["description", "autoLabel", "loadError", "customPlaceholder", "groups[g]", "dayReason.noLocatedStops", "dayReason.allFixed"]) {
      assert.ok(DIALOG.includes(`BUILD_AROUND_COPY.${key}`), key);
    }
    assert.ok(DIALOG.includes("{EMPTY_COPY.event}"));
    assert.equal(BUILD_AROUND_COPY.groups.place, "Place");
    assert.equal(BUILD_AROUND_COPY.groups.date, "Date");
    assert.equal(BUILD_AROUND_COPY.groups.event, "Event");
    const all = [
      render({ mode: "auto" }), render({ mode: "hotel" }), render({ mode: "day" }), render({ mode: "event" }),
      render({ mode: "day", refusalShown: "day_not_anchorable", refusalChoices: refusalOptions("day_not_anchorable", true) }),
    ].map(text).join(" ");
    assert.doesNotMatch(all, /\bAI\b|best fit|recommended|trending|popular/i);
    assert.doesNotMatch(all, /\d+\s*(min|mins|minute|minutes)\b/i);
    assert.equal(ANCHOR_CANDIDATE_DISTANCE_COPY.tooltip, "A straight-line distance, not a walking route.");
    assert.equal(formatAnchorCandidateMedian(RANKED.hotel[0]), "about 640 m apart in a straight line");
    assert.match(DIALOG, /title=\{ANCHOR_CANDIDATE_DISTANCE_COPY\.tooltip\}/);
  });

  it("B6 under 430px a full-height sheet with no horizontal overflow; from 430px the centered card", () => {
    const cls = DIALOG.match(/<DialogContent\s+className="([^"]+)"/)![1].split(/\s+/);
    for (const c of ["h-[100dvh]", "max-h-none", "w-full", "max-w-none", "rounded-none", "overflow-x-hidden", "overflow-y-auto"]) assert.ok(cls.includes(c), c);
    for (const c of ["min-[430px]:h-auto", "min-[430px]:max-h-[88dvh]", "min-[430px]:w-[calc(100%-1.5rem)]", "min-[430px]:max-w-[560px]", "min-[430px]:rounded-lg"]) assert.ok(cls.includes(c), c);
    // The footer (Cancel + confirm) sticks to the bottom of the sheet.
    assert.match(DIALOG, /className="sticky bottom-0 [^"]*min-\[430px\]:static/);
    // Nothing in the panel forces a width beyond the sheet.
    const html = render({ mode: "day" });
    assert.doesNotMatch(html, /\bw-\[\d{3,}px\]|min-w-\[\d{3,}px\]/);
  });

  it("B7 a day pin opens on the Date group with that day chosen", () => {
    assert.deepEqual(initialPlanAnchorPick({ type: "day", id: "2", name: "Day 2" }, RANKED), { anchorId: "day:2", name: "Day 2" });
    assert.deepEqual(initialPlanAnchorPick({ type: "event", id: "item-show" }, RANKED), { anchorId: "event:item-show", name: "Show" });
    assert.equal(initialPlanAnchorPick({ type: "day", id: "3" }, RANKED), null, "a day that cannot be built around is not chosen");
    assert.equal(initialPlanAnchorPick({ type: "hotel", id: "h1" }, RANKED), null);
    // The dialog opens on the pin's type, so a day pin opens the Date group.
    assert.match(DIALOG, /setMode\(initialPin\?\.type \?\? "auto"\);/);
    const html = render({ mode: "day", selectedCandidate: { anchorId: "day:2", name: "Day 2" }, selectedName: "Day 2" });
    assert.match(html, /aria-pressed="true"[^>]*data-testid="build-around-kind-date"/);
    assert.match(html, /aria-checked="true"[^>]*data-testid="build-around-candidate-day:2"/);
  });
});
