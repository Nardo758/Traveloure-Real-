/**
 * FB-1 step 5d — the Kyoto busy-bus day (decision-maker Leon, Oct 19, 2026 — ledger `2026-10-19-fb1-busy-bus`). PURE.
 *
 * A day is a busy day for Kyoto buses when it is, in this order of naming:
 *   · in New Year (Dec 29 – Jan 3), Golden Week (Apr 29 – May 5) or Obon (Aug 13 – 16) — fixed spans, every year;
 *   · a Japan national holiday, or a substitute holiday, from the committed Cabinet Office list
 *     (`server/data/japan-holidays.json`) — both read "national holiday";
 *   · a Saturday or Sunday inside one of the market's peak windows. The windows are ADMIN CONFIG with no code
 *     default (`platform_settings.season_windows_<market>`, shared with SH-1's "In season" badge): no row ⇒ no window,
 *     so the weekend reason is off until dates are entered.
 * Nothing else: a weekday outside these, a day the list does not cover, or a plan whose dates are not confirmed carries
 * no flag — never a guess (§13).
 *
 * Both tiers get the day line. The routed bus-leg line is HELD until a router can name a bus (ruling 1): no stored leg
 * mode says "bus" today (`normalizeLegMode` folds bus into transit, and OSRM answers no transit).
 */

import { OPERATING_MARKETS } from "./operating-markets";

export type BusyBusReason = "New Year" | "Golden Week" | "Obon" | "national holiday" | "peak season weekend";

/**
 * Marketing's day line, word for word (FOUNDER WORDING REVIEW on the PR). The city is the market's own name from
 * `OPERATING_MARKETS` (`busyBusCityName`), carried on the plancard day — never a literal.
 */
export function busyBusDayLine(day: { reason: BusyBusReason; cityName: string }): string {
  return `Busy day for ${day.cityName} buses (${day.reason}). Leave extra time for any bus legs today.`;
}

/** The markets the flag runs in: the holiday list is Japan's, and Kyoto is the market the rulings name. */
export const BUSY_BUS_MARKETS = ["kyoto"] as const;

/** The market's city name from the operating-markets data, or null for a market it does not carry. */
export function busyBusCityName(market: string): string | null {
  return OPERATING_MARKETS.find((m) => m.marketKey === market)?.cityName ?? null;
}

export interface JapanHoliday {
  date: string;
  name: string;
  kind: "national" | "substitute";
}

export interface SeasonWindow {
  from: string;
  to: string;
}

const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const isCalendarDate = (v: unknown): v is string =>
  typeof v === "string" && ISO_DATE.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

/** The fixed spans, as inclusive "MM-DD" bounds; New Year wraps the year. */
const FIXED_SPANS: ReadonlyArray<{ reason: BusyBusReason; from: string; to: string }> = [
  { reason: "New Year", from: "12-29", to: "01-03" },
  { reason: "Golden Week", from: "04-29", to: "05-05" },
  { reason: "Obon", from: "08-13", to: "08-16" },
];

function inSpan(md: string, from: string, to: string): boolean {
  return from <= to ? md >= from && md <= to : md >= from || md <= to;
}

/**
 * Pure. Why the day is busy for buses, or null. `holidays` is the committed list; `windows` the market's peak windows
 * (empty when the admin has entered none).
 */
export function busyBusReason(dateIso: string, holidays: readonly JapanHoliday[], windows: readonly SeasonWindow[]): BusyBusReason | null {
  if (!isCalendarDate(dateIso)) return null;
  const md = dateIso.slice(5, 10);
  for (const s of FIXED_SPANS) if (inSpan(md, s.from, s.to)) return s.reason;
  if (holidays.some((h) => h.date === dateIso)) return "national holiday";
  const weekday = new Date(`${dateIso}T00:00:00Z`).getUTCDay();
  if ((weekday === 0 || weekday === 6) && windows.some((w) => dateIso >= w.from && dateIso <= w.to)) return "peak season weekend";
  return null;
}

// ── the season windows setting (shared with SH-1's "In season" badge) ────────────────────────────

export const SEASON_WINDOWS_SETTING_PREFIX = "season_windows_";
export const seasonWindowsSettingKey = (market: string) => `${SEASON_WINDOWS_SETTING_PREFIX}${market}`;
/** The most windows one market may hold. */
export const SEASON_WINDOWS_MAX = 4;
export const SEASON_WINDOWS_HELP =
  'Peak windows for this city, as JSON: [{"from":"YYYY-MM-DD","to":"YYYY-MM-DD"}]. Empty means none — weekends are not flagged until dates are entered.';

/** The refusal for a value an admin tries to save, or null when it is a valid list. */
export function seasonWindowsRefusal(value: unknown): string | null {
  let parsed: unknown;
  try {
    parsed = typeof value === "string" ? JSON.parse(value) : null;
  } catch {
    return "season windows must be a JSON array of {from, to} dates";
  }
  if (!Array.isArray(parsed)) return "season windows must be a JSON array of {from, to} dates";
  if (parsed.length > SEASON_WINDOWS_MAX) return `at most ${SEASON_WINDOWS_MAX} windows`;
  for (const w of parsed) {
    const from = (w as any)?.from;
    const to = (w as any)?.to;
    if (!w || typeof w !== "object" || Object.keys(w).some((k) => k !== "from" && k !== "to")) return "each window is {from, to}";
    if (!isCalendarDate(from) || !isCalendarDate(to)) return `not a date: ${JSON.stringify(w)}`;
    if (from > to) return `from is after to: ${JSON.stringify(w)}`;
  }
  return null;
}

/**
 * The refusal for saving `settingKey`, or null. A key outside the `season_windows_` prefix is not this setting's
 * (null); a key under it must name an operating market and carry a valid list.
 */
export function seasonWindowsSettingRefusal(settingKey: string, value: unknown): string | null {
  if (!settingKey.startsWith(SEASON_WINDOWS_SETTING_PREFIX)) return null;
  const market = settingKey.slice(SEASON_WINDOWS_SETTING_PREFIX.length);
  if (!OPERATING_MARKETS.some((m) => m.marketKey === market)) return `not an operating market: ${market}`;
  return seasonWindowsRefusal(value);
}

/** The stored windows. Absent, unreadable or invalid ⇒ none (no code default). */
export function seasonWindows(stored: string | null | undefined): SeasonWindow[] {
  if (typeof stored !== "string" || seasonWindowsRefusal(stored) !== null) return [];
  return (JSON.parse(stored) as SeasonWindow[]).map((w) => ({ from: w.from, to: w.to }));
}
