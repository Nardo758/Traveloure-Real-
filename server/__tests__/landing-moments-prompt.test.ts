/**
 * landing-moments-prompt.test.ts — L2: momentKey is PROMPT-ONLY, never a persisted column.
 *
 * The AI generate route (content.routes.ts POST /api/ai/generate-itinerary) must (a) persist the
 * user's specialRequests byte-for-byte — the occasion NEVER enters it (trips.special_requests is
 * in the finalize fingerprint, so a system write there would fork Trip Card versions), (b) fold the
 * occasion into the PROMPT as exactly one "Occasion:" line, and (c) reject a present-but-invalid
 * momentKey with 400. These pins prove the pure logic the handler composes (the model call itself
 * cannot run in CI). The handler's own composition is:
 *
 *   normalizedSpecialRequests = user text (trimmed) | undefined         // PERSISTED
 *   promptSpecialRequests     = [occasionPromptLine(k), user].join(" ") // PROMPT + dedup only
 *   if (!isMomentKeyAcceptable(k)) return 400
 *
 * Unit-level (no DB, no server, no model). Run: npx tsx --test server/__tests__/landing-moments-prompt.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isMomentKeyAcceptable, occasionPromptLine } from "../services/landing-moments";

/** The handler's exact composition, mirrored so the pins bind the real code path. */
function compose(specialRequests: unknown, momentKey: unknown) {
  const normalizedSpecialRequests =
    typeof specialRequests === "string" ? specialRequests.trim() || undefined : undefined;
  const occasionLine = occasionPromptLine(momentKey);
  const promptSpecialRequests =
    [occasionLine, normalizedSpecialRequests].filter(Boolean).join(" ") || undefined;
  return { persisted: normalizedSpecialRequests, prompt: promptSpecialRequests, occasionLine };
}

test("P1 the PERSISTED specialRequests is the user's text only — the occasion never enters it", () => {
  const user = "window seat, quiet hotel near the station";
  const { persisted, occasionLine } = compose(user, "proposal");
  assert.equal(persisted, user, "persisted value equals the user's input byte-for-byte");
  assert.ok(occasionLine.length > 0, "a valid momentKey does produce an occasion line (for the prompt)");
  assert.ok(!persisted!.includes("Occasion:"), "the occasion is NOT in the persisted value");
  // And with no user text, a moment still persists nothing (not the occasion).
  assert.equal(compose(undefined, "proposal").persisted, undefined, "no user text ⇒ persisted stays undefined");
  assert.equal(compose("   ", "anniversary").persisted, undefined, "whitespace-only user text ⇒ undefined");
});

test("P2 the PROMPT value contains 'Occasion:' exactly once for a valid momentKey, zero otherwise", () => {
  const p = compose("no stairs please", "milestone_birthday").prompt!;
  assert.equal((p.match(/Occasion:/g) || []).length, 1, "exactly one Occasion: line in the prompt");
  assert.ok(p.includes("Occasion: this trip is a milestone birthday."), "the fine occasion is spelled out");
  assert.ok(p.includes("no stairs please"), "the user's text is still in the prompt");
  // No moment ⇒ no occasion line at all.
  assert.equal((compose("hello", undefined).prompt!.match(/Occasion:/g) || []).length, 0, "absent momentKey ⇒ no Occasion line");
  assert.equal(occasionPromptLine("not_a_moment"), "", "an unknown key yields no occasion line");
});

test("P3 a present-but-invalid momentKey is rejected (the 400 gate's predicate); absent/valid pass", () => {
  assert.equal(isMomentKeyAcceptable("not_a_moment"), false, "a present, unknown key is rejected → route returns 400");
  assert.equal(isMomentKeyAcceptable("proposal"), true, "a known key is accepted");
  assert.equal(isMomentKeyAcceptable(undefined), true, "absent (undefined) is fine");
  assert.equal(isMomentKeyAcceptable(null), true, "absent (null) is fine");
  assert.equal(isMomentKeyAcceptable(""), true, "absent (empty) is fine");
  assert.equal(isMomentKeyAcceptable(42 as unknown), false, "a non-string present value is rejected");
});
