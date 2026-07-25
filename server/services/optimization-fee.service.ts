/**
 * AI Concierge fee resolver (CON-A.P2 / FEE-A).
 *
 * Single source of truth for the per-task AI Optimization fee. Every charge path
 * (paid /api/optimization-payments, preview display, trips.routes.ts payment-amount
 * validator) reads through `getFee(eventType, tier)` so admin changes in
 * `optimization_fees` take effect immediately and so the amount-tampering check
 * always recomputes from the same configured values.
 *
 * Resolution order:
 *   1. Event-type-specific row (admin override per experience type, e.g. wedding $49.99). fee-literal-ok: comment
 *   2. Tier-level default row (event_type IS NULL)
 *   3. Code-level DEFAULT_FEE_CENTS fallback (§4.8 standard: $9.99 across tiers). fee-literal-ok: comment
 */
import { and, desc, eq, isNull, or, inArray } from "drizzle-orm";
import { db } from "../db";
import { optimizationFees, feeBands, coordinationFeeCredits } from "@shared/schema";
import { complexityTier } from "./smart-sequencing.service";

// 3.0.1b: Fail-loud resolver. If the DB is missing both the event-type row AND
// the tier-level default, throw instead of silently serving a wrong fallback.
// All required rows are seeded by Migration 076 (verified in 3.0.1a audit).

// Branch mapping: event_type → branch (trip / experience / event)
const BRANCH_MAP: Record<string, string> = {
  vacation: "trip",
  adventure: "trip",
  honeymoon: "trip",
  anniversary: "trip",
  proposal: "experience",
  birthday: "experience",
  wedding: "event",
  corporate: "event",
};

export function getOptimizerBranch(eventType: string | null | undefined): string {
  if (!eventType) return "trip";
  return BRANCH_MAP[eventType] || "trip";
}

export function isEventOptimizer(eventType: string | null | undefined): boolean {
  return getOptimizerBranch(eventType) === "event";
}

export interface ResolvedOptimizationFee {
  priceCents: number;
  currency: string;
  isDisabled: boolean;
  /** Phase 2: true for Event branch optimizers — the $19.99 fee is credited toward the coordination fee. fee-literal-ok: comment */
  creditTowardCoordination: boolean;
}

export async function getFee(
  eventType: string | null | undefined,
  tier: string,
): Promise<ResolvedOptimizationFee> {
  const branch = getOptimizerBranch(eventType);
  const creditTowardCoordination = branch === "event";

  if (eventType) {
    const [evRow] = await db
      .select({
        priceCents: optimizationFees.priceCents,
        currency: optimizationFees.currency,
        isDisabled: optimizationFees.isDisabled,
      })
      .from(optimizationFees)
      .where(and(
        eq(optimizationFees.eventType, eventType),
        eq(optimizationFees.isActive, true),
      ))
      .orderBy(desc(optimizationFees.isDisabled))
      .limit(1);
    if (evRow) {
      return {
        priceCents: evRow.priceCents,
        currency: evRow.currency,
        isDisabled: evRow.isDisabled,
        creditTowardCoordination,
      };
    }
  }

  const [tierRow] = await db
    .select({
      priceCents: optimizationFees.priceCents,
      currency: optimizationFees.currency,
      isDisabled: optimizationFees.isDisabled,
    })
    .from(optimizationFees)
    .where(and(
      eq(optimizationFees.complexityTier, tier),
      isNull(optimizationFees.eventType),
      eq(optimizationFees.isActive, true),
    ))
    .limit(1);

  if (tierRow) {
    return {
      priceCents: tierRow.priceCents,
      currency: tierRow.currency,
      isDisabled: tierRow.isDisabled,
      creditTowardCoordination,
    };
  }

  throw new Error(
    `optimize fee config missing: eventType=${eventType || "null"}, tier=${tier}. ` +
    `Ensure Migration 076 (optimization_fees seed) is applied.`,
  );
}

/**
 * Phase 4: Coordination fee resolver for Events.
 * Uses the greater-of rule: max(floor, percent_of_budget).
 * Ratified defaults: $499 floor, 8% of budget.
 *
 * Phase 4.1 (§7/§8): the floor and percent are now admin-editable fee_bands rows
 * (`coordination_floor` flat-dollars, `coordination_percent` fraction; migration 122).
 * `resolveCoordinationFee` reads them via getFeeBandByKey and FALLS BACK to these
 * constants when a row is absent — so a fresh/unseeded DB behaves identically and
 * the fee floor can never break on a missing row (a fee-floor's safe failure mode).
 * The constants below are the documented fallback default (fee-literal-ok: comment).
 */
