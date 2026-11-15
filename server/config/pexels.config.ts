/**
 * Pexels rate limits (QA round 4 R4-10). Deployment config by name; no literal in the service.
 *   PEXELS_BACKOFF_MIN_MS    — the first wait after a 429 that names no reset time (default 60 000)
 *   PEXELS_BACKOFF_MAX_MS    — the longest wait; repeated 429s double up to this (default 3 600 000)
 *   PEXELS_CACHE_TTL_MS      — how long an answer with results is reused (default 86 400 000, a day)
 *   PEXELS_EMPTY_TTL_MS      — how long an empty answer or a failed call is reused (default 3 600 000)
 *   PEXELS_CACHE_MAX_ENTRIES — the most answers kept in memory; the oldest goes first (default 1000)
 */
function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  const v = Number(raw);
  return raw != null && raw !== "" && Number.isFinite(v) && v >= 0 ? v : fallback;
}

export function pexelsBackoffMinMs(): number {
  return envNumber("PEXELS_BACKOFF_MIN_MS", 60_000);
}

export function pexelsBackoffMaxMs(): number {
  return Math.max(pexelsBackoffMinMs(), envNumber("PEXELS_BACKOFF_MAX_MS", 3_600_000));
}

export function pexelsCacheTtlMs(): number {
  return envNumber("PEXELS_CACHE_TTL_MS", 86_400_000);
}

export function pexelsEmptyTtlMs(): number {
  return envNumber("PEXELS_EMPTY_TTL_MS", 3_600_000);
}

export function pexelsCacheMaxEntries(): number {
  return Math.max(1, Math.floor(envNumber("PEXELS_CACHE_MAX_ENTRIES", 1000)));
}
