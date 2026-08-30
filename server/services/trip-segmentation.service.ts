/**
 * trip-segmentation.service.ts
 *
 * WP-C (Optimizer Sourcing build, C2 wave) — the segmentation engine, shipped DARK.
 * See docs/briefs/TRIP_SEGMENTATION_DESIGN.md (§5 contract, §5b one-fee ruling, §6b road_trip
 * exclusion) and docs/briefs/OPTIMIZER_SOURCING_BUILD_SPEC.md (WP-C).
 *
 * This module has NO CALLER YET. It is a pure function: no DB, no network, no `Date.now()` in
 * the decision path (all dates come from the input). It is intentionally NOT wired into
 * `server/routes.ts` or `itinerary-optimizer.ts` — those are sibling work packages' territory.
 * A future caller feeds it the exact data `POST /api/cart/resolve-trip`
 * (server/routes.ts:5625-5794) already assembles: the city histogram inputs, the inferred date
 * range, and party size.
 *
 * ── Contract (§5) ──────────────────────────────────────────────────────────────────────────
 * 1. Propose, never commit — this function has no side effects and is safely re-runnable.
 * 2. Every item is placed or explicitly `unplaced` — never silently attached to the modal city.
 * 3. Strategy is derived ONLY from the histogram + dates in `input` — never from a client-
 *    supplied field (there is no such field in this signature; that is the enforcement).
 * 4. THE SAFETY PROPERTY: a one-dominant-city histogram yields strategy "single" with ONE
 *    segment whose destination equals the modal city and whose itemIds/externalIndexes cover
 *    EVERY city-resolvable item (any city, not just the modal one) — i.e. materializing it
 *    reproduces today's resolve-trip behavior exactly (today's code attaches every cart item to
 *    the one trip regardless of which city it individually matches; "single" replicates that
 *    byte-for-byte for resolvable items; items with no resolvable city are the one behavior this
 *    engine deliberately does NOT replicate — today's code attaches them blindly too, which is
 *    part of the bug this feature exists to fix, per rule 2 above).
 * 5. `road_trip` is NOT in the output vocabulary (§6b) — `cart_items`/external items carry no
 *    geo columns, only display-string cities, so ordering a driving route cannot be supported
 *    without fabricating geography. Recommending badly on paid output is worse than not
 *    recommending.
 *
 * ── Unplaced representation ────────────────────────────────────────────────────────────────
 * `unplaced` lives on every segment (matching the §5 DTO shape) and is the SAME list on every
 * segment in a given proposal — it is a global, not a per-segment, concept: an item with no
 * resolvable city does not belong more to one candidate destination than another. Duplicating it
 * is deliberate so no consumer can miss it by reading only one segment; for a single-segment
 * proposal (the "single" strategy, or the degenerate zero-resolvable-city case) there is no
 * duplication at all. Platform items are referenced by `cart_items.id`; external items have no
 * id, so an unplaced external item is referenced by the synthetic marker `ext:<index>` (its
 * position in the `externalItems` array as passed in) — still a `string`, still traceable, never
 * dropped.
 *
 * ── Thresholds chosen (documented for review, not carved in stone) ────────────────────────
 * - SINGLE_DOMINANCE_THRESHOLD = 0.75  → a city holding ≥75% of resolvable items is "the trip";
 *   minority cities ride along in the same segment, matching today's behavior (rule 4 above).
 * - SINGLE_HIGH_CONFIDENCE_THRESHOLD = 0.85 → below this but still ≥ dominance, "single" is kept
 *   (it's still the right call) but flagged low-confidence with a multi_city alternative, since
 *   a 75-84% majority is a real judgment call a traveler may want to override.
 * - MIN_DAYS_PER_SEGMENT = 2 → a cluster needs at least 2 calendar days to be a plausible
 *   standalone trip; if the overall window can't give every cluster that much, "split" is not
 *   feasible and the engine proposes "multi_city" (one trip, multiple stops) instead.
 * - NEAR_TIE_MARGIN = 0.10 → a two-cluster "split" whose shares are within 10 points of an even
 *   50/50 is flagged low-confidence (with a multi_city alternative), since a near-even split is
 *   the case most likely to be a single multi-stop trip rather than two trips.
 * City matching is EXACT STRING EQUALITY (no case-folding, no trimming) — deliberately matching
 * `server/routes.ts`'s existing `cityCounts[city]++` — so the safety property (rule 4) is
 * byte-identical to today's behavior, not an approximation of it.
 */

