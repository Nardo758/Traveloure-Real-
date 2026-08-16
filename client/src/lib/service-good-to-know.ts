/**
 * service-good-to-know.ts — T-REP (docs/briefs/SERVICE_CREATION_EXECUTION_MAP.md, G5 #13).
 *
 * Pure formatting/derivation helpers for the traveler service-detail page's "Good to know" card
 * (`client/src/pages/service-detail.tsx`). Split out for the same reason `pricing-fees.ts` is its
 * own module: a transform a unit test can hold to a fixed shape, not prose buried inside a page
 * component.
 *
 * §13 POSTURE — every helper here is an HONEST-RENDER, never a GUESS:
 *   - a `null`/`undefined`/absent input means the provider never declared that fact, and every
 *     `has*` predicate below reports that as "nothing to show" rather than substituting a default;
 *   - `formatHours`/`formatMinutes` state the REAL stored number, they never invent one;
 *   - `resolveDepositPreview` mirrors `server/services/deposit.service.ts`'s own percentage/flat
 *     formula for DISPLAY ONLY — it is not a second source of truth for the charge. Checkout
 *     re-derives the real amount server-side from the confirmed line total (§14); this preview can
 *     never be the value that is actually charged.
 *
 * The three eligibility-shaped helpers (`formatPartySize`, `formatStartWindow`, `formatHours` used
 * for lead time) mirror the exact constraints `server/services/booking-eligibility.service.ts`
 * already enforces at checkout (ruling 83) — same wording family, so the page states the SAME rule
 * the server will actually apply, not a paraphrase that could drift from it.
 */

/** A finite number, or null for anything else (never NaN, never a fabricated 0). */
function asFiniteNumber(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}

/**
 * `24` → "1 day"; `48` → "2 days"; `6` → "6 hours". Only collapses to day units on an exact
 * multiple of 24 — an odd value like 30 stays "30 hours" rather than a misleading "1.25 days".
 */
