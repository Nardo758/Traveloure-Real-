/**
 * FD-1 — THE FREE-DRAFT CAP, pure rules (decision-maker rulings, Oct 9, 2026; ledger
 * `2026-10-09-fd1-free-draft-cap`; brief `docs/planning/briefs/fd-1-free-draft-cap.md`).
 *
 * Stated ONCE (§18 rule 1). No db: the `free_draft_runs` table (migration 363) is HELD for the founder,
 * and the claim that reads these rules lands with it.
 *
 *   · A free draft is one of the two free rails or quick-start (ruling 5 of FD-2), on a plan that is NOT
 *     paid tier. A plan that gets routed legs (`planGetsRoutedLegs` — Optimize, Trip Pass, an accepted
 *     handoff, Ready Made) is paid tier, so a draft there is not a free draft at all (FD-1 ruling 5).
 *   · The count belongs to the PLAN'S OWNER, whoever pressed it (FD-1 ruling 5).
 *   · A QA account is exempt and makes no row (FD-1 ruling 6 of FD-2).
 *   · A guest counts only on a SERVER guest record; a browser-made id is never a key (§13).
 */

import { meetsTarget, nearestArea, type CoverageDayType, type SlugTargets } from "./coverage-targets";

export const FREE_DRAFT_RAILS = ["slip", "trip", "quick_start"] as const;
export type FreeDraftRail = (typeof FREE_DRAFT_RAILS)[number];

export const FREE_DRAFT_RUN_STATUSES = ["claimed", "drafted", "released"] as const;
export type FreeDraftRunStatus = (typeof FREE_DRAFT_RUN_STATUSES)[number];

/** A released run is our failure (provider error, our exception) and never counts (FD-1 ruling 3). */
export function runCounts(status: string | null | undefined): boolean {
  return status === "claimed" || status === "drafted";
}

/** Who is charged a free draft. `null` = nobody: not a free draft, or an exempt account. */
export type FreeDraftSubject =
  | { kind: "user"; userId: string }
  | { kind: "guest"; guestKey: string };

export interface FreeDraftContext {
  rail: FreeDraftRail;
  /** The plan's owner (`trips.user_id`); null on a plan with no owner. */
  planOwnerId: string | null;
  /** The server guest record's id, once E2/E3 mint one; never a browser-made id. */
  serverGuestKey?: string | null;
  /** `planGetsRoutedLegs` for this plan: true ⇒ paid tier, not a free draft. */
  planIsPaidTier: boolean;
  /** The owner's account is QA (`isQaDomainAccount`). */
  ownerIsQa: boolean;
}

export function freeDraftSubject(ctx: FreeDraftContext): FreeDraftSubject | null {
  if (ctx.planIsPaidTier) return null;
  if (ctx.planOwnerId) return ctx.ownerIsQa ? null : { kind: "user", userId: ctx.planOwnerId };
  if (ctx.serverGuestKey) return { kind: "guest", guestKey: ctx.serverGuestKey };
  return null;
}

export type FreeDraftDecision =
  | { allowed: true; used: number; limit: number; remainingAfter: number }
  | { allowed: false; reason: "cap_reached"; used: number; limit: number; windowDays: number }
  | { allowed: false; reason: "plan_already_drafted" };

/**
 * The claim's decision, given what the claim counted under its lock. `usedInWindow` counts the
 * subject's counting runs in the window; `planHasCountingRun` is the one-per-plan guard (the UNIQUE
 * index makes it true at the statement; this answers the refusal's words).
 */
export function decideFreeDraft(input: {
  usedInWindow: number;
  planHasCountingRun: boolean;
  limit: number;
  windowDays: number;
}): FreeDraftDecision {
  if (input.planHasCountingRun) return { allowed: false, reason: "plan_already_drafted" };
  const used = Math.max(0, Math.floor(input.usedInWindow));
  if (used >= input.limit) return { allowed: false, reason: "cap_reached", used, limit: input.limit, windowDays: input.windowDays };
  return { allowed: true, used, limit: input.limit, remainingAfter: input.limit - used - 1 };
}

/** §6 copy, from the server's own numbers. Null when nothing true can be said. */
export function freeDraftCopy(s: { used: number; limit: number } | null | undefined): string | null {
  if (!s || !Number.isFinite(s.used) || !Number.isFinite(s.limit) || s.limit <= 0) return null;
  const left = Math.max(0, s.limit - s.used);
  if (left === 0) return "Free drafts used up — Optimize or get a Trip Pass";
  return `${left} of ${s.limit} free draft${s.limit === 1 ? "" : "s"} left this month`;
}

/** One day's count-only teaser (FD-1 ruling 2). Absent when not computed or nothing to say (§13). */
export interface LocalTeaser { localPicks: number; localNotes: number }

export function localTeaserForDay(counts: { localPicks: number; localNotes: number } | null | undefined): LocalTeaser | undefined {
  if (!counts) return undefined;
  const picks = Math.max(0, Math.floor(counts.localPicks || 0));
  const notes = Math.max(0, Math.floor(counts.localNotes || 0));
  if (picks === 0 && notes === 0) return undefined;
  return { localPicks: picks, localNotes: notes };
}

