/**
 * BUNDLE COMPONENT STATES — the ONE derivation of what a bundle's per-component rows say about the
 * parent booking, and of the REDUCED figures a partially completed bundle mints over.
 *
 * Decision-maker ruling 2026-09-15 (punchlist D-32 / D-33 / D-34 / D-35, all option A; ledger
 * `2026-09-16-d32-d35-bundle-components`; migration 306). Content of record:
 * `docs/design/BUNDLE_PARTIAL_COMPLETION_BRIEF.md` §2 (state machine), §3 (money), §5 (columns).
 *
 * WHY IT IS PURE AND WHY IT IS SHARED. It computes and it never writes: no `db`, no `storage`, no
 * request, no clock. That is what lets a CI test prove it with no database, and it is what keeps a
 * second "is this bundle partially complete?" from being written beside the first — brief §2 rule 1:
 * "the parent state is DERIVED, never stored twice (§18 rule 1)". The eligibility resolver, the
 * component writers and the mint all call THIS and restate nothing.
 *
 * NO RATE AND NO AMOUNT LIVES HERE (§8/§14). The reduced figures are the ROW's own `total_amount` /
 * `platform_fee` / `provider_earnings` — the fee resolver's output at purchase, snapshotted on the
 * row — scaled by the share of the snapshotted component prices that was actually delivered. A
 * literal here would be exactly the parallel rate `fee_bands` exists to refuse.
 */

/**
 * The `service_bookings.status` value D-34 adds. App-enforced, NO DB CHECK — the column is
 * `varchar(30)` with no CHECK in any migration, so a new value is a code change and not a publish
 * trap (the LD 44(e) posture). NO BACKFILL: a bundle completed or refunded under the all-or-nothing
 * rule WAS completed or refunded under it (brief §4).
 *
 * WHAT IT MEANS: every component has an answer, at least one was delivered, at least one was NOT,
 * and the failed ones are NAMED on the row (`bookingDetails.completion.failedComponentIds`). It is
 * NOT `completed` — that word still means EVERY component (brief §2 rule 2) — and it is NOT
 * `refunded`, which would be a lie about the components that were delivered.
 */
export const PARTIALLY_COMPLETED_STATUS = "partially_completed";

/**
 * Per-component `booking_component_states.status` values. App-enforced, NO DB CHECK (the publish-
 * trap posture). `pending` is the born state (the checkout composer writes it); `completed` and
 * `failed` are the seller's two answers (the owner rails); `cancelled` is the TRAVELER's answer
 * (ledger `2026-09-16-bundle-component-traveler-cancel` — `POST /api/bookings/:id/components/
 * :componentServiceId/cancel`, which pins `cancel_refund_percent` in the same flip); `refunded` is
 * the SETTLEMENT's answer and has exactly TWO writers, both of which are the money settling (ledger
 * `2026-09-17-ld50-remainder-and-artifact-refund`): the D-51 promote (`promoteBundlePartialSettlement`),
 * which stamps it in the SAME statement as the refund columns under the `settled_at IS NULL` guard so
 * it lands exactly once, and the admin's artifact-rejection refund, which stamps every component of a
 * fully refunded booking inside its own §15b claim. It means THIS COMPONENT'S MONEY IS SETTLED — which
 * is the fact `deriveBundlePartialSettlement` refuses on (`component_already_refunded`: handed to a
 * human, never refunded twice). It does NOT erase who ended the component or why: `failed_at` /
 * `failure_reason`, `cancelled_at` / `cancel_reason` and the pinned `cancel_refund_percent` stay on the
 * row beside `refund_amount_cents`. A component refunded 0 is never stamped — nothing was refunded
 * (§13). A reader that meets an unknown value treats it as UNRESOLVED, never as delivered.
 */
export const BUNDLE_COMPONENT_STATUS = {
  pending: "pending",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
  refunded: "refunded",
} as const;
export type BundleComponentStatus = (typeof BUNDLE_COMPONENT_STATUS)[keyof typeof BUNDLE_COMPONENT_STATUS];

/** The statuses that count as "this component will NOT be delivered" for the parent derivation. */
export const BUNDLE_COMPONENT_UNDELIVERED_STATUSES: readonly string[] = [
  BUNDLE_COMPONENT_STATUS.failed,
  BUNDLE_COMPONENT_STATUS.cancelled,
  BUNDLE_COMPONENT_STATUS.refunded,
];