const DEFAULT_COORDINATION_FLOOR_CENTS = 499_00; // $499  fee-literal-ok: comment (fallback default)
const DEFAULT_COORDINATION_PERCENT = 0.08; // 8%           fee-literal-ok: comment (fallback default)

export interface ResolvedCoordinationFee {
  feeCents: number;
  currency: string;
  rule: "floor" | "percent";
  /** Phase 3.0.1d: optimize fee credited toward coordination for Events. */
  optimizeCreditCents: number;
  breakdown: {
    floorCents: number;
    percentOfBudget: number;
    appliedPercent: number;
  };
}

/**
 * Read the coordination floor (dollars → cents) and percent (fraction) from the
 * admin-editable fee_bands rows seeded by migration 122, falling back to the
 * ratified code constants when a row is absent or non-positive. Never throws — a
 * bad/missing config row degrades to the safe default rather than breaking the fee.
 */
async function resolveCoordinationParams(): Promise<{ floorCents: number; percent: number }> {
  let floorCents = DEFAULT_COORDINATION_FLOOR_CENTS;
  let percent = DEFAULT_COORDINATION_PERCENT;
  try {
    const [floorRow] = await db
      .select({ defaultRate: feeBands.defaultRate })
      .from(feeBands)
      .where(and(eq(feeBands.bandKey, "coordination_floor"), eq(feeBands.isActive, true)))
      .limit(1);
    const [percentRow] = await db
      .select({ defaultRate: feeBands.defaultRate })
      .from(feeBands)
      .where(and(eq(feeBands.bandKey, "coordination_percent"), eq(feeBands.isActive, true)))
      .limit(1);
    // Honor a present, valid, NON-NEGATIVE row — including an explicit 0 (an admin
    // may genuinely want a $0 floor or 0% percent). Only fall back to the code
    // constant when the row is absent, non-numeric, or negative (an invalid config,
    // never a real intent). This is the "admin can express zero" fix.
    const floorDollars = floorRow ? Number(floorRow.defaultRate) : NaN;
    const pct = percentRow ? Number(percentRow.defaultRate) : NaN;
    if (Number.isFinite(floorDollars) && floorDollars >= 0) floorCents = Math.round(floorDollars * 100);
    if (Number.isFinite(pct) && pct >= 0) percent = pct;
  } catch (err: any) {
    console.warn("[coordination-fee] fee_bands read failed — using fallback constants:", err?.message);
  }
  return { floorCents, percent };
}

export async function resolveCoordinationFee(
  eventType: string,
  budgetCents: number,
  availableCreditCents: number = 0,
): Promise<ResolvedCoordinationFee> {
  // Phase 4.1: read the floor + percent from admin-editable fee_bands (migration 122),
  // falling back to the ratified constants when a row is missing/invalid so a fee floor
  // can never break on config absence.
  const { floorCents, percent } = await resolveCoordinationParams();

  const percentFee = Math.round(budgetCents * percent);
  const rawFeeCents = Math.max(floorCents, percentFee);
  const rule: "floor" | "percent" = rawFeeCents === floorCents ? "floor" : "percent";

  // PAID-SIGNAL CREDIT (§7, ratified Jul 22, 2026). The optimize credit is applied ONLY when a real
  // PAID optimize fee is passed in via availableCreditCents — never inferred from config alone (that
  // was the "unearned discount" the interim refused). This function stays PURE: the caller (the pay
  // route / the /fee quote) looks up the paid credit from the coordination_fee_credits ledger and
  // passes the cents in; nothing is queried or consumed here. Capped at the raw fee so a credit can
  // never make the charge negative.
  const optimizeCreditCents = Math.max(0, Math.min(availableCreditCents, rawFeeCents));
  const feeCents = Math.max(0, rawFeeCents - optimizeCreditCents);

  return {
    feeCents,
    currency: "USD",
    rule,
    optimizeCreditCents,
    breakdown: {
      floorCents,
      percentOfBudget: percentFee,
      appliedPercent: percent,
    },
  };
}

