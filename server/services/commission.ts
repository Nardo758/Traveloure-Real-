/**
 * Commission Resolution Service
 * Single source of truth for all platform/expert fee splits.
 *
 * Policy (first match wins):
 *   AI-sourced       → platform 1.00  (item has no provider/expert source)
 *   Affiliate        → platform 0.70  / expert 0.30  (revenueType="affiliate_commission" or source="affiliate")
 *   Per-expert       → users.commission_override_expert_share_percent (EXP-OVR.P2)
 *                       admin-set override; honors §6.9 beta recruitment terms
 *   Default          → booking_fee_configs by category, then hardcoded 0.25 / 0.75
 *
 * Note: a separate per-service revenueShareRate exists on providerServices and is
 * applied at the caller layer (payments.routes.ts). Per-service still wins over
 * per-expert because it's applied after this resolver returns — admins setting
 * revenueShareRate on a specific service are intentionally overriding.
 *
 * DO NOT add new hardcoded rate literals in other files — call resolveCommissionRates().
 */

import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import { users } from "@shared/schema";

export const EXPERT_SHARE_RATE = 0.75;
export const PLATFORM_FEE_RATE = 0.25;
export const AI_PLATFORM_FEE = 1.00;
export const AFFILIATE_PLATFORM_FEE = 0.70;
export const AFFILIATE_EXPERT_SHARE = 0.30;
/** Stripe processing / gateway fee deducted from every platform-fee receipt. */
export const PROCESSING_FEE_RATE = 0.03;

export interface CommissionRates {
  expertShareRate: number;
  platformFeeRate: number;
}

export interface ResolveOptions {
  category?: string | null;
  source?: "ai" | "affiliate" | "expert" | "provider" | null;
  revenueType?: string | null;
  /** EXP-OVR.P2: when provided, the resolver checks for a per-expert override
   *  before falling back to the category default. The override always resolves
   *  from the DB (anti-tampering) — never from client-supplied values. */
  expertId?: string | null;
}

/**
 * Resolve commission rates for a transaction.
 * Accepts either a bare category string (backward-compatible) or a ResolveOptions object.
 *
 * expertShareRate + platformFeeRate always sum to 1.
 */
export async function resolveCommissionRates(
  categoryOrOptions?: string | null | ResolveOptions
): Promise<CommissionRates> {
  let category: string | null | undefined;
  let source: string | null | undefined;
  let revenueType: string | null | undefined;
  let expertId: string | null | undefined;

  if (typeof categoryOrOptions === "object" && categoryOrOptions !== null) {
    category = categoryOrOptions.category;
    source = categoryOrOptions.source;
    revenueType = categoryOrOptions.revenueType;
    expertId = categoryOrOptions.expertId;
  } else {
    category = categoryOrOptions;
  }

  // Tier 1 — AI-sourced: platform keeps 100 %
  if (source === "ai") {
    return { expertShareRate: 0, platformFeeRate: AI_PLATFORM_FEE };
  }

  // Tier 2 — Affiliate: platform keeps 70 %, expert/partner gets 30 %
  if (source === "affiliate" || revenueType === "affiliate_commission") {
    return { expertShareRate: AFFILIATE_EXPERT_SHARE, platformFeeRate: AFFILIATE_PLATFORM_FEE };
  }

  // Tier 3 — Per-expert override (EXP-OVR.P2). Honors §6.9 beta-recruitment terms.
  if (expertId) {
    try {
      const [row] = await db
        .select({ override: users.commissionOverrideExpertSharePercent })
        .from(users)
        .where(eq(users.id, expertId))
        .limit(1);
      const raw = row?.override;
      const pct = raw === null || raw === undefined ? null : Number(raw);
      if (pct !== null && Number.isFinite(pct) && pct >= 0 && pct <= 100) {
        const expertShareRate = pct / 100;
        return {
          expertShareRate,
          platformFeeRate: 1 - expertShareRate,
        };
      }
    } catch (_err) {
      // DB unavailable — fall through to category/constants
    }
  }

  // Tier 4 — Admin-editable per-category from booking_fee_configs
  try {
    const cat = category || "default";
    const result = await db.execute(sql`
      SELECT
        CAST(expert_share_percent  AS FLOAT) AS expert_share_percent,
        CAST(platform_fee_percent  AS FLOAT) AS platform_fee_percent
      FROM booking_fee_configs
      WHERE category = ${cat} AND is_active = true
      LIMIT 1
    `);
    if (result.rows && result.rows.length > 0) {
      const row = result.rows[0] as any;
      const expertShare = Number(row.expert_share_percent ?? 0);
      const platformFee = Number(row.platform_fee_percent ?? 0);
      if (expertShare > 0) {
        return {
          expertShareRate: expertShare / 100,
          platformFeeRate: platformFee > 0 ? platformFee / 100 : 1 - expertShare / 100,
        };
      }
    }
  } catch (_err) {
    // DB unavailable — fall through to hardcoded defaults
  }

  return { expertShareRate: EXPERT_SHARE_RATE, platformFeeRate: PLATFORM_FEE_RATE };
}
