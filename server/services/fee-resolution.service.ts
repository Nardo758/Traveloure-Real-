/**
 * FEE RESOLUTION — the single resolver (fee-ledger lane, D0/D1, ruled 2026-08-06).
 *
 * D0 (rate authority): `fee_bands` is authoritative, reached through ONE resolver. Per-entity
 * overrides survive only as PROVENANCE *through* this resolver, never beside it. Nothing reads
 * `provider_services.revenue_share_rate` as a first operand again — that snapshot was the mechanism
 * behind audit C2/Q9 (a stale per-service rate outranked band resolution, so an admin editing a
 * band could not change what a service charged — ruling 32's defeated proof).
 *
 * D1 (structure C, "split & disclosed"):
 *   · Provider commission follows `active_provider_commission_policy`. `beta_flat` (and a
 *     missing policy) reads the `beta_flat` band. `tiered` reads
 *     `service_categories.commission_band_key`. An unknown policy throws.
 *   · `traveler_service_fee` 0.07, capped by the band's own `max_amount` ($25) — the cap is band
 *     data, enforced here, never a constant in code (ruling 32).
 *   · `provider_rails` 0.08 resolves as **min(category band, rails)** so rails can never exceed a
 *     premium provider's full rate, and a rails booking **waives the traveler service fee entirely**.
 *
 * FAIL-LOUD (R2): a missing/inactive/non-percent band THROWS. There is no silent fallback rate,
 * ever. R1+R2 (every category carries a band; NOT NULL at the DB; validation on create/activate)
 * make the missing-band state unreachable rather than survivable — so the throw is a real
 * misconfiguration alarm, not a routine path.
 *
 * Repeat-pair rails stays spec-ahead-of-code (D1): `sourceAttribution` accommodates it; the
 * detection logic is NOT built here.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import type { FeeRateSource } from "@shared/schema";
import { providerCommissionPolicy, travelerServiceFeeAmount } from "@shared/fee-policy";
import {
  BETA_FLAT_BAND,
  CONCIERGE_AI_TASK_BAND,
  CONCIERGE_BOOKING_CAP_BAND,
  CONCIERGE_BOOKING_PERCENT_BAND,
  CONCIERGE_DONE_FOR_YOU_DEPOSIT_BAND,
  PLUS_TASK_ALLOWANCE_BAND,
  PROVIDER_COMMERCIAL_BAND,
  PROVIDER_LIMITED_BAND,
  PROVIDER_MODERATE_BAND,
  PROVIDER_PRO_BAND_STEP,
  PROVIDER_PREMIUM_BAND,
  PROVIDER_RAILS_BAND,
  READY_MADE_PLATFORM_BAND,
  TRAVELER_SERVICE_FEE_BAND,
} from "./fee-band-requirements";
export {
  BETA_FLAT_BAND,
  CONCIERGE_AI_TASK_BAND,
  CONCIERGE_BOOKING_CAP_BAND,
  CONCIERGE_BOOKING_PERCENT_BAND,
  CONCIERGE_DONE_FOR_YOU_DEPOSIT_BAND,
  PLUS_TASK_ALLOWANCE_BAND,
  PROVIDER_COMMERCIAL_BAND,
  PROVIDER_LIMITED_BAND,
  PROVIDER_MODERATE_BAND,
  PROVIDER_PRO_BAND_STEP,
  PROVIDER_PREMIUM_BAND,
  PROVIDER_RAILS_BAND,
  READY_MADE_PLATFORM_BAND,
  TRAVELER_SERVICE_FEE_BAND,
} from "./fee-band-requirements";
// FeeBandRateType is the canonical rate_type union (fee-band-requirements.ts:
// 'percent' | 'flat' | 'flat_cents' | 'count' | 'rule', matched to the migration-258
// CHECK). Import it LOCALLY so requireBandType can name it (a bare `export … from`
// re-export makes it visible to importers but creates no local binding — that gap
// was the "Cannot find name 'FeeBandRateType'" error), then re-export for consumers.
import type { FeeBandRateType } from "./fee-band-requirements";
export type { FeeBandRateType };

export interface BandRow {
  id: string;
  bandKey: string;
  /** Fraction for rate_type='percent'; dollars for 'flat'. */
  rate: number;
  rateType: string;
  /** Per-booking dollar ceiling on the resolved amount; null = uncapped. */
  maxAmount: number | null;
}