export function formatHours(hours: number): string {
  if (hours >= 24 && hours % 24 === 0) {
    const days = hours / 24;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

/** `90` → "1h 30m"; `60` → "1h"; `45` → "45m". */
export function formatMinutes(minutes: number): string {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h`;
  return `${mins}m`;
}

/**
 * Party-size range in prose. Both bounds present and equal ⇒ an exact count; both present and
 * different ⇒ a range; only one bound present ⇒ an open-ended "at least" / "up to" phrasing.
 * Returns null when NEITHER bound is set (§13 — nothing to state).
 */
export function formatPartySize(min: unknown, max: unknown): string | null {
  const lo = asFiniteNumber(min);
  const hi = asFiniteNumber(max);
  if (lo === null && hi === null) return null;
  if (lo !== null && hi !== null) {
    if (lo === hi) return `${lo} ${lo === 1 ? "person" : "people"}`;
    return `${lo}–${hi} people`;
  }
  if (lo !== null) return `${lo}+ people`;
  return `Up to ${hi} people`;
}

/**
 * Start-window prose ("Between 09:00 and 17:00", "No earlier than 09:00", "No later than 17:00"),
 * with the listing's timezone appended when it declared one, or an honest "provider's local time"
 * qualifier when it didn't (never a silently assumed zone — mirrors
 * `booking-eligibility.service.ts`'s own UTC-fallback comment). Returns null when NEITHER bound is
 * set.
 */
export function formatStartWindow(
  earliest: string | null | undefined,
  latest: string | null | undefined,
  timezone: string | null | undefined,
): string | null {
  const hasEarliest = !!earliest;
  const hasLatest = !!latest;
  if (!hasEarliest && !hasLatest) return null;
  const zoneSuffix = timezone ? ` (${timezone})` : " (provider's local time)";
  if (hasEarliest && hasLatest) return `Between ${earliest} and ${latest}${zoneSuffix}`;
  if (hasEarliest) return `No earlier than ${earliest}${zoneSuffix}`;
  return `No later than ${latest}${zoneSuffix}`;
}

/**
 * ── The weekly repeat rule, in traveler words (lane M3 — gap #13's "Starts" row) ──────────────
 *
 * `service_availability_patterns` (ledger row 102's weekly grid: `day_of_week` 0=Sun..6=Sat +
 * `start_time`/`end_time`) had an owner-gated PUT and an owner-gated GET and NO public read at
 * all — so a provider authored "every Tuesday and Thursday at 18:00" and no traveler could ever
 * see it. That is exactly what gap #13 forbids: an authored answer with no traveler-side home.
 * T-REP (row 101) deferred availability to lane S7, so the rule was never applied to it; this
 * closes the one line of it the ratified mock actually draws ("18:00, Tuesdays & Thursdays").
 *
 * §13: only REAL rows speak. No rows ⇒ null (the listing does not repeat weekly — it may sell
 * through dated slots instead, and claiming a weekly rhythm it never declared would be a
 * fabrication). Rows are grouped by start time so two different times on different days read
 * honestly as two clauses rather than being flattened into one wrong sentence.
 *
 * The timezone suffix follows `formatStartWindow`'s convention exactly — a declared IANA zone, or
 * an explicit "provider's local time" when the listing never declared one. Never a silent assumption.
 */
const DAY_PLURALS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"] as const;

export interface WeeklyPatternLike {
  dayOfWeek: number;
  startTime: string;
}

/** "Tuesdays", "Tuesdays & Thursdays", "Mondays, Wednesdays & Fridays" — never a trailing comma. */
function joinDayNames(days: number[]): string {
  const names = days.map((d) => DAY_PLURALS[d]);
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

export function formatWeeklyPattern(
  patterns: readonly WeeklyPatternLike[] | null | undefined,
  timezone: string | null | undefined,
): string | null {
  if (!Array.isArray(patterns) || patterns.length === 0) return null;

  // One bucket per start time; a day listed twice at the same time collapses to one mention.
  const byTime = new Map<string, Set<number>>();
  for (const p of patterns) {
    const day = asFiniteNumber(p?.dayOfWeek);
    const time = typeof p?.startTime === "string" ? p.startTime.trim() : "";
    // A day outside 0..6 is not a day — the column is app-enforced with no DB CHECK, so a bad
    // row is possible and is dropped rather than rendered as `undefined`.
    if (day === null || !Number.isInteger(day) || day < 0 || day > 6 || !time) continue;
    if (!byTime.has(time)) byTime.set(time, new Set());
    byTime.get(time)!.add(day);
  }
  if (byTime.size === 0) return null;

  // Plain arrays, not spread Map/Set iterators — this repo's tsconfig target predates
  // downlevelIteration, so `[...map.entries()]` does not compile here.
  const entries: Array<[string, number[]]> = [];
  byTime.forEach((daySet, time) => {
    const days: number[] = [];
    daySet.forEach((d) => days.push(d));
    entries.push([time, days]);
  });
  const clauses = entries
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([time, dayList]) => {
      const days = dayList.slice().sort((a, b) => a - b);
      // All seven is a rhythm with a shorter name; saying it the long way reads as a list of
      // exceptions when there are none.
      const when = days.length === 7 ? "Every day" : joinDayNames(days);
      return `${when} at ${time}`;
    });

  const zoneSuffix = timezone ? ` (${timezone})` : " (provider's local time)";
  return `${clauses.join(" · ")}${zoneSuffix}`;
}

export const TRANSPORT_PROVISION_LABELS: Record<string, string> = {
  pickup_included: "Pickup included — the provider collects you",
  pickup_available: "Pickup available — can be arranged",
  meet_at_point: "Meet at the meeting point — make your own way there",
};

/** null/undefined/"not_applicable" all mean "nothing declared" — the trust-panel line already
 * covers the plain yes/no transportProvided signal, so this is deliberately silent for those. */
export function formatTransportProvision(value: string | null | undefined): string | null {
  if (!value || value === "not_applicable") return null;
  return TRANSPORT_PROVISION_LABELS[value] ?? value;
}

/**
 * S9 (docs/DECISIONS.md ledger row 102) — the async lane's promised response time, in prose
 * ("Replies within 24 hours"). Reuses `formatHours`'s own day/hour collapsing so this line reads
 * the same way the lead-time/change-cutoff lines above do. Returns null when never captured or
 * not a positive number (§13 — never a fabricated "as soon as possible").
 */
export function formatResponseWindow(hours: unknown): string | null {
  const n = asFiniteNumber(hours);
  if (n === null || n <= 0) return null;
  return `Replies within ${formatHours(n)}`;
}

export interface DepositPreviewInput {
  depositEnabled?: boolean | null;
  depositType?: string | null;
  depositPercentage?: number | null;
  depositFlatAmount?: string | number | null;
}

/** Cents-accurate rounding, matching `deposit.service.ts`'s own `round2`. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * A DISPLAY-ONLY preview of the deposit split, mirroring `resolveDepositPlan`'s own formula. Never
 * the value actually charged (checkout re-derives it server-side from the confirmed line total,
 * §14) — this exists only so a traveler isn't surprised by a partial charge they were never told
 * about. Returns null when deposits are off, the type is unset/unrecognized, or (for a percentage
 * deposit) the price isn't known yet — in which case the caller should fall back to a generic
 * "deposit required" line rather than a dollar figure this function can't honestly produce.
 */
export function resolveDepositPreview(
  input: DepositPreviewInput,
  fmtPrice: (n: number) => string,
  priceNum: number,
): string | null {
  if (!input.depositEnabled || !input.depositType) return null;
  if (input.depositType === "percentage") {
    const pct = asFiniteNumber(input.depositPercentage);
    if (pct === null) return null;
    if (priceNum > 0) {
      return `${pct}% due now (${fmtPrice(round2(priceNum * (pct / 100)))}), balance due before the service`;
    }
    return `${pct}% due now, balance due before the service`;
  }
  if (input.depositType === "flat") {
    const flat = Number(input.depositFlatAmount);
    if (!Number.isFinite(flat) || flat <= 0) return null;
    return `${fmtPrice(flat)} due now, balance due before the service`;
  }
  return null;
}

/** True whenever `resolveDepositPreview`/the deposit line has anything to show at all — used to
 * gate the "Deposit required — details at checkout" generic fallback line in the page. */
export function hasDepositTerms(input: DepositPreviewInput): boolean {
  return !!input.depositEnabled && !!input.depositType;
}

/**
 * S8 (Gate G2, docs/briefs/WAVE3_SCHEMA_PROPOSALS.md, ledger row 102) — property check-in/out
 * prose ("Check-in 15:00 · Check-out 11:00", or just one side when only that one is declared).
 * Returns null when NEITHER is set (§13 — nothing to state; extends the same either-bound-present
 * shape `formatStartWindow` already uses above).
 */
export function formatCheckInOut(
  checkInTime: string | null | undefined,
  checkOutTime: string | null | undefined,
): string | null {
  const hasIn = !!checkInTime;
  const hasOut = !!checkOutTime;
  if (!hasIn && !hasOut) return null;
  if (hasIn && hasOut) return `Check-in ${checkInTime} · Check-out ${checkOutTime}`;
  if (hasIn) return `Check-in ${checkInTime}`;
  return `Check-out ${checkOutTime}`;
}

/**
 * S8 — amenities list, NULL-vs-[] preserved by the caller (this helper only decides whether
 * there is anything to RENDER): a `null`/`undefined`/empty array all mean "nothing to show" here,
 * matching every other `has*`-style predicate in this module (§13 — an owner who cleared their
 * amenities list renders identically to one who never captured it; the DISTINCTION lives only in
 * the stored row, not in what the traveler sees, since there is nothing honest to say about an
 * empty list either way).
 */
export function hasAmenities(amenities: string[] | null | undefined): boolean {
  return Array.isArray(amenities) && amenities.length > 0;
}
