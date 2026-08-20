/**
 * demand-onepager.compute.ts — the PURE view-model for the Phase 4 recruitment one-pager.
 *
 * L6 single-computation discipline: this module COMPUTES NO DEMAND FIGURE. Every number it emits is
 * read verbatim from a `readAdminDemandRollup` result (already floored at `cross_partner`=10 — the
 * public tier, R30) and its market summary (which `summarizeMarkets` builds from `status==='ok'`
 * cells only, so a suppressed cell can never enter it). This file only SELECTS a variant and FORMATS
 * copy — no `.reduce()` over demand, no re-derivation. It is a pure function of its inputs, hence
 * deterministic and unit-testable with no DB and no PDF (the determinism/floor/variant gates target
 * this module).
 *
 * Rulings encoded here:
 *   • R30 (2026-08-20-partner-demand-onepager-floor) — PUBLIC 10-floor, no exceptions. Enforced by the
 *     caller feeding a `cross_partner`-floored summary; this module never lowers a floor. R29's
 *     enumerable-3 tier is own-book only and is unreachable here.
 *   • R31 (2026-08-20-partner-demand-onepager-variant) — audience-variant hero. property-led (stay:
 *     trips/nights, count-only, "Add a Property") vs service-led (unmet $). Selected by the greater
 *     WEIGHT = planned-trip count behind each cleared class (stayTrips vs slipCount) — unit-neutral,
 *     never a $-vs-trips blend (R19). Neither clears ⇒ no artifact (returns null).
 *   • R19 — units never blend (stay is count-only, no $); R20 — requested (forward) only, never summed
 *     with missed. §13 — a below-floor figure is OMITTED, never softened.
 */

import type { MarketSummary, MarketSummaryBucket } from "./demand-rollup.compute";
import type { RollupReadRow, RollupWindow } from "./demand-rollup.service";
import { clearsFloor, metricClassOf, TREND_MIN_WEEKS } from "../config/demand-floors.config";

export type OnepagerVariant = "property-led" | "service-led";

// ── 4.2b block inputs (R33/R34/R35) — supplied by the service; all optional (absent ⇒ block dark) ──

/** A forward event window (R33) — from `travel_pulse_calendar_events`, the only real dated-event
 *  source (the trend engine stores aggregate metrics, not dated rows). `start`/`end` are ISO dates. */
export interface OnepagerEventInput {
  name: string;
  start: string;
  end: string; // if the source end is null, the caller passes start (a single-day event)
}

/** The top zero-coverage neighborhood (R35). KIND-TAGGED so the render never pairs stay demand with a
 *  service-coverage number: `covers` says what the gap actually measures. Today only `"service"` is
 *  sourceable (`resolveCoverageGaps` counts provider_services), so a property-led hero receives null
 *  (no property-coverage read exists — the §13-honest dark, and the capture followup). */
export interface CoverageGapInput {
  neighborhoodName: string;
  covers: "service"; // extend to "property" when a property-coverage read exists (followup)
  categoryLabel?: string;
}

/** One forward date-cell of the leading metric, floor-cleared — the data behind a supporting visual
 *  (stay date distribution for property-led, requested-windows list for service-led). Never a
 *  suppressed cell (those are omitted upstream, §13). */
export interface OnepagerWindowRow {
  date: string; // market-local ISO date (formatting done in the template)
  n: number; // source_row_count behind this cell (show-the-N, §1d)
  // property-led (stay):
  trips?: number;
  nights?: number;
  // service-led (slip):
  amount?: number | null; // null ⇒ count-only window (unvalued), ranks after priced windows
  count?: number;
}

export interface OnepagerHero {
  variant: OnepagerVariant;
  headline: string; // the single hero line ("27 trips · 135 nights" or "$12,400 in unmet demand")
  subline: string; // framing beneath the headline ("Add a Property" / per-market service)
  strictCount: number; // N = planned trips behind the hero (part of the figure, §1d)
  // raw figures carried through for the template — never recomputed:
  stayTrips?: number;
  stayNights?: number;
  stayTravelers?: number | null;
  unmetAmount?: number;
  unmetTripCount?: number;
}

