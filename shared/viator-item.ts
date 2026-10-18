/**
 * VD-1b (ledger `2026-10-18-viator-add-to-plan`; decision-maker, Oct 18, 2026): a plan item added from a
 * live Viator card stores the title, Viator's product code and the "Partner: Viator" marker ONLY — no price,
 * no description, no coordinate — so every surface that shows it re-fetches Viator live.
 *
 * The code lands on the EXISTING `itinerary_items.content_type` / `content_id` pair (server-stamped; never
 * client-settable): the create rail admits exactly one field, `viatorProductCode`, through this schema, and
 * storage stamps the pair itself. No schema change.
 */
import { z } from "zod";

export const VIATOR_ITEM_CONTENT_TYPE = "viator_product";
export const VIATOR_ITEM_DESCRIPTION = "Partner: Viator";

/** Viator product codes are short alphanumeric ids (e.g. `5678KYO`, `12345P1`). */
export const viatorProductCodeSchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);

/** The create rail's admission for the one field. Absent ⇒ not a Viator add. */
export const itineraryItemViatorLinkSchema = z.object({ viatorProductCode: viatorProductCodeSchema.optional() });

/** The body a live Viator card sends to `POST /api/trips/:tripId/itinerary-items`. Pure. */
export function viatorAddBody(card: { title: string; productCode: string }, dayNumber: number): Record<string, unknown> {
  return {
    title: card.title,
    itemType: "activity",
    dayNumber,
    description: VIATOR_ITEM_DESCRIPTION,
    viatorProductCode: card.productCode,
  };
}

/** The Viator product code an item carries, or null. */
export function itemViatorProductCode(item: { contentType?: string | null; contentId?: string | null }): string | null {
  return item.contentType === VIATOR_ITEM_CONTENT_TYPE && item.contentId ? item.contentId : null;
}
