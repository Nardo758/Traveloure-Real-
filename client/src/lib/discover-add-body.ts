/**
 * DISCOVER ADD-TO-PLAN — the ONE builder of the POST body `curated-content-section.tsx` sends to
 * `POST /api/trips/:tripId/itinerary-items`. Ledger `2026-09-18-add-to-plan-lossless`.
 *
 * WHY THIS IS A PURE MODULE. Discover's `CuratedItem` already carries `tracking.productId` — the
 * `affiliate_products.id` the item came from — and the mutation used to drop it on the floor: the
 * column existed (`itinerary_items.affiliate_product_id`, migration 256), the server already
 * omitted it from the generic body parse (§19), but nothing ever SENT it, so a Discover-added
 * partner item could never carry the link that lights the plancard's booking CTA
 * (`server/services/trip-plan.service.ts`). Extracting the body as a pure function makes that
 * "send the id when we have one" rule testable without mounting the component or a network layer.
 *
 * §13 — LOSSLESS, NOT INVENTIVE. `affiliateProductId` is included ONLY when `tracking.productId`
 * is a non-empty string; an item with no known product (a purely editorial/curated card) sends no
 * key at all, which the server's `itineraryItemAffiliateLinkSchema` reads as "leave it NULL" —
 * never an empty string, never a fabricated id.
 *
 * §16 — the affiliate URL is deliberately NEVER included here. Partner URLs stay server-side;
 * booking still rides the agent rail. (This is unchanged from before this lane — the old body
 * already omitted it.)
 */

/** The shape this module needs off `CuratedItem` — not the whole interface, so this stays testable
 * with a plain object literal rather than a full fixture. */
export interface DiscoverAddSourceItem {
  title: string;
  description: string | null;
  contentCategory: string;
  price: string | null;
  source: string;
  tracking: {
    productId: string | null;
  };
}

export interface DiscoverAddBody {
  title: string;
  description: string;
  itemType: string;
  dayNumber: number;
  status: string;
  estimatedCost: string | null;
  currency: string;
  notes: string;
  affiliateProductId?: string;
}

export function buildDiscoverAddBody(
  item: DiscoverAddSourceItem,
  _tripId: string,
): DiscoverAddBody {
  const body: DiscoverAddBody = {
    title: item.title,
    description: item.description || "",
    itemType: item.contentCategory || "experience",
    dayNumber: 1,
    status: "planned",
    estimatedCost: item.price || null,
    currency: "USD",
    // §16 (ledger 2026-08-22-ai-slip-defects): the affiliate URL is deliberately NOT persisted
    // onto the trip item — partner URLs stay server-side; booking rides the agent rail. (The old
    // code wrote it into `notes` and a `sourceUrl` field that no column backs — the URL then lived
    // durably on the traveler's plan.)
    notes: `Source: ${item.source}`,
  };
  if (typeof item.tracking?.productId === "string" && item.tracking.productId.length > 0) {
    body.affiliateProductId = item.tracking.productId;
  }
  return body;
}
