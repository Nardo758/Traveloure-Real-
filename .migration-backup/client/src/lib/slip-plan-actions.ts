/**
 * slip-plan-actions — pure, DB-free logic behind the slip's plan-level actions
 * (console-fixes lane A):
 *
 *  A1 "Optimize this plan": `countOptimizableItems` mirrors what the server's
 *  `loadTripOptimizerInputs(tripId)` reads (`in_planning` + `ready_for_checkout` items),
 *  and `slipOptimizeDisabledReason` is the honest disabled-tooltip — the button never
 *  pretends an optimization is possible when the trip has nothing the optimizer would read
 *  or is missing the destination/dates `createComparison` requires (§13: never invent them).
 *
 *  A2 "Add all to checkout": `runBulkRouteToCheckout` loops the EXISTING per-item routing
 *  endpoint (POST /api/trips/:tripId/items/:itemId/route {to:"ready_for_checkout"}) over
 *  `in_planning` items ONLY — the endpoint's LEGAL_FROM for ready_for_checkout is
 *  ["in_planning"], so `with_expert`/`purchased` items are filtered CLIENT-SIDE and never
 *  posted (routing.routes.ts would 409 them). Per-item failures (409s from concurrent
 *  edits) are collected and reported honestly, never silently swallowed; the cache
 *  invalidation callback fires EXACTLY ONCE after all posts settle, not per item.
 *  No new endpoint, no /api/cart or /api/checkout write — cart rows appear only via the
 *  routing endpoint's own projection sync (W2).
 */

/** Structural subset of PlanCardActivity these helpers read (kept import-free for tests). */
export interface RoutableItemLike {
  id: string;
  routingStatus?: string | null;
  /** Booking presence = the booked state (ROUTING_STATE_CONTRACT §2) — never bulk-routed. */
  booking?: { id: string } | null;
}

/** The only items the bulk action may post: un-booked `in_planning` rows. */
export function selectBulkCheckoutItems<T extends RoutableItemLike>(items: T[]): T[] {
  return items.filter((i) => !i.booking && i.routingStatus === "in_planning");
}

/**
 * How many items the optimizer would actually read for this trip — the server's
 * `loadTripOptimizerInputs` pulls `in_planning` + `ready_for_checkout` items.
 */
export function countOptimizableItems(items: RoutableItemLike[]): number {
  return items.filter(
    (i) =>
      !i.booking &&
      (i.routingStatus === "in_planning" || i.routingStatus === "ready_for_checkout"),
  ).length;
}

/**
 * Honest disabled state for the slip's Optimize action: returns the tooltip text when the
 * action must be disabled, or null when it may run. Never invents a destination or dates
 * (`createComparison` requires real ones — §13).
 */
export function slipOptimizeDisabledReason(opts: {
  optimizableCount: number;
  destination: string | null | undefined;
  startDate: string | null | undefined;
  endDate: string | null | undefined;
}): string | null {
  if (opts.optimizableCount === 0) {
    return "Nothing to optimize — every item is with your expert or already booked.";
  }
  if (!opts.destination) {
    return "This trip has no destination yet — add one before optimizing.";
  }
  if (!opts.startDate || !opts.endDate) {
    return "This trip has no dates yet — add them before optimizing.";
  }
  return null;
}

export interface BulkRouteFailure {
  id: string;
  /** Humanized server reason (see humanizeRouteError) — real message, never invented. */
  message: string;
}

export interface BulkRouteResult {
  /** Items actually posted (after the in_planning filter). */
  attempted: number;
  succeeded: number;
  failed: BulkRouteFailure[];
}

/**
 * apiRequest throws `"<status>: <json-body>"` — pull the server's own `message` field out
 * of that string when present, otherwise return the raw text. No client-side restatement
 * of server rules (§18 rule 1 posture): the reason shown is the server's reason.
 */
export function humanizeRouteError(raw: unknown): string {
  const text = raw instanceof Error ? raw.message : String(raw ?? "");
  const match = text.match(/^\d{3}:\s*([\s\S]*)$/);
  const body = match ? match[1] : text;
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.message === "string" && parsed.message) return parsed.message;
  } catch {
    /* not JSON — fall through to the raw text */
  }
  return body || "Request failed";
}

export interface RunBulkRouteOptions {
  items: RoutableItemLike[];
  /** Posts ONE item to the existing routing endpoint; must throw on failure. */
  postRoute: (itemId: string) => Promise<unknown>;
  /**
   * Cache invalidation, called EXACTLY ONCE after every post has settled (including when
   * some failed — a 409 means the plan changed underneath us, so a refresh is exactly
   * what's needed). Not called at all when nothing was attempted.
   */
  invalidate: () => void;
  /** Small-concurrency worker pool; defaults to 3. */
  concurrency?: number;
}

/**
 * Route every un-booked `in_planning` item to `ready_for_checkout` via the injected
 * per-item poster. Sequential-ish (bounded workers), one invalidation at the end,
 * failures collected per item.
 */
export async function runBulkRouteToCheckout(opts: RunBulkRouteOptions): Promise<BulkRouteResult> {
  const targets = selectBulkCheckoutItems(opts.items);
  const result: BulkRouteResult = { attempted: targets.length, succeeded: 0, failed: [] };
  if (targets.length === 0) return result;

  const concurrency = Math.max(1, opts.concurrency ?? 3);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < targets.length) {
      const item = targets[cursor++];
      try {
        await opts.postRoute(item.id);
        result.succeeded++;
      } catch (err) {
        result.failed.push({ id: item.id, message: humanizeRouteError(err) });
      }
    }
  }

  try {
    await Promise.all(
      Array.from({ length: Math.min(concurrency, targets.length) }, () => worker()),
    );
  } finally {
    // ONE invalidation for the whole batch — never per item.
    opts.invalidate();
  }

  return result;
}

/**
 * Honest toast content for a bulk-route result: successes counted, failures counted with
 * the server's own distinct reasons — never silently swallowed, never restated.
 */
export function summarizeBulkRoute(result: BulkRouteResult): {
  title: string;
  description?: string;
} {
  const added = `${result.succeeded} item${result.succeeded === 1 ? "" : "s"} added to checkout`;
  if (result.failed.length === 0) {
    return { title: added };
  }
  const reasons = Array.from(new Set(result.failed.map((f) => f.message)));
  return {
    title:
      result.succeeded > 0
        ? `${result.succeeded} added, ${result.failed.length} not added`
        : `${result.failed.length} item${result.failed.length === 1 ? "" : "s"} couldn't be added`,
    description: reasons.join(" · "),
  };
}
