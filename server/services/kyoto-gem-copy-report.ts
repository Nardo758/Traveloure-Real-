/**
 * Read-only list of Kyoto gem copy that still matches a banned phrase with no approved swap.
 * Marketing writes the replacement in a later PR. This module never updates a row.
 */
import { ilike } from "drizzle-orm";
import { kyotoUnswappedCopyReport, type KyotoUnswappedCopyRow } from "@shared/kyoto-gem-copy";
import { db } from "../db";
import { travelPulseHiddenGems } from "@shared/schema";

export async function listKyotoUnswappedGemCopy(): Promise<KyotoUnswappedCopyRow[]> {
  const rows = await db
    .select({
      id: travelPulseHiddenGems.id,
      placeName: travelPulseHiddenGems.placeName,
      description: travelPulseHiddenGems.description,
      whyLocalsLoveIt: travelPulseHiddenGems.whyLocalsLoveIt,
    })
    .from(travelPulseHiddenGems)
    .where(ilike(travelPulseHiddenGems.city, "kyoto"));
  return kyotoUnswappedCopyReport(rows);
}
