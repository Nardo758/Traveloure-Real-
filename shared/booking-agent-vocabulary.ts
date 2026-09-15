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
 * `confirmed` IS NOT ONE OF THEM (punchlist D-10, option A — decision-maker ratified Sep 15, 2026,
 * ledger `2026-09-15-d10-confirmed-needs-partner-evidence`). LD 44 (e)'s vocabulary is UNCHANGED;
 * what this narrows is WHO MAY WRITE the last value in it. An external/affiliate booking reaches
 * `confirmed` ONLY on PARTNER-ORIGINATED evidence — a partner callback (none exists today) or the
 * affiliate network's own reported conversion matched back on `sub_id` by the reconciliation
 * matcher (`server/services/affiliate-booking-confirmation.service.ts` is the ONE writer). A human
 * agent's typed confirmation reference is REAL and stays visible, but it yields
 * `purchased_by_human` — "reference recorded, awaiting the partner's confirmation" — because a
 * reference the agent typed is OUR record of what they did, not the partner's word that it holds.
 * Partner-side changes and cancellations have no signal at all: the agent handles them by hand and
 * the surface says so.
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
 * `PATCH /api/affiliate-booking-requests/:id`. Ruled values minus the server-written ones and
 * minus the partner-evidence one, plus the legacy `failed` the live agent inbox still writes today
 * (no backfill, no silent re-point: `failed` cannot say whether it meant `flagged` or
 * `unavailable`, so it keeps its own name until the surface offers the two separately).
 *
 * D-10: `confirmed` LEFT this list. The agent's "I bought it" press writes `purchased_by_human`
 * and carries their confirmation reference with it; nothing a human can send makes the row read
 * as the partner's word.
 */
export const HUMAN_SETTABLE_BOOKING_AGENT_STATUSES = [
  "ready_to_buy",
  "purchased_by_human",
  "purchased_by_traveler",
  "flagged",
  "unavailable",
  "failed",
] as const;

export type HumanSettableBookingAgentStatus = (typeof HUMAN_SETTABLE_BOOKING_AGENT_STATUSES)[number];

/**
 * THE PARTNER-EVIDENCE VALUES — punchlist D-10 (option A), ledger
 * `2026-09-15-d10-confirmed-needs-partner-evidence`. Exactly one today: `confirmed`.
 *
 * A value in this set is written ONLY on evidence that ORIGINATED WITH THE PARTNER — their own
 * callback (no partner provides one today) or the affiliate network's reported conversion matched
 * back to this request on its `sub_id` attribution token (`TP_SUBID_ATTRIBUTION`; ledger
 * `2026-09-05-affiliate-subid-live`). It is neither human-settable NOR "written by the platform"
 * in the `researching` sense: the platform does not decide it either, it only RECORDS what the
 * partner reported. That is why it is its own set with its own refusal sentence — a refusal that
 * said "the platform writes this" would be the §13 lie one layer up.
 */
export const PARTNER_EVIDENCE_BOOKING_AGENT_STATUSES = ["confirmed"] as const;

export type PartnerEvidenceBookingAgentStatus =
  (typeof PARTNER_EVIDENCE_BOOKING_AGENT_STATUSES)[number];

/**
 * The two values a HUMAN purchase press may write. `purchased_by_api` is deliberately absent — it
 * is a partner-API purchase and stays server-only (LD 44 (b), unreachable today: no partner
 * booking client exists).
 */
export const HUMAN_PURCHASE_BOOKING_AGENT_STATUSES = [
  "purchased_by_human",
  "purchased_by_traveler",
] as const;

export type HumanPurchaseBookingAgentStatus =
  (typeof HUMAN_PURCHASE_BOOKING_AGENT_STATUSES)[number];

/**
 * The states a purchase press may be CLAIMED FROM — the §15 atomic conditional's from-list, and
 * it is DERIVED rather than restated (§18 rule 1): every legal stored value MINUS the ones a
 * purchase must never overwrite.
 *
 *   · `confirmed` — the partner has spoken; a human press must never pull a row back off it.
 *   · the three `purchased_by_*` — the purchase fact is recorded once. A second press therefore
 *     matches ZERO rows and is an idempotent no-op, which is what stops the confirm side-effects
 *     (the plan item and the earning-ledger row) from firing twice.
 *
 * Everything else is claimable, including `unavailable` and the legacy `failed`: an agent who
 * marked a request dead and then found it available again is correcting a record, not inventing
 * one.
 */
export const PURCHASE_CLAIMABLE_FROM_STATUSES = Array.from(
  new Set<string>([...RULED_BOOKING_AGENT_STATUSES, ...LEGACY_BOOKING_AGENT_STATUSES]),
).filter(
  (value) =>
    value !== "confirmed" &&
    !(PARTNER_EVIDENCE_BOOKING_AGENT_STATUSES as readonly string[]).includes(value) &&
    !value.startsWith("purchased_by_"),
) as readonly string[];

const RULED = new Set<string>(RULED_BOOKING_AGENT_STATUSES);
const LEGACY = new Set<string>(LEGACY_BOOKING_AGENT_STATUSES);
const SERVER_ONLY = new Set<string>(SERVER_WRITTEN_BOOKING_AGENT_STATUSES);
const HUMAN_SETTABLE = new Set<string>(HUMAN_SETTABLE_BOOKING_AGENT_STATUSES);
const PARTNER_EVIDENCE = new Set<string>(PARTNER_EVIDENCE_BOOKING_AGENT_STATUSES);
const HUMAN_PURCHASE = new Set<string>(HUMAN_PURCHASE_BOOKING_AGENT_STATUSES);

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

/** True when only PARTNER-ORIGINATED evidence may write this value (D-10). */
export function isPartnerEvidenceBookingAgentStatus(
  value: unknown,
): value is PartnerEvidenceBookingAgentStatus {
  return typeof value === "string" && PARTNER_EVIDENCE.has(value);
}

/** True when this is a human purchase press's target value (D-10). */
export function isHumanPurchaseBookingAgentStatus(
  value: unknown,
): value is HumanPurchaseBookingAgentStatus {
  return typeof value === "string" && HUMAN_PURCHASE.has(value);
}

/**
 * The refusal a human write of a non-settable status gets. Stated once so the route and its test
 * cannot disagree about the wording, and phrased to name WHY rather than just listing the set: a
 * server-written state is refused for a different reason than an unknown string.
 */
export function bookingAgentStatusRefusal(value: unknown): string {
  const raw = typeof value === "string" ? value : "";
  if (isPartnerEvidenceBookingAgentStatus(raw)) {
    // D-10: name the RULE, not just the set — the agent's press is not being rejected as invalid,
    // it is being told what "confirmed" means here and what their press does instead.
    return `"${raw}" is written only on the partner's own confirmation — record the purchase as `
      + `"purchased_by_human" with the reference you hold, and it reads as awaiting the partner's `
      + `confirmation until the partner reports it.`;
  }
  if (isServerWrittenBookingAgentStatus(raw)) {
    return `"${raw}" is written by the platform, not by a booking agent.`;
  }
  return `"${raw}" is not a booking-request status a booking agent can set.`;
}
