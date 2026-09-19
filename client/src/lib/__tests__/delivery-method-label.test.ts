/**
 * E1 (cosmetic-public-surfaces dispatch) — pure unit tests for the delivery-method humanizer
 * (no DB, no browser).
 *
 * Run: npx tsx --test client/src/lib/__tests__/delivery-method-label.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { deliveryMethodLabel } from "../delivery-method-label";

test("humanizes every canonical deliveryMethodEnum value (shared/schema.ts — the 7)", () => {
  assert.equal(deliveryMethodLabel("pdf"), "PDF guide");
  assert.equal(deliveryMethodLabel("video"), "Video call");
  assert.equal(deliveryMethodLabel("call"), "Phone call");
  assert.equal(deliveryMethodLabel("in_person"), "In-person");
  assert.equal(deliveryMethodLabel("voice_notes"), "Voice notes");
  assert.equal(deliveryMethodLabel("async_messaging"), "Messaging");
  assert.equal(deliveryMethodLabel("hybrid"), "Hybrid");
});

test("never guesses a label for null, undefined, empty or an unrecognized token (§13)", () => {
  assert.equal(deliveryMethodLabel(null), null);
  assert.equal(deliveryMethodLabel(undefined), null);
  assert.equal(deliveryMethodLabel(""), null);
  assert.equal(deliveryMethodLabel("document"), null); // retired pre-canonical value — never shown as a label
  assert.equal(deliveryMethodLabel("digital"), null); // ditto
});
