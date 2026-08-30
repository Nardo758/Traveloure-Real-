/**
 * S10 (bundle composition, execution-map Gate G4) — pure unit tests for the bundle-component
 * link/label helpers (no DB, no browser). Pairs with the shared derivation test
 * (bundle-delivery-method.test.ts) and the server behavioural proof
 * (server/__tests__/bundle-component-linking.db.test.ts).
 *
 * NEGATIVES FIRST: an unavailable component must never produce a link or leak a detail field the
 * server didn't send — that absence IS the §13 fix.
 *
 * Run: npx tsx --test client/src/lib/__tests__/bundle-component-display.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bundleComponentHref,
  bundleComponentMethodLabel,
  formatDeliveryMethodLabel,
  type BundleComponentSummary,
} from "../bundle-component-display";

// ── NEGATIVES FIRST ─────────────────────────────────────────────────────────────────────────────

test("N1: an unavailable component never produces a link", () => {
  const component: BundleComponentSummary = { available: false, serviceName: "Hidden Walk" };
  assert.equal(bundleComponentHref(component), null);
});

test("N2: an unavailable component never shows a method chip, even if the shape were coerced", () => {
  const component: BundleComponentSummary = { available: false, serviceName: "Hidden Walk" };
  assert.equal(bundleComponentMethodLabel(component), null);
});

test("N3: a blank/whitespace method label formats to null, never an empty chip", () => {
  assert.equal(formatDeliveryMethodLabel(null), null);
  assert.equal(formatDeliveryMethodLabel(undefined), null);
  assert.equal(formatDeliveryMethodLabel(""), null);
  assert.equal(formatDeliveryMethodLabel("   "), null);
});

// ── Available components link and format correctly ─────────────────────────────────────────────

test("P1: an available component links to its own /services/:id page", () => {
  const component: BundleComponentSummary = {
    available: true,
    id: "svc-42",
    serviceName: "Tea Ceremony",
    shortDescription: null,
    deliveryMethod: "in_person",
    serviceImage: null,
  };
  assert.equal(bundleComponentHref(component), "/services/svc-42");
});

test("P2: the method chip label mirrors the top-level chip's underscore-to-space formatting", () => {
  assert.equal(formatDeliveryMethodLabel("in_person"), "in person");
  assert.equal(formatDeliveryMethodLabel("async_messaging"), "async messaging");
  const component: BundleComponentSummary = {
    available: true,
    id: "svc-1",
    serviceName: "Video Consult",
    shortDescription: null,
    deliveryMethod: "video",
    serviceImage: null,
  };
  assert.equal(bundleComponentMethodLabel(component), "video");
});

test("P3: a component with no delivery method renders no chip (null), never a blank one", () => {
  const component: BundleComponentSummary = {
    available: true,
    id: "svc-2",
    serviceName: "Mystery Add-on",
    shortDescription: null,
    deliveryMethod: null,
    serviceImage: null,
  };
  assert.equal(bundleComponentMethodLabel(component), null);
});

test("P4: ids with special characters still build a plain path (client Link resolves encoding)", () => {
  const component: BundleComponentSummary = {
    available: true,
    id: "svc with space",
    serviceName: "Odd Id",
    shortDescription: null,
    deliveryMethod: null,
    serviceImage: null,
  };
  assert.equal(bundleComponentHref(component), "/services/svc with space");
});
