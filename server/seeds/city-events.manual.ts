/**
 * city-events.manual.ts — the hand-kept list of festivals and one-night shows in the operating
 * cities (ledger `2026-09-28-city-events`).
 *
 * ENTRIES COME FROM THE DECISION-MAKER ONLY: series, city, venue, dates and the organiser's ticket
 * URL. Never pad this list — the landing strip stays absent until there are three real events in
 * the next 180 days, and an invented row would put a false date in front of a traveler (§13).
 *
 * Each entry:
 *   { source: "manual", sourceId: "<stable-slug>", series, title, city: "<operating city>",
 *     venue, venueLat?, venueLng?, startsAt: "<ISO with offset>", endsAt?, ticketUrl?,
 *     billedArtists?, blurb: "<one line of copy>", imagePath? }
 *   - `sourceId` never changes once published: the seeder keys on it and inserts only.
 *   - `imagePath` only for a photo the repo has rights to; never an organiser's, venue's or
 *     artist's official image. Leave it out and the card uses the city's own repo fallback
 *     (today Kyoto and Bogotá), else no photo.
 *   - `ticketUrl` is the organiser's or primary seller's page; an affiliate or resale host is refused
 *     by the seeder.
 *   - Do not state nights or a neighbourhood: both are derived.
 *
 * Run: `tsx server/seeds/city-events.manual.ts` (also runs at boot; a no-op while empty).
 */
import type { CityEventSeedEntry } from "../services/city-events.service";

export const MANUAL_CITY_EVENTS: readonly CityEventSeedEntry[] = [];

export async function seedManualCityEvents() {
  const { seedCityEvents } = await import("../services/city-events.service");
  return seedCityEvents(MANUAL_CITY_EVENTS);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedManualCityEvents()
    .then((r) => {
      console.log(`[city-events] inserted ${r.inserted}, skipped ${r.skipped}, refused ${r.refused.length}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
