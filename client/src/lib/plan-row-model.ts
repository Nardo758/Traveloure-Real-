import { parseTripDate } from "@/lib/calendar-date";

/**
 * plan-row-model — L3 my-plans-rows (Console & AI Concierge brief; ledger
 * `2026-09-07-my-plans-rows`). ONE pure builder for the My plans row: which section the plan
 * belongs to, the routing-status counts off the SAME plancard DTO the slip strip reads, the
 * derived next action, and the advisor gate for the row's Message button. Pure so the derivations
 * are pinned by `client/src/lib/__tests__/plan-row-model.test.ts` instead of by looking right on
 * one screen (§18d).
 *
 * §13 honest-or-absent, everywhere below: an unparseable date falls in NO date bucket; a count
 * only ever comes from a real itinerary item; a next action exists only when a real item is
 * actionable; the advisor facts come from the owner-gated `/api/trips/:id/expert-advisor` read or
 * they are absent.
 */

export type PlanRowRoutingStatus = "in_planning" | "with_expert" | "ready_for_checkout" | "purchased";

export interface PlanRowCounts {
  in_planning: number;
  with_expert: number;
  ready_for_checkout: number;
  purchased: number;
}

/** Structural minimum of the plancard DTO the counts derive from (SlipData.days[].activities[]). */
export interface PlancardLike {
  days?: Array<{
    activities?: Array<{ booking?: unknown; routingStatus?: string | null }> | null;
  }> | null;
}

/** The owner-gated advisor read (`GET /api/trips/:id/expert-advisor`), narrowed to what a row needs. */
export interface PlanRowAdvisorLike {
  status?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

export type PlanRowSection = "traveling" | "final" | "planning" | "past";

export interface PlanRowModel {
  section: PlanRowSection;
  counts: PlanRowCounts;
  nextAction: { status: PlanRowRoutingStatus; n: number } | null;
  hasAdvisor: boolean;
  advisorPending: boolean;
  advisorName: string | null;
  hasFinal: boolean;
  /** Post-final the plan is frozen and has a Trip Card; pre-final it lives on the slip. */
  primaryHref: string;
}

const ROUTING_STATUSES: PlanRowRoutingStatus[] = [
  "in_planning",
  "with_expert",
  "ready_for_checkout",
  "purchased",
];

/**
 * The SAME count derivation PlanSlipStrip renders, named and shared so the strip and the row can
 * never drift: an item with a booking (or the legacy explicit purchased status) is purchased;
 * every other counted item is counted by its routing status; an unknown status counts as nothing.
 */
export function routingCountsFromPlancard(data: PlancardLike | null | undefined): PlanRowCounts {
  const counts: PlanRowCounts = { in_planning: 0, with_expert: 0, ready_for_checkout: 0, purchased: 0 };
  for (const day of data?.days ?? []) {
    for (const a of day.activities ?? []) {
      if (a.booking || a.routingStatus === "purchased") counts.purchased++;
      else if (
        a.routingStatus != null &&
        (ROUTING_STATUSES as string[]).includes(a.routingStatus)
      ) {
        counts[a.routingStatus as PlanRowRoutingStatus]++;
      }
    }
  }
  return counts;
}

/**
 * The row's next action is the most-advanced FUNNEL stage with real items in it — checkout before
 * expert before planning (an item ready for checkout is acted on now; an item in planning is just
 * there). Purchased items are done, so a plan with only purchased items has NO next action.
 */
export function nextActionFromCounts(
  counts: PlanRowCounts,
): { status: PlanRowRoutingStatus; n: number } | null {
  if (counts.ready_for_checkout > 0) return { status: "ready_for_checkout", n: counts.ready_for_checkout };
  if (counts.with_expert > 0) return { status: "with_expert", n: counts.with_expert };
  if (counts.in_planning > 0) return { status: "in_planning", n: counts.in_planning };
  return null;
}

/**
 * The section a plan belongs to on My plans — Traveling now · Final · In planning · Past, each
 * plan in EXACTLY ONE. Dates win over paperwork: a finalized plan you are ON is Traveling now; a
 * finalized plan still ahead is Final; a finalized plan behind you is Past. `trips.status` is a
 * documented-dead field (CLAUDE.md §13, Lane 3 Option B) and is never read.
 *
 * An UNDATED, non-final plan is "planning" — not a guess: a plan with no dates has not been
 * scheduled, and "in planning" is the state before dates exist. (The old inline bucketing handed
 * null dates to `new Date(null)` — EPOCH 1970 — so an undated plan silently sorted into "Past"
 * and rendered "Jan 1, 1970" on its row. §13: the row renders no date line when no date parses;
 * the plan itself is never vanished from the list.)
 */
export function planRowSection(
  trip: { startDate?: string | null; endDate?: string | null; finalVersion?: number | null },
  now: Date,
): PlanRowSection {
  // The NULL form, deliberately: parseTripDateOrInvalid falls back to `new Date(null)` — EPOCH
  // 1970 — for an absent date, which would sort every undated plan into "past" (the old page's
  // exact behaviour). Absent must read as absent (§13).
  const start = parseTripDate(trip.startDate);
  const end = parseTripDate(trip.endDate);
  if (end && end < now) return "past";
  if (start && end && start <= now && now <= end) return "traveling";
  if (trip.finalVersion != null) return "final";
  return "planning";
}

/** The whole row model from its three real inputs. */
export function buildPlanRowModel(
  trip: {
    id: string;
    startDate?: string | null;
    endDate?: string | null;
    finalVersion?: number | null;
  },
  plancard: PlancardLike | null | undefined,
  advisor: PlanRowAdvisorLike | null | undefined,
  now: Date,
): PlanRowModel {
  const counts = routingCountsFromPlancard(plancard);
  const hasFinal = trip.finalVersion != null;
  const advisorName =
    advisor != null
      ? `${advisor.first_name ?? ""} ${advisor.last_name ?? ""}`.trim() || null
      : null;
  return {
    section: planRowSection(trip, now),
    counts,
    nextAction: nextActionFromCounts(counts),
    // The endpoint returns a row only for pending|accepted — presence IS the advisor fact; the
    // pending half is spelled out so a row can say "requested" rather than imply a reply.
    hasAdvisor: advisor != null,
    advisorPending: advisor?.status === "pending",
    advisorName,
    hasFinal,
    primaryHref: hasFinal ? `/trip/${trip.id}` : `/plans/${trip.id}`,
  };
}
