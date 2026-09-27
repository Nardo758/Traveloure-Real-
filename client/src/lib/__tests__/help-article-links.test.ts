/**
 * Every in-app link to a Help article names a real article (Lane B, Sep 27, 2026).
 *
 * L1 every `helpArticlePath("…")` call under client/src names a slug in `HELP_ARTICLE_SLUGS` (the
 * TS union already refuses a typo; this also covers a cast or a plain-JS call site). L2 no raw
 * "/help/<slug>" string literal names a slug that is not an article. L3 the ruled link sites carry
 * their link: the failed-payment note and checkout error → payment-didnt-go-through, the cancel
 * dialog → cancellations-and-refunds, the fee lines on the slip and cart → trip-pass-and-fees, the
 * "Under review" notes → disputes-and-under-review. L4 App.tsx routes /help/:slug and redirects /faq.
 *
 * NEGATIVE SPACE (§18d): a link built by string concatenation ("/help/" + x) is not seen by L2.
 *
 * Run: npx tsx --test client/src/lib/__tests__/help-article-links.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { HELP_ARTICLE_SLUGS } from "@shared/help-articles";

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const SOURCES = walk(path.join(ROOT, "client/src")).map((f) => ({ f: path.relative(ROOT, f), src: fs.readFileSync(f, "utf8") }));
const SLUGS = new Set<string>(HELP_ARTICLE_SLUGS);

test("L1 every helpArticlePath call names a real article", () => {
  const bad: string[] = [];
  let calls = 0;
  for (const { f, src } of SOURCES) {
    for (const m of src.matchAll(/helpArticlePath\(\s*["'`]([^"'`]+)["'`]\s*\)/g)) {
      calls++;
      if (!SLUGS.has(m[1])) bad.push(`${f}: ${m[1]}`);
    }
  }
  assert.ok(calls >= 5, `expected the ruled link sites to call helpArticlePath, found ${calls}`);
  assert.deepEqual(bad, []);
});

test("L2 no raw /help/<slug> literal names a missing article", () => {
  const bad: string[] = [];
  for (const { f, src } of SOURCES) {
    for (const m of src.matchAll(/["'`]\/help\/([a-z0-9-]+)["'`]/g)) {
      if (!SLUGS.has(m[1])) bad.push(`${f}: /help/${m[1]}`);
    }
  }
  assert.deepEqual(bad, []);
});

test("L3 the ruled link sites carry their article", () => {
  const sites: Array<[string, string]> = [
    ["client/src/components/booking/StripeCheckout.tsx", "payment-didnt-go-through"],
    ["client/src/components/booking/CancelBookingDialog.tsx", "cancellations-and-refunds"],
    ["client/src/components/plancard/SlipRail.tsx", "trip-pass-and-fees"],
    ["client/src/pages/cart.tsx", "trip-pass-and-fees"],
    ["client/src/pages/my-bookings.tsx", "disputes-and-under-review"],
  ];
  for (const [rel, slug] of sites) {
    assert.ok(read(rel).includes(`helpArticlePath("${slug}")`), `${rel} links ${slug}`);
  }
  const state = read("client/src/lib/item-booking-state.ts");
  assert.match(state, /payment_failed: "payment-didnt-go-through"/);
  assert.match(state, /under_review: "disputes-and-under-review"/);
  assert.match(read("client/src/components/plancard/ActivitiesSection.tsx"), /ITEM_BOOKING_HELP_ARTICLE\[state\]/);
});

test("L4 App.tsx routes each article and redirects /faq to /help", () => {
  const app = read("client/src/App.tsx");
  assert.match(app, /<Route path="\/help\/:slug">/);
  assert.match(app, /<Route path="\/faq">\s*<Redirect to="\/help" \/>/);
  assert.ok(!fs.existsSync(path.join(ROOT, "client/src/pages/faq.tsx")), "the old FAQ page is deleted, not orphaned");
});
