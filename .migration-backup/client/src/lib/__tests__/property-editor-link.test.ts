/**
 * FP-3 — property/room Edit routing pin (pure unit; no DB, no browser).
 *
 * Ratified design (service-creation redesign mock): "a property room's Edit opens its property's
 * editor at the Rooms step — a room has no service checklist/delivery-method of its own, and
 * sending it into the generic ServiceForm is a dishonest surface."
 *
 * This pins the ONE module both consumers use — Catalog's card/preview/pin-chip Edit affordances
 * (client/src/pages/provider/services.tsx) and the ServiceForm back-door guard
 * (client/src/components/ServiceForm.tsx) — so the two can never disagree about which rows leave
 * the questionnaire. NEGATIVES FIRST: an ordinary listing must keep its ServiceForm route, or
 * this guard would break every normal edit on the console.
 *
 * Run: npx tsx --test client/src/lib/__tests__/property-editor-link.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bundleEditorHref,
  isPropertyEditorShape,
  isPropertyRoom,
  listingEditHref,
  propertyEditorHref,
} from "../property-editor-link";

// ── NEGATIVES FIRST — the guard must not swallow ordinary listings ─────────────────────────────

test("N1: an ordinary service (no productShape) keeps its ServiceForm edit route", () => {
  assert.equal(isPropertyEditorShape(null), false);
  assert.equal(isPropertyEditorShape(undefined), false);
  assert.equal(propertyEditorHref({ id: "svc-1", productShape: null }), null);
  assert.equal(listingEditHref({ id: "svc-1", productShape: null }), "/provider/services/svc-1/edit");
});

test("N2: every canonical delivery-method listing shape keeps the ServiceForm route", () => {
  // A row's deliveryMethod is NOT its productShape — an in_person service must never be caught
  // by a predicate meant for accommodation rows (rooms are in_person since FP-1/B2).
  for (const shape of ["bundle", "", "properties", "room", "property_rooms", "PROPERTY"]) {
    assert.equal(isPropertyEditorShape(shape), false, `${shape} must not resolve to the property editor`);
  }
  // A bundle leaves the ServiceForm too, but for the BUNDLE builder — see B1/B2 below.
  assert.equal(listingEditHref({ id: "b-1", productShape: "bundle" }), "/provider/workstation?bundle=b-1");
});

// ── FP-2 / Package A item 7 — the bundle Edit link carries the bundle id ───────────────────────
// It used to resolve to a bare `/provider/workstation`: the right page with the identity dropped,
// so the provider landed on a list of every bundle they own and had to find the one they had just
// clicked. Same `?param=` convention as the property editor above.

test("B1: a bundle's Edit carries its id to the Workstation builder", () => {
  assert.equal(bundleEditorHref({ id: "bundle-7", productShape: "bundle" }), "/provider/workstation?bundle=bundle-7");
  assert.equal(listingEditHref({ id: "bundle-7", productShape: "bundle" }), "/provider/workstation?bundle=bundle-7");
});

test("B2 (negative): only a bundle row gets the bundle link, and the id is encoded", () => {
  assert.equal(bundleEditorHref({ id: "svc-1", productShape: null }), null);
  assert.equal(bundleEditorHref({ id: "prop-4", productShape: "property" }), null);
  assert.equal(bundleEditorHref({ id: "room-9", productShape: "property_room" }), null);
  // A property row must keep the PROPERTY link even though both live on the Workstation.
  assert.equal(listingEditHref({ id: "prop-4", productShape: "property" }), "/provider/workstation?property=prop-4");
  // Ids reach the URL encoded — the link is built, never concatenated blindly.
  assert.equal(
    bundleEditorHref({ id: "a b&c", productShape: "bundle" }),
    "/provider/workstation?bundle=a%20b%26c",
  );
});

// ── The ratified routing ───────────────────────────────────────────────────────────────────────

test("P1: a property_room's Edit opens its PROPERTY's editor, with the room in focus", () => {
  const href = propertyEditorHref({ id: "room-9", productShape: "property_room", parentServiceId: "prop-4" });
  assert.equal(href, "/provider/workstation?property=prop-4&room=room-9");
  // The room id is carried, so the editor can open at the Rooms step on THAT room — never a
  // /provider/services/room-9/edit questionnaire.
  assert.ok(!href!.includes("/provider/services/"));
  assert.equal(listingEditHref({ id: "room-9", productShape: "property_room", parentServiceId: "prop-4" }), href);
});

test("P2: a property's Edit opens the same editor at its basics", () => {
  assert.equal(
    propertyEditorHref({ id: "prop-4", productShape: "property" }),
    "/provider/workstation?property=prop-4",
  );
  // No room param ⇒ the editor opens on Basics, not the Rooms step.
  assert.ok(!propertyEditorHref({ id: "prop-4", productShape: "property" })!.includes("room="));
});

test("P3 (§13): a room with no parentServiceId is NOT given a guessed parent", () => {
  const href = propertyEditorHref({ id: "room-9", productShape: "property_room", parentServiceId: null });
  assert.equal(href, "/provider/workstation?room=room-9");
  assert.ok(!href!.includes("property="), "no invented parent id may ride the link");
  assert.equal(isPropertyRoom("property_room"), true);
  assert.equal(isPropertyRoom("property"), false);
});

test("P4: ids are URL-encoded, so a crafted id cannot inject a second query param", () => {
  const href = propertyEditorHref({
    id: "a&property=other",
    productShape: "property_room",
    parentServiceId: "prop-4",
  });
  assert.equal(href, "/provider/workstation?property=prop-4&room=a%26property%3Dother");
  // Exactly two params — the injected `property=other` did not become a third.
  const params = new URLSearchParams(href!.split("?")[1]);
  assert.deepEqual([...params.keys()], ["property", "room"]);
  assert.equal(params.get("property"), "prop-4");
});