export class BandResolutionError extends Error {
  constructor(bandKey: string, detail: string) {
    super(
      `commission band unusable: bandKey=${bandKey} — ${detail}. fee_bands is authoritative (D0); ` +
        `there is no fallback rate. Ensure migrations are applied and the band is active and percent-typed.`,
    );
    this.name = "BandResolutionError";
  }
}

/** Read a band by key. Returns null when absent/inactive — callers decide whether that is fatal. */
export async function readBand(bandKey: string): Promise<BandRow | null> {
  const result = await db.execute(sql`
    SELECT id, band_key, CAST(default_rate AS FLOAT) AS rate, rate_type,
           CAST(max_amount AS FLOAT) AS max_amount
      FROM fee_bands
     WHERE band_key = ${bandKey} AND is_active = true
     LIMIT 1
  `);
  const row = result.rows?.[0] as
    | { id: string; band_key: string; rate: number | null; rate_type: string | null; max_amount: number | null }
    | undefined;
  if (!row || row.rate === null || row.rate === undefined || !Number.isFinite(Number(row.rate))) return null;
  return {
    id: String(row.id),
    bandKey: String(row.band_key),
    rate: Number(row.rate),
    rateType: String(row.rate_type ?? ""),
    maxAmount: row.max_amount === null || row.max_amount === undefined ? null : Number(row.max_amount),
  };
}

/** Read a band, or throw. The fail-loud path (R2). */
export async function requireBand(bandKey: string): Promise<BandRow> {
  const band = await readBand(bandKey);
  if (!band) throw new BandResolutionError(bandKey, "no active row in fee_bands");
  if (band.rateType !== "percent") {
    throw new BandResolutionError(bandKey, `rate_type='${band.rateType}', expected 'percent'`);
  }
  return band;
}

/**
 * Typed accessors for non-commission pricing rows. `requireBand` remains the
 * percent-only provider/traveler commission path; these accessors prevent a
 * count or rule row from being silently interpreted as currency.
 */
export async function requireBandType(
  bandKey: string,
  expectedType: FeeBandRateType,
): Promise<BandRow> {
  const band = await readBand(bandKey);
  if (!band) throw new BandResolutionError(bandKey, "no active row in fee_bands");
  if (band.rateType !== expectedType) {
    throw new BandResolutionError(
      bandKey,
      `rate_type='${band.rateType}', expected '${expectedType}'`,
    );
  }
  return band;
}

export const requireFlatCentsBand = (bandKey: string) => requireBandType(bandKey, "flat_cents");
export const requireCountBand = (bandKey: string) => requireBandType(bandKey, "count");
export const requireRuleBand = (bandKey: string) => requireBandType(bandKey, "rule");

export interface ProviderRateInput {
  /** The service's category id — the D1 path to the band. */
  categoryId?: string | null;
  /** Provider's user id; carries the per-entity negotiated-rate override (D0 provenance). */
  providerId?: string | null;
  /** True when the booking arrived on a validated attributed short link (rails). */
  isRails?: boolean;
}

export interface ResolvedProviderRate {
  /** Platform's take as a fraction of the booking subtotal. */
  platformRate: number;
  /** Provider's share = 1 - platformRate. */
  providerShareRate: number;
  /** Null unless rateSource === 'band' (Phase 0 §1a: overrides have no band that explains them). */
  bandId: string | null;
  bandKey: string | null;
  rateSource: FeeRateSource;
  /** True when rails selection applied (min(category band, rails)). */
  railsApplied: boolean;
  /** D1: a rails booking waives the traveler service fee entirely. */
  travelerFeeWaived: boolean;
}

/**
 * Resolve the provider commission rate for one booking line.
 *
 * Precedence, deliberately ordered so `fee_bands` is the floor of authority:
 *   1. Per-entity override (`users.commission_override_expert_share_percent`) — the negotiated-rate
 *      case. It wins, but ONLY through here, and it is stamped `rate_source='entity_override'` with
 *      no `band_id`, so the ledger never attributes an overridden rate to a band that did not
 *      produce it.
 *   2. While the provider policy is `beta_flat`, the `beta_flat` band. A category is still
 *      required (the line must name a real category) but its tier key is not the rate.
 *   3. While the policy is `tiered`, the category band, optionally min()'d with `provider_rails`.
 * An unknown policy throws. A tiered category with no band throws. There is no expert_standard
 * fallback on this path.
 */
