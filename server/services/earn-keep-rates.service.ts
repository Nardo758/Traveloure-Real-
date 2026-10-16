/**
 * The platform rates the fee resolver applies TODAY to an ordinary expert sale and to a provider
 * line, for the public "keep N%" copy on /earn and /become-provider (CP-2, ledger
 * `2026-10-16-cp2-public-copy`).
 *
 * This reads the same functions the money path reads; it restates no band key choice of its own
 * (§18 rule 1):
 *   · expert — `getExpertSplitRates()`, the split an expert sale with no per-entity override takes;
 *   · provider — `resolveProviderRate`'s policy branch: under `beta_flat` (or no policy set) the
 *     `beta_flat` band, which governs every category. Under `tiered` the rate is per category, so
 *     there is no single number to state and the answer is null (§13); a missing or non-percent
 *     band is null too — the resolver would refuse to price the line.
 * When FE-2 assigns the beta cohort, the expert read is where that lands, and this answer follows.
 *   · ready-made — `resolveReadyMadeTakeRate()`, the function a Ready-Made purchase is charged by
 *     (the `ready_made_trip` band, with that function's own fallback). Read by the /earn Ready-Made
 *     calculator (LW-1g, ledger `2026-10-16-lw1g-earn-calculator`), so the page states the rate the
 *     sale will take and nothing typed (§8).
 */
import { getExpertSplitRates } from "./commission";
import { BETA_FLAT_BAND, readBand, readProviderCommissionPolicy } from "./fee-resolution.service";
import { providerCommissionPolicy } from "@shared/fee-policy";
import { resolveReadyMadeTakeRate } from "./ready-made-purchase.service";

export interface PublicKeepRates {
  /** Platform take on an expert sale, as a fraction. */
  expertPlatformRate: number | null;
  /** Platform take on a provider line, as a fraction; null when no single rate governs. */
  providerPlatformRate: number | null;
  /** Platform take on a Ready-Made Trip sale, as a fraction (LW-1g). */
  readyMadePlatformRate: number | null;
}

export async function resolvePublicKeepRates(): Promise<PublicKeepRates> {
  const { platformFeeRate } = await getExpertSplitRates();
  let providerPlatformRate: number | null = null;
  if (providerCommissionPolicy(await readProviderCommissionPolicy()) === "beta_flat") {
    const band = await readBand(BETA_FLAT_BAND);
    if (band && band.rateType === "percent" && band.rate >= 0 && band.rate < 1) providerPlatformRate = band.rate;
  }
  const readyMade = await resolveReadyMadeTakeRate();
  const readyMadePlatformRate = Number.isFinite(readyMade) && readyMade >= 0 && readyMade < 1 ? readyMade : null;
  return { expertPlatformRate: platformFeeRate, providerPlatformRate, readyMadePlatformRate };
}
