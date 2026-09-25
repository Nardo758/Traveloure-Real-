/**
 * REFRESH THE PLAN LISTS AFTER A PLAN IS BORN (ledger `2026-09-25-rc7-new-plan-visible`, audit
 * RC-7; decision-maker ruled Sep 25, 2026).
 *
 * THE DEFECT. The client's queries default to `staleTime: Infinity` (`queryClient.ts`), so a list
 * refetches only when something INVALIDATES it. Of the client doors that create a plan, only
 * IntakePanel (through `useCreateTrip`), the ready-made clone and the saved-trip conversion
 * invalidated `["/api/trips"]`. Every other door — the planning modal's finish and Save, the
 * concierge and experience-template lead doors, the cart's two conversions, the AI builder's save,
 * the AI generate, an EA's plan for a client, a guest trip claim — left an already-loaded
 * My Plans (and Home) saying the plan did not exist for the rest of the session. The audit proved
 * it in the browser (J1 R5 step 13): a pre-cached My Plans read "No plans yet" beside a plan the
 * traveler had just made.
 *
 * THE RULE, IN TWO HALVES (the decision-maker chose both):
 *   1. every client door that creates or claims a plan calls THIS one helper on success — one
 *      spelling of "the plan lists changed", never a key list re-typed at each door (§18 rule 1);
 *   2. the plan list itself re-fetches whenever a surface that reads it mounts
 *      (`useTrips`, `refetchOnMount: "always"`), which also catches plans born where no client
 *      door ran — the Plus occasion drafts the server schedules, or another tab.
 *
 * WHAT IT INVALIDATES, AND WHY EACH:
 *   · `["/api/trips"]` — My Plans, Home, the ticker, the city grid and the add-to-plan pickers.
 *     A prefix match, so it also reaches `["/api/trips", id]` (the modal's own trip read).
 *   · `["/api/me/upcoming"]` — Home's time axis (Locked Decision 45 (8)), which lists the new
 *     plan's start date as a dated row.
 * It does NOT touch a plan's own reads (`/api/trips/:id/plancard`, items, advisors): a plan that
 * did not exist a moment ago has no cached copy of those to be stale.
 *
 * Fire-and-forget by design: a refresh that fails must never make the mint that preceded it look
 * failed (§15b — an ancillary effect may not break the operation it follows).
 */
import type { QueryClient } from "@tanstack/react-query";

/** The query keys a newly created (or newly claimed) plan makes stale. Stated once. */
export const PLAN_LIST_QUERY_KEYS: readonly (readonly string[])[] = [
  ["/api/trips"],
  ["/api/me/upcoming"],
];

/**
 * Mark the plan lists stale so every mounted reader re-fetches. Takes the client explicitly so a
 * test (or a caller holding its own client) needs no module-level import; with none, the app's
 * shared client is loaded lazily — this module has no top-level import of it, so it stays
 * testable under `tsx --test`.
 */
export async function refreshPlanLists(client?: Pick<QueryClient, "invalidateQueries">): Promise<void> {
  try {
    const qc = client ?? (await import("@/lib/queryClient")).queryClient;
    for (const queryKey of PLAN_LIST_QUERY_KEYS) {
      void qc.invalidateQueries({ queryKey: [...queryKey] });
    }
  } catch {
    // Never fail the write that created the plan (see above).
  }
}
