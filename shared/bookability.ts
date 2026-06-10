/**
 * Bookability — the canonical, DERIVED resolution axis for any bookable item.
 *
 * Bookability is NOT stored. There is no column and no migration. It is computed
 * at read time from an item's booking signals by this single resolver — the one
 * source of truth for both the server (payload assembly) and the client (card
 * badges). Add new consumers by importing `resolveBookability`; never re-derive.
 *
 *   native    → bookable in-app (internal provider service / platform booking URL)
 *   deeplink  → bounce off-site to a partner URL to complete the booking
 *   info_only → no bookable link (browse / discovery only)
 *
 * The axis is ORTHOGONAL to `sourceType` ('platform_provider' | 'affiliate'):
 * a platform item can be info_only, an affiliate item can (later) be native.
 * `sourceType` only breaks the tie when an item carries both booking signals.
 *
 * Vocabulary note: this supersedes the legacy client vocab
 * `platform | affiliate | browse` (mapped forward by `fromLegacyBookability`).
 * The transport-lane `transport_booking_options.bookingType`
 * (`platform | affiliate | deep_link | info_only`) convergence is a separate,
 * named follow-up and is intentionally NOT touched here.
 */
export type Bookability = "native" | "deeplink" | "info_only";

/**
 * The booking signals the resolver reads. All optional — absence ⇒ info_only.
 * The index signature lets callers pass whole records (gems, services, events)
 * without weak-type friction; declared fields keep their precise types.
 */
export interface BookabilityInput {
  /** 'platform_provider' | 'affiliate' — orthogonal axis; tie-breaker only. */
  sourceType?: string | null;
  /** In-app booking capability (internal provider service id). */
  providerServiceId?: string | number | null;
  /** In-app booking capability (platform-hosted booking URL). */
  platformBookingUrl?: string | null;
  /** Off-site partner / affiliate URLs. */
  affiliateUrl?: string | null;
  affiliateLink?: string | null;
  bookingUrl?: string | null;
  externalUrl?: string | null;
  [key: string]: unknown;
}

/**
 * The single source of truth for bookability. Emits `native | deeplink | info_only`
 * from booking-signal presence, with `sourceType` as an orthogonal tie-breaker.
 */
export function resolveBookability(input: BookabilityInput | null | undefined): Bookability {
  if (!input) return "info_only";

  const hasNative = Boolean(input.providerServiceId || input.platformBookingUrl);
  const hasDeeplink = Boolean(
    input.affiliateUrl || input.affiliateLink || input.bookingUrl || input.externalUrl,
  );

  if (hasNative && hasDeeplink) {
    // Both signals present: sourceType (orthogonal) breaks the tie. Affiliate
    // supply deep-links out; everything else prefers the in-app (native) path.
    return input.sourceType === "affiliate" ? "deeplink" : "native";
  }
  if (hasNative) return "native";
  if (hasDeeplink) return "deeplink";
  return "info_only";
}

/** Legacy client vocab, retained only to map persisted/older values forward. */
export type LegacyBookability = "platform" | "affiliate" | "browse";

/** Map the superseded `platform | affiliate | browse` vocab onto the canonical axis. */
export function fromLegacyBookability(
  legacy: LegacyBookability | string | null | undefined,
): Bookability {
  switch (legacy) {
    case "platform":
      return "native";
    case "affiliate":
      return "deeplink";
    default:
      return "info_only";
  }
}
