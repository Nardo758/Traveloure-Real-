/**
 * PB-1 R1 (decision-maker, Oct 10, 2026; ledger `2026-10-10-pb1-property-category-city`): a property and
 * its rooms are LODGING BY CONSTRUCTION, so their category is set by the server to the `accommodation`
 * service category at creation and is never read from the request body (§19 posture). This is what lets
 * a property-builder listing reach the stay card, whose pool is `category_key = 'accommodation'`
 * (server/services/where-to-stay.service.ts `cityHotels`).
 *
 * §13: when no `accommodation` category row exists the category stays NULL and the miss is logged —
 * never a nearest-looking category. The lookup is by `category_key` (the taxonomy registry's key,
 * Locked Decision 31), not by slug or name.
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { serviceCategories } from "@shared/schema";

/** The product shapes the property builder writes. */
export const PROPERTY_PRODUCT_SHAPES = ["property", "property_room"] as const;

export function isPropertyProductShape(shape: unknown): boolean {
  return typeof shape === "string" && (PROPERTY_PRODUCT_SHAPES as readonly string[]).includes(shape);
}

/** The `accommodation` service category's id, or null (logged) when the taxonomy has no such row. */
export async function accommodationCategoryId(): Promise<string | null> {
  try {
    const [row] = await db
      .select({ id: serviceCategories.id })
      .from(serviceCategories)
      .where(eq(serviceCategories.categoryKey, "accommodation"))
      .limit(1);
    if (!row) console.warn("[property-category] no service_categories row with category_key='accommodation' — category left NULL");
    return row?.id ?? null;
  } catch (err) {
    console.error("[property-category] accommodation category lookup failed:", err);
    return null;
  }
}
