/**
 * Static source pins for the Tavily-spend-logging lane (ledger `2026-09-18-tavily-spend-logged`).
 *
 * `tavily-client.test.ts` T9 behaviorally pins that the EXPORTED `TAVILY_PRICING_TENTHS` values
 * equal `round(<config USD constant> * 1000)`. That alone would still pass if the pricing table
 * were rewritten to a restated literal that happened to equal the same number today (§8: no bare
 * price literal at a call site). This file pins the SOURCE TEXT instead: `TAVILY_PRICING_TENTHS`
 * is computed FROM the imported config constants (never a bare number), and the admin cost view's
 * `TRACKED_PROVIDERS` list — which silently hid every Tavily row before this lane, because Tavily
 * calls were unlogged in the first place — actually carries `"tavily"`.
 *
 * Pure — no DB, no network; reads source files as text. Run:
 *   npx tsx --test server/__tests__/api-usage-tavily-pricing.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

/** Strip block and line comments so every pin below reads CODE, never prose. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function readStripped(rel: string): string {
  return stripComments(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}

describe("TAVILY_PRICING_TENTHS is derived, never restated (§8)", () => {
  const tavilyClientSrc = readStripped("server/services/tavily-client.ts");

  it("imports both USD price constants from trailhead.config", () => {
    assert.match(
      tavilyClientSrc,
      /import\s*\{[^}]*TAVILY_PRICE_PER_SEARCH_USD[^}]*TAVILY_PRICE_PER_EXTRACT_USD[^}]*\}\s*from\s*["']\.\.\/config\/trailhead\.config["']/s,
    );
  });

  it("computes the search tenths-of-cents value from the imported constant, not a literal", () => {
    assert.match(
      tavilyClientSrc,
      /search:\s*Math\.round\(\s*TAVILY_PRICE_PER_SEARCH_USD\s*\*\s*1000\s*\)/,
    );
  });

  it("computes the extract tenths-of-cents value from the imported constant, not a literal", () => {
    assert.match(
      tavilyClientSrc,
      /extract:\s*Math\.round\(\s*TAVILY_PRICE_PER_EXTRACT_USD\s*\*\s*1000\s*\)/,
    );
  });
});

describe("TAVILY_PRICE_PER_EXTRACT_USD lives beside TAVILY_PRICE_PER_SEARCH_USD, in config only", () => {
  const configSrc = readStripped("server/config/trailhead.config.ts");

  it("is declared in trailhead.config.ts (the one place these numbers may live)", () => {
    assert.match(configSrc, /export const TAVILY_PRICE_PER_EXTRACT_USD\s*=/);
  });

  it("is env-overridable, falling back to the committed estimate (never a bare unconditional literal)", () => {
    assert.match(configSrc, /envUsdPrice\(\s*["']TAVILY_PRICE_PER_EXTRACT_USD["']/);
  });

  it("no OTHER file under server/ or shared/ declares a Tavily price constant of its own", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name === "__tests__") continue;
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(rel);
        } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
          if (rel === path.join("server", "config", "trailhead.config.ts")) continue;
          const text = readStripped(rel);
          if (/TAVILY_PRICE_PER_(SEARCH|EXTRACT)_USD\s*=/.test(text)) offenders.push(rel);
        }
      }
    };
    walk("server");
    walk("shared");
    assert.deepEqual(offenders, []);
  });
});

describe("the admin cost view tracks Tavily (was silently hidden — FOLLOWUPS.md tavily-spend-unlogged)", () => {
  const apiCostsSrc = readStripped("server/services/api-costs.service.ts");

  it("TRACKED_PROVIDERS includes \"tavily\"", () => {
    const match = apiCostsSrc.match(/const TRACKED_PROVIDERS\s*=\s*\[([^\]]*)\]/);
    assert.ok(match, "TRACKED_PROVIDERS array not found");
    const items = match![1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    assert.ok(items.includes("tavily"), `expected "tavily" in TRACKED_PROVIDERS, got ${JSON.stringify(items)}`);
  });

  it("PROVIDER_DISPLAY_NAMES maps tavily -> a display label", () => {
    assert.match(apiCostsSrc, /tavily:\s*["']Tavily["']/);
  });

  it("getTavilyMonthToDateUsd() reads the cap from config, and does not enforce it", () => {
    assert.match(apiCostsSrc, /export async function getTavilyMonthToDateUsd/);
    assert.match(apiCostsSrc, /TAVILY_MONTHLY_CAP_USD/);
    // "enforce" language would signal a behaviour this lane deliberately does not add.
    assert.doesNotMatch(apiCostsSrc.toLowerCase(), /getTavilyMonthToDateUsd[\s\S]{0,400}\benforc/i);
  });
});

describe("the four Tavily call sites route through the one client module (§18 rule 1)", () => {
  const sites = [
    "server/services/dmo-ingestion.service.ts",
    "server/services/booking-verification.service.ts",
    "server/services/evidence-scorer.service.ts",
    "server/content/scrapers/DMOCrawler.ts",
  ];

  for (const rel of sites) {
    it(`${rel} imports from tavily-client, not a raw "tavily" SDK client construction`, () => {
      const src = readStripped(rel);
      // Matches both same-directory ("./tavily-client") and cross-directory
      // ("../../services/tavily-client") import specifiers.
      assert.match(src, /from\s*["'][./]*(?:services\/)?tavily-client["']/);
      assert.doesNotMatch(src, /\btavily\(\s*\{\s*apiKey/);
    });
  }
});
