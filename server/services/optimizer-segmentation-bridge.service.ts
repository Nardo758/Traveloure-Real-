/**
 * optimizer-segmentation-bridge.service.ts
 *
 * Wires the dark trip-segmentation engine (`proposeSegmentation`,
 * server/services/trip-segmentation.service.ts) into the paid optimize completion point
 * (`generateOptimizedItineraries`, server/itinerary-optimizer.ts). See
 * docs/briefs/TRIP_SEGMENTATION_DESIGN.md §5 (contract) and §5b (ONE-fee ruling, Phase 1).
 *
 * THIS WAVE IS RECOMMENDATION-ONLY: this module only computes a proposal. It never
 * materializes trips, never writes trip_segments, never applies anything. The caller persists
 * the return value onto `itinerary_comparisons.segmentation_proposal` and returns it to the
 * client — display only.
 *
 * Two responsibilities, kept separate so each is independently testable:
 *
 *  1. `buildSegmentationInput` — maps the optimizer's own baseline items (already
 *     server-resolved by `loadTripOptimizerInputs` / the cart & inline baseline builders in
 *     server/routes.ts, never from `req.body` directly — CLAUDE.md §14 posture, applied to
 *     planning rather than money) into the engine's `SegmentationInput` shape. City comes ONLY
 *     from `item.location` — the same server-resolved value resolve-trip's own city histogram
 *     reads (`(item.contentMeta as any)?.city || item.service?.location`,
 *     server/routes.ts:5679-5683) for cart-sourced baselines, and `itinerary_items.locationName`
 *     for trip-backed ones (`optimizer-baseline.service.ts`). A missing/blank location is `null`,
 *     NEVER guessed (§5 contract rule 2 / CLAUDE.md §13 honest-or-absent).
 *
 *     `scheduledDate` is derived from the item's real `dayNumber` + the run's `startDate`
 *     (`startDate + (dayNumber - 1) days`) when both are usable — arithmetic over two real
 *     server-held values, not a fabrication — so the engine's chronological-ordering logic
 *     (interleaving detection, split-segment date ranges) has real signal instead of none.
 *
 *  2. `computeSegmentationProposal` — calls the engine and NEVER throws. A segmentation failure
 *     must never fail a paid optimize (CLAUDE.md §15b posture, applied one derivative up from
 *     money to a recommendation the traveler already paid for). Logs and returns `null` on any
 *     failure — the caller omits the recommendation from the persisted comparison rather than
 *     blocking, retrying, or degrading the optimize run itself.
 *
 * §14/§5-rule-5 posture: there is no client input anywhere in this file. Everything comes from
 * the server-computed `baselineItems` / `startDate` / `endDate` / `travelers` already assembled
 * before `generateOptimizedItineraries` is called.
 */
import {
  proposeSegmentation,
  type SegmentationInput,
  type SegmentationItem,
  type SegmentationProposal,
} from "./trip-segmentation.service";
import type { ItineraryItem } from "../itinerary-optimizer";

export type { SegmentationProposal };

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function isYmd(s: unknown): s is string {
  return typeof s === "string" && YMD_RE.test(s);
}

/**
 * `startDate + (dayNumber - 1) days`, or `undefined` when either input is unusable. Never a
 * guess: both operands are real server-held values (the run's own resolved start date, the
 * item's own persisted/derived day number), so this is arithmetic over honest data, not
 * fabricated geography or a made-up schedule.
 */
function deriveScheduledDate(startDate: string, dayNumber: number | undefined): string | undefined {
  if (!isYmd(startDate) || dayNumber == null || !Number.isFinite(dayNumber) || dayNumber < 1) {
    return undefined;
  }
  const d = new Date(`${startDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + Math.floor(dayNumber - 1));
  return d.toISOString().split("T")[0];
}

/**
 * Maps the optimizer's baseline items into the engine's input shape. Pure — no DB, no network,
 * no client trust. `startDate`/`endDate` pass straight through; the engine itself validates YMD
 * shape and throws on malformed input, which `computeSegmentationProposal` below catches.
 *
 * No external/affiliate descriptors reach this pipeline — those exist only on the cart
 * resolve-trip path (design doc §2), which is a separate, unpaid, pre-optimize step. Always
 * empty here, never client-supplied.
 */
export function buildSegmentationInput(
  baselineItems: ItineraryItem[],
  startDate: string,
  endDate: string,
  travelers: number | undefined,
): SegmentationInput {
  const items: SegmentationItem[] = baselineItems.map((item) => {
    const rawCity = typeof item.location === "string" ? item.location.trim() : "";
    return {
      id: item.id,
      city: rawCity.length > 0 ? rawCity : null,
      scheduledDate: deriveScheduledDate(startDate, item.dayNumber),
    };
  });

  return {
    items,
    externalItems: [],
    startDate,
    endDate,
    travelers: travelers && travelers > 0 ? travelers : 1,
  };
}

/**
 * Runs the segmentation engine and NEVER throws. Returns `null` on any failure — including the
 * engine's own validation throws (empty collection, malformed dates) and any unexpected error,
 * `Error` or not. The caller persists `null` as "no recommendation for this run" rather than
 * failing, retrying, or blocking the optimize it is wrapping (§15b posture).
 */
export function computeSegmentationProposal(
  baselineItems: ItineraryItem[],
  startDate: string,
  endDate: string,
  travelers: number | undefined,
): SegmentationProposal | null {
  try {
    const input = buildSegmentationInput(baselineItems, startDate, endDate, travelers);
    return proposeSegmentation(input);
  } catch (err) {
    console.error(
      "[Segmentation] proposeSegmentation failed (non-critical — optimize continues without a recommendation):",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
