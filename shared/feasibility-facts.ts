/**
 * FD-3 — FEASIBILITY FACTS, the pure half (decision-maker rulings, Oct 10, 2026; ledger
 * `2026-10-10-fd3-feasibility`; brief docs/planning/briefs/fd-3-feasibility.md).
 *
 * Two STRUCTURED operational facts and the ONE admission rule every writer of them calls (§18 rule 1):
 *   · `last_admission` — the latest entry time per weekday, optionally only within a seasonal range;
 *   · `last_service`   — an operator's last departure on a line or at a station, per weekday, valid
 *                        between two dates (sub-need `transport.local.last_service`).
 * Both are written ONLY from an official source (an official crawled page, or an expert citing one);
 * neither is ever parsed from free-text hours (ruling 1). Both carry `source_class = public` and
 * `reuse_class = link_only` (rulings 1/3) whatever the writer.
 *
 * No db, no clock: every date is passed in.
 */

import { PAGE_READ_ORIGINS } from "./content-facts";

// FB-1 step 5b (ledger `2026-10-19-fb1-closed-dates`): `closed_dates` — the dates a place states it is closed,
// admitted on the `last_admission` rule (decision-maker, Oct 19, 2026).
// FB-1 step 5c (ledger `2026-10-19-fb1-timed-entry`): `timed_entry_required` — entry needs a timed slot reserved on the
// official site, optionally with how many days ahead slots open; admitted on the same rule.
export const FEASIBILITY_FACT_TYPES = ["last_admission", "last_service", "closed_dates", "timed_entry_required"] as const;
export type FeasibilityFactType = (typeof FEASIBILITY_FACT_TYPES)[number];

export function isFeasibilityFactType(v: unknown): v is FeasibilityFactType {
  return typeof v === "string" && (FEASIBILITY_FACT_TYPES as readonly string[]).includes(v);
}

/**
 * The writers a feasibility fact may come from (ruling 1): an official page read (the per-plan crawl or SS-1b's
 * market-level refresh, `PAGE_READ_ORIGINS`), or an expert.
 */
const FEASIBILITY_ORIGINS = new Set<string>([...PAGE_READ_ORIGINS, "expert_nugget"]);

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const MMDD = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** "HH:MM" (24h) → minutes after midnight, else null. */
export function hhmmMinutes(v: unknown): number | null {
  if (typeof v !== "string" || !HHMM.test(v)) return null;
  return Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
}

// ── last_admission ───────────────────────────────────────────────────────────────────────────────

export interface LastAdmissionValue {
  /** Weekday 0 (Sunday) … 6 → "HH:MM", or null when that day states no last entry. At least one is set. */
  byWeekday: Partial<Record<"0" | "1" | "2" | "3" | "4" | "5" | "6", string | null>>;
  /** When the times apply only in part of the year: inclusive "MM-DD" bounds (may wrap the new year). */
  season?: { from: string; to: string } | null;
}

/** Pure. The structured value, or null when it does not parse — never a repaired guess (§13). */
export function parseLastAdmission(v: unknown): LastAdmissionValue | null {
  const by = (v as any)?.byWeekday;
  if (!by || typeof by !== "object" || Array.isArray(by)) return null;
  const out: LastAdmissionValue["byWeekday"] = {};
  let any = false;
  for (const [k, t] of Object.entries(by)) {
    if (!/^[0-6]$/.test(k)) return null;
    if (t === null) { out[k as keyof typeof out] = null; continue; }
    if (hhmmMinutes(t) === null) return null;
    out[k as keyof typeof out] = t as string;
    any = true;
  }
  if (!any) return null;
  const season = (v as any)?.season;
  if (season != null) {
    if (typeof season !== "object" || !MMDD.test(String(season.from ?? "")) || !MMDD.test(String(season.to ?? ""))) return null;
    return { byWeekday: out, season: { from: season.from, to: season.to } };
  }
  return { byWeekday: out };
}

export function inSeason(season: { from: string; to: string } | null | undefined, dateIso: string): boolean {
  if (!season) return true;
  const md = dateIso.slice(5, 10);
  return season.from <= season.to ? md >= season.from && md <= season.to : md >= season.from || md <= season.to;
}

/** Pure. The last-entry minute for that calendar date, or null when none applies (out of season, unstated). */
export function lastAdmissionMinutes(v: LastAdmissionValue, dateIso: string): number | null {
  if (!ISO_DATE.test(dateIso) || !inSeason(v.season, dateIso)) return null;
  const weekday = new Date(`${dateIso}T00:00:00Z`).getUTCDay();
  return hhmmMinutes(v.byWeekday[String(weekday) as keyof LastAdmissionValue["byWeekday"]] ?? null);
}