// ── Paid-signal ledger helpers (coordination_fee_credits, migrations 125–126) ─────────
//
// A credit row exists only when a real Event-branch optimize fee was PAID
// (optimization-payments/confirm inserts it). "Available" = not yet consumed by any
// coordination charge.
//
// Event scoping (migration 126, §7 follow-ups resolved):
//   • Credits with a non-null event_type are only eligible for coordinations of the SAME
//     event type — a credit earned on a wedding optimizer can't bleed into a corporate fee.
//   • Credits with event_type IS NULL are legacy "any event" credits (born before strict
//     scoping) and remain eligible for any engagement.
//   • ALL eligible credits are summed (not just the newest one). Two optimize fees paid for
//     the same wedding both credit toward its coordination fee.
//   • Consumption is capped at the gross fee ceiling so credits are never "wasted" on an
//     overpayment that resolveCoordinationFee would discard anyway.

/**
 * Build the WHERE conditions for an event-scoped available-credit lookup.
 * Credits with event_type IS NULL are legacy "any event" rows — always eligible.
 */
function buildCreditConditions(userId: string, eventType?: string | null) {
  const base = [
    eq(coordinationFeeCredits.userId, userId),
    isNull(coordinationFeeCredits.consumedByCoordinationId),
  ] as const;
  if (!eventType) return and(...base);
  return and(
    ...base,
    or(
      eq(coordinationFeeCredits.eventType, eventType),
      isNull(coordinationFeeCredits.eventType),
    ),
  );
}

/** Read-only: sum of all available paid-optimize credits for a user, scoped to the given
 *  event type (legacy null credits are also included). Used by the /fee QUOTE — surfaces
 *  the total credit without consuming anything. */
export async function getAvailableCoordinationCreditCents(
  userId: string,
  eventType?: string | null,
): Promise<number> {
  const rows = await db
    .select({ amountCents: coordinationFeeCredits.amountCents })
    .from(coordinationFeeCredits)
    .where(buildCreditConditions(userId, eventType));
  return rows.reduce((sum, r) => sum + r.amountCents, 0);
}

/** Atomically CONSUME all eligible credits against a coordination, up to grossFeeCents.
 *  (§15: `consumed IS NULL` guard on the UPDATE is the concurrency lock — two coordinations
 *  racing for the same credits, only one UPDATE per row matches.)
 *
 *  Credits are consumed oldest-first so earlier payments are exhausted before newer ones.
 *  The grossFeeCents cap prevents consuming more credit than the fee can absorb — credits
 *  beyond the ceiling are left available for a future engagement.
 *
 *  Returns the total amount consumed in cents (0 if none or all raced away). */
export async function claimCoordinationCredit(
  userId: string,
  coordinationId: string,
  eventType?: string | null,
  grossFeeCents?: number,
): Promise<number> {
  const candidates = await db
    .select({ id: coordinationFeeCredits.id, amountCents: coordinationFeeCredits.amountCents })
    .from(coordinationFeeCredits)
    .where(buildCreditConditions(userId, eventType))
    .orderBy(coordinationFeeCredits.createdAt); // oldest first

  if (candidates.length === 0) return 0;

  // Select IDs to consume (oldest-first) up to the gross fee ceiling.
  // The guard checks BEFORE including each credit: if adding this credit would push
  // the running total past the ceiling, skip it (leave it available for a future
  // engagement). We `continue` rather than `break` so a later, smaller credit can
  // still fill any remaining headroom (handles varying credit sizes).
  const toConsume: string[] = [];
  let runningTotal = 0;
  for (const c of candidates) {
    if (grossFeeCents != null && runningTotal + c.amountCents > grossFeeCents) continue;
    toConsume.push(c.id);
    runningTotal += c.amountCents;
  }
  if (toConsume.length === 0) return 0;

  // Atomic multi-row claim: `consumed IS NULL` guard on each row is the concurrency lock.
  // If another coordination races for the same credits, only one UPDATE per row succeeds.
  const claimed = await db
    .update(coordinationFeeCredits)
    .set({ consumedByCoordinationId: coordinationId, consumedAt: new Date() })
    .where(and(
      inArray(coordinationFeeCredits.id, toConsume),
      isNull(coordinationFeeCredits.consumedByCoordinationId),
    ))
    .returning({ amountCents: coordinationFeeCredits.amountCents });
  return claimed.reduce((sum, r) => sum + r.amountCents, 0);
}

/** Roll back any credit consumed by a coordination (used when a pay attempt fails after claiming,
 *  so the credit returns to the available pool and the next attempt starts clean). */
export async function releaseCoordinationCredit(coordinationId: string): Promise<void> {
  await db
    .update(coordinationFeeCredits)
    .set({ consumedByCoordinationId: null, consumedAt: null })
    .where(eq(coordinationFeeCredits.consumedByCoordinationId, coordinationId));
}
