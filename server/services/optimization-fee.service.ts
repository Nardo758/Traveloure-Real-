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
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { optimizationFees } from "@shared/schema";

// §4.8 default standard fee, used only when the DB has no row at all.
// Phase 2 reframe: $5.99 Trip/Experience, $19.99 Event. fee-literal-ok: comment
// Per correction brief, all event-type overrides are seeded DB rows — not code constants.
const DEFAULT_FEE_CENTS: Record<string, number> = {
  simple: 599,
  standard: 599,
  complex: 599,
};

// Branch mapping: event_type → branch (trip / experience / event)
// Used for credit-toward-coordination logic and branch-conditional copy.
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

  return {
    priceCents: tierRow?.priceCents ?? DEFAULT_FEE_CENTS[tier] ?? 599,
    currency: tierRow?.currency ?? "USD",
    isDisabled: tierRow?.isDisabled ?? false,
    creditTowardCoordination,
  };
}

/**
 * Phase 4: Coordination fee resolver for Events.
 * Reads from the same optimization_fees table OR a dedicated coordination fee config.
 * For now: uses the greater-of rule: max(floor, percent_of_budget).
 * Ratified defaults: $499 floor, 8% of budget.
 * All values are admin-configurable via DB rows.
 */
const DEFAULT_COORDINATION_FLOOR_CENTS = 499_00; // $499
const DEFAULT_COORDINATION_PERCENT = 0.08; // 8%

export interface ResolvedCoordinationFee {
  feeCents: number;
  currency: string;
  rule: "floor" | "percent";
  breakdown: {
    floorCents: number;
    percentOfBudget: number;
    appliedPercent: number;
  };
}

export async function resolveCoordinationFee(
  eventType: string,
  budgetCents: number
): Promise<ResolvedCoordinationFee> {
  // TODO: Phase 4.1 — read coordination fee config from DB rows when available.
  // For now, use the ratified defaults as the fallback.
  const floorCents = DEFAULT_COORDINATION_FLOOR_CENTS;
  const percent = DEFAULT_COORDINATION_PERCENT;

  const percentFee = Math.round(budgetCents * percent);
  const feeCents = Math.max(floorCents, percentFee);
  const rule: "floor" | "percent" = feeCents === floorCents ? "floor" : "percent";

  return {
    feeCents,
    currency: "USD",
    rule,
    breakdown: {
      floorCents,
      percentOfBudget: percentFee,
      appliedPercent: percent,
    },
  };
}