/**
 * P0-e item 2 (decision-maker, Oct 12, 2026; ledger `2026-10-12-p0e-findings-and-gaps`): the last-entry
 * minute for ONE date from every stored candidate, in precedence order — the first whose season covers the
 * date and states that weekday. The loader used to keep only the first fact, so a winter-only fact hid the
 * summer one on a summer date. Pure; null ⇒ nothing applies (§13).
 */
export function lastAdmissionForDate(candidates: readonly unknown[], dateIso: string): number | null {
  for (const c of candidates) {
    const v = parseLastAdmission(c);
    const m = v ? lastAdmissionMinutes(v, dateIso) : null;
    if (m !== null) return m;
  }
  return null;
}

/**
 * P0-e item 2: an official `hours` fact may carry `season {from: "MM-DD", to: "MM-DD"}` inside its value
 * (no migration). Pure; a missing season covers every date; a malformed one covers none, never a guess.
 */
export function hoursSeason(value: unknown): { from: string; to: string } | null | "invalid" {
  const season = (value as any)?.season;
  if (season == null) return null;
  if (typeof season !== "object" || !MMDD.test(String(season.from ?? "")) || !MMDD.test(String(season.to ?? ""))) return "invalid";
  return { from: season.from, to: season.to };
}

/**
 * Pure. The hours fact for ONE date from the candidates in precedence order (official first, the Places
 * weekly list last): the first whose season covers the date. None ⇒ null (that stop's hours are unchecked).
 */
export function hoursFactForDate<T extends { season?: { from: string; to: string } | null }>(candidates: readonly T[], dateIso: string | null): T | null {
  for (const c of candidates) {
    if (!c.season) return c;
    if (dateIso && ISO_DATE.test(dateIso) && inSeason(c.season, dateIso)) return c;
  }
  return null;
}

// ── last_service ─────────────────────────────────────────────────────────────────────────────────

export interface LastServiceValue {
  operator: string;
  /** The line, the station, or both — at least one. */
  line: string | null;
  station: string | null;
  direction?: string | null;
  /** The last departure, "HH:MM". A departure after midnight is written as stated ("00:20"). */
  lastDeparture: string;
  /** Weekdays it applies to (0 = Sunday). */
  weekdays: number[];
  /** Inclusive validity, "YYYY-MM-DD". */
  validFrom: string;
  validTo: string;
}

export function parseLastService(v: unknown): LastServiceValue | null {
  const x = v as any;
  const str = (s: unknown) => (typeof s === "string" && s.trim() ? s.trim().slice(0, 120) : null);
  const operator = str(x?.operator);
  const line = str(x?.line);
  const station = str(x?.station);
  if (!operator || (!line && !station)) return null;
  if (hhmmMinutes(x?.lastDeparture) === null) return null;
  if (!Array.isArray(x?.weekdays) || !x.weekdays.length || !x.weekdays.every((d: unknown) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6)) return null;
  if (!ISO_DATE.test(String(x?.validFrom ?? "")) || !ISO_DATE.test(String(x?.validTo ?? "")) || x.validFrom > x.validTo) return null;
  return {
    operator,
    line,
    station,
    direction: str(x?.direction),
    lastDeparture: x.lastDeparture,
    weekdays: Array.from(new Set<number>(x.weekdays)).sort((a, b) => a - b),
    validFrom: x.validFrom,
    validTo: x.validTo,
  };
}

/**
 * Pure. The last departure that applies on that date, as minutes on the SERVICE day — a departure
 * before 04:00 belongs to the previous evening's service ("00:20" ⇒ 24:20) — or null when the fact
 * does not apply that day.
 */
export function lastServiceMinutes(v: LastServiceValue, dateIso: string): number | null {
  if (!ISO_DATE.test(dateIso) || dateIso < v.validFrom || dateIso > v.validTo) return null;
  if (!v.weekdays.includes(new Date(`${dateIso}T00:00:00Z`).getUTCDay())) return null;
  const m = hhmmMinutes(v.lastDeparture);
  return m === null ? null : m < SERVICE_DAY_START_MIN ? m + 24 * 60 : m;
}

/** A departure before this minute is read as the previous evening's service. */
export const SERVICE_DAY_START_MIN = 4 * 60;

// ── closed_dates (FB-1 step 5b) ──────────────────────────────────────────────────────────────────

