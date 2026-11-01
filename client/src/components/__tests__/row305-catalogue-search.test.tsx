/**
 * Row 305 (CS-3 brief 8, D), client: the catalogue results under the city page's one search box.
 *
 *   K1 the city page's one box carries the approved placeholder and drives both the feed and the catalogue
 *   K2 every result draws exactly one action: Book (listing), Book on Viator / Book on the official site, Add to plan
 *   K3 hotels and checked places draw Add to plan only
 *   K4 a Viator result shows its attribution, the live price with its time, and the commission line; no rating,
 *      review or photo
 *   K5 a checked place shows its source and checked date; an expired one shows "Not checked yet" with the site
 *   K6 nothing matched shows the approved empty line; a short query draws nothing
 *   K7 no "Request this booking" and no fee line anywhere in the results
 *   K8 an added result keeps its listing or Viator link through the add dialog
 */
import "./node-navigator";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import type { CatalogueResult, CatalogueSearchResponse } from "@shared/catalogue-search";
import { CatalogueSearchView } from "../catalogue-search-results";
import { CATALOGUE_RESULT_COPY, catalogueAddItem, viatorPriceLine } from "@/lib/catalogue-search-copy";

(globalThis as any).React = React;

const results: CatalogueResult[] = [
  { id: "listing:s1", kind: "listing", title: "Tea ceremony in Gion", action: { type: "book", href: "/services/s1" }, addToPlan: { title: "Tea ceremony in Gion", providerServiceId: "s1" } },
  { id: "listing:s2", kind: "listing", title: "Private dinner", action: { type: "add_to_plan" }, addToPlan: { title: "Private dinner", providerServiceId: "s2" } },
  {
    id: "place:fushimi inari",
    kind: "checked_place",
    title: "Fushimi Inari",
    action: { type: "add_to_plan" },
    addToPlan: { title: "Fushimi Inari" },
    checked: { sourceName: "Fushimi Inari Taisha", sourceUrl: "https://inari.jp/en/", checked: "checked 1 Oct 2026" },
  },
  { id: "place:gio-ji", kind: "checked_place", title: "Gio-ji", action: { type: "add_to_plan" }, addToPlan: { title: "Gio-ji" }, notChecked: { officialUrl: "https://www.giouji.or.jp/" } },
  { id: "official:jr_west", kind: "official_site", title: "JR West", action: { type: "book_on_site", site: "JR West", href: "https://www.westjr.co.jp/" }, addToPlan: { title: "JR West" } },
  { id: "official:jr_central", kind: "official_site", title: "JR Central", action: { type: "add_to_plan" }, addToPlan: { title: "JR Central" } },
  {
    id: "viator:5010P1",
    kind: "partner_viator",
    title: "Arashiyama bamboo walk",
    attribution: "Viator",
    action: { type: "book_on_site", site: "Viator", href: "https://www.viator.com/tours/x?campaign=traveloure_browse" },
    addToPlan: { title: "Arashiyama bamboo walk", viatorProductCode: "5010P1" },
    livePrice: { amount: 45, currency: "USD", asOf: "2026-11-01T05:05:00Z" },
  },
  { id: "hotel:h1", kind: "hotel", title: "Hotel Kanra", action: { type: "add_to_plan" }, addToPlan: { title: "Hotel Kanra", locationName: "Kyoto" } },
];

function render(data: CatalogueSearchResponse | undefined, status: "idle" | "loading" | "error" | "ready" = "ready"): string {
  return renderToString(
    <Router ssrPath="/discover/location/kyoto">
      <CatalogueSearchView data={data} status={status} city="Kyoto" onAdd={() => {}} />
    </Router>,
  );
}
const clean = (s: string) => s.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
function actionBlock(html: string, id: string): string {
  const at = html.indexOf(`data-testid="catalogue-action-${id}"`);
  assert.ok(at >= 0, id);
  const end = html.indexOf("</li>", at);
  return html.slice(html.indexOf(">", at) + 1, end);
}

