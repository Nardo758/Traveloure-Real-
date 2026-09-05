/**
 * PLAN STOPS — the ordered stop list a traveler edits, as a PURE reducer.
 * Ledger `2026-09-04-plan-stops-ui`; writes land in `trip_destinations` (migration 281,
 * CLAUDE.md Locked Decision 34).
 *
 * WHY THIS IS A MODULE AND NOT COMPONENT STATE. The list has real rules — position 0 IS the
 * plan's destination (the mirror), a blank row is not a stop, a stop with only one coordinate is
 * not placed, the list can never be emptied — and every one of them has to hold identically
 * whether the edit came from the plan modal's step 2 or from the location-mismatch dialog's "add
 * this city as a stop". Two copies of those rules is the derivation-drift class CLAUDE.md §18
 * rule 1 names. React never appears below this line, so the rules keep their proof in the unit
 * lane (`client/src/lib/__tests__/plan-stops.test.ts`).
 *
 * THE LIST INCLUDES THE DESTINATION FIELD. Index 0 is the "Destination" input the modal has always
 * shown; the extra rows are stops 2..n. That is not a presentation choice — `trips.destination` is
 * the POSITION-0 MIRROR of `trip_destinations` (Locked Decision 34), so a reorder that moves
 * another city to the front genuinely changes the plan's headline destination, its market and its
 * IANA zone, and the server re-derives all three when it re-mirrors. Modelling the destination as
 * a separate thing OUTSIDE the list would have hidden that.
 *
 * §13 — WHAT THIS MODULE REFUSES TO INVENT.
 *   · A stop the traveler has not named is NOT a stop: it is dropped from the payload, never sent
 *     as an empty string and never given a placeholder name.
 *   · COORDINATES COME ONLY FROM AN EXPLICIT PLACEMENT. Nothing here geocodes, looks up or derives
 *     lat/lng from a name — a stop with none stays UNLOCATED and is meant to be shown as such.
 *     A half coordinate is dropped rather than half-sent (the server refuses it outright).
 *   · THE SEQUENCE IS AN ORDER, NOT A ROUTE. `stopSequence` joins names with an arrow and computes
 *     no distance, duration or path (Locked Decision 22c). There is no routing here to be had.
 */
import { displayCity, locationsAgree } from "./location-mismatch";

/**
 * The most stops the UI will offer to add. It MIRRORS `MAX_TRIP_DESTINATIONS` in
 * `server/services/trip-destinations.pure.ts`, which is the AUTHORITY — the server refuses a
 * longer list whatever the client believes. This constant only stops the UI from inviting an add
 * that would be rejected; it is not a second rule, and if the server's cap moves this follows it.
 */
export const MAX_PLAN_STOPS = 20;

/**
 * One stop as the traveler is editing it. `name` may be "" while a freshly added row is still
 * being typed into — that empty row is a UI state, never a saved one (see `stopsPayload`).
 */
export interface PlanStop {
  name: string;
  city?: string;
  country?: string;
  /** Both or neither, and only ever from an explicit placement. No lookup writes these. */
  lat?: number;
  lng?: number;
}

/** The wire shape of `PUT /api/trips/:tripId/destinations` — positions are derived SERVER-side. */
export interface PlanStopPayload {
  name: string;
  city?: string;
  country?: string;
  lat?: number;
  lng?: number;
}

/** A list is never empty: index 0 is the destination field, which always exists. */
export function ensureFirstStop(stops: readonly PlanStop[]): PlanStop[] {
  return stops.length === 0 ? [{ name: "" }] : [...stops];
}

/** Append an empty row for the traveler to type into. Capped; a full list is returned unchanged. */
export function addStop(stops: readonly PlanStop[]): PlanStop[] {
  const list = ensureFirstStop(stops);
  if (list.length >= MAX_PLAN_STOPS) return list;
  return [...list, { name: "" }];
}

/**
 * Remove one row. The LAST remaining row is never removed — `trips.destination` is NOT NULL and a
 * plan with zero stops is not a state the schema can hold (Locked Decision 34), so the row stays
 * and can only be emptied. Removing index 0 of a longer list PROMOTES the next stop, which is the
 * traveler saying the plan now starts somewhere else.
 */
export function removeStopAt(stops: readonly PlanStop[], index: number): PlanStop[] {
  const list = ensureFirstStop(stops);
  if (list.length <= 1) return list;
  if (index < 0 || index >= list.length) return list;
  return list.filter((_, i) => i !== index);
}

