/**
 * LOCATION MISMATCH — the ONE reader behind the "this is not in a city your plan names" confirm.
 * Ledger `2026-09-04-location-mismatch`.
 *
 * WHAT THIS IS. A traveler adding a service/vendor listing to a plan gets ONE advisory confirm when
 * the listing's city is not a city the plan names. It is an HONESTY surface, not a routing engine:
 * it measures no distance, computes no travel time, geocodes nothing, calls nothing, and makes no
 * claim beyond "this is not in a city your plan names". It never blocks the add, never mutates
 * anything, and its dismissal is not persisted.
 *
 * STOPS LANDED, AND THIS READER NOW CHECKS ALL OF THEM (ledger `2026-09-04-plan-stops-ui`).
 * `trip_destinations` exists (migration 281, CLAUDE.md Locked Decision 34), so a plan can name
 * several cities and `planStops` carries them in order. `2026-09-04-location-mismatch` ruled in
 * advance exactly what to do when they arrived, and this is it: **mismatch checks the EVENT's
 * place first and then EVERY stop, and is NEVER suppressed by stop count** — that suppression was
 * found to be a defect in the reunion lens, and the ratified Mismatch artboard's own footnote
 * ("Plans with more than one stop are not flagged") is the clause the ledger overrode. A plan
 * naming Kyoto and Osaka still flags a Tokyo listing; what changes is that it no longer flags an
 * Osaka one.
 *
 * §13 — NO STOP ROWS MEANS NOT CAPTURED, NOT "no stops". A legacy plan has none (there is no
 * backfill, deliberately), so the comparison falls back EXPLICITLY to `trips.destination`, the
 * position-0 mirror and the one city such a plan does name. An absent list is never read as a plan
 * with nowhere to be.
 *
 * ── THE HONESTY RULES (do not weaken) ────────────────────────────────────────────────────────
 *
 * 1. `provider_services.location` carries `.default("Unknown")` (shared/schema.ts:798). "Unknown"
 *    is a SENTINEL meaning *never answered*, not a city named Unknown. It — and empty/whitespace —
 *    reads as NO LOCATION, which means NO ALERT AT ALL. We never render "This is in Unknown."
 *    (The same filter service-detail.tsx already applies before planting `locationName`.)
 * 2. NULL/absent on EITHER side ⇒ NO ALERT. A missing listing location or a missing comparison
 *    target is silence, never a guess and never a warning (CLAUDE.md §13).
 * 3. NO distance, NO geocoding, NO coordinates, NO external API. The comparison is a normalized
 *    string comparison of city names. If the strings cannot decide it, we do not alert. A false
 *    alert on a plan that is fine is worse than a missed one — this surface's whole value is that
 *    it never overclaims.
 *
 * ── RESOLUTION ORDER (ratified: event first, then plan) ──────────────────────────────────────
 *
 *   1. the named EVENT the item is being added under (`user_experiences`, bound to the trip by
 *      `trip_id` — CLAUDE.md Locked Decision 29) when that event has a `location` set;
 *   2. otherwise EVERY stop the plan names (`trip_destinations`, in order);
 *   3. otherwise `trips.destination` — the position-0 mirror, and all a plan with no stop rows
 *      has to offer.
 *
 * A listing matching ANY ONE of the compared cities is silence: a plan that goes to three cities
 * is not surprised by a vendor in the second of them.
 *
 * An event with NO location falls through to the plan's destination — an unset event location is
 * not an answer, and inheriting the plan's is the only non-guessing move.
 *
 * ── THE NORMALIZATION RULE, AND WHY IT IS SHAPED THIS WAY ────────────────────────────────────
 *
 * Both sides are free text. `trips.destination` comes from a destination picker ("Kyoto",
 * "Kyoto, Japan"); `provider_services.location` is provider-authored and may carry a district
 * ("Gion, Kyoto, Japan"), a country ("Osaka, Japan") or nothing but the city ("Osaka").
 *
 *   a. Split each side on commas into SEGMENTS.
 *   b. Normalize a segment: fold diacritics (NFD, drop combining marks), lowercase, turn every
 *      non-alphanumeric run into a single space, trim. An empty segment, or the literal
 *      "unknown", is dropped.
 *   c. Two segments AGREE when their word arrays are equal, or one is a LEADING PREFIX of the
 *      other ("kyoto" agrees with "kyoto japan"; "osaka" agrees with "osaka bay area").
 *   d. The comparison target's FIRST segment is its city token. The listing MATCHES the plan when
 *      that city token agrees with ANY segment of the listing's location, OR when the listing's
 *      own first segment agrees with ANY segment of the comparison target.
 *   e. Only when no such agreement exists do we alert.
 *
 * WHY LEADING-PREFIX AND NOT CONTAINMENT. The leading words of a free-text place are the most
 * specific name; trailing words broaden it (country, prefecture, state, "bay area"). Accepting a
 * broadening SUFFIX is safe; accepting a prepended qualifier is not — "York" must never match
 * "New York", and "City" must never match "Kansas City". Prefix-only is exactly that asymmetry.
 *
 * WHY THE CITY TOKEN IS THE FIRST SEGMENT OF THE TARGET, BUT ANY SEGMENT OF THE LISTING. Matching
 * ANY segment against ANY segment would silence the mock's own case: "Osaka, Japan" and
 * "Kyoto, Japan" share the segment "japan" and would never flag. Anchoring on the target's city
 * token keeps that case loud, while still letting a district-qualified listing ("Gion, Kyoto")
 * resolve to its city rather than being announced as "This is in Gion." (rule 3 — we do not claim
 * a district is a different city). Rule (d)'s second half is the mirror: a plain listing ("Kyoto")
 * against a district-qualified target ("Gion, Kyoto") stays silent too.
 *
 * KNOWN, ACCEPTED IMPRECISION (stated, not hidden — §18d's negative-space posture):
 *   - a PREPENDED broadening qualifier over-flags ("Greater London" vs "London"). The alert is
 *     advisory and never blocks, so an over-flag costs one dismissal; the reverse — teaching the
 *     rule to accept prepended words — would silently accept "York" for "New York".
 *   - two same-named cities in different regions ("Springfield") cannot be told apart from the
 *     strings, and we do not pretend otherwise: no alert.
 *
 * Pure module: no React, no DOM, no fetch, no dates, no I/O.
 */

