/**
 * "ORGANIZE INTO EVENTS" — the eligibility predicate for the slip's one-time offer.
 * Ledger `2026-09-04-plan-islands`; CLAUDE.md Locked Decisions 28 (`default_schedule`) and 29
 * (an event inside a plan IS a `user_experiences` row).
 *
 * ── THE HOLE THIS FILLS ─────────────────────────────────────────────────────────────────────
 * The five-step plan modal asks "What's happening" (step 5) and creates one `user_experiences`
 * row per ticked chip. A READY-MADE buyer never walks that modal: the clone lands on the slip
 * with items and ZERO events, so an occasion whose whole shape is an internal schedule renders
 * as a flat day list with no way back to the question. The machinery to answer it — the server's
 * own preset chips, the step-5 reducer, the owner-scoped create rail — all exists and is simply
 * not reachable from the plan's own page.
 *
 * ── THE PREDICATE, AND WHY EACH HALF IS THERE ───────────────────────────────────────────────
 * BOTH conditions must hold:
 *
 *   1. `showsSchedule(occasion)` — the occasion's OWN `default_schedule` (migration 276), read
 *      through the ONE switch reader. NULL/absent ⇒ false ⇒ no offer, which is the plain-plan
 *      shape: a trip has no internal schedule and offering to build one for it would put words
 *      in a row nobody decided on (§13). An UNRESOLVED occasion is the same answer for the same
 *      reason — `useOccasionSwitches` returns a row only on a unique event-type match.
 *
 *   2. `eventCount === 0` — the plan holds no events yet. This is what makes the action ONE-TIME
 *      rather than a standing "add an event" button: the moment a plan has an event, the offer
 *      disappears and per-event editing is the surface that owns them. It also makes the action
 *      safe to press twice — after the first save the predicate is false.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────────────────────
 * It never auto-creates. Eligibility renders an OFFER; a traveler ticks chips and presses a
 * button. Nothing on the plan mints an event as a side effect of being looked at, because an
 * event carries a day, a place and (Locked Decision 35) a time, and a row the platform invented
 * would wear the traveler's authority for answers they never gave.
 *
 * It also does not read the trip's ORIGIN. "A ready-made buyer's clone" is the motivating case,
 * not the condition: any plan on a scheduled occasion with no events is in the same state and
 * gets the same offer. Keying on provenance would make the offer depend on a fact the surface
 * cannot honestly observe.
 *
 * Pure: no React, no fetch. Tested by `client/src/lib/__tests__/plan-islands.test.ts`.
 */
import { showsSchedule, type OccasionSwitchRow } from "./occasion-switches";
import { hasEventRow, type PlanEventDraft } from "./plan-events";

/**
 * May the slip offer "Organize into events"?
 *
 * @param occasion  the resolved `experience_types` row, or null when the trip's event type does
 *                  not identify exactly one (⇒ no offer).
 * @param eventCount how many `user_experiences` rows this plan already holds. A negative or
 *                  non-finite count is treated as "unknown" and yields NO offer — the safe
 *                  direction, since offering to organize a plan whose events we could not count
 *                  risks a duplicate set.
 */
export function canOrganizeIntoEvents(
  occasion: OccasionSwitchRow | null | undefined,
  eventCount: number,
): boolean {
  if (!Number.isFinite(eventCount) || eventCount !== 0) return false;
  return showsSchedule(occasion);
}

/**
 * IDEMPOTENT BY TITLE — the same rule the pre-trip pen drain uses
 * (`server/services/pending-events.service.ts` skips a title that already has an event on the
 * trip), stated here for the client rail so the two doors agree.
 *
 * The eligibility gate already means the list starts empty, so this is not what makes the FIRST
 * save correct; it is what makes a double-click, a retried save, or a save racing a refetch
 * create nothing extra. Case-insensitive, because that is what `normalizePlanEvents` collapses
 * duplicates on.
 */
export function eventsNotYetCreated(
  drafts: readonly PlanEventDraft[],
  existingTitles: readonly (string | null | undefined)[],
): PlanEventDraft[] {
  const existing: PlanEventDraft[] = existingTitles
    .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    .map((t) => ({ title: t.trim() }));
  return drafts.filter((d) => !hasEventRow(existing, d.title));
}