/** Move one row up or down by one. Out-of-range moves are no-ops, never wraps. */
export function moveStop(
  stops: readonly PlanStop[],
  index: number,
  direction: "up" | "down",
): PlanStop[] {
  const list = ensureFirstStop(stops);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * Rename one row. The name is stored EXACTLY as typed (trimming happens at the payload boundary),
 * because a traveler mid-word has not finished answering.
 */
export function renameStopAt(stops: readonly PlanStop[], index: number, name: string): PlanStop[] {
  const list = ensureFirstStop(stops);
  if (index < 0 || index >= list.length) return list;
  const next = [...list];
  next[index] = { ...next[index], name };
  return next;
}

/** Is this stop placed on a map? Both coordinates, or it is UNLOCATED and stays flagged (§13). */
export function isLocatedStop(stop: PlanStop | undefined | null): boolean {
  return typeof stop?.lat === "number" && typeof stop?.lng === "number";
}

/**
 * Append a city the traveler asked to add — the location-mismatch dialog's third action.
 *
 * IDEMPOTENT BY CITY, not by string: a plan that already names "Kyoto, Japan" does not gain a
 * second "Kyoto" row. The comparison is `locationsAgree`, the SAME rule that decided the listing
 * was elsewhere in the first place (§18 rule 1 — a second notion of "these two strings name the
 * same city" is exactly how the dialog and the list would come to disagree). A blank name adds
 * nothing: there is no city to add.
 *
 * The new stop carries a NAME AND NOTHING ELSE. No coordinates: the listing's own location is a
 * free-text string, and turning it into a placed pin would be the geocode this whole surface
 * promises it never does.
 */
export function appendStopNamed(stops: readonly PlanStop[], name: string): PlanStop[] {
  const list = ensureFirstStop(stops);
  const trimmed = name.trim();
  if (trimmed === "") return list;
  if (list.some((s) => locationsAgree(s.name, trimmed))) return list;
  if (list.length >= MAX_PLAN_STOPS) return list;
  // The destination field is index 0 and may still be empty (a plan whose city was never typed).
  // Filling it is the honest place for the first city, rather than leaving a blank headline
  // destination with a stop hanging off it.
  if (list.length === 1 && list[0].name.trim() === "") return [{ ...list[0], name: trimmed }];
  return [...list, { name: trimmed }];
}

/**
 * The rows to SEND. Names are trimmed here (the one place it happens), blank rows are dropped —
 * a row nobody named is not a stop — and a half coordinate is dropped rather than half-sent.
 *
 * Returns an EMPTY array when nothing is named, and the caller must then write NOTHING: the
 * server refuses an empty list with a 400 because `trips.destination` is NOT NULL, and "the
 * traveler cleared every stop" is not a state a plan can be in.
 */
export function stopsPayload(stops: readonly PlanStop[]): PlanStopPayload[] {
  const payload: PlanStopPayload[] = [];
  for (const stop of stops) {
    const name = stop.name.trim();
    if (name === "") continue;
    const row: PlanStopPayload = { name };
    const city = stop.city?.trim();
    const country = stop.country?.trim();
    if (city) row.city = city;
    if (country) row.country = country;
    if (isLocatedStop(stop)) {
      row.lat = stop.lat;
      row.lng = stop.lng;
    }
    payload.push(row);
  }
  return payload;
}

/** The named stops, in order — what a summary or a count should read, blank rows excluded. */
export function namedStops(stops: readonly PlanStop[]): PlanStop[] {
  return stops.filter((s) => s.name.trim() !== "");
}

/**
 * The stop list as a SEQUENCE: "Edinburgh → St Andrews → Dornoch".
 *
 * An ORDER, and nothing more (Locked Decision 22c, the service-map ruling's rendering-honesty
 * clause, which this follows deliberately rather than inventing a second posture): no distance,
 * no duration, no travel routing, and the arrow means "then", not "drive". Empty when no stop has
 * been named — a sequence of nothing is not rendered as a sequence.
 */
export function stopSequence(stops: readonly PlanStop[]): string {
  return namedStops(stops)
    .map((s) => s.name.trim())
    .join(" → ");
}

/**
 * Seed the editable list from the plan the traveler already has.
 *
 * `destinations` is `GET /api/trips/:id`'s ordered `trip_destinations` rows (lane A's read
 * exposure); `destination` is `trips.destination`, the position-0 mirror.
 *
 * §13 — NO ROWS MEANS NOT CAPTURED, NOT "no stops". A legacy plan has no child rows (there is no
 * backfill, deliberately), so the list falls back EXPLICITLY to the one string the plan does
 * carry, exactly as Locked Decision 34 requires of every reader. It never starts empty on a plan
 * that plainly names a city.
 */
export function seedStops(
  destination: string | null | undefined,
  destinations?: ReadonlyArray<{
    name?: string | null;
    city?: string | null;
    country?: string | null;
    lat?: string | number | null;
    lng?: string | number | null;
  }> | null,
): PlanStop[] {
  if (Array.isArray(destinations) && destinations.length > 0) {
    return destinations.map((row) => {
      const stop: PlanStop = { name: (row.name ?? "").trim() };
      if (row.city) stop.city = String(row.city);
      if (row.country) stop.country = String(row.country);
      // `decimal` columns round-trip as STRINGS through drizzle. A value that does not parse is
      // left off rather than coerced to 0 — 0,0 is a real place in the Gulf of Guinea (§13).
      const lat = row.lat === null || row.lat === undefined ? NaN : Number(row.lat);
      const lng = row.lng === null || row.lng === undefined ? NaN : Number(row.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        stop.lat = lat;
        stop.lng = lng;
      }
      return stop;
    });
  }
  return [{ name: (destination ?? "").trim() }];
}

/**
 * The city an "add this as a stop" action would add for a listing location — the listing's own
 * first segment, in its original casing. Delegates to the mismatch reader's `displayCity` so the
 * dialog's label and the row that gets written can never name two different cities.
 */
export function stopNameForLocation(location: string | null | undefined): string {
  return displayCity(location);
}