export type SegmentationStrategy = "single" | "multi_city" | "split";

export interface SegmentationItem {
  id: string;
  city: string | null;
  scheduledDate?: string | null;
}

export interface SegmentationExternalItem {
  city?: string;
  date?: string;
}

export interface SegmentationInput {
  items: SegmentationItem[];
  externalItems: SegmentationExternalItem[];
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD */
  endDate: string;
  travelers: number;
}

export interface SegmentProposal {
  destination: string;
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD */
  endDate: string;
  /** platform cart_items.id */
  itemIds: string[];
  /** positional index into the original externalItems array */
  externalIndexes: number[];
  /** cart_items.id, or `ext:<index>` for an external item — see module doc */
  unplaced: string[];
}

export interface SegmentationProposal {
  strategy: SegmentationStrategy;
  /** traveler-facing plain language, shown verbatim */
  rationale: string;
  confidence: "high" | "low";
  segments: SegmentProposal[];
  alternatives: SegmentationProposal[];
}

// ── Tunables (see module doc for rationale) ──────────────────────────────────────────────────
const SINGLE_DOMINANCE_THRESHOLD = 0.75;
const SINGLE_HIGH_CONFIDENCE_THRESHOLD = 0.85;
const MIN_DAYS_PER_SEGMENT = 2;
const NEAR_TIE_MARGIN = 0.1;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function isYmd(s: unknown): s is string {
  return typeof s === "string" && YMD_RE.test(s);
}

function parseYmd(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

function toYmd(d: Date): string {
  return d.toISOString().split("T")[0];
}

/** Inclusive day count between two YMD strings (never below 1). */
function daySpan(startYmd: string, endYmd: string): number {
  const start = parseYmd(startYmd).getTime();
  const end = parseYmd(endYmd).getTime();
  return Math.max(1, Math.round((end - start) / MS_PER_DAY) + 1);
}

function addDays(ymd: string, days: number): string {
  return toYmd(new Date(parseYmd(ymd).getTime() + days * MS_PER_DAY));
}

/** Parses a possibly-missing/invalid date string to a timestamp, or null. */
function parseTs(s: string | null | undefined): number | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.getTime();
}

interface ClusterAgg {
  destination: string;
  itemIds: string[];
  externalIndexes: number[];
  count: number;
  /** timestamps of every dated item in this cluster, in encounter order */
  dates: number[];
}

interface BuiltClusters {
  clusters: ClusterAgg[];
  totalResolvable: number;
  unplaced: string[];
  /** chronological (city-label) sequence for every item that had a parseable date, across ALL
   *  clusters — used to detect interleaving */
  datedSequence: string[];
}

function buildClusters(input: SegmentationInput): BuiltClusters {
  const byCity = new Map<string, ClusterAgg>();
  const unplaced: string[] = [];
  const dated: Array<{ ts: number; city: string }> = [];

  for (const item of input.items) {
    const city = item.city;
    if (!city) {
      unplaced.push(item.id);
      continue;
    }
    let cluster = byCity.get(city);
    if (!cluster) {
      cluster = { destination: city, itemIds: [], externalIndexes: [], count: 0, dates: [] };
      byCity.set(city, cluster);
    }
    cluster.itemIds.push(item.id);
    cluster.count += 1;
    const ts = parseTs(item.scheduledDate ?? null);
    if (ts !== null) {
      cluster.dates.push(ts);
      dated.push({ ts, city });
    }
  }

  input.externalItems.forEach((ext, idx) => {
    const city = ext.city;
    if (!city) {
      unplaced.push(`ext:${idx}`);
      return;
    }
    let cluster = byCity.get(city);
    if (!cluster) {
      cluster = { destination: city, itemIds: [], externalIndexes: [], count: 0, dates: [] };
      byCity.set(city, cluster);
    }
    cluster.externalIndexes.push(idx);
    cluster.count += 1;
    const ts = parseTs(ext.date ?? null);
    if (ts !== null) {
      cluster.dates.push(ts);
      dated.push({ ts, city });
    }
  });

  // Stable sort by timestamp — ties keep encounter order (items before externalItems, and
  // within each, array order), which is the same ordering resolve-trip's own scheduledDates
  // reduction implicitly favors.
  dated.sort((a, b) => a.ts - b.ts);

  const clusters = Array.from(byCity.values());
  const totalResolvable = clusters.reduce((sum, c) => sum + c.count, 0);

  return {
    clusters,
    totalResolvable,
    unplaced,
    datedSequence: dated.map((d) => d.city),
  };
}