/** The shape every reader hands this module — a row, or a legacy jsonb entry lifted into it. */
export interface BundleComponentView {
  componentServiceId: string;
  status: string;
  /** Integer cents snapshotted at purchase; NULL = not captured (a pre-D-33 row). */
  snapshotPriceCents: number | null;
  /**
   * D-51 (ledger `2026-09-16-bundle-partial-settlement`): the component's purchase-time GROSS
   * ALLOCATION — its pro-rata share of the bundle's pre-fee price (`total_amount`), largest-remainder
   * rounded so the bundle's allocations sum EXACTLY. The CONTRACT fact; `snapshotPriceCents` stays the
   * CATALOG fact. NULL/absent = not captured (a pre-307 row, or an unpriced snapshot) — never 0.
   */
  allocationCents?: number | null;
  /**
   * Locked Decision 50, second half (ledger `2026-09-16-bundle-component-traveler-cancel`; migration
   * 309): for a `cancelled` component, the refund percent the SNAPSHOTTED cancellation policy yielded at
   * the instant the traveler cancelled — pinned by the cancel writer in the same atomic flip, read here
   * and never re-resolved. NULL/absent on a `cancelled` row = the terms were never recorded (a row no
   * writer of this rail produced), which every reader REFUSES by name (`cancel_terms_missing`, §13)
   * rather than applying a guessed tier. Meaningless on any other status and ignored there.
   */
  cancelRefundPercent?: number | null;
}

/** A pinned cancel percent is valid exactly when it is an integer in [0, 100]. */
export function isValidCancelRefundPercent(p: unknown): p is number {
  return typeof p === "number" && Number.isInteger(p) && p >= 0 && p <= 100;
}

/**
 * THE ONE ARITHMETIC of a traveler-cancelled component's refund (Locked Decision 50: "the component's
 * allocated amount follows the snapshotted cancellation policy and deadline"). `allocationCents ×
 * percent / 100`, rounded half-up to a whole cent — the same rounding `computeCancellationRefund`
 * applies to a whole-row cancellation, so the two rails cannot disagree by a cent on the same tier.
 * Deterministic: the same allocation and the same pinned percent always yield the same cents, which is
 * what lets the mint and the settlement each compute it and be guaranteed to agree (§18 rule 1 — one
 * function, two callers). The remainder (`allocationCents − refund`) is RETAINED by the seller and is
 * minted as delivered value. Never called with an unpinned percent: callers refuse that case first.
 */
export function cancelledComponentRefundCents(allocationCents: number, percent: number): number {
  return Math.round((allocationCents * percent) / 100);
}

/**
 * D-51 — THE ALLOCATION, derived ONCE at birth. Given each component's snapshot price in cents and the
 * bundle's pre-fee purchase price in cents, returns each component's nonnegative integer allocation
 * such that Σ allocation === totalCents EXACTLY, by pro-rata share with LARGEST-REMAINDER rounding:
 * every share is floored, then the leftover cents (always fewer than the component count) go one each
 * to the largest fractional remainders, ties broken by POSITION (earlier first) — so the result is
 * deterministic for a given snapshot and a re-run reproduces it byte for byte.
 *
 * Returns NULL — NOT CAPTURED (§13) — when any price is missing or negative, when the prices sum to 0
 * (no share can be derived, and an equal split would be an invented fact), or when the total is not a
 * nonnegative integer. NULL is never rendered as "free" and blocks partial settlement.
 */
export function allocateBundleCents(
  priceCents: ReadonlyArray<number | null | undefined>,
  totalCents: number,
): number[] | null {
  if (priceCents.length === 0) return null;
  if (!Number.isInteger(totalCents) || totalCents < 0) return null;
  if (priceCents.some((p) => !Number.isInteger(p) || (p as number) < 0)) return null;
  const prices = priceCents as number[];
  const sum = prices.reduce((s, p) => s + p, 0);
  if (sum <= 0) return null;
  const exact = prices.map((p) => (p * totalCents) / sum);
  const floors = exact.map((x) => Math.floor(x));
  let remainder = totalCents - floors.reduce((s, f) => s + f, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => (b.frac !== a.frac ? b.frac - a.frac : a.i - b.i));
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i] += 1;
    remainder -= 1;
  }
  return floors;
}

