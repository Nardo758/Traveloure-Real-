/**
 * Row 250 — the four blank Kyoto discover cards get a licensed photo and a credit.
 *
 *   P1  each of the four names has an image URL and an image credit
 *   P2  migration 418 names those URLs and credits, replaces only the known-dead
 *       Unsplash ids (or a null Ginkaku-ji), and is data-only
 *   P3  a fresh popular-cities insert reads kyotoGemPhoto, and the three dead ids
 *       are gone from that seed
 *   P4  migration 400's Ginkaku-ji null stays on KYOTO_CANONICAL_GEMS (KF3)
 *
 * Run: npx tsx --test shared/__tests__/kyoto-gem-photos.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { KYOTO_CANONICAL_GEMS } from "../kyoto-feed-cleanup";
import { KYOTO_GEM_PHOTOS, kyotoGemPhoto } from "../kyoto-gem-photos";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const sql = read("server/migrations/418_kyoto_gem_photo_credits.sql");
const NAMES = [
  "Yoshida Sanso Ryokan",
  "Fushimi Inari Torii Tunnel at Dawn",
  "Philosopher's Path Canal in Autumn",
  "Ginkaku-ji",
] as const;

test("P1 the four Kyoto gems each have an image URL and a credit", () => {
  assert.deepEqual(
    KYOTO_GEM_PHOTOS.map((row) => row.placeName),
    [...NAMES],
  );
  for (const name of NAMES) {
    const row = kyotoGemPhoto(name);
    assert.ok(row, name);
    assert.match(row.imageUrl, /^https:\/\/upload\.wikimedia\.org\//, name);
    assert.ok(row.imageCredit.includes("Wikimedia Commons"), name);
    assert.ok(row.imageCredit.length > 8, name);
  }
  assert.equal(kyotoGemPhoto("Tenryu-ji"), null);
  assert.equal(kyotoGemPhoto("Ginkaku-ji")!.replacesUrl, null);
  assert.match(kyotoGemPhoto("Yoshida Sanso Ryokan")!.replacesUrl ?? "", /images\.unsplash\.com/);
});

test("P2 migration 418 writes those photos and nothing else", () => {
  assert.match(sql, /HELD for Leon's comment/);
  assert.match(sql, /Migration 418 SQL approved — Leon/);
  const body = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  assert.doesNotMatch(body, /\bALTER\b/i);
  assert.doesNotMatch(body, /\bDELETE\b/i);
  assert.doesNotMatch(body, /\bINSERT\b/i);
  assert.doesNotMatch(body, /CHECK \(/);
  assert.doesNotMatch(body, /CREATE INDEX/i);
  for (const row of KYOTO_GEM_PHOTOS) {
    const quoted = row.placeName.replace(/'/g, "''");
    assert.ok(sql.includes(`'${quoted}'`), row.placeName);
    assert.ok(sql.includes(row.imageUrl), row.placeName);
    assert.ok(sql.includes(row.imageCredit), row.placeName);
    if (row.replacesUrl) assert.ok(sql.includes(row.replacesUrl), row.placeName);
  }
  assert.equal((sql.match(/UPDATE travel_pulse_hidden_gems/g) ?? []).length, 4);
});

test("P3 the popular-cities seed takes the photo from kyotoGemPhoto and drops the dead ids", () => {
  const seed = read("server/seeds/popular-cities-content.seed.ts");
  assert.match(seed, /kyotoGemPhoto\(gem\.placeName\)/);
  assert.match(seed, /imageCredit: photo\.imageCredit/);
  for (const row of KYOTO_GEM_PHOTOS) {
    if (!row.replacesUrl) continue;
    assert.equal(seed.includes(row.replacesUrl), false, row.placeName);
  }
});

test("P4 Ginkaku-ji stays null on the migration-400 canonical card", () => {
  const ginkaku = KYOTO_CANONICAL_GEMS.find((row) => row.placeName === "Ginkaku-ji");
  assert.ok(ginkaku);
  assert.equal(ginkaku.imageUrl, null);
  assert.equal(ginkaku.imageCredit, null);
});
