import { switchTripContext, type TripContext } from "./trip-context";

/**
 * Minimal shape of a trip row needed to bind the site-wide TripContext to it —
 * satisfied by `Trip` (shared/schema.ts) without importing the whole type, so
 * any trip-list surface (dashboard, my-trips, …) can reuse this.
 */
export interface TripIdentitySource {
  id: string;
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  title?: string | null;
  numberOfTravelers?: number | null;
  travelers?: number | null;
  experienceType?: string | null;
  eventType?: string | null;
}

/**
 * Atomically re-key the site-wide TripContext to `trip`'s OWN data (#972).
 *
 * Use this anywhere a control makes `trip` THE active trip — a dashboard trip
 * chip, a trip-strip switcher, etc. — instead of a plain `setState` that only
 * updates the control's own local UI and a bare `updateTripContext` merge
 * that leaves `tripId` pointing at whichever trip was previously active while
 * destination/dates silently follow the newly picked one (the desync class
 * fixed by #354 and re-found by #972: the dashboard trip chip updated only
 * its own local `selectedTripId` state and never touched TripContext at all,
 * so /cart kept sending the OLD trip's id to /api/optimization-payments, and
 * the Lane-6 trip-scoped push wrote the NEW trip's dates into the OLD trip's
 * `trip_contexts` row).
 *
 * All identity/display fields (tripId, destination, dates, title, travelers,
 * experienceType) are set together from the trip row itself in ONE
 * switchTripContext call — REPLACE semantics, so nothing from a previously
 * active trip can survive the switch by omission.
 */
export function syncActiveTripToContext(trip: TripIdentitySource): TripContext {
  return switchTripContext({
    tripId: trip.id,
    destination: trip.destination ?? undefined,
    startDate: trip.startDate ?? undefined,
    endDate: trip.endDate ?? undefined,
    title: trip.title ?? undefined,
    travelers: trip.numberOfTravelers ?? trip.travelers ?? undefined,
    experienceType: trip.experienceType ?? trip.eventType ?? undefined,
  });
}
