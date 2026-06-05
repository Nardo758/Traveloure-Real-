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
 *   1. Event-type-specific row (admin override per experience type, e.g. wedding $49.99)
 *   2. Tier-level default row (event_type IS NULL)
 *   3. Code-level DEFAULT_FEE_CENTS fallback (§4.8 standard: $9.99 across tiers)
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { optimizationFees } from "@shared/schema";

// §4.8 default standard fee, used only when the DB has no row at all.
// Per §4.8, event-type overrides ($49.99 for wedding/proposal/corporate) live as
// seeded DB rows — not as code constants — so admins can edit them at runtime.
const DEFAULT_FEE_CENTS: Record<string, number> = {
  simple: 999,
  standard: 999,
  complex: 999,
};

export interface ResolvedOptimizationFee {
  priceCents: number;
  currency: string;
  isDisabled: boolean;
}

export async function getFee(
  eventType: string | null | undefined,
  tier: string,
): Promise<ResolvedOptimizationFee> {
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
    priceCents: tierRow?.priceCents ?? DEFAULT_FEE_CENTS[tier] ?? 999,
    currency: tierRow?.currency ?? "USD",
    isDisabled: tierRow?.isDisabled ?? false,
  };
}
