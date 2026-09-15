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
 *   `assigned`  the create path when an agent was auto-assigned (a HUMAN, `getExpertUserIds`).
 *               That auto-assignment is RETIRED (ledger `2026-09-08-assignment-is-claimed`,
 *               executed by `2026-09-15-booking-agent-claim`): no assignee is stamped at
 *               create any more, so NO NEW ROW carries this value. Rows already on disk do
 *               — there is no backfill — which is why this arm stays exactly as it is.
 *   `confirmed` the agent's PATCH — with or WITHOUT a `confirmationRef`
 *   `failed`    the agent's PATCH — which LD 44 names as the bucket that CONFLATES a question
 *               (flagged) with the partner's answer (unavailable)
 * LD 44 phase 0 landed with ledger `2026-09-08-agent-phase-zero`: the value set and the
 * human-write allowlist now live in `shared/booking-agent-vocabulary.ts`, which the PATCH rail
 * enforces. It added NO migration and NO backfill, so rows written before it still carry the
 * legacy four. This map is the reader's EXPLICIT mapping of those four — "readers map the legacy
 * four explicitly and say so" — while a ruled value passes through by name.
 *
 * D-10 — `confirmed` MEANS THE PARTNER SAID SO (punchlist D-10 option A, ledger
 * `2026-09-15-d10-confirmed-needs-partner-evidence`). The human rail can no longer write it: an
 * agent's press writes `purchased_by_human` and carries their typed reference with it, and the ONE
 * writer of `confirmed` is the sub_id reconciliation matcher, on the affiliate network's own
 * reported conversion. So this reader changed in two places:
 *   · `purchased_by_human` WITH a reference reads "Purchased · reference recorded · awaiting the
 *     partner's confirmation", and WITHOUT one reads the same sentence minus that clause. The
 *     reference is a real fact and stays visible; it is simply not the partner's word.
 *   · `confirmed` reads "Confirmed by <partner>", naming the partner the request already carries
 *     — never a partner name invented here, and "the partner" when the row states none.
 * LEGACY ROWS ALREADY AT `confirmed` KEEP IT. There is NO BACKFILL: a row confirmed under the old
 * rule was confirmed under it, and rewriting it would invent a fact about work nobody did. Nothing
 * distinguishes such a row from a partner-confirmed one — which is exactly why the human rail
 * stopped being able to make more of them, rather than this reader trying to tell them apart. The
 * previous "confirmed without a reference is really purchased_by_human" arm is therefore GONE: a
 * partner-confirmed row carries no reference (the matcher never writes one — see below), so that
 * arm would now downgrade the one reading D-10 exists to protect.
 *
 * §13 — WHAT IS NOT CLAIMED. `assigned` is NOT rendered as "researching": researching is a copilot
 * verb and the row records a human assignment. `failed` is rendered as neither flagged nor
 * unavailable, because the legacy value cannot say which. An unrecognised status is shown VERBATIM
 * under an `unknown` key rather than folded into the nearest-looking ruled state.
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
  /** The partner the request already names. Never invented here when absent (§13). */
  partnerName?: string | null;
}

export interface BookingAgentReading {
  stage: BookingAgentStage;
  /**
   * Traveler-facing label. A CONFIRMATION is claimed ONLY on `confirmed`, which only the partner's
   * own reported conversion can produce (D-10).
   */
  label: string;
  /** True only when the stage is one LD 44 ratified by name (never for the legacy/unknown ones). */
  ruled: boolean;
}

const RULED_LABELS: Record<Exclude<BookingAgentStage, "assigned_legacy" | "failed_legacy" | "unknown">, string> = {
  received: "Received",
  researching: "Researching",
  ready_to_buy: "Ready to buy",
  // D-10: a purchase is never "booked". The wait is named for WHOSE word is missing.
  purchased_by_human: "Purchased by your agent · awaiting the partner's confirmation",
  purchased_by_traveler: "Purchased by you · awaiting the partner's confirmation",
  purchased_by_api: "Purchased · awaiting the partner's confirmation",
  // Overwritten by `confirmedLabel` below, which names the partner the row carries.
  confirmed: "Confirmed by the partner",
  flagged: "Needs your answer",
  unavailable: "Unavailable from the partner",
};

const hasRef = (row: BookingAgentStatusRow): boolean =>
  typeof row.confirmationRef === "string" && row.confirmationRef.trim().length > 0;

/**
 * D-10: `confirmed` names the partner the REQUEST ALREADY CARRIES (`partner_name`, NOT NULL on the
 * table). A row that somehow states none falls back to "the partner" — never a guessed name.
 */
function confirmedLabel(row: BookingAgentStatusRow): string {
  const partner = typeof row.partnerName === "string" ? row.partnerName.trim() : "";
  return partner.length > 0 ? `Confirmed by ${partner}` : RULED_LABELS.confirmed;
}

/**
 * D-10: the agent's typed reference is a real fact and is SAID — it is just not the partner's
 * word, so the sentence still ends in the wait. Only `purchased_by_human` carries the clause: a
 * `purchased_by_traveler` row's reference is the traveler's own and the label already says so.
 */
function purchasedByHumanLabel(row: BookingAgentStatusRow): string {
  return hasRef(row)
    ? "Purchased · reference recorded · awaiting the partner's confirmation"
    : RULED_LABELS.purchased_by_human;
}

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
      // D-10: the column value means the partner's own report. A legacy row written under the old
      // human rail carries the same string and is KEPT as it stands (no backfill) — the two are
      // indistinguishable by design, which is why the human rail stopped writing it.
      return { stage: "confirmed", label: confirmedLabel(row), ruled: true };
    case "failed":
      return { stage: "failed_legacy", label: "Couldn't be booked", ruled: false };
    default:
      // ── the ruled values, passed through by name once phase 0 writes them ───────────────────
      // The membership test is the SHARED one, so a value added to the vocabulary is readable here
      // without a second list to remember (§18 rule 1). `confirmed` never reaches this arm — it is
      // handled above, where it reads as the partner's own confirmation.
      if (isRuledBookingAgentStatus(raw) && raw !== "confirmed") {
        return {
          stage: raw,
          label: raw === "purchased_by_human" ? purchasedByHumanLabel(row) : RULED_LABELS[raw],
          ruled: true,
        };
      }
      // §13: an unrecognised value is shown as itself, never as the nearest ruled state. An EMPTY
      // status is "unknown" too — a row with no status is not "received".
      return { stage: "unknown", label: raw.length > 0 ? raw : "Status not recorded", ruled: false };
  }
}
