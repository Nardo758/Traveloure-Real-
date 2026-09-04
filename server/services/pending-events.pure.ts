/**
 * pending-events.pure.ts — the pen's READ, with no database in it.
 * Ledger `2026-09-04-event-time-ui`; cites `2026-09-04-plan-mint` (CLAUDE.md Locked Decision 30 (b))
 * and `2026-09-04-stops-and-event-time` (migration 282, Locked Decision 35).
 *
 * The drain beside this file (`pending-events.service.ts`) needs a database for everything it
 * does — read the context row, resolve the occasion, list the trip's existing events, write. The
 * DECISIONS it makes on the way do not. They live here so they keep their proof in an environment
 * with no `DATABASE_URL`, which is the same reason `trip-destinations.pure.ts` exists beside its
 * own service (ledger `2026-09-04-stops-and-event-time`).
 *
 * Both functions delegate to `shared/plan-events.ts` rather than restating its rules: the pen is
 * written by the CLIENT and read here, so a normalization that differs by one trim on the two
 * sides is the drift class §18 rule 1 names — and the field it would differ on is a time.
 */
import {
  normalizePlanEvents,
  planEventRowValues,
  type PlanEventDefaults,
  type PlanEventDraft,
  type PlanEventRowValues,
} from "@shared/plan-events";

/** The pen's two keys inside the `trip_contexts.context` jsonb blob. */
export const PEN_KEY = "pendingEvents";
/**
 * THE LEGACY KEY — bare titles, all the pen could hold before migration 282 gave an event a time.
 * Read for one release so a pen written before this deploy still drains, and never written again.
 * Both keys are cleared together on a successful drain, so a stale legacy list cannot replay.
 */
export const LEGACY_PEN_KEY = "pendingEventTitles";

/**
 * What the caller held, in the canonical draft shape, whichever key it was written under.
 *
 * The RICH list wins when it has rows: this release writes it and empties the legacy list in the
 * same call, so a non-empty legacy list beside a non-empty rich one means a stale write and the
 * richer answer is the later one. A malformed row, a malformed day or a malformed time is DROPPED
 * by the shared normalizer rather than coerced — a value whose shape is wrong is not an answer
 * this drain may pass on to a column with no CHECK behind it (§13).
 */
export function heldEventsFromContext(context: unknown): PlanEventDraft[] {
  if (!context || typeof context !== "object") return [];
  const blob = context as Record<string, unknown>;
  const rich = normalizePlanEvents(blob[PEN_KEY]);
  if (rich.length > 0) return rich;
  return normalizePlanEvents(blob[LEGACY_PEN_KEY]);
}

/**
 * The values ONE held draft becomes as a `user_experiences` row.
 *
 * Delegates to the ONE inheritance rule (`planEventRowValues`) the modal's own POST uses, so a
 * chip ticked before the plan existed and the same chip ticked after it produce the SAME row. The
 * TIME has no fallback: absent stays NULL, never midnight and never "all day".
 */
export function drainRowValues(
  draft: PlanEventDraft,
  defaults: PlanEventDefaults,
): PlanEventRowValues {
  return planEventRowValues(draft, defaults);
}