/**
 * True when EVERY component carries an allocation and they sum EXACTLY to the price — the only state
 * in which the allocation may be read as the contract fact. A partial set, a negative, or a set that
 * does not sum (a rewritten `total_amount`, which §17 forbids) reads as NOT CAPTURED.
 */
export function allocationsAreComplete(
  components: readonly BundleComponentView[],
  totalCents: number,
): boolean {
  if (components.length === 0) return false;
  if (!Number.isInteger(totalCents) || totalCents < 0) return false;
  let sum = 0;
  for (const c of components) {
    const a = c.allocationCents;
    if (!Number.isInteger(a) || (a as number) < 0) return false;
    sum += a as number;
  }
  return sum === totalCents;
}

/**
 * The parent's DERIVED outcome (brief §2, the table).
 *
 *   `incomplete`           — at least one component is still `pending` (or in an unknown state): the
 *                             parent stays `confirmed`; the existing `bundle_components_incomplete`.
 *   `completed`            — EVERY component is `completed`: the existing flip, the existing mint.
 *   `partially_completed`  — none pending, ≥1 completed, ≥1 undelivered: D-34's new answer.
 *   `all_undelivered`      — none pending, none completed: the EXISTING whole-row refund rail's
 *                             case, unchanged — this module flips nothing for it and says so.
 *   `no_components`        — nothing to derive from (§13: never "all complete" by default).
 */
export type BundleParentOutcome =
  | "incomplete"
  | "completed"
  | "partially_completed"
  | "all_undelivered"
  | "no_components";

export interface BundleOutcome {
  outcome: BundleParentOutcome;
  completedComponentIds: string[];
  undeliveredComponentIds: string[];
  pendingComponentIds: string[];
}

export function deriveBundleOutcome(components: readonly BundleComponentView[]): BundleOutcome {
  const completedComponentIds: string[] = [];
  const undeliveredComponentIds: string[] = [];
  const pendingComponentIds: string[] = [];
  for (const c of components) {
    if (c.status === BUNDLE_COMPONENT_STATUS.completed) completedComponentIds.push(c.componentServiceId);
    else if (BUNDLE_COMPONENT_UNDELIVERED_STATUSES.includes(c.status)) undeliveredComponentIds.push(c.componentServiceId);
    else pendingComponentIds.push(c.componentServiceId); // `pending` AND any unknown value — never delivered by default
  }
  const base = { completedComponentIds, undeliveredComponentIds, pendingComponentIds };
  if (components.length === 0) return { outcome: "no_components", ...base };
  if (pendingComponentIds.length > 0) return { outcome: "incomplete", ...base };
  if (undeliveredComponentIds.length === 0) return { outcome: "completed", ...base };
  if (completedComponentIds.length === 0) return { outcome: "all_undelivered", ...base };
  return { outcome: PARTIALLY_COMPLETED_STATUS, ...base };
}

/** Two-decimal money as the row stores it — a string, never a float that drifts. */
const money2 = (n: number): string => (Math.round(n * 100) / 100).toFixed(2);

/**
 * D-51: WHICH fact the reduction read. `allocation` — every component carries `allocationCents` and
 * they sum to the price, so the kept gross is Σ delivered allocations EXACTLY (the contract fact);
 * `snapshot_pro_rata` — the D-35 fallback over `snapshotPriceCents` for rows born before migration 307.
 * The mint names it in `mintBasis`, so a reader can tell which a historical row was reduced by (§13).
 */
export type ReducedBundleBasis = "allocation" | "snapshot_pro_rata";

