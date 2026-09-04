/**
 * PLAN STOPS — THE ONE CLIENT-SIDE WRITER of a plan's ordered stops.
 * Ledger `2026-09-04-plan-stops-ui`; server writer `PUT /api/trips/:tripId/destinations`
 * (migration 281, CLAUDE.md Locked Decision 34).
 *
 * TWO SURFACES STATE STOPS, AND THEY WRITE THROUGH THIS ONE FUNCTION: the plan modal's step 2
 * (the ordered list under `default_stops = "many"`) and the location-mismatch dialog's "add this
 * city as a stop". A second copy of "bound trip ⇒ PUT the replace-list, no trip ⇒ hold it in the
 * pre-trip pen" is the derivation-drift class CLAUDE.md §18 rule 1 names — and the two halves of
 * that rule are exactly the kind that drift apart, because only one of them is exercised on any
 * given click.
 *
 * IT IS A REPLACE-LIST, WHICH MEANS THE CALLER MUST HAVE READ THE CURRENT LIST FIRST. The server
 * derives positions from array order and deletes whatever it does not receive, so a caller that
 * sends a list it did not first read would silently drop stops it never saw. That is a caller's
 * responsibility and is stated at both call sites; this module cannot check it.
 *
 * §13 — AN EMPTY PAYLOAD WRITES NOTHING. `trips.destination` is NOT NULL and the server refuses an
 * empty list with a 400, so "every stop was cleared" is not a state a plan can be in. Rather than
 * send a request that is known to fail, this returns `no_stops` and leaves the plan as it stands.
 *
 * BEST-EFFORT, LIKE EVERY OTHER WRITE THE MODAL MAKES. A guest, a non-owner, an offline tab: the
 * failure is reported to the caller and never thrown into a save that has already succeeded.
 */
import { apiRequest } from "@/lib/queryClient";
import { updateTripContext } from "@/lib/trip-context";
import { stopsPayload, type PlanStop } from "@/lib/plan-stops";

export type SavePlanStopsResult =
  /** Written to `trip_destinations` — the plan row now carries these stops. */
  | { ok: true; where: "trip" }
  /** Held in the pre-trip pen (no plan row exists yet). */
  | { ok: true; where: "context" }
  /** Nothing was named, so nothing was written. Not an error — see §13 above. */
  | { ok: false; reason: "no_stops" }
  /** The request failed. The caller decides whether that is worth surfacing. */
  | { ok: false; reason: "request_failed"; message?: string };

export async function savePlanStops(
  tripId: string | null | undefined,
  stops: readonly PlanStop[],
): Promise<SavePlanStopsResult> {
  const payload = stopsPayload(stops);
  if (payload.length === 0) return { ok: false, reason: "no_stops" };

  if (!tripId) {
    // NO PLAN ROW YET — hold, and be honest about it. The pen is the same shape the wire takes,
    // so whichever mint binds a trip can replay it without re-deriving anything.
    updateTripContext({ stops: payload });
    return { ok: true, where: "context" };
  }

  try {
    await apiRequest("PUT", `/api/trips/${tripId}/destinations`, { stops: payload });
    // The rows are the truth now; the pen must not replay a stale list over them on a later save.
    // `[]` is the cleared marker in this blob — `updateTripContext` merges and cannot delete a key
    // (the same reason the party steppers write 0 rather than leaving a stale count).
    updateTripContext({ stops: [] });
    return { ok: true, where: "trip" };
  } catch (err: any) {
    return { ok: false, reason: "request_failed", message: err?.message };
  }
}
