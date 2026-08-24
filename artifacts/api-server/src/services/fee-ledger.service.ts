/**
 * FEE LEDGER WRITER — the first one (migration 179's table has had no writer until now).
 *
 * SCOPE, STATED UP FRONT SO NOBODY MISREADS THE TABLE (§13). This lane (D6, docs/DECISIONS.md
 * ruling 61) writes ledger rows for RAILS-ATTRIBUTED bookings ONLY. `fee_ledger` is therefore NOT
 * yet the platform-wide fee event log migration 179 describes: a direct (non-rails) checkout, the
 * legacy `bookings` rail, ready-mades, templates, coordination, tips and affiliate margin all still
 * write nothing here. **Do not aggregate this table as if it were complete** — until the ledger lane
 * lands its remaining writers, `SUM(fee_ledger.amount)` is a sum over the rails slice, and the
 * per-booking invariant (`traveler_paid - provider_credited = SUM(amount)`) is not yet assertable
 * platform-wide. `appendFeeLedgerRows` is deliberately generic so those writers adopt it rather than
 * inventing a second insert path.
 *
 * WHEN THE ROW IS WRITTEN: at the AUTHORIZATION STAMP, which is migration 179's own stated strategy
 * (b) — "the row is written at the authorization stamp, so the PaymentIntent IS in scope". Writing
 * at fee-computation time would stamp a fee event onto a provisional claim that the TTL sweep may
 * void, and this table has no DELETE path (append-only) to take it back.
 *
 * IDEMPOTENCY IS STRUCTURAL, not application logic (§15): `idempotency_key` carries a UNIQUE index
 * and every insert is `ON CONFLICT DO NOTHING`. The key is derived from the booking id alone, so a
 * retry, a re-drive, a double payment signal and the webhook racing the inline promotion all land
 * EXACTLY ONE row. That is what makes it safe to drive this from more than one caller — the same
 * "one implementation, N callers" shape §15c uses for the payment promotion itself.
 *
 * APPEND-ONLY: there is no UPDATE and no DELETE path in this file, including to correct a bad row.
 * A correction is a `reversal` row (`reverses_ledger_id`) plus a new row.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../infrastructure/logger";
import type { FeeLedgerType, FeeRateSource } from "@workspace/db";
import { round2 } from "./fee-resolution.service";

export interface FeeLedgerAppendRow {
  sourceType: string;
  sourceId: string;
  bookingId: string | null;
  feeType: FeeLedgerType;
  /** Dollars. Migration 179 CHECKs `amount <> 0` — a zero row is refused by the DB, by design. */
  amount: number;
  borneBy: "traveler" | "provider" | "expert" | "platform";
  bandId: string | null;
  rateAsResolved: number | null;
  rateSource: FeeRateSource;
  capApplied?: boolean;
  sourceAttribution?: "platform" | "rails";
  acquisitionRef?: string | null;
  stripePaymentRef?: string | null;
  idempotencyKey: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Append fee events. Returns the number of rows that actually landed (a replay returns 0 — that is
 * success, not failure). Never throws on a conflict; a genuine DB error propagates to the caller,
 * which decides whether recording may fail the operation it is recording.
 */
export async function appendFeeLedgerRows(rows: FeeLedgerAppendRow[]): Promise<number> {
  let inserted = 0;
  for (const row of rows) {
    // The DB refuses a zero-amount event (migration 179: "a zero-amount fee event is meaningless
    // and hides a resolution bug behind a real-looking row"). Skip it here with a loud line rather
    // than firing a CHECK violation up a money path — a $0 line item is a legitimate cart state.
    if (!Number.isFinite(row.amount) || round2(row.amount) === 0) {
      logger.warn(
        { idempotencyKey: row.idempotencyKey, feeType: row.feeType, bookingId: row.bookingId },
        "[fee-ledger] skipped a zero-amount fee event (migration 179 forbids the row)",
      );
      continue;
    }
    const res = await db.execute(sql`
      INSERT INTO fee_ledger (
        id, source_type, source_id, booking_id, fee_type, amount, borne_by,
        band_id, rate_as_resolved, rate_source, cap_applied,
        source_attribution, acquisition_ref, stripe_payment_ref,
        idempotency_key, description, metadata
      ) VALUES (
        gen_random_uuid()::text,
        ${row.sourceType}, ${row.sourceId}, ${row.bookingId},
        ${row.feeType}, ${round2(row.amount).toFixed(2)}, ${row.borneBy},
        ${row.bandId}::uuid, ${row.rateAsResolved === null ? null : String(row.rateAsResolved)}, ${row.rateSource},
        ${row.capApplied === true},
        ${row.sourceAttribution ?? "platform"}, ${row.acquisitionRef ?? null}, ${row.stripePaymentRef ?? null},
        ${row.idempotencyKey}, ${row.description ?? null},
        ${JSON.stringify(row.metadata ?? {})}::jsonb
      )
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id
    `);
    inserted += res.rows?.length ?? 0;
  }
  return inserted;
}

