/**
 * THE LEG RE-CHECK'S RULES — pure (step 9b, L8 / D5 / D6, ledger `2026-10-07-step9b-optimizer-and-rechecks`;
 * surface spec R-aw, R-bb).
 *
 * A routed plan's legs are asked again at T-3 (the `facts-recheck` job) and on the morning of each trip
 * day (the `legs-dayof-recheck` job). A re-check NEVER writes a leg: it records what it found on the
 * leg's own `leg_check_status` / `leg_checked_at` (R-bb's columns, migration 347) and, when a leg
 * changed, ONE banner finding (a deduped notice). The plan is never silently rewritten — the traveler
 * reads "Travel to <stop> now 31 min (was 18)" and decides.
 *
 *   ok      the adapter answered within the threshold of the minutes the plan holds
 *   changed the duration moved by MORE than `LEG_RECHECK_CHANGED_MINUTES`
 *   broken  the adapter answered `no_route` — that mode is not available for the pair now
 *   (none)  `paused` (the Maps cap) — nothing was learned, so nothing is written (§13)
 */

/** L8: a re-checked leg is "changed" when its duration moves by more than this many minutes. */
export const LEG_RECHECK_CHANGED_MINUTES = 10;

export type LegCheckStatus = "ok" | "changed" | "broken";

/** The notice `data.kind` a leg finding carries, beside the hours finding on the same notice type. */
export const LEG_RECHECK_KIND = "leg";

export type LegRecheckOutcome = { kind: "ok"; durationMin: number } | { kind: "no_route" } | { kind: "paused" };

/** Pure. What a re-check found for a leg the plan holds at `wasMin` minutes; null = learned nothing. */
export function classifyLegRecheck(wasMin: number, outcome: LegRecheckOutcome): LegCheckStatus | null {
  if (outcome.kind === "paused") return null;
  if (outcome.kind === "no_route") return "broken";
  return Math.abs(Math.round(outcome.durationMin) - Math.round(wasMin)) > LEG_RECHECK_CHANGED_MINUTES ? "changed" : "ok";
}

/**
 * The dedupe key of ONE leg finding: per plan, per stop pair, per check DATE. Two runs of a job on the
 * same day write one finding; the next re-check day may write its own.
 */
export function legRecheckDedupeKey(tripId: string, fromActivityId: string | null, toActivityId: string | null, checkDate: string): string {
  return `facts-recheck-leg:${tripId}:${fromActivityId ?? "-"}:${toActivityId ?? "-"}:${checkDate}`;
}

/** The prefix every leg finding of one plan shares — what the card's read selects on. */
export function legRecheckDedupePrefix(tripId: string): string {
  return `facts-recheck-leg:${tripId}:`;
}

const MODE_WORD: Record<string, string> = { walk: "walking", transit: "transit", drive: "driving", cycle: "cycling" };

export interface LegRecheckFinding {
  toName: string | null;
  mode: string | null;
  wasMin: number;
  nowMin: number | null;
  status: "changed" | "broken";
}

/**
 * The banner's line for one changed leg: "Travel to Kinkaku-ji now 31 min (was 18) · re-checked 8 Nov";
 * a broken leg: "Travel to Kinkaku-ji: no transit route now (was 18 min) · re-checked 8 Nov". Minutes
 * in-plan only (R-h) — this renders on the plan's own card.
 */
export function legRecheckLine(f: LegRecheckFinding, checkedLabel: string | null): string {
  const to = (f.toName ?? "").trim() || "your next stop";
  const what =
    f.status === "broken" || f.nowMin == null
      ? `Travel to ${to}: no ${MODE_WORD[String(f.mode)] ?? "route"}${MODE_WORD[String(f.mode)] ? " route" : ""} now (was ${Math.round(f.wasMin)} min)`
      : `Travel to ${to} now ${Math.round(f.nowMin)} min (was ${Math.round(f.wasMin)})`;
  return checkedLabel ? `${what} · re-checked ${checkedLabel}` : what;
}