export interface OnepagerModel {
  marketSlug: string;
  marketName: string;
  variant: OnepagerVariant;
  hero: OnepagerHero;
  /** ALL forward windows of the leading metric (floor-cleared), sorted for the supporting visual. The
   *  render shows the top few and labels "Top K of {windowsTotal}" so a visible subset never implies
   *  completeness (note-2 reconciliation) — and the full set SUMS to the hero (the market total),
   *  which the reconciliation test asserts. */
  windows: OnepagerWindowRow[];
  /** Count of all floor-cleared forward windows (= windows.length) — the "of N" in the Top-K label. */
  windowsTotal: number;
  /** R33 event spotlight — the highest-demand forward event window, or null (no qualifying window ⇒
   *  the block is omitted; no "quiet period" filler). A date-SUBSET of the hero, never a second total. */
  eventSpotlight: EventSpotlight | null;
  /** R34 trend block — null below TREND_MIN_WEEKS of history (no slope, no trajectory language); the
   *  weekly series when unlocked. Expected null at launch (rollup history is only days old). */
  trendBlock: TrendBlock | null;
  /** R35 gap pairing — market-grain demand paired with a neighborhood zero-coverage gap, grains kept
   *  distinct; null when either half fails its floor, or (property-led) when no property-coverage read
   *  exists. Expected null today. */
  gapPairing: GapPairing | null;
  /** The four-honesty-gate methodology paragraph (strict count · month range · floor · count-only). */
  methodology: string;
  monthRange: string; // "May–Nov" style label derived from the window (formatting only)
  window: RollupWindow;
}

/** R33 — the highest-demand forward event window, aggregated from the hero's OWN floor-cleared daily
 *  cells over the event's date range (so it is a subset of the hero total, never a second total). */
export interface EventSpotlight {
  eventName: string;
  start: string;
  end: string;
  n: number; // Σ source_row_count over the window (the floor key that cleared it)
  // property-led (stay, count-only per R19):
  trips?: number;
  nights?: number;
  // service-led (slip $):
  amount?: number;
  count?: number;
  /** The R33 copy line, built here (verbatim pattern) so the render never re-phrases it. */
  copy: string;
}

/** R34 — weekly aggregates of the leading metric over available history (only present when unlocked). */
export interface TrendBlock {
  weeks: number; // distinct-date weeks of history behind this series (>= TREND_MIN_WEEKS)
  points: { weekStart: string; value: number }[]; // trips (property) or $ (service) per ISO week, asc
}

/** R35 — market demand paired with a neighborhood zero-coverage gap, grains kept distinct. */
export interface GapPairing {
  copy: string; // the R35 verbatim pairing line
}

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Month label of an ISO date, market-local (the string is already market-local — no tz math). */
function monthOf(iso: string): string {
  const m = Number(iso.slice(5, 7));
  return MONTHS[m - 1] ?? iso.slice(5, 7);
}

/** "May–Nov" from the window bounds; a single month if from/to share it. Formatting only. */
function monthRangeOf(w: RollupWindow): string {
  const a = monthOf(w.from);
  const b = monthOf(w.to);
  return a === b ? a : `${a}–${b}`;
}

/** A stay figure clears when its summed forward trips are positive (the summary already dropped every
 *  below-floor cell, §13/R30). */
function stayClears(b: MarketSummaryBucket): boolean {
  return b.stayTrips > 0;
}

/** A slip figure clears when a priced forward amount survived the floor. A count-only market (amount
 *  null) does NOT lead a service-led hero — the hero is a $ figure, and there is no $ to show. */
function slipClears(b: MarketSummaryBucket): boolean {
  return b.slipAmount != null && b.slipAmount > 0;
}

/** R31 variant selection. Returns null when neither class clears (⇒ no artifact). */
function selectVariant(b: MarketSummaryBucket): OnepagerVariant | null {
  const stay = stayClears(b);
  const slip = slipClears(b);
  if (!stay && !slip) return null;
  if (stay && !slip) return "property-led";
  if (slip && !stay) return "service-led";
  // Both clear — greater WEIGHT leads. Weight is the planned-trip count behind each class
  // (stayTrips vs slipCount): both are counts of real trips, so the comparison is unit-neutral and
  // never blends $ with trips (R19). A tie favors property-led (the launch-market growth lever).
  return b.slipCount > b.stayTrips ? "service-led" : "property-led";
}