/** The dates a place is closed, as inclusive "YYYY-MM-DD" ranges; a single day is a one-day range. At least one. */
export interface ClosedDatesValue {
  ranges: Array<{ from: string; to: string }>;
}

/** The most ranges one fact may carry — a page listing more is read as several facts, never truncated. */
export const CLOSED_DATES_MAX_RANGES = 60;

/** A real calendar date (rejects "2027-02-30"). */
function isCalendarDate(v: unknown): v is string {
  if (typeof v !== "string" || !ISO_DATE.test(v)) return false;
  return new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
}

/** Pure. The structured value, or null when it does not parse — never a repaired guess (§13). Ranges are sorted. */
export function parseClosedDates(v: unknown): ClosedDatesValue | null {
  const raw = (v as any)?.ranges;
  if (!Array.isArray(raw) || !raw.length || raw.length > CLOSED_DATES_MAX_RANGES) return null;
  const ranges: ClosedDatesValue["ranges"] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object" || !isCalendarDate(r.from) || !isCalendarDate(r.to) || r.from > r.to) return null;
    ranges.push({ from: r.from, to: r.to });
  }
  ranges.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : 1));
  return { ranges };
}

/** Pure. Is the place closed on that date? */
export function closedOnDate(v: ClosedDatesValue, dateIso: string): boolean {
  return ISO_DATE.test(dateIso) && v.ranges.some((r) => dateIso >= r.from && dateIso <= r.to);
}

