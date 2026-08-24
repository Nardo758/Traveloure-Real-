const GUEST_SESSION_KEY = "traveloure_guest_session";
const IMPRESSION_SESSION_KEY = "traveloure_impression_session";

export function getGuestSessionId(): string {
  let sessionId = localStorage.getItem(GUEST_SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(GUEST_SESSION_KEY, sessionId);
  }
  return sessionId;
}

/** Alias used by impression-tracking code. */
export const getOrCreateGuestSessionId = getGuestSessionId;

/** Separate session ID scoped to impression dedup (resets with each new tab). */
export function getOrCreateImpressionSessionId(): string {
  let sid = sessionStorage.getItem(IMPRESSION_SESSION_KEY);
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem(IMPRESSION_SESSION_KEY, sid);
  }
  return sid;
}

export function clearGuestSessionId(): void {
  localStorage.removeItem(GUEST_SESSION_KEY);
}