function buildHero(variant: OnepagerVariant, marketName: string, b: MarketSummaryBucket): OnepagerHero {
  if (variant === "property-led") {
    // R19: stay demand is COUNT-ONLY — trips/nights, never a dollar figure.
    const nightsPart = b.stayNights > 0 ? ` · ${b.stayNights} nights` : "";
    return {
      variant,
      headline: `${b.stayTrips} trips${nightsPart}`,
      subline: `travelers seeking a stay in ${marketName} with none anchored — add a property to capture them`,
      strictCount: b.stayTrips,
      stayTrips: b.stayTrips,
      stayNights: b.stayNights,
      stayTravelers: b.stayTravelers,
    };
  }
  const amount = b.slipAmount ?? 0;
  return {
    variant,
    headline: `${USD.format(amount)} in unmet demand`,
    subline: `requested in ${marketName} with no bookable slot`,
    strictCount: b.slipCount,
    unmetAmount: amount,
    unmetTripCount: b.slipCount,
  };
}

/** The forward (requested) floor-cleared date-cells of the leading metric, sorted for the supporting
 *  visual. Reads the value straight off each `status==='ok'` cell — no aggregation, no derivation. */
function buildWindows(variant: OnepagerVariant, marketSlug: string, rows: RollupReadRow[]): OnepagerWindowRow[] {
  const metric = variant === "property-led" ? "unmet_demand_stay" : "unmet_demand_slip";
  const cells = rows.filter(
    (r) =>
      r.marketSlug === marketSlug &&
      r.metric === metric &&
      r.kind === "requested" &&
      r.status === "ok" &&
      r.partnerId == null &&
      r.serviceId == null &&
      r.value != null,
  );

  if (variant === "property-led") {
    return cells
      .map((r) => {
        const v = r.value as { trips?: number; nights?: number };
        return { date: r.date, n: r.n, trips: v.trips ?? 0, nights: v.nights ?? 0 };
      })
      // most nights demanded first; date asc as the stable tiebreak (determinism)
      .sort((a, b) => (b.nights ?? 0) - (a.nights ?? 0) || a.date.localeCompare(b.date));
  }
  return cells
    .map((r) => {
      const v = r.value as { count?: number; amount?: number | null };
      return { date: r.date, n: r.n, amount: v.amount ?? null, count: v.count ?? 0 };
    })
    // priced windows by $ desc; count-only (amount null) always after priced (brief §2c); date asc tiebreak
    .sort((a, b) => {
      const av = a.amount == null ? -1 : a.amount;
      const bv = b.amount == null ? -1 : b.amount;
      return bv - av || a.date.localeCompare(b.date);
    });
}

/** The methodology paragraph — the page's credibility spine (brief §3). Four honesty gates in plain
 *  language: strict count, month range, the public floor, and count-only money (service-led) / the
 *  count-only nature of stay demand (property-led). The strict-count clause is the dispatch's verbatim
 *  pattern. The artifact regenerates monthly (R32), hence "updated monthly" (not the surfaces' daily).*/
function buildMethodology(variant: OnepagerVariant, strictCount: number, monthRange: string): string {
  const base =
    `Based on ${strictCount} planned trips ` +
    `(strict count: real travelers, synthetic and authoring trips excluded) · ${monthRange} · updated monthly. ` +
    // "at least 10", not "≥10": the Inter woff subset the PDF embeds has no U+2265 glyph (it would
    // render as tofu — same class as the share-image rail's missing-star note). Prose is glyph-safe
    // and reads better on a recruitment page anyway.
    `Demand shown only where the sample clears our honesty floor (at least 10 planned trips per market).`;
  const unitGate =
    variant === "service-led"
      ? " Money shown only where planned items carried a price; count-only windows are marked, never given a guessed dollar figure."
      : " Stay demand is a trip and night count only — never a dollar figure (a stay is priced by the host, not by us).";
  return base + unitGate;
}

/** "Oct 1" or "Oct 1–5" (single day when start === end). Formatting only. */
function humanRange(start: string, end: string): string {
  const d = (iso: string) => `${monthOf(iso)} ${Number(iso.slice(8, 10))}`;
  return start === end ? d(start) : `${d(start)}–${Number(end.slice(8, 10))}`;
}

