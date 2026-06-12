/**
 * Guest session identity — persists a random ID in localStorage so that
 * anonymous demand requests can be attributed to a consistent session.
 * Falls back to an in-memory ID when localStorage is unavailable (SSR/private).
 */

const STORAGE_KEY = "traveloure_guest_sid";
let _memFallback: string | null = null;

export function getOrCreateGuestSessionId(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
    const id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    if (!_memFallback) _memFallback = crypto.randomUUID();
    return _memFallback;
  }
}

/**
 * Impression session identity — uses sessionStorage so the ID resets when the
 * tab/window closes. This makes impression dedup truly session-scoped: a user
 * returning to the same page in a new tab will generate fresh impressions.
 * Falls back to an in-memory ID for the same tab lifetime.
 */
const IMPRESSION_SESSION_KEY = "traveloure_imp_sid";
let _impMemFallback: string | null = null;

export function getOrCreateImpressionSessionId(): string {
  try {
    const stored = sessionStorage.getItem(IMPRESSION_SESSION_KEY);
    if (stored) return stored;
    const id = crypto.randomUUID();
    sessionStorage.setItem(IMPRESSION_SESSION_KEY, id);
    return id;
  } catch {
    if (!_impMemFallback) _impMemFallback = crypto.randomUUID();
    return _impMemFallback;
  }
}
