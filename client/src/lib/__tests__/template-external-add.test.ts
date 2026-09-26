/**
 * RC-9 (ledger `2026-09-26-rc9-external-cart-lines`): where an experience-template partner pick
 * goes, and how a reader recognises a content line. Pure.
 *   C1 hotel / activity / event ⇒ a cart CONTENT line keyed on the page's own id — with or without
 *      a plan (the plan-item body omits contentType/contentId, so the cart rail carries identity).
 *   C2 the content body carries NO price, and absent facts are omitted, never "".
 *   C3 every content body is one the server's admission would accept (types, id bound, meta keys).
 *   C4 an over-long id is refused, never truncated into a different id.
 *   T1 a priced platform transfer (`transport-platform-<id>`) ⇒ the ordinary SERVICE rail.
 *   T2 any other transfer id ⇒ refused by name (no silent client copy).
 *   P1 a place with a plan ⇒ a plain plan item (title + address), no cost, no invented type.
 *   P2 a place with no plan ⇒ refused with a sentence.
 *   K1 no kind ⇒ refused (a kind is never guessed from an id prefix).
 *   I1 the page's id for a server row: service id, `custom-<id>`, content id; null otherwise.
 *   L1 ONE content-line predicate: the enriched flag, or both contentId AND contentType.
 * Ledger `2026-09-26-partner-picks-map-coords` (a pick's own coordinates, display only):
 *   G1 admission keeps a valid pair as normalized strings (numbers or plain decimal strings).
 *   G2 a HALF pair drops BOTH halves.
 *   G3 an out-of-range half drops BOTH halves.
 *   G4 a non-numeric / non-finite / blank / exponent half drops BOTH halves.
 *   G5 absent stays absent — no key is invented, and text keys are unaffected.
 *   G6 the reader returns numbers for a valid stored pair and null for anything else.
 *   G7 the builder carries coords ONLY when the pick states a valid pair, and its body still
 *      passes the server's admission unchanged; a place never carries one.
 * Run: npx tsx --test client/src/lib/__tests__/template-external-add.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveTemplateExternalAdd,
  templateCartLineId,
  TEMPLATE_EXTERNAL_REFUSAL_COPY,
} from "../template-external-add";
import {
  CART_CONTENT_META_KEYS,
  isAdmissibleContentId,
  isCartContentType,
  isContentCartLine,
  normalizeCartContentCoordinates,
  pickCartContentMeta,
  readCartContentCoordinates,
} from "@shared/cart-content-line";

test("C1: hotel/activity/event take the content line with or without a plan", () => {
  for (const [kind, id] of [["hotel", "hotel-H1"], ["activity", "activity-P9"], ["event", "event-42"]] as const) {
    for (const targetTripId of [null, "trip-1"]) {
      const r = resolveTemplateExternalAdd({ id, name: "N", externalKind: kind }, { city: "Kyoto", targetTripId });
      assert.equal(r.rail, "content");
      if (r.rail !== "content") return;
      assert.equal(r.body.contentType, kind);
      assert.equal(r.body.contentId, id);
    }
  }
});

test("C2: no price in the body; absent facts omitted", () => {
  const r = resolveTemplateExternalAdd({ id: "hotel-H1", name: "Inn", details: "  " , externalKind: "hotel" }, { city: "" });
  assert.equal(r.rail, "content");
  if (r.rail !== "content") return;
  assert.deepEqual(r.body.contentMeta, { name: "Inn" });
  assert.ok(!("price" in (r.body as Record<string, unknown>)));
  assert.ok(!("price" in r.body.contentMeta));
  const full = resolveTemplateExternalAdd({ id: "event-1", name: "Show", details: "2h", externalKind: "event" }, { city: "Lisbon" });
  assert.equal(full.rail, "content");
  if (full.rail !== "content") return;
  assert.deepEqual(full.body.contentMeta, { name: "Show", description: "2h", city: "Lisbon" });
});

test("C3: every content body passes the server's admission unchanged", () => {
  const r = resolveTemplateExternalAdd({ id: "activity-X", name: "Tour", details: "3h", externalKind: "activity" }, { city: "Rome" });
  assert.equal(r.rail, "content");
  if (r.rail !== "content") return;
  assert.ok(isCartContentType(r.body.contentType));
  assert.ok(isAdmissibleContentId(r.body.contentId));
  for (const k of Object.keys(r.body.contentMeta)) assert.ok((CART_CONTENT_META_KEYS as readonly string[]).includes(k));
  assert.deepEqual(pickCartContentMeta(r.body.contentMeta), r.body.contentMeta);
});

test("C4: an over-long id is refused, never truncated", () => {
  const r = resolveTemplateExternalAdd({ id: "hotel-" + "x".repeat(300), name: "N", externalKind: "hotel" }, {});
  assert.equal(r.rail, "refused");
  if (r.rail !== "refused") return;
  assert.equal(r.reason, "id_too_long");
});

test("T1/T2: platform transfer ⇒ service rail; any other transfer ⇒ refused", () => {
  const svc = resolveTemplateExternalAdd({ id: "transport-platform-abc-123", name: "Driver", externalKind: "transfer" }, {});
  assert.deepEqual(svc, { rail: "service", serviceId: "abc-123" });
  for (const id of ["transport-airport-to-hotel-1700000000000", "transport-affiliate-12go", "transport-platform-"]) {
    const r = resolveTemplateExternalAdd({ id, name: "X", externalKind: "transfer" }, { targetTripId: "t" });
    assert.equal(r.rail, "refused");
    if (r.rail !== "refused") return;
    assert.equal(r.reason, "unrepresentable_transfer");
    assert.equal(r.message, TEMPLATE_EXTERNAL_REFUSAL_COPY.unrepresentable_transfer);
  }
});

test("P1/P2: a place lands on the plan or is refused", () => {
  const onPlan = resolveTemplateExternalAdd({ id: "ChIJ1", name: "Hall", details: "1 Main St", externalKind: "place" }, { targetTripId: "trip-9" });
  assert.deepEqual(onPlan, { rail: "plan_item", body: { title: "Hall", locationName: "1 Main St" } });
  const noAddress = resolveTemplateExternalAdd({ id: "ChIJ1", name: "Hall", externalKind: "place" }, { targetTripId: "trip-9" });
  assert.deepEqual(noAddress, { rail: "plan_item", body: { title: "Hall" } });
  const noPlan = resolveTemplateExternalAdd({ id: "ChIJ1", name: "Hall", externalKind: "place" }, { targetTripId: null });
  assert.equal(noPlan.rail, "refused");
  if (noPlan.rail !== "refused") return;
  assert.equal(noPlan.reason, "no_plan_for_place");
});

test("K1: no kind is refused, even with a familiar id prefix", () => {
  const r = resolveTemplateExternalAdd({ id: "hotel-H1", name: "N" }, { targetTripId: "t" });
  assert.equal(r.rail, "refused");
  if (r.rail !== "refused") return;
  assert.equal(r.reason, "unknown_kind");
});

test("I1: the page's id for a server row", () => {
  assert.equal(templateCartLineId({ serviceId: "s1" }), "s1");
  assert.equal(templateCartLineId({ serviceId: null, customVenueId: "v1" }), "custom-v1");
  assert.equal(templateCartLineId({ serviceId: null, customVenueId: null, contentId: "event-42" }), "event-42");
  assert.equal(templateCartLineId({ serviceId: null }), null);
});

test("L1: one content-line predicate", () => {
  assert.equal(isContentCartLine({ isContentItem: true }), true);
  assert.equal(isContentCartLine({ contentId: "a", contentType: "hotel" }), true);
  assert.equal(isContentCartLine({ contentId: "a", contentType: null }), false);
  assert.equal(isContentCartLine({ contentId: null, contentType: "hotel" }), false);
  assert.equal(isContentCartLine({}), false);
  assert.equal(pickCartContentMeta("nope"), undefined);
  assert.deepEqual(pickCartContentMeta({ name: "x", price: "99", city: "", imageUrl: 5 }), { name: "x" });
});

test("G1: admission keeps a valid pair as normalized strings", () => {
  assert.deepEqual(pickCartContentMeta({ name: "Inn", lat: 35.0116, lng: 135.7681 }), {
    name: "Inn",
    lat: "35.0116",
    lng: "135.7681",
  });
  assert.deepEqual(pickCartContentMeta({ name: "Inn", lat: "35.01160", lng: " -0.1276 " }), {
    name: "Inn",
    lat: "35.0116",
    lng: "-0.1276",
  });
  // Precision is capped at the item column's 7 decimals.
  assert.deepEqual(normalizeCartContentCoordinates(1.123456789, 2), { lat: "1.1234568", lng: "2" });
  // The range ends are inclusive.
  assert.deepEqual(normalizeCartContentCoordinates(-90, 180), { lat: "-90", lng: "180" });
  assert.deepEqual(normalizeCartContentCoordinates(-0, 0), { lat: "0", lng: "0" });
});

test("G2: a half pair drops both halves", () => {
  assert.deepEqual(pickCartContentMeta({ name: "Inn", lat: 35 }), { name: "Inn" });
  assert.deepEqual(pickCartContentMeta({ name: "Inn", lng: 135 }), { name: "Inn" });
  assert.equal(normalizeCartContentCoordinates(35, undefined), null);
  assert.equal(normalizeCartContentCoordinates(null, 135), null);
});

test("G3: an out-of-range half drops both halves", () => {
  assert.deepEqual(pickCartContentMeta({ name: "Inn", lat: 90.0001, lng: 10 }), { name: "Inn" });
  assert.deepEqual(pickCartContentMeta({ name: "Inn", lat: 10, lng: -180.5 }), { name: "Inn" });
  assert.equal(normalizeCartContentCoordinates(-91, 0), null);
  assert.equal(normalizeCartContentCoordinates(0, 181), null);
});

test("G4: a non-numeric half drops both halves", () => {
  const bads: unknown[] = ["", "  ", "abc", "1e2", "0x10", "12,5", NaN, Infinity, -Infinity, true, {}, []];
  for (const bad of bads) {
    assert.deepEqual(pickCartContentMeta({ name: "Inn", lat: bad, lng: 10 }), { name: "Inn" }, String(bad));
    assert.deepEqual(pickCartContentMeta({ name: "Inn", lat: 10, lng: bad }), { name: "Inn" }, String(bad));
  }
});

test("G5: absent stays absent", () => {
  assert.deepEqual(pickCartContentMeta({ name: "Inn", city: "Kyoto" }), { name: "Inn", city: "Kyoto" });
  assert.deepEqual(pickCartContentMeta({}), {});
  assert.ok((CART_CONTENT_META_KEYS as readonly string[]).includes("lat"));
  assert.ok((CART_CONTENT_META_KEYS as readonly string[]).includes("lng"));
});

test("G6: the reader returns numbers for a valid stored pair, null otherwise", () => {
  assert.deepEqual(readCartContentCoordinates({ name: "Inn", lat: "35.0116", lng: "135.7681" }), {
    lat: 35.0116,
    lng: 135.7681,
  });
  assert.equal(readCartContentCoordinates({ name: "Inn" }), null);
  assert.equal(readCartContentCoordinates({ lat: "35" }), null);
  assert.equal(readCartContentCoordinates({ lat: "95", lng: "0" }), null);
  assert.equal(readCartContentCoordinates(null), null);
  assert.equal(readCartContentCoordinates(undefined), null);
  assert.equal(readCartContentCoordinates("35,135"), null);
});

test("G7: the builder carries coords only when the pick states a valid pair", () => {
  for (const kind of ["hotel", "activity", "event"] as const) {
    const located = resolveTemplateExternalAdd(
      { id: `${kind}-1`, name: "N", externalKind: kind, coordinates: { lat: 35.0116, lng: 135.7681 } },
      { city: "Kyoto" },
    );
    assert.equal(located.rail, "content");
    if (located.rail !== "content") return;
    assert.equal(located.body.contentMeta.lat, "35.0116");
    assert.equal(located.body.contentMeta.lng, "135.7681");
    // Still exactly what the server's admission keeps.
    assert.deepEqual(pickCartContentMeta(located.body.contentMeta), located.body.contentMeta);

    for (const coordinates of [undefined, null, { lat: 95, lng: 10 }, { lat: NaN, lng: 10 }]) {
      const r = resolveTemplateExternalAdd({ id: `${kind}-2`, name: "N", externalKind: kind, coordinates }, { city: "Kyoto" });
      assert.equal(r.rail, "content");
      if (r.rail !== "content") return;
      assert.ok(!("lat" in r.body.contentMeta), JSON.stringify(coordinates));
      assert.ok(!("lng" in r.body.contentMeta), JSON.stringify(coordinates));
    }
  }
  const place = resolveTemplateExternalAdd(
    { id: "place-1", name: "Hall", details: "1 Main St", externalKind: "place", coordinates: { lat: 1, lng: 2 } },
    { targetTripId: "trip-1" },
  );
  assert.equal(place.rail, "plan_item");
  if (place.rail !== "plan_item") return;
  assert.deepEqual(place.body, { title: "Hall", locationName: "1 Main St" });
});