export type ReducedBundleFigures =
  | {
      ok: true;
      basis: ReducedBundleBasis;
      /** Fraction of the price the seller KEEPS, in [0,1]: delivered value plus any retained cancelled remainder. */
      keptFraction: number;
      /** The mint's figures, as strings in the row's own 2-decimal shape. */
      grossAmount: string;
      platformFee: string;
      providerEarnings: string;
      /** The share of the price the traveler is owed back — Σ failed allocations + Σ cancelled refunds. */
      deductedAmount: string;
      undeliveredComponentIds: string[];
      /**
       * Locked Decision 50, second half: the cents of CANCELLED components' allocations the seller RETAINS
       * under the snapshotted policy (allocation − refund, per component), minted as delivered value. 0
       * when no component was cancelled, or every cancellation refunded in full. Only ever non-zero on the
       * `allocation` basis — the snapshot fallback predates the cancel rail and has no allocation to apply
       * a percent to.
       */
      cancelledRetainedCents: number;
      cancelledComponentIds: string[];
      /** Snapshot (catalog) sums when every component carries one; NULL = not captured, never 0 (§13). */
      undeliveredSnapshotCents: number | null;
      totalSnapshotCents: number | null;
    }
  | {
      ok: false;
      /**
       * `component_price_unknown` — at least one component has no snapshotted price, so no honest
       *   reduction exists; the parent is handed to a human, never a guessed fraction (§13).
       * `zero_priced_bundle` — the snapshot sums to 0 cents, so no share can be derived.
       * `nothing_undelivered` — the caller asked for reduced figures on a bundle with no undelivered
       *   component; that is the FULL mint's case, not this one.
       * `cancel_terms_missing` — a `cancelled` component carries no pinned `cancelRefundPercent`, so the
       *   snapshotted policy's outcome is unknown; the seller's kept share cannot be stated (§13). Only on
       *   the allocation basis — see `cancelledRetainedCents`.
       */
      reason: "component_price_unknown" | "zero_priced_bundle" | "nothing_undelivered" | "cancel_terms_missing";
      detail?: string;
    };

/**
 * D-35 — THE REDUCED FIGURES for the ONE mint a partially completed bundle takes.
 *
 * D-33 ruled the refund is "the component's PRO-RATA share of what was actually charged" because a
 * bundle is routinely discounted and the component prices need NOT sum to the bundle price. The
 * mint's reduction is the SAME share, applied to the SAME three row figures: each is scaled by
 * `keptFraction = 1 − Σ(undelivered snapshot cents) / Σ(all snapshot cents)`. Scaling the row's own
 * `platform_fee` and `provider_earnings` — the fee resolver's output at purchase — rather than
 * re-resolving a band at completion is deliberate: a band edited after the sale must not move the
 * payout on a sale already made, for exactly the reason the refund reads the SNAPSHOT price and
 * never the listing's price today (brief §2 rule 4). No rate literal; no amount from anywhere but
 * the row and the snapshot (§8/§14).
 *
 * A component with NO snapshotted price makes the whole reduction unknowable, and the answer is a
 * stated refusal, never an equal split (§13 — brief §4: "a refund with no snapshotted price is not
 * issued; it says the price was not recorded and goes to a human").
 */
