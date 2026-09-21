import type { LandingHeroWantedSlot } from "@shared/landing-hero";
import {
  deriveWantedSlots,
  type HeroOfferingType,
} from "./landing-hero.compose";
import { gatherOfferingCandidates } from "./upsell-query.service";

type GatherCoverage = (opts: {
  marketCity: string;
  includePackages: boolean;
  throwOnError: boolean;
}) => Promise<Array<{ offeringId: string }>>;

/**
 * Resolve city-wide wanted needs. A failed gather is unknown coverage (`null`), never an
 * empty successful result. No neighborhood filter is passed because the public copy makes
 * a city-level claim.
 */
export async function resolveLandingHeroWanted(
  city: string,
  offeringTypes: HeroOfferingType[] | null,
  gather: GatherCoverage = gatherOfferingCandidates,
): Promise<LandingHeroWantedSlot[] | null> {
  if (offeringTypes === null) return null;
  try {
    const rows = await gather({
      marketCity: city.toLowerCase(),
      includePackages: true,
      throwOnError: true,
    });
    return deriveWantedSlots(
      city,
      new Set(rows.map((candidate) => String(candidate.offeringId))),
      offeringTypes,
    );
  } catch (error: any) {
    console.error("[landing-hero] wanted coverage failed; strip omitted:", error?.message);
    return null;
  }
}