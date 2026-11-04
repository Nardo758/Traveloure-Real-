/**
 * A-9 (ledger `2026-11-05-lane3-occasion`; ruling, Nov 5, 2026): the occasion PATCH that follows a new plan's mint is
 * awaited, retried three times with backoff, and — when every try fails — the traveler is told, in the approved
 * sentence. A refusal the server meant (a 4xx other than 429) is not retried: the same body would be refused again.
 *
 * Pure apart from the injected `send` and `sleep`, so the retry and its stopping rule are testable without a network.
 */

/** "Wording approved — Leon" (Nov 5, 2026). */
export const OCCASION_SAVE_FAILED = "Couldn't save the occasion. Try again.";

/** Waits before each retry, in ms: three retries after the first try. */
export const OCCASION_SAVE_BACKOFF_MS = [500, 1000, 2000] as const;

/** The status an `apiRequest` error names (`"<status>: <text>"`), or null for a network failure. */
export function errorStatus(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const m = /^(\d{3}):/.exec(msg);
  return m ? Number(m[1]) : null;
}

/** A network failure, a 5xx or a 429 may succeed later; any other refusal will not. */
export function isRetryable(err: unknown): boolean {
  const status = errorStatus(err);
  return status === null || status >= 500 || status === 429;
}

export type OccasionSaveResult<T> = { ok: true; value: T; attempts: number } | { ok: false; error: unknown; attempts: number };

export async function sendWithRetry<T>(
  send: () => Promise<T>,
  opts: { backoffMs?: readonly number[]; sleep?: (ms: number) => Promise<void> } = {},
): Promise<OccasionSaveResult<T>> {
  const backoff = opts.backoffMs ?? OCCASION_SAVE_BACKOFF_MS;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let attempts = 0;
  for (;;) {
    attempts += 1;
    try {
      return { ok: true, value: await send(), attempts };
    } catch (error) {
      const retry = attempts - 1;
      if (retry >= backoff.length || !isRetryable(error)) return { ok: false, error, attempts };
      await sleep(backoff[retry]);
    }
  }
}
