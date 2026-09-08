/**
 * THE BOOKING-AGENT STATUS VOCABULARY — CLAUDE.md Locked Decision 44 (e), phase 0.
 * Ledger `2026-09-08-agent-phase-zero`.
 *
 * `affiliate_booking_requests.status` is `varchar(30)` and stays so. This module is the ONE
 * statement of which values are legal, who may write each one, and which of them are the LEGACY
 * four. It is APP-ENFORCED with **NO DB CHECK and NO migration** (the publish-trap posture
 * CLAUDE.md's Coordination Prevention notes describe: a CHECK over a column holding legacy values
 * is exactly the publish-time drizzle-push failure that offers the destructive "copy dev over
 * production" option), and there is **NO BACKFILL** — a row written `assigned` was assigned under
 * the old vocabulary, and rewriting it would invent a fact about work nobody did (§13).
 *
 * THE RULED PIPELINE
 *   received → researching → ready_to_buy → purchased_by_<human|traveler|api> → confirmed
 *   plus `flagged` and `unavailable`.
 *
 * TWO DISTINCTIONS THIS VOCABULARY EXISTS TO KEEP:
 *   · "BOOKED" IS SAID ONLY WITH A CONFIRMATION IN HAND. `purchased_by_*` (a named actor attempted
 *     a purchase) and `confirmed` (we hold the reference) are DIFFERENT FACTS and are never
 *     collapsed into one.
 *   · `flagged` is a QUESTION (the copilot needs the traveler) and `unavailable` is the PARTNER'S
 *     ANSWER. Today's single `failed` bucket conflates them — which is the §13 lie the split
 *     exists to prevent, and which is why the legacy value is mapped as neither.
 *
 * WHO MAY WRITE WHAT. `researching` and `purchased_by_api` are SERVER-WRITTEN ONLY: a human may
 * not type themselves into a machine state. `received` is likewise the create path's own birth
 * state, not something a person sets after the fact. Everything else a booking agent actually does
 * is in `HUMAN_SETTABLE_BOOKING_AGENT_STATUSES`, together with the legacy `failed` the live agent
 * inbox still writes — preserved verbatim rather than silently re-pointed at one of the two states
 * it cannot distinguish.
 *
 * THE READER LIVES ELSEWHERE AND THERE IS ONLY ONE. `client/src/lib/booking-agent-status.ts` is the
 * ONE mapping of a stored value into a traveler-facing label, including the explicit legacy map.
 * This module states the VALUE SET and the write permissions; it deliberately holds no labels, so
 * the two cannot drift into two vocabularies (§18 rule 1).
 */

/** The nine values Locked Decision 44 (e) ratified, in pipeline order. */
export const RULED_BOOKING_AGENT_STATUSES = [
  "received",
  "researching",
  "ready_to_buy",
  "purchased_by_human",
  "purchased_by_traveler",
  "purchased_by_api",
  "confirmed",
  "flagged",
  "unavailable",
] as const;

export type RuledBookingAgentStatus = (typeof RULED_BOOKING_AGENT_STATUSES)[number];

/**
 * The four values rows on disk actually carry today, written by `content.routes.ts`.
 * `confirmed` is BOTH a legacy value and a ruled one — the same string, and the reader decides
 * what it means from whether a confirmation reference is present. It is listed here because a
 * pre-phase-0 row can carry it with no reference at all.
 */
export const LEGACY_BOOKING_AGENT_STATUSES = ["pending", "assigned", "confirmed", "failed"] as const;

export type LegacyBookingAgentStatus = (typeof LEGACY_BOOKING_AGENT_STATUSES)[number];

/**
 * Written by the SERVER only. `researching` is the copilot's own verb (LD 44 (a)) and
 * `purchased_by_api` is a partner-API purchase (LD 44 (b)); `received` is the create path's birth
 * state. A human PATCHing any of these would be claiming work a machine did.
 */
export const SERVER_WRITTEN_BOOKING_AGENT_STATUSES = [
  "received",
  "researching",
  "purchased_by_api",
] as const;

/**
 * The allowlist a human booking agent may set through
 * `PATCH /api/affiliate-booking-requests/:id`. Ruled values minus the server-written ones, plus
 * the legacy `failed` the live agent inbox still writes today (no backfill, no silent re-point:
 * `failed` cannot say whether it meant `flagged` or `unavailable`, so it keeps its own name until
 * the surface offers the two separately).
 */
export const HUMAN_SETTABLE_BOOKING_AGENT_STATUSES = [
  "ready_to_buy",
  "purchased_by_human",
  "purchased_by_traveler",
  "confirmed",
  "flagged",
  "unavailable",
  "failed",
] as const;

export type HumanSettableBookingAgentStatus = (typeof HUMAN_SETTABLE_BOOKING_AGENT_STATUSES)[number];

const RULED = new Set<string>(RULED_BOOKING_AGENT_STATUSES);
const LEGACY = new Set<string>(LEGACY_BOOKING_AGENT_STATUSES);
const SERVER_ONLY = new Set<string>(SERVER_WRITTEN_BOOKING_AGENT_STATUSES);
const HUMAN_SETTABLE = new Set<string>(HUMAN_SETTABLE_BOOKING_AGENT_STATUSES);

/** True for one of the nine ruled values. */
export function isRuledBookingAgentStatus(value: unknown): value is RuledBookingAgentStatus {
  return typeof value === "string" && RULED.has(value);
}

/** True for one of the four values rows already on disk can carry. */
export function isLegacyBookingAgentStatus(value: unknown): value is LegacyBookingAgentStatus {
  return typeof value === "string" && LEGACY.has(value);
}

/** True when the SERVER is the only writer of this value. */
export function isServerWrittenBookingAgentStatus(value: unknown): boolean {
  return typeof value === "string" && SERVER_ONLY.has(value);
}

/** True when a human booking agent may set this value through the PATCH rail. */
export function isHumanSettableBookingAgentStatus(
  value: unknown,
): value is HumanSettableBookingAgentStatus {
  return typeof value === "string" && HUMAN_SETTABLE.has(value);
}

/**
 * The refusal a human write of a non-settable status gets. Stated once so the route and its test
 * cannot disagree about the wording, and phrased to name WHY rather than just listing the set: a
 * server-written state is refused for a different reason than an unknown string.
 */
export function bookingAgentStatusRefusal(value: unknown): string {
  const raw = typeof value === "string" ? value : "";
  if (isServerWrittenBookingAgentStatus(raw)) {
    return `"${raw}" is written by the platform, not by a booking agent.`;
  }
  return `"${raw}" is not a booking-request status a booking agent can set.`;
}
