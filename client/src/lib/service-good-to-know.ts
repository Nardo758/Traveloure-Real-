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
