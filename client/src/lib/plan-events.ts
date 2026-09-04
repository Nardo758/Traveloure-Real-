/**
 * STEP 5's TABLE — the reducer behind "What's happening", pure so the rules are testable without
 * React and cannot drift into a second copy inside the modal (§18 rule 1).
 * Ledger `2026-09-04-event-time-ui`; cites `2026-09-04-stops-and-event-time` (migration 282,
 * CLAUDE.md Locked Decision 35) and `2026-09-04-plan-mint` (Locked Decision 30 (b)).
 *
 * ── WHAT CHANGED, AND WHY IT COULD NOT BE BUILT BEFORE ──────────────────────────────────────
 * The ratified artboards (`Step5Events.dc.html`, `TravelEvents.dc.html`) draw each ticked chip as
 * a ROW — Event · Day · Time · Place — and `TravelEvents` is entirely about the TIME column (tee
 * times: 08:10, 09:00, 08:30, 10:20). `user_experiences` had no time-of-day column, so the step
 * shipped as chips alone and the audits recorded the table as HELD rather than drawing a clock
 * nothing could store. Migration 282 gave the column its home; this is the table.
 *
 * ── THE THREE RULES THIS FILE EXISTS TO KEEP ────────────────────────────────────────────────
 *
 * 1. **A DEFAULT IS SHOWN, NEVER WRITTEN (§13).** The artboard's copy says "Days and times default
 *    to your plan". A traveler who never opened the Day cell has not CHOSEN the plan's first day —
 *    so the draft's field stays ABSENT and the plan's day is offered as a placeholder. It becomes
 *    a real value only where it always did: at CREATE, through the ONE shared
 *    `planEventRowValues` (`shared/plan-events.ts`), which both this modal's POST and the pre-trip
 *    pen drain use. There is no fallback for the TIME at all — a plan has no hour to inherit, and
 *    midnight is not "no time given".
 *
 * 2. **THE DAY IS PICKED FROM THE PLAN'S OWN DAYS.** `planDayOptions` builds the list from
 *    `trips.start_date`/`end_date`, which are NOT NULL, so an event cannot be dated outside the
 *    plan that contains it. A plan whose range this function cannot read offers NO days rather
 *    than a guessed one — the Day cell then simply does not ask.
 *
 * 3. **TITLE IS IDENTITY.** A row is keyed by its title because that is what the drain is
 *    idempotent on (`pending-events.service.ts` skips a title that already has an event on the
 *    trip). Everything here matches titles case-insensitively for that reason, and a duplicate is
 *    collapsed rather than allowed to race for the same event.
 *
 * ORDER IS THE TRAVELER'S. Nothing here sorts: the rows render in tick order, and the SERVER owns
 * the order these become once they are rows (`which-event.ts` rule 5).
 */
import {
  MAX_PLAN_EVENTS,
  MAX_PLAN_EVENT_PLACE,
  MAX_PLAN_EVENT_TITLE,
  normalizePlanEvents,
  planEventRowValues,
  type PlanEventDefaults,
  type PlanEventDraft,
  type PlanEventRowValues,
} from "@shared/plan-events";

export {
  MAX_PLAN_EVENTS,
  MAX_PLAN_EVENT_PLACE,
  MAX_PLAN_EVENT_TITLE,
  normalizePlanEvents,
  planEventRowValues,
};
export type { PlanEventDefaults, PlanEventDraft, PlanEventRowValues };

/** The pen as it sits in `trip_contexts.context` — BOTH spellings, for the one release. */
export interface PendingEventPen {
  /** The shape written from this release on: title + the three optional answers. */
  pendingEvents?: unknown;
  /**
   * THE LEGACY SPELLING — bare titles, all this pen could hold before migration 282. Read for one
   * release so a traveler who ticked chips before this deploy does not lose them, then never
   * written again. `normalizePlanEvents` accepts a bare string as a title-only draft, which is
   * exactly what one of these is.
   */
  pendingEventTitles?: unknown;
}

/**
 * Read the pen, whichever spelling it is in. The rich list WINS when it is present and non-empty:
 * this release writes it and empties its legacy sibling in the same call, so a non-empty
 * `pendingEventTitles` beside a non-empty `pendingEvents` means a stale write, and the richer
 * answer is the later one. Neither present ⇒ `[]`, the honest "nothing was ticked".
 */
