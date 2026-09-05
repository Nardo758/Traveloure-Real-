/**
 * NO CITY-CENTRE FALLBACK on the experience-template map.
 * Ledger `2026-09-05-build-id-and-map-fallback`.
 *
 * THE DEFECT (post-publish Chrome QA, 2026-09-05). `experience-template.tsx` read
 * `destinationCenter?.lat ?? <Lower Manhattan>` and `ExperienceMap` ended its own centre chain on
 * the same pair under the comment "Always show the map - it will default to NYC if no destination
 * is set. This ensures users see the map immediately instead of a placeholder." So a plan with no
 * destination rendered New York under the traveler's itinerary, with the whole service list
 * scattered around it by a golden-angle spread, and a "N providers" chip counting those invented
 * pins. Nothing on screen said any of it was made up — which is precisely why no existing gate
 * caught it: it renders perfectly.
 *
 * CLAUDE.md forbids this shape twice by name — Locked Decision 22(c) ("renders NO map at all when
 * the service has no coordinates — never a city-center fallback") and Locked Decision 34 ("lat/lng
 * NULL = UNLOCATED: the stop stays visibly flagged and is never guessed onto a map ... no
 * city-center fallback, no geocode-on-read").
 *
 * WHAT THIS HOLDS:
 *   C1-C5  the pure centre resolver: every candidate is a coordinate somebody actually stated, and
 *          when they are all absent the answer is NULL rather than a default place.
 *   S1-S5  the shipped files, because a pure rule a call site can reach past is not a rule: no
 *          coordinate literal survives in either file, the marker branch is gated on the centre
 *          (so no fake marker coordinate is computed), the no-location state exists and carries
 *          the same door out of it the left column already has, and the "providers" chip that
 *          flipped 8 -> 0 no longer claims to be a search result.
 *
 * Pure unit test: no DB, no browser, no React render. CI-safe.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

const { resolveMapCenter } = await import("../../components/experience-map");

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), "utf-8");

const TEMPLATE = "client/src/pages/experience-template.tsx";
const MAP = "client/src/components/experience-map.tsx";

/** The pair that was hardcoded, written apart so this file is not itself a match for the sweep. */
const NYC_LAT = [4, 0, ".", 7, 1, 2, 8].join("");
const NYC_LNG = [7, 4, ".", 0, 0, 6].join("");

test("C1 a stated destination centre is the centre", () => {
  assert.deepEqual(
    resolveMapCenter({ destinationCenter: { lat: 35.0116, lng: 135.7681 } }),
    { lat: 35.0116, lng: 135.7681 },
  );
});

test("C2 with no destination the centre comes from real pins, in priority order", () => {
  const providers = [
    { id: "service-1", lat: 10, lng: 20 },
    { id: "service-2", lat: 30, lng: 40 },
    { id: "custom-9", lat: 50, lng: 60 },
  ];
  // A custom venue is a coordinate the traveler placed themselves — it outranks the spread.
  assert.deepEqual(resolveMapCenter({ providers }), { lat: 50, lng: 60 });
  // Then the items already in the plan.
  assert.deepEqual(
    resolveMapCenter({ providers: providers.slice(0, 2), selectedProviderIds: ["service-2"] }),
    { lat: 30, lng: 40 },
  );
  // Then the average of what is on the map.
  assert.deepEqual(resolveMapCenter({ providers: providers.slice(0, 2) }), { lat: 20, lng: 30 });
});

test("C3 a booked hotel or activity is a real coordinate and is used before giving up", () => {
  assert.deepEqual(resolveMapCenter({ hotelLocation: { lat: 1, lng: 2 } }), { lat: 1, lng: 2 });
  assert.deepEqual(
    resolveMapCenter({ activityLocations: [{ lat: 2, lng: 4 }, { lat: 4, lng: 8 }] }),
    { lat: 3, lng: 6 },
  );
});

test("C4 nothing real => NULL, never a city centre (§13, LD 22(c)/34)", () => {
  assert.equal(resolveMapCenter({}), null);
  assert.equal(resolveMapCenter({ destinationCenter: null, providers: [], activityLocations: [] }), null);
  // A destination NAME with no resolved coordinate is still no coordinate — the case QA hit.
  assert.equal(resolveMapCenter({ destinationCenter: undefined, providers: [] }), null);
});

