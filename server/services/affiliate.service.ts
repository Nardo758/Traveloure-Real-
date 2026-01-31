/**
 * Affiliate Service
 * Generate and track affiliate links for external bookings
 */

import { db } from '../db';

interface AffiliateLink {
  url: string;
  partner: string;
  commission?: number;
}

class AffiliateService {
  // Affiliate partner configurations
  private readonly partners = {
    twelvego: {
      name: 'TwelveGo',
      affiliateId: process.env.TWELVEGO_AFFILIATE_ID || '13805109',
      baseUrl: 'https://12go.asia',
      categories: ['transportation'],
      commission: 0.05, // 5%
    },
    viator: {
      name: 'Viator',
      affiliateId: process.env.VIATOR_AFFILIATE_ID || '',
      baseUrl: 'https://www.viator.com',
      categories: ['activities', 'tours'],
      commission: 0.08, // 8%
    },
    booking: {
      name: 'Booking.com',
      affiliateId: process.env.BOOKING_AFFILIATE_ID || '',
      baseUrl: 'https://www.booking.com',
      categories: ['accommodation'],
      commission: 0.04, // 4%
    },
    getyourguide: {
      name: 'GetYourGuide',
      affiliateId: process.env.GYG_AFFILIATE_ID || '',
      baseUrl: 'https://www.getyourguide.com',
      categories: ['activities', 'tours'],
      commission: 0.08, // 8%
    },
  };

  /**
   * Generate affiliate link based on item type and destination
   */
  async generateLink(
    itemType: string,
    destination: string,
    date: string,
    metadata?: any
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
      await this.trackLinkGeneration(partner, itemType, destination);

      return {
        url,
        partner: this.partners[partner as keyof typeof this.partners].name,
        commission: this.partners[partner as keyof typeof this.partners].commission,
      };
    } catch (error) {
      console.error('Affiliate link generation error:', error);
      return null;
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
  private async trackLinkGeneration(partner: string, itemType: string, destination: string) {
    try {
      await db.execute(
        `INSERT INTO affiliate_links (
          partner, item_type, destination, generated_at
        ) VALUES (?, ?, ?, datetime('now'))`,
        [partner, itemType, destination]
      );
    } catch (error) {
      console.error('Track link error:', error);
    }
  }

  /**
   * Track affiliate click
   */
  async trackClick(linkId: string, userId?: string) {
    try {
      await db.execute(
        `INSERT INTO affiliate_clicks (
          link_id, user_id, clicked_at
        ) VALUES (?, ?, datetime('now'))`,
        [linkId, userId || null]
      );

      // Increment click count
      await db.execute(
        `UPDATE affiliate_links SET clicks = clicks + 1 WHERE id = ?`,
        [linkId]
      );
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
      await db.execute(
        `INSERT INTO affiliate_conversions (
          link_id, user_id, amount, commission, converted_at
        ) VALUES (?, ?, ?, ?, datetime('now'))`,
        [linkId, userId, amount, commission]
      );

      // Update affiliate stats
      await db.execute(
        `UPDATE affiliate_links
        SET conversions = conversions + 1,
            total_revenue = total_revenue + ?
        WHERE id = ?`,
        [amount, linkId]
      );
    } catch (error) {
      console.error('Track conversion error:', error);
    }
  }

  /**
   * Get affiliate performance stats
   */
  async getStats(startDate?: string, endDate?: string) {
    try {
      let query = `
        SELECT
          partner,
          COUNT(*) as total_links,
          SUM(clicks) as total_clicks,
          SUM(conversions) as total_conversions,
          SUM(total_revenue) as total_revenue
        FROM affiliate_links
      `;

      const params: any[] = [];
      if (startDate && endDate) {
        query += ` WHERE generated_at BETWEEN ? AND ?`;
        params.push(startDate, endDate);
      }

      query += ` GROUP BY partner`;

      const stats = await db.execute(query, params);
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