export async function resolveProviderRate(input: ProviderRateInput): Promise<ResolvedProviderRate> {
  const { categoryId, providerId, isRails = false } = input;

  // ── 1. Per-entity override — provenance, not a parallel authority (D0) ──────────────────────
  if (providerId) {
    const res = await db.execute(sql`
      SELECT CAST(commission_override_expert_share_percent AS FLOAT) AS pct
        FROM users WHERE id = ${providerId} LIMIT 1
    `);
    const pct = (res.rows?.[0] as { pct: number | null } | undefined)?.pct;
    if (pct !== null && pct !== undefined && Number.isFinite(pct) && pct >= 0 && pct <= 100) {
      const providerShareRate = Number(pct) / 100;
      return {
        platformRate: 1 - providerShareRate,
        providerShareRate,
        bandId: null,
        bandKey: null,
        rateSource: "entity_override",
        railsApplied: false,
        // An override is a negotiated all-in rate; rails' waiver is a band-model concession and does
        // not silently ride along with it.
        travelerFeeWaived: false,
      };
    }
  }

  if (!categoryId) {
    throw new BandResolutionError(
      "(none)",
      "no categoryId supplied, so no band could be reached — provider commission resolves via service_categories.commission_band_key (D1)",
    );
  }
  const catRes = await db.execute(sql`
    SELECT commission_band_key FROM service_categories WHERE id = ${categoryId} LIMIT 1
  `);
  const categoryRow = catRes.rows?.[0] as { commission_band_key: string | null } | undefined;
  if (!categoryRow) {
    throw new BandResolutionError(
      "(none)",
      `no service_categories row for categoryId=${categoryId}`,
    );
  }
  const policy = providerCommissionPolicy(await readProviderCommissionPolicy());
  if (policy === "unknown") {
    throw new BandResolutionError(
      "(unknown policy)",
      "active_provider_commission_policy is neither beta_flat nor tiered — refusing to price the line",
    );
  }

  // Beta: the governing band is beta_flat. A category whose tier key is empty still prices,
  // because the tier key is not the rate while this policy is on.
  let governing: BandRow;
  if (policy === "beta_flat") {
    governing = await requireBand(BETA_FLAT_BAND);
  } else {
    const bandKey = categoryRow.commission_band_key;
    if (!bandKey) {
      throw new BandResolutionError(
        "(category has no band)",
        `service_categories.commission_band_key is empty for categoryId=${categoryId} — under tiered policy this is a breached guard, not a fallback case`,
      );
    }
    governing = await requireBand(bandKey);
  }

  if (isRails) {
    const railsBand = await requireBand(PROVIDER_RAILS_BAND);
    // min() so rails NEVER raises the governing rate.
    const railsWins = railsBand.rate < governing.rate;
    const chosen = railsWins ? railsBand : governing;
    return {
      platformRate: chosen.rate,
      providerShareRate: 1 - chosen.rate,
      bandId: chosen.id,
      bandKey: chosen.bandKey,
      rateSource: railsWins ? "rails" : "band",
      railsApplied: true,
      travelerFeeWaived: true,
    };
  }

  return {
    platformRate: governing.rate,
    providerShareRate: 1 - governing.rate,
    bandId: governing.id,
    bandKey: governing.bandKey,
    rateSource: "band",
    railsApplied: false,
    travelerFeeWaived: false,
  };
}

async function readProviderCommissionPolicy(): Promise<string | null> {
  const res = await db.execute(sql`
    SELECT setting_value FROM platform_settings
     WHERE setting_key = 'active_provider_commission_policy'
     LIMIT 1
  `);
  const value = (res.rows?.[0] as { setting_value?: unknown } | undefined)?.setting_value;
  return typeof value === "string" ? value : null;
}

