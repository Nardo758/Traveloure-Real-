/**
 * E2 — the ONE action block a content detail page draws (event, ready-made; experiences arrive in E3).
 *
 * The rule (Leon, Nov 13; `action-engine.md` §3, `planActionsPrimary` as the fallback until
 * `resolveActions` exists):
 *
 *   already on the plan      → "On Day {n}" + "Back to plan"   (never a second Add)
 *   dated plan, bookable     → Book primary, Add secondary      (open mode, signed in only)
 *   dated plan               → Add primary, "Plan around it" secondary
 *   no plan                  → "Plan around it" primary         (unchanged behaviour)
 *
 * **No priced control on the guest or waitlist path** — Book is suppressed unless
 * `mode === "open" && signedIn`. The `bookable` flag cannot re-enable it.
 *
 * Strings: "On Day {n}" and "Back to plan" are the constants in `lib/plan-stop-links.ts` (approved by
 * page's existing label. **This file adds no new user-facing string.**
 *
 * The VIEW is pure props so it can be rendered with `renderToString`; the hook next to it does the
 * live reads the pages need.
import * as React from "react";
 */
import { useActivePlan } from "@/hooks/use-active-plan";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AddToPlanButton } from "@/components/plan/AddToPlanButton";
import { PENDING_LL1_STRINGS } from "@/lib/plan-stop-links";
import { guestRefEntry, useSavedRefEntry } from "@/lib/saved-refs";
import { GUEST_PLAN_QUERY_KEY, type GuestPlanView } from "@/lib/waitlist-guest-plan";

export interface DetailPlanRef {
  tripId: string;
  /** The plan's dates were chosen (LD 30) — a placeholder window is not a range. */
  datesConfirmed: boolean;
}

export interface DetailPlanActionsProps {
  /** testid root, e.g. "event-detail" / "ready-made-detail". */
  page: string;
  /** The dated plan for this city, or null. */
  plan: DetailPlanRef | null;
  /** The day this item ALREADY sits on, read from live itinerary items. Null ⇒ not on the plan. */
  alreadyOnDay: number | null;
  mode: "waitlist" | "open";
  signedIn: boolean;
  /** Ready-made only: a bookable product draws Book first, with Add beside it. */
  bookable?: boolean;
  addPending?: boolean;
  onAdd?: () => void;
  onBook?: () => void;
  onPlanAround?: () => void;
  /** Where "Plan around…" goes when used as a LINK (no-plan primary). */
  planAroundHref: string;
}

/**
 * Pure. Same-day plans are dated plans; a plan without chosen dates cannot carry a day, so it is
 * treated as "no plan" for the add (the first-add calendar is the panel's job, not this block's).
 */
export function detailPlanIsUsable(plan: DetailPlanRef | null | undefined): plan is DetailPlanRef {
  return !!plan && plan.datesConfirmed === true;
}

/** Pure: may a priced control draw at all? Guests and waitlist mode never, whatever the item is. */
export function detailBookAllowed(input: { mode: "waitlist" | "open"; signedIn: boolean; bookable?: boolean }): boolean {
  return input.bookable === true && input.mode === "open" && input.signedIn === true;
}

