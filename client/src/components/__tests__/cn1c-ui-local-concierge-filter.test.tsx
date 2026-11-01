/**
 * CN-1c-UI (ledger `2026-11-01-cn1c-ui-local-concierge-filter`): the "Local concierge" filter on /services and the city
 * page, and the profile's two sections. What the server returns for each value is pinned by
 * `server/__tests__/cn1c-service-type-filter.db.test.ts` (#1826) and `server/__tests__/cn1c-ui-discover-service-type.db.test.ts`.
 *
 *   L1  the filter offers All / Trip planning / Local concierge; "Local concierge" is CN1_COPY.filter, never restated
 *   L2  /services: picking "Local concierge" sends serviceType=concierge to its read and keeps it in the URL; clearing
 *       sends no param and drops it from the URL
 *   L3  city page: the same two cases on GET /api/discover/location/:city (and on the theme read)
 *   L4  profile: an earner with both types gets two sections, each holding only its own type; one type gets one
 *   L5  an unknown type shows the server's own "Unknown service type."
 *   L6  the concierge empty line names the city
 *   L7  the new code and copy carry no ranking, "top", crowd, trending or superlative word and no traveler fee
 *
 * Run: npx tsx --test client/src/components/__tests__/cn1c-ui-local-concierge-filter.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { CN1_COPY } from "@shared/cn1-copy";
import { UNKNOWN_SERVICE_TYPE_MESSAGE } from "@shared/service-type-query";
import {
  SERVICE_TYPE_FILTER_CHOICES,
  SERVICE_TYPE_FILTER_COPY,
  SERVICE_TYPE_FILTER_PARAM,
  emptyConciergeLine,
  profileListingSections,
  profileSectionTitle,
  readFailureMessage,
  serviceTypeFromUrl,
  withServiceType,
} from "@/lib/service-type-filter";
import { ServiceTypeFilter } from "../service-type-filter";

(globalThis as any).React = React;

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

describe("CN-1c-UI Local concierge filter", () => {
  it("L1 offers three choices, and the concierge label is CN-1's approved key", () => {
    assert.deepEqual(
      SERVICE_TYPE_FILTER_CHOICES.map((c) => c.value),
      ["", "planning", "concierge"],
    );
    assert.equal(SERVICE_TYPE_FILTER_COPY.concierge, CN1_COPY.filter);
    assert.equal(CN1_COPY.filter, "Local concierge");
    const html = renderToString(<ServiceTypeFilter value="concierge" onChange={() => {}} />);
    assert.match(html, /data-testid="service-type-filter-concierge"[^>]*>Local concierge</);
    assert.match(html, /aria-pressed="true"[^>]*data-testid="service-type-filter-concierge"/);
    assert.match(html, /aria-pressed="false"[^>]*data-testid="service-type-filter-all"/);
    // The page never restates the literal.
    for (const file of ["client/src/lib/service-type-filter.ts", "client/src/components/service-type-filter.tsx", "client/src/pages/discover.tsx", "client/src/pages/discover-location.tsx", "client/src/pages/storefront.tsx"]) {
      assert.equal(read(file).includes('"Local concierge"'), false, file);
    }
  });

  it("L2 /services sends serviceType=concierge when picked, and nothing when cleared", () => {
    const picked = withServiceType(new URLSearchParams("q=tea&location=Kyoto"), "concierge");
    assert.equal(picked.get(SERVICE_TYPE_FILTER_PARAM), "concierge");
    assert.equal(picked.get("q"), "tea");
    const cleared = withServiceType(picked, "");
    assert.equal(cleared.has(SERVICE_TYPE_FILTER_PARAM), false);
    assert.equal(cleared.toString(), "q=tea&location=Kyoto");
    assert.equal(serviceTypeFromUrl("?serviceType=concierge"), "concierge");
    assert.equal(serviceTypeFromUrl("?serviceType=%20"), "");
    assert.equal(serviceTypeFromUrl(""), "");

    const page = read("client/src/pages/discover.tsx");
    const queryFn = page.slice(page.indexOf('"/api/discover",'), page.indexOf("fetch(`/api/discover?${params.toString()}`)"));
    assert.match(queryFn, /serviceType,\n/, "the filter is part of the query key");
    assert.match(queryFn, /if \(serviceType\) params\.set\(SERVICE_TYPE_FILTER_PARAM, serviceType\);/);
    assert.match(page, /setOrDelete\(SERVICE_TYPE_FILTER_PARAM, serviceType\);/, "the URL keeps the filter across a reload");
    assert.match(page, /useState\(\(\) => serviceTypeFromUrl\(urlParams\)\)/, "a reload reads the filter back");
    assert.match(page, /<ServiceTypeFilter\s+value=\{serviceType\}/);
  });

  it("L3 the city page sends the same param on its location read and on the theme read", () => {
    const page = read("client/src/pages/discover-location.tsx");
    assert.match(page, /queryKey: \["\/api\/discover\/location", city, country, serviceType\]/);
    const locationFn = page.slice(page.indexOf('queryKey: ["/api/discover/location"'), page.indexOf("enabled: !!city,"));
    assert.match(locationFn, /if \(serviceType\) qs\.set\(SERVICE_TYPE_FILTER_PARAM, serviceType\);/);
    assert.match(page, /const serviceType = serviceTypeFromUrl\(searchParams\);/);
    assert.match(page, /withServiceType\(new URLSearchParams\(searchString\), next\)/);
    const themeFn = page.slice(page.indexOf('"location-theme"'), page.indexOf("const servicesForFeed"));
    assert.match(themeFn, /if \(serviceType\) params\.set\(SERVICE_TYPE_FILTER_PARAM, serviceType\);/);
  });

  it("L4 the profile shows two sections only when both types exist, each with only its own type", () => {
    const rows = [
      { id: "a", serviceType: "concierge" },
      { id: "b", serviceType: "planning" },
      { id: "c", serviceType: null },
      { id: "d", serviceType: "concierge" },
    ];
    const both = profileListingSections(rows);
    assert.equal(both.length, 2);
    assert.equal(both[0].kind, "planning");
    assert.deepEqual(both[0].items.map((r) => r.id), ["b", "c"]);
    assert.equal(both[1].kind, "concierge");
    assert.deepEqual(both[1].items.map((r) => r.id), ["a", "d"], "server order kept");
    assert.equal(profileSectionTitle("concierge"), CN1_COPY.filter);
    assert.equal(profileSectionTitle("planning"), SERVICE_TYPE_FILTER_COPY.planning);

    for (const one of [[{ id: "x", serviceType: "planning" }], [{ id: "y", serviceType: "concierge" }]]) {
      const single = profileListingSections(one);
      assert.equal(single.length, 1);
      assert.equal(single[0].kind, null);
      assert.deepEqual(single[0].items, one);
    }

    const page = read("client/src/pages/storefront.tsx");
    assert.match(page, /const serviceSections = profileListingSections\(visibleServices\);/);
    assert.match(page, /data-testid=\{`storefront-section-\$\{section\.kind\}`\}/);
    assert.match(page, /title=\{profileSectionTitle\(section\.kind\)\}/);
  });

  it("L5 an unknown type shows the server's own message", async () => {
    const res = new Response(JSON.stringify({ message: UNKNOWN_SERVICE_TYPE_MESSAGE }), { status: 400 });
    assert.equal(await readFailureMessage(res, "fallback"), "Unknown service type.");
    assert.equal(await readFailureMessage(new Response("not json", { status: 500 }), "fallback"), "fallback");
    const html = renderToString(<ServiceTypeFilter value="best" onChange={() => {}} error="Unknown service type." />);
    assert.match(html, /data-testid="text-service-type-filter-error"[^>]*>Unknown service type\.</);
    assert.equal(read("client/src/lib/service-type-filter.ts").includes("Unknown service type."), false, "never restated");
  });

  it("L6 the concierge empty line names the city", () => {
    assert.equal(emptyConciergeLine("Kyoto"), "No local concierge listings in Kyoto yet.");
  });

  it("L7 no ranking, top, crowd, trending or superlative word and no traveler fee in the new code", () => {
    const banned = [/paypal/i, /traveler fee/i, /\bcrowd\b/i, /trending/i, /\bfounding\b/i, /\bbest\b/i, /\btop\b/i, /most popular/i, /\bpopular\b/i, /ranking/i, /ultimate/i, /#1/];
    for (const file of ["client/src/lib/service-type-filter.ts", "client/src/components/service-type-filter.tsx"]) {
      for (const literal of read(file).match(/"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g) ?? []) {
        for (const b of banned) assert.doesNotMatch(literal, b, `${file}: ${literal}`);
      }
    }
    for (const line of Object.values(SERVICE_TYPE_FILTER_COPY)) {
      for (const b of banned) assert.doesNotMatch(line, b, line);
    }
  });
});
