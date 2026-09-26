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
  pickCartContentMeta,
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
