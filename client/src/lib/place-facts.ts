/**
 * The slip's lines for an item's facts (A5; ledger `2026-09-29-a5-draft-open-set`; content sourcing
 * brief §3: a fact is never shown without its provenance; surface spec v1.2 §3 — `itemFactsLine` and
 * `itemPlaceLine` below replaced `itemFactLine`/`itemAddressLine` in step 1). Pure. The facts and their provenance
 * lines are the SERVER's (`placeFacts` on the plancard read); this only picks the words to show.
 *
 * §13: hours are shown for the plan DAY's own weekday, and only when the day has a date — a plan
 * with no dates has no weekday to name, so the hours line is omitted rather than guessed.
 */
import { canonicalAreaLine, containsCjk } from "@shared/place-address";
import type { FactView } from "@shared/content-facts";
import { hoursFactForDate, lastAdmissionForDate } from "@shared/feasibility-facts";
import { clockLabel, rowClosingMinute } from "@shared/optimizer-lead";
import { unverifiedAreaText } from "@shared/ai-place-text";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The map pin's location line: the same rule as the row's unattributed text (AI ⇒ ward/area only). */
export function pinLocationText(location: string | null | undefined, origin?: string | null): string | null {
  return origin === "ai" ? unverifiedAreaText(location) : (location ?? "").trim() || null;
}

/**
 * The ward/area cut now lives in `@shared/ai-place-text` — the ONE rule that storage (R-w, ledger
 * `2026-10-03-rw-ai-place-text`) and display share (§18 rule 1). Re-exported for this module's readers.
 */
export { unverifiedAreaText };

// ── Surface spec v1.2 §3 (step 1, ledger `2026-10-03-surface-step1-item-row`) ───────────────────

const WKD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "2 Oct" — the day a fact was checked. Smoke 9 S9-6 (ledger `2026-10-04-smoke9-addendum`): the day is
 * read in the PLAN's zone (`trips.timezone`, LD 30), so a fact checked at 23:30 UTC on 2 Oct reads
 * "3 Oct" on a Kyoto plan. A plan with no zone (or an unknown one) keeps the UTC day — the instant the
 * server stamped — rather than the viewer's own zone, which would be a guess (§13). Null ⇒ unknown.
 */
export function factCheckedLabel(checkedAt: string | null | undefined, timeZone?: string | null): string | null {
  const ms = checkedAt ? Date.parse(checkedAt) : NaN;
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone, day: "numeric", month: "numeric" }).formatToParts(d);
      const day = Number(parts.find((p) => p.type === "day")?.value);
      const month = Number(parts.find((p) => p.type === "month")?.value);
      if (Number.isInteger(day) && month >= 1 && month <= 12) return `${day} ${MON[month - 1]}`;
    } catch {
      /* an unknown zone falls back to the UTC day below */
    }
  }
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}

/**
 * "3 Oct" out of the server's own provenance line ("Google Maps · checked 3 Oct 2026"), for a fact
 * read before `checkedAt` was on the wire (a payload from an older build). The server's words, never
 * a guessed date; no "checked" segment ⇒ null.
 */
export function provenanceCheckedLabel(provenance: string | null | undefined): string | null {
  const m = /checked (\d{1,2}) ([A-Za-z]{3})/.exec(provenance ?? "");
  if (!m) return null;
  const mon = MON.find((x) => x.toLowerCase() === m[2].toLowerCase());
  return mon ? `${Number(m[1])} ${mon}` : null;
}

/** The source's name as the server wrote it on the provenance line ("Google Maps", "A local expert", …). */
function sourceName(provenance: string): string {
  const i = provenance.indexOf(" · ");
  return (i >= 0 ? provenance.slice(0, i) : provenance).trim();
}

/**
 * Pure. The `ItemRow` facts line, VERBATIM per spec §3: "<Wkd> · <hours> · <source> · checked <d Mon>",
 * e.g. "Wed · Open 24 hours · Google Maps · checked 2 Oct". Only the plan DAY's own weekday is read
 * (§13: no date, no weekday — the line is omitted rather than guessed), and only from an hours fact.
 * No traveler surface reads an expired fact (CS-1 item 2), so no suffix follows. Null when there is nothing true to say.
 */
/**
 * P0-e addition 7: the hours fact a row shows for its date — the first hours fact (the server ranks
 * official before Google) whose stated season covers the date; a fact with no season always does.
 */