/** The leading metric for a variant — the one the hero, windows, spotlight and trend all read. */
function leadingMetric(variant: OnepagerVariant): "unmet_demand_stay" | "unmet_demand_slip" {
  return variant === "property-led" ? "unmet_demand_stay" : "unmet_demand_slip";
}

/** Floor-cleared, market-level cells of the leading metric (the cells that SUM to the hero). `kind`
 *  narrows to requested (forward) or leaves both for history. Reads `status==='ok'` cells only, so a
 *  spotlight built from these is a strict subset of the hero (§13 / R33 subset invariant). */
function leadingCells(
  variant: OnepagerVariant,
  marketSlug: string,
  rows: RollupReadRow[],
  kind?: "requested" | "missed",
): RollupReadRow[] {
  const metric = leadingMetric(variant);
  return rows.filter(
    (r) =>
      r.marketSlug === marketSlug &&
      r.metric === metric &&
      r.status === "ok" &&
      r.partnerId == null &&
      r.serviceId == null &&
      r.value != null &&
      (kind ? r.kind === kind : true),
  );
}

/**
 * R33 — the highest-demand forward EVENT window. For each event, aggregate the hero's OWN floor-cleared
 * daily cells over [start, end] (so the result is a strict subset of the hero, never a second total —
 * the subset-reconciliation invariant), then require the WINDOW aggregate to clear the public 10-floor
 * (R30 on the window). The clearing event with the greatest weight wins. No qualifying event ⇒ null
 * (the block is omitted; no "quiet period" filler).
 */
function buildEventSpotlight(
  variant: OnepagerVariant,
  marketName: string,
  marketSlug: string,
  rows: RollupReadRow[],
  events: OnepagerEventInput[],
): EventSpotlight | null {
  if (events.length === 0) return null;
  const cells = leadingCells(variant, marketSlug, rows, "requested");
  const metricClass = metricClassOf(leadingMetric(variant));
  const isProperty = variant === "property-led";

  let best: EventSpotlight | null = null;
  let bestWeight = -1;
  for (const ev of events) {
    const inRange = cells.filter((c) => c.date >= ev.start && c.date <= ev.end);
    if (inRange.length === 0) continue;
    const n = inRange.reduce((a, c) => a + c.n, 0);
    if (!clearsFloor(n, "cross_partner", metricClass)) continue; // R30 on the window
    let trips = 0, nights = 0, amount = 0, count = 0;
    for (const c of inRange) {
      const v = c.value as { trips?: number; nights?: number; count?: number; amount?: number | null };
      if (isProperty) {
        trips += v.trips ?? 0;
        nights += v.nights ?? 0;
      } else {
        count += v.count ?? 0;
        if (v.amount != null) amount += v.amount;
      }
    }
    const weight = isProperty ? trips : amount;
    if (weight <= bestWeight) continue;
    bestWeight = weight;
    const dates = humanRange(ev.start, ev.end);
    const copy = isProperty
      ? `${ev.name} (${dates}): ${trips} trips seeking stays · ${nights} nights — none anchored.`
      : `${ev.name} (${dates}): ${USD.format(amount)} in unmet demand · ${count} trips — no bookable slot.`;
    best = isProperty
      ? { eventName: ev.name, start: ev.start, end: ev.end, n, trips, nights, copy }
      : { eventName: ev.name, start: ev.start, end: ev.end, n, amount, count, copy };
  }
  return best;
}

/**
 * R34 — the trend series, THRESHOLD-LOCKED. Null below TREND_MIN_WEEKS of computed daily history: no
 * slope, no trajectory language, the block does not exist (a slope from a few weeks is fabrication in
 * time-series form). When unlocked, weekly aggregates of the leading metric over available history.
 */
