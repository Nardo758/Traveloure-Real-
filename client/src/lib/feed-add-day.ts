/**
 * QA round 3 PR 5 (Leon, Nov 12, 2026: "pass the known day to the label … on a day-filtered feed with confirmed
 * dates"): the day a day-filtered feed card's add will land on, so its button reads "Add to Day {n}" (`addLabel`,
 * `lib/add-to-plan.ts`) instead of "Add to plan".
 *
 * The day is KNOWN only when the plan the add writes to is known, its dates were chosen (LD 30 — a placeholder window
 * is not a range), and the card's day falls inside it. That is the guest rail's own rule (`guestChosenDay`, the one the
 * guest save applies — `saveToGuestPlan`), read here rather than restated (§18 rule 1). Anything else claims no day:
 *   - no `scheduledDate` (the feed is not day-filtered);
 *   - unconfirmed dates (the first-add calendar asks first, and the press's day is placed only inside the chosen range);
 *   - a day outside the window (the item lands on Day 1, so "Day {n}" would be untrue);
 *   - a signed-in traveler with no `?tripId=` plan: the add opens the plan picker (R4b-2, never auto-selected), so the
 *     plan — and its day — is not known until they choose.
 */
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { resolveTargetTripId } from "./trip-target";
import { GUEST_PLAN_QUERY_KEY, guestChosenDay, type GuestPlanView } from "./waitlist-guest-plan";

export interface FeedAddPlanWindow {
  startDate: string | null | undefined;
  endDate: string | null | undefined;
  datesConfirmed: boolean;
}

/** Pure: the card's day on the plan the add writes to, or null (no day is claimed). */
export function feedAddDay(scheduledDate: string | null | undefined, plan: FeedAddPlanWindow | null | undefined): number | null {
  if (typeof scheduledDate !== "string" || !scheduledDate) return null;
  if (!plan || !plan.datesConfirmed || !plan.startDate || !plan.endDate) return null;
  return guestChosenDay(scheduledDate, plan.startDate, plan.endDate);
}

type TripWindowRow = { id: string; startDate?: string | null; endDate?: string | null; datesConfirmedAt?: string | null };

/** The plan an add from this page writes to, as a window — from what is already cached; it fetches nothing. */
export function useFeedAddDay(scheduledDate: string | null | undefined): number | null {
  const { user, isLoading } = useAuth();
  const search = useSearch();
  // The add's own target rule (`resolveAddPlanTarget`): only `?tripId=` is direct; no list is mounted here (each card
  // would otherwise mount the plan list's refetching reader).
  const directTripId = resolveTargetTripId(search);
  // Cache reads only (`enabled: false`): the guest plan and the trip list are fetched by their own owners.
  const guest = useQuery<GuestPlanView | null>({ queryKey: GUEST_PLAN_QUERY_KEY, enabled: false });
  const trips = useQuery<TripWindowRow[]>({ queryKey: ["/api/trips"], enabled: false });
  if (isLoading || !scheduledDate) return null;
  if (!user) {
    const p = guest.data?.plan;
    return p ? feedAddDay(scheduledDate, { startDate: p.startDate, endDate: p.endDate, datesConfirmed: !!p.datesConfirmed }) : null;
  }
  if (!directTripId) return null;
  const t = Array.isArray(trips.data) ? trips.data.find((row) => row.id === directTripId) : undefined;
  return t ? feedAddDay(scheduledDate, { startDate: t.startDate, endDate: t.endDate, datesConfirmed: !!t.datesConfirmedAt }) : null;
}
