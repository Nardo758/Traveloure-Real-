/**
 * THE ONE PER-EARNER OVERRIDE RULE (FE-1 (a), ledger `2026-10-12-fe1-fee-integrity`; migration 375).
 *
 * A user row may carry two override columns:
 *   · `commission_override_platform_fee_percent` — the override stated as the PLATFORM FEE (%). New,
 *     written by the admin commission-override PATCH. It WINS when set.
 *   · `commission_override_expert_share_percent` — the original EXP-OVR column, stated as the
 *     EARNER's share. Deprecated and read-only: never written by the admin UI again, but still read
 *     here so a row that only carries it prices exactly as before.
 * Neither ⇒ null, and the caller continues down its policy path unchanged.
 *
 * Both `fee-resolution.service.ts:resolveProviderRate` and `commission.ts:resolveCommissionRates`
 * call this, so the precedence and the arithmetic are stated once (§18 rule 1). A value outside
 * [0, 100] is treated as not set (the shape the old readers already applied). Pure — no DB.
 */
export type CommissionOverrideSource = "platform_fee_override" | "expert_share_override";

export interface CommissionOverride {
  /** Fraction the platform takes. */
  platformRate: number;
  /** Fraction paid to the earner: 1 − platformRate. */
  earnerShareRate: number;
  source: CommissionOverrideSource;
}

function pct(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

export function resolveCommissionOverride(row: {
  platformFeePercent?: unknown;
  expertSharePercent?: unknown;
} | null | undefined): CommissionOverride | null {
  if (!row) return null;
  const platformFee = pct(row.platformFeePercent);
  if (platformFee !== null) {
    const platformRate = platformFee / 100;
    return { platformRate, earnerShareRate: 1 - platformRate, source: "platform_fee_override" };
  }
  const expertShare = pct(row.expertSharePercent);
  if (expertShare !== null) {
    const earnerShareRate = expertShare / 100;
    return { platformRate: 1 - earnerShareRate, earnerShareRate, source: "expert_share_override" };
  }
  return null;
}
