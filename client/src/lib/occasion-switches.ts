/**
 * OCCASION SWITCHES — the client's ONE reader of migration 276's six columns.
 * Ledger `2026-09-03-switch-readers`; CLAUDE.md Locked Decision 28.
 *
 * Migration 276 gave `experience_types` six switch columns and, deliberately, no reader: the
 * ruling that landed them said an occasion is a ROW carrying defaults, not a class, and left the
 * flow reading the class for one more lane. This module is the first reader. Every surface that
 * wants to know what shape a chosen occasion asks for calls in HERE — a second copy of "what does
 * `default_duration` mean" is the derivation-drift class §18 rule 1 names.
 *
 * THE ONE RULE THAT GOVERNS EVERY FUNCTION BELOW (§13). The columns are nullable with **no DB
 * CHECK** (the publish-trap posture; a CHECK over a column prod rows can violate fails the deploy
 * push mid-push). So a reader meets three states, not two:
 *
 *   - a value from the allowed set  ⇒ the occasion's own answer, honour it;
 *   - **NULL / absent**             ⇒ NOT SET. Fall back to the PLAIN-PLAN shape and say so.
 *     Never fabricate a `one`/`day`/`off` and present it as this occasion's answer;
 *   - an unrecognised string        ⇒ treated exactly like NULL. A value nothing has a branch for
 *     is not a branch — honouring half of it would be a guess wearing the row's authority.
 *
 * The plain-plan shape — what the modal did before any occasion existed — is: a date RANGE
 * (first day / last day), no "What's happening" step, a visible plan, and the word "travelers".
 * Each function below states which of those it is falling back to.
 *
 * Pure: no React, no fetch, no DB. `partyNoun` (the vocabulary column's reader) lives in
 * plan-vocabulary.ts beside the rest of the presentation vocabulary; everything else is here.
 */

/** The subset of an `experience_types` row this module reads. */
export interface OccasionSwitchRow {
  defaultStops?: string | null;
  defaultDuration?: string | null;
  defaultSchedule?: boolean | null;
  defaultGuests?: boolean | null;
  vocabulary?: string | null;
  defaultVisibility?: string | null;
}

/** Step 3's shape: one date, or a first-day/last-day range. */
export type DurationShape = "day" | "range";

/**
 * Step 3 — `default_duration`.
 *
 * "day"   ⇒ ONE date input (the plan starts and ends on it) plus an optional time for the main
 *           moment. "range" ⇒ the first-day/last-day pair the panel has always shown.
 *
 * NULL / unrecognised ⇒ **"range"**, the PLAIN-PLAN shape. Collapsing an undecided occasion to a
 * single day would silently discard a date the traveler had already given (§13), which is the
 * more destructive of the two fallbacks — so the fallback is the one that asks more, not less.
 */
export function durationShape(row?: OccasionSwitchRow | null): DurationShape {
  return row?.defaultDuration === "day" ? "day" : "range";
}

/**
 * Step 5 — `default_schedule`. TRUE ⇒ the occasion has an internal schedule, so "What's
 * happening" is offered.
 *
 * NULL / absent ⇒ **false**, the PLAIN-PLAN shape (a trip has no internal schedule). This is the
 * safe direction: a step that is not shown asks nothing and writes nothing, whereas showing a
 * schedule step for an occasion nobody decided has one would put words in the row's mouth.
 */
export function showsSchedule(row?: OccasionSwitchRow | null): boolean {
  return row?.defaultSchedule === true;
}

/**
 * `default_guests` as the TRI-STATE it actually is — `true` (has a guest list), `false`
 * (deliberately does not), `null` (nobody decided). Callers need the three apart: `false` is the
 * ruling that suppresses every word of guest copy, while `null` is merely the absence of a ruling
 * and must not be read as one (§13). Returning a plain boolean here would erase that difference at
 * the first call site.
 */
export function guestListSetting(row?: OccasionSwitchRow | null): boolean | null {
  const v = row?.defaultGuests;
  return v === true || v === false ? v : null;
}

/**
 * `default_visibility` — "hidden" is the proposal case: no Share link, no guest list, no invite
 * surface, because the whole point is that the other person does not find out.
 *
 * NULL / unrecognised ⇒ **false (shown)**, the PLAIN-PLAN shape. The fallback deliberately does
 * NOT hide: hiding on an undecided row would delete real affordances from every occasion that has
 * not been given a value yet, which is a far louder failure than showing them.
 */
export function isHiddenOccasion(row?: OccasionSwitchRow | null): boolean {
  return row?.defaultVisibility === "hidden";
}
