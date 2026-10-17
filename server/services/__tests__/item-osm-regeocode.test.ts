/**
 * 9b-e — the item re-geocode lookup and classification (ledger `2026-10-17-9b-e-regeocode-dry-run`). Pure, with a
 * fake fetch: no request leaves the process.
 *
 *   RG1  one matching answer ⇒ resolved, with the distance from the stored point
 *   RG2  matching answers further than 150 m apart ⇒ ambiguous; within 150 m ⇒ resolved
 *   RG3  answers that do not name the item ⇒ unresolved (no_match); no answers ⇒ unresolved (no_results)
 *   RG4  an item that names no place is never requested
 *   RG5  a failed call ⇒ unreachable; the request sends the Traveloure user agent and never the stored point
 *
 * Run: npx tsx --test server/services/__tests__/item-osm-regeocode.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  ITEM_REGEOCODE_USER_AGENT,
  classifyRegeocodeHits,
  metresBetween,
  regeocodeItem,
  regeocodeQueryText,
  type RegeocodeItem,
} from "../item-osm-regeocode.service";

const FUSHIMI: RegeocodeItem = {
  id: "item-1",
  title: "Visit Fushimi Inari Taisha",
  locationName: null,
  destination: "Kyoto",
  storedLat: 34.9671,
  storedLng: 135.7727,
};

const hit = (name: string, lat: number, lon: number) => ({ name, lat: String(lat), lon: String(lon), namedetails: { name } });

test("RG1: one matching answer is resolved, with metres from the stored point", () => {
  const out = classifyRegeocodeHits(FUSHIMI, [hit("Fushimi Inari Taisha", 34.9677, 135.7792)]);
  assert.equal(out.kind, "resolved");
  if (out.kind !== "resolved") return;
  assert.equal(out.matchedName, "Fushimi Inari Taisha");
  assert.equal(out.matches, 1);
  assert.equal(out.metresFromStored, metresBetween(34.9671, 135.7727, 34.9677, 135.7792));
});

test("RG2: far-apart matches are ambiguous; close matches are one place", () => {
  const far = classifyRegeocodeHits(FUSHIMI, [hit("Fushimi Inari Taisha", 34.9677, 135.7792), hit("Fushimi Inari Taisha", 35.1, 135.9)]);
  assert.equal(far.kind, "ambiguous");
  const near = classifyRegeocodeHits(FUSHIMI, [hit("Fushimi Inari Taisha", 34.9677, 135.7792), hit("Fushimi Inari Taisha", 34.9680, 135.7795)]);
  assert.equal(near.kind, "resolved");
  if (near.kind === "resolved") assert.equal(near.matches, 2);
});

test("RG3: answers that do not name the item, or no answers, are unresolved", () => {
  assert.deepEqual(classifyRegeocodeHits(FUSHIMI, [hit("Kiyomizu-dera", 34.9949, 135.785)]), { kind: "unresolved", reason: "no_match" });
  assert.deepEqual(classifyRegeocodeHits(FUSHIMI, []), { kind: "unresolved", reason: "no_results" });
});

test("RG4: an item that names no place is never requested", async () => {
  let calls = 0;
  const out = await regeocodeItem({ ...FUSHIMI, title: "Free time", locationName: null }, (async () => {
    calls += 1;
    return { ok: true, json: async () => [] };
  }) as any);
  assert.equal(out.requested, false);
  assert.equal(out.outcome.kind, "unresolved");
  assert.equal(calls, 0);
});

test("RG5: a failed call is unreachable; the request names Traveloure and never sends the stored point", async () => {
  const seen: Array<{ url: string; ua: string }> = [];
  const failing = await regeocodeItem(FUSHIMI, (async (url: string, init: any) => {
    seen.push({ url, ua: init.headers["User-Agent"] });
    return { ok: false, json: async () => [] };
  }) as any);
  assert.deepEqual(failing.outcome, { kind: "unreachable" });
  const thrown = await regeocodeItem(FUSHIMI, (async () => {
    throw new Error("ECONNRESET");
  }) as any);
  assert.deepEqual(thrown.outcome, { kind: "unreachable" });
  assert.equal(seen[0].ua, ITEM_REGEOCODE_USER_AGENT);
  assert.match(seen[0].ua, /Traveloure/);
  const q = new URL(seen[0].url).searchParams;
  assert.equal(q.get("q"), regeocodeQueryText(FUSHIMI));
  assert.ok(!seen[0].url.includes("34.9671") && !seen[0].url.includes("135.7727"), "the stored point is not a search input");
  assert.equal(q.get("limit"), "5");
});
