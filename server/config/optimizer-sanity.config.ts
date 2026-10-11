/**
 * V-1 (R438; ledger `2026-10-11-v1-version-sanity`): the two wall-clock thresholds a version's sanity
 * checks read. Deployment config, never a literal at the check: a dining stop starting at or after
 * `OPTIMIZER_DINNER_FROM` (default 17:00) is a dinner, and a stop starting after
 * `OPTIMIZER_LATEST_STOP_START` (default 22:00) is flagged `late_start`. An unparseable value falls
 * back to the default rather than silently disabling the check.
 */
const HHMM = /^(\d{1,2}):(\d{2})$/;

function minutesOf(raw: string | undefined, fallback: string): number {
  const m = HHMM.exec((raw ?? "").trim()) ?? HHMM.exec(fallback)!;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return minutesOf(undefined, fallback);
  return h * 60 + min;
}

/** Minutes after midnight from which a dining stop counts as a dinner. */
export function optimizerDinnerFromMinutes(): number {
  return minutesOf(process.env.OPTIMIZER_DINNER_FROM, "17:00");
}

/** Minutes after midnight after which a stop's start is flagged `late_start`. */
export function optimizerLatestStopStartMinutes(): number {
  return minutesOf(process.env.OPTIMIZER_LATEST_STOP_START, "22:00");
}
