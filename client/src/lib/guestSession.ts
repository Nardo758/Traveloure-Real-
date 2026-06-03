const GUEST_SESSION_KEY = "traveloure_guest_session";

export function getGuestSessionId(): string {
  let sessionId = localStorage.getItem(GUEST_SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(GUEST_SESSION_KEY, sessionId);
  }
  return sessionId;
}

export function clearGuestSessionId(): void {
  localStorage.removeItem(GUEST_SESSION_KEY);
}
