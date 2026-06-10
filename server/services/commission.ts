/**
 * Commission Resolution Service — Master Integration Brief Phase 1.3.
 *
 * Single source of truth for all platform/expert fee splits.
 *
 * Resolution order (first match wins):
 *   Tier 1 — AI-sourced       → platform 1.00 (constant; per-source band not yet seeded)
 *   Tier 2 — Affiliate        → platform 0.70 / partner 0.30 (constant; per-partner bands seeded dormant)
 *   Tier 3 — Per-expert EXP-OVR → users.commission_override_expert_share_percent (override-wins)
 *   Tier 4 — Provider line item → policy-aware band (beta_flat OR tiered category band)
 *   Tier 5 — Expert / default  → fee_bands.expert_standard
 *   Tier 6 — Safety net        → constants EXPERT_SHARE_RATE / PLATFORM_FEE_RATE
 *
 * Key design points:
 * - Percent bands store the PLATFORM TAKE as a fraction (expert_standard=0.25
 *   means platform keeps 0.25, expert keeps 0.75). See migration 033 header.
 * - Provider routing: source='provider' OR legacy category='provider_commission_percent'
 *   reads platform_settings.active_provider_commission_policy:
 *     'beta_flat' → fee_bands.beta_flat (current FEE-2 behavior; 0.10 default)
 *     'tiered'    → service_categories.commission_band_key → fee_bands.<band>
 *                   (seeded dormant; flipping the setting activates them)
 * - Insurance fields still load from booking_fee_configs (Phase 2 concern; out of 1.3 scope).
 * - per-service revenueShareRate on providerServices is applied AFTER this resolver
 *   returns (in payments.routes.ts), so it still wins as the final override.
 *
 * DO NOT add new hardcoded rate literals in other files — call resolveCommissionRates().
 */

import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import { users } from "@shared/schema";

// Safety-net constants. Used only when DB is unavailable AND the band lookup
// can't be resolved. fee_bands.beta_flat / expert_standard are the live source.
export const EXPERT_SHARE_RATE = 0.75;
export const PLATFORM_FEE_RATE = 0.25;
export const AI_PLATFORM_FEE = 1.00;
export const AFFILIATE_PLATFORM_FEE = 0.70;
export const AFFILIATE_EXPERT_SHARE = 0.30;
/** Stripe processing / gateway fee deducted from every platform-fee receipt. */
export const PROCESSING_FEE_RATE = 0.03;

/** Backstop fallbacks if DB is reachable but the band row is missing. */
const BETA_FLAT_FALLBACK = 0.10;
const EXPERT_STANDARD_FALLBACK = 0.25;

export interface CommissionRates {
  expertShareRate: number;
  platformFeeRate: number;
  /** FEE-2 Phase 2: insurance tier fields from booking_fee_configs (out of 1.3 scope) */
  insuranceEnabled: boolean;
  insuranceRatePercent: number;
  insuranceAppliesTo: string[];
}

export function calcInsuranceFee(
  grossAmount: number,
  rates: CommissionRates,
  bookingType?: string | null,
): number {
  if (!rates.insuranceEnabled || rates.insuranceRatePercent <= 0) return 0;
  if (rates.insuranceAppliesTo.length > 0) {
    if (!bookingType || !rates.insuranceAppliesTo.includes(bookingType)) return 0;
  }
  return Math.round(grossAmount * (rates.insuranceRatePercent / 100) * 100) / 100;
}

export interface FeeBreakdown {
  gross: number;
  basePlatformFee: number;
  insuranceFee: number;
  totalPlatformFee: number;
  expertShare: number;
}

export function buildFeeBreakdown(
  grossAmount: number,
  rates: CommissionRates,
  bookingType?: string | null,
): FeeBreakdown {
  const basePlatformFee = Math.round(grossAmount * rates.platformFeeRate * 100) / 100;
  const insuranceFee = calcInsuranceFee(grossAmount, rates, bookingType);
  const totalPlatformFee = basePlatformFee + insuranceFee;
  const expertShare = Math.round((grossAmount - totalPlatformFee) * 100) / 100;
  return { gross: grossAmount, basePlatformFee, insuranceFee, totalPlatformFee, expertShare };
}

export interface ResolveOptions {
  category?: string | null;
  source?: "ai" | "affiliate" | "expert" | "provider" | null;
  revenueType?: string | null;
  /** EXP-OVR.P2: when provided, the resolver checks for a per-expert override
   *  before falling back to the band lookup. */
  expertId?: string | null;
  /** Early-adopter gate: pass the provider's userId for provider-source bookings.
   *  Resolver compares users.created_at against early_adopter_cutoff_date in
   *  platform_settings. Providers registered before the cutoff get beta_flat (10%);
   *  those on/after get expert_standard (25%). Omitting this falls back to beta_flat
   *  (safe for existing call-sites). */
  providerId?: string | null;
}

