import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import {
  buildItineraryOutcomeEmail, generationNoticeKey, resolveGenerationOutcome, GENERATION_TIMEOUT_MS,
  canQueueGenerationNotice,
} from "../itinerary-outcome-email";

for (let loop = 1; loop <= 2; loop++) {
  test(`varied ready/failed loop ${loop}: boundaries and independent itineraries`, () => {
    const start = new Date(Date.now() - Math.floor(Math.random() * 86400000));
    const first = randomUUID();
    const second = randomUUID();
    assert.deepEqual(resolveGenerationOutcome("ready", start, new Date(start.getTime() + GENERATION_TIMEOUT_MS)), { outcome: "ready" });
    for (const delay of [GENERATION_TIMEOUT_MS + 1, GENERATION_TIMEOUT_MS + 60000, GENERATION_TIMEOUT_MS + 900000]) {
      assert.deepEqual(resolveGenerationOutcome("ready", start, new Date(start.getTime() + delay)), { outcome: "failed", reason: "timeout" });
    }
    for (const delay of [0, Math.floor(Math.random() * 60000), GENERATION_TIMEOUT_MS]) {
      assert.deepEqual(resolveGenerationOutcome("failed", start, new Date(start.getTime() + delay)), { outcome: "failed", reason: "error" });
    }
    assert.notEqual(generationNoticeKey(first, "ready", start), generationNoticeKey(second, "ready", start));
    assert.equal(generationNoticeKey(first, "ready", start), generationNoticeKey(first, "ready", new Date(start.getTime() + 60000)));
    assert.notEqual(generationNoticeKey(first, "failed", start), generationNoticeKey(first, "failed", new Date(start.getTime() + 60000)));
  });
}

test("ready/error/timeout copy escapes persisted content and links to the actual comparison route", () => {
  for (const outcome of ["ready", "failed"] as const) {
    for (const reason of ["error", "timeout"] as const) {
      const message = buildItineraryOutcomeEmail({
        comparisonId: 'a/b"<', outcome, reason, firstName: "<script>alert(1)</script>",
        destination: "<img src=x onerror=alert(1)>", baseUrl: "https://app.example.test",
      });
      assert.ok(message.html.includes("/itinerary-comparison/a%2Fb%22%3C"));
      assert.ok(!message.html.includes("<script>"));
      assert.ok(!message.html.includes("<img"));
      assert.ok(!/\b(credits?|refund|free retry)\b/i.test(message.text));
      assert.ok(message.html.includes("&lt;script&gt;"));
    }
  }
});

test("missing personalization is not fabricated", () => {
  const message = buildItineraryOutcomeEmail({
    comparisonId: "real-id", outcome: "ready", baseUrl: "https://app.example.test",
  });
  assert.ok(message.text.includes("\n\nHi,\n\nYour itinerary is ready"));
  assert.ok(!message.text.includes("undefined"));
});

test("development recipient guard rejects absent/placeholder/unapproved inboxes without changing production eligibility", () => {
  const email = "approved@example.test";
  assert.equal(canQueueGenerationNotice(email, "development", ""), false);
  assert.equal(canQueueGenerationNotice(email, "development", "[paste your real email address here]"), false);
  assert.equal(canQueueGenerationNotice("other@example.test", "development", email), false);
  assert.equal(canQueueGenerationNotice(email, "development", email.toUpperCase()), true);
  assert.equal(canQueueGenerationNotice(email, "production", ""), true);
});