/**
 * Row 257 (Architect, Oct 27, 2026, 8:10 / 9:10 / 9:40 / 10:10 PM ET; ledger
 * `2026-10-27-row257-remove-ai-wording`): no "AI" on the /pricing card, band lead, page description
 * or Trip Pass lines (pricing checklist and card), nor in the /terms and /privacy tab titles; one
 * "| Traveloure" in every literal SEOHead title; the duplicate "Join the Kyoto list." under the /kyoto
 * hero button is gone. Reads source with readFileSync and imports pure constants; runs no git and
 * compares to no ref.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PRICING_AND_LEGAL_TITLE_COPY as COPY } from "../pricing-and-legal-title-copy";
import { HOMEPAGE_META_DESCRIPTION } from "../g02-g06-copy";
import { tripPassPricingLine, tripPassRunsPhrase } from "../trip-pass-runs-copy";
import { WAITLIST_CONSENT_LINE } from "@shared/launch-waitlist";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const PRICING = read("client/src/pages/pricing.tsx");
const TERMS = read("client/src/pages/terms.tsx");
const PRIVACY = read("client/src/pages/privacy.tsx");
const KYOTO = read("client/src/pages/launch-waitlist.tsx");
const CARD = stripComments(read("client/src/components/plancard/TripPassCard.tsx"));
const NO_AI = /\bAI\b/;

/** Every traveler-facing string in the object; K8 is called with "5 optimizer runs". */
function strings(): Array<[string, string]> {
  return [
    ["K1 pricingOptimizeCard.name", COPY.pricingOptimizeCard.name],
    ["K2 pricingOptimizeCard.eyebrow", COPY.pricingOptimizeCard.eyebrow],
    ["K3 termsPage.title", COPY.termsPage.title],
    ["K4 privacyPage.title", COPY.privacyPage.title],
    ["K5 termsPage.description", COPY.termsPage.description],
    ["K6 privacyPage.description", COPY.privacyPage.description],
    ["K7 pricingPage.bandLead", COPY.pricingPage.bandLead],
    ["K8 pricingPage.seoDescription", COPY.pricingPage.seoDescription("5 optimizer runs")],
    ["K9 tripPassPricingLineTail", COPY.tripPassPricingLineTail],
    ["K10 tripPassCardTail", COPY.tripPassCardTail],
    ["K11 tripPassActivatedToast", COPY.tripPassActivatedToast],
    ["K12 tripPassActiveLine", COPY.tripPassActiveLine],
  ];
}

test("RW1: every key K1–K12 is present and no value says AI", () => {
  assert.deepEqual(Object.keys(COPY).sort(), [
    "pricingOptimizeCard", "pricingPage", "privacyPage", "termsPage",
    "tripPassActiveLine", "tripPassActivatedToast", "tripPassCardTail", "tripPassPricingLineTail",
  ].sort());
  assert.equal(typeof COPY.pricingPage.seoDescription, "function");
  for (const [k, v] of strings()) {
    assert.equal(typeof v, "string", k);
    assert.ok(v.length > 0, k);
    assert.doesNotMatch(v, NO_AI, k);
    assert.doesNotMatch(v, /AI-Powered/i, k);
  }
});

test("RW2: the card takes Optimize's existing name (OptimizerLead.tsx:97, no fee)", () => {
  assert.equal(COPY.pricingOptimizeCard.name, "Optimize");
  assert.match(read("client/src/components/plan/OptimizerLead.tsx"), /if \(!fee \|\| fee\.aiDisabled\) return "Optimize";/);
});

test("RW3: pricing.tsx reads the constants and keeps its ids, button, branch and Trip Pass call", () => {
  assert.match(PRICING, /eyebrow: PRICING_AND_LEGAL_TITLE_COPY\.pricingOptimizeCard\.eyebrow/);
  assert.match(PRICING, /name: PRICING_AND_LEGAL_TITLE_COPY\.pricingOptimizeCard\.name/);
  assert.match(PRICING, /\{PRICING_AND_LEGAL_TITLE_COPY\.pricingPage\.bandLead\}/);
  assert.match(PRICING, /description=\{PRICING_AND_LEGAL_TITLE_COPY\.pricingPage\.seoDescription\(tripPassRunsPhrase\(pricing\.tripPass\.runsPerTrip\)\)\}/);
  for (const gone of ["Plan with AI", "WITH AI · PAY PER USE", "Every AI action", "unlimited AI tasks"]) {
    assert.ok(!PRICING.includes(gone), `still contains ${gone}`);
  }
  assert.match(PRICING, /testid: "ai"/);
  assert.match(PRICING, /branch: "ai"/);
  assert.match(PRICING, /cta: "Optimize a plan"/);
  assert.match(PRICING, /tripPassPricingLine\(pricing\.tripPass\.runsPerTrip\)/);
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
});

test("RW5: /kyoto shows the hero button once, no duplicate line under it", () => {
  assert.doesNotMatch(KYOTO, /<p[^>]*>\s*Join the Kyoto list\.\s*<\/p>/);
  assert.ok(KYOTO.includes('data-testid="button-waitlist-hero"'));
  assert.ok(KYOTO.includes("section-waitlist-join"));
  assert.match(KYOTO, /<h2 className="text-2xl font-semibold">Join the Kyoto list\.<\/h2>/);
  assert.equal(WAITLIST_CONSENT_LINE, "Join the Kyoto list");
});

