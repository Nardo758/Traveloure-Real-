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
import { and, eq, isNull, desc } from "drizzle-orm";
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

// ── Paid-signal ledger helpers (coordination_fee_credits, migration 125) ──────────────
//
// A credit row exists only when a real Event-branch optimize fee was PAID
// (optimization-payments/confirm inserts it). "Available" = not yet consumed by any
// coordination charge. We claim the NEWEST available credit for the traveler (the singular
// "$19.99 credited-toward-coordination" promise — accumulating multiple is a filed follow-up).

/** Read-only: the newest available paid-optimize credit for a user, in cents (0 if none). Used by
 *  the /fee QUOTE — surfaces the credit without consuming it. */
export async function getAvailableCoordinationCreditCents(userId: string): Promise<number> {
  const [candidate] = await db
    .select({ amountCents: coordinationFeeCredits.amountCents })
    .from(coordinationFeeCredits)
    .where(and(
      eq(coordinationFeeCredits.userId, userId),
      isNull(coordinationFeeCredits.consumedByCoordinationId),
    ))
    .orderBy(desc(coordinationFeeCredits.createdAt))
    .limit(1);
  return candidate?.amountCents ?? 0;
}

/** Atomically CONSUME the newest available credit against a coordination (§15: the
 *  `consumed IS NULL` guard on the UPDATE is the concurrency lock — two coordinations racing for
 *  the same credit, only one UPDATE matches). Returns the consumed amount in cents (0 if none/raced). */
export async function claimCoordinationCredit(userId: string, coordinationId: string): Promise<number> {
  const [candidate] = await db
    .select({ id: coordinationFeeCredits.id, amountCents: coordinationFeeCredits.amountCents })
    .from(coordinationFeeCredits)
    .where(and(
      eq(coordinationFeeCredits.userId, userId),
      isNull(coordinationFeeCredits.consumedByCoordinationId),
    ))
    .orderBy(desc(coordinationFeeCredits.createdAt))
    .limit(1);
  if (!candidate) return 0;
  const claimed = await db
    .update(coordinationFeeCredits)
    .set({ consumedByCoordinationId: coordinationId, consumedAt: new Date() })
    .where(and(
      eq(coordinationFeeCredits.id, candidate.id),
      isNull(coordinationFeeCredits.consumedByCoordinationId),
    ))
    .returning({ amountCents: coordinationFeeCredits.amountCents });
  return claimed.length > 0 ? claimed[0].amountCents : 0;
}

/** Roll back any credit consumed by a coordination (used when a pay attempt fails after claiming,
 *  so the credit returns to the available pool and the next attempt starts clean). */
export async function releaseCoordinationCredit(coordinationId: string): Promise<void> {
  await db
    .update(coordinationFeeCredits)
    .set({ consumedByCoordinationId: null, consumedAt: null })
    .where(eq(coordinationFeeCredits.consumedByCoordinationId, coordinationId));
}
