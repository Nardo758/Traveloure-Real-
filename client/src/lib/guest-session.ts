import { GUEST_SESSION_STORAGE_KEY as GUEST_SESSION_KEY } from "./guest-session-key";
const IMPRESSION_SESSION_KEY = "traveloure_impression_session";

export function getGuestSessionId(): string {
  let sessionId = localStorage.getItem(GUEST_SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(GUEST_SESSION_KEY, sessionId);
  }
  return sessionId;
}

export function getOrCreateGuestSessionId(): string {
  return getGuestSessionId();
}

export function getOrCreateImpressionSessionId(): string {
  let sessionId = localStorage.getItem(IMPRESSION_SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(IMPRESSION_SESSION_KEY, sessionId);
  }
  return sessionId;
}

export function clearGuestSessionId(): void {
  localStorage.removeItem(GUEST_SESSION_KEY);
}
