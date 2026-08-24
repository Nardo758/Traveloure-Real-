// Central content CTA (call-to-action) rule engine — the SINGLE source of truth for which action
// button a piece of content renders, keyed on its origin/type and (for affiliate content) its
// booking classification. Imported by BOTH server (validation) and client (rendering) so the same
// content never renders a different / non-compliant button depending on which surface shows it.
//
// Ratified 2026-07-24 (remediation item ④). Governing rules:
//   • §16 affiliate-outbound: partner "book" actions route to the in-platform agent-booking rail
//     (POST /api/affiliate-booking-requests) — NEVER a raw off-site window.open. Purely informational
//     affiliate content may use the TRACKED redirect (POST /api/content/affiliate-redirect), labelled
//     "View", not "Book". In-platform-bookable partner inventory (e.g. Amadeus hotels) → add-to-cart.
//   • provider_services (platform) → book/cart. expert_templates (Ready Made Trips) → 2-step purchase.
//   • coordination/event Full → coordination engagement.

import { contentOriginFor, type ContentOrigin } from "./content-origin";

// ─── Vocabularies (validated at the write layer; NULL allowed → sensible default) ────────────────

/** Affiliate booking classification carried on affiliate_products.booking_type (migration 131). */
export const BOOKING_TYPES = ["in_platform_bookable", "affiliate_bookable", "informational"] as const;
export type BookingType = (typeof BOOKING_TYPES)[number];

/** Normalized availability carried on affiliate_products.availability_status (migration 131). */
export const AVAILABILITY_STATUSES = ["available", "seasonal", "limited", "sold_out"] as const;
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

export function isBookingType(v: unknown): v is BookingType {
  return typeof v === "string" && (BOOKING_TYPES as readonly string[]).includes(v);
}
export function isAvailabilityStatus(v: unknown): v is AvailabilityStatus {
  return typeof v === "string" && (AVAILABILITY_STATUSES as readonly string[]).includes(v);
}

// ─── CTA kinds — the distinct actions a card can take ────────────────────────────────────────────

export type CtaKind =
  | "book_service"       // platform provider_service → /services/:id date-picker → cart → checkout
  | "purchase_template"  // Ready Made Trip → 2-step Stripe purchase on /expert-templates/:id
  | "add_to_cart"        // in-platform-bookable inventory (incl. in_platform_bookable affiliate)
  | "agent_rail"         // affiliate/partner booking → POST /api/affiliate-booking-requests (§16)
  | "tracked_view"       // informational affiliate → POST /api/content/affiliate-redirect (tracked)
  | "checkout"           // curated non-affiliate priced item → POST /api/content/checkout
  | "plan"               // curated informational / no price → open the planner
  | "coordination";      // event Full → coordination engagement

export interface CtaDescriptor {
  kind: CtaKind;
  /** Traveler-facing button label. Never a booking verb for tracked_view (§16). */
  label: string;
  /** Server endpoint the action posts to, when applicable (else undefined = client-side navigation). */
  endpoint?: string;
}

/** Minimal shape the resolver needs — a normalized content item from any surface. */
export interface CtaResolvableItem {
  /** content_registry contentType, or a synthetic origin marker ("affiliate", "service", "template", "coordination"). */
  contentType?: string | null;
  /** "affiliate" | "curated" | ... as the discover normalizer already emits. */
  type?: string | null;
  /** affiliate_products.booking_type — governs the affiliate branch. */
  bookingType?: BookingType | string | null;
  /** whether the item carries a real price (drives curated checkout vs plan). */
  hasPrice?: boolean;
  /** whether the item is purely informational (no bookable product behind it). */
  informational?: boolean;
}

// ─── The rule engine ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the correct CTA for a content item. This is the ONLY place the content-type→button mapping
 * lives — every surface must call this rather than hardcoding its own onClick (item ④).
 */
export function resolveContentCTA(item: CtaResolvableItem): CtaDescriptor {
  const ct = (item.contentType ?? "").toLowerCase();
  const origin: ContentOrigin = contentOriginFor(item.contentType);

  // Platform-native services.
  if (ct === "service" || ct === "provider_service") {
    return { kind: "book_service", label: "Book" };
  }

  // Ready Made Trips (expert itinerary templates).
  if (ct === "template") {
    return { kind: "purchase_template", label: "Buy this itinerary" };
  }

  // Coordination / event fulfilment.
  if (ct === "coordination" || ct === "booking_concierge") {
    return { kind: "coordination", label: "Plan with coordinator" };
  }

  // Affiliate / partner content — §16 governs. Classified by booking_type.
  if (origin === "affiliate" || ct === "affiliate_product" || item.type === "affiliate") {
    const bt = item.bookingType;
    if (bt === "in_platform_bookable") {
      return { kind: "add_to_cart", label: "Add to cart" };
    }
    if (bt === "informational" || item.informational) {
      // Tracked informational outbound — permitted, but NOT a booking verb.
      return { kind: "tracked_view", label: "View details", endpoint: "/api/content/affiliate-redirect" };
    }
    // Default (affiliate_bookable / unclassified): the agent rail. Never a raw off-site link.
    return { kind: "agent_rail", label: "Request booking", endpoint: "/api/affiliate-booking-requests" };
  }

  // Curated (content_registry, non-affiliate).
  if (item.hasPrice) {
    return { kind: "checkout", label: "Book Now", endpoint: "/api/content/checkout" };
  }
  return { kind: "plan", label: "Start planning" };
}
