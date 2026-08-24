/**
 * CATALOG PREVIEW UPGRADE — pure presentation-derivation helpers for the traveler-facing
 * storefront cards in the provider Catalog's Preview mode
 * (docs/design/catalog-preview-mock.html, `.offer`).
 *
 * Extracted so the location-chip / CTA / price / rating derivations are unit-testable
 * without a DOM (repo convention — see `catalog-listing-presentation.ts`, this module's
 * Manage-mode sibling).
 *
 * §13 posture throughout: every function here describes REAL data it was given — it never
 * invents a location, a review, a photo or a credential the caller didn't supply. Absence
 * renders as absence (a caller-side `null`/omission), never a guessed placeholder.
 */
import { PLACE_ANCHORED_METHODS } from "@shared/service-fundamentals";

// ─── location pin chip (top-left of the photo) ──────────────────────────────────────────

export interface PinChipInput {
  productShape?: string | null;
  city?: string | null;
  deliveryMethod?: string | null;
}

/** Labels for the REMOTE delivery methods only (the complement of
 *  `PLACE_ANCHORED_METHODS` within the canonical CLAUDE.md §3 vocabulary) — `in_person`/
 *  `hybrid` never reach this map because they're place-anchored and handled above it. */
const REMOTE_METHOD_LABELS: Record<string, string> = {
  pdf: "PDF",
  video: "Video",
  call: "Call",
  voice_notes: "Voice notes",
  async_messaging: "Messaging",
};

/**
 * Priority, per the ratified directive:
 *   1. A property or a property's room type is shown as a general area, never a street
 *      address (privacy for an accommodation listing) → "Approximate area".
 *   2. A real `city` value on the row → the city name itself.
 *   3. A remote delivery method → "Remote · <method label>".
 *   4. Nothing known → no chip at all (never a guessed location).
 */
export function deriveLocationPinChip(service: PinChipInput): string | null {
  if (service.productShape === "property" || service.productShape === "property_room") {
    return "Approximate area";
  }
  if (service.city && service.city.trim()) {
    return service.city.trim();
  }
  if (service.deliveryMethod && !PLACE_ANCHORED_METHODS.has(service.deliveryMethod)) {
    const label = REMOTE_METHOD_LABELS[service.deliveryMethod];
    if (label) return `Remote · ${label}`;
  }
  return null;
}

// ─── booking CTA (mock: solid "Book" / outlined "Request to book" / absent) ─────────────

export type PreviewCtaVariant = "solid" | "outline";

export interface PreviewCta {
  label: string;
  variant: PreviewCtaVariant;
}

/** `bookingMode` is resolved server-side to a concrete value for an owner's own read
 *  (never null in practice); `?? "instant"` only covers a row this helper is handed before
 *  that resolution lands, mirroring the same default the shared OfferingCard used. */
export function deriveBookingCta(bookingMode?: "instant" | "request" | "hidden" | null): PreviewCta | null {
  const mode = bookingMode ?? "instant";
  if (mode === "hidden") return null;
  if (mode === "request") return { label: "Request to book", variant: "outline" };
  return { label: "Book", variant: "solid" };
}

// ─── price (mock: `.price` / `.price.quote` / `.price.hidden-price`) ────────────────────

export interface PreviewPriceInput {
  showPrice?: boolean | null;
  price?: string | number | null;
  priceType?: string | null;
  pricingUnit?: string | null;
}

export interface PreviewPriceDisplay {
  /** `showPrice === false` — the mock's own treatment is `visibility:hidden` (the price
   *  keeps its layout slot so the footer row doesn't reflow card-to-card), not a
   *  fabricated "Enquire" substitute. */
  hidden: boolean;
  text: string;
  unit: string | null;
  /** Styles as the mock's smaller, muted `.price.quote` variant — true for a tiered/quote
   *  price and for the no-numeric-price fallback, mirroring "From $2,400" / "Custom quote". */
  quote: boolean;
}

function priceUnitSuffix(priceType?: string | null, pricingUnit?: string | null): string | null {
  if (pricingUnit === "per_night") return "/night";
  if (priceType === "hourly") return "/hr";
  if (priceType === "per_event") return "/event";
  if (priceType === "per_person") return "/person";
  return null;
}

export function derivePreviewPrice(input: PreviewPriceInput): PreviewPriceDisplay {
  const hidden = input.showPrice === false;
  const raw = input.price;
  const numeric = raw != null && raw !== "" ? Number(raw) : NaN;
  const hasPrice = raw != null && raw !== "" && !Number.isNaN(numeric);
  const isQuoteTier = input.priceType === "package_tiers";

  if (!hasPrice) {
    return { hidden, text: "Custom quote", unit: null, quote: true };
  }
  const formatted = Number.isInteger(numeric) ? `$${numeric}` : `$${numeric.toFixed(2)}`;
  return {
    hidden,
    text: isQuoteTier ? `From ${formatted}` : formatted,
    unit: priceUnitSuffix(input.priceType, input.pricingUnit),
    quote: isQuoteTier,
  };
}

// ─── rating / credential line (mock: `.rate`) ────────────────────────────────────────────

export interface PreviewRatingInput {
  rating?: string | number | null;
  count?: number | null;
}

export interface PreviewRatingDisplay {
  stars: number;
  count: number;
}

/** Real reviews only. The mock's "New · JAIS-certified" copy is seeded sample text, never
 *  a real signal — this returns `null` (render nothing) rather than inventing a "New"
 *  badge or a credential string the row doesn't carry (§13). */
export function derivePreviewRating(input: PreviewRatingInput): PreviewRatingDisplay | null {
  if (!input.count || input.count <= 0 || input.rating == null) return null;
  const stars = Number(input.rating);
  if (Number.isNaN(stars)) return null;
  return { stars, count: input.count };
}