export function shownHoursFact(facts: readonly FactView[] | undefined, dateIso: string | null): FactView | null {
  const hours = (facts ?? [])
    .filter((f) => f.factType === "hours" && Array.isArray(f.value?.weekdayDescriptions))
    .map((f) => ({ f, season: f.origin === "places_api" ? null : seasonOf(f.value?.season) }));
  return hoursFactForDate(hours, dateIso)?.f ?? null;
}

function seasonOf(v: unknown): { from: string; to: string } | null {
  const x = v as { from?: unknown; to?: unknown } | null | undefined;
  return x && typeof x.from === "string" && typeof x.to === "string" ? { from: x.from, to: x.to } : null;
}

/** "17:10" or "5:10 PM" → minutes after midnight; anything else ⇒ null. */
function rowMinutes(t: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec((t ?? "").trim());
  if (!m) return null;
  let h = Number(m[1]);
  const mi = Number(m[2]);
  const mer = m[3]?.toUpperCase();
  if (mer === "PM" && h < 12) h += 12;
  if (mer === "AM" && h === 12) h = 0;
  return h <= 23 && mi <= 59 ? h * 60 + mi : null;
}

/**
 * P0-e addition 7 (decision-maker, Oct 12, 2026): the row's closing warning — the planned time against
 * the closing time of the hours fact the row SHOWS, whatever its source, named with that source:
 * "Closes 5:00 PM · Google Maps · checked 4 Oct", or "Closes 5:00 PM · Ginkaku-ji
 * official site · checked 12 Oct" when the official fact is the one shown. A last-entry fact covering the
 * date is preferred: arriving after it reads "Last entry 4:30 PM · …". Otherwise warns when the stop is reached
 * after the day's last close, or open on arrival and closing before the visit ends (its end time, else
 * its duration). No shown fact, no time, or an unreadable line ⇒ null (§13).
 */
export function itemClosingWarning(
  facts: readonly FactView[] | undefined,
  dateIso: string | null,
  item: { time?: string | null; endTime?: string | null; durationMinutes?: number | null },
  timeZone?: string | null,
): { text: string; sourceUrl: string | null } | null {
  if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return null;
  const start = rowMinutes(item.time);
  if (start === null) return null;
  // P0-e item 2 (decision-maker, Oct 12, 2026): a last-entry fact covering the date is preferred — arriving
  // after it reads "Last entry 4:30 PM · …" (arriving AT it is still in). Otherwise the closing rule below.
  for (const f of facts ?? []) {
    if (f.factType !== "last_admission") continue;
    const last = lastAdmissionForDate([f.value], dateIso);
    if (last === null) continue;
    if (start <= last) break;
    return sourcedWarning(`Last entry ${clockLabel(last)}`, f, timeZone);
  }
  const hours = shownHoursFact(facts, dateIso);
  if (!hours) return null;
  const endClock = rowMinutes(item.endTime);
  const end =
    endClock !== null ? (endClock <= start ? endClock + 1440 : endClock)
      : item.durationMinutes != null && Number.isFinite(item.durationMinutes) && item.durationMinutes > 0 ? start + Math.round(item.durationMinutes)
        : null;
  const lines = Array.isArray(hours.value?.weekdayDescriptions) ? (hours.value.weekdayDescriptions as unknown[]).map(String) : [];
  const close = rowClosingMinute(lines, new Date(`${dateIso}T12:00:00Z`).getUTCDay(), start, end);
  if (close === null) return null;
  return sourcedWarning(`Closes ${clockLabel(close)}`, hours, timeZone);
}

/** FB-1 step 5c — Marketing's words (FOUNDER WORDING REVIEW on the PR). */
export const TIMED_ENTRY_LINE = "Entry needs a timed slot, reserved on the official site.";
export function timedEntryOpensLine(days: number): string {
  return `Slots open ${days} ${days === 1 ? "day" : "days"} ahead.`;
}

/**
 * FB-1 step 5c (ledger `2026-10-19-fb1-timed-entry`): the row's timed-entry warning, linked to the official site — the
 * fact the checker reads (flag-only). "Slots open N days ahead." only when the page stated it. No fact ⇒ null.
 */
export function itemTimedEntryWarning(facts: readonly FactView[] | undefined, timeZone?: string | null): { text: string; sourceUrl: string | null } | null {
  const f = (facts ?? []).find((x) => x.factType === "timed_entry_required" && x.value?.required === true);
  if (!f) return null;
  const raw: unknown = f.value?.opensDaysAhead;
  const n = typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : null;
  const lead = n !== null ? `${TIMED_ENTRY_LINE} ${timedEntryOpensLine(n)}` : TIMED_ENTRY_LINE;
  return sourcedWarning(lead, f, timeZone);
}