/** True if some city's run of consecutive dated items closes and then reopens later — i.e. the
 *  chronological order is NOT a set of contiguous per-city blocks. */
function isInterleaved(sequence: string[]): boolean {
  if (sequence.length < 2) return false;
  const closed = new Set<string>();
  let prev = sequence[0];
  for (let i = 1; i < sequence.length; i++) {
    const cur = sequence[i];
    if (cur !== prev) {
      closed.add(prev);
      if (closed.has(cur)) return true;
    }
    prev = cur;
  }
  return false;
}

/** Largest-remainder allocation of `totalDays` across clusters, each guaranteed >= minDays.
 *  Caller must ensure totalDays >= clusters.length * minDays. Sums exactly to totalDays. */
function allocateDays(totalDays: number, weights: number[], minDays: number): number[] {
  const n = weights.length;
  const totalWeight = weights.reduce((a, b) => a + b, 0) || n;
  const remaining = totalDays - n * minDays;
  const raw = weights.map((w) => (remaining * w) / totalWeight);
  const base = raw.map((r) => Math.floor(r));
  let used = base.reduce((a, b) => a + b, 0);
  let leftover = remaining - used;
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; k < order.length && leftover > 0; k++, leftover--) {
    base[order[k].i] += 1;
  }
  return base.map((b) => b + minDays);
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function describeCityCounts(clusters: ClusterAgg[]): string {
  return clusters.map((c) => `${c.destination} (${c.count})`).join(", ");
}

function emptySegment(destination: string, startDate: string, endDate: string, unplaced: string[]): SegmentProposal {
  return { destination, startDate, endDate, itemIds: [], externalIndexes: [], unplaced };
}

function buildSingleProposal(
  input: SegmentationInput,
  built: BuiltClusters,
  sorted: ClusterAgg[],
  topShare: number,
): SegmentationProposal {
  const top = sorted[0];
  const allItemIds = sorted.flatMap((c) => c.itemIds);
  const allExternalIndexes = sorted.flatMap((c) => c.externalIndexes).sort((a, b) => a - b);
  const confidence: "high" | "low" = topShare >= SINGLE_HIGH_CONFIDENCE_THRESHOLD ? "high" : "low";

  const minorityClusters = sorted.slice(1);
  const rationale =
    minorityClusters.length === 0
      ? `All ${top.count} item${top.count === 1 ? "" : "s"} are in ${top.destination} — proposing a single ${top.destination} trip.`
      : `Most of your items (${top.count} of ${built.totalResolvable}, ${pct(topShare)}) are in ${top.destination} — proposing a single ${top.destination} trip that also carries the smaller amount from ${describeCityCounts(minorityClusters)}.`;

  const segment: SegmentProposal = {
    destination: top.destination,
    startDate: input.startDate,
    endDate: input.endDate,
    itemIds: allItemIds,
    externalIndexes: allExternalIndexes,
    unplaced: built.unplaced,
  };

  const proposal: SegmentationProposal = {
    strategy: "single",
    rationale,
    confidence,
    segments: [segment],
    alternatives: [],
  };

  if (confidence === "low" && sorted.length > 1) {
    proposal.alternatives = [buildMultiClusterProposal(input, built, sorted, "multi_city", true)];
  }

  return proposal;
}

