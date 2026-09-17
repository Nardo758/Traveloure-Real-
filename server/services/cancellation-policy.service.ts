/**
 * Cancellation policy enforcement (Task: enforce cancellation policies + refund preview).
 *
 * Services carry a `cancellation_policy_type` (shared/schema.ts cancellationPolicyTypeEnum:
 * flexible | moderate | strict | non_refundable). Before this module it was DISPLAY-ONLY —
 * the refund path always refunded the full total regardless of timing. This module is the
 * single source of truth for how much a traveler gets back when cancelling, computed from
 * the policy type and the time remaining until the booking's scheduled start.
 *
 * Schedule (percent of total refunded, by hours until the scheduled start):
 *   flexible        — 100% when ≥24h before start; 0% inside 24h.
 *   moderate        — 100% when ≥5 days; 50% when ≥48h; 0% inside 48h.
 *   strict          — 50% when ≥7 days; 0% inside 7 days.
 *   non_refundable  — 0% always; the automatic refund is REFUSED with a clear message.
 *
 * Edge cases (deliberate, documented):
 *   - NULL/unknown policy type → treated as `flexible` (the owner never declared a policy;
 *     the traveler must not be penalised for that).
 *   - No parseable scheduled date on the booking → the policy's MOST GENEROUS tier applies
 *     (we cannot compute time-to-start, so we cannot justify a deduction). non_refundable
 *     still refunds 0 — it is timing-independent.
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import { logger } from '../infrastructure/logger';
import { travelerChargeForRow } from './traveler-charge';

export type CancellationPolicyType = 'flexible' | 'moderate' | 'strict' | 'non_refundable';

export interface CancellationRefundQuote {
  policyType: CancellationPolicyType;
  /** True when the policy was missing/unknown and defaulted to flexible. */
  policyDefaulted: boolean;
  /** Whole-percent share of totalAmount refunded (0–100). */
  refundPercent: number;
  /** Dollar amount refunded, rounded to cents. */
  refundAmount: number;
  totalAmount: number;
  /** Hours until scheduled start; null when no scheduled date could be resolved. */
  hoursUntilStart: number | null;
  /** False ONLY for non_refundable — automatic refunds must be refused outright. */
  automaticRefundAllowed: boolean;
  /** Traveler-facing explanation of the outcome. */
  message: string;
}

const POLICY_TYPES: readonly CancellationPolicyType[] = ['flexible', 'moderate', 'strict', 'non_refundable'];
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const NAIVE_DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/i;

/**
 * THE ONE normalization of a stored policy value (exported for the bundle component-cancel rail, which
 * reads the tier off the purchase-time `offering_contract_snapshot` and must default a missing/unknown
 * value exactly as the whole-row quote does — §18 rule 1; a second copy of "NULL means flexible" is how
 * a component cancel and a booking cancel start disagreeing about the same listing).
 */
export function normalizeCancellationPolicy(raw: string | null | undefined): { type: CancellationPolicyType; defaulted: boolean } {
  if (raw && (POLICY_TYPES as readonly string[]).includes(raw)) {
    return { type: raw as CancellationPolicyType, defaulted: false };
  }
  return { type: 'flexible', defaulted: true };
}

/**
 * WHICH RECORD ANSWERED "what policy was this booking bought under?" — a reader that cannot say this
 * cannot be trusted about the rest (§13, the `componentStateSource` posture).
 *
 *   `purchase_snapshot` — `service_bookings.offering_contract_snapshot.policy.cancellationPolicyType`
 *                         (migration 291): the listing's tier AT PURCHASE, the one the traveler
 *                         contracted with. A seller who tightens their policy afterwards moves nothing.
 *   `live_listing`      — the `provider_services.cancellation_policy_type` join, read ONLY when the row
 *                         carries NO snapshot (a booking committed before migration 291, or one whose
 *                         snapshot composition failed). An explicit, logged fallback — never silent.
 */
export type CancellationPolicySource = 'purchase_snapshot' | 'live_listing';

/**
 * THE ONE STRUCTURAL PARSE of the purchase-time snapshot's policy tier, shared by the whole-row quote
 * (`resolveBookingCancellationPolicy`) and the bundle component-cancel rail
 * (`resolveSnapshottedCancellationTerms`) — §18 rule 1. A second reading of the same blob is how the
 * two rails start disagreeing about which tier a booking was sold under.
 *
 * `found` is about the SNAPSHOT, not the tier: a snapshot whose `policy.cancellationPolicyType` is NULL
 * is FOUND with a null raw value — "the listing declared no policy at purchase", which the ONE
 * normalizer turns into `flexible, defaulted: true`. That is a different fact from "this row was never
 * snapshotted", which is `found: false` (§13).
 */
