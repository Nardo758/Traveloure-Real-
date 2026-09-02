/**
 * photo-provenance.test.ts — pure unit proof for the tier-1 reference-photo predicate
 * (ruling 2026-09-01-photo-tiers). No DB, no browser.
 *
 * NEGATIVES FIRST: an ATTRIBUTED REAL photo (an expert-curated upload on a non-stock host) and
 * the no-photo case must NEVER be labeled a reference — a false chip on a local's own photo is
 * the exact honesty inversion this lane exists to prevent. Then the positives: every stock/places
 * host, and the explicit `source` column, DO label.
 *
 * Run: npx tsx --test client/src/lib/__tests__/photo-provenance.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isStockPhotoUrl, isReferencePhoto } from "../photo-provenance";

// ── NEGATIVES FIRST ─────────────────────────────────────────────────────────────────────────────

test("N1: an attributed real upload on a non-stock host is NOT a reference", () => {
  const url = "https://cdn.traveloure.com/kyoto/hanamikoji-at-dusk.jpg";
  assert.equal(isStockPhotoUrl(url), false);
  assert.equal(isReferencePhoto({ url }), false);
});

test("N2: no image at all (null/undefined/empty) is never a reference — the gradient stands", () => {
  for (const url of [null, undefined, ""]) {
    assert.equal(isStockPhotoUrl(url), false);
    assert.equal(isReferencePhoto({ url }), false);
  }
});

test("N3: a non-stock host with a non-stock source stays unlabeled", () => {
  assert.equal(
    isReferencePhoto({ url: "https://cdn.traveloure.com/x.jpg", source: "expert_upload" }),
    false,
  );
});

// ── POSITIVES: every stock/places host labels ─────────────────────────────────────────────────

test("P1: Unsplash (bare and images. CDN) is a reference", () => {
  assert.equal(isStockPhotoUrl("https://images.unsplash.com/photo-123?w=800"), true);
  assert.equal(isStockPhotoUrl("https://unsplash.com/photos/abc"), true);
  assert.equal(isReferencePhoto({ url: "https://images.unsplash.com/photo-123?w=800" }), true);
});

test("P2: Pexels and Google (usercontent + apis) are references", () => {
  assert.equal(isStockPhotoUrl("https://images.pexels.com/photos/1/x.jpg"), true);
  assert.equal(isStockPhotoUrl("https://lh3.googleusercontent.com/place-photo"), true);
  assert.equal(isStockPhotoUrl("https://maps.googleapis.com/maps/api/place/photo?ref=x"), true);
});

// ── POSITIVES: the explicit source column ("OR the row's source says so") ─────────────────────

test("P3: an explicit stock source labels even when the URL host is inconclusive", () => {
  assert.equal(isReferencePhoto({ url: "https://example.com/proxy/img", source: "unsplash" }), true);
  assert.equal(isReferencePhoto({ url: "https://example.com/proxy/img", source: "google_places" }), true);
  assert.equal(isReferencePhoto({ url: null, source: "pexels" }), true);
});
