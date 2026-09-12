/**
 * IS THIS LINE A BOOKING-CONCIERGE LINE? — ONE implementation, every money surface.
 *
 * Ledger `2026-09-12-offering-key-is-canonical` (lane 1 of two). CLAUDE.md §18 rule 1 (one
 * derivation), §14 (nothing here is client-sourced), §8 (no rate and no fee literal lives here),
 * §13 (an absent answer is an answer).
 *
 * WHAT IT DECIDES, AND WHAT IT DELIBERATELY DOES NOT. It answers exactly one question — does this
 * cart line's listing sell the `booking_concierge` offering — because that answer selects whether
 * the Booking Concierge facilitation fee applies. It resolves NO rate and computes NO amount: the
 * rate is loaded from `fee_bands` by `getConciergeBookingRate` / `requireConciergeBookingRate` and
 * multiplied by the caller, exactly as before. Moving the PREDICATE here moves no money.
 *
 * WHY IT EXISTS. The decision lived inline at six sites across three route blocks (the checkout
 * quote loop, the checkout charge loop, and the two cart/preview quotes), each building its own
 * `expertOfferingTypeId` → `offeringTypeKey` map and each comparing the mapped key to the same
 * literal. Six copies of one decision on the money path is the derivation-drift class §18 rule 1
 * names: the day one of them moves to the canonical column and the others do not, a quote and a
 * charge disagree about the same cart.
 *
 * THE KEY IS CANONICAL (the ruling). `provider_services.expert_offering_type_key` (migration 292)
 * is the column the offering catalogs are actually read BY — `impactClassFor` and the whole
 * commerce-contract resolver take a key — and it is what this predicate reads first. The older
 * `expert_offering_type_id` (migration 057) exists only to be translated back into a key, which is
 * exactly what the deleted per-site maps were doing.
 *
 * THE LEGACY FALLBACK IS LANE 2'S REMOVAL TARGET, and it is here for one reason: migration 293
 * copies the id's answer onto the key, but a DATABASE THAT HAS NOT APPLIED IT YET still holds rows
 * with an id and no key. Treating those as non-concierge would move money. So a row with NO key
 * and an id is resolved through the same id→key lookup that used to be inline — identical to
 * today's answer — and lane 2 deletes this arm together with the column.
 * `lane2-removal-target: expert_offering_type_id`
 *
 * NEGATIVE SPACE (§18d). Where a row's key and its legacy id name DIFFERENT offerings — a stored
 * disagreement migration 293 never creates and never repairs — the KEY wins, because the ruling
 * makes it canonical. That is the one input class whose answer can differ from the pre-lane code,
 * and the read-only query that lists those rows is recorded on lane 2's punchlist entry so a human
 * sees them before the column is dropped. This module detects nothing and repairs nothing (§17).
 */
import { CONCIERGE_BOOKING_CONCERN } from "./commission";

/**
 * The two columns a listing can name its expert offering with. Deliberately structural rather than
 * the `provider_services` row type: cart rows arrive as `any` from several storage readers, and the
 * predicate needs exactly these two fields.
 */
export interface ConciergeOfferingFacts {
  expertOfferingTypeKey?: string | null;
  expertOfferingTypeId?: string | null;
}

/** The id→key lookup, INJECTED so the predicate itself reaches no database and can be proven pure. */
export type OfferingKeysByIdLookup = (ids: string[]) => Promise<{ id: string; key: string }[]>;

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
 * The lookup is issued ONLY for lines that still need it (a key-less row carrying a legacy id), so
 * a fully migrated cart makes no query at all — and a cart with no expert offering anywhere makes
 * none either, exactly as the inline versions did.
 */
export async function resolveBookingConciergeItems(
  services: ReadonlyArray<ConciergeOfferingFacts | null | undefined>,
  lookupKeysByIds: OfferingKeysByIdLookup,
): Promise<BookingConciergeResolution> {
  // lane2-removal-target: everything from here to the map build goes with the column.
  const legacyIds = Array.from(new Set(
    services
      .filter((s): s is ConciergeOfferingFacts => !!s && !hasStatedKey(s))
      .map((s) => s.expertOfferingTypeId)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  ));
  const legacyKeyById = new Map<string, string>();
  if (legacyIds.length > 0) {
    for (const row of await lookupKeysByIds(legacyIds)) legacyKeyById.set(row.id, row.key);
  }

  const isBookingConcierge = (service: ConciergeOfferingFacts | null | undefined): boolean => {
    if (!service) return false;
    // THE KEY IS THE ANSWER when the listing states one — including when it states a DIFFERENT
    // offering from the legacy id beside it (the ruling: the key is canonical).
    if (hasStatedKey(service)) return service.expertOfferingTypeKey === CONCIERGE_BOOKING_CONCERN;
    // lane2-removal-target: no key on this row yet (migration 293 has not reached this database, or
    // the row's catalog link was deleted). Answer exactly as the pre-lane code did.
    const legacyId = service.expertOfferingTypeId;
    if (typeof legacyId !== "string" || legacyId.length === 0) return false;
    return legacyKeyById.get(legacyId) === CONCIERGE_BOOKING_CONCERN;
  };

  return {
    isBookingConcierge,
    hasAny: services.some((s) => isBookingConcierge(s)),
  };
}
