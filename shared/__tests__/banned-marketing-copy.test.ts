/**
 * Marketing banned-copy sweep (ledger `2026-10-21-marketing-banned-copy`).
 *
 * Visible strings in the files this lane edited must not carry hidden gem(s) (including the
 * hyphenated tag), secret, insider, trending, geisha, a `trend N` / `trend ${n}` score, illuminations,
 * or back alley. The scan is the never-say literal walker, so comments, identifiers, testids and a
 * bare lower-case status token (`discoveryStatus: "trending"`) are not copy.
 *
 * Run: npx tsx --test shared/__tests__/banned-marketing-copy.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { scanCode, scanJson } from "../../scripts/check-never-say-copy.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");

const MARKETING = new Set([
  "hidden gem(s)",
  "secret",
  "insider",
  "trending",
  "geisha",
  "geisha spotting",
  "geisha sightings",
  "TREND <n>",
]);

const CODE_FILES = [
  "client/src/components/neighborhood-card.tsx",
  "client/src/components/landing/landing-hero.tsx",
  "client/src/components/travelpulse/CityCard.tsx",
  "client/src/components/travelpulse/CityGrid.tsx",
  "client/src/pages/discover.tsx",
  "client/src/pages/blog.tsx",
  "client/src/pages/expert/content-studio.tsx",
  "client/src/pages/expert/workspace.tsx",
  "client/src/pages/expert/analytics.tsx",
  "client/src/components/expert/service-recommendations.tsx",
  "client/src/pages/provider/dashboard.tsx",
  "client/src/pages/admin/content-mapping.tsx",
  "client/src/pages/admin/gem-photo-backfill.tsx",
  "client/src/pages/architecture-diagram.tsx",
  "shared/expert-vocabulary.ts",
  "shared/content-surface-map.ts",
  "server/services/gem-discovery.service.ts",
  "server/services/recommendation.service.ts",
  "server/seeds/phase-4b-kyoto-city-intelligence.seed.ts",
  "server/seed-destination-calendar.ts",
  "server/services/travelpulse.service.ts",
  "server/seeds/beta-reviews-bookings.ts",
];

const TEXT_FILES = [
  "docs/design/BENTO_ASSEMBLY.md",
  "server/data/happening-now.json",
];

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Hyphenated tags are a single lower-case token, which the never-say walker skips. They are still labels. */
const HYPHEN_TAG = /\bhidden-gems\b|\bsecret-paris\b/i;
const ILLUMINATION = /\billuminations?\b/i;
const TREND_SCORE = /`trend \$\{|\btrend\s+\d+\b/i;
const BACK_ALLEY = /\bback\s+alleys?\b/i;

test("edited code files carry none of the marketing phrases as copy", () => {
  const hits: string[] = [];
  for (const file of CODE_FILES) {
    const source = read(file);
    const scanned = file.endsWith(".json") ? scanJson(file, source) : scanCode(file, source);
    for (const hit of scanned) {
      if (MARKETING.has(hit.words)) hits.push(`${file}:${hit.line} ${hit.words} — ${hit.text}`);
    }
    if (HYPHEN_TAG.test(source)) hits.push(`${file} hyphenated hidden-gems or secret-paris tag`);
    if (ILLUMINATION.test(source)) hits.push(`${file} illumination(s)`);
    if (TREND_SCORE.test(source)) hits.push(`${file} trend score`);
    if (BACK_ALLEY.test(source)) hits.push(`${file} back alley`);
  }
  assert.deepEqual(hits, []);
});

test("the bento spec, checklist and happening-now copy drop the same phrases", () => {
  const hits: string[] = [];
  for (const file of TEXT_FILES) {
    const source = read(file);
    const scanned = file.endsWith(".json") ? scanJson(file, source) : [];
    for (const hit of scanned) {
      if (MARKETING.has(hit.words)) hits.push(`${file} ${hit.words} — ${hit.text}`);
    }
    if (/\bhidden[\s-]+gems?\b/i.test(source)) hits.push(`${file} hidden gem`);
    if (/\btrending\b/i.test(source)) hits.push(`${file} trending`);
    if (HYPHEN_TAG.test(source)) hits.push(`${file} hyphenated tag`);
    if (ILLUMINATION.test(source)) hits.push(`${file} illumination(s)`);
    if (TREND_SCORE.test(source)) hits.push(`${file} trend score`);
    if (BACK_ALLEY.test(source)) hits.push(`${file} back alley`);
    if (/\binsiders?\b/i.test(source)) hits.push(`${file} insider`);
    if (/\bsecrets?\b/i.test(source)) hits.push(`${file} secret`);
    if (/\bgeishas?\b/i.test(source)) hits.push(`${file} geisha`);
  }
  assert.deepEqual(hits, []);
});

test("the named swaps are the words Marketing asked for", () => {
  assert.match(read("client/src/components/neighborhood-card.tsx"), /Quieter spots/);
  assert.match(read("shared/expert-vocabulary.ts"), /label: "Quieter spots"/);
  assert.match(read("docs/design/BENTO_ASSEMBLY.md"), /`QUIETER SPOT` \(green\)/);
  assert.doesNotMatch(read("docs/design/BENTO_ASSEMBLY.md"), /`Trending`/);
  assert.match(read("server/seeds/phase-4b-kyoto-city-intelligence.seed.ts"), /Winter at Kodai-ji and Shorenin/);
  const blog = read("client/src/pages/blog.tsx");
  const intro = "Trip ideas, local know-how and planning guides from the people who know each city.";
  assert.equal(blog.includes(intro), true);
  assert.doesNotMatch(read("client/src/components/landing/landing-hero.tsx"), /`trend \$\{/);
  const checklist = read("EXPERT_SETUP_CHECKLIST.md");
  assert.match(checklist, /Quieter spots in Tokyo/);
  assert.doesNotMatch(checklist, /Hidden Gems of Tokyo|Discover secret spots/);
});

test("a bare discoveryStatus token is not copy and stays the stored stage", () => {
  assert.equal(scanCode("x.ts", 'const row = { discoveryStatus: "trending" };').length, 0);
  const seed = read("server/seeds/popular-cities-content.seed.ts");
  const tokens = seed.match(/discoveryStatus: "trending"/g) ?? [];
  assert.equal(tokens.length, 4);
});
