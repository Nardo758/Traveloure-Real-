/**
 * Row 304c (Kyoto discover brief §7; tests only). Pins what main does TODAY about partner tiles. Row 304a (the partner
 * tile server) is NOT built — it is held until after 298a — so the assertions that only hold once it exists are
 * skipped with the reason "304a not built". No product code changes in this row.
 *
 * On main there is no partner tile: the Kyoto location view's sections are hero, recommendations, events,
 * neighbourhoods, gems, services and external stubs (scraped/DMO content, not a partner feed), the feed has no
 * partner kind, and every affiliate program is switched off.
 *
 *   PT1  a signed-out visitor sees no partner tile (no one does: the payload has no partner section and no kind)
 *   PT2  a partner outside the allowlist (anything but Viator or Klook) is never returned
 *   PT3  no price or logo in the payload or the DOM
 *   PT4  an add-to-plan item with partnerCoverage "partner_product" resolves the booking path "affiliate"
 *
 * Run: npx tsx --test client/src/components/__tests__/row304c-partner-tiles.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { CityFeedCardExternalStub, type ExternalStubData } from "../city-feed-card-external-stub";
import { PANEL_PARTNER_KEYS, PARTNER_PANEL_TERMS } from "@shared/tile-detail-panel";
import { resolveBookingPath, PARTNER_COVERAGE_KINDS } from "@shared/booking-path";
import { AFFILIATE_PROGRAMS } from "../../../../server/config/trailhead.config";

const PENDING = "304a not built";
const ALLOWLIST = ["viator", "klook"];

const locationView = readFileSync("server/services/location-view.service.ts", "utf8");
const feedStream = readFileSync("client/src/lib/feed-stream.ts", "utf8");
const bookingPathService = readFileSync("server/services/booking-path.service.ts", "utf8");

function section(src: string, start: string, end: string): string {
  const a = src.indexOf(start);
  assert.ok(a > -1, start);
  const b = src.indexOf(end, a);
  assert.ok(b > a, end);
  return src.slice(a, b);
}

function stub(over: Partial<ExternalStubData> = {}): ExternalStubData {
  return {
    id: "s1",
    inventoryClass: "external",
    resolutionClass: "affiliate",
    resolutionSubclass: "affiliate_ota",
    resolutionRef: "viator:example-product",
    name: "Example Tea Ceremony",
    city: "Kyoto",
    country: "Japan",
    neighborhood: "Gion",
    contentType: "attraction",
    shortDescription: "A tea ceremony.",
    primaryImageUrl: null,
    sourceUrl: "https://example.org/tea",
    sourcePageTitle: "Example",
    license: "osm",
    places: [],
    placeCount: 0,
    ...over,
  };
}

describe("row 304c: partner tiles on main", () => {
  it("PT1 no one — a signed-out visitor included — receives a partner tile: no partner section, no partner kind", () => {
    const payload = section(locationView, "const payload: LocationViewPayload = {", "};");
    for (const key of ["hero", "recommendations", "events", "neighborhoods", "gems", "services", "externalStubs"]) {
      assert.match(payload, new RegExp(`\\b${key}\\b`), key);
    }
    assert.doesNotMatch(payload, /partner/i);
    const kinds = section(feedStream, "export type FeedItemKind", "export interface FeedItem");
    assert.doesNotMatch(kinds, /partner/i);
    // The location view is cached per city and date, not per session, so whatever it holds every visitor gets.
    assert.match(locationView, /locationViewCache\.set\(cacheKey, \{ payload/);
  });

  it("PT1 (pending) a signed-in session gets partner tiles and a signed-out one gets none", { skip: PENDING }, () => {});

  it("PT2 the partner allowlist is Viator and Klook, and no other affiliate program is switched on", () => {
    assert.deepEqual([...PANEL_PARTNER_KEYS], ALLOWLIST);
    assert.deepEqual(Object.keys(PARTNER_PANEL_TERMS).sort(), [...ALLOWLIST].sort());
    for (const [key, program] of Object.entries(AFFILIATE_PROGRAMS)) {
      if (!ALLOWLIST.includes(key)) assert.equal(program.enabled, false, `${key} must stay off`);
    }
    for (const off of ["getyourguide", "tiqets", "civitatis"]) assert.equal(AFFILIATE_PROGRAMS[off]?.enabled, false, off);
  });

  it("PT2 (pending) the feed route filters partner tiles to the allowlist", { skip: PENDING }, () => {});

  it("PT3 the stub payload selects no price or logo field", () => {
    const select = section(locationView, "const stubRows = await db", ".from(dmoRawContent)");
    assert.doesNotMatch(select, /price|logo/i);
    const shape = section(locationView, "export interface ExternalStub {", "export interface ExternalStubsSection");
    assert.doesNotMatch(shape, /price|logo/i);
  });

  it("PT3 the card draws no price or logo, even when the data carries them", () => {
    const html = renderToString(
      <CityFeedCardExternalStub
        stub={{ ...stub(), price: "¥9,999", priceCents: 999900, logoUrl: "https://example.com/logo.png", partnerLogo: "https://example.com/p.png" } as any}
        city="kyoto"
      />,
    );
    assert.equal(html.includes("9,999"), false);
    assert.equal(html.includes("¥"), false);
    assert.equal(/logo\.png|p\.png/.test(html), false);
  });

  it("PT3 (pending) the partner tile payload strips price and logo fields", { skip: PENDING }, () => {});

  it("PT4 an item with partnerCoverage partner_product resolves the affiliate booking path", () => {
    assert.ok((PARTNER_COVERAGE_KINDS as readonly string[]).includes("partner_product"));
    assert.equal(resolveBookingPath({ liveListing: false, partnerCoverage: "partner_product", title: "Example Tea Ceremony" }), "affiliate");
    assert.equal(resolveBookingPath({ liveListing: true, partnerCoverage: "partner_product", title: "Example Tea Ceremony" }), "platform");
    assert.equal(resolveBookingPath({ liveListing: false, partnerCoverage: "partner_product", title: "Example Tea Ceremony", dayIsPast: true }), "none");
    // The server sets the coverage from the item's own partner product id — never by matching a name.
    assert.match(bookingPathService, /item\.affiliateProductId && products\.has\(item\.affiliateProductId\)\) partnerCoverage = "partner_product"/);
  });

  it("PT4 (pending) add to plan from a partner tile writes the partner product id", { skip: PENDING }, () => {});
});
