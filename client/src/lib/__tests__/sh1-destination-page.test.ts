/**
 * SH-1 items 7–10 — the destination page (architect's rulings, Oct 19, 2026; ledger `2026-10-19-sh1-destination-page`).
 *
 *   TP1  a Fever event has no tile price, whatever the partner sent; another event keeps its own
 *   TP2  a chosen price band leaves Fever events out (Q7.3); "Any price" and unpriced editorial tiles are unchanged
 *   PP1  the one partner-priced rule
 *   EC1  the event card: no Fever amount, no raw Tickets link, "See current price" through the booking_token redirect
 *   SL1  the season writer is off, so nothing reads the seasonal fields
 *   SL2  a rating prints "N/10" or a capitalised word, never "{word}/10"
 *   SL3  the season line omits what it does not have
 *   DP1  item 8: the header is the city name only; the date strip and highlight add-on sit behind the same constant; no ¥
 *   DP2  items 9 and 10: no Request-a-service dialog and no Airport-transfer card
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { extractTilePrice, priceMatches } from "../tile-price";
import { isPartnerPriced } from "../partner-price";
import { SEASONAL_WRITER_LIVE, buildSeasonLine, seasonRatingFragment } from "../season-line";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

const fever = { kind: "event", data: { provider: "fever", priceSource: "partner", minPrice: 30, isFree: true } };
const other = { kind: "event", data: { minPrice: 30 } };

test("TP1: a Fever event has no tile price; another event keeps its own", () => {
  assert.equal(extractTilePrice(fever), null);
  assert.equal(extractTilePrice({ kind: "event", data: { provider: "fever", minPrice: 12 } }), null);
  assert.equal(extractTilePrice(other), 30);
});

test("TP2: a chosen band leaves Fever events out; Any price and unpriced tiles are unchanged", () => {
  for (const band of ["under50", "50to150", "over150"]) assert.equal(priceMatches(fever, band), false, band);
  assert.equal(priceMatches(fever, "any"), true);
  assert.equal(priceMatches({ kind: "gem", data: {} }, "under50"), true, "an editorial tile is outside the priced domain");
  assert.equal(priceMatches(other, "under50"), true);
  assert.equal(priceMatches(other, "over150"), false);
});

test("PP1: partner-priced is the Fever provider or a partner price source", () => {
  assert.equal(isPartnerPriced({ priceSource: "partner" }), true);
  assert.equal(isPartnerPriced({ provider: "fever" }), true);
  assert.equal(isPartnerPriced({ provider: "viator" }), false);
  assert.equal(isPartnerPriced(null), false);
});

test("EC1: the event card shows no Fever amount and no raw Tickets link", () => {
  const src = read("client/src/components/city-feed-card.tsx");
  const card = src.slice(src.indexOf("export function CityFeedCardEvent"));
  assert.ok(!card.includes("href={event.url}"), "no raw partner link");
  assert.ok(!/>\s*Tickets\s*</.test(card), "no Tickets button");
  assert.ok(!card.includes("href: event.url"), "the suggestion strip does not link out");
  assert.match(card, /const priceChip = partnerPriced\s*\?\s*null/);
  assert.match(card, /const priceStr = partnerPriced\s*\?\s*null/);
  assert.match(card, /value: partnerPriced \? "" :/);
  assert.match(card, /openPartnerPrice\(\{ itemId: token, itemType: "booking_token" \}\)/);
  assert.match(card, /\{PARTNER_PRICE_LINK_LABEL\}/);
  assert.equal(read("client/src/lib/browse-supply.ts").includes('PARTNER_PRICE_LINK_LABEL = "See current price"'), true);
});

test("SL1: the season writer is off", () => {
  assert.equal(SEASONAL_WRITER_LIVE, false);
});

test("SL2: a rating prints N/10 or a capitalised word", () => {
  assert.equal(seasonRatingFragment(8), "8/10");
  assert.equal(seasonRatingFragment("7"), "7/10");
  assert.equal(seasonRatingFragment("excellent"), "Excellent");
  assert.equal(seasonRatingFragment(42), null);
  assert.equal(seasonRatingFragment(undefined), null);
  assert.ok(!String(seasonRatingFragment("good")).includes("/10"));
});

test("SL3: the season line omits what it does not have", () => {
  assert.equal(buildSeasonLine({ rating: 9, highlight: "Autumn leaves" }, "November"), "9/10 in November · Autumn leaves");
  assert.equal(buildSeasonLine({ rating: null, highlight: "Autumn leaves" }, "November"), "Autumn leaves");
  assert.equal(buildSeasonLine({ rating: 9 }, null), "9/10");
  assert.equal(buildSeasonLine({}, "November"), null);
  assert.equal(buildSeasonLine(null, "November"), null);
});

test("DP1: item 8 — the header, the date strip and the highlight add-on sit behind the constant; no ¥", () => {
  const page = read("client/src/pages/discover-location.tsx");
  assert.ok(!page.includes("Local experts, bookable services"), "the fixed header line is gone");
  assert.match(page, /const seasonLine = !SEASONAL_WRITER_LIVE/);
  assert.match(page, /\{SEASONAL_WRITER_LIVE && scheduledDate && \(/);
  assert.match(page, /highlight=\{null\}/);
  assert.equal(page.includes("currentHighlight"), false);
  assert.equal(page.includes("aiSeasonalHighlights"), false);
  assert.ok(!page.includes("¥"), "no hard-coded yen");
});

test("DP2: items 9 and 10 — no Request-a-service dialog, no Airport-transfer card", () => {
  const page = read("client/src/pages/discover-location.tsx");
  assert.ok(!page.includes("ServiceRequestDialog"));
  assert.ok(!existsSync(path.join(ROOT, "client/src/components/service-request-dialog.tsx")));
  assert.ok(!/Airport transfer/.test(page.replace(/\/\*[\s\S]*?\*\//g, "")), "no Airport transfer card outside comments");
  assert.ok(!page.includes("AddOnAgentCard"));
});
