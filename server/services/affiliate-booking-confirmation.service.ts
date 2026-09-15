/**
 * THE ONE WRITER OF `affiliate_booking_requests.status = 'confirmed'`.
 *
 * Punchlist decision **D-10, option A** (decision-maker ratified Sep 15, 2026; ledger
 * `2026-09-15-d10-confirmed-needs-partner-evidence`). CLAUDE.md Locked Decision 44 (c)/(e); §13,
 * §15, §17, §18 rule 1.
 *
 * THE RULING. An external/affiliate booking reaches `confirmed` ONLY on PARTNER-ORIGINATED
 * evidence: a partner callback (no partner provides one today) or the affiliate network's own
 * reported conversion, matched back to this request on the `sub_id` attribution token the outbound
 * link carries (`TP_SUBID_ATTRIBUTION`; ledger `2026-09-05-affiliate-subid-live`). A human agent's
 * typed confirmation reference is REAL and stays visible on the row — it is simply OUR record of
 * what the agent did, not the partner's word that the booking holds — so the human rail writes
 * `purchased_by_human` and the traveler reads "awaiting the partner's confirmation".
 *
 * ONE WRITER, ONE CALLER. `confirmFromPartnerReport` is called from exactly one place: the
 * reconciliation matcher's exact-token adoption pass (`affiliate-reconciliation.service.ts`
 * `adoptExactTokenMatches`), immediately after that pass has adopted the partner's REAL reported
 * amount onto the linked `affiliate_earnings` row. A second implementation of "may this row read
 * as confirmed?" is the derivation-drift class §18 rule 1 names.
 *
 * §15 — THE STATEMENT IS THE GUARD. The write is ONE atomic conditional whose predicate is
 * `status IS DISTINCT FROM 'confirmed'`, so a replayed pass (or two passes racing) flips the row
 * exactly once and the loser matches zero rows and is told so. There is no check-then-update.
 *
 * §13 — WHAT IS RECORDED AND WHAT IS NOT.
 *   · THE EVIDENCE IS NEVER INVENTED. The marker written onto `expert_notes` states only fields the
 *     partner actually reported; an absent amount, currency, reference or date is OMITTED, never
 *     zero-filled. A partner that reported nothing beyond "a conversion happened on this token"
 *     produces a marker that says exactly that.
 *   · `confirmation_ref` IS NOT WRITTEN HERE. An affiliate network's action/conversion id is not a
 *     booking confirmation number a traveler could quote to the supplier, and writing it into a
 *     field labelled "confirmation ref" would present one fact as another. It would also clobber a
 *     reference a human agent really did hold. The partner's own identifiers live where the report
 *     landed — `affiliate_earnings.partner_reference_id` / `.external_report_data`, joined to this
 *     request by `booking_request_id` (migration 288) — and are not copied a second time, because a
 *     second copy of a number is free to disagree with the report it summarises (§18 rule 1).
 *   · NO BACKFILL AND NO SCHEMA CHANGE. `status` stays `varchar(30)` with no DB CHECK (the
 *     publish-trap posture), rows already carrying `confirmed` under the old human rail keep it,
 *     and no column was added for partner evidence because the linked earnings row already is it.
 *   · A CONTRADICTED PRIOR STATE IS SAID OUT LOUD. When the partner reports a conversion on a row
 *     an agent had marked `unavailable` or the legacy `failed`, the flip still happens — the
 *     partner's word is the evidence this whole rail waits for — but the marker names the state it
 *     overrode, so the agent sees the contradiction instead of the record quietly changing under
 *     them.
 *
 * NEGATIVE SPACE. This module writes ONE column and appends ONE note. It creates no itinerary
 * item, no earning, no notification and no money movement; it never un-confirms a row; and it has
 * nothing to say about partner-side CHANGES or CANCELLATIONS, for which no signal exists at all —
 * an agent handles those by hand, and the surfaces say so rather than implying we would know.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

/** What the partner actually reported. Every field is optional: absent means "not reported". */
export interface PartnerConfirmationEvidence {
  /** The partner/network the report came from, as the report names it. */
  partner?: string | null;
  /** The partner's own reference for the conversion (an action/booking id). */
  partnerReferenceId?: string | null;
  /** The commission or booking amount the partner reported, verbatim — never estimated. */
  reportedAmount?: number | null;
  reportedCurrency?: string | null;
  /** ISO date/time string as the partner reported it. */
  reportedAt?: string | null;
}