/** One deterministic key per booking per fee event — the whole idempotency story. */
export function railsCommissionLedgerKey(bookingId: string): string {
  return `fee-ledger:rails-commission:${bookingId}`;
}

/**
 * Record the rails commission event for every booking in `bookingIds` that carries a rails
 * attribution snapshot.
 *
 * READS THE SNAPSHOT, NEVER RE-RESOLVES. `bookingDetails.railsAttribution` was stamped server-side
 * at claim time by `resolveRailsForItem`; an admin could have re-priced a band in the seconds since,
 * and the ledger must record the rate that was CHARGED, not the rate that would be resolved now.
 *
 * THE WAIVER IS RECORDED HERE, AND IT IS NOT A ZERO ROW — the deviation is deliberate and forced by
 * the table's own contract: migration 179 CHECKs `amount <> 0` precisely so a zero row can never
 * launder a resolution bug. So the waiver rides the commission row as a first-class metadata
 * fact-set (`travelerFeeWaived`, the band that would have priced it, the amount given up, and the
 * §13 flag that the D3 traveler fee is not billed on the direct path today). One row per rails
 * booking, and the waiver is queryable from it.
 */
export async function recordRailsFeeLedger(opts: {
  bookingIds: string[];
  stripePaymentRef?: string | null;
  actor: string;
}): Promise<{ inserted: number; considered: number }> {
  if (opts.bookingIds.length === 0) return { inserted: 0, considered: 0 };

  const res = await db.execute(sql`
    SELECT id, total_amount, provider_id, acquisition_ref,
           booking_details->'railsAttribution' AS rails
      FROM service_bookings
     WHERE id IN (${sql.join(opts.bookingIds.map((id) => sql`${id}`), sql`, `)})
  `);

  const rows: FeeLedgerAppendRow[] = [];
  for (const raw of (res.rows ?? []) as any[]) {
    const rails = raw.rails as any;
    if (!rails || rails.attributed !== true || !rails.rate) continue;
    const bookingId = String(raw.id);
    const subtotal = parseFloat(raw.total_amount || "0");
    const platformRate = Number(rails.rate.platformRate);
    if (!Number.isFinite(platformRate)) continue;
    const commission = round2(subtotal * platformRate);
    const waiver = rails.travelerFeeWaiver ?? null;

    rows.push({
      sourceType: "service_booking",
      sourceId: bookingId,
      bookingId,
      // The fee TYPE names the LANE the booking arrived on; `rate_source` separately names which
      // band decided the number. They differ on purpose in the premium case: a rails booking whose
      // category band undercut `provider_rails` is still a rails booking (`provider_commission_rails`)
      // priced by its own band (`rate_source='band'`) — ruling 48's "rails never RAISES a rate".
      feeType: "provider_commission_rails",
      amount: commission,
      borneBy: "provider",
      bandId: rails.rate.bandId ?? null,
      rateAsResolved: platformRate,
      rateSource: (rails.rate.rateSource ?? "rails") as FeeRateSource,
      capApplied: false,
      sourceAttribution: "rails",
      acquisitionRef: rails.ref ?? raw.acquisition_ref ?? null,
      stripePaymentRef: opts.stripePaymentRef ?? null,
      idempotencyKey: railsCommissionLedgerKey(bookingId),
      description: `Rails commission on booking ${bookingId} (band ${rails.rate.bandKey ?? "unknown"})`,
      metadata: {
        actor: opts.actor,
        shortLinkId: rails.shortLinkId ?? null,
        frame: rails.frame ?? null,
        bandKey: rails.rate.bandKey ?? null,
        railsApplied: rails.rate.railsApplied === true,
        providerShareRate: rails.rate.providerShareRate ?? null,
        // ── THE WAIVER, recorded (see the header for why it is not a zero row) ────────────────
        travelerFeeWaived: waiver ? true : false,
        travelerFeeWaiverBasis: waiver ? "rails" : null,
        travelerFeeBandId: waiver?.bandId ?? null,
        travelerFeeBandKey: waiver?.bandKey ?? null,
        travelerFeeRate: waiver?.rate ?? null,
        travelerFeeWouldHaveBeen: waiver?.wouldHaveBeenAmount ?? null,
        travelerFeeWouldHaveBeenCapApplied: waiver?.wouldHaveBeenCapApplied ?? null,
        // §13: the D3 traveler service fee is resolver-only — the direct path does not bill it
        // today (ruling 45). The waiver above is a band-priced counterfactual, NOT money the
        // traveler used to pay and no longer does.
        travelerFeeBilledOnDirectPathToday: false,
      },
    });
  }

  const inserted = await appendFeeLedgerRows(rows);
  if (rows.length > 0) {
    logger.info(
      { considered: rows.length, inserted, actor: opts.actor, stripePaymentRef: opts.stripePaymentRef ?? null },
      "[fee-ledger] rails commission events recorded",
    );
  }
  return { inserted, considered: rows.length };
}