export interface ResolvedTravelerFee {
  /** Dollars. 0 when waived. */
  amount: number;
  rate: number;
  bandId: string | null;
  bandKey: string | null;
  rateSource: FeeRateSource;
  /** True when `fee_bands.max_amount` clamped the amount (D1's $25 ceiling). */
  capApplied: boolean;
  waived: boolean;
}

/**
 * Resolve the traveler-facing service fee for a booking subtotal (D3: kept, disclosed, first-class).
 *
 * The cap comes from the band row's `max_amount`, never from a constant — so raising or removing the
 * $25 ceiling is an admin band edit, not a deploy (ruling 32).
 */
export async function resolveTravelerServiceFee(
  subtotal: number,
  opts: { waived?: boolean } = {},
): Promise<ResolvedTravelerFee> {
  const band = await requireBand(TRAVELER_SERVICE_FEE_BAND);
  if (opts.waived) {
    return {
      amount: 0,
      rate: band.rate,
      bandId: band.id,
      bandKey: band.bandKey,
      rateSource: "band",
      capApplied: false,
      waived: true,
    };
  }
  const priced = travelerServiceFeeAmount(subtotal, band.rate, band.maxAmount);
  return {
    amount: priced.amount,
    rate: band.rate,
    bandId: band.id,
    bandKey: band.bandKey,
    rateSource: "band",
    capApplied: priced.capApplied,
    waived: false,
  };
}

/**
 * WHAT SUPPRESSES the traveler service fee, for the ONE booking-details snapshot shape both charge
 * arms write. `"rails"` — a provider-referral link waiver — is cart-only (a quote is bespoke pricing
 * already; no referral link rides an accepted quote); `"trip_pass"` is available to either arm that
 * can name a `trips.id` to check `coversAction` against.
 */
export type TravelerServiceFeeWaiverBasis = "rails" | "trip_pass" | null;

/**
 * The `booking_details.travelerServiceFee` snapshot shape (ledger `2026-09-02-traveler-fee-applies-
 * everywhere`), read by `recordTravelerServiceFeeLedger`/`buildTravelerServiceFeeRows` and by the
 * re-drive reconstruction. `charged` is what rode the Stripe total (0 when waived); `wouldHaveBeen`
 * is the band-priced fee, resolved UNCONDITIONALLY so it always names the real amount even on a
 * waived line — never 0-because-waived standing in for 0-because-the-band-said-so.
 */
export interface TravelerServiceFeeSnapshot {
  charged: number;
  wouldHaveBeen: number;
  rate: number;
  bandId: string | null;
  bandKey: string | null;
  capApplied: boolean;
  waived: boolean;
  waiverBasis: TravelerServiceFeeWaiverBasis;
}

/**
 * ONE snapshot builder for BOTH checkout arms (§18 rule 1; ledger `2026-09-19-quote-born-traveler-
 * fee`). Extracted from the cart loop's own inline computation in `payments.routes.ts` — a second
 * caller copying that shape by hand is exactly the derivation-drift class §18 rule 1 names, and it
 * is how a cart line and a quote-born line could end up charged from two different formulas for the
 * same band.
 *
 * `resolveTravelerServiceFee` is called WITHOUT `{waived}` here — always resolving the real amount —
 * and the waiver is applied on top for `charged`, matching the cart loop's own two-step shape
 * (`travelerFeeResolved` unconditional, `feeChargedAmt` conditional). Passing `{waived:true}` into
 * the resolver instead would make `wouldHaveBeen` read 0 on every waived line, which is a different
 * (wrong) fact for a disclosure surface that means to show what the fee WOULD have been.
 */
export async function resolveTravelerServiceFeeSnapshot(
  subtotal: number,
  waiverBasis: TravelerServiceFeeWaiverBasis,
): Promise<TravelerServiceFeeSnapshot> {
  const resolved = await resolveTravelerServiceFee(subtotal);
  const waived = waiverBasis !== null;
  return {
    charged: waived ? 0 : resolved.amount,
    wouldHaveBeen: resolved.amount,
    rate: resolved.rate,
    bandId: resolved.bandId,
    bandKey: resolved.bandKey,
    capApplied: resolved.capApplied,
    waived,
    waiverBasis,
  };
}

/** Money rounding shared by both resolvers — half-up to cents, matching the checkout's toFixed(2). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
