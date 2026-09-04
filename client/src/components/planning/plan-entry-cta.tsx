/**
 * PLAN ENTRY — the ONE way a browse surface starts a plan.
 * Ledger `2026-09-04-entry-unification`.
 *
 * WHAT WAS WRONG. `usePlanning().open(source)` (contexts/PlanningContext.tsx) has been the unified
 * opener since it was written, and ten marketing/trip surfaces use it — landing, moments-section,
 * CityTickerTape, how-it-works, about, features, pricing, dashboard, trip-details, itinerary-view.
 * The COMMERCE surfaces used none of it: `/destinations`, `/ready-made`, `/events`, `/services`
 * (all four are `pages/discover.tsx`), `/experiences` and `/experts` carried only supply-side CTAs
 * — "become a provider", "earn", "browse more". A traveler standing on any of them had no way to
 * start a plan at all.
 *
 * Two of those pages imported `planningRouteForTrip` from PlanningContext, which is a ROUTE HELPER
 * for an EXISTING trip and not the opener. That import is why the surfaces read as wired when they
 * were not; it is the specific confusion this component and its guard exist to prevent.
 *
 * WHY A COMPONENT RATHER THAN A BUTTON PER PAGE. Six routes need the same entry. Six copies of
 * "open the planner" is the derivation-drift class §18 rule 1 names: the label drifts, one copy
 * forgets the source, and a later change lands on three of six. ONE implementation, N call sites —
 * the same shape `eventsForTrip` and `resolveItemEventLink` use. `scripts/check-planning-entry.cjs`
 * holds the call sites to that list at CI.
 *
 * THE SOURCE IS WHAT THE PAGE HOLDS, NEVER A GUESS (§13). `PlanningSource` is optional in every
 * field. A surface passes the city/destination it actually has, and passes NOTHING when it has
 * none — it must never invent a destination to make the modal look better informed. Watch for
 * sentinel values in particular: `experts.tsx` uses the string "All Destinations" to mean NO
 * filter, and passing that through as a destination would be the same class of bug as
 * `provider_services.location` defaulting to "Unknown" (ledger `2026-09-04-location-mismatch`).
 * Callers resolve sentinels to `undefined` BEFORE handing a source here.
 */
import { Button } from "@/components/ui/button";
import { usePlanning, type PlanningSource } from "@/contexts/PlanningContext";
import { START_PLAN_LABEL } from "@/lib/plan-vocabulary";
import { cn } from "@/lib/utils";

export interface PlanEntryCtaProps {
  /**
   * Context this surface actually holds. Omit the whole prop, or any field, when the surface has
   * nothing true to say — an absent field is how the modal is told "not known", and it must never
   * be filled with a placeholder.
   */
  source?: PlanningSource;
  /** Extra classes for the surface's own layout. Never used to change the label. */
  className?: string;
  /** Visual weight. The masthead entry is `default`; an inline/secondary placement uses `outline`. */
  variant?: "default" | "outline";
  /**
   * Test id. Defaults to the shared id so a surface is findable generically; a caller may narrow it
   * (e.g. `plan-entry-experts`) without changing the label or the behaviour.
   */
  testId?: string;
}

export function PlanEntryCta({
  source,
  className,
  variant = "default",
  testId = "button-plan-entry",
}: PlanEntryCtaProps) {
  const planning = usePlanning();
  return (
    <Button
      type="button"
      variant={variant}
      className={cn("font-medium", className)}
      onClick={() => planning.open(source)}
      data-testid={testId}
    >
      {START_PLAN_LABEL}
    </Button>
  );
}

export default PlanEntryCta;
