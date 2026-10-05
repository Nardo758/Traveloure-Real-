/**
 * THE HANDOFF'S CLOCKS (step 7b, R323; rulings R-q and R-s). Durations, never rates (§8): nothing
 * here multiplies an amount or selects a band. Each is env-overridable; an unset, non-numeric or
 * non-positive value reads the ruled default.
 *
 *   · R-q: no expert accepts within 24 h → the concierge fallback is offered;
 *   · R-q: still nobody at 48 h → the hold on the traveler's card is released;
 *   · R-s: a delivered plan auto-approves after 7 days.
 */
function positiveNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** R-q: hours after authorization before the concierge fallback is offered. */
export function handoffFallbackHours(): number {
  return positiveNumberEnv("HANDOFF_FALLBACK_HOURS", 24);
}

/** R-q: hours after authorization before an unaccepted hold is released. */
export function handoffReleaseHours(): number {
  return positiveNumberEnv("HANDOFF_RELEASE_HOURS", 48);
}

/** R-s: days after delivery before the plan approves itself. */
export function handoffAutoApproveDays(): number {
  return positiveNumberEnv("HANDOFF_AUTO_APPROVE_DAYS", 7);
}
