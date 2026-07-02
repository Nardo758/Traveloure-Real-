/**
 * Request deduplication + circuit breaker for AI itinerary generation.
 *
 * DEDUPLICATION
 * When N simultaneous requests share the same cache key (same destination /
 * duration / params), only ONE upstream AI call fires.  All N callers await
 * the same Promise and receive identical results — no redundant API spend.
 *
 * CIRCUIT BREAKER
 * After FAILURE_THRESHOLD consecutive AI failures the circuit opens for
 * RECOVERY_WINDOW_MS (30 s).  Every request during that window receives an
 * AI_SERVICE_TEMPORARILY_UNAVAILABLE error immediately, without burning
 * another API call.  After 30 s the circuit resets to closed and the next
 * request acts as the probe.
 *
 * NOTE: Deduplication is only safe for generic (non-personalised) requests.
 * Callers must include all personalisation dimensions in the cache key, or
 * skip deduplication entirely for highly personal content.
 */

// ── In-flight request deduplication ─────────────────────────────────────────

const inFlightRequests = new Map<string, Promise<any>>();

/**
 * If a request for `key` is already in-flight, returns the same Promise so
 * all callers share a single AI call.  Otherwise executes `fn`, stores the
 * Promise, and cleans up once it settles.
 */
export async function dedupedRequest<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  if (inFlightRequests.has(key)) {
    console.log(`[DEDUP] Reusing in-flight request for: ${key}`);
    return inFlightRequests.get(key) as Promise<T>;
  }

  const promise = fn().finally(() => {
    inFlightRequests.delete(key);
  });

  inFlightRequests.set(key, promise);
  return promise;
}

// ── Circuit breaker ──────────────────────────────────────────────────────────

const FAILURE_THRESHOLD = 5;
const RECOVERY_WINDOW_MS = 30_000;

let consecutiveFailures = 0;
let circuitOpen = false;
let circuitOpenedAt: number | null = null;

/**
 * Returns true when the circuit is currently open (AI calls should be blocked).
 * Automatically resets to closed once the recovery window has elapsed.
 */
export function isCircuitOpen(): boolean {
  if (!circuitOpen) return false;
  const elapsed = Date.now() - (circuitOpenedAt ?? 0);
  if (elapsed >= RECOVERY_WINDOW_MS) {
    circuitOpen = false;
    consecutiveFailures = 0;
    circuitOpenedAt = null;
    console.log("[CIRCUIT BREAKER] Recovery window elapsed — circuit reset to closed.");
    return false;
  }
  return true;
}

/**
 * Records a successful AI call — resets the consecutive-failure counter.
 */
export function recordAiSuccess(): void {
  consecutiveFailures = 0;
}

/**
 * Records an AI failure. Opens the circuit once FAILURE_THRESHOLD is reached.
 */
export function recordAiFailure(_err: unknown): void {
  consecutiveFailures++;
  if (consecutiveFailures >= FAILURE_THRESHOLD && !circuitOpen) {
    circuitOpen = true;
    circuitOpenedAt = Date.now();
    console.error(
      `[CIRCUIT BREAKER] AI service failing repeatedly ` +
      `(${consecutiveFailures} consecutive errors) — ` +
      `pausing calls for ${RECOVERY_WINDOW_MS / 1000}s`
    );
  }
}

/**
 * Wraps an AI call with the circuit breaker.
 *
 * - Throws with code AI_SERVICE_TEMPORARILY_UNAVAILABLE when the circuit is open.
 * - On success: resets consecutive-failure counter.
 * - On failure: increments counter; opens circuit at threshold.
 */
export async function callWithCircuitBreaker<T>(fn: () => Promise<T>): Promise<T> {
  if (isCircuitOpen()) {
    const remaining = Math.max(
      1,
      Math.ceil((RECOVERY_WINDOW_MS - (Date.now() - (circuitOpenedAt ?? 0))) / 1000)
    );
    const err = new Error("AI_SERVICE_TEMPORARILY_UNAVAILABLE");
    (err as any).code = "AI_SERVICE_TEMPORARILY_UNAVAILABLE";
    (err as any).retryAfterSeconds = remaining;
    throw err;
  }

  try {
    const result = await fn();
    recordAiSuccess();
    return result;
  } catch (err: any) {
    if (err?.code !== "AI_SERVICE_TEMPORARILY_UNAVAILABLE") {
      recordAiFailure(err);
    }
    throw err;
  }
}

/** Diagnostic — safe to expose to admin dashboards or tests. */
export function getCircuitBreakerState() {
  return {
    open: circuitOpen,
    consecutiveFailures,
    openedAt: circuitOpenedAt,
    recoveryWindowMs: RECOVERY_WINDOW_MS,
    failureThreshold: FAILURE_THRESHOLD,
    inFlightCount: inFlightRequests.size,
  };
}
