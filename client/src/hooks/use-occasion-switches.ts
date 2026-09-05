/**
 * useOccasionSwitches — resolve the occasion ROW behind a trip, for the surfaces that only have
 * a trip id. Ledger `2026-09-03-switch-readers`; migration 276; CLAUDE.md Locked Decision 28.
 *
 * WHY THIS IS A LOOKUP AND NOT A FIELD. A trip stores `trips.event_type` (the 10-value
 * `eventTypeEnum` the fee/optimizer branches read), NOT the experience-type slug — two different
 * vocabularies, bridged by `eventTypeForSlug`, which is MANY-TO-ONE. The plancard DTO carries no
 * experience-type id either. So a slip cannot simply read the occasion off the trip; it has to
 * ask whether the event type identifies exactly one occasion, and accept that sometimes it does
 * not. `findOccasionByEventType` is where that refusal lives (`shared/occasions.ts`) — it returns
 * a row only on a UNIQUE match, never a nearest one (§13).
 *
 * ── EVENTS FIRST (ledger `2026-09-05-slip-switch-reads-events-first`; Locked Decision 42 D1) ──
 * The lookup above is correct and narrow: most of the seeded catalog shares an event type with
 * something else, so most occasions could not be recovered from a trip at all. There is an EXACT
 * answer one level down, and the plancard payload already ships it — an event inside the plan is a
 * `user_experiences` row (Locked Decision 29) whose `experience_type_id` names the occasion by ID.
 * So when a caller hands this hook the plan's events and they all name the SAME occasion, that id
 * IS the occasion, with no vocabulary bridge in between. Disagreement, a missing id, an unmatched
 * id or no events at all fall through to the event-type lookup, and both failing is still `null`
 * ⇒ the plain-trip shape, unchanged. The whole rule is ONE pure function,
 * `resolveOccasionForPlan` (§18 rule 1); this hook only supplies its inputs.
 *
 * KNOWN AND DELIBERATE: a caller that passes no events gets attempt 2 only, so two surfaces on the
 * same plan can hold different answers while the call sites are converted one lane at a time. That
 * is a widening in progress, not a second implementation — and it disappears entirely once `trips`
 * carries its own `experience_type_id`.
 *
 * Both queries are the ones these surfaces already run: `/api/experience-types` is the shared
 * occasion vocabulary key (edit panel, IntakePanel, Trip Strip), and `useTrip` is what
 * SlipLogisticsSection already mounts. A viewer who cannot read the trip (a non-owner without a
 * share token) simply gets no row, which lands on the same NOT-SET fallback as an ambiguous event
 * type: the plan is treated as SHOWN. That is the deliberate direction — an undecided or
 * unreadable occasion must not silently delete Share and Guests from a plan that wants them.
 */
import { useQuery } from "@tanstack/react-query";
import { useTrip } from "@/hooks/use-trips";
import {
  resolveOccasionForPlan,
  unanimousEventOccasionId,
  type PlanEventOccasionRef,
} from "@shared/occasions";
import { isHiddenOccasion, type OccasionSwitchRow } from "@/lib/occasion-switches";
import type { ExperienceType } from "@shared/schema";

export interface OccasionSwitchesForTrip {
  /** The occasion row, or `null` when the trip's event type does not identify exactly one. */
  occasion: (ExperienceType & OccasionSwitchRow) | null;
  /**
   * `default_visibility === "hidden"` — the proposal case: no Share link, no guest list, no
   * invite surface. `false` whenever the occasion is unresolved or the column is NULL (§13).
   */
  isHidden: boolean;
  /**
   * ── THE ONE "DO WE KNOW YET?" SIGNAL (QA check 3, post-publish walkthrough) ──────────────────
   *
   * `true` once BOTH lookups behind `occasion` have SETTLED — including settling on nothing. It
   * is the difference between the two absences this hook can return, which every §13 fallback
   * below it depends on and which the hook did not previously expose:
   *
   *   - **RESOLVED to nothing** — the trip has no event type, the event type is ambiguous
   *     (`findOccasionByEventType` refuses to guess), the trip is unreadable, or there is no
   *     `tripId` at all. That is a finished answer, and every reader's stated NOT-SET fallback is
   *     the right thing to render for it.
   *   - **NOT RESOLVED YET** — a request is in flight. `occasion` is `null` here too, and it is
   *     the SAME `null`, which is exactly why a caller reading only the row printed a fallback as
   *     though the row had answered. A wedding said "3 travelers" for a few seconds and a
   *     brand-new plan said "No items on this plan yet" while its event cards were still coming.
   *
   * It is computed HERE, once, from the hook's own two queries rather than re-derived per surface
   * (§18 rule 1) — a second copy would be one more place for the two facts to be conflated again.
   *
   * `isLoading` (not `isFetching`) is the right flag on purpose: a DISABLED query is not loading
   * (there is nothing to wait for), and a background refetch over cached data is not either — a
   * row we already have is resolved.
   *
   * STATED NEGATIVE SPACE: this says the lookups have finished, NOT that they succeeded, and NOT
   * that anything else on the surface has loaded. A failed fetch resolves to no row, deliberately.
   */
  isResolved: boolean;
}

export function useOccasionSwitches(
  tripId: string | undefined,
  /**
   * THE PLAN'S EVENTS, WHEN THE CALLER ALREADY HAS THEM (ledger
   * `2026-09-05-slip-switch-reads-events-first`). Optional on purpose: it is a HAND-DOWN of the
   * plancard payload's own `events` array, never a second fetch — a caller that does not hold one
   * simply gets attempt 2, i.e. exactly the behaviour this hook had before. Passing it can only
   * widen what resolves; it can never turn a resolved occasion into `null`.
   */
  events?: readonly PlanEventOccasionRef[] | null,
): OccasionSwitchesForTrip {
  const { data: trip, isLoading: tripLoading } = useTrip(tripId || "");
  const eventType = trip?.eventType ?? null;
  // The list is worth fetching as soon as EITHER attempt could use it. Before events-first that
  // was an event type alone; a plan whose events name an occasion needs the rows too, and gating
  // on `eventType` would have kept attempt 1 from ever having a list to look in.
  const hasEventOccasionId = !!unanimousEventOccasionId(events);
  const { data: occasions, isLoading: occasionsLoading } = useQuery<ExperienceType[]>({
    queryKey: ["/api/experience-types"],
    enabled: !!tripId && (!!eventType || hasEventOccasionId),
  });
  const occasion = resolveOccasionForPlan({ events, eventType, occasions });
  return {
    occasion: occasion ?? null,
    isHidden: isHiddenOccasion(occasion),
    isResolved: !tripLoading && !occasionsLoading,
  };
}