/** A location string as it arrives from a row: may be null, empty, whitespace, or the sentinel. */
export type RawLocation = string | null | undefined;

/** Where the city we compared against came from. */
export type MismatchSource = "event" | "plan";

/** Why no alert is shown. Every non-alerting outcome names its reason — silence is never unexplained. */
export type NoMismatchReason =
  | "no_listing_location"
  | "no_comparison_location"
  | "match";

export interface MismatchInput {
  /** The listing's own `provider_services.location`. */
  listingLocation: RawLocation;
  /** `user_experiences.location` for the named event this item is being added under, when there is one. */
  eventLocation?: RawLocation;
  /** `trips.destination` for the plan being added to. */
  planDestination?: RawLocation;
  /**
   * The plan's ordered stops (`trip_destinations`, migration 281) — every city the plan names.
   * ABSENT OR EMPTY = NOT CAPTURED, and the comparison falls back to `planDestination` (§13).
   * Entries carrying no location at all (null, "", the "Unknown" sentinel) are dropped, exactly
   * as on every other side of this module.
   */
  planStops?: ReadonlyArray<RawLocation>;
}

export interface MismatchAlert {
  mismatch: true;
  /** The listing's city, in its ORIGINAL casing, for the headline. */
  listingCity: string;
  /**
   * The city the plan/event names, in its ORIGINAL casing, for the subline. When the plan names
   * several, this is the FIRST — position 0, the one `trips.destination` mirrors.
   */
  comparisonCity: string;
  /**
   * EVERY city compared against, in order and in original casing (ledger
   * `2026-09-04-plan-stops-ui`). One entry for a single-city plan or a named event; several when
   * the plan carries stops. The subline is derived from this, so a three-stop plan is never told
   * "every event on your plan is in <one city>" — a sentence that would be false.
   */
  comparisonCities: string[];
  source: MismatchSource;
}

export interface NoMismatch {
  mismatch: false;
  reason: NoMismatchReason;
}

export type MismatchDecision = MismatchAlert | NoMismatch;

/** The stored sentinel meaning "never answered" — NOT a place (shared/schema.ts:798). */
const ABSENT_SENTINEL = "unknown";

/** Fold diacritics, lowercase, reduce every non-alphanumeric run to one space, trim. */
function normalizeSegment(segment: string): string {
  return segment
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Split a raw location into its normalized comma segments, dropping empties and the sentinel.
 * An absent/empty/sentinel-only value yields an EMPTY array — the caller reads that as "no location".
 */
export function locationSegments(raw: RawLocation): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split(",")
    .map(normalizeSegment)
    .filter((s) => s.length > 0 && s !== ABSENT_SENTINEL);
}

/**
 * The display form of a location's city: its FIRST comma segment, trimmed, in ORIGINAL casing.
 * Returns "" when the value carries no location at all (absent/empty/sentinel).
 */
export function displayCity(raw: RawLocation): string {
  if (typeof raw !== "string") return "";
  if (locationSegments(raw).length === 0) return "";
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    const normalized = normalizeSegment(trimmed);
    if (normalized.length > 0 && normalized !== ABSENT_SENTINEL) return trimmed;
  }
  return "";
}