/**
 * 9b-c LB9 (ledger `2026-10-18-lb8-lb9-card-wiring`): the time a stop's leave-by measures against when the
 * planned start is too late — the SAME two facts `itemClosingWarning` reads above, never a second rule: a
 * last-entry fact covering the date wins; otherwise the shown hours' closing time for a stop reached after
 * the day's last close. "HH:MM" in the plan's zone, the kind naming which. Null when neither fact says
 * anything for the date (§13: no guessed limit).
 */
export function stopEntryLimit(
  facts: readonly FactView[] | undefined,
  dateIso: string | null,
  startTime: string | null | undefined,
): { time: string; kind: "last_entry" | "closing" } | null {
  if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return null;
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  for (const f of facts ?? []) {
    if (f.factType !== "last_admission") continue;
    const last = lastAdmissionForDate([f.value], dateIso);
    if (last !== null) return { time: hhmm(last), kind: "last_entry" };
  }
  const start = rowMinutes(startTime);
  if (start === null) return null;
  const hours = shownHoursFact(facts, dateIso);
  if (!hours) return null;
  const lines = Array.isArray(hours.value?.weekdayDescriptions) ? (hours.value.weekdayDescriptions as unknown[]).map(String) : [];
  const close = rowClosingMinute(lines, new Date(`${dateIso}T12:00:00Z`).getUTCDay(), start, null);
  return close === null ? null : { time: hhmm(close), kind: "closing" };
}

/** The warning's lead, then the fact's own source and check date, and its caveat when stale. */
function sourcedWarning(lead: string, fact: FactView, timeZone?: string | null): { text: string; sourceUrl: string | null } {
  const checked = factCheckedLabel(fact.checkedAt, timeZone) ?? provenanceCheckedLabel(fact.provenance);
  const parts = [lead, sourceName(fact.provenance)];
  if (checked) parts.push(`checked ${checked}`);
  return { text: parts.join(" · "), sourceUrl: fact.sourceUrl };
}

