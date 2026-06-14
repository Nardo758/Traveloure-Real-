/**
 * Affiliate Service
 * Generate and track affiliate links for external bookings.
 *
 * LB-P4a: commission rates resolve from affiliate_partners.commission_rate
 * (admin-editable) at link-creation time, with the in-memory partners[] map
 * acting as a fallback when no DB row exists or the column is null. The admin
 * UI at client/src/pages/admin/affiliate-partners.tsx stores the value as a
 * percent (e.g. 5.00 = 5%); this service converts to a fraction (÷100) for
 * use in revenue math.
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';

interface AffiliateLink {
  url: string;
  partner: string;
  commission?: number;
}

export interface AffiliateAttribution {
  initiatedBy?: "user" | "ai_agent" | "expert";
  agentType?: "grok" | "claude" | "system" | null;
  sessionId?: string;
}

// 60-second in-memory cache for the DB lookup. Affiliate rate changes are
// admin-driven (rare) — short TTL keeps freshness without per-link load.
const COMMISSION_CACHE_TTL_MS = 60_000;
const commissionCache = new Map<string, { value: number | null; expiresAt: number }>();

class AffiliateService {
  // Affiliate partner configurations
  private readonly partners = {
    twelvego: {
      name: 'TwelveGo',
      affiliateId: process.env.TWELVEGO_AFFILIATE_ID || '13805109',
      baseUrl: 'https://12go.asia',
      categories: ['transportation'],
      commission: 0.05, // 5% // fee-literal-ok: external affiliate partner rate (TwelveGo), not internal fee config
    },
    viator: {
      name: 'Viator',
      affiliateId: process.env.VIATOR_AFFILIATE_ID || '',
      baseUrl: 'https://www.viator.com',
      categories: ['activities', 'tours'],
      commission: 0.08, // 8% // fee-literal-ok: external affiliate partner rate (Viator), not internal fee config
    },
    booking: {
      name: 'Booking.com',
      affiliateId: process.env.BOOKING_AFFILIATE_ID || '',
      baseUrl: 'https://www.booking.com',
      categories: ['accommodation'],
      commission: 0.04, // 4% // fee-literal-ok: external affiliate partner rate (Booking.com), not internal fee config
    },
    getyourguide: {
      name: 'GetYourGuide',
      affiliateId: process.env.GYG_AFFILIATE_ID || '',
      baseUrl: 'https://www.getyourguide.com',
      categories: ['activities', 'tours'],
      commission: 0.08, // 8% // fee-literal-ok: external affiliate partner rate (GetYourGuide), not internal fee config
    },
  };

  /**
   * Generate affiliate link based on item type and destination
   */
  async generateLink(
    itemType: string,
    destination: string,
    date: string,
    metadata?: any,
    attribution?: AffiliateAttribution
  ): Promise<AffiliateLink | null> {
    try {
      // Determine best partner for this item type
      const partner = this.selectPartner(itemType);
      if (!partner) {
        return null;
      }

      // Build affiliate URL
      let url = '';
      switch (partner) {
        case 'twelvego':
          url = this.buildTwelveGoLink(destination, date, metadata);
          break;
        case 'viator':
          url = this.buildViatorLink(destination, metadata);
          break;
        case 'booking':
          url = this.buildBookingLink(destination, date, metadata);
          break;
        case 'getyourguide':
          url = this.buildGetYourGuideLink(destination, metadata);
          break;
        default:
          return null;
      }

      // Track link generation
      await this.trackLinkGeneration(partner, itemType, destination, attribution);

      const partnerCfg = this.partners[partner as keyof typeof this.partners];
      const commission = await this.resolveCommission(partnerCfg.name, partnerCfg.commission);

      return {
        url,
        partner: partnerCfg.name,
        commission,
      };
    } catch (error) {
      console.error('Affiliate link generation error:', error);
      return null;
    }
  }

  /**
   * LB-P4a: resolve a partner's commission rate from affiliate_partners.commission_rate
   * (admin-editable) first, falling back to the in-memory map if no row / null.
   * DB stores percent (5.00 = 5%); this method returns a fraction (0.05).
   */
  private async resolveCommission(partnerName: string, fallback: number): Promise<number> {
    const cached = commissionCache.get(partnerName);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value ?? fallback;
    }
    try {
      const result = await db.execute(sql`
        SELECT CAST(commission_rate AS FLOAT) AS commission_rate
        FROM affiliate_partners
        WHERE name = ${partnerName}
        LIMIT 1
      `);
      const row = result.rows?.[0] as { commission_rate: number | null } | undefined;
      const value = row?.commission_rate !== undefined && row?.commission_rate !== null
        ? Number(row.commission_rate) / 100
        : null;
      commissionCache.set(partnerName, { value, expiresAt: Date.now() + COMMISSION_CACHE_TTL_MS });
      return value ?? fallback;
    } catch (err) {
      // DB unavailable — fall through to the in-memory fallback.
      console.warn(`[affiliate] commission lookup failed for ${partnerName}:`, err);
      return fallback;
    }
  }

  /**
   * Select best affiliate partner for item type
   */
  private selectPartner(itemType: string): string | null {
    for (const [key, partner] of Object.entries(this.partners)) {
      if (partner.categories.includes(itemType) && partner.affiliateId) {
        return key;
      }
    }
    return null;
  }

  /**
   * Build TwelveGo affiliate link (transportation)
   */
  private buildTwelveGoLink(destination: string, date: string, metadata?: any): string {
    const { affiliateId, baseUrl } = this.partners.twelvego;
    const params = new URLSearchParams({
      aff: affiliateId,
      destination: destination,
      date: date,
    });

    if (metadata?.origin) {
      params.append('origin', metadata.origin);
    }

    return `${baseUrl}?${params.toString()}`;
  }

  /**
   * Build Viator affiliate link (activities/tours)
   */
  private buildViatorLink(destination: string, metadata?: any): string {
    const { affiliateId, baseUrl } = this.partners.viator;
    const destinationSlug = destination.toLowerCase().replace(/\s+/g, '-');
    
    return `${baseUrl}/${destinationSlug}?pid=${affiliateId}`;
  }

  /**
   * Build Booking.com affiliate link (accommodation)
   */
  private buildBookingLink(destination: string, date: string, metadata?: any): string {
    const { affiliateId, baseUrl } = this.partners.booking;
    const params = new URLSearchParams({
      aid: affiliateId,
      dest_type: 'city',
      ss: destination,
      checkin: date,
    });

    if (metadata?.checkout) {
      params.append('checkout', metadata.checkout);
    }

    return `${baseUrl}/searchresults.html?${params.toString()}`;
  }

  /**
   * Build GetYourGuide affiliate link (activities/tours)
   */
  private buildGetYourGuideLink(destination: string, metadata?: any): string {
    const { affiliateId, baseUrl } = this.partners.getyourguide;
    const destinationSlug = destination.toLowerCase().replace(/\s+/g, '-');
    
    return `${baseUrl}/${destinationSlug}-l123/?partner_id=${affiliateId}`;
  }

  /**
   * Track affiliate link generation
   */
  private async trackLinkGeneration(
    partner: string,
    itemType: string,
    destination: string,
    attribution?: AffiliateAttribution
  ) {
    try {
      const initiatedBy = attribution?.initiatedBy || 'user';
      const agentType = attribution?.agentType || null;
      const sessionId = attribution?.sessionId || null;
      await db.execute(sql`
        INSERT INTO affiliate_links (
          partner, item_type, destination, generated_at
        ) VALUES (${partner}, ${itemType}, ${destination}, NOW())
      `);
      // Also record the click attribution context so calls to trackClick can be linked
      console.log(`[Affiliate] Link generated by ${initiatedBy}${agentType ? '/' + agentType : ''} for ${destination}`);
    } catch (error) {
      console.error('Track link error:', error);
    }
  }

  /**
   * Track affiliate click with optional attribution
   */
  async trackClick(
    linkId: string,
    userId?: string,
    attribution?: AffiliateAttribution
  ) {
    try {
      const userIdValue = userId || null;
      const initiatedBy = attribution?.initiatedBy || 'user';
      const agentType = attribution?.agentType || null;
      const sessionId = attribution?.sessionId || null;
      await db.execute(sql`
        INSERT INTO affiliate_clicks (
          link_id, user_id, initiated_by, agent_type, session_id, clicked_at
        ) VALUES (${linkId}, ${userIdValue}, ${initiatedBy}, ${agentType}, ${sessionId}, NOW())
      `);

      // Increment click count
      await db.execute(sql`
        UPDATE affiliate_links SET clicks = clicks + 1 WHERE id = ${linkId}
      `);
    } catch (error) {
      console.error('Track click error:', error);
    }
  }

  /**
   * Track affiliate conversion (booking made through link)
   */
  async trackConversion(
    linkId: string,
    userId: string,
    amount: number,
    commission: number
  ) {
    try {
      await db.execute(sql`
        INSERT INTO affiliate_conversions (
          link_id, user_id, amount, commission, converted_at
        ) VALUES (${linkId}, ${userId}, ${amount}, ${commission}, NOW())
      `);

      // Update affiliate stats
      await db.execute(sql`
        UPDATE affiliate_links
        SET conversions = conversions + 1,
            total_revenue = total_revenue + ${amount}
        WHERE id = ${linkId}
      `);
    } catch (error) {
      console.error('Track conversion error:', error);
    }
  }

  /**
   * Get affiliate performance stats
   */
  async getStats(startDate?: string, endDate?: string) {
    try {
      let stats;
      if (startDate && endDate) {
        stats = await db.execute(sql`
          SELECT
            partner,
            COUNT(*) as total_links,
            SUM(clicks) as total_clicks,
            SUM(conversions) as total_conversions,
            SUM(total_revenue) as total_revenue
          FROM affiliate_links
          WHERE generated_at BETWEEN ${startDate} AND ${endDate}
          GROUP BY partner
        `);
      } else {
        stats = await db.execute(sql`
          SELECT
            partner,
            COUNT(*) as total_links,
            SUM(clicks) as total_clicks,
            SUM(conversions) as total_conversions,
            SUM(total_revenue) as total_revenue
          FROM affiliate_links
          GROUP BY partner
        `);
      }
      return stats.rows || [];
    } catch (error) {
      console.error('Get stats error:', error);
      return [];
    }
  }

  /**
   * Get deep link for specific product
   */
  async getDeepLink(partner: string, productId: string, metadata?: any): Promise<string | null> {
    try {
      const partnerConfig = this.partners[partner as keyof typeof this.partners];
      if (!partnerConfig) {
        return null;
      }

      // Build deep link based on partner
      switch (partner) {
        case 'viator':
          return `${partnerConfig.baseUrl}/tours/${productId}?pid=${partnerConfig.affiliateId}`;
        case 'getyourguide':
          return `${partnerConfig.baseUrl}/activity/t-${productId}?partner_id=${partnerConfig.affiliateId}`;
        default:
          return null;
      }
    } catch (error) {
      console.error('Deep link error:', error);
      return null;
    }
  }
}

export const affiliateService = new AffiliateService();
