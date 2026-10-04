/**
 * (Step 6, R-bc: also the trip city's seeded `city_events` whose dates overlap the trip.)
 *
 * Smoke 9 S9-8 (extends R-w; ledger `2026-10-04-smoke9-addendum`): the R-p EVENT facts that cover a
 * trip's dates — the only events a draft may name. ONE loader, read by the drafting prompt (its list)
 * and by the storage pass (`ai-draft-sanitize`, which reduces every other event-named title).
 *
 * An R-p event fact is a current (`superseded_by IS NULL`, unexpired) `event` fact that the ONE
 * official-source predicate accepts (`isOfficialPublicFact`: crawled, official source, public_ok), in
 * the trip's market, whose STRUCTURED dates (`value.startDate`/`endDate`) overlap the trip
 * (`eventFactCoversDates`). Prose is never parsed into a date (§13), so a fact without structured
 * dates covers nothing. Never throws: a failed read is "none confirmed", which reduces, never invents.
 */
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { cityEvents, contentSources, placeFacts } from "@shared/schema";
import { isOfficialPublicFact } from "@shared/content-facts";
import { cityEventCoversDates, eventFactCoversDates, type CoveringEvent } from "@shared/ai-place-text";
import { resolveMarketSlug } from "../trend-engine/operating-markets";

export async function coveringEventsForTrip(input: {
  destination: string | null | undefined;
  startDate: string | Date | null | undefined;
  endDate: string | Date | null | undefined;
  now?: Date;
}): Promise<CoveringEvent[]> {
  const market = resolveMarketSlug(input.destination ?? null);
  const iso = (d: string | Date | null | undefined) => (d instanceof Date ? d.toISOString().slice(0, 10) : typeof d === "string" ? d.slice(0, 10) : null);
  const start = iso(input.startDate);
  const end = iso(input.endDate);
  if (!market || !start || !end) return [];
  try {
    const rows = await db
      .select({
        value: placeFacts.value,
        origin: placeFacts.origin,
        license: placeFacts.license,
        factType: placeFacts.factType,
        sourceLicenseClass: contentSources.licenseClass,
        sourcePublicOk: contentSources.publicOk,
      })
      .from(placeFacts)
      .leftJoin(contentSources, eq(contentSources.id, placeFacts.sourceId))
      .where(
        and(
          eq(placeFacts.factType, "event"),
          eq(placeFacts.market, market),
          isNull(placeFacts.supersededBy),
          or(isNull(placeFacts.expiresAt), gt(placeFacts.expiresAt, input.now ?? sql`now()`)),
        ),
      );
    const out: CoveringEvent[] = [];
    for (const r of rows) {
      if (!isOfficialPublicFact(r as any)) continue;
      if (!eventFactCoversDates(r.value, start, end)) continue;
      const v = (r.value ?? {}) as Record<string, unknown>;
      const name = [v.name, v.title, v.query].find((x): x is string => typeof x === "string" && x.trim().length > 0);
      if (name && !out.some((e) => e.name === name.trim())) out.push({ name: name.trim() });
    }
    // R-bc (step 6): the seeded `city_events` in the trip's city that overlap its dates are confirmed
    // events too — the prompt may name them, so the storage pass must keep them (one list, two layers).
    const city = (input.destination ?? "").split(",")[0].trim().toLowerCase();
    if (city) {
      const evs = await db
        .select({ title: cityEvents.title, startsAt: cityEvents.startsAt, endsAt: cityEvents.endsAt })
        .from(cityEvents)
        .where(and(sql`lower(${cityEvents.city}) = ${city}`, isNull(cityEvents.withdrawnAt)));
      for (const e of evs) {
        if (!cityEventCoversDates(e.startsAt, e.endsAt, start, end)) continue;
        const name = (e.title ?? "").trim();
        if (name && !out.some((x) => x.name === name)) out.push({ name });
      }
    }
    return out;
  } catch (err) {
    console.error(`[covering-events] read failed market=${market}:`, (err as Error)?.message ?? err);
    return [];
  }
}