export function itemFactsLine(
  facts: readonly FactView[] | undefined,
  dateIso: string | null,
  timeZone?: string | null,
): { text: string; sourceUrl: string | null } | null {
  const hours = shownHoursFact(facts, dateIso);
  if (!hours || !dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return null;
  const days = Array.isArray(hours.value?.weekdayDescriptions) ? (hours.value.weekdayDescriptions as unknown[]).map(String) : [];
  const dow = new Date(`${dateIso}T12:00:00Z`).getUTCDay();
  const line = days.find((d) => d.startsWith(`${WEEKDAYS[dow]}:`));
  if (!line) return null;
  const hoursText = line.slice(WEEKDAYS[dow].length + 1).trim();
  if (!hoursText) return null;
  const checked = factCheckedLabel(hours.checkedAt, timeZone) ?? provenanceCheckedLabel(hours.provenance);
  const parts = [WKD[dow], hoursText, sourceName(hours.provenance)];
  if (checked) parts.push(`checked ${checked}`);
  return { text: parts.join(" · "), sourceUrl: hours.sourceUrl };
}

/**
 * Pure. The facts line split where the Main board colours it (ledger `2026-10-08-slip-main-rows`):
 * `lead` is the day and its hours ("Wed · 9:00 AM – 4:00 PM"), `source` the provenance that follows
 * ("Google Maps · checked 3 Oct"). It splits `itemFactsLine`'s own text — the words are never re-made.
 */
export function factsLineParts(text: string): { lead: string; source: string | null } {
  const parts = text.split(" · ");
  if (parts.length <= 2) return { lead: text, source: null };
  return { lead: parts.slice(0, 2).join(" · "), source: parts.slice(2).join(" · ") };
}

/**
 * Pure. The `ItemRow` PLACE line (spec §3; step-1 amendment R-ab). The order:
 *   1. a Google-checked (`places_api`) address fact — its WARD/AREA, with the Maps attribution. The
 *      area is the one the adapter derived from Google's `addressComponents` (`value.area`, smoke 8
 *      item 2); it is NEVER parsed from the formatted address, so a fact without one falls through;
 *   2. the item's location AS STORED — sanitising AI-written place text is a STORAGE rule (R-w, its own
 *      server lane), never a second client-side rewrite of it;
 *   3. nothing.
 */
export function itemPlaceLine(
  facts: readonly FactView[] | undefined,
  item: { location?: string | null },
  timeZone?: string | null,
): { text: string; provenance: string | null; checked: string | null; sourceUrl: string | null } | null {
  const fact = facts?.find((f) => f.factType === "address" && f.origin === "places_api");
  // R321 S11-10: the same canonical ward spelling facts-attach stores, so a cached fact reads alike.
  const area = typeof fact?.value?.area === "string" && fact.value.area.trim() ? canonicalAreaLine(fact.value.area) || null : null;
  if (fact && area) {
    return {
      text: area,
      provenance: sourceName(fact.provenance),
      checked: factCheckedLabel(fact.checkedAt, timeZone) ?? provenanceCheckedLabel(fact.provenance),
      sourceUrl: fact.sourceUrl,
    };
  }
  const stored = (item.location ?? "").trim();
  return stored ? { text: stored, provenance: null, checked: null, sourceUrl: null } : null;
}

/**
 * Smoke 10 S10-9 (ledger `2026-10-04-smoke10-fixes`): ONE format for a sourced line — the place line
 * reads exactly like the facts line: "<what> · <source> · checked <d Mon>". The part after the place's
 * own text, or "" when the line has no source (a stored location carries no provenance).
 */
export function sourcedLineSuffix(place: { provenance: string | null; checked: string | null }): string {
  if (!place.provenance) return "";
  return ` · ${place.provenance}${place.checked ? ` · checked ${place.checked}` : ""}`;
}

// ── Step 6 R-ap: the ItemSheet's facts (ledger `2026-10-04-step6-trip-card`) ─────────────────────────
const SHEET_FACT_LABEL: Partial<Record<string, string>> = {
  hours: "Hours",
  address: "Address",
  closed_dates: "Closed dates",
  timed_entry_required: "Timed entry",
  ticketing_rule: "Tickets",
  transit: "Getting there",
  price: "Price",
  dining_basics: "Dining",
  event: "Event",
  description: "About",
  tip: "Tip",
};

function factText(f: FactView): string | null {
  const v = f.value ?? {};
  if (f.factType === "hours") {
    const days = Array.isArray(v.weekdayDescriptions) ? (v.weekdayDescriptions as unknown[]).map(String).filter(Boolean) : [];
    return days.length ? days.join(" · ") : null;
  }
  if (f.factType === "address") {
    // R321 S11-11: the English component line first; a Google string carrying CJK is never shown.
    const a = [v.addressLine, v.formattedAddress, v.shortFormattedAddress, v.address, v.text].find(
      (x) => typeof x === "string" && x.trim() && !containsCjk(x),
    );
    return typeof a === "string" ? a.trim() : null;
  }
  const t = [v.text, v.summary, v.rule, v.name, v.title, v.value].find((x) => typeof x === "string" && x.trim());
  return typeof t === "string" ? t.trim() : null;
}

export interface SheetFactLine {
  label: string;
  text: string;
  /** "<source> · checked <d Mon>" — the same sourced-line format the row uses (S10-9). */
  source: string;
  sourceUrl: string | null;
  stale: boolean;
}

/**
 * Pure. Every fact the stop has, each with its source and checked date (R-ap) — the ONE "more info"
 * list. A location fact is a point, not a sentence, and is not listed; a fact with nothing readable
 * is omitted rather than shown empty (§13). Hours first, then the order of `SHEET_FACT_LABEL`.
 */
export function sheetFactLines(facts: readonly FactView[] | undefined, timeZone?: string | null): SheetFactLine[] {
  const order = Object.keys(SHEET_FACT_LABEL);
  return (facts ?? [])
    .filter((f) => f.factType !== "location" && SHEET_FACT_LABEL[f.factType])
    .map((f) => {
      const text = factText(f);
      if (!text) return null;
      const checked = factCheckedLabel(f.checkedAt, timeZone) ?? provenanceCheckedLabel(f.provenance);
      return {
        label: SHEET_FACT_LABEL[f.factType]!,
        text,
        source: `${sourceName(f.provenance)}${checked ? ` · checked ${checked}` : ""}`,
        sourceUrl: f.sourceUrl,
        stale: f.stale,
        _o: order.indexOf(f.factType),
      };
    })
    .filter((x): x is SheetFactLine & { _o: number } => !!x)
    .sort((a, b) => a._o - b._o)
    .map(({ _o, ...rest }) => rest);
}
