/**
 * Row 179 (ledger `2026-10-30-row179-upsell-line-server`; Architect, Oct 29–30, 2026; Leon's rule, Oct 31, 2026):
 * the ONE per-leg upsell line the on-trip plancard upsell read carries, and the ONE rule that builds it.
 *
 * The rule (Leon): legs only, on-trip read only. A transport leg that follows a selected plan item and already has a
 * bookable option gets the top-ranked transport candidate, with its `legId` set. The pre-trip read sends no lines
 * (transport upsells are suppressed pre-trip). No item is ever paired with a candidate by plan order.
 *
 * The server sends the offering's title only; the screen builds "Add X for this leg" (approved copy). `socialProof` is
 * always null: no real booking-data source exists, and the "Most people…" line is HELD FOR LEON and never sent.
 */

/** The engine's transport categories (`isTransportSuppressed` in upsell-engine.service.ts reads the same two keys). */
export const UPSELL_TRANSPORT_CATEGORY_KEYS = ["private_transportation", "aff_ground_transport"] as const;

/** A leg option a traveler can book through the platform or a partner. A rideshare deep link or an info row is not. */
export const BOOKABLE_LEG_OPTION_TYPES = ["platform", "affiliate"] as const;

export interface UpsellLine {
  /** The selected plan item the leg starts from. */
  itemId: string;
  legId: string;
  /** The engine's offering id. */
  offeringType: string;
  /** The category the screen's browse link filters by (built by the client's one browse-link builder). */
  categoryKey: string;
  /** The offering's display title — X in "Add X for this leg". */
  title: string;
  socialProof: null;
}

export interface UpsellLineLeg {
  legId: string;
  /** `transport_legs.from_activity_id` — the plan item the leg follows; null when the leg starts nowhere on the plan. */
  fromItemId: string | null;
  dayNumber: number;
  legOrder: number;
  hasBookableOption: boolean;
}

export interface UpsellLineCandidate {
  offeringId: string;
  categoryKey: string;
  displayName: string;
  rank: number;
}

export function isUpsellTransportCategory(categoryKey: string): boolean {
  return (UPSELL_TRANSPORT_CATEGORY_KEYS as readonly string[]).includes(categoryKey);
}

export function isBookableLegOptionType(bookingType: string | null | undefined): boolean {
  return (BOOKABLE_LEG_OPTION_TYPES as readonly string[]).includes(bookingType ?? "");
}

/**
 * Pure. The lines for one on-trip read: the top-ranked transport candidate on every leg that follows a selected item
 * and has a bookable option, at most one line per item (its first such leg, by day then leg order). No transport
 * candidate, or no such leg ⇒ no lines.
 */
export function buildLegUpsellLines(
  legs: ReadonlyArray<UpsellLineLeg>,
  selectedItemIds: ReadonlySet<string>,
  candidates: ReadonlyArray<UpsellLineCandidate>,
): UpsellLine[] {
  const top = [...candidates].filter((c) => isUpsellTransportCategory(c.categoryKey)).sort((a, b) => a.rank - b.rank)[0];
  if (!top) return [];
  const out: UpsellLine[] = [];
  const seen = new Set<string>();
  const ordered = [...legs].sort((a, b) => a.dayNumber - b.dayNumber || a.legOrder - b.legOrder);
  for (const leg of ordered) {
    if (!leg.fromItemId || !leg.hasBookableOption || !selectedItemIds.has(leg.fromItemId) || seen.has(leg.fromItemId)) continue;
    seen.add(leg.fromItemId);
    out.push({
      itemId: leg.fromItemId,
      legId: leg.legId,
      offeringType: top.offeringId,
      categoryKey: top.categoryKey,
      title: top.displayName,
      socialProof: null,
    });
  }
  return out;
}
