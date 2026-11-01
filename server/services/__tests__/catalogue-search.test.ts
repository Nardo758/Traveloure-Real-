/**
 * Row 305 (CS-3 brief 8, D): catalogue search, server half. No network; the source readers are injected, and the
 * row-to-result builders are tested as pure functions.
 *
 *   S1 a listing is `book` only when instantly bookable; a request-mode or quote listing is add-to-plan only
 *   S2 a checked place needs a publishable, attributed, live fact; no source, no publish
 *   S3 a place whose publishable facts all expired shows as not checked yet, with the official site
 *   S4 an official site links to its top-level page; a link_out_no_link source (JR Central) is plain text
 *   S5 Viator is read only for a signed-in caller; a failing source answers nothing and the rest still answer
 *   S6 an unknown city or a one-letter query reads nothing
 *   S7 the Viator reader carries the live price and its time, and no review, rating or photo
 *   S8 the service writes nothing and reads no Travelpayouts, GetYourGuide, Booking.com or Google Places source
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import type { CatalogueResult } from "@shared/catalogue-search";
import {
  checkedPlaceResults,
  listingResult,
  officialSiteResult,
  searchCatalogue,
  type CatalogueReaders,
} from "../catalogue-search.service";

const NOW = new Date("2026-11-01T03:00:00Z");
const FUTURE = new Date("2026-12-01T00:00:00Z");
const PAST = new Date("2026-10-01T00:00:00Z");

test("S1 a listing is Book only when instantly bookable", () => {
  const instant = listingResult({ id: "s1", serviceName: "Tea ceremony", bookingMode: "instant" });
  assert.deepEqual(instant?.action, { type: "book", href: "/services/s1" });
  assert.equal(instant?.addToPlan.providerServiceId, "s1");
  const request = listingResult({ id: "s2", serviceName: "Private dinner", bookingMode: "request" });
  assert.deepEqual(request?.action, { type: "add_to_plan" });
  const quote = listingResult({ id: "s3", serviceName: "Custom tour", priceType: "custom_quote", bookingMode: "instant" });
  assert.deepEqual(quote?.action, { type: "add_to_plan" });
  assert.equal(listingResult({ id: "s4", serviceName: "  " }), null);
});

const official = {
  origin: "crawled",
  license: null,
  factType: "hours",
  verifiedAt: null,
  supersededBy: null,
  sourceUrl: "https://inari.jp/en/",
  sourceName: "Fushimi Inari Taisha",
  sourceLicenseClass: "official",
  sourcePublicOk: true,
  sourceHomepage: "https://inari.jp/en/visit",
  sourceTermsClass: null,
};

test("S2 a checked place needs a publishable, attributed, live fact", () => {
  const live = checkedPlaceResults([{ ...official, placeRef: "Fushimi Inari", fetchedAt: NOW, expiresAt: FUTURE }], "inari", NOW);
  assert.equal(live.length, 1);
  assert.equal(live[0].kind, "checked_place");
  assert.deepEqual(live[0].action, { type: "add_to_plan" });
  assert.equal(live[0].checked?.sourceName, "Fushimi Inari Taisha");
  assert.equal(live[0].checked?.sourceUrl, "https://inari.jp/en/");
  assert.match(live[0].checked!.checked, /^checked /);
  const noSource = checkedPlaceResults(
    [{ ...official, placeRef: "Fushimi Inari", fetchedAt: NOW, expiresAt: FUTURE, sourcePublicOk: null }],
    "inari",
    NOW,
  );
  assert.deepEqual(noSource, [], "no source, no publish");
  const places = checkedPlaceResults([{ ...official, origin: "places_api", placeRef: "Fushimi Inari", fetchedAt: NOW, expiresAt: FUTURE }], "inari", NOW);
  assert.deepEqual(places, [], "a Places fact never becomes a result");
});

test("S3 a place whose publishable facts all expired is not checked yet, with the official site", () => {
  const expired = checkedPlaceResults([{ ...official, placeRef: "Fushimi Inari", fetchedAt: PAST, expiresAt: PAST }], "inari", NOW);
  assert.equal(expired.length, 1);
  assert.equal(expired[0].checked, undefined);
  assert.deepEqual(expired[0].notChecked, { officialUrl: "https://inari.jp/" });
});

test("S4 an official site links to its top-level page; a no-link source is plain text", () => {
  const west = officialSiteResult({ id: "jr_west", name: "JR West", homepage: "https://www.westjr.co.jp/global/en/ticket/", termsClass: null });
  assert.deepEqual(west.action, { type: "book_on_site", site: "JR West", href: "https://www.westjr.co.jp/" });
  const central = officialSiteResult({ id: "jr_central", name: "JR Central", homepage: "https://jr-central.co.jp/", termsClass: "link_out_no_link" });
  assert.deepEqual(central.action, { type: "add_to_plan" });
});

function readers(over: Partial<CatalogueReaders> = {}): CatalogueReaders & { calls: string[] } {
  const calls: string[] = [];
  const one = (kind: CatalogueResult["kind"], action: CatalogueResult["action"]) => (label: string) => async () => {
    calls.push(label);
    return [{ id: `${label}:1`, kind, title: label, action, addToPlan: { title: label } }];
  };
  return {
    calls,
    listings: one("listing", { type: "book", href: "/services/1" })("listings"),
    checkedPlaces: one("checked_place", { type: "add_to_plan" })("checkedPlaces"),
    officialSites: one("official_site", { type: "book_on_site", site: "JR West", href: "https://www.westjr.co.jp/" })("officialSites"),
    viator: one("partner_viator", { type: "book_on_site", site: "Viator", href: "https://www.viator.com/x" })("viator"),
    hotels: one("hotel", { type: "add_to_plan" })("hotels"),
    ...over,
  };
}

test("S5 Viator only for a signed-in caller; a failing source answers nothing", async () => {
  const anon = readers();
  const a = await searchCatalogue({ city: "Kyoto", query: "temple", signedIn: false, now: NOW }, anon);
  assert.equal(anon.calls.includes("viator"), false);
  assert.deepEqual(a.results.map((x) => x.kind), ["listing", "checked_place", "official_site", "hotel"]);
  const signed = readers({ hotels: async () => { throw Object.assign(new Error("boom"), { code: "57014" }); } });
  const b = await searchCatalogue({ city: "Kyoto", query: "temple", signedIn: true, now: NOW }, signed);
  assert.deepEqual(b.results.map((x) => x.kind), ["listing", "checked_place", "official_site", "partner_viator"]);
});

test("S6 an unknown city or a one-letter query reads nothing", async () => {
  const r1 = readers();
  const x = await searchCatalogue({ city: "Atlantis", query: "temple", signedIn: true }, r1);
  assert.deepEqual(x.results, []);
  assert.equal(x.city, null);
  const y = await searchCatalogue({ city: "Kyoto", query: "t", signedIn: true }, r1);
  assert.deepEqual(y.results, []);
  assert.deepEqual(r1.calls, []);
});

test("S7 the Viator reader carries the live price and its time, never a review, rating or photo", () => {
  const src = fs.readFileSync("server/services/catalogue-search.service.ts", "utf8");
  const viator = src.slice(src.indexOf("async viator("), src.indexOf("async hotels("));
  assert.match(viator, /livePrice: \{ amount: i\.price, currency: i\.currency, asOf: live\.asOf! \}/);
  assert.doesNotMatch(viator, /rating|review|imageUrl|photo/i);
  assert.match(viator, /addToPlan: \{ title: i\.title, viatorProductCode: i\.productCode \}/);
});

test("S8 the service writes nothing and reads no excluded source", () => {
  const src = fs.readFileSync("server/services/catalogue-search.service.ts", "utf8");
  const code = src.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /\.insert\(|\.update\(|\.delete\(/);
  assert.doesNotMatch(code, /travelpayouts|getyourguide|booking\.com|klook|searchWorkspacePlaces|places-text-search|affiliateProducts/i);
});