/** Pure. The day after the fact's last closed date, "YYYY-MM-DD" — midnight of it, in the plan's zone, is the expiry. */
export function closedDatesExpiryDay(v: ClosedDatesValue): string {
  const last = v.ranges.reduce((m, r) => (r.to > m ? r.to : m), v.ranges[0].to);
  const d = new Date(`${last}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/**
 * Pure. Does the page's own quote state this date? "2026-12-29" is found as written ISO, "2026/12/29", "2026.12.29",
 * "12/29", "12月29日", "2026年12月29日", "December 29", "Dec 29", "29 December", "29 Dec". A date the quote does not
 * state is refused: the model may not supply a date the page did not print.
 */
export function dateAppearsIn(quote: string, iso: string): boolean {
  if (!isCalendarDate(iso)) return false;
  const y = iso.slice(0, 4);
  const mo = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  const q = quote.normalize("NFKC").toLowerCase().replace(/\s+/g, " ");
  const mm = String(mo).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  const long = MONTHS[mo - 1];
  const short = long.slice(0, 3);
  const numeric = [`${y}-${mm}-${dd}`, `${y}/${mo}/${d}`, `${y}/${mm}/${dd}`, `${y}.${mo}.${d}`, `${y}.${mm}.${dd}`, `${mo}/${d}`, `${mm}/${dd}`, `${mo}月${d}日`];
  // A numeric form must not be part of a longer number ("1/29" inside "11/29" or "1/290").
  const numericHit = numeric.some((f) => new RegExp(`(^|[^0-9])${f.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}($|[^0-9])`).test(q));
  if (numericHit) return true;
  const words = [`${long} ${d}`, `${short} ${d}`, `${short}. ${d}`, `${d} ${long}`, `${d} ${short}`];
  return words.some((f) => new RegExp(`(^|[^0-9a-z])${f.replace(/\./g, "\\.")}($|[^0-9])`).test(q));
}

// ── timed_entry_required (FB-1 step 5c) ─────────────────────────────────────────────────────────

/** Entry needs a timed slot reserved on the official site; `opensDaysAhead` only when the page states it. No time. */
export interface TimedEntryRequiredValue {
  required: true;
  opensDaysAhead?: number;
}

/** Pure. The structured value, or null when it does not parse — never a repaired guess (§13). */
export function parseTimedEntryRequired(v: unknown): TimedEntryRequiredValue | null {
  if ((v as any)?.required !== true) return null;
  const n = (v as any)?.opensDaysAhead;
  if (n == null) return { required: true };
  if (!Number.isInteger(n) || n < 1 || n > 400) return null;
  return { required: true, opensDaysAhead: n };
}

/** Pure. Does the quote print this whole number (never as part of a longer one)? */
export function numberAppearsIn(quote: string, n: number): boolean {
  return new RegExp(`(^|[^0-9])${n}($|[^0-9])`).test(quote.normalize("NFKC"));
}

// ── the time in the quote ────────────────────────────────────────────────────────────────────────

/**
 * Pure. Does the page's own quote state this time? "16:30" is found as "16:30", "16時30分", or the
 * 12-hour "4:30" (with or without pm). A structured time the quote does not state is refused: the
 * model may not supply a number the page did not print.
 */
export function timeAppearsIn(quote: string, hhmm: string): boolean {
  const m = hhmmMinutes(hhmm);
  if (m === null) return false;
  const h = Math.floor(m / 60);
  const mi = String(m % 60).padStart(2, "0");
  const q = quote.normalize("NFKC");
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const forms = [`${String(h).padStart(2, "0")}:${mi}`, `${h}:${mi}`, `${h12}:${mi}`, `${h}時${mi}分`, `${h}時${Number(mi)}分`];
  if (mi === "00") forms.push(`${h}時`, `${h12} ${h >= 12 ? "pm" : "am"}`, `${h12}${h >= 12 ? "pm" : "am"}`);
  const lower = q.toLowerCase();
  return forms.some((f) => lower.includes(f.toLowerCase()));
}

// ── THE ONE ADMISSION RULE ───────────────────────────────────────────────────────────────────────

export type FeasibilityRefusal = "not_feasibility_type" | "bad_value" | "not_official" | "no_source_url" | "origin_not_allowed" | "time_not_in_quote" | "date_not_in_quote" | "days_not_in_quote";

/** Pure. The structured value of a feasibility fact by its type, or null. */
export function parseFeasibilityValue(factType: FeasibilityFactType, v: unknown): LastAdmissionValue | LastServiceValue | ClosedDatesValue | TimedEntryRequiredValue | null {
  if (factType === "last_admission") return parseLastAdmission(v);
  if (factType === "last_service") return parseLastService(v);
  if (factType === "timed_entry_required") return parseTimedEntryRequired(v);
  return parseClosedDates(v);
}

/**
 * Pure. May this draft be stored as a feasibility fact? Rulings 1/3/5: the value parses; the writer is an
 * official crawled page or an expert; the license is `official`; there is an https source url. When a
 * quote travels with the value (the crawled path), every structured time must appear in it — and for
 * `closed_dates`, every date that bounds a range (FB-1 step 5b).
 */
export function admitFeasibilityFact(d: {
  factType: string;
  value: unknown;
  origin: string | null | undefined;
  license: string | null | undefined;
  sourceUrl: string | null | undefined;
}): { ok: true } | { ok: false; reason: FeasibilityRefusal } {
  if (!isFeasibilityFactType(d.factType)) return { ok: false, reason: "not_feasibility_type" };
  if (!d.origin || !FEASIBILITY_ORIGINS.has(d.origin)) return { ok: false, reason: "origin_not_allowed" };
  if (d.license !== "official") return { ok: false, reason: "not_official" };
  if (typeof d.sourceUrl !== "string" || !/^https:\/\/\S+$/i.test(d.sourceUrl)) return { ok: false, reason: "no_source_url" };
  const quote = typeof (d.value as any)?.quote === "string" ? ((d.value as any).quote as string) : null;
  if (d.factType === "last_admission") {
    const v = parseLastAdmission(d.value);
    if (!v) return { ok: false, reason: "bad_value" };
    if (quote !== null) {
      for (const t of Object.values(v.byWeekday)) if (t && !timeAppearsIn(quote, t)) return { ok: false, reason: "time_not_in_quote" };
    }
    return { ok: true };
  }
  if (d.factType === "timed_entry_required") {
    const v = parseTimedEntryRequired(d.value);
    if (!v) return { ok: false, reason: "bad_value" };
    if (quote !== null && v.opensDaysAhead != null && !numberAppearsIn(quote, v.opensDaysAhead)) return { ok: false, reason: "days_not_in_quote" };
    return { ok: true };
  }
  if (d.factType === "closed_dates") {
    const v = parseClosedDates(d.value);
    if (!v) return { ok: false, reason: "bad_value" };
    if (quote !== null) {
      for (const r of v.ranges) for (const day of r.from === r.to ? [r.from] : [r.from, r.to]) if (!dateAppearsIn(quote, day)) return { ok: false, reason: "date_not_in_quote" };
    }
    return { ok: true };
  }
  const v = parseLastService(d.value);
  if (!v) return { ok: false, reason: "bad_value" };
  if (quote !== null && !timeAppearsIn(quote, v.lastDeparture)) return { ok: false, reason: "time_not_in_quote" };
  return { ok: true };
}

/** Rulings 1/3: the tag pair a feasibility fact is born with, whatever its writer. */
export const FEASIBILITY_FACT_TAGS = { sourceClass: "public" as const, reuseClass: "link_only" as const };
