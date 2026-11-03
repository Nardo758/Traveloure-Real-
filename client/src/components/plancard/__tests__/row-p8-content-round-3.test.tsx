/**
 * Row P-8 — content round 3 (ledger `2026-11-03-p8-content-round-3`; Leon, Nov 2 §7).
 *
 *   T1 Every §4c file: zero siteNeverSayHits() and zero /\bAI\b/ in JSX text + string literals (comments stripped),
 *      except the named leftovers below, pinned so they can only shrink.
 *   T2 AI_DRAFT_REFUSAL_MESSAGE says "Quick draft" and no "AI"; the client fallback agrees.
 *   T3 Migration 431 is registered, carries no DDL, and every statement matches the OLD text only.
 *   T4 The experience-template seed carries no "Most Popular" / "Popular but Spacious".
 *   T5 ROUND3_AI_CEILING and the never-say baseline equal their pinned counts and sit below 159 / 133.
 *   T6 Off-limits: BuildAroundDialog still says "ranked by" (R198); the cart's fee line is still drawn.
 *   T7 The new strings pass the AI check and the never-say list; the three server feed-label fallbacks read
 *      "Picked for your days".
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/row-p8-content-round-3.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { siteNeverSayHits } from "@shared/banned-copy";
import { scanCode } from "../../../../../scripts/check-never-say-copy";
import { AI_DRAFT_REFUSAL_MESSAGE } from "../../../../../server/services/ai-draft-eligibility.pure";
import { MIGRATION_FILES } from "../../../../../server/migrations/migration-files";
import { readSlipHasItemsRefusal } from "../../../lib/ai-draft-refusal";
import { SEASON_GROUP_LABELS } from "@shared/events-calendar";

const read = (p: string) => fs.readFileSync(p, "utf8");
const stripComments = (src: string) =>
  src.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

/** Every file the §4c table names (plus the four hits P-8 added on lines the table did not list — see the PR). */
const SECTION_4C = [
  "client/src/components/intake-panel.tsx",
  "client/src/components/TripQueueIndicator.tsx",
  "client/src/pages/trip-details.tsx",
  "client/src/pages/cart.tsx",
  "client/src/lib/how-it-works-steps.ts",
  "client/src/pages/how-it-works.tsx",
  "client/src/pages/features.tsx",
  "client/src/pages/about.tsx",
  "client/src/pages/travel-experts.tsx",
  "client/src/pages/shared-trip.tsx",
  "client/src/components/dashboard/WhileYouWereAway.tsx",
  "client/src/components/insights-card.tsx",
  "client/src/pages/landing.tsx",
  "client/src/pages/visa-help.tsx",
  "client/src/components/booking-agent/VerifyRequestButton.tsx",
  "client/src/components/travelpulse/AIRecommendationBadges.tsx",
  "client/src/components/travelpulse/DestinationCalendar.tsx",
  "client/src/components/travelpulse/TravelPulseCard.tsx",
  "client/src/pages/hidden-gems.tsx",
  "client/src/components/travelpulse/ExperienceTemplates.tsx",
  "client/src/components/spontaneous-discovery.tsx",
  "client/src/pages/transportation-booking.tsx",
  "client/src/components/logistics/budget-intelligence.tsx",
  "client/src/components/logistics/logistics-intelligence-panel.tsx",
  "client/src/components/travelpulse/CityGrid.tsx",
];

/**
 * Never-say hits left in a §4c file on lines the table did not cover, each with its reason. Pinned exactly: a new hit
 * fails, and a removed one fails until it is struck from here.
 */
const LEFTOVERS: Record<string, string[]> = {
  // Supply side: the expert application's questions on the Become-an-expert page.
  "client/src/pages/travel-experts.tsx": ["best", "best", "best", "popular", "top pick/rated"],
  // Supply side: the booking agent's verification control and its toast (LD 44 vocabulary).
  "client/src/components/booking-agent/VerifyRequestButton.tsx": ["verified", "verified"],
  // A data feature's name ("Crowd Forecast"); renaming it needs its own ruling.
  "client/src/components/travelpulse/TravelPulseCard.tsx": ["crowd"],
};

