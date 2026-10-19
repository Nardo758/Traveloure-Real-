/**
 * FD-4 (ledger `2026-10-18-fd4-share-projection`): the server half of `shared/share-projection.ts` for the
 * variant-snapshot share rails (`/api/itinerary-share/:token` and its KML, GPX and navigate routes).
 *
 * A variant item carries no `source_class`; it points back to its plan row through the nullable
 * `source_item_id`. A variant item is PUBLIC only when that link resolves to an `itinerary_items` row whose
 * `source_class` is `'public'`. A NULL link, a missing row and an untagged row are all unclassifiable and
 * are counted, never shown (fail closed, decision-maker Oct 18, 2026).
 */
import { inArray } from "drizzle-orm";
import { db } from "../db";
import { itineraryItems } from "@shared/schema";
import { storage } from "../storage";
import { sharePublicTest, type SharePublicTest } from "@shared/share-projection";

export { projectVariantPlanForShare } from "@shared/share-projection";

/** Load the public test for one variant. Never throws a classification guess: an error reads nothing public. */
export async function loadVariantSharePublicTest(variantId: string): Promise<SharePublicTest> {
  const variantItems = (await storage.getItineraryVariantItemsByVariantId(variantId)) as Array<{
    id: string;
    sourceItemId?: string | null;
  }>;
  const sourceIds = Array.from(new Set(variantItems.map((v) => v.sourceItemId).filter((x): x is string => !!x)));
  if (sourceIds.length === 0) return () => false;
  const rows = await db
    .select({ id: itineraryItems.id, sourceClass: itineraryItems.sourceClass })
    .from(itineraryItems)
    .where(inArray(itineraryItems.id, sourceIds));
  const publicIds = new Set(rows.filter((r) => r.sourceClass === "public").map((r) => r.id));
  return sharePublicTest(variantItems, publicIds);
}