function buildMultiClusterProposal(
  input: SegmentationInput,
  built: BuiltClusters,
  sorted: ClusterAgg[],
  strategy: "multi_city" | "split",
  asAlternative: boolean,
): SegmentationProposal {
  const totalDays = daySpan(input.startDate, input.endDate);

  if (strategy === "multi_city") {
    const segment: SegmentProposal = {
      // A multi_city trip is ONE trip with multiple stops — destination names all of them.
      destination: sorted.map((c) => c.destination).join(" + "),
      startDate: input.startDate,
      endDate: input.endDate,
      itemIds: sorted.flatMap((c) => c.itemIds),
      externalIndexes: sorted.flatMap((c) => c.externalIndexes).sort((a, b) => a - b),
      unplaced: built.unplaced,
    };
    const rationale = asAlternative
      ? `Alternative: keep ${describeCityCounts(sorted)} together as one multi-city trip instead of splitting.`
      : `Your items alternate between ${sorted.map((c) => c.destination).join(" and ")} across your dates — proposing one multi-city trip covering both, rather than separate trips.`;
    return {
      strategy: "multi_city",
      rationale,
      confidence: "high",
      segments: [segment],
      alternatives: [],
    };
  }

  // split: order clusters chronologically by earliest dated item (undated clusters sort after
  // dated ones, in count-desc order — already how `sorted` is ordered).
  const withEarliest = sorted.map((c) => ({
    cluster: c,
    earliest: c.dates.length > 0 ? Math.min(...c.dates) : Infinity,
  }));
  const ordered = [...withEarliest].sort((a, b) => a.earliest - b.earliest).map((w) => w.cluster);

  const days = allocateDays(
    totalDays,
    ordered.map((c) => c.count),
    MIN_DAYS_PER_SEGMENT,
  );

  const segments: SegmentProposal[] = [];
  let cursor = input.startDate;
  ordered.forEach((cluster, i) => {
    const segStart = cursor;
    const segEnd = i === ordered.length - 1 ? input.endDate : addDays(segStart, days[i] - 1);
    segments.push({
      destination: cluster.destination,
      startDate: segStart,
      endDate: segEnd,
      itemIds: cluster.itemIds,
      externalIndexes: cluster.externalIndexes.slice().sort((a, b) => a - b),
      unplaced: built.unplaced,
    });
    cursor = addDays(segEnd, 1);
  });

  const rationale = `Your items split cleanly between ${describeCityCounts(ordered)} with separable dates — proposing ${ordered.length} separate trips.`;

  return {
    strategy: "split",
    rationale,
    confidence: "high",
    segments,
    alternatives: [],
  };
}

function buildDegenerateProposal(input: SegmentationInput, unplaced: string[]): SegmentationProposal {
  const total = input.items.length + input.externalItems.length;
  return {
    strategy: "single",
    rationale: `None of your ${total} item${total === 1 ? "" : "s"} has a listed city yet — add a city to get a destination recommendation.`,
    confidence: "low",
    segments: [emptySegment("", input.startDate, input.endDate, unplaced)],
    alternatives: [
      {
        strategy: "single",
        rationale: "Add a city to at least one item, then re-run segmentation for a real recommendation.",
        confidence: "low",
        segments: [emptySegment("", input.startDate, input.endDate, unplaced)],
        alternatives: [],
      },
    ],
  };
}

/**
 * Proposes how a collection of items should be executed as one or more trips.
 *
 * Pure function: same input always yields the same output. No DB, no network, no wall-clock
 * reads in the decision path — every date used comes from `input`.
 *
 * @throws if there is nothing to segment (no items and no externalItems), or if startDate/
 *   endDate are not valid YYYY-MM-DD strings — mirroring `POST /api/cart/resolve-trip`'s own
 *   400 guard on an empty cart rather than fabricating a proposal for no data.
 */
export function proposeSegmentation(input: SegmentationInput): SegmentationProposal {
  if ((!input.items || input.items.length === 0) && (!input.externalItems || input.externalItems.length === 0)) {
    throw new Error("proposeSegmentation: nothing to segment (no items and no externalItems)");
  }
  if (!isYmd(input.startDate) || !isYmd(input.endDate)) {
    throw new Error("proposeSegmentation: startDate/endDate must be YYYY-MM-DD strings");
  }

  const built = buildClusters(input);

  if (built.totalResolvable === 0) {
    return buildDegenerateProposal(input, built.unplaced);
  }

  const sorted = [...built.clusters].sort((a, b) => b.count - a.count);
  const top = sorted[0];
  const topShare = top.count / built.totalResolvable;

  if (topShare >= SINGLE_DOMINANCE_THRESHOLD) {
    return buildSingleProposal(input, built, sorted, topShare);
  }

  // Multiple real clusters, none dominant. Decide multi_city vs split.
  const totalDays = daySpan(input.startDate, input.endDate);
  const enoughDaysForSplit = totalDays >= sorted.length * MIN_DAYS_PER_SEGMENT;
  const interleaved = isInterleaved(built.datedSequence);

  if (interleaved || !enoughDaysForSplit) {
    return buildMultiClusterProposal(input, built, sorted, "multi_city", false);
  }

  const proposal = buildMultiClusterProposal(input, built, sorted, "split", false);

  if (sorted.length === 2) {
    const shareA = sorted[0].count / built.totalResolvable;
    if (Math.abs(shareA - 0.5) < NEAR_TIE_MARGIN) {
      proposal.confidence = "low";
      proposal.alternatives = [buildMultiClusterProposal(input, built, sorted, "multi_city", true)];
    }
  }

  return proposal;
}
