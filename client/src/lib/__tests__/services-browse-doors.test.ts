/**
 * DOORS PASS THE TRIP ID — the services-browse URL contract, and D15's return address.
 *
 * Lane L22, ledger `2026-09-07-doors-pass-tripid`; Console & AI Concierge brief §11.3 row L22,
 * findings F6/F9; CLAUDE.md Locked Decision 42 **D13** and **D15**, Locked Decision 39,
 * Locked Decision 40, §13, §18 rule 1.
 *
 * WHY THIS EXISTS. Both halves of this lane fail SILENTLY and look correct on screen.
 *  · A browse door that drops the `tripId` renders a perfectly ordinary browse; the traveler's
 *    Add to plan then lands in the trip-less guest cart instead of on their plan (LD 39 rail), and
 *    nothing errors, 404s or logs.
 *  · A door that carries a `location` the page spells differently renders an UNFILTERED browse —
 *    the failure nobody notices, and exactly why the URL contract is one module both ends import.
 *
 *   B1  the builder carries every field a door holds, under the names the browse reads.
 *   B2  §13 — a field that trims to nothing is DROPPED, never sent as an empty or placeholder
 *       param. An absent param is how the browse is told "not known".
 *   B3  the role-chip and slip-rail helpers DELEGATE to the one builder; their existing output is
 *       byte-for-byte unchanged, so no pinned caller moved.
 *   B4  `UpsellSlot` passes the plan it is standing on — the F6/F9 defect, asserted at the source.
 *   B5  the storefront door carries D15's return address, addressed by HANDLE (LD 40), and passes
 *       NOTHING when the earner has claimed none.
 *   B6  the `local` finish reads that return address through the ONE earner-path resolver, and
 *       falls through to today's browse for every other case.
 *
 * Pure unit: no DOM, no DB, no fetch, no React.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildServicesBrowseHref,
  servicesBrowseHref,
  SERVICES_BROWSE_CATEGORY_PARAM,
  SERVICES_BROWSE_TRIP_PARAM,
  SERVICES_BROWSE_LOCATION_PARAM,
  SERVICES_BROWSE_UPSELL_SOURCE_PARAM,
} from "../services-browse";
import { slipBrowseServicesHref } from "../slip-rail";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("B1 the builder carries every field, under the names the browse reads", () => {
  const href = buildServicesBrowseHref({
    categoryKey: "florist",
    tripId: "trip-1",
    location: "Kyoto, Japan",
    upsellSource: "plancard_pretrip",
  });
  const url = new URL(href, "https://example.test");
  assert.equal(url.pathname, "/services");
  assert.equal(url.searchParams.get(SERVICES_BROWSE_CATEGORY_PARAM), "florist");
  assert.equal(url.searchParams.get(SERVICES_BROWSE_TRIP_PARAM), "trip-1");
  assert.equal(url.searchParams.get(SERVICES_BROWSE_LOCATION_PARAM), "Kyoto, Japan");
  assert.equal(url.searchParams.get(SERVICES_BROWSE_UPSELL_SOURCE_PARAM), "plancard_pretrip");
});

test("B2 §13 — an absent, blank or non-string field is DROPPED, never sent as a placeholder", () => {
  assert.equal(buildServicesBrowseHref({}), "/services", "nothing held ⇒ the plain browse");
  assert.equal(
    buildServicesBrowseHref({ tripId: "", location: "   ", categoryKey: null }),
    "/services",
    "an empty tripId is a handoff to a plan nobody named; an empty location is a city nobody chose",
  );
  assert.equal(
    buildServicesBrowseHref({ tripId: "trip-1", location: undefined }),
    "/services?tripId=trip-1",
    "one known field rides alone",
  );
  assert.equal(
    buildServicesBrowseHref({ categoryKey: "florist", tripId: 42 as unknown as string }),
    "/services?categoryKey=florist",
    "a non-string is not a value",
  );
});

test("B3 the two named helpers DELEGATE, and their output is unchanged", () => {
  // The role-chip shape (slip event header, and now Discover's plan strip).
  assert.equal(servicesBrowseHref("florist", "trip-1"), "/services?categoryKey=florist&tripId=trip-1");
  assert.equal(servicesBrowseHref("florist", null), "/services?categoryKey=florist");
  // The slip rail's "Browse services for this trip" — the door the contract was written for.
  assert.equal(slipBrowseServicesHref("trip-1", "Kyoto"), "/services?tripId=trip-1&location=Kyoto");
  assert.equal(slipBrowseServicesHref("trip-1", "  "), "/services?tripId=trip-1");
  assert.equal(slipBrowseServicesHref("trip-1", null), "/services?tripId=trip-1");
  // Encoding is the builder's, and it is the same encoding the hand-assembled version produced.
  assert.equal(
    slipBrowseServicesHref("trip 1", "Kyoto, Japan"),
    "/services?tripId=trip+1&location=Kyoto%2C+Japan",
  );
});

test("B4 UpsellSlot passes the plan it is standing on (F6/F9)", () => {
  const src = read("../../components/UpsellSlot.tsx");
  assert.match(src, /buildServicesBrowseHref\(\{/, "the ONE builder, not a hand-assembled URL");
  assert.match(src, /tripId,/, "the id it already fetches its own candidates with");
  assert.match(src, /location: destination,/, "the plan's own city, so the browse is not the whole world");
  assert.ok(
    !/`\/services\?categoryKey=\$\{/.test(src),
    "the hand-assembled navigation is GONE, not left beside its replacement",
  );
  // The prop is optional, so the cart and checkout slots — which hold neither — pass neither (§13).
  const plancard = read("../../components/plancard/PlanCardUpsellSlot.tsx");
  assert.match(plancard, /destination\?: string \| null;/);
  assert.match(plancard, /destination=\{destination\}/);
});

test("B5 the storefront door carries D15's return address, by HANDLE, or nothing", () => {
  const src = read("../../pages/storefront.tsx");
  assert.match(
    src,
    /returnTo: \{ kind: "expert", handle: String\(earner\.handle\) \}/,
    "addressed by handle — LD 40: users.id is internal and is never a public address",
  );
  assert.match(
    src,
    /earner\.handle\s*\?[\s\S]{0,160}: undefined/,
    "§13: an earner with no claimed handle passes NOTHING rather than a bare id",
  );
  assert.ok(
    !/returnTo:[^}]*earner\.id/.test(src),
    "a users.id must never reach the return address (LD 40)",
  );
});

test("B6 the `local` finish reads the return address through the ONE earner-path resolver", () => {
  const src = read("../../contexts/PlanningContext.tsx");
  assert.match(src, /source\?\.returnTo\?\.kind === "expert"/);
  assert.match(
    src,
    /earnerProfilePath\(\{ handle: source\.returnTo\.handle \}\)/,
    "§18 rule 1 — a second `/s/${handle}` written here would drift from the one resolver",
  );
  // The fallthrough is verbatim what it was: only a door that NAMED an expert is diverted.
  assert.match(src, /\/experts\?destination=\$\{encodeURIComponent\(dest\)\}/);
});
