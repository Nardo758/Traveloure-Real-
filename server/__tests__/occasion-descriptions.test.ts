/**
 * E3 ruling 2 — the six occasion "blurbs" (ledger `2026-10-09-e3-experiences-inline`).
 *
 *   O1  the seeder's sentences and migration 360's are the same text, slug for slug
 *   O2  each is one real sentence: no "slip", no "experience", no generated placeholder
 *   O3  360 is data only and guarded: it touches a row only while it still holds the placeholder
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

function seedMap(): Record<string, string> {
  const block = SEED.slice(SEED.indexOf("SEEDED_OCCASION_DESCRIPTIONS"), SEED.indexOf("};", SEED.indexOf("SEEDED_OCCASION_DESCRIPTIONS")));
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/^\s*"?([a-z-]+)"?:\s*"([^"]+)",$/gm)) out[m[1]] = m[2];
  return out;
}

describe("occasion descriptions", () => {
  const seeded = seedMap();

  it("O1 the seeder and migration 360 carry the same six sentences", () => {
    assert.deepEqual(Object.keys(seeded).sort(), ["corporate", "family-occasion", "golf-trip", "honeymoon", "milestone-birthday", "romance"]);
    const sql: Record<string, string> = {};
    for (const m of SQL.matchAll(/\('([a-z-]+)', '((?:[^']|'')+)'\)/g)) sql[m[1]] = m[2].replace(/''/g, "'");
    assert.deepEqual(sql, seeded);
  });

  it("O2 one real sentence each", () => {
    for (const [slug, text] of Object.entries(seeded)) {
      assert.doesNotMatch(text, /\bslip\b|experience/i, slug);
      assert.match(text, /^[A-Z].*\.$/, slug);
      assert.equal(text.split(/\.\s/).length, 1, `${slug}: one sentence`);
    }
  });

  it("O3 360 is data only and keeps an admin's own text", () => {
    const body = SQL.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    assert.doesNotMatch(body, /\b(ALTER|CREATE|DROP|INSERT|DELETE)\b/i);
    assert.match(body, /AND et\.description = et\.name \|\| ' planning experience'/);
    assert.ok(read("server/migrations/migration-files.ts").includes('"360_occasion_descriptions.sql"'));
  });

  it("O4 the seeder generates no description", () => {
    assert.doesNotMatch(SEED, /planning experience`/);
    assert.match(SEED, /description: SEEDED_OCCASION_DESCRIPTIONS\[slug\] \?\? null,/);
  });
});
