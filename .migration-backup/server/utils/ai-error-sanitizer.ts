/**
 * ai-error-sanitizer.ts
 *
 * AI-hardening fixes (FW2-C / T6-1, T6-2, T6-4): several AI-backed routes were
 * forwarding the RAW provider error to the client — Anthropic SDK messages
 * ("invalid x-api-key", a request_id) and xAI/network errors ("403 Host not
 * in allowlist: api.x.ai. Add this host to your network egress settings...").
 * Those strings can name the failing provider, an egress hostname, or (in
 * principle) key material — none of which is safe to hand to a browser.
 *
 * This module is the SINGLE place client-facing copy for an AI-provider
 * failure is decided. Callers must never interpolate `error.message` (or any
 * other provider-shaped field) into a response body — always go through one
 * of these two builders instead, and log the real error server-side
 * separately (console.error / logger) for debugging.
 *
 * Two shapes:
 *  - sanitizeAiProviderFailure(): the 503 "circuit breaker" shape used by the
 *    itinerary-generation surfaces (T6-1, T6-2). Every provider failure gets
 *    this shape — whether the circuit breaker is open or this is the very
 *    first failure since a reset — so a first-failure response is
 *    indistinguishable from a post-trip response apart from
 *    retryAfterSeconds (T6-2's requirement: "the breaker decides retryAfter,
 *    not whether to sanitize").
 *  - sanitizeAiContentFailure(): the generic (non-retry-after) shape used by
 *    one-shot AI content generation (expert AI-task delegate/regenerate,
 *    T6-4) where there is no circuit-breaker retry window to report.
 *
 * Both are pure functions — no I/O, no error-object introspection beyond an
 * optional numeric retryAfterSeconds override — which is what makes them
 * cheaply unit-testable (see server/__tests__/ai-error-sanitizer.test.ts).
 */

/** Default backoff advice when the caller has no circuit-breaker-supplied value. */
export const DEFAULT_AI_RETRY_AFTER_SECONDS = 5;

export interface SanitizedAiProviderFailure {
  message: string;
  retryable: true;
  retryAfterSeconds: number;
}

export interface SanitizedAiContentFailure {
  message: string;
  retryable: true;
}

/**
 * Builds the client-facing 503 body for an AI itinerary-generation provider
 * failure (T6-1, T6-2). Never pass provider error text in — the message is
 * fixed, honest, user-facing copy regardless of the underlying cause.
 */
export function sanitizeAiProviderFailure(
  retryAfterSeconds: number = DEFAULT_AI_RETRY_AFTER_SECONDS,
): SanitizedAiProviderFailure {
  return {
    message: "Our AI is experiencing high demand. Please try again in a moment.",
    retryable: true,
    retryAfterSeconds: retryAfterSeconds > 0 ? retryAfterSeconds : DEFAULT_AI_RETRY_AFTER_SECONDS,
  };
}

/**
 * Extracts a usable retryAfterSeconds from a thrown error (e.g. the circuit
 * breaker's AI_SERVICE_TEMPORARILY_UNAVAILABLE error, which carries a real
 * "seconds remaining in the recovery window" value) and falls back to the
 * default one-shot backoff for a plain provider failure that never touched
 * the breaker's open state.
 */
export function retryAfterSecondsFromError(error: unknown): number {
  const seconds = (error as { retryAfterSeconds?: unknown } | null | undefined)?.retryAfterSeconds;
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0
    ? seconds
    : DEFAULT_AI_RETRY_AFTER_SECONDS;
}

/**
 * Builds the client-facing body for a one-shot AI content-generation failure
 * (T6-4: expert AI-task delegate/regenerate). No retry-after window applies
 * here — these aren't behind the itinerary circuit breaker — so the shape
 * omits retryAfterSeconds.
 */
export function sanitizeAiContentFailure(): SanitizedAiContentFailure {
  return {
    message: "We couldn't generate that content right now. Please try again in a moment.",
    retryable: true,
  };
}
