/**
 * Boot content, run ON PURPOSE (ledger `2026-10-18-boot-reference-seeding`). Production boot writes
 * reference data only; these seeders and backfills used to run at every boot and now run here, when the
 * decision-maker says so (Replit runs it). Each step can be run alone with --only=<name>[,<name>…].
 *
 *   npx tsx scripts/seed-boot-content.ts --only=neighborhoods,city-events
 *   npx tsx scripts/seed-boot-content.ts            (every step, in boot order)
 *
 * Steps: destination-calendar, travelpulse, neighborhoods, city-events, popular-cities, major-cities,
 * trip-ownership, affiliate-metadata, cancellation-labels, location-cache-refresh.
 * City events never call Nominatim from here either unless --venue-lookup is passed.
 */
import { seedDestinationCalendar } from "../server/seed-destination-calendar";
import { seedTravelPulseData } from "../server/seed-travelpulse";
import { seedCityNeighborhoods } from "../server/seeds/city-neighborhoods.seed";
import { seedManualCityEvents } from "../server/seeds/city-events.manual";
import { seedPopularCitiesContent } from "../server/seeds/popular-cities-content.seed";
import { seedMajorCitiesBackfill } from "../server/seeds/major-cities-backfill.seed";
import { seedTripOwnership } from "../server/seeds/trip-ownership.seed";
import { relabelCancellationFilterOptions } from "../server/seeds/experience-template-tabs.seed";
import { seedLocationCache } from "../server/seeds/location-cache.seed";
import { storage } from "../server/storage";
import { pool } from "../server/db";

const venueLookup = process.argv.includes("--venue-lookup");

export const BOOT_CONTENT_STEPS: Record<string, () => Promise<unknown>> = {
  "destination-calendar": () => seedDestinationCalendar(),
  travelpulse: () => seedTravelPulseData(),
  neighborhoods: () => seedCityNeighborhoods(),
  "city-events": () => seedManualCityEvents(venueLookup ? {} : { venueLookup: false }),
  "popular-cities": () => seedPopularCitiesContent(),
  "major-cities": () => seedMajorCitiesBackfill(),
  "trip-ownership": () => seedTripOwnership(),
  "affiliate-metadata": () => storage.backfillAffiliateProviderMetadata(),
  "cancellation-labels": () => relabelCancellationFilterOptions(),
  "location-cache-refresh": () => seedLocationCache({ refresh: true }),
};

async function main() {
  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const names = onlyArg ? onlyArg.slice("--only=".length).split(",").filter(Boolean) : Object.keys(BOOT_CONTENT_STEPS);
  const unknown = names.filter((n) => !(n in BOOT_CONTENT_STEPS));
  if (unknown.length > 0) {
    console.error(`[seed-boot-content] unknown step(s): ${unknown.join(", ")}`);
    process.exit(2);
  }
  for (const name of names) {
    const result = await BOOT_CONTENT_STEPS[name]();
    console.log(`[seed-boot-content] ${name}: ${JSON.stringify(result ?? null)}`);
  }
}

if (process.argv[1] && process.argv[1].endsWith("seed-boot-content.ts")) {
  main()
    .then(() => pool.end())
    .catch((err) => {
      console.error("[seed-boot-content] failed:", err);
      process.exit(1);
    });
}
