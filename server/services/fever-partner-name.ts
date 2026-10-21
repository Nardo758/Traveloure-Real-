/**
 * The approved Fever partner's display name (ledger `2026-10-21-event-card-partner-area`).
 * Read from `affiliate_partners`. A missing row, a blank name, or "Unknown" is null — the card
 * shows nothing rather than a name the table does not carry.
 */
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "../db";
import { affiliatePartners } from "@shared/schema";
import { namedArea } from "@shared/fever-area";

export async function approvedFeverPartnerName(): Promise<string | null> {
  const rows = await db
    .select({ name: affiliatePartners.name })
    .from(affiliatePartners)
    .where(and(
      eq(affiliatePartners.approvalStatus, "approved"),
      sql`COALESCE(${affiliatePartners.isActive}, true) = true`,
      or(
        sql`lower(btrim(${affiliatePartners.name})) = 'fever'`,
        sql`${affiliatePartners.websiteUrl} ILIKE '%feverup.com%'`,
      ),
    ))
    .limit(1);
  return namedArea(rows[0]?.name);
}
