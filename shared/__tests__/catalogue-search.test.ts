/**
 * Row 305 (CS-3 brief 8, D): the catalogue search rules, pure.
 *
 *   C1 the two approved strings are verbatim
 *   C2 only the five catalogue kinds exist
 *   C3 each kind carries only its allowed action; `book` is our listings only; hotels are add-to-plan only
 *   C4 a result with a disallowed action, an excluded partner or a repeated id is dropped
 *   C5 no source answers more than the per-source limit
 *   C6 no result type has a request action, a fee field, or a Viator review, rating or photo field
 *   C7 the query is trimmed, collapsed and cut, never refused
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  actionAllowedFor,
  assembleCatalogueResults,
  CATALOGUE_ACTION_TYPES,
  CATALOGUE_PER_SOURCE_LIMIT,
  CATALOGUE_QUERY_MAX,
  CATALOGUE_RESULT_KINDS,
  CATALOGUE_SEARCH_COPY,
  normalizeCatalogueQuery,
  type CatalogueResult,
} from "../catalogue-search";

const r = (over: Partial<CatalogueResult> & Pick<CatalogueResult, "id" | "kind" | "action">): CatalogueResult => ({
  title: "Gio-ji",
  addToPlan: { title: "Gio-ji" },
  ...over,
});

test("C1 the approved strings are verbatim", () => {
  assert.equal(CATALOGUE_SEARCH_COPY.placeholder("Kyoto"), "Search places, tours and tickets in Kyoto");
  assert.equal(CATALOGUE_SEARCH_COPY.empty, "Nothing matched. Try another word, or browse the city page.");
});

test("C2 only the catalogue kinds and the three actions exist", () => {
  assert.deepEqual([...CATALOGUE_RESULT_KINDS], ["listing", "checked_place", "official_site", "partner_viator", "hotel"]);
  assert.deepEqual([...CATALOGUE_ACTION_TYPES], ["book", "book_on_site", "add_to_plan"]);
});

test("C3 each kind carries only its allowed action", () => {
  const book = { type: "book" as const, href: "/services/1" };
  const out = { type: "book_on_site" as const, site: "Viator", href: "https://www.viator.com/x" };
  const add = { type: "add_to_plan" as const };
  assert.equal(actionAllowedFor("listing", book), true);
  assert.equal(actionAllowedFor("listing", add), true);
  for (const kind of ["checked_place", "official_site", "partner_viator", "hotel"] as const) {
    assert.equal(actionAllowedFor(kind, book), false, `${kind} may not say Book`);
  }
  assert.equal(actionAllowedFor("hotel", out), false, "hotels are links only, never booked here");
  assert.equal(actionAllowedFor("hotel", add), true);
  assert.equal(actionAllowedFor("partner_viator", out), true);
  assert.equal(actionAllowedFor("partner_viator", add), false, "a Viator result is a link out");
  assert.equal(actionAllowedFor("checked_place", add), true);
});

test("C4 a rule-breaking result is dropped, never repaired", () => {
  const results = assembleCatalogueResults([
    [
      r({ id: "a", kind: "listing", action: { type: "book", href: "/services/a" } }),
      r({ id: "b", kind: "hotel", action: { type: "book", href: "/services/b" } }),
      r({ id: "c", kind: "official_site", action: { type: "book_on_site", site: "GetYourGuide", href: "https://x" } }),
      r({ id: "d", kind: "partner_viator", attribution: "Booking.com", action: { type: "book_on_site", site: "x", href: "https://x" } }),
    ],
    [r({ id: "a", kind: "checked_place", action: { type: "add_to_plan" } })],
  ]);
  assert.deepEqual(results.map((x) => x.id), ["a"]);
});

test("C5 no source answers more than the per-source limit", () => {
  const many = Array.from({ length: CATALOGUE_PER_SOURCE_LIMIT + 5 }, (_, i) =>
    r({ id: `l${i}`, kind: "listing", action: { type: "add_to_plan" } }),
  );
  assert.equal(assembleCatalogueResults([many]).length, CATALOGUE_PER_SOURCE_LIMIT);
});

test("C6 the result type has no request action, fee field or Viator review/rating/photo field", () => {
  const raw = fs.readFileSync("shared/catalogue-search.ts", "utf8");
  const src = raw.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const types = src.slice(src.indexOf("export type CatalogueAction"), src.indexOf("const ALLOWED"));
  assert.doesNotMatch(types, /request/i);
  assert.doesNotMatch(types, /\bfee\b/i);
  assert.doesNotMatch(types, /rating|review|photo|image/i);
  assert.doesNotMatch(src, /Request this booking/);
});

test("C7 the query is trimmed, collapsed and cut", () => {
  assert.equal(normalizeCatalogueQuery("  tea   ceremony "), "tea ceremony");
  assert.equal(normalizeCatalogueQuery(42), "");
  assert.equal(normalizeCatalogueQuery("x".repeat(500)).length, CATALOGUE_QUERY_MAX);
});
