/**
 * ai-error-sanitizer.test.ts
 *
 * Pure unit tests for server/utils/ai-error-sanitizer.ts (FW2-C / T6-1, T6-2,
 * T6-4). No DB required — this module has zero dependencies, so it is safe
 * to `tsx --test` in any environment.
 *
 * Run with: npx tsx --test server/__tests__/ai-error-sanitizer.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_AI_RETRY_AFTER_SECONDS,
  sanitizeAiProviderFailure,
  sanitizeAiContentFailure,
  retryAfterSecondsFromError,
} from "../utils/ai-error-sanitizer";

describe("sanitizeAiProviderFailure", () => {
  it("uses the default retry-after when none is supplied", () => {
    const body = sanitizeAiProviderFailure();
    assert.equal(body.retryable, true);
    assert.equal(body.retryAfterSeconds, DEFAULT_AI_RETRY_AFTER_SECONDS);
    assert.match(body.message, /try again/i);
  });

  it("honors a caller-supplied retryAfterSeconds (e.g. circuit-breaker remaining window)", () => {
    const body = sanitizeAiProviderFailure(27);
    assert.equal(body.retryAfterSeconds, 27);
  });

  it("falls back to the default for a non-positive retryAfterSeconds", () => {
    assert.equal(sanitizeAiProviderFailure(0).retryAfterSeconds, DEFAULT_AI_RETRY_AFTER_SECONDS);
    assert.equal(sanitizeAiProviderFailure(-5).retryAfterSeconds, DEFAULT_AI_RETRY_AFTER_SECONDS);
  });

  it("T6-2: first-failure and post-circuit-breaker-trip bodies are identical apart from retryAfterSeconds", () => {
    const firstFailure = sanitizeAiProviderFailure(retryAfterSecondsFromError(new Error("boom")));
    const postTrip = sanitizeAiProviderFailure(retryAfterSecondsFromError(
      Object.assign(new Error("AI_SERVICE_TEMPORARILY_UNAVAILABLE"), { retryAfterSeconds: 12 }),
    ));
    assert.equal(firstFailure.message, postTrip.message);
    assert.equal(firstFailure.retryable, postTrip.retryable);
    assert.notEqual(firstFailure.retryAfterSeconds, postTrip.retryAfterSeconds);
  });

  it("never echoes provider error text (Anthropic/xAI internals) into the message", () => {
    const body = sanitizeAiProviderFailure();
    assert.doesNotMatch(body.message, /x-api-key/i);
    assert.doesNotMatch(body.message, /anthropic/i);
    assert.doesNotMatch(body.message, /api\.x\.ai/i);
    assert.doesNotMatch(body.message, /request_id/i);
    assert.doesNotMatch(body.message, /allowlist/i);
  });
});

describe("retryAfterSecondsFromError", () => {
  it("reads a numeric retryAfterSeconds off the error object", () => {
    const err = Object.assign(new Error("circuit open"), { retryAfterSeconds: 18 });
    assert.equal(retryAfterSecondsFromError(err), 18);
  });

  it("falls back to the default for errors with no retryAfterSeconds", () => {
    assert.equal(retryAfterSecondsFromError(new Error("plain failure")), DEFAULT_AI_RETRY_AFTER_SECONDS);
    assert.equal(retryAfterSecondsFromError(null), DEFAULT_AI_RETRY_AFTER_SECONDS);
    assert.equal(retryAfterSecondsFromError(undefined), DEFAULT_AI_RETRY_AFTER_SECONDS);
    assert.equal(retryAfterSecondsFromError("a string, not an error"), DEFAULT_AI_RETRY_AFTER_SECONDS);
  });

  it("ignores a non-numeric or non-positive retryAfterSeconds field", () => {
    assert.equal(
      retryAfterSecondsFromError(Object.assign(new Error("x"), { retryAfterSeconds: "soon" })),
      DEFAULT_AI_RETRY_AFTER_SECONDS,
    );
    assert.equal(
      retryAfterSecondsFromError(Object.assign(new Error("x"), { retryAfterSeconds: -1 })),
      DEFAULT_AI_RETRY_AFTER_SECONDS,
    );
    assert.equal(
      retryAfterSecondsFromError(Object.assign(new Error("x"), { retryAfterSeconds: NaN })),
      DEFAULT_AI_RETRY_AFTER_SECONDS,
    );
  });
});

describe("sanitizeAiContentFailure", () => {
  it("returns a fixed, honest, retryable message with no provider internals", () => {
    const body = sanitizeAiContentFailure();
    assert.equal(body.retryable, true);
    assert.match(body.message, /try again/i);
    assert.doesNotMatch(body.message, /host not in allowlist/i);
    assert.doesNotMatch(body.message, /x\.ai/i);
    assert.doesNotMatch(body.message, /egress/i);
  });
});
