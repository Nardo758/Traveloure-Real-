import { getTripContext, replaceTripContextPlanAnswers, switchTripContext, type TripContext } from "./trip-context";

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
  /** The plan's own step-4 pair; absent/NULL means that plan never stated it (RC-12). */
  adults?: number | null;
  kids?: number | null;
  /** The plan's own resolved occasion slug, when the caller holds it; absent ⇒ not known (RC-12). */
  experienceSlug?: string | null;
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
  switchTripContext({
    tripId: trip.id,
    destination: trip.destination ?? undefined,
    startDate: trip.startDate ?? undefined,
    endDate: trip.endDate ?? undefined,
    title: trip.title ?? undefined,
    travelers: trip.numberOfTravelers ?? trip.travelers ?? undefined,
    experienceType: trip.experienceType ?? trip.eventType ?? undefined,
  });
  // RC-12: the step-4 pair and the occasion are this plan's too. Without this the previous plan's
  // answers stayed in the pen and the plan modal seeded — and could save — them onto this one
  // (see `replaceTripContextPlanAnswers`).
  return replaceTripContextPlanAnswers({
    adults: trip.adults,
    kids: trip.kids,
    experienceSlug: trip.experienceSlug,
  });
}

/**
 * OPENING A PLAN MAKES IT THE ACTIVE PLAN — RC-5 (ledger `2026-09-25-rc345-active-plan`; audit
 * J2 R4b: viewing plan B's slip added to plan A). ONE rule, two callers (the slip and the Trip Card):
 *  · the OWNER only. The pen mirrors to `trip_contexts`, an owner-scoped row (`PUT ?tripId=` is
 *    ownership-checked), and an advisor's or delegate's view is not their plan to carry around.
 *  · only once the pen is BOUND to that viewer (`penPrincipal`, from `usePenPrincipal`). A write
 *    before the bind lands in the guest key and is dropped at the hand-off — an effect lower in the
 *    tree fires before `PenBinder`'s in the same commit.
 *  · idempotent: a pen already naming this plan is left exactly as it is, so a plancard re-fetch
 *    never re-REPLACEs the identity fields over answers written since.
 * Returns whether it wrote, so the callers' effects and the tests can read the decision.
 */
export function activateOpenedPlan(
  trip: TripIdentitySource | null | undefined,
  tripRole: string | null | undefined,
  penPrincipal: string | null,
): boolean {
  if (!trip || tripRole !== "owner" || penPrincipal === null) return false;
  if (getTripContext().tripId === trip.id) return false;
  syncActiveTripToContext(trip);
  return true;
}
