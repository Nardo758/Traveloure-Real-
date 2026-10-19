/**
 * CS-1 item 2 — the coverage census and where-to-stay's neighbourhood line drop an expired fact, without a database
 * (ledger `2026-10-19-cs1-live-facts`). Both readers filter through the ONE rule, `isFactLive`.
 *
 *   LR1  the coverage census counts a live official fact and not an expired one, nor a machine-read one with no expiry
 *   LR2  where-to-stay's neighbourhood line skips an expired registry description and falls back to the spine
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCoverageCensus } from "../services/coverage-census.service";
import { neighbourhoodLinesFrom } from "../services/where-to-stay-lines";

const now = new Date("2026-10-19T03:00:00Z");
const past = new Date("2026-10-01T03:00:00Z");
const future = new Date("2026-11-01T03:00:00Z");

test("LR1 — the coverage census drops an expired fact", async () => {
  // Placeholder points (not real places); the census only places a fact at its nearest neighbourhood.
  const fact = (sourceName: string, expires_at: Date | null, origin = "official_refresh") => ({
    place_lat: 1, place_lng: 1, source_class: "public", license: "official", fact_type: "hours", origin, expires_at, superseded_by: null, source_name: sourceName,
  });
  const query = async (text: string) => {
    if (/from city_neighborhoods/.test(text)) return { rows: [{ id: "n1", slug: "hood", name: "Hood", centroid_lat: 1, centroid_lng: 1 }] };
    if (/from place_facts/.test(text)) return { rows: [fact("Live", future), fact("Expired", past), fact("NoExpiry", null)] };
    return { rows: [] };
  };
  const census = await loadCoverageCensus("kyoto", {}, query, now);
  const row = census.rows.find((r) => r.slug === "hood");
  assert.ok(row);
  assert.equal(row!.officialHours, 1);
  assert.deepEqual(row!.officialBySource, { Live: 1 });
});

test("LR2 — where-to-stay's neighbourhood line skips an expired description", () => {
  const row = (text: string, expiresAt: Date | null, origin = "crawled") =>
    ({ placeRef: "gion", value: { text }, origin, expiresAt, supersededBy: null }) as any;
  const ranked = [{ slug: "gion", name: "Gion" }];
  const spine = [{ slug: "gion", description: "Spine line." }];
  const identity = (rows: any[]) => rows;
  assert.deepEqual(neighbourhoodLinesFrom(ranked, spine, [row("Old line.", past)], identity, now).get("gion"), { text: "Spine line.", source: "spine" });
  assert.deepEqual(neighbourhoodLinesFrom(ranked, spine, [row("No expiry.", null)], identity, now).get("gion"), { text: "Spine line.", source: "spine" });
  assert.deepEqual(neighbourhoodLinesFrom(ranked, spine, [row("Live line.", future)], identity, now).get("gion"), { text: "Live line.", source: "registry" });
});