test("C5 a half-stated or non-finite coordinate is treated as absent, not as a point", () => {
  assert.equal(resolveMapCenter({ destinationCenter: { lat: NaN, lng: 12 } }), null);
  assert.equal(resolveMapCenter({ destinationCenter: { lat: 12, lng: Number.POSITIVE_INFINITY } }), null);
  assert.equal(
    resolveMapCenter({ providers: [{ id: "a", lat: NaN, lng: NaN }] }),
    null,
    "a provider with no usable coordinate contributes nothing rather than dragging the average",
  );
  // A mixed list keeps only the usable pins — the average is never NaN.
  assert.deepEqual(
    resolveMapCenter({ providers: [{ id: "a", lat: NaN, lng: 5 }, { id: "b", lat: 10, lng: 20 }] }),
    { lat: 10, lng: 20 },
  );
});

test("S1 no hardcoded coordinate survives in either file", () => {
  for (const file of [TEMPLATE, MAP]) {
    const src = read(file);
    assert.ok(!src.includes(NYC_LAT), `${file} still contains the hardcoded latitude`);
    assert.ok(!src.includes(NYC_LNG), `${file} still contains the hardcoded longitude`);
    // Nothing may assign a literal coordinate at all — the general form of the same defect.
    const literal = src.match(/\b(lat|lng|latitude|longitude)\s*[:=]\s*-?\d+\.\d+/);
    assert.equal(literal, null, `${file} assigns a literal coordinate: ${literal?.[0]}`);
  }
});

test("S2 the marker branch is gated on the centre — no fake marker coordinate is computed", () => {
  const src = read(TEMPLATE);
  assert.ok(
    src.includes("destination && destination.length >= 2 && destinationCenter"),
    "service markers require a resolved centre, not just a destination string",
  );
  assert.ok(
    src.includes("const baseLat = destinationCenter.lat;") &&
      src.includes("const baseLng = destinationCenter.lng;"),
    "the marker base reads the centre directly — no ?? default left to reintroduce",
  );
  assert.ok(!/baseLat\s*=\s*destinationCenter\?\./.test(src), "no optional-chain-with-default form");
});

test("S3 the map renders NO map when there is no centre, and says why", () => {
  const src = read(MAP);
  assert.ok(src.includes("if (!center) {"), "an absent centre short-circuits before <Map> mounts");
  assert.ok(
    src.includes('data-testid="experience-map-no-location"'),
    "the no-location state is addressable",
  );
  assert.ok(
    src.includes("Your plan doesn't have a location yet"),
    "same words the left column already uses (venue-search-panel, QA F7)",
  );
  // The comment that justified the defect must be gone, not merely bypassed.
  assert.ok(
    !src.includes("it will default to NYC"),
    "the 'always show the map' rationale is retracted, not left standing beside the fix",
  );
  // And the no-location state carries the one door out of itself.
  assert.ok(src.includes('data-testid="button-set-location-from-map"'), "a way out of the empty state");
  assert.ok(
    read(TEMPLATE).includes("onSetLocation={() => openPlanModal()}"),
    "the page passes its EXISTING planning opener — no second planning door (LD 33)",
  );
});

test("S4 every ExperienceMap mount on the page can reach the planning door", () => {
  const src = read(TEMPLATE);
  const mounts = (src.match(/<ExperienceMap\b/g) ?? []).length;
  assert.ok(mounts >= 3, `expected the page's three map mounts, found ${mounts}`);
  // A mount without the door would render an empty state with no way out of it (§13).
  const doors = (src.match(/onSetLocation=\{\(\) => openPlanModal\(\)\}/g) ?? []).length;
  assert.ok(
    doors >= mounts,
    `every map mount needs the door: ${mounts} mounts, ${doors} doors`,
  );
});

test("S5 the pin count names what it counts and cannot render a searched-and-found-none zero", () => {
  const src = read(MAP);
  assert.ok(!src.includes("providers.length} providers"), "the misleading label is gone");
  assert.ok(src.includes("{providers.length} on this map"), "the chip names what it counts");
  // Load-bearing ORDER: the no-centre return must come BEFORE the overlay, so a plan with no
  // location renders no chip at all rather than "0".
  assert.ok(
    src.indexOf("if (!center) {") < src.indexOf("{providers.length} on this map"),
    "the empty state returns before the overlay is reachable",
  );
});
