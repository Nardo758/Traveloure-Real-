/**
 * pending-handle — the handle an APPLICANT chose before they were allowed to claim it.
 *
 * Ledger `2026-09-05-handles-are-claimed` (CLAUDE.md Locked Decision 40). Both application
 * wizards ask for a handle near the end, but neither may WRITE it: an applicant is still a
 * traveler when they submit — `users.role` becomes an earner role only when an admin approves
 * the application (`updateUserRole`) — and `PATCH /api/me/handle` refuses a non-earner with a
 * 403 by design. Widening that gate to let an applicant claim would hand a public identity to
 * an account the platform has not yet accepted as an earner, which is the opposite of what
 * LD 40 says a handle is. So the wizard HOLDS the answer, and the console banner offers it back
 * pre-filled on the first visit after approval, where the claim is legitimate.
 *
 * localStorage, not the sessionStorage `application-draft` uses: approval happens days later, in
 * a different browsing session, and a draft cleared on submit could not survive to the console
 * anyway. Every read and write is wrapped — a private window, a full store or a browser that
 * refuses site data reads as "nothing held", and the banner then falls back to `suggestHandle`.
 *
 * §13: what is held here is a PREFERENCE, never a claim. Nothing on any surface may render it as
 * the earner's handle — only `users.handle`, which only the server writes, is that.
 */
const PENDING_HANDLE_KEY = "traveloure_pending_handle";

export function savePendingHandle(handle: string): void {
  try {
    const trimmed = handle.trim();
    if (trimmed.length === 0) {
      window.localStorage.removeItem(PENDING_HANDLE_KEY);
      return;
    }
    window.localStorage.setItem(PENDING_HANDLE_KEY, trimmed);
  } catch {
    /* storage unavailable — the prefill is best-effort and never blocks an application */
  }
}

/** The handle held from an application, or `null` when none is held (never a guess). */
export function loadPendingHandle(): string | null {
  try {
    const raw = window.localStorage.getItem(PENDING_HANDLE_KEY);
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

export function clearPendingHandle(): void {
  try {
    window.localStorage.removeItem(PENDING_HANDLE_KEY);
  } catch {
    /* ignore */
  }
}
