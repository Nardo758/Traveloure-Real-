/**
 * R-bc (step 6 — ledger `2026-10-04-step6-trip-card`): the destination's SEASON facts for a trip's
 * months — `destination_seasons` rows for the trip's city (rating, crowds, weather) — read by every
 * drafting prompt through `aiSeasonPromptLine`. Never throws: a failed read is "no season recorded",
 * which adds nothing to the prompt and claims nothing (§13).
 */
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { destinationSeasons } from "@shared/schema";
import { aiSeasonPromptLine, tripMonths, type SeasonFact } from "@shared/ai-place-text";

export async function seasonFactsForTrip(input: {
  destination: string | null | undefined;
  startDate: string | Date | null | undefined;
  endDate: string | Date | null | undefined;
}): Promise<SeasonFact[]> {
  const iso = (d: string | Date | null | undefined) => (d instanceof Date ? d.toISOString().slice(0, 10) : typeof d === "string" ? d.slice(0, 10) : null);
  const city = (input.destination ?? "").split(",")[0].trim().toLowerCase();
  const months = tripMonths(iso(input.startDate), iso(input.endDate));
  if (!city || !months.length) return [];
  try {
    const rows = await db
      .select({ month: destinationSeasons.month, rating: destinationSeasons.rating, crowdLevel: destinationSeasons.crowdLevel, weatherDescription: destinationSeasons.weatherDescription })
      .from(destinationSeasons)
      .where(sql`lower(${destinationSeasons.city}) = ${city} AND ${destinationSeasons.month} IN (${sql.join(months.map((m) => sql`${m}`), sql`, `)})`);
    return rows;
  } catch (err) {
    console.error(`[season-facts] read failed city=${city}:`, (err as Error)?.message ?? err);
    return [];
  }
}

/** The season prompt line for a trip ("" when none recorded). */
export async function seasonPromptLineForTrip(input: { destination: string | null | undefined; startDate: string | Date | null | undefined; endDate: string | Date | null | undefined }): Promise<string> {
  const iso = (d: string | Date | null | undefined) => (d instanceof Date ? d.toISOString().slice(0, 10) : typeof d === "string" ? d.slice(0, 10) : null);
  return aiSeasonPromptLine(await seasonFactsForTrip(input), iso(input.startDate), iso(input.endDate));
}
