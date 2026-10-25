/**
 * Rows 196/197 (client half) and 218 — dispatch CB-2026-10-25-D v2: the custom "build around a
 * location" pin on Optimize, its refusal state, the signed-placement echo and GC-1 for the anchor.
 *
 * Run: npx tsx --test client/src/lib/__tests__/custom-pin-client.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { requestOptimizationGate } from "../optimization-gate";
import { buildCreateComparisonPayload } from "../create-comparison";
import {
  CUSTOM_PIN_REFUSAL_STRINGS,
  holdAfterResponse,
  pinForRequest,
  readStoredPin,
  refusalFromError,
  refusalMessage,
  refusalOptions,
} from "../custom-pin-refusal";
import {
  anchorIsGoogleDerived,
  buildMapScene,
  leafletMountPoints,
  leafletSceneInputs,
  markGoogleDerivedAnchors,
  sceneFirstPoint,
  type MapAnchor,
} from "../map-scene";
import { everyLocatedPointNonGoogle } from "@shared/item-coord-source";
import { CUSTOM_LOCATION_REFUSAL_REASONS, type CustomPinPlacement } from "@shared/custom-location-pin";

const read = (rel: string) => readFileSync(rel, "utf8");
const RAIL = read("client/src/components/plancard/SlipRail.tsx");
const DIALOG = read("client/src/components/plancard/BuildAroundDialog.tsx");
const PAGE = read("client/src/pages/itinerary-comparison.tsx");
const LEAFLET = read("client/src/components/plancard/map/SceneMapLeaflet.tsx");
const MCC = read("client/src/components/plancard/MapControlCenter.tsx");

const PLACEMENT: CustomPinPlacement = {
  lat: 35.0116,
  lng: 135.7681,
  source: "google_geocode",
  at: "2026-10-25T14:00:00.000Z",
  sig: "ab12cd34",
};

function mockFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; body: any }> = [];
  const fetchImpl = (async (url: any, init?: any) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : undefined });
    return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

/** The source between `if (<cond>) {` and the matching `return;` that closes that branch. */
function branch(src: string, opener: string): string {
  const i = src.indexOf(opener);
  assert.ok(i >= 0, `${opener} exists`);
  return src.slice(i, src.indexOf("return;", i) + "return;".length);
}

describe("the pin reaches the pay gate", () => {
  it("CP1: the gate request carries the pin when sent, and no pinnedAnchor key when absent", async () => {
    const withPin = mockFetch(200, { freeRerun: true });
    await requestOptimizationGate({ tripId: "t1", pinnedAnchor: { type: "neighborhood", name: "Gion" }, fetchImpl: withPin.fetchImpl });
    assert.deepEqual(withPin.calls[0].body.pinnedAnchor, { type: "neighborhood", name: "Gion" });

    const without = mockFetch(200, { freeRerun: true });
    await requestOptimizationGate({ tripId: "t1", fetchImpl: without.fetchImpl });
    assert.equal("pinnedAnchor" in without.calls[0].body, false);

    // The slip passes it: name only on the first press.
    assert.match(RAIL, /const pin = pinForRequest\(pinnedAnchor, heldCustomPin\.current\);/);
    assert.match(RAIL, /\.\.\.\(pin \? \{ pinnedAnchor: pin \} : \{\}\),/);
    assert.deepEqual(pinForRequest({ type: "hotel", name: "  Lantern Inn  " }, null), { type: "hotel", name: "Lantern Inn" });
  });

  it("CP2: the unplaceable outcome starts no pay sheet, no charge and no run", async () => {
    const { fetchImpl } = mockFetch(409, { error: "custom_location_unplaceable", reason: "ambiguous" });
    const outcome = await requestOptimizationGate({ tripId: "t1", pinnedAnchor: { type: "hotel", name: "Inn" }, fetchImpl });
    assert.equal(outcome.kind, "custom_location_unplaceable");
    const b = branch(RAIL, 'if (outcome.kind === "custom_location_unplaceable") {');
    assert.match(b, /setPinRefusal\(\{ reason: outcome\.reason, pin: pinnedAnchor \}\);/);
    assert.match(b, /setBuildAroundOpen\(true\);/);
    assert.doesNotMatch(b, /setPaySheet|runComparison|handleSheetSuccess|confirmOptimizationPayment/);
    // The branch comes before every outcome that pays or runs.
    const at = RAIL.indexOf('outcome.kind === "custom_location_unplaceable"');
    for (const later of ['outcome.kind === "paid") {', 'setPaySheet(outcome.payment)', "await runComparison(undefined, pinnedAnchor);"]) {
      assert.ok(RAIL.indexOf(later) > at, `${later} follows the refusal branch`);
    }
  });
});

