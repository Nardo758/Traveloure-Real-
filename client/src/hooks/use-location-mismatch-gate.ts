/**
 * LOCATION MISMATCH GATE — ONE reader, one confirm point, called from every traveler add rail.
 * Ledger `2026-09-04-location-mismatch`, extended by `2026-09-04-plan-stops-ui` (the plan's stops
 * are compared, and the third action writes one).
 *
 * The decision lives in `client/src/lib/location-mismatch.ts`; this hook supplies it with the
 * facts the surface cannot see on its own, and holds the pending add while the traveler answers.
 * There are two live traveler rails that put a `provider_services` listing on a plan — the
 * `/services` grid (`client/src/pages/discover.tsx`) and the listing page
 * (`client/src/pages/service-detail.tsx`) — so the check is written ONCE here and called from
 * both. A second copy of the same decision at the second call site is exactly the derivation-drift
 * class CLAUDE.md §18 rule 1 names.
 *
 * NO NEW SERVER ROUTE, NO NEW DTO FIELD. Every fact is already on the wire:
 *   - the listing's location — the surfaces already read `service.location` (they filter the
 *     `"Unknown"` sentinel out of `locationName` before posting);
 *   - the plan's destination AND its ordered stops — `GET /api/trips/:id` returns the trip row
 *     with `destinations: [...]` (lane A's read exposure, migration 281). The stop write is lane
 *     A's own `PUT /api/trips/:tripId/destinations`, reached through the ONE client writer
 *     `client/src/lib/plan-stops-writer.ts` that the plan modal's step 2 also uses.
 *
 * WHY THE PLAN'S DESTINATION COMES FROM THE TRIP ROW AND NOT FROM `TripContext`. The target trip is
 * resolved "URL first, then the active TripContext" (`client/src/lib/trip-target.ts`), so a
 * `?tripId=` handoff can name a DIFFERENT trip than the one the context's `destination` describes
 * (the #972 desync shape the context itself warns about). Comparing a listing against another
 * trip's destination would manufacture a false alert — the one failure this surface must never
 * have. The trip row is the only non-guessing source.
 *
 * SILENCE IS THE FAILURE MODE, ALWAYS. No target trip, a guest 401, the trips query still loading,
 * a trip we cannot find, a listing with no location, a destination that agrees — every one of them
 * runs the add with no dialog (§13). The gate can only ever ADD a confirm; it can never swallow one.
 */
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  evaluateLocationMismatch,
  type MismatchAlert,
  type RawLocation,
} from "@/lib/location-mismatch";
import { appendStopNamed, seedStops, stopSequence } from "@/lib/plan-stops";
import { savePlanStops } from "@/lib/plan-stops-writer";

/**
 * The slice of `GET /api/trips/:id` this gate reads. Nothing else is touched.
 *
 * WHY THE DETAIL ROUTE AND NOT THE LIST (changed by ledger `2026-09-04-plan-stops-ui`). The
 * original gate read `GET /api/trips` because the one fact it needed — `trips.destination` — was
 * on that payload. The check now compares against EVERY city the plan names, and the ordered
 * `trip_destinations` rows are exposed on the DETAIL route only (lane A's read exposure). The
 * ruling that mattered is unchanged and still honoured: the comparison comes from the TRIP ROW,
 * never from `TripContext`, because a `?tripId=` handoff can name a different trip than the
 * context describes (the #972 desync shape) and comparing against another trip's destination is
 * the one false alert this surface must never raise.
 */
interface GateTripRow {
  id: string;
  destination?: string | null;
  /** Ordered stops. ABSENT/EMPTY = NOT CAPTURED ⇒ the comparison falls back to `destination`. */
  destinations?: Array<{
    name?: string | null;
    city?: string | null;
    country?: string | null;
    lat?: string | number | null;
    lng?: string | number | null;
  }> | null;
}

/** What the calling surface knows about the listing being added. */
export interface MismatchListing {
  /** `provider_services.location` exactly as the row carries it — sentinel filtering is the reader's job. */
  location: RawLocation;
  /** The listing's name, echoed in the dialog. */
  name: string;
  /** A category/price line the surface ALREADY renders, or null when it has none. */
  meta?: string | null;
}

interface PendingAdd {
  alert: MismatchAlert;
  listing: MismatchListing;
  run: () => void;
}

export interface LocationMismatchGate {
  /**
   * Wrap the ONE point where an add is confirmed. Runs `add()` immediately unless the listing is
   * not in a city the plan names, in which case the dialog is raised and `add()` runs only if the
   * traveler chooses "Add anyway".
   */
  guardAdd: (listing: MismatchListing, add: () => void) => void;
  /** The alert to render, or null when nothing is pending. */
  alert: MismatchAlert | null;
  /** The listing behind the pending alert, for the dialog's echo row. */
  listing: MismatchListing | null;
  /** "Add anyway" — runs the held add. Persists nothing. */
  confirm: () => void;
  /**
   * "Add <city> as a stop" — the ratified Mismatch artboard's third action, buildable since
   * `trip_destinations` landed (ledger `2026-09-04-plan-stops-ui`). Appends the LISTING'S OWN city
   * to the plan's ordered stops through the one writer, then runs the held add: the traveler has
   * answered the objection, so the item they asked for still goes on the plan.
   *
   * `null` when the action cannot be offered — see `addAsStop` below for the two cases and why
   * each is an omission rather than a disabled button.
   */
  addAsStop: (() => void) | null;
  /** "Cancel" / dismiss — drops the held add. Persists nothing. */
  cancel: () => void;
}

