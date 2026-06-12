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