export interface PartnerConfirmationOutcome {
  /** True when THIS call flipped the row. A replay answers false. */
  confirmed: boolean;
  /** `already_confirmed` (a prior pass won) or `not_found`. Absent on a win. */
  reason?: "already_confirmed" | "not_found";
  /** The status the row carried before the flip — recorded so a contradiction is visible. */
  previousStatus?: string | null;
}

/** The marker appended to `expert_notes`. Greppable, and it names the rule it came from. */
export const PARTNER_CONFIRMATION_MARKER_PREFIX = "[PARTNER CONFIRMED]";

/** Statuses the partner's report CONTRADICTS rather than merely advances. */
const CONTRADICTED_BY_A_PARTNER_REPORT = new Set(["unavailable", "failed"]);

/**
 * Build the durable evidence line. §13: only reported facts appear; nothing is zero-filled and no
 * amount, currency or date is supplied on the partner's behalf.
 */
export function buildPartnerConfirmationNote(
  evidence: PartnerConfirmationEvidence,
  previousStatus?: string | null,
  now: Date = new Date(),
): string {
  const parts: string[] = [];
  const partner = typeof evidence.partner === "string" ? evidence.partner.trim() : "";
  parts.push(partner.length > 0 ? `${partner} reported this booking` : "the partner reported this booking");

  if (typeof evidence.reportedAmount === "number" && Number.isFinite(evidence.reportedAmount)) {
    const currency = typeof evidence.reportedCurrency === "string" ? evidence.reportedCurrency.trim() : "";
    parts.push(`reported amount ${evidence.reportedAmount}${currency ? ` ${currency}` : ""}`);
  }
  const ref = typeof evidence.partnerReferenceId === "string" ? evidence.partnerReferenceId.trim() : "";
  if (ref.length > 0) parts.push(`partner reference ${ref}`);
  const reportedAt = typeof evidence.reportedAt === "string" ? evidence.reportedAt.trim() : "";
  if (reportedAt.length > 0) parts.push(`reported ${reportedAt}`);

  const prior = typeof previousStatus === "string" ? previousStatus.trim() : "";
  if (prior && CONTRADICTED_BY_A_PARTNER_REPORT.has(prior)) {
    parts.push(`overrides the agent's earlier "${prior}" — please re-check by hand`);
  }

  return `${PARTNER_CONFIRMATION_MARKER_PREFIX} ${parts.join(" · ")} @ ${now.toISOString()}`;
}

/**
 * Flip ONE request to `confirmed` on the partner's own report.
 *
 * §15: `WHERE id = $1 AND status IS DISTINCT FROM 'confirmed'` is the guard itself. A replay
 * matches zero rows and answers `already_confirmed`; the caller must treat that as a no-op and
 * never retry a side effect on it.
 */
export async function confirmFromPartnerReport(
  requestId: string,
  evidence: PartnerConfirmationEvidence,
): Promise<PartnerConfirmationOutcome> {
  // Read ONLY to report the state that was overridden and to phrase the note. The DECISION is the
  // statement below, never this read (a check-then-update would be the TOCTOU bug §15 names).
  const priorRead = await db.execute(sql`
    SELECT status FROM affiliate_booking_requests WHERE id = ${requestId} LIMIT 1
  `);
  const priorRow = priorRead.rows[0] as { status?: string | null } | undefined;
  if (!priorRow) return { confirmed: false, reason: "not_found" };
  const previousStatus = priorRow.status ?? null;

  const note = buildPartnerConfirmationNote(evidence, previousStatus);

  const result = await db.execute(sql`
    UPDATE affiliate_booking_requests
    SET status = 'confirmed',
        expert_notes = CASE
          WHEN expert_notes IS NULL OR btrim(expert_notes) = '' THEN ${note}
          ELSE expert_notes || E'\n' || ${note}
        END,
        updated_at = NOW()
    WHERE id = ${requestId}
      AND status IS DISTINCT FROM 'confirmed'
  `);

  if (!result.rowCount) return { confirmed: false, reason: "already_confirmed", previousStatus };
  return { confirmed: true, previousStatus };
}