const noInsurance = { insuranceEnabled: false, insuranceRatePercent: 0, insuranceAppliesTo: [] as string[] };

// ─── Pure helpers (no I/O — testable in isolation) ───────────────────────────

/**
 * Decide which fee_bands.band_key to look up for a given resolver call.
 * Pure function — no DB. Phase 1.3 neutrality proof tests this directly.
 *
 *   source='provider' OR legacy category='provider_commission_percent' →
 *     'beta_flat' (when policy='beta_flat') or 'tiered' fallback.
 *   category='tip' → 'tip_handling' (Phase 1.5; preserves legacy 5 % platform take).
 *   Other named category → direct band lookup by the category name
 *     (Phase 1.5 enumeration migration 046 seeds a preserving band for every
 *     active booking_fee_configs row, so admin per-category overrides flow
 *     through without per-category code changes).
 *   No category / category='default' → 'expert_standard' (the canonical default).
 */
export function decideBandKey(
  opts: { source?: string | null; category?: string | null; categoryCommissionBand?: string | null },
  policy: string,
  defaultBandKey: string,
): string {
  // Phase 1.5 semantic mappings (override the generic direct-lookup fallback):
  if (opts.category === "tip") return "tip_handling";

  const isProviderLine =
    opts.source === "provider" || opts.category === "provider_commission_percent";

  if (isProviderLine) {
    if (policy === "beta_flat") return "beta_flat";
    // tiered: service_categories.commission_band_key → fee_bands
    return opts.categoryCommissionBand ?? defaultBandKey;
  }

  // Phase 1.5 enumeration: if the caller passed a specific category that's
  // not a known semantic mapping, try a direct lookup by the category name.
  // Migration 046 seeds preserving bands for every active booking_fee_configs
  // row so admin per-category overrides (including ones we haven't enumerated
  // by hand) flow through. If the band is missing, the resolver's safety net
  // falls back to expert_standard / constants — preserving today's behavior.
  if (opts.category && opts.category !== "default") {
    return opts.category;
  }

  return "expert_standard";
}

/**
 * Convert a fee_bands.default_rate (percent band = platform take) into
 * CommissionRates. Pure function.
 */
export function buildRatesFromBand(bandRate: number, insurance = noInsurance): CommissionRates {
  return {
    expertShareRate: 1 - bandRate,
    platformFeeRate: bandRate,
    ...insurance,
  };
}

/** /api/booking-fee-config response shape (consumed by the itinerary Booking Summary). */
export interface BookingFeeConfigResponse {
  platform_fee_percent: number;
  expert_share_percent: number;
  ai_keeps_100: boolean;
  min_fee: number | null;
  max_fee: number | null;
}

/**
 * Map resolved CommissionRates → the /api/booking-fee-config response shape.
 * This is the SINGLE place the display-facing fee config is derived from the
 * canonical resolver, so the itinerary fee DISPLAY and the checkout CHARGE
 * cannot diverge in source or conversion. Pure function.
 */
export function feeConfigFromRates(rates: CommissionRates): BookingFeeConfigResponse {
  const pct = (n: number) => Math.round(n * 100 * 100) / 100; // fraction → percent, 2dp
  return {
    platform_fee_percent: pct(rates.platformFeeRate),
    expert_share_percent: pct(rates.expertShareRate),
    ai_keeps_100: true,
    min_fee: null,
    max_fee: null,
  };
}

// ─── DB lookup helpers (I/O — wrapped in try/catch for resilience) ───────────

async function getBandRate(bandKey: string): Promise<number | null> {
  try {
    const result = await db.execute(sql`
      SELECT CAST(default_rate AS FLOAT) AS rate
      FROM fee_bands
      WHERE band_key = ${bandKey} AND is_active = true
      LIMIT 1
    `);
    const row = result.rows?.[0] as { rate: number | null } | undefined;
    return row?.rate ?? null;
  } catch {
    return null;
  }
}

async function getSetting(key: string): Promise<string | null> {
  try {
    const result = await db.execute(sql`
      SELECT setting_value FROM platform_settings
      WHERE setting_key = ${key}
      LIMIT 1
    `);
    const row = result.rows?.[0] as { setting_value: string | null } | undefined;
    return row?.setting_value ?? null;
  } catch {
    return null;
  }
}

/**
 * Early-adopter gate: returns true if the provider registered before the
 * platform's early_adopter_cutoff_date. Safe fallback is true (beta rate)
 * so existing call-sites that omit providerId stay on beta_flat.
 */
async function isEarlyAdopterProvider(providerId: string): Promise<boolean> {
  try {
    const cutoffStr = await getSetting("early_adopter_cutoff_date");
    if (!cutoffStr) return true; // gate disabled → everyone is early adopter
    const cutoff = new Date(cutoffStr);
    if (isNaN(cutoff.getTime())) return true; // invalid date → safe fallback

    const result = await db.execute(sql`
      SELECT created_at FROM users WHERE id = ${providerId} LIMIT 1
    `);
    const row = result.rows?.[0] as { created_at: Date | string | null } | undefined;
    if (!row?.created_at) return true; // unknown registration date → safe fallback
    return new Date(row.created_at) < cutoff;
  } catch {
    return true; // DB error → safe fallback (never punish a provider for a DB issue)
  }
}