describe("row 305 — catalogue search results", () => {
  it("K1 the city page's one box carries the approved placeholder and drives both reads", () => {
    const page = fs.readFileSync("client/src/pages/discover-location.tsx", "utf8");
    assert.match(page, /placeholder=\{CATALOGUE_SEARCH_COPY\.placeholder\(displayCity\)\}/);
    assert.match(page, /<CatalogueSearchResults city=\{displayCity\} query=\{searchQuery\} onAdd=\{handleAdd\} \/>/);
    assert.doesNotMatch(page, /What do you need help with in \$\{displayCity\}/);
    assert.equal(page.match(/data-testid="input-search"/g)?.length, 1, "one search box");
  });

  it("K2 every result draws exactly one action, with its one label", () => {
    const html = render({ city: "Kyoto", query: "kyoto", results });
    const ADD = CATALOGUE_RESULT_COPY.addToPlan;
    const expected: Record<string, string> = {
      "listing:s1": "Book",
      "listing:s2": ADD,
      "place:fushimi inari": ADD,
      "place:gio-ji": ADD,
      "official:jr_west": "Book on the official site",
      "official:jr_central": ADD,
      "viator:5010P1": "Book on Viator",
      "hotel:h1": ADD,
    };
    for (const [id, label] of Object.entries(expected)) {
      const block = actionBlock(html, id);
      const controls = (block.match(/<a |<button /g) ?? []).length;
      assert.equal(controls, 1, `${id} has one control`);
      const actionHtml = block.slice(0, block.indexOf("</div>"));
      assert.equal(clean(actionHtml), label, id);
    }
    assert.match(actionBlock(html, "listing:s1"), /href="\/services\/s1"/);
    assert.match(actionBlock(html, "official:jr_west"), /href="https:\/\/www\.westjr\.co\.jp\/"/);
  });

  it("K3 hotels and checked places draw Add to plan only", () => {
    const html = render({ city: "Kyoto", query: "kyoto", results });
    for (const id of ["hotel:h1", "place:fushimi inari", "place:gio-ji"]) {
      assert.doesNotMatch(actionBlock(html, id).split("</div>")[0], /href=/, `${id} is not a link`);
    }
  });

  it("K4 a Viator result shows attribution, the live price with its time, and the commission line", () => {
    const html = render({ city: "Kyoto", query: "bamboo", results });
    assert.match(html, /data-testid="catalogue-attribution-viator:5010P1"[^>]*>Viator</);
    assert.equal(viatorPriceLine(results[6].livePrice, "Asia/Tokyo"), "From $45 on Viator, as of 14:05");
    assert.match(clean(html), /From \$45 on Viator, as of 14:05/);
    assert.match(clean(html), new RegExp(CATALOGUE_RESULT_COPY.commission));
    assert.doesNotMatch(html, /rating|review|<img /i);
  });

  it("K5 a checked place shows its source and date; an expired one shows Not checked yet with the site", () => {
    const html = render({ city: "Kyoto", query: "inari", results });
    assert.match(clean(html), /from Fushimi Inari Taisha · checked 1 Oct 2026/);
    assert.match(html, /data-testid="catalogue-not-checked-place:gio-ji"/);
    assert.match(clean(html), /Not checked yet/);
    assert.match(html, /href="https:\/\/www\.giouji\.or\.jp\/"/);
  });

  it("K6 nothing matched shows the approved line; idle draws nothing", () => {
    const empty = render({ city: "Kyoto", query: "zzz", results: [] });
    assert.match(clean(empty), /Nothing matched\. Try another word, or browse the city page\./);
    assert.equal(render(undefined, "idle"), "");
  });

  it("K7 no request action and no fee line", () => {
    const html = render({ city: "Kyoto", query: "kyoto", results });
    assert.doesNotMatch(html, /Request this booking/i);
    assert.doesNotMatch(clean(html), /service fee|\bfee\b/i);
    for (const f of ["client/src/components/catalogue-search-results.tsx", "client/src/lib/catalogue-search-copy.ts"]) {
      assert.doesNotMatch(fs.readFileSync(f, "utf8"), /Request this booking|service fee/i, f);
    }
  });

  it("K8 an added result keeps its link through the add dialog", () => {
    assert.deepEqual(catalogueAddItem(results[0]), { title: "Tea ceremony in Gion", type: "activity", providerServiceId: "s1" });
    assert.deepEqual(catalogueAddItem(results[6]), { title: "Arashiyama bamboo walk", type: "activity", viatorProductCode: "5010P1" });
    assert.deepEqual(catalogueAddItem(results[7]), { title: "Hotel Kanra", type: "hotel" });
    const dialog = fs.readFileSync("client/src/components/add-to-experience-dialog.tsx", "utf8");
    assert.match(dialog, /typeof item\?\.providerServiceId === "string" \? \{ providerServiceId: item\.providerServiceId \}/);
    assert.match(dialog, /typeof item\?\.viatorProductCode === "string" \? \{ viatorProductCode: item\.viatorProductCode \}/);
  });
});