/**
 * FD-5 (ledger `2026-10-10-fd5-coverage-targets`): the teaser's words on the day block — the server's counts,
 * never padded, nothing on a zero day (§13). Counts only: no title, place or tier word.
 *   "3 local picks and 2 local notes for this day" · "1 local pick for this day" · "2 local notes for this day"
 */
export function localTeaserLine(t: LocalTeaser | null | undefined): string | null {
  const v = localTeaserForDay(t);
  if (!v) return null;
  const parts: string[] = [];
  if (v.localPicks > 0) parts.push(`${v.localPicks} local pick${v.localPicks === 1 ? "" : "s"}`);
  if (v.localNotes > 0) parts.push(`${v.localNotes} local note${v.localNotes === 1 ? "" : "s"}`);
  return `${parts.join(" and ")} for this day`;
}

/**
 * FD-1 teaser basis (ledger `2026-10-09-fd1-free-draft-cap`): per day of a FREE plan, how many local picks
 * and local notes the paid tier would add AROUND THAT DAY — counts only, never a title, place or id.
 *   · a day's area = the neighbourhoods its LOCATED stops fall in (nearest centroid in the plan's city);
 *   · localPicks = draft-eligible LOCAL gems in those neighbourhoods, not already on the plan;
 *   · localNotes = live LOCAL expert notes (nuggets) about those neighbourhoods (ruling 2).
 * A day with no located stop, or no neighbourhood, is NOT COMPUTED and absent (§13); zero is absent too.
 */
export interface TeaserNeighbourhood { id: string; slug: string; name: string; lat: number | null; lng: number | null }
export interface TeaserInput {
  items: Array<{ dayNumber: number; lat: number | null; lng: number | null; gemId: string | null }>;
  neighbourhoods: readonly TeaserNeighbourhood[];
  gems: Array<{ id: string; neighbourhoodSlug: string | null }>;
  notes: Array<{ neighbourhoodId: string | null; neighbourhoodName: string | null }>;
  /**
   * FD-5 (ledger `2026-10-10-fd5-coverage-targets`, rulings 3/4): per neighbourhood SLUG, its targets by day
   * type, and each plan day's type. A day's teaser counts only the neighbourhoods at or above their own
   * target for that day type, measured on the neighbourhood's whole live local content (not the plan's
   * remainder); none at target ⇒ the day carries nothing. Never summed across neighbourhoods. A slug with no
   * target has no gate; absent `gate` ⇒ FD-1's behaviour.
   */
  gate?: {
    targets: Record<string, SlugTargets>;
    dayTypeOf: (dayNumber: number) => CoverageDayType;
  };
}

export function localTeasersByDay(input: TeaserInput): Map<number, LocalTeaser> {
  const out = new Map<number, LocalTeaser>();
  const onPlan = new Set(input.items.map((i) => i.gemId).filter((g): g is string => !!g));
  const byDay = new Map<number, Map<string, TeaserNeighbourhood>>();
  for (const it of input.items) {
    if (it.lat == null || it.lng == null || !Number.isFinite(it.lat) || !Number.isFinite(it.lng)) continue;
    const area = nearestArea({ lat: it.lat, lng: it.lng }, input.neighbourhoods);
    if (!area) continue;
    if (!byDay.has(it.dayNumber)) byDay.set(it.dayNumber, new Map());
    byDay.get(it.dayNumber)!.set(area.id, area);
  }
  // FD-5: each neighbourhood's own totals, the census's measure (shared/coverage-targets.ts).
  const totals = (a: TeaserNeighbourhood) => ({
    localPicks: input.gems.filter((g) => g.neighbourhoodSlug && g.neighbourhoodSlug.toLowerCase() === a.slug.toLowerCase()).length,
    localNotes: input.notes.filter((n) => (n.neighbourhoodId && n.neighbourhoodId === a.id) || (n.neighbourhoodName && n.neighbourhoodName.trim().toLowerCase() === a.name.trim().toLowerCase())).length,
  });
  for (const [day, allAreas] of Array.from(byDay.entries())) {
    const gate = input.gate;
    const areas = gate
      ? new Map(Array.from(allAreas.entries()).filter(([, a]) => meetsTarget(totals(a), gate.targets[a.slug]?.[gate.dayTypeOf(day)])))
      : allAreas;
    if (areas.size === 0) continue;
    const slugs = new Set(Array.from(areas.values()).map((a) => a.slug.toLowerCase()));
    const ids = new Set(Array.from(areas.keys()));
    const names = new Set(Array.from(areas.values()).map((a) => a.name.trim().toLowerCase()));
    const picks = input.gems.filter((g) => g.neighbourhoodSlug && slugs.has(g.neighbourhoodSlug.toLowerCase()) && !onPlan.has(g.id)).length;
    const notes = input.notes.filter((n) => (n.neighbourhoodId && ids.has(n.neighbourhoodId)) || (n.neighbourhoodName && names.has(n.neighbourhoodName.trim().toLowerCase()))).length;
    const teaser = localTeaserForDay({ localPicks: picks, localNotes: notes });
    if (teaser) out.set(day, teaser);
  }
  return out;
}
