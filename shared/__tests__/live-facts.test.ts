/**
 * CS-1 item 2 — one live rule for every fact reader (ledger `2026-10-19-cs1-live-facts`).
 *
 *   LV1  isFactLive: superseded ⇒ not live; past expires_at ⇒ not live; future ⇒ live; no expires_at ⇒ not live for a
 *        machine-read origin, live for platform, expert and traveler facts (their existing rule)
 *   LV2  mustOmitOnPublicPage drops a fact that is not live, before any other rule
 *   LV3  the provenance line never says "(may have changed)", and no client or shared source draws it
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { REVIEWED_ORIGINS, factProvenanceLine, isFactLive, mustOmitOnPublicPage } from "../content-facts";

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
