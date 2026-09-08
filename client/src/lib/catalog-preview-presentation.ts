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
import { resolveBuyAction } from "@shared/buy-action";

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

/** WHICH action a `bookingMode` names is `resolveBuyAction`'s answer (`shared/buy-action.ts`,
 *  ledger `2026-09-08-recorded-cleanups`, §18 rule 1) — the same one the live storefront card and
 *  the shared OfferingCard call, so a listing cannot read one way in an owner's Preview and another
 *  on their storefront. What stays HERE is the mock's own presentation: solid vs outline, and the
 *  fact that the preview draws NO button for the enquire case (the mock has no enquiry affordance —
 *  a listing that hides booking shows none, §13; the storefront card, which does have one, renders
 *  it from the same resolved action). NULL/undefined ⇒ instant is the resolver's documented
 *  fallback and is deliberately no longer defaulted a second time here. */
export function deriveBookingCta(bookingMode?: "instant" | "request" | "hidden" | null): PreviewCta | null {
  const action = resolveBuyAction(bookingMode);
  if (action.kind === "enquire") return null;
  return { label: action.label, variant: action.kind === "request" ? "outline" : "solid" };
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
