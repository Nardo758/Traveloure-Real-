/**
 * Pure fee-policy rules shared by the provider resolver, the legacy band picker,
 * quote acceptance, and the admin Fees screen.
 *
 * No rate literals live here. A percent band's number is a fraction the admin
 * stored on `fee_bands`; this module only decides WHICH row is read and how a
 * stored quote share relates to a later edit.
 */

export const UNCONFIGURED_PROVIDER_BAND_KEY = "unconfigured_provider_commission_policy";

/** Settings whose PATCH is a fee change and therefore requires confirmation. */
export const FEE_POLICY_SETTING_KEYS = [
  "active_provider_commission_policy",
  "default_commission_band_key",
] as const;

export type ProviderCommissionPolicy = "beta_flat" | "tiered" | "unknown";

/**
 * Missing or blank policy is the beta period. Anything other than the two
 * legal values is unknown and must not fall through to a provider rate.
 */
export function providerCommissionPolicy(raw: string | null | undefined): ProviderCommissionPolicy {
  const value = (raw ?? "").trim();
  if (value === "" || value === "beta_flat") return "beta_flat";
  if (value === "tiered") return "tiered";
  return "unknown";
}

/**
 * Which `fee_bands` key a provider line names.
 * `betaBandKey` is passed in so this file does not own a second copy of the
 * band-key constant the fail-loud manifest declares.
 */
export function providerCommissionBandKey(input: {
  policy: string | null | undefined;
  categoryBandKey?: string | null;
  defaultBandKey: string;
  betaBandKey: string;
}): string {
  const which = providerCommissionPolicy(input.policy);
  if (which === "beta_flat") return input.betaBandKey;
  if (which === "tiered") {
    const category = input.categoryBandKey?.trim();
    return category ? category : input.defaultBandKey;
  }
  return UNCONFIGURED_PROVIDER_BAND_KEY;
}

/** Half-up to cents, the same rounding the checkout uses. */
export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Traveler service fee for a subtotal: rate times subtotal, then the band's
 * dollar cap when one is set. `maxAmount` null means uncapped.
 */
export function travelerServiceFeeAmount(
  subtotal: number,
  rate: number,
  maxAmount: number | null,
): { amount: number; capApplied: boolean } {
  const uncapped = roundMoney(subtotal * rate);
  if (maxAmount !== null && uncapped > maxAmount) {
    return { amount: maxAmount, capApplied: true };
  }
  return { amount: uncapped, capApplied: false };
}

/**
 * A quote's owner share at accept. A finite stored fraction in [0, 1] is the
 * share pinned at issue and wins over the live band. Anything else (null, a
 * pre-column quote, a corrupt value) uses the live share.
 */
export function quoteOwnerShareForAccept(stored: unknown, live: number | null): number | null {
  const parsed = typeof stored === "number"
    ? stored
    : typeof stored === "string" && stored.trim() !== ""
      ? Number(stored)
      : null;
  if (parsed !== null && Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) return parsed;
  if (live !== null && Number.isFinite(live) && live >= 0 && live <= 1) return live;
  return null;
}

/** Percent bands store a fraction: 0 is 0% and 1 is 100%. */
export function percentBandRateInUnitInterval(rate: number): boolean {
  return Number.isFinite(rate) && rate >= 0 && rate <= 1;
}

const FEE_BAND_MONEY_FIELDS = ["defaultRate", "minRate", "maxRate", "maxAmount", "isActive"] as const;

/** True when the patch changes a number or the active flag, which needs a confirm. */
export function feeBandPatchNeedsConfirm(body: object): boolean {
  const record = body as Record<string, unknown>;
  return FEE_BAND_MONEY_FIELDS.some((key) => record[key] !== undefined);
}
