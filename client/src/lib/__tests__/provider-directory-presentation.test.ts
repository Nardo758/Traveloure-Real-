/**
 * Pure unit proof for client/src/lib/provider-directory-presentation.ts.
 *
 * Negatives first: the risk in a rating/count formatter is always the same shape —
 * inventing a number the row didn't carry (a fabricated average, a phantom review),
 * so those are proven before the happy paths (§13).
 *
 * Run: npx tsx --test client/src/lib/__tests__/provider-directory-presentation.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatServiceCountLabel,
  formatProviderRating,
  providerInitials,
  matchesProviderSearch,
} from "../provider-directory-presentation";

// ── NEGATIVES ───────────────────────────────────────────────────────────────────────────

test("N1: reviewCount 0 never renders a rating, even if averageRating somehow arrived non-null", () => {
  assert.deepEqual(formatProviderRating(4.8, 0), { kind: "new" });
});

test("N2: a null average with a positive reviewCount still renders New (never guessed)", () => {
  assert.deepEqual(formatProviderRating(null, 3), { kind: "new" });
});

test("N3: an empty/whitespace search query matches everything (never an accidental empty result)", () => {
  assert.equal(matchesProviderSearch("", "Anyone", "anyone"), true);
  assert.equal(matchesProviderSearch("   ", "Anyone", "anyone"), true);
});

test("N4: a negative or non-finite serviceCount never renders a negative/NaN label", () => {
  assert.equal(formatServiceCountLabel(-4), "0 services");
  assert.equal(formatServiceCountLabel(Number.NaN), "0 services");
});

// ── HAPPY PATHS ─────────────────────────────────────────────────────────────────────────

test("formatServiceCountLabel singular vs plural", () => {
  assert.equal(formatServiceCountLabel(0), "0 services");
  assert.equal(formatServiceCountLabel(1), "1 service");
  assert.equal(formatServiceCountLabel(7), "7 services");
});

test("formatProviderRating renders a real rating + review count once reviewCount > 0", () => {
  assert.deepEqual(formatProviderRating(4.567, 12), {
    kind: "rated",
    ratingLabel: "4.6",
    reviewCountLabel: "(12)",
  });
});

test("providerInitials handles single-word, multi-word, and empty names", () => {
  assert.equal(providerInitials("Yuki Flowers"), "YF");
  assert.equal(providerInitials("Cher"), "CH");
  assert.equal(providerInitials("  "), "T");
  assert.equal(providerInitials("Ana María Torres"), "AT");
});

test("matchesProviderSearch is case-insensitive across name and handle", () => {
  assert.equal(matchesProviderSearch("yuki", "Yuki Flowers", "yukiflowers"), true);
  assert.equal(matchesProviderSearch("FLOWERS", "Yuki Flowers", "yukiflowers"), true);
  assert.equal(matchesProviderSearch("zzz", "Yuki Flowers", "yukiflowers"), false);
});
