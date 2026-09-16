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
 * `failed` are the two this lane's writers move a row to; `cancelled` and `refunded` are DECLARED
 * so the derivation below already reads them correctly, but NO WRITER exists for either in this
 * lane — a component refund is the brief's lane 4 and needs a rail the whole-row refund cannot
 * express (see the lane report). A reader that meets an unknown value treats it as UNRESOLVED,
 * never as delivered.
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

export type ReducedBundleFigures =
  | {
      ok: true;
      /** Fraction of the snapshotted component value that WAS delivered, in [0,1]. */
      keptFraction: number;
      /** The mint's figures, as strings in the row's own 2-decimal shape. */
      grossAmount: string;
      platformFee: string;
      providerEarnings: string;
      /** The share of what the traveler was charged that the undelivered components represent. */
      deductedAmount: string;
      undeliveredComponentIds: string[];
      undeliveredSnapshotCents: number;
      totalSnapshotCents: number;
    }
  | {
      ok: false;
      /**
       * `component_price_unknown` — at least one component has no snapshotted price, so no honest
       *   reduction exists; the parent is handed to a human, never a guessed fraction (§13).
       * `zero_priced_bundle` — the snapshot sums to 0 cents, so no share can be derived.
       * `nothing_undelivered` — the caller asked for reduced figures on a bundle with no undelivered
       *   component; that is the FULL mint's case, not this one.
       */
      reason: "component_price_unknown" | "zero_priced_bundle" | "nothing_undelivered";
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
  if (input.components.some((c) => !Number.isInteger(c.snapshotPriceCents) || (c.snapshotPriceCents as number) < 0)) {
    return { ok: false, reason: "component_price_unknown" };
  }
  const totalSnapshotCents = input.components.reduce((s, c) => s + (c.snapshotPriceCents as number), 0);
  if (totalSnapshotCents <= 0) return { ok: false, reason: "zero_priced_bundle" };
  const undeliveredSnapshotCents = undelivered.reduce((s, c) => s + (c.snapshotPriceCents as number), 0);
  const keptFraction = Math.min(Math.max(1 - undeliveredSnapshotCents / totalSnapshotCents, 0), 1);

  const total = Number(input.totalAmount ?? 0) || 0;
  const fee = Number(input.platformFee ?? 0) || 0;
  const earnings = Number(input.providerEarnings ?? 0) || 0;
  return {
    ok: true,
    keptFraction,
    grossAmount: money2(total * keptFraction),
    platformFee: money2(fee * keptFraction),
    providerEarnings: money2(earnings * keptFraction),
    deductedAmount: money2(total * (1 - keptFraction)),
    undeliveredComponentIds: undelivered.map((c) => c.componentServiceId),
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
