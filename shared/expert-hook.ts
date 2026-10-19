/**
 * FB-1 expert hook (decision-maker Leon, Oct 18, 2026 — ledger `2026-10-18-fb1-expert-hook`). PURE.
 *
 * A locked "With local picks" section under each day of a FREE plan, in the owner's slip only — never on a share rail,
 * a Ready-Made preview or the Trip Card. Copy is Marketing's, word for word:
 *   switch off → OFF line, no button;
 *   switch on  → ON line naming the city, and the button — only when the city's expert chooser has someone in it
 *                (decided server-side; `canAsk`);
 *   either way, when the day has FD-5 counts (`localTeaserLine`) that line replaces the plain line.
 * The per-city switch is `platform_settings.expert_hook_cities`: a JSON array of `OPERATING_MARKETS` keys, empty by
 * default, edited by hand in admin beside the ticker's beta cities.
 *
 * The in-season line "[n] in-season additions for Day [d] · See them" reads a server count that is 0 until FB-1 step 8
 * adds the official-calendar event sources, so it draws nothing today; zero is never drawn.
 */
import { OPERATING_MARKETS } from "./operating-markets";
import { localTeaserLine, type LocalTeaser } from "./free-draft-cap";

export const EXPERT_HOOK_CITIES_SETTING = "expert_hook_cities";
export const EXPERT_HOOK_CITIES_HELP = "Switch a city on by hand, once its expert chooser has someone in it.";

export const EXPERT_HOOK_TITLE = "With local picks";
export const EXPERT_HOOK_OFF_LINE = "With local picks, this day gets notes on timing, crowds and food near its stops.";
export const expertHookOnLine = (cityName: string) =>
  `A ${cityName} local can add notes on timing, crowds and food near this day’s stops.`;
export const EXPERT_HOOK_BUTTON = "Want a local to tune this day?";
/** Singular at one, plural otherwise — the FD-5 teaser line's rule (`localTeaserLine`). */
export const inSeasonAdditionsLine = (count: number, day: number) =>
  `${count} in-season addition${count === 1 ? "" : "s"} for Day ${day}`;
export const IN_SEASON_SEE_THEM = "See them";

/** The refusal for a value an admin tries to save, or null when it is a valid list. */
export function expertHookCitiesRefusal(value: unknown): string | null {
  let parsed: unknown;
  try {
    parsed = typeof value === "string" ? JSON.parse(value) : null;
  } catch {
    return `${EXPERT_HOOK_CITIES_SETTING} must be a JSON array of market keys`;
  }
  if (!Array.isArray(parsed)) return `${EXPERT_HOOK_CITIES_SETTING} must be a JSON array of market keys`;
  const seen = new Set<string>();
  for (const key of parsed) {
    if (typeof key !== "string" || !OPERATING_MARKETS.some((m) => m.marketKey === key)) return `unknown market: ${String(key)}`;
    if (seen.has(key)) return `duplicate market: ${key}`;
    seen.add(key);
  }
  return null;
}

/** The switched-on market keys. Absent, unreadable or garbage ⇒ none (the default is empty). Unknown keys dropped. */
export function expertHookCities(stored: string | null | undefined): string[] {
  if (typeof stored !== "string") return [];
  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((k, i): k is string =>
      typeof k === "string" && parsed.indexOf(k) === i && OPERATING_MARKETS.some((m) => m.marketKey === k));
  } catch {
    return [];
  }
}

/** What the plancard carries for the owner of a free plan. `canAsk` is false whenever the switch is off. */
export interface ExpertHook {
  switchOn: boolean;
  cityName: string | null;
  canAsk: boolean;
}

/** One day's hook section: the line, and whether the button is drawn. */
export function expertHookForDay(hook: ExpertHook, teaser: LocalTeaser | null | undefined): { line: string; button: boolean } {
  const counts = localTeaserLine(teaser);
  const on = hook.switchOn && !!hook.cityName;
  const plain = on ? expertHookOnLine(hook.cityName!) : EXPERT_HOOK_OFF_LINE;
  return { line: counts ?? plain, button: on && hook.canAsk };
}

/** The in-season line, or null when there is nothing to say (zero, absent, or no day). */
export function inSeasonLine(count: number | null | undefined, day: number | null | undefined): string | null {
  const n = Math.floor(Number(count ?? 0));
  if (!Number.isFinite(n) || n <= 0 || !day) return null;
  return inSeasonAdditionsLine(n, day);
}

/**
 * The in-season count for one day (FB-1 step 8 feeds it): the stops or evenings in the latest run's in-season version
 * for that day that the draft does not already hold. Transport never counts (a train is how you get there, not an
 * addition). "Already held" is the same place, or failing a place id the same title, ignoring case.
 */
export interface InSeasonCandidate { placeId?: string | null; title: string; transport?: boolean }
export function countInSeasonAdditions(version: readonly InSeasonCandidate[], plan: readonly InSeasonCandidate[]): number {
  const key = (c: InSeasonCandidate) => (c.placeId ? `p:${c.placeId}` : `t:${c.title.trim().toLowerCase()}`);
  const held = new Set(plan.map(key));
  let n = 0;
  for (const c of version) {
    if (c.transport) continue;
    if (held.has(key(c))) continue;
    held.add(key(c));
    n++;
  }
  return n;
}