describe("the refusal state", () => {
  it("CP3: every string is Leon's approved text in ONE object, with no banned word or price; only the option (c) note is held", () => {
    assert.deepEqual(Object.keys(CUSTOM_PIN_REFUSAL_STRINGS.reasons).sort(), [...CUSTOM_LOCATION_REFUSAL_REASONS].sort());
    assert.deepEqual(CUSTOM_PIN_REFUSAL_STRINGS.reasons, {
      zero_results: "We couldn't find a place called that.",
      ambiguous: "More than one place matches that name.",
      imprecise: "That's too broad to pin on a map.",
      cap_reached: "Place lookups are paused for now. Try again later, or continue without a pin.",
      provider_error: "The place lookup didn't respond. Try again in a bit, or continue without a pin.",
    });
    assert.deepEqual(CUSTOM_PIN_REFUSAL_STRINGS.options, {
      tryDifferentName: "Try a different name",
      pickFromList: "Pick from the list",
      continueWithoutPin: "Continue without a pin",
      optionCPaidNote: "TODO(Leon): option c price note",
    });
    assert.equal(
      CUSTOM_PIN_REFUSAL_STRINGS.stalePin,
      "That place is no longer on the list. We've refreshed it and you haven't been charged. Please pick again.",
    );
    const all = [
      CUSTOM_PIN_REFUSAL_STRINGS.stalePin,
      ...Object.values(CUSTOM_PIN_REFUSAL_STRINGS.reasons),
      ...Object.values(CUSTOM_PIN_REFUSAL_STRINGS.options),
    ];
    // Exactly one held placeholder is left: the option (c) note.
    assert.deepEqual(all.filter((v) => v.startsWith("TODO(Leon)")), ["TODO(Leon): option c price note"]);
    for (const v of all) assert.doesNotMatch(v, /trending|pulse|crowd|destination intelligence|\bAI\b|\$\d|5\.99|599/i);
    // P7's rule holds on the dialog source with the refusal state in it.
    assert.doesNotMatch(DIALOG, /\$\d|5\.99|599/);
    assert.match(DIALOG, /\{refusalMessage\(refusalShown\)\}/);
    assert.equal(refusalMessage("ambiguous"), CUSTOM_PIN_REFUSAL_STRINGS.reasons.ambiguous);
    // The option (c) note shows only on a priced run (not covered, not free) — never on the comparison page (fee null).
    assert.match(DIALOG, /\{optimizeRunPriced\(fee\) \? \(\s*<p[^>]*data-testid="build-around-refusal-no-pin-note">\s*\{CUSTOM_PIN_REFUSAL_STRINGS\.options\.optionCPaidNote\}/);
    assert.match(PAGE, /fee=\{null\}/);
  });

  it("CP4: option (a) is absent for cap_reached and provider_error and present otherwise; (c) is always offered", () => {
    for (const reason of CUSTOM_LOCATION_REFUSAL_REASONS) {
      const o = refusalOptions(reason, true);
      assert.equal(o.tryDifferentName, reason !== "cap_reached" && reason !== "provider_error", reason);
      assert.equal(o.pickFromList, true);
      assert.equal(o.continueWithoutPin, true);
    }
    assert.equal(refusalOptions("ambiguous", false).pickFromList, false, "no list to pick from ⇒ no (b)");
    assert.match(DIALOG, /\{refusalChoices\.tryDifferentName \? \(/);
    // (c) is an explicit press that confirms with no pin.
    assert.match(DIALOG, /onClick=\{\(\) => onConfirm\(\)\}\s+data-testid="build-around-refusal-no-pin"/);
  });
});

describe("the signed placement is echoed, never rebuilt", () => {
  it("CP5: echoed byte for byte with the same type and trimmed name; dropped on a name or type edit; never lat/lng", () => {
    const held = holdAfterResponse({ type: "neighborhood", name: " Gion " }, PLACEMENT, null)!;
    assert.equal(held.placement, PLACEMENT, "the server's own object is held");
    const echoed = pinForRequest({ type: "neighborhood", name: "Gion  " }, held)!;
    assert.equal(echoed.placement, PLACEMENT);
    assert.equal(JSON.stringify(echoed.placement), JSON.stringify(PLACEMENT));
    assert.deepEqual(Object.keys(echoed).sort(), ["name", "placement", "type"]);
    assert.equal(echoed.name, "Gion");
    assert.equal(pinForRequest({ type: "neighborhood", name: "Gion East" }, held)!.placement, undefined, "a name edit drops it");
    assert.equal(pinForRequest({ type: "hotel", name: "Gion" }, held)!.placement, undefined, "a type change drops it");
    // A list pick never carries one, and nothing ever sends a bare lat/lng.
    const pick = pinForRequest({ type: "hotel", id: "h1", name: "Inn" }, held)!;
    assert.deepEqual(pick, { type: "hotel", id: "h1", name: "Inn" });
    for (const p of [echoed, pick]) assert.equal("lat" in p || "lng" in p, false);
    // The create payload passes it through unchanged.
    const payload = buildCreateComparisonPayload({ destination: "Kyoto", startDate: "2026-11-01", endDate: "2026-11-03", pinnedAnchor: echoed });
    assert.equal(payload.pinnedAnchor!.placement, PLACEMENT);
    // A response placement replaces what is held; a response without one keeps it.
    const next = { ...PLACEMENT, sig: "ef56" };
    assert.equal(holdAfterResponse(echoed, next, held)!.placement, next);
    assert.equal(holdAfterResponse(echoed, undefined, held)!.placement, PLACEMENT);
    assert.equal(holdAfterResponse(pick, PLACEMENT, held), null, "a list pick holds nothing");
    // Storage round trip keeps the same bytes.
    assert.equal(JSON.stringify(readStoredPin(JSON.stringify(held))), JSON.stringify(held));
  });

  it("CP5b: payments, create and every /generate send the echoed pin", () => {
    // payments: the gate's success outcome replaces the held placement, then the pin that goes to create is the echoed one.
    assert.match(RAIL, /heldCustomPin\.current = holdAfterResponse\(pin, outcome\.placement, heldCustomPin\.current\);/);
    // create: the pin is re-derived from what is held, and create's returned placement replaces it.
    assert.match(RAIL, /pinnedAnchor = pinForRequest\(pinnedAnchor, heldCustomPin\.current\);/);
    assert.match(RAIL, /heldCustomPin\.current = holdAfterResponse\(pinnedAnchor, comparison\.placement, heldCustomPin\.current\);/);
    // generate: the one /generate caller sends the stored pin and stores what generate returned.
    assert.equal((PAGE.match(/\/generate`/g) ?? []).length, 1);
    assert.match(PAGE, /const pin = generatePinFor\(override\);/);
    assert.match(PAGE, /\.\.\.\(pin \? \{ pinnedAnchor: pin \} : \{\}\),/);
    assert.match(PAGE, /holdAfterResponse\(pin, \(body as \{ placement\?: unknown \}\)\.placement, held\)/);
  });
});

describe("a 409 at create or generate shows the state and starts no payment", () => {
  it("CP6: the thrown error is read by its body, and neither handler pays", () => {
    assert.equal(refusalFromError(new Error('409: {"error":"custom_location_unplaceable","reason":"imprecise"}')), "imprecise");
    assert.equal(refusalFromError(new Error('409: {"error":"trip_empty_convert_cart"}')), null);
    assert.equal(refusalFromError(new Error('500: {"error":"custom_location_unplaceable","reason":"imprecise"}')), null);
    // create (slip): the refusal returns before navigation, with no payment call.
    const create = branch(RAIL, "const reason = refusalFromError(err);");
    assert.match(create, /setPinRefusal\(\{ reason, pin: pinnedAnchor \}\);/);
    assert.doesNotMatch(create, /requestOptimizationGate|setPaySheet|confirmOptimizationPayment|setLocation/);
    // generate (comparison page): the refusal opens the dialog, and every choice re-runs /generate on the
    // comparison's recorded payment — the page never calls the payments endpoint.
    assert.match(PAGE, /setGeneratePinRefusal\(\{ reason, pin: generatePinFor\(override\) \}\);/);
    // A repeat refusal (same reason) still shows: the state is cleared before each re-run.
    assert.match(PAGE, /onConfirm=\{\(pin\) => \{[\s\S]{0,160}setGeneratePinRefusal\(null\);\s*retryMutation\.mutate\(\{ pin \}\);/);
    assert.doesNotMatch(PAGE, /optimization-payments|requestOptimizationGate/);
    // The page grep for the four removed terms stays empty.
    assert.doesNotMatch(PAGE, /travelpulse|pulse|crowd|destination intel/i);
  });
});

describe("GC-1 on Leaflet for the anchor", () => {
  const stopsNonGoogle = [{ located: true, coordSource: "osm" }];
  const googleAnchor: MapAnchor = { kind: "venue", name: "Gion", lat: 35.0037, lng: 135.775, googleDerived: true };
  const osmAnchor: MapAnchor = { kind: "stay", name: "Inn", lat: 35.01, lng: 135.76, coordSource: "osm" };

  it("CP7: Leaflet mounts only when the anchor is non-Google too; an unknown source is Google", () => {
    assert.equal(everyLocatedPointNonGoogle(leafletMountPoints(stopsNonGoogle, null)), true);
    assert.equal(everyLocatedPointNonGoogle(leafletMountPoints(stopsNonGoogle, googleAnchor)), false);
    assert.equal(everyLocatedPointNonGoogle(leafletMountPoints(stopsNonGoogle, { ...osmAnchor, coordSource: null })), false);
    assert.equal(everyLocatedPointNonGoogle(leafletMountPoints(stopsNonGoogle, osmAnchor)), true);
    assert.equal(anchorIsGoogleDerived({ kind: "stay", name: "x", lat: 1, lng: 1 }), true, "absent source = Google");
    assert.match(MCC, /const leafletMapAllowed = everyLocatedPointNonGoogle\(\s*leafletMountPoints\(/);
  });

  it("CP8: a Google-derived anchor draws no Leaflet marker, frames nothing, is never the first point, and is named in the legend", () => {
    const [v] = markGoogleDerivedAnchors([{ key: "a", label: "A", stops: [], days: [], anchor: { kind: "venue" as const, name: "Gion", lat: 35.0037, lng: 135.775 } }]);
    assert.equal(v.anchor!.googleDerived, true);
    const scene = buildMapScene({ dayNumber: 1, planStops: [], planAnchor: v.anchor, layers: { plan: true, browse: false } });
    const g = leafletSceneInputs(scene);
    assert.equal(g.markers.some((m) => m.kind === "anchor"), false);
    assert.deepEqual(g.framePoints, []);
    assert.equal(g.legendAnchorName, "Gion");
    assert.equal(sceneFirstPoint(scene, "leaflet"), null);
    assert.deepEqual(sceneFirstPoint(scene, "google"), { lat: 35.0037, lng: 135.775 }, "the Google renderer is unchanged");

    const osm = leafletSceneInputs(buildMapScene({ dayNumber: 1, planStops: [], planAnchor: osmAnchor, layers: { plan: true, browse: false } }));
    assert.equal(osm.markers.filter((m) => m.kind === "anchor").length, 1);
    assert.equal(osm.framePoints.length, 1);
    assert.equal(osm.legendAnchorName, null);

    assert.match(LEAFLET, /leafletSceneInputs\(scene, sceneMarkers\(scene\)\)/);
    assert.match(LEAFLET, /const pts = leafletSceneInputs\(scene\)\.framePoints;/);
    assert.match(MCC, /const firstPoint = sceneFirstPoint\(scene, renderer\);/);
    assert.match(MCC, /renderer === "leaflet" && anchorIsGoogleDerived\(scene\.anchor\)/);
    assert.match(read("client/src/components/plancard/VersionsBoard.tsx"), /markGoogleDerivedAnchors\(view\.versions\.map/);
    assert.match(read("client/src/components/plancard/SlipView.tsx"), /markGoogleDerivedAnchors\(\(versionsView\?\.versions \?\? \[\]\)\.map/);
  });
});

describe("a stale list-pick id is a stale-id error, not a placement refusal", () => {
  /** Shared: the stale state starts no payment, keeps every option and refreshes the list. */
  function assertStaleHandled() {
    assert.equal(refusalMessage("stale_pin"), CUSTOM_PIN_REFUSAL_STRINGS.stalePin, "a generic error");
    const o = refusalOptions("stale_pin", true);
    assert.equal(o.tryDifferentName, true, "option (a) is not hidden");
    assert.equal(o.continueWithoutPin, true);
    const b = branch(RAIL, 'if (outcome.kind === "pinned_anchor_stale") {');
    assert.match(b, /setPinRefusal\(\{ reason: "stale_pin", pin: pinnedAnchor \}\);/);
    assert.match(b, /setBuildAroundOpen\(true\);/);
    assert.doesNotMatch(b, /setPaySheet|runComparison|handleSheetSuccess|confirmOptimizationPayment/);
    // The dialog drops the stale pick and reloads the list from the server.
    assert.match(DIALOG, /if \(refusal === "stale_pin" && initialPin\) \{\s*setSelectedCandidate\(null\);\s*requestedRef\.current = false;\s*void loadCandidatesOnce\(\);/);
  }

  it("CP9: 400 pinned_anchor_not_found on payments, create and generate", async () => {
    const { fetchImpl } = mockFetch(400, { error: "pinned_anchor_not_found" });
    const outcome = await requestOptimizationGate({ tripId: "t1", pinnedAnchor: { type: "hotel", id: "gone", name: "Inn" }, fetchImpl });
    assert.equal(outcome.kind, "pinned_anchor_stale");
    assert.equal(refusalFromError(new Error('400: {"error":"pinned_anchor_not_found"}')), "stale_pin", "create / generate");
    assert.equal(refusalFromError(new Error('409: {"error":"pinned_anchor_not_found"}')), null, "only the 400 is a stale id");
    assertStaleHandled();
  });

  it("CP10: 400 pinned_anchor_invalid is handled the same way", async () => {
    const { fetchImpl } = mockFetch(400, { error: "pinned_anchor_invalid" });
    const outcome = await requestOptimizationGate({ tripId: "t1", pinnedAnchor: { type: "activity", id: "bad", name: "Shrine" }, fetchImpl });
    assert.equal(outcome.kind, "pinned_anchor_stale");
    assert.equal(refusalFromError(new Error('400: {"error":"pinned_anchor_invalid"}')), "stale_pin", "create / generate");
    // An unrelated 400 still throws from the gate as before.
    const other = mockFetch(400, { error: "something_else" });
    await assert.rejects(requestOptimizationGate({ tripId: "t1", fetchImpl: other.fetchImpl }));
    assertStaleHandled();
  });
});
