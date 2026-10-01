/**
 * affiliate-extract.test.ts — ledger `2026-09-30-affiliate-extract-compliant` (migration 334).
 *
 * P1–P3 pin the terms gate `pageExtractAllowed` (default off; a TRUE without a date is not a
 * permission). P4–P6 are source-level pins: every `affiliate_products` INSERT under server/ stamps
 * `source`, the page extract checks the gate BEFORE it creates a job row or fetches anything, and
 * no xAI client remains in the extractor.
 *
 * STATED NEGATIVE SPACE (§18d): P4 reads source text, so an insert that builds its values in a
 * variable passed from another file is invisible to it; it proves the two known writers stamp, not
 * that a third writer added later will. It does not execute a scrape or the Anthropic call.
 *
 * Run: npx tsx --test shared/__tests__/affiliate-extract.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { AFFILIATE_PRODUCT_SOURCES, isAffiliateProductSource, pageExtractAllowed } from "../affiliate-extract";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

test("P1: extraction is off unless explicitly permitted with a terms-check date", () => {
  assert.equal(pageExtractAllowed({}), false);
  assert.equal(pageExtractAllowed({ pageExtractPermitted: null, termsCheckedAt: null }), false);
  assert.equal(pageExtractAllowed({ pageExtractPermitted: false, termsCheckedAt: new Date() }), false);
  assert.equal(pageExtractAllowed({ pageExtractPermitted: true, termsCheckedAt: null }), false);
  assert.equal(pageExtractAllowed({ pageExtractPermitted: true, termsCheckedAt: new Date() }), true);
  assert.equal(pageExtractAllowed({ pageExtractPermitted: true, termsCheckedAt: "2026-09-30T00:00:00Z" }), true);
});

test("P2: the provenance value set is exactly the three ruled values", () => {
  assert.deepEqual([...AFFILIATE_PRODUCT_SOURCES], ["travelpayouts_import", "partner_page_extract", "manual"]);
  assert.equal(isAffiliateProductSource("partner_page_extract"), true);
  assert.equal(isAffiliateProductSource("scraped"), false);
  assert.equal(isAffiliateProductSource(null), false);
});

test("P3: the columns are declared nullable with no default, and the insert schemas omit them (§19)", () => {
  const schema = read("shared/schema.ts");
  assert.match(schema, /source: varchar\("source", \{ length: 30 \}\),\n\s+createdAt/);
  assert.match(schema, /pageExtractPermitted: boolean\("page_extract_permitted"\),/);
  assert.match(schema, /termsCheckedAt: timestamp\("terms_checked_at"\),\n\s+submittedAt/);
  const sql = read("server/migrations/334_affiliate_extract_provenance.sql");
  assert.equal(/\bDEFAULT\b|\bCHECK\b|\bUPDATE\b|\bNOT NULL\b/.test(sql.replace(/^--.*$/gm, "")), false);
});

test("P4: every affiliate_products INSERT under server/ stamps its source", () => {
  const writers: Array<[string, string]> = [
    ["server/services/affiliate-scraper.service.ts", "partner_page_extract"],
    ["server/services/catalog-ingest.service.ts", "travelpayouts_import"],
  ];
  for (const [file, value] of writers) {
    const src = read(file);
    const at = src.indexOf("db.insert(affiliateProducts)");
    assert.ok(at >= 0, `${file} no longer inserts affiliate_products — move this pin with it`);
    assert.ok(src.slice(at, at + 400).includes(`source: "${value}"`), `${file} must stamp source "${value}" on insert`);
  }
  // No OTHER server file inserts the table (a new writer must be added above, stamping its source).
  const others: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "__tests__") walk(rel); continue; }
      if (!rel.endsWith(".ts")) continue;
      const src = read(rel);
      if (/insert\(affiliateProducts\)|INSERT INTO affiliate_products/.test(src)
        && !writers.some(([f]) => f === rel)) others.push(rel);
    }
  };
  walk("server");
  assert.deepEqual(others, [], `unstamped affiliate_products writer(s): ${others.join(", ")}`);
});

test("P5: the page extract checks the terms gate before any job row or fetch", () => {
  const src = read("server/services/affiliate-scraper.service.ts");
  const body = src.slice(src.indexOf("async scrapePartnerWebsite("));
  const gate = body.indexOf("pageExtractAllowed(partner)");
  assert.ok(gate > 0, "scrapePartnerWebsite must call pageExtractAllowed");
  assert.ok(gate < body.indexOf("insert(affiliateScrapeJobs)"), "the gate must come before the job row");
  assert.ok(gate < body.indexOf("fetchWebPage("), "the gate must come before any fetch");
});

test("P7: the platform kill-switch precedes the terms gate, and a missing products array fails the job", () => {
  const src = read("server/services/affiliate-scraper.service.ts");
  const body = src.slice(src.indexOf("async scrapePartnerWebsite("));
  const kill = body.indexOf('process.env.AFFILIATE_PAGE_EXTRACT_ENABLED !== "1"');
  assert.ok(kill > 0 && kill < body.indexOf("pageExtractAllowed(partner)"), "switch checked first");
  assert.doesNotMatch(src, /not an array, returning empty/);
});

test("P6: the extractor runs on the Anthropic client, never xAI", () => {
  const src = read("server/services/affiliate-scraper.service.ts");
  assert.equal(/XAI_API_KEY|api\.x\.ai|from "openai"/.test(src), false);
  assert.match(src, /claudeService\.completeJson/);
});
