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

export type OnepagerVariant = "property-led" | "service-led";

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
  /** Top forward windows of the leading metric (floor-cleared), sorted for the supporting visual. */
  windows: OnepagerWindowRow[];
  /** The four-honesty-gate methodology paragraph (strict count · month range · floor · count-only). */
  methodology: string;
  monthRange: string; // "May–Nov" style label derived from the window (formatting only)
  window: RollupWindow;
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

  return { marketSlug, marketName, variant, hero, windows, methodology, monthRange, window };
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
