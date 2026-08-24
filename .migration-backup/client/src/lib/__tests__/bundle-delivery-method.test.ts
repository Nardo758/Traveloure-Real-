/**
 * S10 (bundle composition, execution-map Gate G4) — pure unit tests for the shared bundle
 * delivery-method derivation (shared/bundle-delivery-method.ts), the ONE predicate both
 * server/routes/provider.routes.ts (write time) and server/routes/content.routes.ts (read time)
 * import — see CLAUDE.md §18 rule 1 ("derivation delegates — never re-implements").
 *
 * Pins the exact behavior migration 208 (FP-1/B2) used to repair rows already on disk, so read
 * time and write time can never quietly diverge on what "derived" means.
 *
 * Run: npx tsx --test client/src/lib/__tests__/bundle-delivery-method.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveBundleDeliveryMethod,
  MIXED_BUNDLE_DELIVERY_METHOD,
} from "@shared/bundle-delivery-method";

// ── NEGATIVES FIRST ─────────────────────────────────────────────────────────────────────────────

test("N1: no components at all is NOT derivable — null, never guessed (§13)", () => {
  assert.equal(deriveBundleDeliveryMethod([]), null);
});

test("N2: components with no methods at all (all null/empty) is NOT derivable", () => {
  assert.equal(deriveBundleDeliveryMethod([null, undefined, "", "   "]), null);
});

test("N3: 'hybrid' is the canonical word — never a home-grown 'mixed' string", () => {
  assert.equal(MIXED_BUNDLE_DELIVERY_METHOD, "hybrid");
});

// ── Uniform components keep their shared method ─────────────────────────────────────────────────

test("P1: a single component's method is the derived method", () => {
  assert.equal(deriveBundleDeliveryMethod(["in_person"]), "in_person");
});

test("P2: every component agreeing keeps that one method", () => {
  assert.equal(deriveBundleDeliveryMethod(["in_person", "in_person", "in_person"]), "in_person");
  assert.equal(deriveBundleDeliveryMethod(["video", "video"]), "video");
});

test("P3: blank/null entries mixed among agreeing real values are ignored, not counted as a third method", () => {
  assert.equal(deriveBundleDeliveryMethod(["pdf", null, "pdf", ""]), "pdf");
});

// ── Disagreeing components derive 'hybrid' ──────────────────────────────────────────────────────

test("P4: two distinct methods derive 'hybrid'", () => {
  assert.equal(deriveBundleDeliveryMethod(["in_person", "video"]), "hybrid");
});

test("P5: three-or-more-way disagreement still collapses to the single word 'hybrid'", () => {
  assert.equal(deriveBundleDeliveryMethod(["pdf", "call", "voice_notes"]), "hybrid");
});

test("P6: whitespace-only variants of the same method still count as ONE method, not a mismatch", () => {
  assert.equal(deriveBundleDeliveryMethod([" in_person ", "in_person"]), "in_person");
});
