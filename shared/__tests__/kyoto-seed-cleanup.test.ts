/**
 * Row 300a — Kyoto seed cleanup.
 *
 *   C1  the removed phrases are detected, and the cleaned strings do not carry them
 *   C2  the seed files no longer contain those phrases on a Kyoto gem field
 *   C3  migration 421 writes the cleaned copy, the held Ginkaku-ji fact, and the
 *       remaining photo credits, and is data-only. The file does not carry an
 *       approval sentence.
 *
 * Run: npx tsx --test shared/__tests__/kyoto-seed-cleanup.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { composeGemFactLine } from "../gem-fact-line";
import { kyotoGemPhoto } from "../kyoto-gem-photos";
import { kyotoRemovedPhrase, rewordKyotoBannedCopy, scanKyotoGemRemovedPhrases } from "../kyoto-gem-copy";
import {
  FUSHIMI_DAWN_DESCRIPTION,
  FUSHIMI_DAWN_DESCRIPTION_PRIOR,
  FUSHIMI_DAWN_WHY,
  FUSHIMI_DAWN_WHY_PRIOR,
  GINKAKU_ACCESS_SOURCE_URL,
  GINKAKU_ADMISSION_HELD,
  GINKAKU_ADMISSION_PRIOR,
  GINKAKU_AUTUMN_SOURCE_URL,
  GINKAKU_AUTUMN_VIEWING_HELD,
  GINKAKU_FACT_CHECKED_ON,
  GINKAKU_HOURS,
  KYOTO_COPY_FIXES,
  KYOTO_REMAINING_GEM_PHOTOS,
  PHILOSOPHER_DESCRIPTION,
  PHILOSOPHER_DESCRIPTION_PRIOR,
  PONTOCHO_WHY_PRIOR,
  PRE_DAWN_DESCRIPTION,
  PRE_DAWN_DESCRIPTION_PRIOR,
  PRE_DAWN_WHY,
  PRE_DAWN_WHY_PRIOR,
  YOSHIDA_SANSO_ADDRESS,
  YOSHIDA_SANSO_ADDRESS_PRIOR,
  kyotoRemainingGemPhoto,
} from "../kyoto-seed-cleanup";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const sql = read("server/migrations/421_kyoto_seed_cleanup.sql");
const sqlBody = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const SEED_FILES = [
  "server/seeds/popular-cities-content.seed.ts",
  "server/seeds/phase-4-kyoto-fill.seed.ts",
  "server/data/hidden-gems.json",
  "playwright/tests/fixtures/discover-location-kyoto.json",
];

test("C1 removed phrases are caught on the prior text and absent from the cleaned text", () => {
  const pairs: Array<[string, string | null]> = [
    [FUSHIMI_DAWN_DESCRIPTION_PRIOR, FUSHIMI_DAWN_DESCRIPTION],
    [FUSHIMI_DAWN_WHY_PRIOR, FUSHIMI_DAWN_WHY],
    [PHILOSOPHER_DESCRIPTION_PRIOR, PHILOSOPHER_DESCRIPTION],
    [PRE_DAWN_DESCRIPTION_PRIOR, PRE_DAWN_DESCRIPTION],
    [PRE_DAWN_WHY_PRIOR, PRE_DAWN_WHY],
    [PONTOCHO_WHY_PRIOR, null],
    [YOSHIDA_SANSO_ADDRESS_PRIOR, YOSHIDA_SANSO_ADDRESS],
    [GINKAKU_ADMISSION_PRIOR, GINKAKU_ADMISSION_HELD],
  ];
  for (const [prior, next] of pairs) {
    assert.ok(kyotoRemovedPhrase(prior), prior);
    assert.equal(kyotoRemovedPhrase(next), null, next ?? "(cleared)");
    assert.equal(rewordKyotoBannedCopy(prior), prior, "the approved-swap function does not rewrite these lines");
  }
  assert.equal(YOSHIDA_SANSO_ADDRESS, "59-1 Yoshida Shimooji-cho");
  assert.match(GINKAKU_ADMISSION_HELD, /elementary and junior high/);
  assert.match(GINKAKU_AUTUMN_VIEWING_HELD, /Nov 1 – Dec 5/);
  assert.match(GINKAKU_HOURS, new RegExp(GINKAKU_AUTUMN_VIEWING_HELD.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.ok(GINKAKU_HOURS.includes(GINKAKU_AUTUMN_SOURCE_URL));
  const line = composeGemFactLine({
    hours: GINKAKU_HOURS,
    admission: GINKAKU_ADMISSION_HELD,
    sourceUrl: GINKAKU_ACCESS_SOURCE_URL,
    factCheckedOn: GINKAKU_FACT_CHECKED_ON,
  });
  assert.ok(line);
  assert.equal(line.checkedLabel, "31 Oct 2026");
  assert.equal(line.sourceUrl, GINKAKU_ACCESS_SOURCE_URL);
  assert.match(line.lead, /elementary and junior high ¥500/);
  assert.match(line.lead, /Autumn viewing Nov 1 – Dec 5/);
});

test("C2 Kyoto gem seed fields no longer carry a removed phrase", () => {
  const seed = read("server/seeds/popular-cities-content.seed.ts");
  for (const file of SEED_FILES) {
    assert.deepEqual(scanKyotoGemRemovedPhrases(read(file)), [], file);
  }
  for (const fix of KYOTO_COPY_FIXES) {
    assert.equal(seed.includes(fix.prior), false, fix.placeName);
  }
  for (const name of [
    "FUSHIMI_DAWN_DESCRIPTION",
    "FUSHIMI_DAWN_WHY",
    "PHILOSOPHER_DESCRIPTION",
    "PRE_DAWN_DESCRIPTION",
    "PRE_DAWN_WHY",
    "YOSHIDA_SANSO_ADDRESS",
  ]) {
    assert.match(seed, new RegExp(name));
  }
  assert.match(seed, /kyotoRemainingGemPhoto\(gem\.placeName\)/);
  assert.match(seed, /whyText === "" \? null : whyText/);
  assert.equal(seed.includes("photo-1569144157591"), false);
  assert.equal(seed.includes("photo-1564419320461"), false);
  assert.equal(seed.includes("photo-1492571350019"), false);
  assert.match(seed, /photo-1478436127897/);
  assert.equal(kyotoRemainingGemPhoto("Fushimi Inari Pre-Dawn Hike"), null);
});

test("C3 migration 421 writes the cleanup and nothing else", () => {
  assert.match(sql, /HELD for Leon's comment/);
  assert.doesNotMatch(sql, /SQL approved/);
  const registry = read("server/migrations/migration-files.ts");
  const entry = registry.slice(registry.lastIndexOf("// 421 —"));
  assert.match(entry, /"421_kyoto_seed_cleanup.sql"/);
  assert.doesNotMatch(entry, /SQL approved/);
  assert.doesNotMatch(sqlBody, /\bALTER\b/i);
  assert.doesNotMatch(sqlBody, /\bDELETE\b/i);
  assert.doesNotMatch(sqlBody, /\bINSERT\b/i);
  assert.doesNotMatch(sqlBody, /CHECK \(/);
  assert.doesNotMatch(sqlBody, /CREATE INDEX/i);
  for (const fix of KYOTO_COPY_FIXES) {
    assert.ok(sql.includes(fix.prior), fix.placeName);
    if (fix.next) assert.ok(sql.includes(fix.next), fix.placeName);
    else assert.match(sql, /SET why_locals_love_it = NULL/);
  }
  assert.ok(sql.includes(GINKAKU_HOURS));
  assert.ok(sql.includes(GINKAKU_ADMISSION_HELD));
  assert.ok(sql.includes(GINKAKU_ACCESS_SOURCE_URL));
  assert.ok(sql.includes(GINKAKU_FACT_CHECKED_ON));
  assert.ok(sql.includes("avoiding crowds"));
  for (const photo of KYOTO_REMAINING_GEM_PHOTOS) {
    assert.match(photo.sourcePageUrl, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/, photo.placeName);
    assert.match(photo.licenseUrl, /^https:\/\/creativecommons\.org\//, photo.placeName);
    assert.ok(photo.imageCredit.includes(photo.sourcePageUrl), photo.placeName);
    assert.ok(photo.imageCredit.includes(photo.licenseUrl), photo.placeName);
    assert.ok(sql.includes(photo.imageUrl), photo.placeName);
    assert.ok(sql.includes(photo.imageCredit), photo.placeName);
    assert.ok(sql.includes(photo.placeName.replace(/'/g, "''")), photo.placeName);
    for (const prior of photo.replacesUrls) assert.ok(sql.includes(prior), photo.placeName);
    assert.equal(kyotoGemPhoto(photo.placeName), null, photo.placeName);
    assert.equal(kyotoRemainingGemPhoto(photo.placeName)?.imageUrl, photo.imageUrl);
  }
  assert.equal(sqlBody.match(/UPDATE travel_pulse_hidden_gems/g)?.length, 1 + KYOTO_COPY_FIXES.length + 1 + KYOTO_REMAINING_GEM_PHOTOS.length);
});
