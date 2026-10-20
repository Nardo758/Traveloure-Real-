/**
 * CS-1 item 2 — one live rule for every fact reader (ledger `2026-10-19-cs1-live-facts`).
 *
 *   LV1  isFactLive: superseded ⇒ not live; past expires_at ⇒ not live; future ⇒ live; no expires_at ⇒ not live for a
 *        machine-read origin, live for platform, expert and traveler facts (their existing rule)
 *   LV2  mustOmitOnPublicPage drops a fact that is not live, before any other rule
 *   LV3  the provenance line never says "(may have changed)", and no client or shared source draws it
 *   LV4  the expired-hours line: with the stored link, "Hours not checked yet. See <Place>'s official site before you
 *        go."; without one, plain "Hours not checked yet"
 *   LV5  both blog generators tell the model never to write a date, a source, "verified" or "confirmed" about a fact
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { REVIEWED_ORIGINS, factProvenanceLine, isFactLive, mustOmitOnPublicPage } from "../content-facts";
import { HOURS_NOT_CHECKED_TEXT, hoursWaitingLine } from "../fact-review";

const now = new Date("2026-10-19T03:00:00Z");
const past = new Date("2026-10-18T03:00:00Z");
const future = new Date("2026-10-20T03:00:00Z");

test("LV1 — isFactLive", () => {
  assert.equal(isFactLive({ origin: "official_refresh", expiresAt: future }, now), true);
  assert.equal(isFactLive({ origin: "official_refresh", expiresAt: past }, now), false);
  assert.equal(isFactLive({ origin: "official_refresh", expiresAt: now }, now), false, "expiring now is expired");
  assert.equal(isFactLive({ origin: "official_refresh", expiresAt: future, supersededBy: "x" }, now), false);
  for (const origin of REVIEWED_ORIGINS) assert.equal(isFactLive({ origin, expiresAt: null }, now), false, origin);
  for (const origin of ["platform_listing", "gem", "event", "expert_nugget", "traveler_note"]) {
    assert.equal(isFactLive({ origin, expiresAt: null }, now), true, origin);
    assert.equal(isFactLive({ origin, expiresAt: past }, now), false, `${origin} past`);
  }
});

test("LV2 — a public page drops a fact that is not live", () => {
  const official = {
    origin: "crawled",
    license: "official",
    factType: "hours",
    sourceLicenseClass: "official",
    sourcePublicOk: true,
    sourceName: "Kinkaku-ji",
    sourceUrl: "https://www.shokoku-ji.jp/kinkakuji/",
    fetchedAt: past,
  };
  assert.equal(mustOmitOnPublicPage({ ...official, expiresAt: future }, now), false);
  assert.equal(mustOmitOnPublicPage({ ...official, expiresAt: past }, now), true);
  assert.equal(mustOmitOnPublicPage({ ...official, expiresAt: null }, now), true);
  assert.equal(mustOmitOnPublicPage({ origin: "gem", expiresAt: past }, now), true);
  assert.equal(mustOmitOnPublicPage({ origin: "gem", expiresAt: null }, now), false);
});

test("LV3 — no \"(may have changed)\" anywhere a traveler reads", () => {
  const line = factProvenanceLine({ origin: "places_api", factType: "location", fetchedAt: past, expiresAt: past }, now, "Asia/Tokyo");
  assert.doesNotMatch(line, /may have changed/);
  const root = process.cwd();
  for (const f of ["client/src/lib/place-facts.ts", "client/src/components/plan/ItemSheet.tsx"]) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, f), "utf8"), /may have changed/, f);
  }
});

test("LV4 — the expired-hours line", () => {
  assert.deepEqual(hoursWaitingLine({ placeName: "Kinkaku-ji", homepage: "https://www.shokoku-ji.jp/kinkakuji/visit/", termsClass: "extract" }), {
    text: "Hours not checked yet. See the official site for Kinkaku-ji before you go.",
    linkText: "the official site for Kinkaku-ji",
    url: "https://www.shokoku-ji.jp/",
  });
  for (const input of [
    { placeName: "JR Central", homepage: "https://jr-central.co.jp/", termsClass: "link_out_no_link" },
    { placeName: "X", homepage: null, termsClass: "extract" },
    { placeName: "X", homepage: "not a url", termsClass: "extract" },
    { placeName: "X", homepage: "https://www.google.com/maps/place/?q=place_id:ChIJ", termsClass: "extract" },
    { placeName: "X", homepage: "https://maps.google.co.jp/", termsClass: "extract" },
    { placeName: "X", homepage: "https://maps.app.goo.gl/abc", termsClass: "extract" },
    { placeName: "X", homepage: "https://places.googleapis.com/v1/places/ChIJ", termsClass: "extract" },
  ]) {
    assert.deepEqual(hoursWaitingLine(input), { text: HOURS_NOT_CHECKED_TEXT, linkText: "", url: null }, input.placeName);
  }
  assert.equal(HOURS_NOT_CHECKED_TEXT, "Hours not checked yet");
});

test("LV5 — the generators' prompts forbid a date, a source, verified and confirmed for a fact", () => {
  const root = process.cwd();
  for (const f of ["server/services/blog-event-guide.service.ts", "server/services/blog-race-weekend.service.ts"]) {
    const src = fs.readFileSync(path.join(root, f), "utf8");
    assert.match(src, /Never write a date, a source name, or the words verified or confirmed about a venueFact/, f);
    assert.match(src, /withFactStamps\(checked\.body, facts\)/, f);
  }
});