function buildTrendBlock(
  variant: OnepagerVariant,
  marketSlug: string,
  rows: RollupReadRow[],
  historyWeeks: number,
): TrendBlock | null {
  if (historyWeeks < TREND_MIN_WEEKS) return null; // the lock — expected at launch
  const isProperty = variant === "property-led";
  const cells = leadingCells(variant, marketSlug, rows); // both kinds — the time series is history
  const byWeek = new Map<string, number>();
  for (const c of cells) {
    const wk = isoWeekStart(c.date);
    const v = c.value as { trips?: number; amount?: number | null };
    const add = isProperty ? v.trips ?? 0 : v.amount ?? 0;
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + add);
  }
  const points = Array.from(byWeek.entries())
    .map(([weekStart, value]) => ({ weekStart, value }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  if (points.length === 0) return null;
  return { weeks: historyWeeks, points };
}

/** Monday-anchored ISO-week start date (YYYY-MM-DD) for a cell date — pure UTC arithmetic. */
function isoWeekStart(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/**
 * R35 — pair the market-grain hero demand with a neighborhood-grain zero-coverage gap, KEEPING THE
 * GRAINS DISTINCT. Both halves must clear their own floor (the hero already cleared; the caller only
 * passes a qualifying zero-coverage gap). KIND honesty: the only sourceable gap today measures SERVICE
 * coverage, so it may pair only with a SERVICE-led hero — a property-led (stay) hero + a service gap is
 * a kind mismatch and returns null (the §13-honest dark; a property-coverage read is the followup).
 */
function buildGapPairing(
  variant: OnepagerVariant,
  marketName: string,
  hero: OnepagerHero,
  gap: CoverageGapInput | null | undefined,
): GapPairing | null {
  if (!gap) return null;
  if (variant !== "service-led" || gap.covers !== "service") return null; // never stay-demand × service-gap
  const cat = gap.categoryLabel ? ` ${gap.categoryLabel}` : "";
  const copy = `${marketName} service demand: ${hero.headline} · ${gap.neighborhoodName} currently has no${cat} coverage.`;
  return { copy };
}

/**
 * Build the one-pager view-model for ONE market from its `cross_partner`-floored summary + rows.
 * Returns null when no figure class clears the public floor (R30/R31 — the floors decide, not
 * preference; a page that argues against joining is worse than no page). Pure and deterministic.
 */
export function buildOnepagerModel(args: {
  marketSlug: string;
  marketName: string;
  summary: MarketSummary | undefined;
  rows: RollupReadRow[];
  window: RollupWindow;
  /** R33 forward events; absent/empty ⇒ no spotlight (dark). */
  events?: OnepagerEventInput[];
  /** R34 distinct-date weeks of rollup history; absent/below TREND_MIN_WEEKS ⇒ no trend (dark). */
  historyWeeks?: number;
  /** R35 top zero-coverage neighborhood; absent ⇒ no gap pairing (dark). */
  coverageGap?: CoverageGapInput | null;
}): OnepagerModel | null {
  const { marketSlug, marketName, summary, rows, window } = args;
  if (!summary) return null;

  // R20: the recruitment hero is FORWARD demand only — the `requested` bucket, never summed with
  // `missed` (a settled past loss). `missed` is deliberately untouched here.
  const bucket = summary.requested;
  const variant = selectVariant(bucket);
  if (variant == null) return null;

  const hero = buildHero(variant, marketName, bucket);
  const windows = buildWindows(variant, marketSlug, rows);
  const monthRange = monthRangeOf(window);
  const methodology = buildMethodology(variant, hero.strictCount, monthRange);

  // 4.2b blocks (R33/R34/R35) — each self-omits when its data is absent/below floor (all dark today).
  const eventSpotlight = buildEventSpotlight(variant, marketName, marketSlug, rows, args.events ?? []);
  const trendBlock = buildTrendBlock(variant, marketSlug, rows, args.historyWeeks ?? 0);
  const gapPairing = buildGapPairing(variant, marketName, hero, args.coverageGap ?? null);

  return {
    marketSlug,
    marketName,
    variant,
    hero,
    windows,
    windowsTotal: windows.length,
    eventSpotlight,
    trendBlock,
    gapPairing,
    methodology,
    monthRange,
    window,
  };
}

/**
 * Which markets QUALIFY for a one-pager (R32 admin control: a generate button only for a qualifying
 * market; non-qualifying markets show the honest "no figure clears the public floor yet" line, never
 * a disabled mystery button). A market qualifies iff ≥1 figure class clears the public floor — i.e.
 * `buildOnepagerModel` would return non-null. Pure; derived from the same floored summaries.
 */
export function qualifyingMarkets(summaries: MarketSummary[]): string[] {
  return summaries
    .filter((s) => selectVariant(s.requested) != null)
    .map((s) => s.marketSlug)
    .sort();
}
