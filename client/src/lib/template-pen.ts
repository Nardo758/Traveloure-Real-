import { getTripContext, switchTripContextPreservingId, updateTripContext, type TripContextPatch } from "./trip-context";
import { sameCity } from "./plan-city";

/**
 * A TEMPLATE PAGE DESCRIBES WHAT YOU ARE READING, NOT WHICH PLAN YOU ARE ON (ledger
 * `2026-09-26-occasion-read-only`; audit `docs/planning/trip-slip-ui-audit.md` G5).
 *
 * `/experiences/:slug` mirrors its search basics into the site-wide pen. It used to write the
 * template's occasion (`experienceType`, `experienceSlug`) and a "<Template> Experience" title
 * every time, so visiting `/experiences/wedding` while a Kyoto vacation plan was active relabelled
 * that plan "Your Kyoto Wedding" — and the plan modal would then seed "Wedding" and a Save would
 * write it onto the trip row.
 *
 * The ONE rule for all four of the page's pen writes: while the pen stays bound to a plan (the same
 * city keeps the plan — `switchTripContextPreservingId`), that plan's own occasion and title are
 * kept; the template's occasion and title ride only on a draft with no plan behind it. Changing a
 * plan's occasion is the plan modal's job, never a side effect of reading a page.
 */
export interface TemplatePenWrite {
  slug: string;
  /** The template's occasion NAME (e.g. "Wedding"). */
  occasionName?: string;
  destination?: string;
  startDate?: Date | string;
  endDate?: Date | string;
  travelers?: number;
  /** A title for a NEW draft. Never applied to a bound plan. */
  title?: string;
  /** Additive, non-identity fields the caller merges alongside (contextFields, selectedServices). */
  extra?: TripContextPatch;
}

export function writeTemplatePen(input: TemplatePenWrite): void {
  const live = getTripContext();
  const destination = input.destination?.trim();
  if (destination) {
    const keepsPlan = !!live.tripId && sameCity(live.destination, destination);
    switchTripContextPreservingId({
      destination,
      startDate: input.startDate,
      endDate: input.endDate,
      travelers: input.travelers,
      title: keepsPlan ? live.title : input.title,
      experienceType: keepsPlan ? live.experienceType : input.occasionName,
    });
  }
  const bound = !!getTripContext().tripId;
  const merge: TripContextPatch = { ...(input.extra ?? {}) };
  if (!bound) merge.experienceSlug = input.slug;
  if (Object.keys(merge).some((k) => (merge as Record<string, unknown>)[k] !== undefined)) {
    updateTripContext(merge);
  }
}
