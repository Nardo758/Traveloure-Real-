/**
 * BP-1 (ledger `2026-10-12-bp1-booking-path`): the ONE booking-path resolver, one test per branch plus
 * precedence and the concierge exclusions (placeholder, area title, past day, no named place).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveBookingPath, namesRealPlace, bookingControls, isBookingPath } from "../booking-path";

const base = { liveListing: false, partnerCoverage: null, title: "Nanzen-ji", city: "Kyoto" } as const;

test("BP1: a live platform listing ⇒ platform", () => {
  assert.equal(resolveBookingPath({ ...base, liveListing: true }), "platform");
});

test("BP2: platform outranks a partner that also covers the item", () => {
  assert.equal(resolveBookingPath({ ...base, liveListing: true, partnerCoverage: "liteapi_stay" }), "platform");
});

test("BP3: each structural partner rule ⇒ affiliate", () => {
  for (const kind of ["transport_pair", "liteapi_stay", "partner_product"] as const) {
    assert.equal(resolveBookingPath({ ...base, partnerCoverage: kind }), "affiliate", kind);
  }
});

test("BP4: a named real place with no listing and no partner ⇒ concierge", () => {
  assert.equal(resolveBookingPath({ ...base, title: "Dinner at Gion Karyo" }), "concierge");
  assert.equal(resolveBookingPath({ ...base, title: "Dinner", locationName: "Gion Karyo" }), "concierge");
});

test("BP5: an area title, a placeholder, a past day or no named place ⇒ none", () => {
  assert.equal(resolveBookingPath({ ...base, title: "Gion Walk" }), "none");
  assert.equal(resolveBookingPath({ ...base, title: "Fushimi Sake District" }), "none");
  assert.equal(resolveBookingPath({ ...base, title: "Arrival in Kyoto", placeholder: true }), "none");
  assert.equal(resolveBookingPath({ ...base, title: "Nanzen-ji", dayIsPast: true }), "none");
  assert.equal(resolveBookingPath({ ...base, title: "Kyoto" }), "none", "the city alone names no place");
  assert.equal(resolveBookingPath({ ...base, title: "" }), "none");
});

test("BP5b: a past day is none on EVERY path", () => {
  assert.equal(resolveBookingPath({ ...base, liveListing: true, dayIsPast: true }), "none");
  for (const kind of ["transport_pair", "liteapi_stay", "partner_product"] as const) {
    assert.equal(resolveBookingPath({ ...base, partnerCoverage: kind, dayIsPast: true }), "none", kind);
  }
});

test("BP6: a non-live listing falls through to the next rule", () => {
  // liveListing false is how the server reports an attached listing that is paused or unapproved.
  assert.equal(resolveBookingPath({ ...base, liveListing: false, partnerCoverage: "transport_pair" }), "affiliate");
  assert.equal(resolveBookingPath({ ...base, liveListing: false }), "concierge");
});

test("BP7: the controls each path draws", () => {
  assert.deepEqual(bookingControls("platform"), { primaryBook: true, bookForMe: true });
  assert.deepEqual(bookingControls("affiliate"), { primaryBook: true, bookForMe: true });
  assert.deepEqual(bookingControls("concierge"), { primaryBook: false, bookForMe: true });
  assert.deepEqual(bookingControls("none"), { primaryBook: false, bookForMe: false });
});

test("BP8: the vocabulary is closed", () => {
  for (const p of ["platform", "affiliate", "concierge", "none"]) assert.equal(isBookingPath(p), true);
  assert.equal(isBookingPath("partner_request"), false);
  assert.equal(namesRealPlace({ title: "Nanzen-ji", city: "Kyoto" }), true);
});