export function readSnapshotPolicyType(
  offeringContractSnapshot: unknown,
): { found: true; raw: string | null } | { found: false } {
  if (!offeringContractSnapshot || typeof offeringContractSnapshot !== 'object') return { found: false };
  const policy = (offeringContractSnapshot as { policy?: unknown }).policy;
  if (!policy || typeof policy !== 'object' || !('cancellationPolicyType' in (policy as object))) {
    return { found: false };
  }
  const raw = (policy as { cancellationPolicyType?: unknown }).cancellationPolicyType;
  return { found: true, raw: typeof raw === 'string' ? raw : null };
}

/**
 * OC-B1's stated gap, closed (ledger `2026-09-17-ld50-remainder-and-artifact-refund`). The whole-row
 * cancel/refund rail used to read the LIVE listing's `cancellation_policy_type`, so a seller who
 * tightened their policy tightened it RETROACTIVELY for every outstanding booking — the exact
 * retroactive move `service_bookings.offering_contract_snapshot` (migration 291) was recorded to stop,
 * and which the bundle component-cancel rail already refuses to make. Both rails now read the SAME
 * pinned tier through the SAME parse above, so a component cancelled at instant T and the whole booking
 * cancelled at T resolve the same tier.
 *
 * §13 — THE FALLBACK IS EXPLICIT AND LOGGED, NEVER SILENT. A row with NO snapshot (pre-291, or a
 * committed booking whose snapshot composition failed — §15b lets a snapshot fail without failing the
 * booking) has no pinned tier to read, and REFUSING the cancellation for that would strand every legacy
 * traveler behind a record-keeping gap they had no part in. So the live listing is read, the source is
 * NAMED on the quote (`policySource: 'live_listing'`), and one notice is logged per resolution so the
 * remaining unsnapshotted population is visible rather than assumed empty. The component rail refuses
 * instead, and correctly: it exists only for bundles bought after 307, which are snapshotted by
 * construction.
 */
export function resolveBookingCancellationPolicy(input: {
  offeringContractSnapshot: unknown;
  liveListingPolicyType: string | null | undefined;
  /** For the log line only — grants nothing and changes no arithmetic. */
  bookingId?: string;
}): { policyType: string | null; source: CancellationPolicySource } {
  const snap = readSnapshotPolicyType(input.offeringContractSnapshot);
  if (snap.found) return { policyType: snap.raw, source: 'purchase_snapshot' };
  logger.info(
    { bookingId: input.bookingId ?? null, livePolicyType: input.liveListingPolicyType ?? null },
    '[cancellation-policy] no purchase-time contract snapshot on this booking — quoting from the LIVE listing policy (pre-291 row); the tier it was sold under is not on record',
  );
  return { policyType: input.liveListingPolicyType ?? null, source: 'live_listing' };
}

