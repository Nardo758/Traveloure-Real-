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

function normalizePolicy(raw: string | null | undefined): { type: CancellationPolicyType; defaulted: boolean } {
  if (raw && (POLICY_TYPES as readonly string[]).includes(raw)) {
    return { type: raw as CancellationPolicyType, defaulted: false };
  }
  return { type: 'flexible', defaulted: true };
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
  const { type, defaulted } = normalizePolicy(params.policyType);
  const now = params.now ?? new Date();

  let hoursUntilStart: number | null = null;
  if (params.scheduledDate) {
    const start = parseScheduledInstant(params.scheduledDate);
    if (start) {
      hoursUntilStart = (start.getTime() - now.getTime()) / (1000 * 60 * 60);
    }
  }

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
  | (CancellationRefundQuote & { bookingStatus: string; travelerId: string | null })
  | null
> {
  const rows = await db.execute(sql`
    SELECT sb.status, sb.traveler_id, sb.total_amount, sb.platform_fee, sb.insurance_fee,
           sb.booking_details ->> 'scheduledDate' AS scheduled_date,
           ps.cancellation_policy_type
    FROM service_bookings sb
    LEFT JOIN provider_services ps ON ps.id = sb.service_id
    WHERE sb.id = ${bookingId}
    LIMIT 1
  `);
  const row = rows.rows?.[0] as any;
  if (!row) return null;

  // Refund basis is the FULL amount the traveler was charged — service price + platform fee
  // + insurance fee — per the platform-owner ruling (2026-08-10): the platform fee is refunded
  // at the same policy percent, never silently retained.
  const amountPaid =
    parseFloat(row.total_amount || '0') +
    parseFloat(row.platform_fee || '0') +
    parseFloat(row.insurance_fee || '0');
  const quote = computeCancellationRefund({
    policyType: row.cancellation_policy_type,
    totalAmount: amountPaid,
    scheduledDate: row.scheduled_date,
  });
  return { ...quote, bookingStatus: row.status, travelerId: row.traveler_id ?? null };
}
