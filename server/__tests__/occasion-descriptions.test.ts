/**
 * E3 ruling 2 — the six occasion "blurbs" (ledger `2026-10-09-e3-experiences-inline`).
 *
 *   O1  the seeder's sentences and migrations 360 + 364 are the same text, slug for slug; 364 writes
 *       production's `anniversary`, read here as the seeder's `anniversary-trip` (ledger
 *       `2026-10-10-m364-occasion-descriptions`), and every seeder slug is covered by a migration
 *   O2  each is one real sentence: no "slip", no "experience", no generated placeholder
 *   O3  360 and 364 are data only and guarded: each touches a row only while it still holds the placeholder
 *   O4  the seeder never generates a description for a slug it does not list
 *
 * Run: npx tsx --test server/__tests__/occasion-descriptions.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const SEED = read("server/seeds/experience-template-tabs.seed.ts");
const SQL = read("server/migrations/360_occasion_descriptions.sql");
const SQL_364 = read("server/migrations/364_occasion_descriptions_prod.sql");
/** Production's slug for an occasion the seeder names differently (364). */
const PROD_SLUG_ALIASES: Readonly<Record<string, string>> = { anniversary: "anniversary-trip" };

function sqlMap(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of text.matchAll(/\('([a-z-]+)', '((?:[^']|'')+)'\)/g)) out[m[1]] = m[2].replace(/''/g, "'");
  return out;
}

function seedMap(): Record<string, string> {
  const block = SEED.slice(SEED.indexOf("SEEDED_OCCASION_DESCRIPTIONS"), SEED.indexOf("};", SEED.indexOf("SEEDED_OCCASION_DESCRIPTIONS")));
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/^\s*"?([a-z-]+)"?:\s*"([^"]+)",$/gm)) out[m[1]] = m[2];
  return out;
}

describe("occasion descriptions", () => {
  const seeded = seedMap();

  it("O1 the seeder and migrations 360 + 364 carry the same sentences", () => {
    assert.deepEqual(Object.keys(seeded).sort(), [
      "anniversary-trip", "bachelor-bachelorette", "corporate", "family-occasion", "golf-trip", "honeymoon",
      "milestone-birthday", "romance", "sports-event",
    ]);
    const sql360 = sqlMap(SQL);
    assert.deepEqual(Object.keys(sql360).sort(), ["corporate", "family-occasion", "golf-trip", "honeymoon", "milestone-birthday", "romance"]);
    const sql364 = sqlMap(SQL_364);
    // Production's own spellings only: the seeder's `anniversary-trip` is not a production row.
    assert.deepEqual(Object.keys(sql364).sort(), ["anniversary", "bachelor-bachelorette", "sports-event"]);
    const union = { ...sql360, ...sql364 };
    for (const [slug, text] of Object.entries(union)) assert.equal(text, seeded[PROD_SLUG_ALIASES[slug] ?? slug], slug);
    const covered = new Set(Object.keys(union).map((slug) => PROD_SLUG_ALIASES[slug] ?? slug));
    for (const slug of Object.keys(seeded)) assert.ok(covered.has(slug), `${slug} is repaired by a migration`);
  });

  it("O2 one real sentence each", () => {
    for (const [slug, text] of Object.entries(seeded)) {
      assert.doesNotMatch(text, /\bslip\b|experience/i, slug);
      assert.match(text, /^[A-Z].*\.$/, slug);
      assert.equal(text.split(/\.\s/).length, 1, `${slug}: one sentence`);
    }
  });

  it("O3 360 and 364 are data only and keep an admin's own text", () => {
    for (const [file, text] of [["360_occasion_descriptions.sql", SQL], ["364_occasion_descriptions_prod.sql", SQL_364]] as const) {
      const body = text.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
      assert.doesNotMatch(body, /\b(ALTER|CREATE|DROP|INSERT|DELETE)\b/i, file);
      assert.match(body, /AND et\.description = et\.name \|\| ' planning experience'/, file);
      assert.ok(read("server/migrations/migration-files.ts").includes(`"${file}"`), file);
    }
  });

  it("O4 the seeder generates no description", () => {
    assert.doesNotMatch(SEED, /planning experience`/);
    assert.match(SEED, /description: SEEDED_OCCASION_DESCRIPTIONS\[slug\] \?\? null,/);
  });
});