function parseScheduledInstant(raw: string): Date | null {
  const normalized = raw.trim();
  const explicitInstant = DATE_ONLY_RE.test(normalized)
    ? `${normalized}T00:00:00Z`
    : NAIVE_DATE_TIME_RE.test(normalized)
      ? `${normalized}Z`
      : normalized;
  const parsed = new Date(explicitInstant);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * THE ONE deadline arithmetic: hours from `now` until the booking's scheduled start, or NULL when no
 * parseable scheduled date exists (⇒ the most generous tier, see the header). Extracted from
 * `computeCancellationRefund` so the bundle component-cancel rail reads the SAME parse of the SAME
 * `booking_details.scheduledDate` — a component cancelled at instant T and the whole booking cancelled
 * at T must resolve the same tier, or the traveler's answer depends on which button they pressed.
 */
export function hoursUntilScheduledStart(scheduledDate: string | null | undefined, now: Date): number | null {
  if (!scheduledDate) return null;
  const start = parseScheduledInstant(scheduledDate);
  if (!start) return null;
  return (start.getTime() - now.getTime()) / (1000 * 60 * 60);
}

/** Percent refunded for a policy given hours-until-start (null = unknown → most generous tier). */
export function refundPercentFor(policy: CancellationPolicyType, hoursUntilStart: number | null): number {
  switch (policy) {
    case 'non_refundable':
      return 0;
    case 'flexible':
      if (hoursUntilStart === null) return 100;
      return hoursUntilStart >= 24 ? 100 : 0;
    case 'moderate':
      if (hoursUntilStart === null) return 100;
      if (hoursUntilStart >= 120) return 100;
      if (hoursUntilStart >= 48) return 50;
      return 0;
    case 'strict':
      if (hoursUntilStart === null) return 50;
      return hoursUntilStart >= 168 ? 50 : 0;
  }
}

function describeOutcome(
  policy: CancellationPolicyType,
  percent: number,
  refundAmount: number,
  hoursUntilStart: number | null,
): string {
  const amt = `$${refundAmount.toFixed(2)}`;
  if (policy === 'non_refundable') {
    return 'This service is non-refundable. Cancelling will not issue an automatic refund — contact the provider or support if you believe an exception applies.';
  }
  if (percent === 100) {
    return `You will receive a full refund of ${amt}.`;
  }
  if (percent > 0) {
    return `Under this service's ${policy} cancellation policy, you will receive a ${percent}% refund of ${amt}.`;
  }
  if (hoursUntilStart !== null) {
    return `Under this service's ${policy} cancellation policy, the free-cancellation window has passed — cancelling now issues no refund.`;
  }
  return `Under this service's ${policy} cancellation policy, cancelling now issues no refund.`;
}

export function computeCancellationRefund(params: {
  policyType: string | null | undefined;
  totalAmount: number;
  scheduledDate: string | null | undefined;
  now?: Date;
}): CancellationRefundQuote {
  const { type, defaulted } = normalizeCancellationPolicy(params.policyType);
  const now = params.now ?? new Date();
  const hoursUntilStart = hoursUntilScheduledStart(params.scheduledDate, now);
  const refundPercent = refundPercentFor(type, hoursUntilStart);
  const total = isFinite(params.totalAmount) ? Math.max(params.totalAmount, 0) : 0;
  const refundAmount = Math.round(total * refundPercent) / 100; // percent of dollars, rounded to cents

  return {
    policyType: type,
    policyDefaulted: defaulted,
    refundPercent,
    refundAmount,
    totalAmount: total,
    hoursUntilStart,
    automaticRefundAllowed: type !== 'non_refundable',
    message: describeOutcome(type, refundPercent, refundAmount, hoursUntilStart),
  };
}

/**
 * Load a service booking + its service's policy and quote the cancellation refund.
 * Returns null when the booking does not exist. Transport/legacy bookings whose
 * service_id is NULL have no declared policy → flexible default (see header).
 */
export async function quoteCancellationForBooking(bookingId: string): Promise<
  | (CancellationRefundQuote & {
      bookingStatus: string;
      travelerId: string | null;
      /** WHICH record the tier came from — the pinned snapshot, or the live listing fallback (§13). */
      policySource: CancellationPolicySource;
    })
  | null
> {
  const rows = await db.execute(sql`
    SELECT sb.status, sb.traveler_id, sb.total_amount, sb.platform_fee, sb.insurance_fee,
           sb.booking_details ->> 'scheduledDate' AS scheduled_date,
           sb.booking_details -> 'travelerCharge' ->> 'conciergeFee' AS traveler_charge_concierge_fee,
           sb.offering_contract_snapshot,
           ps.cancellation_policy_type
    FROM service_bookings sb
    LEFT JOIN provider_services ps ON ps.id = sb.service_id
    WHERE sb.id = ${bookingId}
    LIMIT 1
  `);
  const row = rows.rows?.[0] as any;
  if (!row) return null;

  // Refund basis is the FULL amount the traveler was charged, read through the ONE
  // `travelerChargeForRow` (§18 rule 1, ledger 2026-09-08-cart-fee-line) so a quote can never
  // promise back more than the charge took. A row priced under A3 was charged price + travel
  // surcharge + concierge — the commission and the insurance were withheld from the PAYOUT, never
  // billed. A PRE-A3 row keeps the previous basis exactly (`total_amount + platform_fee +
  // insurance_fee`, platform-owner ruling 2026-08-10: the platform fee is refunded at the same
  // policy percent, never silently retained), because that is what it was charged.
  const { amount: amountPaid } = travelerChargeForRow({
    totalAmount: row.total_amount,
    platformFee: row.platform_fee,
    insuranceFee: row.insurance_fee,
    conciergeFeeSnapshot: row.traveler_charge_concierge_fee ?? null,
  });
  // OC-B1 (ledger `2026-09-17-ld50-remainder-and-artifact-refund`): THE TIER IS THE PINNED ONE. The
  // live `ps.cancellation_policy_type` above is now the EXPLICIT fallback for a row that carries no
  // purchase-time snapshot, and only that — never the first answer. One resolver, both rails.
  const { policyType, source } = resolveBookingCancellationPolicy({
    offeringContractSnapshot: row.offering_contract_snapshot,
    liveListingPolicyType: row.cancellation_policy_type,
    bookingId,
  });
  const quote = computeCancellationRefund({
    policyType,
    totalAmount: amountPaid,
    scheduledDate: row.scheduled_date,
  });
  return { ...quote, bookingStatus: row.status, travelerId: row.traveler_id ?? null, policySource: source };
}

/**
 * THE SNAPSHOTTED TERMS for a bundle COMPONENT the traveler cancels (Locked Decision 50, third paragraph:
 * "the component's allocated amount follows the SNAPSHOTTED cancellation policy and deadline"; ledger
 * `2026-09-16-bundle-component-traveler-cancel`).
 *
 * WHICH SNAPSHOT. The tier is `service_bookings.offering_contract_snapshot.policy.cancellationPolicyType`
 * (migration 291) — the BUNDLE listing's policy AT PURCHASE, the one listing the traveler contracted with.
 * A component listing's own policy was never shown to them and is not an input. Reading the live
 * `provider_services.cancellation_policy_type` here would be exactly the retroactive tightening that
 * snapshot exists to stop, and `quoteCancellationForBooking`'s live join is NOT reused for that reason.
 * The deadline is the booking's own `booking_details.scheduledDate` through `hoursUntilScheduledStart`
 * — a bundle is ONE booking under ONE service window, so its components share the deadline.
 *
 * §13 — THE ABSENCES. NO snapshot on the row (a booking committed before migration 291, or one whose
 * composition failed and was committed without it) ⇒ `policy_snapshot_missing`: the tier the traveler
 * bought under is unknown, and the rail REFUSES the cancel rather than apply today's listing or a
 * default. A snapshot whose policy is NULL is a different fact — "the listing declared no policy at
 * purchase" — and takes the ONE normalizer's stance (flexible, `policyDefaulted: true`), exactly as a
 * whole-row cancel of the same booking would. No scheduled date ⇒ NULL hours ⇒ the most generous tier,
 * the header's documented edge case, never a deduction we cannot justify.
 *
 * PURE: reads its inputs, resolves nothing else, writes nothing. The caller pins `refundPercent` on the
 * component row inside the atomic flip; nothing downstream re-runs this.
 */
export type SnapshottedCancellationTerms =
  | {
      ok: true;
      policyType: CancellationPolicyType;
      policyDefaulted: boolean;
      hoursUntilStart: number | null;
      refundPercent: number;
    }
  | { ok: false; reason: "policy_snapshot_missing" };

export function resolveSnapshottedCancellationTerms(params: {
  offeringContractSnapshot: unknown;
  scheduledDate: string | null | undefined;
  now: Date;
}): SnapshottedCancellationTerms {
  // ONE structural parse, shared with the whole-row quote's `resolveBookingCancellationPolicy`
  // (§18 rule 1 — ledger `2026-09-17-ld50-remainder-and-artifact-refund`). The two rails differ only
  // in what they do with `found: false`: this one REFUSES (a bundle bought after 307 is snapshotted by
  // construction, so an absent snapshot is a row no writer of this rail produced), the whole-row one
  // falls back to the live listing explicitly and logs it (a legacy population it must still serve).
  const snap = readSnapshotPolicyType(params.offeringContractSnapshot);
  if (!snap.found) return { ok: false, reason: "policy_snapshot_missing" };
  const { type, defaulted } = normalizeCancellationPolicy(snap.raw);
  const hoursUntilStart = hoursUntilScheduledStart(params.scheduledDate, params.now);
  return { ok: true, policyType: type, policyDefaulted: defaulted, hoursUntilStart, refundPercent: refundPercentFor(type, hoursUntilStart) };
}
