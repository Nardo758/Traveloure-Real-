/**
 * VD-1b (ledger `2026-10-18-viator-add-to-plan`) — the create rail's admission for an add from a live Viator
 * card. Pure. It reads the ONE admitted field (`viatorProductCode`), refuses it while the live search is off,
 * and strips every field that would store Viator content: price, cost, coordinate, address, place id, a
 * partner or service link and notes. The description becomes the "Partner: Viator" marker.
 */
import { itineraryItemViatorLinkSchema, VIATOR_ITEM_DESCRIPTION } from "@shared/viator-item";

export const VIATOR_ADD_STRIPPED_FIELDS = [
  "estimatedCost", "actualCost", "currency", "costPerPerson", "latitude", "longitude", "locationAddress",
  "googlePlaceId", "affiliateProductId", "providerServiceId", "notes",
] as const;

export type ViatorAddAdmission =
  | { ok: true; viatorProductCode: string | null }
  | { ok: false; message: string };

export function admitViatorAdd(body: unknown, itemData: Record<string, unknown>, liveEnabled: boolean): ViatorAddAdmission {
  const parsed = itineraryItemViatorLinkSchema.safeParse(body ?? {});
  if (!parsed.success) return { ok: false, message: "Invalid Viator product" };
  const code = parsed.data.viatorProductCode ?? null;
  if (!code) return { ok: true, viatorProductCode: null };
  if (!liveEnabled) return { ok: false, message: "Viator is not available right now." };
  for (const k of VIATOR_ADD_STRIPPED_FIELDS) delete itemData[k];
  itemData.description = VIATOR_ITEM_DESCRIPTION;
  return { ok: true, viatorProductCode: code };
}
