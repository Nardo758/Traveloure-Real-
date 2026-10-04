/**
 * The slip's lines for an item's facts (A5; ledger `2026-09-29-a5-draft-open-set`; content sourcing
 * brief §3: a fact is never shown without its provenance; surface spec v1.2 §3 — `itemFactsLine` and
 * `itemPlaceLine` below replaced `itemFactLine`/`itemAddressLine` in step 1). Pure. The facts and their provenance
 * lines are the SERVER's (`placeFacts` on the plancard read); this only picks the words to show.
 *
 * §13: hours are shown for the plan DAY's own weekday, and only when the day has a date — a plan
 * with no dates has no weekday to name, so the hours line is omitted rather than guessed.
 */
import type { FactView } from "@shared/content-facts";
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
 * " (may have changed)" follows a stale fact. Null when there is nothing true to say.
 */
export function itemFactsLine(
  facts: readonly FactView[] | undefined,
  dateIso: string | null,
  timeZone?: string | null,
): { text: string; sourceUrl: string | null } | null {
  const hours = facts?.find((f) => f.factType === "hours");
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
  return { text: parts.join(" · ") + (hours.stale ? " (may have changed)" : ""), sourceUrl: hours.sourceUrl };
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
  const area = typeof fact?.value?.area === "string" && fact.value.area.trim() ? fact.value.area.trim() : null;
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
  closure: "Closure",
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
    const a = [v.formattedAddress, v.shortFormattedAddress, v.address, v.text].find((x) => typeof x === "string" && x.trim());
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
