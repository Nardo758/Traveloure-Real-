/**
 * The 48-hour "no response yet" notice (decision-maker, Sep 24, 2026 — Phase 3, #1293's answer).
 *
 * The platform promises NO response time. Instead, when an expert or provider has not answered a
 * traveler's request within the window, the traveler is told so once, and offered other experts.
 * This module holds the pure half: the window, the dedupe key, the copy and the link. Pure.
 */

/** Hours an earner has before the traveler hears "not responded yet". Config, env-overridable. */
export const DEFAULT_EARNER_NO_RESPONSE_HOURS = 48;

export function earnerNoResponseHours(env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {}): number {
  const raw = Number(env.EARNER_NO_RESPONSE_NOTICE_HOURS);
  return Number.isFinite(raw) && raw >= 1 ? raw : DEFAULT_EARNER_NO_RESPONSE_HOURS;
}

/** One notice per request, ever — the notifications table's partial UNIQUE dedupe key enforces it. */
export function earnerNoResponseDedupeKey(kind: "booking" | "advisor", id: string): string {
  return kind === "booking" ? `booking:${id}:earner_no_response` : `advisor:${id}:earner_no_response`;
}

/** Where "choose a different expert" lands: the experts directory, scoped to the city when known. */
export function alternativeExpertsPath(city: string | null | undefined): string {
  const c = (city ?? "").trim();
  return c ? `/experts?destination=${encodeURIComponent(c)}` : "/experts";
}

export interface NoResponseCopy {
  title: string;
  message: string;
}

/**
 * The notice. States only what is true: the earner has not responded, the request is still open,
 * and the traveler may choose someone else. No deadline, no apology on the earner's behalf, and no
 * claim that anything was cancelled — nothing is.
 */
export function earnerNoResponseCopy(input: { earnerName?: string | null; subject?: string | null }): NoResponseCopy {
  const who = input.earnerName?.trim() || "The expert";
  const about = input.subject?.trim() ? ` about "${input.subject.trim()}"` : "";
  return {
    title: "No response yet",
    message: `We see ${who} hasn't responded to your request${about} yet. Your request is still open — you can keep waiting, or choose a different expert.`,
  };
}