export function readPendingEvents(pen: PendingEventPen | null | undefined): PlanEventDraft[] {
  const rich = normalizePlanEvents(pen?.pendingEvents);
  if (rich.length > 0) return rich;
  return normalizePlanEvents(pen?.pendingEventTitles);
}

/** Is this title currently a row? Case-insensitive, matching rule 3. */
export function hasEventRow(
  rows: readonly PlanEventDraft[],
  title: string,
): boolean {
  const key = title.trim().toLowerCase();
  return rows.some((r) => r.title.toLowerCase() === key);
}

/**
 * Tick / untick a chip. Ticking APPENDS (tick order is render order); unticking removes the row
 * AND the answers on it, which is the honest reading of "this is not happening" — keeping a
 * ghost time for an event the traveler removed would resurrect it on a re-tick as if they had
 * re-entered it. Ticking past the cap is refused rather than silently dropping an earlier row.
 */
export function toggleEventRow(
  rows: readonly PlanEventDraft[],
  title: string,
): PlanEventDraft[] {
  const clean = title.trim().slice(0, MAX_PLAN_EVENT_TITLE);
  if (!clean) return [...rows];
  if (hasEventRow(rows, clean)) {
    const key = clean.toLowerCase();
    return rows.filter((r) => r.title.toLowerCase() !== key);
  }
  if (rows.length >= MAX_PLAN_EVENTS) return [...rows];
  return [...rows, { title: clean }];
}

/**
 * Set one cell of one row. An EMPTY value CLEARS the field back to ABSENT — "not answered" has to
 * stay reachable after an answer, or a traveler who typed a time by accident could never take it
 * back and the plan would carry a claim they tried to withdraw (§13). A title that is not a row is
 * a no-op: this never creates a row as a side effect of editing one.
 */
export function setEventDetail(
  rows: readonly PlanEventDraft[],
  title: string,
  patch: { eventDate?: string; startTime?: string; location?: string },
): PlanEventDraft[] {
  const key = title.trim().toLowerCase();
  return rows.map((row) => {
    if (row.title.toLowerCase() !== key) return row;
    const next: PlanEventDraft = { ...row };
    for (const field of ["eventDate", "startTime", "location"] as const) {
      if (!(field in patch)) continue;
      const value = (patch[field] ?? "").trim();
      if (value) next[field] = value;
      else delete next[field];
    }
    // Re-normalized so a malformed value from an input never reaches the pen or a POST body: a
    // wrong SHAPE is dropped here, exactly as the two admission rails would drop it.
    return normalizePlanEvents([next])[0] ?? { title: row.title };
  });
}

/**
 * The rows as they will actually be created — the ticked ones plus the free-text "Something else"
 * when it has been typed. The free-text row carries no day/time/place of its own: it has no cell
 * to fill until it is a row, and inventing one for it would be the fabrication rule 1 forbids.
 *
 * This is the list the CTA counts and the list the save writes, so there is exactly one answer to
 * "what will be created" and the button cannot promise a different number from what lands.
 */
export function eventsToCreate(
  rows: readonly PlanEventDraft[],
  customTitle: string,
): PlanEventDraft[] {
  const extra = customTitle.trim();
  return normalizePlanEvents(extra ? [...rows, { title: extra }] : [...rows]);
}

/**
 * The plan's own days, as "YYYY-MM-DD", for the Day cell (rule 2).
 *
 * `trips.start_date` / `end_date` are NOT NULL, so a plan always has a range once it exists — but
 * this runs BEFORE a plan exists too, on whatever the traveler has entered so far. An unreadable
 * or backwards range yields `[]` and the Day cell asks nothing, which is honest: there is no set
 * of days to choose from yet. Capped so a mistyped year cannot build a list of 40,000 options.
 */
export function planDayOptions(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  maxDays = 60,
): string[] {
  const start = (startDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return [];
  const end = /^\d{4}-\d{2}-\d{2}$/.test((endDate || "").trim()) ? (endDate as string).trim() : start;
  if (end < start) return [start];
  const days: string[] = [];
  // Stepped in UTC and read back as a UTC date part, so a day is never dropped or doubled by the
  // runner's own zone — the same F-1 hazard `parseTripDate` exists for, one operation over.
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return [];
  for (let ms = startMs; ms <= endMs && days.length < maxDays; ms += 24 * 60 * 60 * 1000) {
    days.push(new Date(ms).toISOString().slice(0, 10));
  }
  return days;
}