export function DetailPlanActions(props: DetailPlanActionsProps) {
  const { page, plan, alreadyOnDay, mode, signedIn, bookable, addPending, onAdd, onBook, onPlanAround, planAroundHref } = props;
  const usable = detailPlanIsUsable(plan);

  // 1. Already on the plan: say which day, and offer the way back. No second Add.
  if (usable && alreadyOnDay != null) {
    return (
      <div className="flex flex-wrap items-center gap-2" data-testid={`${page}-plan-state`}>
        <span className="text-sm font-semibold" data-testid={`${page}-on-day`}>
          {PENDING_LL1_STRINGS.onDay(alreadyOnDay)}
        </span>
        <Link
          href={`/plans/${encodeURIComponent(plan.tripId)}`}
          className="text-sm underline underline-offset-2"
          data-testid={`${page}-back-to-plan`}
        >
          {PENDING_LL1_STRINGS.backToPlan}
        </Link>
      </div>
    );
  }

  // 2. A dated plan exists: Add is primary (Book first when the item is a bookable product).
  if (usable) {
    const bookShown = detailBookAllowed({ mode, signedIn, bookable });
    return (
      <div className="flex flex-wrap items-center gap-2" data-testid={`${page}-plan-actions`}>
        {bookShown ? (
          <button type="button" onClick={onBook} className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground" data-testid={`${page}-book`}>
            Book
          </button>
        ) : null}
        <AddToPlanButton
          testId={`${page}-add`}
          dayNumber={null}
          onClick={onAdd}
          pending={addPending}
          added={false}
        />
        <button
          type="button"
          onClick={onPlanAround}
          className="text-sm underline underline-offset-2"
          data-testid={`${page}-plan-around-secondary`}
        >
          Plan around it
        </button>
      </div>
    );
  }

  // 3. No plan: today's behaviour exactly — "Plan around it" is the primary, nothing else draws.
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={`${page}-plan-actions`}>
      <Link
        href={planAroundHref}
        onClick={onPlanAround}
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
        data-testid={`${page}-plan-around`}
      >
        Plan around it
      </Link>
      <span className="text-xs text-muted-foreground" data-testid={`${page}-add-needs-plan`}>
      </span>
    </div>
  );
}

/** The trip window rows the header already caches; only the fields this block reads are named. */
type TripWindowRow = { id: string; destination?: string | null; startDate?: string | null; endDate?: string | null; datesConfirmedAt?: string | null };

/** Loose city compare: "Kyoto" and "Kyoto, Japan" are the same plan city (RC-6's rule, locally). */
function sameCity(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (v: string | null | undefined) => String(v ?? "").toLowerCase().split(",")[0].trim();
  return norm(a) !== "" && norm(a) === norm(b);
}

/**
 * LIVE state for a detail page: the DATED plan for this city, read from the same `/api/trips` cache the
 * Trip Strip uses. The key is already invalidated by the add rail (`plan-add-runner.ts:208-210`), so a
 * successful add refreshes this block with no reload.
 *
 * WHY THERE IS NO `alreadyOnDay` HERE - the "On Day {n}" case is blocked at the DATA layer, not in this
 * component. `itinerary_items` persists no content-source column (`shared/schema.ts:6137-6192` carries
 * only `providerServiceId`, `affiliateProductId` and `dmoExtractedPlaceId`), so an EVENT added to a plan
 * cannot be matched back to its `city_events.source_id` from a live row. A READY-MADE is not an
 * itinerary item at all: buying it clones a new trip. Matching on title would be a guess (two events can
 * share a title, and titles are editable), and the only honest alternatives are a schema column or a
 * server read - both out of E2's scope. The VIEW still accepts `alreadyOnDay` so the case draws the
 * moment a real key exists; today every caller passes null.
 *
 * @param city  the page's city (event: `city`; ready-made: `market`)
 */
export function useDetailPlanState(city: string | null | undefined, itemKey: string | null | undefined): {
  plan: DetailPlanRef | null;
  alreadyOnDay: number | null;
} {
  // E2: the plan the traveler is ON, never a lookup by city. useActivePlan (#1984) is the one
  // precedence: the URL tripId, then the bound plan, then the most recently updated.
  const { active, signedIn, loading } = useActivePlan();
  const usable =
    !loading && active && active.datesConfirmedAt && sameCity(active.destination ?? null, city)
      ? ({ tripId: active.id, datesConfirmed: true } as DetailPlanRef)
      : null;
  const saved = useSavedRefEntry(itemKey);
  const guest = useQuery<GuestPlanView | null>({ queryKey: GUEST_PLAN_QUERY_KEY, enabled: false });
  // The saved-refs entry counts ONLY when it belongs to this plan - hence the planId compare, and
  // hence the server answering one entry per (key, plan) instead of one per key.
  const onThisPlan = usable && saved && saved.planId === usable.tripId ? saved : null;
  const guestEntry = !signedIn && !usable ? guestRefEntry(guest.data, itemKey) : null;
  const day = onThisPlan?.dayNumber ?? guestEntry?.dayNumber ?? null;
  return { plan: usable, alreadyOnDay: typeof day === "number" ? day : null };
}
