/**
 * #1796 follow-up, item 7 (ledger `2026-10-31-kyoto-1796-item7`).
 *
 *   I1 the new values: the one approved Yoshida rewording, the rest removals, a cleared field is null.
 *   I2 no item-7 phrase remains in a new value, the Kyoto seed or the cleanup copy.
 *   I3 the seed writes the new values; Ginkaku-ji keeps #1804's approved admission and autumn lines.
 *   I4 migration 426 is registered after 425, data-only, carries every fix and no approval sentence.
 *
 * Run: npx tsx --test shared/__tests__/kyoto-1796-item7.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  KYOTO_ITEM7_FIXES,
  KYOTO_ITEM7_REMOVED_PHRASES,
  PHILOSOPHER_DESCRIPTION_ITEM7,
  PRE_DAWN_DESCRIPTION_ITEM7,
  YOSHIDA_SANSO_DESCRIPTION,
  YOSHIDA_SANSO_WHY,
} from "../kyoto-1796-item7";
import {
  GINKAKU_ADMISSION_HELD,
  GINKAKU_AUTUMN_VIEWING_HELD,
} from "../kyoto-seed-cleanup";
import { KYOTO_CANONICAL_GEMS } from "../kyoto-feed-cleanup";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const sql = read("server/migrations/426_kyoto_1796_item7_copy.sql");
const seed = read("server/seeds/popular-cities-content.seed.ts");

const hit = (text: string) => KYOTO_ITEM7_REMOVED_PHRASES.filter((re) => re.test(text)).map(String);

test("I1 the new values", () => {
  assert.equal(
    YOSHIDA_SANSO_DESCRIPTION,
    "A converted 1932 villa of the Higashi-Fushimi imperial family on the forested slopes of Mount Yoshida.",
  );
  assert.match(YOSHIDA_SANSO_DESCRIPTION, /1932/);
  assert.equal(YOSHIDA_SANSO_WHY, "The Japanese imperial hospitality tradition is alive here. No-one rushes you, pure Kyoto.");
  assert.equal(PHILOSOPHER_DESCRIPTION_ITEM7, "The canal-side path connecting Nanzen-ji to Ginkaku-ji.");
  assert.equal(PRE_DAWN_DESCRIPTION_ITEM7, "Arriving at 4:30am means walking the full summit trail in mist.");
  const tunnel = KYOTO_ITEM7_FIXES.find((f) => f.placeName === "Fushimi Inari Torii Tunnel at Dawn");
  assert.equal(tunnel?.next, null, "the whole value was the phrase, so the field is cleared");
  for (const fix of KYOTO_ITEM7_FIXES) {
    for (const prior of fix.priors) assert.ok(hit(prior).length > 0, `${fix.placeName}: a prior carries a removed phrase`);
  }
});

test("I2 no item-7 phrase remains", () => {
  for (const fix of KYOTO_ITEM7_FIXES) assert.deepEqual(hit(fix.next ?? ""), [], fix.placeName);
  const kyoto = seed.slice(seed.indexOf('city: "Kyoto"'), seed.lastIndexOf('city: "Kyoto"') + 2000);
  assert.deepEqual(hit(kyoto), [], "Kyoto gems in the popular-cities seed");
  assert.deepEqual(hit(read("shared/kyoto-feed-cleanup.ts")), []);
  for (const gem of KYOTO_CANONICAL_GEMS) assert.deepEqual(hit(JSON.stringify(gem)), [], gem.id);
});

test("I3 the seed writes the new values; Ginkaku-ji keeps #1804's lines", () => {
  for (const name of [
    "YOSHIDA_SANSO_DESCRIPTION",
    "YOSHIDA_SANSO_WHY",
    "PHILOSOPHER_DESCRIPTION_ITEM7",
    "PRE_DAWN_DESCRIPTION_ITEM7",
    "FUSHIMI_DAWN_WHY_ITEM7",
  ]) {
    assert.match(seed, new RegExp(`: ${name},`), name);
  }
  const ginkaku = KYOTO_CANONICAL_GEMS.find((g) => g.placeName === "Ginkaku-ji");
  assert.ok(ginkaku, "Ginkaku-ji canonical card");
  assert.equal(ginkaku.admission, "Adult ¥1,000; elementary and junior high ¥500");
  assert.equal(GINKAKU_ADMISSION_HELD, ginkaku.admission);
  assert.match(ginkaku.hours, /Autumn viewing Nov 1 – Dec 5, 2026$/);
  assert.equal(GINKAKU_AUTUMN_VIEWING_HELD, "Autumn viewing Nov 1 – Dec 5, 2026");
  assert.equal(/https?:\/\//.test(ginkaku.hours), false);
});

test("I4 migration 426", () => {
  const registry = read("server/migrations/migration-files.ts");
  assert.ok(registry.indexOf('"425_kyoto_1796_followups.sql"') < registry.indexOf('"426_kyoto_1796_item7_copy.sql"'));
  for (const fix of KYOTO_ITEM7_FIXES) {
    assert.ok(sql.includes(fix.placeName), fix.placeName);
    if (fix.next) assert.ok(sql.includes(fix.next), fix.next);
    for (const prior of fix.priors) assert.ok(sql.includes(prior), prior);
  }
  assert.match(sql, /SET why_locals_love_it = NULL/);
  const body = sql.replace(/^--.*$/gm, "");
  for (const banned of [/\bALTER\b/i, /\bDELETE\b/i, /\bDROP\b/i, /CREATE INDEX/i, /CHECK \(/i, /\bDEFAULT\b/i]) {
    assert.equal(banned.test(body), false, String(banned));
  }
  assert.equal(/SQL approved/i.test(sql), false);
  assert.match(sql, /HELD for Leon's comment/);
});
