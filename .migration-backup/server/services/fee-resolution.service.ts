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
 *   · Provider commission resolves via `service_categories.commission_band_key` → `fee_bands`
 *     (limited .12 | moderate .08 | commercial .06 | premium .04).
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

/** Band keys this resolver names. Values live in `fee_bands`; only the KEYS are code. */
export const TRAVELER_SERVICE_FEE_BAND = "traveler_service_fee";
export const PROVIDER_RAILS_BAND = "provider_rails";

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
 *   2. Category band (D1), optionally min()'d with `provider_rails` when the booking is rails.
 * There is no step 3. A category with no band is unreachable by construction (R1+R2) and throws.
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

  // ── 2. Category band (D1) ──────────────────────────────────────────────────────────────────
  if (!categoryId) {
    throw new BandResolutionError(
      "(none)",
      "no categoryId supplied, so no band could be reached — provider commission resolves via service_categories.commission_band_key (D1)",
    );
  }
  const catRes = await db.execute(sql`
    SELECT commission_band_key FROM service_categories WHERE id = ${categoryId} LIMIT 1
  `);
  const bandKey = (catRes.rows?.[0] as { commission_band_key: string | null } | undefined)?.commission_band_key;
  if (!bandKey) {
    // Unreachable by construction after R1+R2 (backfill + NOT NULL + create/activate validation).
    // If this fires, the guard has been breached — which is exactly what fail-loud is for.
    throw new BandResolutionError(
      "(category has no band)",
      `service_categories.commission_band_key is empty for categoryId=${categoryId} — R2 makes this state unreachable, so this is a breached guard, not a fallback case`,
    );
  }
  const categoryBand = await requireBand(bandKey);

  // ── 2b. Rails: min(category band, rails), plus the traveler-fee waiver (D1) ─────────────────
  if (isRails) {
    const railsBand = await requireBand(PROVIDER_RAILS_BAND);
    // min() so rails NEVER raises a premium provider's rate: a 0.04 provider stays at 0.04.
    const railsWins = railsBand.rate < categoryBand.rate;
    const chosen = railsWins ? railsBand : categoryBand;
    return {
      platformRate: chosen.rate,
      providerShareRate: 1 - chosen.rate,
      bandId: chosen.id,
      bandKey: chosen.bandKey,
      rateSource: railsWins ? "rails" : "band",
      railsApplied: true,
      travelerFeeWaived: true, // the provider's quotable pitch: "book through my link, skip the service fee"
    };
  }

  return {
    platformRate: categoryBand.rate,
    providerShareRate: 1 - categoryBand.rate,
    bandId: categoryBand.id,
    bandKey: categoryBand.bandKey,
    rateSource: "band",
    railsApplied: false,
    travelerFeeWaived: false,
  };
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
  const uncapped = round2(subtotal * band.rate);
  const capped = band.maxAmount !== null && uncapped > band.maxAmount ? band.maxAmount : uncapped;
  return {
    amount: capped,
    rate: band.rate,
    bandId: band.id,
    bandKey: band.bandKey,
    rateSource: "band",
    capApplied: capped !== uncapped,
    waived: false,
  };
}

/** Money rounding shared by both resolvers — half-up to cents, matching the checkout's toFixed(2). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
