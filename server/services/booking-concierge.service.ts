/**
 * IS THIS LINE A BOOKING-CONCIERGE LINE? — ONE implementation, every money surface.
 *
 * Ledger `2026-09-12-offering-key-is-canonical` (lane 1) and `2026-09-15-offering-key-id-drop`
 * (lane 2, migration 296 — the legacy uuid and its fallback arm are gone). CLAUDE.md §18 rule 1
 * (one derivation), §14 (nothing here is client-sourced), §8 (no rate and no fee literal lives
 * here), §13 (an absent answer is an answer).
 *
 * WHAT IT DECIDES, AND WHAT IT DELIBERATELY DOES NOT. It answers exactly one question — does this
 * cart line's listing sell the `booking_concierge` offering — because that answer selects whether
 * the Booking Concierge facilitation fee applies. It resolves NO rate and computes NO amount: the
 * rate is loaded from `fee_bands` by `getConciergeBookingRate` / `requireConciergeBookingRate` and
 * multiplied by the caller. Moving the PREDICATE here moved no money, and neither did dropping the
 * legacy arm.
 *
 * WHY IT EXISTS. The decision lived inline at six sites across three route blocks (the checkout
 * quote loop, the checkout charge loop, and the two cart/preview quotes), each building its own
 * `expert_offering_type_id` → `offering_type_key` map and each comparing the mapped key to the same
 * literal. Six copies of one decision on the money path is the derivation-drift class §18 rule 1
 * names: the day one of them moves to the canonical column and the others do not, a quote and a
 * charge disagree about the same cart.
 *
 * THE KEY IS CANONICAL, AND NOW IT IS THE ONLY COLUMN THERE IS (the ruling).
 * `provider_services.expert_offering_type_key` (migration 292) is the column the offering catalogs
 * are actually read BY — `impactClassFor` and the whole commerce-contract resolver take a key.
 * The older `expert_offering_type_id` (migration 057) existed only to be translated back into one;
 * migration 293 copied its answer onto the key for every row that carried one, and migration 296
 * dropped it after a human read the production count of rows that could still answer only through
 * it. There is no id→key lookup here any more, and this module reaches no database at all.
 *
 * NEGATIVE SPACE (§18d). A listing that states NO key is NOT a concierge line — which is the same
 * answer it gave before the drop for a row with neither identifier, and the ruled answer for a row
 * whose key and legacy id once disagreed (the KEY wins; the rows where they did were listed to a
 * human by `scripts/preview-offering-key-id-drop.cjs` before the column went). §13: an
 * unclassified listing is read as unclassified, never as one offering or the other. This module
 * detects nothing and repairs nothing (§17).
 */
import { CONCIERGE_BOOKING_CONCERN } from "./commission";

/**
 * How a listing names its expert offering. Deliberately structural rather than the
 * `provider_services` row type: cart rows arrive as `any` from several storage readers, and the
 * predicate needs exactly this one field.
 */
export interface ConciergeOfferingFacts {
  expertOfferingTypeKey?: string | null;
}

export interface BookingConciergeResolution {
  /** Does this line's listing sell `booking_concierge`? A null/absent listing is never one. */
  isBookingConcierge(service: ConciergeOfferingFacts | null | undefined): boolean;
  /** Does ANY line in the set? The strict-vs-lenient fee-band loader turns on this. */
  hasAny: boolean;
}

function hasStatedKey(
  service: ConciergeOfferingFacts,
): service is ConciergeOfferingFacts & { expertOfferingTypeKey: string } {
  return typeof service.expertOfferingTypeKey === "string" && service.expertOfferingTypeKey.length > 0;
}

/**
 * Resolve the predicate once for a whole cart, then ask it per line.
 *
 * It stays `async` and keeps its per-cart shape deliberately: every money surface already awaits
 * it, and the shape is what keeps the quote, the preview and the charge asking ONE question of ONE
 * implementation. It issues no query — since the drop there is nothing to look up.
 */
export async function resolveBookingConciergeItems(
  services: ReadonlyArray<ConciergeOfferingFacts | null | undefined>,
): Promise<BookingConciergeResolution> {
  const isBookingConcierge = (service: ConciergeOfferingFacts | null | undefined): boolean => {
    if (!service) return false;
    // THE KEY IS THE ANSWER, and the only one. A listing that never stated an offering is not a
    // concierge line — it is unclassified, which is a different and honest thing (§13).
    if (!hasStatedKey(service)) return false;
    return service.expertOfferingTypeKey === CONCIERGE_BOOKING_CONCERN;
  };

  return {
    isBookingConcierge,
    hasAny: services.some((s) => isBookingConcierge(s)),
  };
}
