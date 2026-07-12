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
  /** Phase 3.0.1d: optimize fee credited toward coordination for Events. */
  optimizeCreditCents: number;
  breakdown: {
    floorCents: number;
    percentOfBudget: number;
    appliedPercent: number;
  };
}

export async function resolveCoordinationFee(
  eventType: string,
  budgetCents: number,
): Promise<ResolvedCoordinationFee> {
  // TODO: Phase 4.1 — read coordination fee config from DB rows when available.
  // For now, use the ratified defaults as the fallback.
  const floorCents = DEFAULT_COORDINATION_FLOOR_CENTS;
  const percent = DEFAULT_COORDINATION_PERCENT;

  const percentFee = Math.round(budgetCents * percent);
  const rawFeeCents = Math.max(floorCents, percentFee);
  const rule: "floor" | "percent" = rawFeeCents === floorCents ? "floor" : "percent";

  // D-CREDIT (interim): NO optimize-fee credit is applied here. The credit was previously
  // subtracted unconditionally for every event type based on config alone (isEventOptimizer),
  // with no signal that the traveler actually PAID an optimize fee — the payment record
  // (optimization.routes.ts confirm) ties to itinerary_comparisons/platform_revenue, never to a
  // coordination state (explicit TODO there). Crediting an unpaid fee is an unearned discount, so
  // the honest interim charges the correct floor-or-percent with no credit.
  // Follow-up (filed): record/lookup the paid optimize fee per coordination state, then credit only
  // when actually paid. The optimize-fee config (getFee / creditTowardCoordination) is left intact.
  const optimizeCreditCents = 0;
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
