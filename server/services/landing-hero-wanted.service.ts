import type { LandingHeroWantedSlot } from "@shared/landing-hero";
import {
  deriveWantedSlots,
  type HeroOfferingType,
} from "./landing-hero.compose";

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
  gather?: GatherCoverage,
): Promise<LandingHeroWantedSlot[] | null> {
  if (offeringTypes === null) return null;
  try {
    // The default gather is resolved LAZILY so this module carries no STATIC edge to
    // `server/db`. The composer's proof runs in `unit-suite-client-components`, a unit
    // job with no DATABASE_URL, and a static import kills the runner at module load
    // before a single assertion. An import that fails here is a failed gather like any
    // other, so it takes the same honest answer below: unknown coverage, strip omitted.
    const gatherCandidates =
      gather ?? (await import("./upsell-query.service")).gatherOfferingCandidates;
    const rows = await gatherCandidates({
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