/**
 * Smoke 11 fixture proofs (R321, ledger row `2026-10-05-smoke11-fixes`).
 *   F1 S11-2  the stay is not a stop: never Up next, never sets the now-line window
 *   F2 S11-3  the now-line draws within [first start − 1 h, last end + 1 h]: above, between, below
 *   F3 S11-9  no `travelmode` / `dirflg` on any Maps link, client or server builder
 *   F4 S11-10 a ward is canonical: "Nakagyou Ward" / "Nakagyo" → "Nakagyo Ward, Kyoto"
 *   F5 S11-11 the address line is built from English components; any CJK component is dropped
 *   F6 S11-6  the map anchor is ONE derivation: the located stay, else the built-around item, else none
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTemporalStates, nowLinePosition } from "../plancard-temporal";
import { buildAppleMapsDeepLink, buildGoogleMapsDeepLink } from "../../../lib/maps";
import { planMapAnchor } from "../../../lib/map-scene";
import {
  buildAppleMapsUrl,
  buildAppleMapsWebUrl,
  buildAppleNavUrl,
  buildGoogleMapsUrl,
  buildGoogleNavUrl,
} from "../../../../../server/services/maps-url-builder";
import { canonicalAreaLine, canonicalWardName, containsCjk, placesAddressLine, placesAreaText } from "../../../../../shared/place-address";

const DAY = "2026-10-06";
const TZ = "Asia/Tokyo";
const at = (hhmm: string) => new Date(`${DAY}T${hhmm}:00+09:00`);
const acts = [
  { id: "stay", name: "Hotel Kanra", type: "accommodation", time: "15:00" },
  { id: "a", name: "Nishiki Market", type: "activity", time: "09:00", endTime: "10:30" },
  { id: "b", name: "Nijo Castle", type: "activity", time: "11:00", endTime: "12:30" },
  { id: "c", name: "Dinner", type: "dining", time: "18:00", endTime: "19:30" },
] as any[];

test("F1 S11-2: the stay is never Up next and never a stop the now-line counts", () => {
  // At 14:30 the next timed stop is Dinner (18:00) — the 15:00 check-in is not "next".
  const states = computeTemporalStates(acts, DAY, at("14:30"), new Set(), TZ);
  assert.notEqual(states.stay, "upcoming");
  assert.equal(states.c, "upcoming");
  // A day of only a stay has no now-line window at all.
  assert.equal(nowLinePosition([acts[0]], DAY, at("15:00"), TZ), null);
});

test("F2 S11-3: the now-line window and its three positions", () => {
  const timed = acts.slice(1);
  assert.equal(nowLinePosition(timed, DAY, at("07:59"), TZ), null, "more than an hour before the first stop");
  assert.equal(nowLinePosition(timed, DAY, at("08:15"), TZ), 0, "above the first stop before it starts");
  assert.equal(nowLinePosition(timed, DAY, at("10:45"), TZ), 1, "between stops during the day");
  assert.equal(nowLinePosition(timed, DAY, at("11:30"), TZ), 1, "above the stop in progress");
  // A stop with no end time runs until the next one starts.
  const open = [{ id: "x", name: "X", type: "activity", time: "09:00" }, { id: "y", name: "Y", type: "activity", time: "12:00" }] as any[];
  assert.equal(nowLinePosition(open, DAY, at("10:00"), TZ), 0);
  assert.equal(nowLinePosition(open, DAY, at("12:30"), TZ), 2, "below the last, untimed-end stop after it starts");
  assert.equal(nowLinePosition(timed, DAY, at("20:00"), TZ), timed.length, "below the last stop after it ends");
  assert.equal(nowLinePosition(timed, DAY, at("20:31"), TZ), null, "more than an hour after the last end");
});

test("F3 S11-9: no travel mode on any Maps link — Maps chooses", () => {
  const pts = [
    { name: "A", lat: 35.0, lng: 135.7 },
    { name: "B", lat: 35.01, lng: 135.76 },
  ];
  for (const url of [
    buildGoogleMapsDeepLink(pts, "walk" as any),
    buildAppleMapsDeepLink(pts, "walk" as any),
    buildGoogleMapsUrl(pts as any, "walk"),
    buildAppleMapsUrl(pts as any, "walk"),
    buildAppleMapsWebUrl(pts as any, "walk"),
    buildGoogleNavUrl(35, 135.7, 35.01, 135.76, "transit"),
    buildAppleNavUrl(35, 135.7, 35.01, 135.76, "transit"),
  ]) {
    assert.doesNotMatch(url, /travelmode=|dirflg=/, url);
  }
});

test("F4 S11-10: one ward, one spelling", () => {
  const nakagyou = [
    { longText: "Nakagyou Ward", types: ["ward"] },
    { longText: "Kyoto", types: ["locality"] },
  ];
  const nakagyo = [
    { longText: "Nakagyo", types: ["ward"] },
    { longText: "Kyoto", types: ["locality"] },
  ];
  assert.equal(placesAreaText(nakagyou), "Nakagyo Ward, Kyoto");
  assert.equal(placesAreaText(nakagyo), "Nakagyo Ward, Kyoto");
  // A fact cached before the rule is adopted in the same spelling at attach.
  assert.equal(canonicalAreaLine("Nakagyou Ward, Kyoto"), "Nakagyo Ward, Kyoto");
  assert.equal(canonicalWardName("Nakagyō-ku"), "Nakagyo Ward");
  // Only ward-shaped text is touched: a city or a neighbourhood keeps its own spelling.
  assert.equal(canonicalWardName("Kyoto"), "Kyoto");
  assert.equal(canonicalAreaLine("Gion, Kyoto"), "Gion, Kyoto");
});

test("F5 S11-11: the address line is English components only", () => {
  const components = [
    { longText: "537", types: ["premise"] },
    { longText: "中之町", types: ["sublocality_level_4"] },
    { longText: "Nakanocho", types: ["sublocality_level_3"] },
    { longText: "Nakagyou Ward", types: ["ward"] },
    { longText: "Kyoto", types: ["locality"] },
    { longText: "Japan", types: ["country"] },
    { longText: "604-8042", types: ["postal_code"] },
  ];
  const line = placesAddressLine(components)!;
  assert.equal(line, "537, Nakanocho, Nakagyo Ward, Kyoto, Japan, 604-8042");
  assert.equal(containsCjk(line), false);
  assert.equal(containsCjk("〒604-8042 京都府京都市"), true);
  assert.equal(placesAddressLine([{ longText: "京都市", types: ["locality"] }]), null, "nothing English ⇒ no line (§13)");
});

test("F6 S11-6: the map anchor — stay, else the built-around item, else none", () => {
  const located = [
    { id: "s", name: "Hotel Kanra", type: "accommodation", lat: 34.99, lng: 135.76 },
    { id: "v", name: "Kiyomizu", type: "activity", lat: 34.99, lng: 135.78 },
  ];
  assert.deepEqual(planMapAnchor(located, "v"), { kind: "stay", name: "Hotel Kanra", lat: 34.99, lng: 135.76 });
  assert.deepEqual(planMapAnchor(located.slice(1), "v"), { kind: "venue", name: "Kiyomizu", lat: 34.99, lng: 135.78 });
  assert.equal(planMapAnchor([{ id: "s", name: "Hotel", type: "accommodation", lat: null, lng: null }]), null, "an unlocated stay is never guessed onto the map");
});

test("F7 S11-12: every API timestamp is ISO 8601", async () => {
  const { isoTimestamp } = await import("../../../../../shared/iso-timestamp");
  const d = new Date("2026-10-05T09:00:00Z");
  assert.equal(isoTimestamp(d), "2026-10-05T09:00:00.000Z");
  assert.equal(isoTimestamp(String(d)), "2026-10-05T09:00:00.000Z", "the old String(date) form is repaired");
  assert.equal(isoTimestamp(null), null);
  assert.equal(isoTimestamp("not a date"), null, "never an invented instant");
});