/** Two normalized segments agree when equal, or when one is a LEADING PREFIX of the other. */
export function segmentsAgree(a: string, b: string): boolean {
  if (!a || !b) return false;
  const left = a.split(" ");
  const right = b.split(" ");
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  return shorter.every((word, i) => word === longer[i]);
}

/**
 * Does the listing's location name a city the comparison target names?
 * See rule (d) above — anchored on the target's FIRST segment, mirrored on the listing's first.
 */
export function locationsAgree(listing: RawLocation, target: RawLocation): boolean {
  const listingSegs = locationSegments(listing);
  const targetSegs = locationSegments(target);
  if (listingSegs.length === 0 || targetSegs.length === 0) return false;
  const targetCity = targetSegs[0];
  if (listingSegs.some((seg) => segmentsAgree(targetCity, seg))) return true;
  const listingCity = listingSegs[0];
  return targetSegs.some((seg) => segmentsAgree(listingCity, seg));
}

/**
 * Decide whether to show the confirm. The whole decision lives here; the dialog is a thin consumer.
 *
 * Returns `{ mismatch: false, reason }` — never a thrown error and never a guess — whenever either
 * side carries no location, or the two agree.
 */
export function comparisonTargets(input: MismatchInput): { source: MismatchSource; targets: RawLocation[] } {
  // The named event's own location wins outright. An event with NO location is not an answer —
  // fall through to the plan rather than invent one (§13).
  if (locationSegments(input.eventLocation).length > 0) {
    return { source: "event", targets: [input.eventLocation] };
  }
  // Then EVERY stop the plan names, in order. Entries with no location are dropped, not counted.
  const stops = (input.planStops ?? []).filter((s) => locationSegments(s).length > 0);
  if (stops.length > 0) return { source: "plan", targets: [...stops] };
  // Then the position-0 mirror — all a plan with no stop rows has, and an explicit fallback
  // rather than a silent one (Locked Decision 34: no rows = NOT CAPTURED, never "no destination").
  if (locationSegments(input.planDestination).length > 0) {
    return { source: "plan", targets: [input.planDestination] };
  }
  return { source: "plan", targets: [] };
}

export function evaluateLocationMismatch(input: MismatchInput): MismatchDecision {
  const listingSegs = locationSegments(input.listingLocation);
  if (listingSegs.length === 0) return { mismatch: false, reason: "no_listing_location" };

  const { source, targets } = comparisonTargets(input);
  if (targets.length === 0) {
    return { mismatch: false, reason: "no_comparison_location" };
  }
  // AGREEING WITH ANY ONE COMPARED CITY IS SILENCE, and the count of them changes nothing else:
  // a plan is never exempted from the check for having several stops (ledger
  // `2026-09-04-location-mismatch`, upheld by `2026-09-04-plan-stops-ui`).
  if (targets.some((target) => locationsAgree(input.listingLocation, target))) {
    return { mismatch: false, reason: "match" };
  }
  const comparisonCities = targets.map((target) => displayCity(target));
  return {
    mismatch: true,
    listingCity: displayCity(input.listingLocation),
    comparisonCity: comparisonCities[0],
    comparisonCities,
    source,
  };
}

/** Headline: the listing's city stated as a fact. */
export function mismatchHeadline(alert: MismatchAlert): string {
  return `This is in ${alert.listingCity}.`;
}

/**
 * Subline: what the plan (or the event being added to) names.
 *
 * A MULTI-STOP PLAN GETS ITS OWN SENTENCE, because the single-city one is not true of it: a plan
 * stopping in three cities cannot be described as having every event in one of them. The cities
 * are listed, in order, with no claim about the route between them (§13, Locked Decision 22c).
 */
export function mismatchSubline(alert: MismatchAlert): string {
  if (alert.source === "event") return `The event you're adding to is in ${alert.comparisonCity}.`;
  const cities = alert.comparisonCities.length > 0 ? alert.comparisonCities : [alert.comparisonCity];
  if (cities.length === 1) return `Every event on your plan is in ${cities[0]}.`;
  const listed = `${cities.slice(0, -1).join(", ")} and ${cities[cities.length - 1]}`;
  return `Your plan stops in ${listed}.`;
}

/**
 * The label of the third action: adding the listing's own city to the plan as a stop (ledger
 * `2026-09-04-plan-stops-ui`; the ratified Mismatch artboard draws it, and it was OMITTED — not
 * stubbed — while `trip_destinations` did not exist). Derived from the decision, never restated
 * at a call site.
 */
export function addAsStopLabel(alert: MismatchAlert): string {
  return `Add ${alert.listingCity} as a stop`;
}

/**
 * The honesty line, verbatim. It is the reason this surface is allowed to exist: it says out loud
 * that nothing was measured, so the traveler reads the alert as the narrow fact it is.
 */
export const MISMATCH_HONESTY_LINE =
  "Nothing is measured or guessed here. It is simply not in a city your plan names.";
