/**
 * Partnerize Campaign Sync Service
 *
 * Pulls the publisher's approved campaign list from Partnerize and upserts
 * each into affiliate_partners (source='partnerize'), tagged with the
 * campaign id so re-syncs are idempotent. Registered on a periodic interval
 * in cache-scheduler.service.ts.
 *
 * Out of scope (per task spec): campaign-application UI, real-time webhooks.
 */

import { db } from "../../db";
import { affiliatePartners } from "@shared/schema";
import { eq } from "drizzle-orm";
import { listCampaigns, getPartnerizeCredentials, type PartnerizeCampaign } from "./partnerize-client";

export interface PartnerizeSyncResult {
  synced: number;
  skipped: number;
  errors: number;
}

class PartnerizeSyncService {
  /**
   * Fetch approved campaigns from Partnerize and upsert them into
   * affiliate_partners. No-ops gracefully (returns zeroed result) when
   * credentials are missing.
   */
  async syncCampaigns(): Promise<PartnerizeSyncResult> {
    const result: PartnerizeSyncResult = { synced: 0, skipped: 0, errors: 0 };

    if (!getPartnerizeCredentials()) {
      console.warn("[PartnerizeSync] Credentials not configured — skipping sync");
      return result;
    }

    const campaigns = await listCampaigns();
    if (campaigns.length === 0) {
      console.warn("[PartnerizeSync] No campaigns returned — nothing to sync");
      return result;
    }

    for (const campaign of campaigns) {
      try {
        await this.upsertCampaign(campaign);
        result.synced++;
      } catch (err: any) {
        result.errors++;
        console.error(`[PartnerizeSync] Failed to upsert campaign ${campaign.campaignId}:`, err?.message ?? err);
      }
    }

    console.log(`[PartnerizeSync] Synced ${result.synced}/${campaigns.length} campaigns (${result.errors} errors)`);
    return result;
  }

  private async upsertCampaign(campaign: PartnerizeCampaign): Promise<void> {
    const existing = await db
      .select({ id: affiliatePartners.id })
      .from(affiliatePartners)
      .where(eq(affiliatePartners.externalCampaignId, campaign.campaignId))
      .limit(1);

    const values = {
      name: campaign.name,
      websiteUrl: campaign.websiteUrl || campaign.trackingUrl || "https://partnerize.com",
      category: this.mapCategory(campaign.category),
      affiliateTrackingId: campaign.campaignId,
      affiliateLinkTemplate: campaign.trackingUrl || null,
      description: campaign.description || null,
      logoUrl: campaign.logoUrl || null,
      commissionRate: campaign.commissionRate !== undefined ? String(campaign.commissionRate) : null,
      isActive: campaign.status ? campaign.status === "approved" : true,
      source: "partnerize",
      externalCampaignId: campaign.campaignId,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    };

    if (existing.length > 0) {
      await db
        .update(affiliatePartners)
        .set(values)
        .where(eq(affiliatePartners.id, existing[0].id));
    } else {
      await db.insert(affiliatePartners).values(values as any);
    }
  }

  /**
   * Map Partnerize's free-text campaign vertical/category into the platform's
   * fixed affiliate category set (see affiliate-scraper.service.getPartnerCategories).
   */
  private mapCategory(raw?: string): string {
    const c = (raw || "").toLowerCase();
    if (c.includes("hotel") || c.includes("accommodation") || c.includes("stay")) return "hotels_accommodation";
    if (c.includes("tour") || c.includes("activit") || c.includes("experience")) return "tours_activities";
    if (c.includes("transport") || c.includes("car") || c.includes("rental") || c.includes("flight")) return "transportation";
    if (c.includes("restaurant") || c.includes("dining") || c.includes("food")) return "restaurants_dining";
    if (c.includes("event") || c.includes("ticket")) return "events_tickets";
    if (c.includes("gear") || c.includes("insurance")) return c.includes("insurance") ? "insurance" : "travel_gear";
    return "other";
  }
}

export const partnerizeSyncService = new PartnerizeSyncService();
