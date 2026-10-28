/**
 * Row 257 (Architect, Oct 27, 2026; ledger `2026-10-27-row257-remove-ai-wording`): no "AI" on the
 * /pricing card, band lead, page description or Trip Pass line, nor in the /terms and /privacy tab
 * titles; the duplicate "Join the Kyoto list." under the /kyoto hero button is gone. Reads source
 * with readFileSync and imports pure constants; runs no git and compares to no ref.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PRICING_AND_LEGAL_TITLE_COPY as COPY } from "../pricing-and-legal-title-copy";
import { HOMEPAGE_META_DESCRIPTION } from "../g02-g06-copy";
import { tripPassPricingLine } from "../trip-pass-runs-copy";
import { WAITLIST_CONSENT_LINE } from "@shared/launch-waitlist";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const PRICING = read("client/src/pages/pricing.tsx");
const TERMS = read("client/src/pages/terms.tsx");
const PRIVACY = read("client/src/pages/privacy.tsx");
const KYOTO = read("client/src/pages/launch-waitlist.tsx");

function leaves(o: unknown, path = ""): Array<[string, string]> {
  if (typeof o === "string") return [[path, o]];
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
}

test("RW1: every key is present and no value says AI", () => {
  const keys = leaves(COPY).map(([k]) => k);
  for (const k of [
    "pricingOptimizeCard.eyebrow", "pricingOptimizeCard.name",
    "pricingPage.title", "pricingPage.bandLead", "pricingPage.bandLeadTail",
    "pricingPage.descriptionBeforeRuns", "pricingPage.descriptionAfterRuns",
    "tripPass.pricingLineTail",
    "termsPage.title", "termsPage.description", "privacyPage.title", "privacyPage.description",
  ]) assert.ok(keys.includes(k), `missing ${k}`);
  for (const [k, v] of leaves(COPY)) {
    assert.doesNotMatch(v, /\bAI\b/, k);
    assert.doesNotMatch(v, /AI-Powered/i, k);
  }
  assert.doesNotMatch(tripPassPricingLine(5), /\bAI\b/);
  assert.doesNotMatch(COPY.pricingPage.title, /Traveloure/, "SEOHead appends the site name");
});

test("RW2: the card takes Optimize's existing name (OptimizerLead.tsx optimizeCtaLabel, no fee)", () => {
  assert.equal(COPY.pricingOptimizeCard.name, "Optimize");
  assert.match(read("client/src/components/plan/OptimizerLead.tsx"), /if \(!fee \|\| fee\.aiDisabled\) return "Optimize";/);
});

test("RW3: pricing.tsx reads the constants and keeps its ids, button and branch", () => {
  assert.match(PRICING, /eyebrow: PRICING_AND_LEGAL_TITLE_COPY\.pricingOptimizeCard\.eyebrow/);
  assert.match(PRICING, /name: PRICING_AND_LEGAL_TITLE_COPY\.pricingOptimizeCard\.name/);
  assert.match(PRICING, /title=\{PRICING_AND_LEGAL_TITLE_COPY\.pricingPage\.title\}/);
  assert.match(PRICING, /PRICING_AND_LEGAL_TITLE_COPY\.pricingPage\.bandLead\}/);
  assert.match(PRICING, /PRICING_AND_LEGAL_TITLE_COPY\.pricingPage\.descriptionBeforeRuns/);
  for (const gone of ["Plan with AI", "WITH AI · PAY PER USE", "Every AI action", "with AI, with a local", "pay per use with AI", "unlimited AI tasks", 'title="Pricing | Traveloure"']) {
    assert.ok(!PRICING.includes(gone), `still contains ${gone}`);
  }
  assert.match(PRICING, /testid: "ai"/);
  assert.match(PRICING, /branch: "ai"/);
  assert.match(PRICING, /cta: "Optimize a plan"/);
});

test("RW4: /terms and /privacy set title, description and url, and keep their H1", () => {
  for (const [src, key, url, h1] of [
    [TERMS, "termsPage", "/terms", "Terms and Conditions"],
    [PRIVACY, "privacyPage", "/privacy", "Privacy Policy"],
  ] as const) {
    assert.match(src, /import \{ SEOHead \} from "@\/components\/seo-head";/);
    const head = src.match(/<SEOHead[\s\S]*?\/>/)?.[0] ?? "";
    assert.ok(head.includes(`title={PRICING_AND_LEGAL_TITLE_COPY.${key}.title}`), `${url} title`);
    assert.ok(head.includes(`description={PRICING_AND_LEGAL_TITLE_COPY.${key}.description}`), `${url} description`);
    assert.ok(head.includes(`url="${url}"`), `${url} url`);
    assert.ok(src.includes(`title="${h1}"`), `${url} H1`);
  }
  assert.equal(COPY.termsPage.title, "Terms and Conditions");
  assert.equal(COPY.privacyPage.title, "Privacy Policy");
  assert.equal(COPY.termsPage.description, HOMEPAGE_META_DESCRIPTION);
  assert.equal(COPY.privacyPage.description, HOMEPAGE_META_DESCRIPTION);
});

test("RW5: /kyoto shows the hero button once, no duplicate line under it", () => {
  assert.doesNotMatch(KYOTO, /<p[^>]*>\s*Join the Kyoto list\.\s*<\/p>/);
  assert.ok(KYOTO.includes('data-testid="button-waitlist-hero"'));
  assert.ok(KYOTO.includes("section-waitlist-join"));
  assert.match(KYOTO, /<h2 className="text-2xl font-semibold">Join the Kyoto list\.<\/h2>/);
  assert.equal(WAITLIST_CONSENT_LINE, "Join the Kyoto list");
});

test("RW6: no K3–K6 placeholder ships", () => {
  for (const v of [COPY.termsPage.title, COPY.privacyPage.title, COPY.termsPage.description, COPY.privacyPage.description]) {
    assert.notEqual(v, "<<MARKETING PROPOSAL PENDING>>");
    assert.doesNotMatch(v, /PENDING/);
  }
});