export function reducedBundleFigures(input: {
  totalAmount: string | number | null | undefined;
  platformFee: string | number | null | undefined;
  providerEarnings: string | number | null | undefined;
  components: readonly BundleComponentView[];
}): ReducedBundleFigures {
  const undelivered = input.components.filter((c) => BUNDLE_COMPONENT_UNDELIVERED_STATUSES.includes(c.status));
  if (undelivered.length === 0) return { ok: false, reason: "nothing_undelivered" };

  const total = Number(input.totalAmount ?? 0) || 0;
  const fee = Number(input.platformFee ?? 0) || 0;
  const earnings = Number(input.providerEarnings ?? 0) || 0;
  const snapshotKnown = input.components.every(
    (c) => Number.isInteger(c.snapshotPriceCents) && (c.snapshotPriceCents as number) >= 0,
  );
  const totalSnapshotCents = snapshotKnown
    ? input.components.reduce((s, c) => s + (c.snapshotPriceCents as number), 0)
    : null;
  const undeliveredSnapshotCents = snapshotKnown
    ? undelivered.reduce((s, c) => s + (c.snapshotPriceCents as number), 0)
    : null;

  // ── D-51 (ledger `2026-09-16-bundle-partial-settlement`): THE ALLOCATION IS READ FIRST. When every
  // component carries `allocationCents` and they sum EXACTLY to the price, the kept gross is Σ delivered
  // allocations to the cent — the contract fact — and the kept FRACTION scales the row's own purchase-
  // time `platform_fee` / `provider_earnings` (the ORIGINAL commission, never re-resolved). ───────────
  const totalCents = Math.round(total * 100);
  if (totalCents > 0 && allocationsAreComplete(input.components, totalCents)) {
    // Locked Decision 50, second half (ledger `2026-09-16-bundle-component-traveler-cancel`): a FAILED
    // (or `refunded`) component's whole allocation leaves the seller — nonperformance, no policy input.
    // A CANCELLED component's allocation follows the policy PINNED on the row at the cancel instant:
    // `refund = cancelledComponentRefundCents(allocation, percent)` goes back to the traveler and the
    // REMAINDER is retained by the seller and minted as delivered value. A cancelled row with no pinned
    // percent makes the kept share unknowable and is REFUSED by name, never split by a guessed tier.
    let refundedAllocationCents = 0;
    let cancelledRetainedCents = 0;
    const cancelledComponentIds: string[] = [];
    for (const c of undelivered) {
      const alloc = c.allocationCents as number;
      if (c.status === BUNDLE_COMPONENT_STATUS.cancelled) {
        if (!isValidCancelRefundPercent(c.cancelRefundPercent)) {
          return { ok: false, reason: "cancel_terms_missing", detail: c.componentServiceId };
        }
        const refund = cancelledComponentRefundCents(alloc, c.cancelRefundPercent);
        refundedAllocationCents += refund;
        cancelledRetainedCents += alloc - refund;
        cancelledComponentIds.push(c.componentServiceId);
      } else {
        refundedAllocationCents += alloc;
      }
    }
    const keptCents = totalCents - refundedAllocationCents;
    const keptFraction = Math.min(Math.max(keptCents / totalCents, 0), 1);
    return {
      ok: true,
      basis: "allocation",
      keptFraction,
      grossAmount: money2(keptCents / 100),
      platformFee: money2(fee * keptFraction),
      providerEarnings: money2(earnings * keptFraction),
      deductedAmount: money2(refundedAllocationCents / 100),
      undeliveredComponentIds: undelivered.map((c) => c.componentServiceId),
      cancelledRetainedCents,
      cancelledComponentIds,
      undeliveredSnapshotCents,
      totalSnapshotCents,
    };
  }

  // ── D-35 fallback: pro-rata over the SNAPSHOT prices, for rows born before migration 307. A `cancelled`
  // row here is treated as fully undelivered, as D-35 always did: with no allocation there is nothing to
  // apply a percent to, and the cancel writer refuses such a bundle (`allocation_missing`) — so this arm
  // is reachable only by a row no writer of this rail produced, and it predates the rail. ──────────────
  if (!snapshotKnown) return { ok: false, reason: "component_price_unknown" };
  if ((totalSnapshotCents as number) <= 0) return { ok: false, reason: "zero_priced_bundle" };
  const keptFraction = Math.min(
    Math.max(1 - (undeliveredSnapshotCents as number) / (totalSnapshotCents as number), 0),
    1,
  );
  return {
    ok: true,
    basis: "snapshot_pro_rata",
    keptFraction,
    grossAmount: money2(total * keptFraction),
    platformFee: money2(fee * keptFraction),
    providerEarnings: money2(earnings * keptFraction),
    deductedAmount: money2(total * (1 - keptFraction)),
    undeliveredComponentIds: undelivered.map((c) => c.componentServiceId),
    cancelledRetainedCents: 0, // no allocation ⇒ no policy can be applied; nothing is retained here
    cancelledComponentIds: undelivered
      .filter((c) => c.status === BUNDLE_COMPONENT_STATUS.cancelled)
      .map((c) => c.componentServiceId),
    undeliveredSnapshotCents,
    totalSnapshotCents,
  };
}

/**
 * Lift a purchase-time snapshot entry (`booking_details.bundleComponents[i]`) into the cents the
 * child row is born with. D-33: the price is SERVER-DERIVED from the catalog at checkout; this
 * only reads what the composer wrote. Anything that is not a non-negative integer is NOT CAPTURED
 * (§13) — never coerced to 0, which would read as "this component was free".
 */
export function snapshotPriceCentsOf(entry: unknown): number | null {
  if (!entry || typeof entry !== "object") return null;
  const v = (entry as { priceCents?: unknown }).priceCents;
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
}