test("RW6: K3–K6 say no AI and are not placeholders", () => {
  for (const v of [COPY.termsPage.title, COPY.privacyPage.title, COPY.termsPage.description, COPY.privacyPage.description]) {
    assert.doesNotMatch(v, NO_AI);
    assert.ok(v.trim().length > 0);
    assert.ok(!v.includes("<<"));
    assert.doesNotMatch(v, /PENDING/);
  }
});

test("RW7: K3/K4 are each page's own H1; K5/K6 are HOMEPAGE_META_DESCRIPTION", () => {
  const h1 = (src: string) => src.match(/<PageLayout[\s\S]*?\btitle="([^"]+)"/)?.[1];
  assert.equal(COPY.termsPage.title, h1(TERMS));
  assert.equal(COPY.privacyPage.title, h1(PRIVACY));
  assert.equal(COPY.termsPage.description, HOMEPAGE_META_DESCRIPTION);
  assert.equal(COPY.privacyPage.description, HOMEPAGE_META_DESCRIPTION);
});

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" || name === "__tests__" ? [] : tsxFiles(p);
    return p.endsWith(".tsx") ? [p] : [];
  });
}

test("RW8: exactly one \"| Traveloure\" suffix", () => {
  const head = read("client/src/components/seo-head.tsx");
  assert.equal((head.match(/\| \$\{SITE_NAME\}/g) ?? []).length, 1, "SEOHead appends the suffix once");
  assert.ok(head.includes("const fullTitle = title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE;"));
  let checked = 0;
  for (const file of tsxFiles(resolve(ROOT, "client/src"))) {
    const src = readFileSync(file, "utf8");
    if (!src.includes("<SEOHead")) continue;
    for (const el of src.match(/<SEOHead\b[\s\S]*?\/>/g) ?? []) {
      for (const m of el.matchAll(/\btitle=(?:"([^"]*)"|\{"([^"]*)"\})/g)) {
        const t = m[1] ?? m[2] ?? "";
        checked++;
        assert.doesNotMatch(t, /\| Traveloure|Traveloure\s*$/i, `${relative(ROOT, file)}: ${t}`);
      }
    }
  }
  assert.ok(checked >= 3, `checked ${checked} literal SEOHead titles`);
  for (const t of [COPY.termsPage.title, COPY.privacyPage.title, "Pricing", "Service Providers", "Visa Help - Requirements & Expert Assistance"]) {
    assert.equal((`${t} | Traveloure`.match(/Traveloure/g) ?? []).length, 1, t);
  }
  assert.match(PRICING, /title="Pricing"\n/);
  assert.ok(read("client/src/pages/providers-directory.tsx").includes('title="Service Providers"'));
  assert.ok(read("client/src/pages/visa-help.tsx").includes('title="Visa Help - Requirements & Expert Assistance"'));
});

test("RW9: the Trip Pass pricing line is K9", () => {
  assert.equal(tripPassPricingLine(5), "5 optimizer runs + unlimited tasks on that trip");
  assert.equal(tripPassPricingLine(null), "Optimizer runs + unlimited tasks on that trip");
  assert.doesNotMatch(tripPassPricingLine(5), NO_AI);
  assert.doesNotMatch(tripPassPricingLine(null), NO_AI);
  assert.doesNotMatch(stripComments(read("client/src/lib/trip-pass-runs-copy.ts")), NO_AI);
});

test("RW10: the Trip Pass offer card line is K10, with no AI and no \"unlimited\"", () => {
  assert.equal(COPY.tripPassCardTail, "tasks · service fee waived");
  assert.doesNotMatch(COPY.tripPassCardTail, NO_AI);
  assert.doesNotMatch(COPY.tripPassCardTail, /unlimited/i);
  assert.ok(CARD.includes("+ {PRICING_AND_LEGAL_TITLE_COPY.tripPassCardTail}"));
  assert.ok(CARD.includes('import { PRICING_AND_LEGAL_TITLE_COPY } from "@/lib/pricing-and-legal-title-copy";'));
  assert.ok(!CARD.includes("+ AI tasks · service fee waived"));
  const cardLine = `${tripPassRunsPhrase(5)} + ${COPY.tripPassCardTail}`;
  for (const line of [cardLine, tripPassPricingLine(5)]) {
    assert.match(line, /\btasks\b/);
    assert.doesNotMatch(line, NO_AI);
  }
  assert.ok(CARD.includes("service fee waived") || COPY.tripPassCardTail.includes("service fee waived"));
  assert.match(CARD, /status\.runsPerTrip/);
  assert.doesNotMatch(CARD, /unlimited/);
});

test("RW11: the purchase toast and the active-state line are K11/K12, no AI, no \"unlimited\" (10:10 PM ruling)", () => {
  assert.ok(CARD.includes("description: PRICING_AND_LEGAL_TITLE_COPY.tripPassActivatedToast"));
  assert.ok(CARD.includes("{PRICING_AND_LEGAL_TITLE_COPY.tripPassActiveLine}"));
  assert.doesNotMatch(CARD, /AI tasks/);
  for (const v of [COPY.tripPassActivatedToast, COPY.tripPassActiveLine]) {
    assert.doesNotMatch(v, NO_AI);
    assert.doesNotMatch(v, /unlimited/i);
  }
});