export function useLocationMismatchGate(targetTripId: string | null | undefined): LocationMismatchGate {
  const tripId = typeof targetTripId === "string" ? targetTripId.trim() : "";

  const queryClient = useQueryClient();

  // The plan row itself. A 401 (guest), a 403 (not theirs), a 404 or a network failure leaves
  // `data` undefined ⇒ silence, which is this gate's failure mode in every direction.
  const { data: trip } = useQuery<GateTripRow>({
    queryKey: ["/api/trips", tripId],
    enabled: tripId !== "",
  });

  const planDestination = useMemo<RawLocation>(() => trip?.destination ?? null, [trip]);

  /**
   * Every city the plan names, in order — the stop NAMES only, which is all the comparison reads.
   * An absent or empty list is NOT CAPTURED, and the reader falls back to `planDestination` and
   * says so (§13, Locked Decision 34).
   */
  const planStops = useMemo<RawLocation[]>(
    () => (Array.isArray(trip?.destinations) ? trip!.destinations!.map((d) => d?.name ?? null) : []),
    [trip],
  );

  const [pending, setPending] = useState<PendingAdd | null>(null);

  const guardAdd = useCallback(
    (listing: MismatchListing, add: () => void) => {
      const decision = evaluateLocationMismatch({
        listingLocation: listing.location,
        // EVENT BRANCH, DELIBERATELY NOT SUPPLIED HERE. The ratified order is "the named event the
        // item is being added under, then the plan" — but neither live rail binds an event: both
        // POST /api/trips/:tripId/itinerary-items WITHOUT `userExperienceId`, so the item lands on
        // the plan's ONE implicit unnamed event (CLAUDE.md Locked Decision 29). Passing the
        // TripContext's active `userExperienceId` here would compare against an event the item is
        // not being added under — a guess wearing a row's authority (§13). The reader implements
        // and tests the branch; the first rail that actually links an item to an event passes its
        // `user_experiences.location` in.
        eventLocation: undefined,
        planDestination,
        // EVERY stop the plan names (ledger `2026-09-04-plan-stops-ui`). The count is NOT a
        // suppression: a plan with three stops is still told about a listing in a fourth city.
        planStops,
      });
      if (!decision.mismatch) {
        add();
        return;
      }
      setPending({ alert: decision, listing, run: add });
    },
    [planDestination, planStops],
  );

  // The held add runs OUTSIDE the state updater: a React updater can be invoked more than once
  // (StrictMode), and running the add from inside one would double-post the item.
  const confirm = useCallback(() => {
    const run = pending?.run;
    setPending(null);
    run?.();
  }, [pending]);

  /**
   * "Add <city> as a stop" — the third action, and the only one on this surface that WRITES.
   *
   * REPLACE-LIST, SO THE CURRENT LIST IS READ FIRST. `PUT /api/trips/:tripId/destinations` deletes
   * whatever it is not sent, so the new stop is appended to the list this gate already holds
   * (`seedStops` falling back to `trips.destination` when the plan has no rows yet — the §13
   * fallback, stated once in the reducer). Sending only the new city would delete the plan's own
   * destination, which is why the append happens through the shared reducer and not inline here.
   *
   * OFFERED ONLY WHEN IT CAN ACTUALLY WRITE — and OMITTED, never disabled, otherwise (the same
   * posture that kept it out of the dialog entirely until the table existed):
   *   · no plan row, or the plan could not be read: this gate is only ever mounted with a target
   *     trip, and a plan we could not read is one whose stop list we would be overwriting blind;
   *   · the listing's city is one the plan already names: unreachable in practice (that case is a
   *     `match` and raises no alert at all), guarded because a no-op button is a lie.
   *
   * The write is awaited before the held add runs, so the item lands on a plan that already names
   * its city; a FAILED write still runs the add rather than stranding the traveler — the stop was
   * the courtesy, the add is what they asked for (§15b's posture: an ancillary effect may not
   * break the operation that authorized it).
   */
  const addAsStop = useMemo<(() => void) | null>(() => {
    if (!pending || tripId === "" || !trip) return null;
    const city = pending.alert.listingCity;
    if (city.trim() === "") return null;
    const current = seedStops(trip.destination, trip.destinations);
    const next = appendStopNamed(current, city);
    // `appendStopNamed` is idempotent by city; an unchanged sequence means there is nothing to add.
    if (stopSequence(next) === stopSequence(current)) return null;
    return () => {
      const run = pending.run;
      setPending(null);
      void savePlanStops(tripId, next)
        .then((result) => {
          if (result.ok) {
            // The plan's stops (and its mirrored destination) changed — let every reader of the
            // row re-read rather than hold a list this action just invalidated.
            void queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId] });
            void queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
          } else if (result.reason === "request_failed") {
            // eslint-disable-next-line no-console
            console.warn("[location-mismatch] stop not saved:", result.message);
          }
        })
        .finally(() => run());
    };
  }, [pending, tripId, trip, queryClient]);

  const cancel = useCallback(() => setPending(null), []);

  return {
    guardAdd,
    addAsStop,
    alert: pending?.alert ?? null,
    listing: pending?.listing ?? null,
    confirm,
    cancel,
  };
}