describe("P-8 — content round 3", () => {
  it("T1 the §4c files carry no AI and no never-say copy outside the named leftovers", () => {
    for (const f of SECTION_4C) {
      const src = read(f);
      const ai = stripComments(src).split("\n").filter((l) => /\bAI\b/.test(l));
      assert.deepEqual(ai, [], `${f}: "AI" outside comments`);
      const hits = scanCode(f, src).map((h) => h.words).sort();
      assert.deepEqual(hits, (LEFTOVERS[f] ?? []).slice().sort(), `${f}: never-say hits`);
    }
  });

  it("T2 the refusal sentence says Quick draft, and the client fallback agrees", () => {
    assert.match(AI_DRAFT_REFUSAL_MESSAGE, /so Quick draft won't rebuild it\./);
    assert.doesNotMatch(AI_DRAFT_REFUSAL_MESSAGE, /\bAI\b/);
    const fallback = readSlipHasItemsRefusal(409, { error: "slip_has_items" })!.message;
    assert.ok(AI_DRAFT_REFUSAL_MESSAGE.startsWith(fallback), `${fallback} ⊂ ${AI_DRAFT_REFUSAL_MESSAGE}`);
  });

  it("T3 migration 431 is registered, DML only, and matches the old text only", () => {
    assert.ok((MIGRATION_FILES as readonly string[]).includes("431_content_round3_labels.sql"));
    const body = read("server/migrations/431_content_round3_labels.sql")
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    assert.doesNotMatch(body, /\b(CREATE|ALTER|DROP)\b/i, "no DDL");
    const statements = body.split(";").map((s) => s.trim()).filter(Boolean);
    assert.equal(statements.length, 3);
    assert.match(statements[0], /UPDATE platform_settings[\s\S]*SET setting_value = 'Picked for your days'[\s\S]*WHERE setting_key = 'feed_rec_label'[\s\S]*AND setting_value = 'Recommended'/);
    assert.match(statements[1], /UPDATE experience_template_filter_options[\s\S]*SET label = 'Spacious'[\s\S]*WHERE label = 'Popular but Spacious'/);
    assert.match(statements[2], /DELETE FROM experience_universal_filter_options[\s\S]*f\.slug = 'sort_by'[\s\S]*o\.label = 'Most Popular'[\s\S]*o\.value = 'popular'/);
  });

  it("T4 the template seed has no ranking chip", () => {
    const seed = read("server/seeds/experience-template-tabs.seed.ts");
    assert.doesNotMatch(seed, /Most Popular|Popular but Spacious/);
    assert.match(seed, /\{ label: "Spacious", value: "popular" \}/);
  });

  it("T5 both ratchets are pinned below their round-2 values", () => {
    const purge = read("client/src/components/plancard/__tests__/row-p2-ai-purge.test.tsx");
    const ceiling = Number(/const ROUND3_AI_CEILING = (\d+);/.exec(purge)?.[1]);
    assert.equal(ceiling, 117);
    assert.ok(ceiling < 159);
    const b = JSON.parse(read("scripts/never-say-baseline.json")) as Record<string, Record<string, number>>;
    const entries = Object.values(b).reduce((n, by) => n + Object.keys(by).length, 0);
    const hits = Object.values(b).reduce((n, by) => n + Object.values(by).reduce((a, c) => a + c, 0), 0);
    assert.equal(entries, 119);
    assert.equal(hits, 321);
    assert.ok(entries < 133);
  });

  it("T6 the off-limits lines are untouched", () => {
    assert.ok(read("client/src/components/plancard/BuildAroundDialog.tsx").includes("ranked by straight-line distance to your stops"));
    assert.ok(read("client/src/pages/cart.tsx").includes('<span className="text-muted-foreground">Service fee</span>'));
  });

  it("T7 the new strings pass the AI check and the never-say list", () => {
    for (const v of [
      "Pick a shape, or describe it and we'll draft it.",
      "In your words — we lay out the days",
      "Days ordered for the shortest distance between stops",
      "We looked at your 3 items and found room to tighten the days.",
      "A Quick draft lays out your days from what you tell us: your preferences, travel style, and budget.",
      "Start your own plan — your dates, your pace, your budget.",
      "Picked for your days",
      "Spacious",
      "Tipping customs vary by place",
      "For your dates",
      "Draft a new trip",
      "We match your travel preferences for Kyoto with local experts who know what you're after.",
      "In season",
    ]) {
      assert.doesNotMatch(v, /\bAI\b/);
      assert.deepEqual(siteNeverSayHits(v), [], v);
    }
    // The three rows Leon added on Nov 3: the events group label, the city card's door, the expert-match lead.
    assert.equal(SEASON_GROUP_LABELS.best, "In season");
    assert.ok(read("client/src/components/travelpulse/CityGrid.tsx").includes("Draft a new trip"));
    assert.ok(read("client/src/components/ai-matched-experts-section.tsx").includes("We match your {experienceType || \"travel\"} preferences for {destination} with local experts"));
    // The three server fallbacks for the feed label read the P-6 default, never "Recommended".
    for (const f of ["server/routes/content.routes.ts", "server/services/upsell-query.service.ts", "server/routes/upsell.routes.ts"]) {
      const src = read(f);
      assert.ok(/(recommendedLabel|recLabel): "Picked for your days",/.test(src), `${f} falls back to "Picked for your days"`);
      assert.ok(!/(recommendedLabel|recLabel): "Recommended",/.test(src), `${f} has no "Recommended" fallback`);
    }
  });
});
