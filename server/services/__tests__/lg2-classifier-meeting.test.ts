/**
 * LG-2 Asks 4 and 5 (ledger `2026-10-19-lg2-classifier-meeting`): activity words are stripped before an item is judged
 * to name no place, a title joining two places is looked up by its first, and a private tour, arrival or check-in
 * routes only from a point a person chose or the traveler's stay. Pure; no request leaves the process.
 *
 *   CL1 the six routable places are no longer skipped, and each is looked up by its own name
 *   CL2 "(optional …)", "& Riverside Walk" and "Self-Guided" are stripped
 *   CL3 two joined places: the first is looked up, and only its words are matched
 *   CL4 an area stays skipped after stripping; a title naming nothing stays skipped
 *   CL5 meeting-or-stay titles: the kinds, and the geocoder never looks them up
 *   CL6 routing: a meeting-or-stay item takes an admin point, a link a person attached, else the stay, else nothing —
 *       never its own Google point or an OSM match on its name; an ordinary item is unchanged
 *
 * NEGATIVE SPACE (§18d): read from title words only; a title outside these words is judged like any other.
 *
 * Run: npx tsx --test server/services/__tests__/lg2-classifier-meeting.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { meetingOrStayItem } from "@shared/meeting-point-items";
import { regeocodeItemV2, strippedPlaceTitle, v2QueryPlan, type RegeocodeItem } from "../item-osm-regeocode.service";
import { routingPointFor, type OpenPlaceCoord } from "../routing/open-routing-points";

const item = (title: string, locationName: string | null = null): RegeocodeItem => ({
  id: "i1",
  title,
  locationName,
  destination: "Kyoto, Japan",
  storedLat: null,
  storedLng: null,
});

test("CL1 the six routable places are looked up by their own names", () => {
  const cases: Array<[string, string]> = [
    ["Arashiyama Bamboo Grove Walk", "Arashiyama Bamboo Grove"],
    ["Philosopher's Path Stroll", "Philosopher's Path"],
    ["Togetsukyo Bridge Photo Spot", "Togetsukyo Bridge"],
    ["Pontocho Alley Evening Walk", "Pontocho Alley Evening"],
    ["Yasaka Pagoda Photo Stop", "Yasaka Pagoda"],
    ["Sannenzaka & Ninenzaka Shopping Streets", "Sannenzaka"],
  ];
  for (const [title, place] of cases) {
    const plan = v2QueryPlan(item(title));
    assert.equal(plan.skip, null, `${title} must not be skipped`);
    if (plan.skip === null) assert.equal(plan.place, place, title);
  }
});

test("CL2 optional clauses, riverside walks and self-guided are stripped", () => {
  assert.deepEqual(strippedPlaceTitle("Kiyomizu-dera (optional sunset viewing)", "Kyoto").places, ["Kiyomizu-dera"]);
  assert.deepEqual(strippedPlaceTitle("Kamogawa Delta & Riverside Walk", "Kyoto").places, ["Kamogawa Delta"]);
  assert.deepEqual(strippedPlaceTitle("Self-Guided Fushimi Inari", "Kyoto").places, ["Fushimi Inari"]);
});

test("CL3 two joined places: the first is looked up, only its words matched", () => {
  const plan = v2QueryPlan(item("Ryoanji Temple or Kinkakuji"));
  assert.equal(plan.skip, null);
  if (plan.skip === null) {
    assert.equal(plan.multiPlace, true);
    assert.equal(plan.place, "Ryoanji Temple");
    assert.ok(!Array.from(plan.itemTokens).some((t) => t.startsWith("kinkaku")), "the second place is never matched");
  }
  const paren = strippedPlaceTitle("Ryoanji (or Kinkakuji)", "Kyoto");
  assert.equal(paren.multiPlace, true);
  assert.equal(paren.places[0], "Ryoanji");
});

test("CL4 an area stays skipped; a title naming nothing stays skipped", () => {
  // "District" is an area word, so what remains after stripping is still an area: skipped, never looked up.
  assert.notEqual(v2QueryPlan(item("Higashiyama District Walk")).skip, null);
  assert.equal(v2QueryPlan(item("Free time")).skip, "no_place_phrase");
});

test("CL5 meeting-or-stay titles are never looked up", async () => {
  assert.equal(meetingOrStayItem("Kyoto Dawn Temple Private Tour"), "private_tour");
  assert.equal(meetingOrStayItem("Private Gion Night Tour"), "private_tour");
  assert.equal(meetingOrStayItem("Arrive in Kyoto"), "arrival");
  assert.equal(meetingOrStayItem("KIX Airport Arrival"), "arrival");
  assert.equal(meetingOrStayItem("Check-in at hotel"), "check_in");
  assert.equal(meetingOrStayItem("Hotel check in"), "check_in");
  assert.equal(meetingOrStayItem("Kinkaku-ji"), null);
  assert.equal(meetingOrStayItem("Walking Tour of Gion"), null, "a tour that is not private is an ordinary item");
  const r = await regeocodeItemV2(item("Arrive in Kyoto"), [], (async () => {
    throw new Error("must not be called");
  }) as any);
  assert.equal(r.requested, false);
  assert.deepEqual(r.outcome, { kind: "unresolved", reason: "meeting_or_stay" });
});

test("CL6 routing: a meeting-or-stay item takes only a chosen point or the stay", () => {
  const own = { lat: 35.0116, lng: 135.7681 }; // a city-centre point — never used for these items
  const osmMatch: OpenPlaceCoord = { lat: 35.02, lng: 135.76, origin: "osm", linkSource: null };
  const attached: OpenPlaceCoord = { lat: 34.9858, lng: 135.7588, origin: "osm", linkSource: "admin" };
  const admin: OpenPlaceCoord = { lat: 34.9855, lng: 135.759, origin: "admin" };
  const stay = { lat: 35.0039, lng: 135.7756, coordOrigin: "osm" as const };
  const base = { placeId: "gp1", open: new Map<string, OpenPlaceCoord>(), ownPoint: own, factPoint: own, osmRide: false };

  // an admin row for its place id wins
  assert.equal(routingPointFor({ ...base, open: new Map([["gp1", admin]]), meetingOrStay: "arrival", stayPoint: stay })?.coordOrigin, "admin");
  // a link a person attached is used; an OSM name match is not
  assert.deepEqual(
    (({ lat, lng }) => ({ lat, lng }))(routingPointFor({ ...base, itemOpen: attached, meetingOrStay: "arrival", stayPoint: stay })!),
    { lat: attached.lat, lng: attached.lng },
  );
  const viaStay = routingPointFor({ ...base, itemOpen: osmMatch, open: new Map([["gp1", osmMatch]]), meetingOrStay: "check_in", stayPoint: stay });
  assert.equal(viaStay?.lat, stay.lat, "the OSM match is skipped; the stay is used");
  // neither: unlocated — never the item's own (Google) point or a fact
  assert.equal(routingPointFor({ ...base, itemOpen: osmMatch, meetingOrStay: "private_tour", stayPoint: null }), null);
  // an ordinary item is unchanged: its OSM link, else its own point
  assert.equal(routingPointFor({ ...base, itemOpen: osmMatch })?.lat, osmMatch.lat);
  assert.equal(routingPointFor({ ...base })?.coordOrigin, "google");
});
