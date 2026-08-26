/**
 * Pricing display bundle (Phase 1 of the /pricing rebuild lane).
 *
 * GET /api/pricing — the only client read the future /pricing page needs.
 * Every value is resolved live from `plans` / `fee_bands` / `optimization_fees`;
 * nothing here is a price literal. A missing/inactive/mismatched-type required
 * row fails loudly (500) rather than serving a fabricated price.
 *
 * See docs/superpowers/specs/2026-08-26-pricing-bundle-design.md for the
 * approved contract and docs/design/PRICING_AND_FEATURE_MAP.md for the ledger.
 */
import { Router } from "express";
import { requirePlan, PLAN_KEYS } from "../services/plans.service";
import {
  requireBand,
  requireFlatCentsBand,
  requireBandType,
  requireCountBand,
  CONCIERGE_AI_TASK_BAND,
  CONCIERGE_DONE_FOR_YOU_DEPOSIT_BAND,
  PROVIDER_PRO_BAND_STEP,
  PROVIDER_RAILS_BAND,
} from "../services/fee-resolution.service";
import { getFee } from "../services/optimization-fee.service";

const router = Router();

// The approved one-step Pro rate ladder (limited → moderate). Narrative-named
// per the ratified pricing map; the live band keys are unchanged.
const PRO_RATE_STANDARD_BAND = "limited";
const PRO_RATE_STEPPED_BAND = "moderate";

/** Exported directly so tests can invoke it without standing up the full app/auth stack. */
export const getPricingHandler = async (_req: any, res: any) => {
  try {
    const [tripPass, plusAnnual, proMonthly] = await Promise.all([
      requirePlan(PLAN_KEYS.TRIP_PASS),
      requirePlan(PLAN_KEYS.PLUS_ANNUAL),
      requirePlan(PLAN_KEYS.PRO_MONTHLY),
    ]);

    const [
      travelerServiceFeeBand,
      aiTaskBand,
      doneForYouDepositBand,
      proRateStandardBand,
      proRateSteppedBand,
      railsBand,
      proBandStepBand,
      optimizerRun,
    ] = await Promise.all([
      requireBand("traveler_service_fee"),
      requireFlatCentsBand(CONCIERGE_AI_TASK_BAND),
      requireBandType(CONCIERGE_DONE_FOR_YOU_DEPOSIT_BAND, "percent"),
      requireBand(PRO_RATE_STANDARD_BAND),
      requireBand(PRO_RATE_STEPPED_BAND),
      requireBand(PROVIDER_RAILS_BAND),
      requireCountBand(PROVIDER_PRO_BAND_STEP),
      getFee(null, "simple"),
    ]);

    if (travelerServiceFeeBand.maxAmount === null) {
      throw new Error("traveler_service_fee band is missing its max_amount cap");
    }

    const bundle = {
      serviceFeePct: round1(travelerServiceFeeBand.rate * 100),
      serviceFeeCapCents: Math.round(travelerServiceFeeBand.maxAmount * 100),
      optimizerRunDisplay: {
        priceCents: optimizerRun.priceCents,
        currency: optimizerRun.currency,
        complexityTier: "simple" as const,
      },
      aiTaskCents: aiTaskBand.rate,
      tripPass: {
        key: "trip_pass" as const,
        name: tripPass.name,
        priceCents: tripPass.priceCents,
        interval: "trip" as const,
      },
      plusAnnual: {
        key: "plus_annual" as const,
        name: plusAnnual.name,
        priceCents: plusAnnual.priceCents,
        interval: "year" as const,
      },
      proMonthly: {
        key: "pro_monthly" as const,
        name: proMonthly.name,
        priceCents: proMonthly.priceCents,
        interval: "month" as const,
        betaFreeUntil: proMonthly.betaFreeUntil ?? null,
      },
      doneForYouDepositPct: round1(doneForYouDepositBand.rate * 100),
      proRateStandard: round1(proRateStandardBand.rate * 100),
      proRateStepped: round1(proRateSteppedBand.rate * 100),
      railsRate: round1(railsBand.rate * 100),
      proBandStep: proBandStepBand.rate,
    };

    res.json(bundle);
  } catch (err: any) {
    console.error("[pricing] failed to resolve pricing display bundle:", err?.message);
    res.status(500).json({ message: "Pricing configuration is unavailable" });
  }
};

/** Round to at most one decimal place — fractional bands (e.g. 7.5%) must render cleanly. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

router.get("/api/pricing", getPricingHandler);

export default router;
