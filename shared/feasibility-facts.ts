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

export const FEASIBILITY_FACT_TYPES = ["last_admission", "last_service"] as const;
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

function inSeason(season: { from: string; to: string } | null | undefined, dateIso: string): boolean {
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

export type FeasibilityRefusal = "not_feasibility_type" | "bad_value" | "not_official" | "no_source_url" | "origin_not_allowed" | "time_not_in_quote";

/**
 * Pure. May this draft be stored as a feasibility fact? Rulings 1/3/5: the value parses; the writer is an
 * official crawled page or an expert; the license is `official`; there is an https source url. When a
 * quote travels with the value (the crawled path), every structured time must appear in it.
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
  const v = parseLastService(d.value);
  if (!v) return { ok: false, reason: "bad_value" };
  if (quote !== null && !timeAppearsIn(quote, v.lastDeparture)) return { ok: false, reason: "time_not_in_quote" };
  return { ok: true };
}

/** Rulings 1/3: the tag pair a feasibility fact is born with, whatever its writer. */
export const FEASIBILITY_FACT_TAGS = { sourceClass: "public" as const, reuseClass: "link_only" as const };
