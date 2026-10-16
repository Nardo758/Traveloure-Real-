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
 * FE-2 ruling 6 (ledger `2026-10-16-fe2-beta-cohort`): the expert rate is the band named by
 * `expert_approval_rate_cohort` — what a newly approved expert will pay — while that cohort applies
 * (`resolveApprovalCohortRate`, the same end-date and band rules the resolver uses), and then the
 * cohort label and notice days for the F3 clause. With no applicable cohort it is the ordinary split.
 *   · ready-made — `resolveReadyMadeTakeRate()`, the function a Ready-Made purchase is charged by
 *     (the `ready_made_trip` band, with that function's own fallback). Read by the /earn Ready-Made
 *     calculator (LW-1g, ledger `2026-10-16-lw1g-earn-calculator`), so the page states the rate the
 *     sale will take and nothing typed (§8).
 *   · ready-made example — the `earn_ready_made_example_enabled` setting (Leon, Oct 16, 2026: build the $20
 *     example line behind it, off by default). A missing row or a read error is false: the line stays hidden.
 */
import { getExpertSplitRates } from "./commission";
import { resolveApprovalCohortRate } from "./expert-rate-cohort.service";
import { BETA_FLAT_BAND, readBand, readProviderCommissionPolicy } from "./fee-resolution.service";
import { providerCommissionPolicy } from "@shared/fee-policy";
import { resolveReadyMadeTakeRate } from "./ready-made-purchase.service";
import { FLAG_EARN_READY_MADE_EXAMPLE, getPlatformFlag } from "./platform-flags";

export interface PublicKeepRates {
  /** Platform take on an expert sale, as a fraction. */
  expertPlatformRate: number | null;
  /** Platform take on a provider line, as a fraction; null when no single rate governs. */
  providerPlatformRate: number | null;
  /** Present only when the expert rate is a cohort's: its label and the notice days (null if unset). */
  expertCohort: { label: string; noticeDays: number | null } | null;
  /** Platform take on a Ready-Made Trip sale, as a fraction (LW-1g). */
  readyMadePlatformRate: number | null;
  /** True only when an admin has set `earn_ready_made_example_enabled` to "true" (LW-1g); else the example is hidden. */
  readyMadeExampleEnabled: boolean;
}

export async function resolvePublicKeepRates(): Promise<PublicKeepRates> {
  const cohort = await resolveApprovalCohortRate();
  const expertPlatformRate = cohort ? cohort.rate : (await getExpertSplitRates()).platformFeeRate;
  let providerPlatformRate: number | null = null;
  if (providerCommissionPolicy(await readProviderCommissionPolicy()) === "beta_flat") {
    const band = await readBand(BETA_FLAT_BAND);
    if (band && band.rateType === "percent" && band.rate >= 0 && band.rate < 1) providerPlatformRate = band.rate;
  }
  const readyMade = await resolveReadyMadeTakeRate();
  const readyMadePlatformRate = Number.isFinite(readyMade) && readyMade >= 0 && readyMade < 1 ? readyMade : null;
  return {
    expertPlatformRate,
    providerPlatformRate,
    expertCohort: cohort ? { label: cohort.label, noticeDays: cohort.noticeDays } : null,
    readyMadePlatformRate,
    readyMadeExampleEnabled: await getPlatformFlag(FLAG_EARN_READY_MADE_EXAMPLE, false),
  };
}
