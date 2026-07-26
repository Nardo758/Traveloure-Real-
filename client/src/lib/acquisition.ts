/**
 * acquisition.ts — S4 acquisition attribution capture (client half).
 *
 * A short-link redirect (GET /r/:code) lands on the destination with ?ref=<code>. We capture
 * that once per browser session and send it with checkout, where the SERVER decides the
 * attribution vocabulary (direct | link | cross_sell) — 'link' only if the code resolves to a
 * real short_links row. The client never asserts the source; it only relays the raw code.
 */

const STORAGE_KEY = "acquisitionRef";

/** Capture ?ref= from the current URL into sessionStorage (first ref of the session wins). */
export function captureAcquisitionRef(): void {
  try {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (!ref) return;
    const normalized = ref.trim().toLowerCase();
    // Same shape the server mints (8 chars [a-z0-9], column caps at 12) — skip junk early.
    if (!/^[a-z0-9]{1,12}$/.test(normalized)) return;
    if (!sessionStorage.getItem(STORAGE_KEY)) {
      sessionStorage.setItem(STORAGE_KEY, normalized);
    }
  } catch {
    // sessionStorage unavailable (private mode etc.) — attribution silently degrades to direct.
  }
}

/** The captured ref code, if any — sent with checkout for server-side attribution. */
export function getAcquisitionRef(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
