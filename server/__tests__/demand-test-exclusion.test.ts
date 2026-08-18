/**
 * R9 — pure unit test for the shared test-account exclusion predicate (no DB).
 * Run: tsx --test server/__tests__/demand-test-exclusion.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isTestAccountEmail, isSyntheticTrip, TEST_ACCOUNT_EMAIL_PATTERNS } from "../services/demand-test-exclusion";

test("R9: @traveloure.test emails are test accounts", () => {
  assert.equal(isTestAccountEmail("kyoto-interpreter@traveloure.test"), true);
  assert.equal(isTestAccountEmail("SEED@Traveloure.Test"), true, "case-insensitive");
  assert.equal(isTestAccountEmail("  seed@traveloure.test  "), true, "trimmed");
});

test("R9: real emails and absent emails are NOT test accounts (§13 — absence ≠ test)", () => {
  assert.equal(isTestAccountEmail("m.dixon5030@gmail.com"), false);
  assert.equal(isTestAccountEmail("someone@traveloure.com"), false, "the real domain is not .test");
  assert.equal(isTestAccountEmail(null), false);
  assert.equal(isTestAccountEmail(undefined), false);
  assert.equal(isTestAccountEmail(""), false);
});

test("R9: the pattern list is the single source of truth (exactly one entry, Q6d)", () => {
  assert.deepEqual([...TEST_ACCOUNT_EMAIL_PATTERNS], ["%@traveloure.test"]);
});

// ── R16: synthetic = test account OR authoring trip ──────────────────────────────────────────
test("R16: a test-account trip is synthetic", () => {
  assert.equal(isSyntheticTrip({ email: "seed@traveloure.test", authorId: null }), true);
});

test("R16: an authoring trip (author_id set) is synthetic even with a real/absent email", () => {
  assert.equal(isSyntheticTrip({ email: null, authorId: "expert-123" }), true);
  assert.equal(isSyntheticTrip({ email: "real@gmail.com", authorId: "expert-123" }), true);
});

test("R16: a real traveler trip (real/absent email, no author) is NOT synthetic", () => {
  assert.equal(isSyntheticTrip({ email: "traveler@gmail.com", authorId: null }), false);
  assert.equal(isSyntheticTrip({ email: null, authorId: null }), false, "§13 — absent email is real");
  assert.equal(isSyntheticTrip({}), false);
});