/** Insurance still loads from booking_fee_configs (Phase 2 concern). */
async function resolveInsuranceFromCategory(category?: string | null) {
  try {
    const cat = category || "default";
    const result = await db.execute(sql`
      SELECT
        insurance_enabled,
        CAST(insurance_rate_percent AS FLOAT) AS insurance_rate_percent,
        insurance_applies_to
      FROM booking_fee_configs
      WHERE category = ${cat} AND is_active = true
      LIMIT 1
    `);
    if (result.rows && result.rows.length > 0) {
      const row = result.rows[0] as any;
      return {
        insuranceEnabled: Boolean(row.insurance_enabled),
        insuranceRatePercent: Number(row.insurance_rate_percent ?? 0),
        insuranceAppliesTo: Array.isArray(row.insurance_applies_to) ? row.insurance_applies_to : [] as string[],
      };
    }
  } catch {
    // ignore
  }
  return noInsurance;
}

/**
 * Resolve commission rates for a transaction.
 * Accepts a bare category string (backward-compatible) or a ResolveOptions object.
 *
 * expertShareRate + platformFeeRate always sum to 1.
 */
export async function resolveCommissionRates(
  categoryOrOptions?: string | null | ResolveOptions,
): Promise<CommissionRates> {
  let category: string | null | undefined;
  let source: ResolveOptions["source"];
  let revenueType: string | null | undefined;
  let expertId: string | null | undefined;
  let providerId: string | null | undefined;

  if (typeof categoryOrOptions === "object" && categoryOrOptions !== null) {
    category = categoryOrOptions.category;
    source = categoryOrOptions.source;
    revenueType = categoryOrOptions.revenueType;
    expertId = categoryOrOptions.expertId;
    providerId = categoryOrOptions.providerId;
  } else {
    category = categoryOrOptions;
  }

  // Tier 1 — AI-sourced (constant; no band seeded yet)
  if (source === "ai") {
    return { expertShareRate: 0, platformFeeRate: AI_PLATFORM_FEE, ...noInsurance };
  }

  // Tier 2 — Affiliate (constant; per-partner bands seeded dormant for Phase-2 migration)
  if (source === "affiliate" || revenueType === "affiliate_commission") {
    return {
      expertShareRate: AFFILIATE_EXPERT_SHARE,
      platformFeeRate: AFFILIATE_PLATFORM_FEE,
      ...noInsurance,
    };
  }

  // Tier 3 — Per-expert override (EXP-OVR). Override always wins.
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
        const insuranceFields = await resolveInsuranceFromCategory(category);
        return {
          expertShareRate,
          platformFeeRate: 1 - expertShareRate,
          ...insuranceFields,
        };
      }
    } catch {
      // fall through to band lookup
    }
  }

  // Tier 4 / 5 — fee_bands band lookup
  const policy = (await getSetting("active_provider_commission_policy")) ?? "beta_flat";
  const defaultBandKey = (await getSetting("default_commission_band_key")) ?? "beta_flat";

  // Early-adopter gate for provider-source bookings.
  // When a providerId is supplied, compare their registration date to
  // early_adopter_cutoff_date in platform_settings:
  //   before cutoff  → beta_flat (10% platform / 90% provider)
  //   on/after cutoff → expert_standard (25% platform / 75% provider)
  // Omitting providerId (existing call-sites) always resolves to beta_flat — safe.
  const isProviderLine = source === "provider" || category === "provider_commission_percent";
  let bandKey: string;
  if (isProviderLine && providerId) {
    const earlyAdopter = await isEarlyAdopterProvider(providerId);
    bandKey = earlyAdopter ? "beta_flat" : "expert_standard";
  } else {
    bandKey = decideBandKey(
      { source, category, categoryCommissionBand: null /* tiered lookup wires in a later phase */ },
      policy,
      defaultBandKey,
    );
  }

  const bandRate = await getBandRate(bandKey);
  if (bandRate !== null) {
    const insuranceFields = await resolveInsuranceFromCategory(category);
    return buildRatesFromBand(bandRate, insuranceFields);
  }

  // Band-row missing — backstop fallback per known seed defaults.
  if (bandKey === "beta_flat") {
    return buildRatesFromBand(BETA_FLAT_FALLBACK);
  }
  if (bandKey === "expert_standard") {
    return buildRatesFromBand(EXPERT_STANDARD_FALLBACK);
  }

  // Tier 6 — final safety net.
  return {
    expertShareRate: EXPERT_SHARE_RATE,
    platformFeeRate: PLATFORM_FEE_RATE,
    ...noInsurance,
  };
}
