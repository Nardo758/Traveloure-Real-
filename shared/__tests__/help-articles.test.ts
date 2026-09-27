/**
 * Help center articles (shared/help-articles.ts) — Lane B, Sep 27, 2026.
 *
 * H1 the ten slugs, in the ratified order. H2 article 7's tiers ARE the refund schedule. H3 articles
 * 5 and 8 type no price, percent or window. H4 article 5 rendered from a sample `/api/pricing`
 * answer shows exactly those numbers, Plus reads "coming soon" while it is not on sale, and with no
 * pricing answer every number is omitted and Pricing is pointed at instead. H5 article 8's hold
 * windows are the shared constants the server's sweeps import. H6 search. H7 held articles (a feature
 * not yet on `main`) are unlisted, unsearchable, unroutable and out of the sitemap. H8 article 1's
 * occasion count is the seed's own count, never typed.
 *
 * Run: npx tsx --test shared/__tests__/help-articles.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  HELP_ARTICLES,
  HELP_ARTICLE_SLUGS,
  PUBLISHED_HELP_ARTICLES,
  PUBLISHED_HELP_ARTICLE_SLUGS,
  SEEDED_OCCASION_COUNT,
  getHelpArticle,
  getPublishedHelpArticle,
  isHelpArticlePublished,
  resolveHelpArticle,
  searchHelpArticles,
  type HelpPricing,
} from "../help-articles";
import { HELP_ARTICLE_PUBLISHED_FROM, SHIPPED_TRACK_A_STEPS } from "../help-article-slugs";
import { CANCELLATION_POLICY_TYPES, CANCELLATION_SCHEDULE, cancellationTierSchedule } from "../cancellation-schedule";
import { CHECKOUT_CLAIM_TTL_MINUTES, STALE_AUTHORIZED_CLAIM_HOURS } from "../checkout-hold";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

const SAMPLE: HelpPricing = {
  serviceFeePct: 7,
  serviceFeeCapCents: 2500,
  aiTaskCents: 150,
  tripPass: { priceCents: 1900 },
  plusAnnual: { priceCents: 2500 },
  proMonthly: { betaFreeUntil: "2026-12-31" },
  plusSalesEnabled: false,
};

function text(slug: string, pricing: HelpPricing | null) {
  const r = resolveHelpArticle(getHelpArticle(slug)!, pricing);
  const all = r.blocks
    .map((b) => (b.kind === "list" ? b.items.map((i) => `${i.lead ?? ""} ${i.text}`).join(" ") : `${"lead" in b && b.lead ? b.lead : ""} ${b.text}`))
    .join(" ");
  return { ...r, all };
}

function rawText(slug: string): string {
  const a = getHelpArticle(slug)!;
  return a.blocks
    .map((b) => (b.kind === "list" ? b.items.map((i) => i.text).join(" ") : b.text))
    .join(" ");
}

test("H1 ten articles, one per slug, in the ratified order (two held)", () => {
  assert.equal(HELP_ARTICLE_SLUGS.length, 10);
  assert.deepEqual(HELP_ARTICLES.map((a) => a.slug), [...HELP_ARTICLE_SLUGS]);
  assert.equal(new Set(HELP_ARTICLE_SLUGS).size, 10);
  assert.deepEqual(PUBLISHED_HELP_ARTICLES.map((a) => a.slug), [...PUBLISHED_HELP_ARTICLE_SLUGS]);
});

test("H2 article 7 lists every tier exactly as the refund schedule states it", () => {
  const list = getHelpArticle("cancellations-and-refunds")!.blocks.find((b) => b.kind === "list");
  assert.ok(list && list.kind === "list");
  assert.deepEqual(
    list.items,
    CANCELLATION_POLICY_TYPES.map((p) => ({ lead: CANCELLATION_SCHEDULE[p].name, text: cancellationTierSchedule(p) })),
  );
  assert.match(rawText("cancellations-and-refunds"), /including Traveloure's service fee, refunded at the same rate/);
});

test("H3 articles 5 and 8 type no price, percent or time window", () => {
  const forbidden = /\$\d|\d+(\.\d+)?\s*%|\b\d+\s*(minutes?|hours?|days?)\b/i;
  for (const slug of ["trip-pass-and-fees", "payment-didnt-go-through"]) {
    assert.doesNotMatch(rawText(slug), forbidden, `${slug} must render its numbers from placeholders`);
  }
});

test("H4 article 5 renders the pricing answer's numbers, and none without one", () => {
  const off = text("trip-pass-and-fees", SAMPLE);
  assert.equal(off.pricingOmitted, false);
  assert.match(off.all, /Price: \$19 per trip\./);
  assert.match(off.all, /a service fee of 7% is added to the booking, capped at \$25 per booking/);
  assert.match(off.all, /each further AI task on a plan is \$1\.50/);
  assert.match(off.all, /free through 31 December 2026/);
  assert.match(off.all, /Coming soon\./);
  assert.doesNotMatch(off.all, /per year/, "no Plus price while Plus is not on sale");

  const on = text("trip-pass-and-fees", { ...SAMPLE, plusSalesEnabled: true });
  assert.match(on.all, /Price: \$25 per year\./);
  assert.doesNotMatch(on.all, /Coming soon/);

  const none = text("trip-pass-and-fees", null);
  assert.equal(none.pricingOmitted, true);
  assert.doesNotMatch(none.all, /\$|\d+%|\{/, "no number and no raw placeholder without a pricing answer");
  assert.doesNotMatch(none.all, /Coming soon|per year/, "neither Plus variant without a pricing answer");
});

test("H5 article 8's windows are the shared constants the server's sweeps import", () => {
  const a8 = text("payment-didnt-go-through", null);
  assert.equal(a8.pricingOmitted, false);
  assert.ok(a8.all.includes(`after ${CHECKOUT_CLAIM_TTL_MINUTES} minutes`));
  assert.ok(STALE_AUTHORIZED_CLAIM_HOURS === 24 ? a8.all.includes("within a day") : a8.all.includes(`within ${STALE_AUTHORIZED_CLAIM_HOURS} hours`));
  const server = read("server/services/checkout-claim.service.ts");
  assert.match(server, /from "@shared\/checkout-hold"/);
  assert.doesNotMatch(server, /export const (CHECKOUT_CLAIM_TTL_MINUTES|STALE_AUTHORIZED_CLAIM_HOURS)\s*=/);
});

test("H6 search finds by word and by keyword, and reports an empty result honestly", () => {
  assert.ok(searchHelpArticles("refund").some((a) => a.slug === "cancellations-and-refunds"));
  assert.ok(searchHelpArticles("declined card").some((a) => a.slug === "payment-didnt-go-through"));
  assert.deepEqual(searchHelpArticles("zzqxw"), []);
  assert.equal(searchHelpArticles("   ").length, PUBLISHED_HELP_ARTICLES.length);
});

test("H7 held articles are kept but unlisted, unsearchable, unroutable and out of the sitemap", () => {
  // Decision-maker, Sep 27, 2026: no article describes a feature before it is on `main`.
  assert.deepEqual(HELP_ARTICLE_PUBLISHED_FROM, {
    "comparing-options": "compare-options",
    "free-vs-paid": "three-versions-delta",
  });
  for (const [slug, step] of Object.entries(HELP_ARTICLE_PUBLISHED_FROM)) {
    assert.ok(getHelpArticle(slug), `${slug} stays in the module`);
    const held = !SHIPPED_TRACK_A_STEPS.has(step!);
    if (!held) continue;
    assert.equal(isHelpArticlePublished(slug as never), false);
    assert.equal(getPublishedHelpArticle(slug), undefined, `${slug} must answer not found`);
    assert.ok(!PUBLISHED_HELP_ARTICLE_SLUGS.includes(slug as never), `${slug} must not be listed`);
    assert.ok(!searchHelpArticles("").some((a) => a.slug === slug), `${slug} must not be searchable`);
  }
  // Releasing a step publishes its article — the gate is the step, not a deletion.
  assert.equal(isHelpArticlePublished("comparing-options", new Set(["compare-options"])), true);
  const seo = read("server/routes/seo.routes.ts");
  assert.match(seo, /PUBLISHED_HELP_ARTICLE_SLUGS\.map\(helpArticlePath\)/, "the sitemap lists published articles only");
  assert.doesNotMatch(seo, /\bHELP_ARTICLE_SLUGS\b/, "the sitemap must not read the full slug list");
});

test("H8 article 1's occasion count is the experience_types seed's count, never typed", () => {
  // Parse the seed exactly as docs/planning/tools/trip-slip-spec.mjs does for §J. The same drift is
  // also caught by guard-batch's `trip-slip-spec.mjs --check` step; either failure is fixed by
  // regenerating the spec in the same PR as the seed change.
  const seed = read("server/seeds/experience-template-tabs.seed.ts");
  const re = /\{ slug: "([^"]+)", name: "([^"]+)"[\s\S]*?switches: \{ stops: "(\w+)"/g;
  const seeded = [...seed.matchAll(re)].map((m) => m[1]);
  assert.ok(seeded.length > 0, "the seed parser found no occasions");
  assert.equal(SEEDED_OCCASION_COUNT, seeded.length, "regenerate the spec: node docs/planning/tools/trip-slip-spec.mjs");
  const a1 = text("how-planning-works", null);
  assert.ok(a1.all.includes(`one of ${seeded.length})`), "article 1 renders the seeded count");
  assert.doesNotMatch(rawText("how-planning-works"), /one of \d/, "the count is a placeholder, never typed");
});
