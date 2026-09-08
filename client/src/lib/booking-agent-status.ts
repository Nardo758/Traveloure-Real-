/**
 * booking-agent-status — the ONE reading of `affiliate_booking_requests.status` on a traveler
 * surface, in the vocabulary CLAUDE.md Locked Decision 44 (e) ratified.
 *
 * Ledger `2026-09-07-trip-card-one-page` (Console & AI Concierge brief lane L9). The Trip Card's
 * right rail carries a Booking-agent card that is a PLACEHOLDER until L16/L17 mount the drawer;
 * it reads the rows that exist today and says what they say — never that a copilot exists.
 *
 * THE RULED VOCABULARY (LD 44 (e)):
 *   received → researching → ready_to_buy → purchased_by_<human|traveler|api> → confirmed,
 *   plus flagged and unavailable. "Booked" is said ONLY with a confirmation in hand.
 *
 * WHAT THE ROWS CARRY TODAY — the LEGACY FOUR, written by `content.routes.ts`:
 *   `pending`   the create path, no agent yet
 *   `assigned`  the create path when an agent was auto-assigned (a HUMAN, `getExpertUserIds`)
 *   `confirmed` the agent's PATCH — with or WITHOUT a `confirmationRef`
 *   `failed`    the agent's PATCH — which LD 44 names as the bucket that CONFLATES a question
 *               (flagged) with the partner's answer (unavailable)
 * LD 44 phase 0 landed with ledger `2026-09-08-agent-phase-zero`: the value set and the
 * human-write allowlist now live in `shared/booking-agent-vocabulary.ts`, which the PATCH rail
 * enforces. It added NO migration and NO backfill, so rows written before it still carry the
 * legacy four. This map is the reader's EXPLICIT mapping of those four — "readers map the legacy
 * four explicitly and say so" — while a ruled value passes through by name.
 *
 * §13 — WHAT IS NOT CLAIMED. `assigned` is NOT rendered as "researching": researching is a copilot
 * verb and the row records a human assignment. `confirmed` without a confirmation reference is
 * NOT "booked" — it is `purchased_by_human` (a named actor attempted a purchase) — and only a row
 * carrying a reference reads "Booked". `failed` is rendered as neither flagged nor unavailable,
 * because the legacy value cannot say which. An unrecognised status is shown VERBATIM under an
 * `unknown` key rather than folded into the nearest-looking ruled state.
 */

import {
  isRuledBookingAgentStatus,
  type RuledBookingAgentStatus,
} from "@shared/booking-agent-vocabulary";

/**
 * The ruled nine come FROM the vocabulary module (`shared/booking-agent-vocabulary.ts`, LD 44
 * phase 0) rather than being restated here — one value set, two readers (§18 rule 1). The two
 * `_legacy` stages and `unknown` are this reader's own, because they are reading positions rather
 * than storable values: nothing ever writes them.
 */
export type BookingAgentStage =
  | RuledBookingAgentStatus
  /** Legacy `assigned`: a human agent holds it; no ruled equivalent without inventing a verb. */
  | "assigned_legacy"
  /** Legacy `failed`: flagged OR unavailable, and the row cannot say which. */
  | "failed_legacy"
  | "unknown";

export interface BookingAgentStatusRow {
  status?: string | null;
  confirmationRef?: string | null;
}

export interface BookingAgentReading {
  stage: BookingAgentStage;
  /** Traveler-facing label. "Booked" appears ONLY on `confirmed` (a reference in hand). */
  label: string;
  /** True only when the stage is one LD 44 ratified by name (never for the legacy/unknown ones). */
  ruled: boolean;
}

const RULED_LABELS: Record<Exclude<BookingAgentStage, "assigned_legacy" | "failed_legacy" | "unknown">, string> = {
  received: "Received",
  researching: "Researching",
  ready_to_buy: "Ready to buy",
  purchased_by_human: "Purchased by your agent, awaiting confirmation",
  purchased_by_traveler: "Purchased by you, awaiting confirmation",
  purchased_by_api: "Purchased, awaiting confirmation",
  confirmed: "Booked",
  flagged: "Needs your answer",
  unavailable: "Unavailable from the partner",
};

const hasRef = (row: BookingAgentStatusRow): boolean =>
  typeof row.confirmationRef === "string" && row.confirmationRef.trim().length > 0;

/** Read ONE row into the ruled vocabulary — the explicit legacy map lives here and nowhere else. */
export function readBookingAgentStatus(row: BookingAgentStatusRow): BookingAgentReading {
  const raw = typeof row.status === "string" ? row.status.trim() : "";
  switch (raw) {
    // ── legacy four ────────────────────────────────────────────────────────────────────────────
    case "pending":
      return { stage: "received", label: RULED_LABELS.received, ruled: true };
    case "assigned":
      return { stage: "assigned_legacy", label: "With a booking agent", ruled: false };
    case "confirmed":
      // LD 44 (e): "booked" only with a confirmation in hand.
      return hasRef(row)
        ? { stage: "confirmed", label: RULED_LABELS.confirmed, ruled: true }
        : { stage: "purchased_by_human", label: RULED_LABELS.purchased_by_human, ruled: true };
    case "failed":
      return { stage: "failed_legacy", label: "Couldn't be booked", ruled: false };
    default:
      // ── the ruled values, passed through by name once phase 0 writes them ───────────────────
      // The membership test is the SHARED one, so a value added to the vocabulary is readable here
      // without a second list to remember (§18 rule 1). `confirmed` never reaches this arm — it is
      // handled above, where the confirmation reference decides what it means.
      if (isRuledBookingAgentStatus(raw) && raw !== "confirmed") {
        return { stage: raw, label: RULED_LABELS[raw], ruled: true };
      }
      // §13: an unrecognised value is shown as itself, never as the nearest ruled state. An EMPTY
      // status is "unknown" too — a row with no status is not "received".
      return { stage: "unknown", label: raw.length > 0 ? raw : "Status not recorded", ruled: false };
  }
}
