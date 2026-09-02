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
import type { FeeLedgerType, FeeRateSource } from "@shared/schema";
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
  /** Stripe refund id — set on a `reversal` row so the refund and the ledger reversal are linked. */
  stripeRefundRef?: string | null;
  /** REQUIRED on a `reversal` row and NULL on every other type (migration-179 CHECK
   *  `fee_ledger_reversal_linkage`): the id of the fee_ledger row this one reverses. */
  reversesLedgerId?: string | null;
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
        source_attribution, acquisition_ref, stripe_payment_ref, stripe_refund_ref,
        reverses_ledger_id, idempotency_key, description, metadata
      ) VALUES (
        gen_random_uuid()::text,
        ${row.sourceType}, ${row.sourceId}, ${row.bookingId},
        ${row.feeType}, ${round2(row.amount).toFixed(2)}, ${row.borneBy},
        ${row.bandId}::uuid, ${row.rateAsResolved === null ? null : String(row.rateAsResolved)}, ${row.rateSource},
        ${row.capApplied === true},
        ${row.sourceAttribution ?? "platform"}, ${row.acquisitionRef ?? null}, ${row.stripePaymentRef ?? null}, ${row.stripeRefundRef ?? null},
        ${row.reversesLedgerId ?? null}, ${row.idempotencyKey}, ${row.description ?? null},
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

/** The traveler-service-fee row (+X) and its optional waiver leg (−X). One deterministic key each,
 *  so a retry / re-drive / webhook-vs-inline race lands EXACTLY ONE of each (same idempotency story
 *  as the rails commission row above). */
export function travelerServiceFeeLedgerKey(bookingId: string): string {
  return `fee-ledger:traveler-fee:${bookingId}`;
}
export function travelerServiceFeeWaiverLedgerKey(bookingId: string): string {
  return `fee-ledger:traveler-fee-waiver:${bookingId}`;
}
/** §15 amount-specific: a partial refund and a later different-amount refund are distinct rows,
 *  while a retry of the SAME refund lands exactly one (ON CONFLICT DO NOTHING). */
export function travelerServiceFeeReversalLedgerKey(bookingId: string, refundAmount: number): string {
  return `fee-ledger:traveler-fee-reversal:${bookingId}:${round2(refundAmount).toFixed(2)}`;
}

/**
 * Record a REVERSAL of a booking's traveler service fee, for a refund (ruling
 * 2026-09-02-traveler-fee-refundability). Writes ONE `reversal` fee_ledger row of `-refundAmount`,
 * linked (`reverses_ledger_id`) to the booking's original `+traveler_service_fee` row, borne by the
 * traveler (the fee is given back). Idempotent per (booking, amount).
 *
 * SUPPRESSED BOOKINGS ARE NOT REVERSED HERE — the caller skips a waived booking entirely (its fee was
 * never billed; the `fee_waiver` leg stays untouched, per the ruling).
 *
 * Returns `reversed:false` with a `reason` (never throws for a missing original row): the money-side
 * refund is the caller's decision, and a missing original row is an ops-visible ledger gap, not a
 * reason to fabricate an unlinked reversal (the CHECK forbids one anyway).
 */
export async function recordTravelerServiceFeeReversal(opts: {
  bookingId: string;
  refundAmount: number; // dollars, > 0 (the fee share being refunded)
  actor: string;
  stripeRefundRef?: string | null;
  reason?: string | null;
}): Promise<{ inserted: number; reversed: boolean; reason?: string }> {
  const refund = round2(opts.refundAmount);
  if (!Number.isFinite(refund) || refund <= 0) return { inserted: 0, reversed: false, reason: "non_positive" };

  // Locate the ORIGINAL +traveler_service_fee row by the deterministic key the +X row was written
  // with (cart + transport both seed the key on the booking id).
  const orig = await db.execute(sql`
    SELECT id, band_id, rate_as_resolved, cap_applied, amount
      FROM fee_ledger
     WHERE idempotency_key = ${travelerServiceFeeLedgerKey(opts.bookingId)}
       AND fee_type = 'traveler_service_fee'
     LIMIT 1
  `);
  const row = (orig.rows ?? [])[0] as any;
  if (!row) {
    logger.error(
      { bookingId: opts.bookingId, refundAmount: refund, actor: opts.actor },
      "[fee-ledger] traveler-fee reversal skipped — original traveler_service_fee row not found (ledger gap)",
    );
    return { inserted: 0, reversed: false, reason: "original_row_missing" };
  }
  const original = String(row.id);
  // Never reverse MORE than was charged (defensive; the caller scales by the tier %).
  const charged = Math.abs(Number(row.amount) || 0);
  const capped = charged > 0 ? Math.min(refund, charged) : refund;
  const hasBand = row.band_id !== null && row.band_id !== undefined;

  const inserted = await appendFeeLedgerRows([
    {
      sourceType: "service_booking",
      sourceId: opts.bookingId,
      bookingId: opts.bookingId,
      feeType: "reversal",
      amount: -capped, // negative: the fee is given back to the traveler
      borneBy: "traveler",
      // A reversal of a band-priced fee names the same band (band-provenance CHECK); if the original
      // carried no band (shouldn't happen for a resolved fee), fall back to a non-band source.
      bandId: hasBand ? String(row.band_id) : null,
      rateAsResolved:
        row.rate_as_resolved === null || row.rate_as_resolved === undefined ? null : Number(row.rate_as_resolved),
      rateSource: hasBand ? "band" : "code_fallback",
      capApplied: row.cap_applied === true,
      stripeRefundRef: opts.stripeRefundRef ?? null,
      reversesLedgerId: original,
      idempotencyKey: travelerServiceFeeReversalLedgerKey(opts.bookingId, capped),
      description: `Traveler service fee refund on booking ${opts.bookingId}${opts.reason ? ` (${opts.reason})` : ""}`,
      metadata: { actor: opts.actor, reversesLedgerId: original, refundAmount: capped },
    },
  ]);
  return { inserted, reversed: inserted > 0 };
}

/**
 * Record the TRAVELER SERVICE FEE event for every booking whose `booking_details.travelerServiceFee`
 * snapshot says a fee was resolved (ruling 2026-09-02-traveler-fee-applies-everywhere).
 *
 * READS THE SNAPSHOT, NEVER RE-RESOLVES — identical posture to `recordRailsFeeLedger`: the fee was
 * stamped server-side at claim time from `resolveTravelerServiceFee` (rate + cap from `fee_bands`,
 * §8/§14), and the ledger must record what was CHARGED, not what a re-priced band would resolve now.
 *
 * TWO SHAPES, ONE CALLER (BLOCKER 1, netting):
 *   - NOT covered → ONE `traveler_service_fee (+X)` row, borne by the traveler.
 *   - covered (Trip Pass or rails) → that SAME `+X` row PLUS a `fee_waiver (−X)` row tagged
 *     `covered_by:trip_pass|rails`, borne by the platform (which gives up the revenue). The pair
 *     nets to $0, so the migration-179 invariant `traveler_paid − provider_credited = SUM(amount)`
 *     holds while the `amount <> 0` CHECK stays intact — the suppressed total is queryable, never
 *     silence.
 *
 * A booking with no positive fee (a $0 line) writes nothing — `appendFeeLedgerRows` skips a zero row.
 */
/**
 * Build the fee-ledger rows for ONE booking's traveler-fee snapshot. Shared by both rails
 * (service_bookings and the legacy `bookings` table) so the +X / −X shape is written ONE way.
 * Returns 0 rows (no fee / no snapshot), 1 row (uncovered), or 2 rows (covered net-zero).
 */
export function buildTravelerServiceFeeRows(
  t: any,
  opts: {
    /** Seeds the deterministic idempotency keys. For a booking this is the booking id; for a
     *  non-booking source (expert review) it is the PaymentIntent id. */
    keySeed: string;
    /** The `booking_id` COLUMN — null for a non-booking event (fee_ledger allows it). */
    bookingId: string | null;
    sourceType: string;
    /** `source_id` — defaults to `keySeed`. */
    sourceId?: string;
    acquisitionRef?: string | null;
    stripePaymentRef?: string | null;
    actor: string;
  },
): { rows: FeeLedgerAppendRow[]; considered: number } {
  if (!t) return { rows: [], considered: 0 };
  // The fee that WOULD have been charged at the resolved band rate + cap. This is the amount of the
  // +X row in both cases; `charged` (0 when waived) is what actually rode the Stripe total.
  const wouldHaveBeen = round2(Number(t.wouldHaveBeen ?? t.charged ?? 0));
  if (!Number.isFinite(wouldHaveBeen) || wouldHaveBeen <= 0) return { rows: [], considered: 0 };
  const { keySeed, bookingId } = opts;
  const sourceId = opts.sourceId ?? keySeed;
  const waived = t.waived === true;
  const waiverBasis: string | null = waived ? (t.waiverBasis ?? null) : null;
  const bandId = t.bandId ?? null;
  const rate = t.rate ?? null;
  const capApplied = t.capApplied === true;
  const rows: FeeLedgerAppendRow[] = [];

  // +X — the fee itself. Present whether or not it was waived (the waiver leg nets it, so the
  // gross fee stays visible and the suppressed total is derivable).
  rows.push({
    sourceType: opts.sourceType,
    sourceId,
    bookingId,
    feeType: "traveler_service_fee",
    amount: wouldHaveBeen,
    borneBy: "traveler",
    bandId,
    rateAsResolved: rate,
    rateSource: "band",
    capApplied,
    acquisitionRef: opts.acquisitionRef ?? null,
    stripePaymentRef: opts.stripePaymentRef ?? null,
    idempotencyKey: travelerServiceFeeLedgerKey(keySeed),
    description: `Traveler service fee on ${opts.sourceType} ${sourceId} (band ${t.bandKey ?? "unknown"})`,
    metadata: {
      actor: opts.actor,
      bandKey: t.bandKey ?? null,
      chargedAmount: round2(Number(t.charged ?? 0)),
      waived,
      waiverBasis,
    },
  });

  // −X — the waiver leg, only when covered. Borne by the PLATFORM (it gives up the revenue).
  if (waived) {
    rows.push({
      sourceType: opts.sourceType,
      sourceId,
      bookingId,
      feeType: "fee_waiver",
      amount: -wouldHaveBeen,
      borneBy: "platform",
      bandId,
      rateAsResolved: rate,
      rateSource: "band",
      capApplied,
      // `source_attribution` names WHY it was waived on this money-input table: a rails waiver is
      // rails-attributed, a Trip-Pass waiver is a platform product coverage.
      sourceAttribution: waiverBasis === "rails" ? "rails" : "platform",
      acquisitionRef: opts.acquisitionRef ?? null,
      stripePaymentRef: opts.stripePaymentRef ?? null,
      idempotencyKey: travelerServiceFeeWaiverLedgerKey(keySeed),
      description: `Traveler service fee WAIVED on ${opts.sourceType} ${sourceId} (covered_by:${waiverBasis ?? "unknown"})`,
      metadata: {
        actor: opts.actor,
        bandKey: t.bandKey ?? null,
        covered_by: waiverBasis, // 'trip_pass' | 'rails'
        waivedAmount: wouldHaveBeen,
      },
    });
  }
  return { rows, considered: 1 };
}

export async function recordTravelerServiceFeeLedger(opts: {
  bookingIds: string[];
  stripePaymentRef?: string | null;
  actor: string;
}): Promise<{ inserted: number; considered: number }> {
  if (opts.bookingIds.length === 0) return { inserted: 0, considered: 0 };

  const res = await db.execute(sql`
    SELECT id, acquisition_ref,
           booking_details->'travelerServiceFee' AS tfee
      FROM service_bookings
     WHERE id IN (${sql.join(opts.bookingIds.map((id) => sql`${id}`), sql`, `)})
  `);

  const rows: FeeLedgerAppendRow[] = [];
  let considered = 0;
  for (const raw of (res.rows ?? []) as any[]) {
    const built = buildTravelerServiceFeeRows(raw.tfee, {
      keySeed: String(raw.id),
      bookingId: String(raw.id),
      sourceType: "service_booking",
      acquisitionRef: raw.acquisition_ref ?? null,
      stripePaymentRef: opts.stripePaymentRef ?? null,
      actor: opts.actor,
    });
    rows.push(...built.rows);
    considered += built.considered;
  }

  const inserted = await appendFeeLedgerRows(rows);
  if (rows.length > 0) {
    logger.info(
      { considered, inserted, actor: opts.actor, stripePaymentRef: opts.stripePaymentRef ?? null },
      "[fee-ledger] traveler service fee events recorded",
    );
  }
  return { inserted, considered };
}

/**
 * Legacy `bookings` rail (ruling E: reachable → billed for parity). Same +X/−X shape, read from
 * `bookings.booking_metadata->travelerServiceFee` (the legacy table has no `booking_details`), with
 * `sourceType:"booking"`. Written at payment confirmation; idempotent per booking id.
 */
export async function recordLegacyBookingTravelerFeeLedger(opts: {
  bookingId: string;
  stripePaymentRef?: string | null;
  actor: string;
}): Promise<{ inserted: number; considered: number }> {
  const res = await db.execute(sql`
    SELECT booking_metadata->'travelerServiceFee' AS tfee
      FROM bookings WHERE id = ${opts.bookingId} LIMIT 1
  `);
  const raw = (res.rows ?? [])[0] as any;
  const built = buildTravelerServiceFeeRows(raw?.tfee, {
    keySeed: String(opts.bookingId),
    bookingId: String(opts.bookingId),
    sourceType: "booking",
    stripePaymentRef: opts.stripePaymentRef ?? null,
    actor: opts.actor,
  });
  const inserted = await appendFeeLedgerRows(built.rows);
  if (built.rows.length > 0) {
    logger.info(
      { considered: built.considered, inserted, actor: opts.actor, bookingId: opts.bookingId },
      "[fee-ledger] legacy-rail traveler service fee event recorded",
    );
  }
  return { inserted, considered: built.considered };
}

/**
 * Expert review service (ruling path 5). No booking row — the fee event is keyed on the verified
 * PaymentIntent id, `sourceType:"expert_request"`, `booking_id` NULL. Snapshot comes from the PI
 * metadata (Stripe's own word — server-verified, §14). Idempotent per PI; best-effort at the caller.
 */
export async function recordExpertReviewTravelerFeeLedger(opts: {
  paymentIntentId: string;
  snapshot: any;
  actor: string;
}): Promise<{ inserted: number; considered: number }> {
  const built = buildTravelerServiceFeeRows(opts.snapshot, {
    keySeed: opts.paymentIntentId,
    bookingId: null,
    sourceType: "expert_request",
    sourceId: opts.paymentIntentId,
    stripePaymentRef: opts.paymentIntentId,
    actor: opts.actor,
  });
  const inserted = await appendFeeLedgerRows(built.rows);
  if (built.rows.length > 0) {
    logger.info(
      { considered: built.considered, inserted, actor: opts.actor, paymentIntentId: opts.paymentIntentId },
      "[fee-ledger] expert-review traveler service fee event recorded",
    );
  }
  return { inserted, considered: built.considered };
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
        // Ruling 2026-09-02-traveler-fee-applies-everywhere: the traveler fee IS billed on the direct
        // path now, and a rails-waived line's suppression is recorded authoritatively as its own
        // `fee_waiver (−X)` leg (recordTravelerServiceFeeLedger). This metadata is the informational
        // echo on the commission row; the flag is now true to match the money truth.
        travelerFeeBilledOnDirectPathToday: true,
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
