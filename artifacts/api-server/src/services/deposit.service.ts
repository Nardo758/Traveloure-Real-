/**
 * DEPOSITS / PARTIAL PAYMENTS — server-side config resolution (Lane 7, DECISIONS.md ruling 72).
 *
 * RATIFIED DESIGN (decision-maker, Aug 11 2026): MANUAL BALANCE + PROVIDER OPT-IN PER LISTING.
 * This module holds the ONE place a deposit amount is derived — server-side, from the listing's
 * persisted deposit config × the server-side line total (§14/§18: never from req.body). A listing
 * with deposits OFF resolves to `null` and checks out EXACTLY as today (§13, byte-identical).
 *
 * The deposit percentage / flat amount is OWNER LISTING CONFIG (provider business data on their own
 * listing, like `price`), NOT a platform fee/commission rate — nothing here multiplies a platform
 * take or selects a fee band, so §8/§18's "rate resolves from fee_bands only" does not apply and no
 * fee literal is involved.
 *
 * The deposit is a fraction of the LINE'S FULL CHARGE (price + platform fee), so
 *   depositAmount + balanceAmount === lineTotal  (the traveler pays the same total, split in time).
 * `total_amount`/`platform_fee`/`provider_earnings` on the booking stay the FULL values — the split
 * is the PAYMENT SCHEDULE, not a re-split — so completion (D8) and earnings math are untouched.
 */
import { depositTypeEnum } from "@workspace/db";

/** Round to cents the same way the rest of checkout does (`.toFixed(2)` accumulation). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The persisted deposit config on a provider_services row (only the fields this module reads). */
export interface DepositConfig {
  depositEnabled?: boolean | null;
  depositType?: string | null;
  depositPercentage?: number | null;
  depositFlatAmount?: string | number | null;
}

export interface DepositPlan {
  /** Charged NOW at the deposit checkout (server-derived). Strictly 0 < depositAmount < lineTotal. */
  depositAmount: number;
  /** Collected at the SECOND (balance) checkout. Strictly balanceAmount = lineTotal − depositAmount. */
  balanceAmount: number;
}

/**
 * Resolve the deposit split for ONE cart line, or `null` when this line takes no deposit.
 *
 * Returns `null` (⇒ charge the full line now, unchanged) when: deposits are OFF for the listing; the
 * config is incomplete/invalid; or the computed deposit would be ≤ 0 or ≥ the line total (a deposit
 * that is the whole charge is not a deposit — it is a full payment, so it degrades to one honestly).
 *
 * `lineTotal` is the SERVER-DERIVED full charge for the line (price + platform fee). No client value
 * reaches this function.
 */
export function resolveDepositPlan(config: DepositConfig, lineTotal: number): DepositPlan | null {
  if (!config?.depositEnabled) return null;
  if (!Number.isFinite(lineTotal) || lineTotal <= 0) return null;

  const type = config.depositType ?? null;
  let depositAmount: number;

  if (type === "percentage") {
    const pct = Number(config.depositPercentage);
    if (!Number.isFinite(pct) || pct < 1 || pct > 100) return null;
    depositAmount = round2((lineTotal * pct) / 100);
  } else if (type === "flat") {
    const flat = Number(config.depositFlatAmount);
    if (!Number.isFinite(flat) || flat <= 0) return null;
    depositAmount = round2(flat);
  } else {
    // Unknown / unset deposit type ⇒ no deposit (never guessed — §13).
    return null;
  }

  // A deposit is a PARTIAL payment by definition. Degrade to full-charge-now honestly otherwise.
  if (depositAmount <= 0 || depositAmount >= lineTotal) return null;

  return { depositAmount, balanceAmount: round2(lineTotal - depositAmount) };
}

/** Narrow guard used by the schema/wizard docs and tests. */
export const DEPOSIT_TYPES: readonly string[] = depositTypeEnum;

/**
 * Derive the balance cutoff for a booking from EXISTING listing/booking facts (never invented, §13).
 *
 * Order of strength, mirroring booking-completion.service's date resolution:
 *   1. a resolvable SERVICE DATE (the booked-slot date, else the purchase-time `scheduledDate`
 *      snapshot), minus the listing's change window (`changeCutoffHours`, else `leadTimeHours`) —
 *      the balance must be settled before the service can no longer be changed;
 *   2. otherwise `null` — the platform does not hold a date this can key on, so the cutoff is
 *      UNKNOWN (and the overdue detector honestly reports nothing for it, never a guessed deadline).
 *
 * @returns an ISO Date, or null when no honest cutoff can be derived.
 */
export function resolveBalanceDueAt(input: {
  serviceDate?: string | null; // YYYY-MM-DD (booked slot or scheduledDate), already resolved server-side
  changeCutoffHours?: number | null;
  leadTimeHours?: number | null;
}): Date | null {
  const raw = (input.serviceDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const serviceMs = Date.parse(`${raw}T00:00:00Z`);
  if (!Number.isFinite(serviceMs)) return null;
  const windowHours =
    Number.isFinite(Number(input.changeCutoffHours)) && Number(input.changeCutoffHours) > 0
      ? Number(input.changeCutoffHours)
      : Number.isFinite(Number(input.leadTimeHours)) && Number(input.leadTimeHours) > 0
        ? Number(input.leadTimeHours)
        : 0;
  return new Date(serviceMs - windowHours * 3600 * 1000);
}
