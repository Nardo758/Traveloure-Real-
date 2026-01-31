/**
 * Pricing Service
 * Dynamic pricing, fee calculations, deposit handling
 */

import { db } from '../db';

interface FeeBreakdown {
  serviceAmount: number;
  platformFee: number;
  providerDeduction: number;
  providerPayout: number;
  totalAmount: number;
}

class PricingService {
  // Platform fee percentages by category
  private readonly feeRates = {
    accommodation: 0.15,    // 15%
    transportation: 0.10,   // 10%
    activities: 0.12,       // 12%
    dining: 0.08,           // 8%
    shopping: 0.05,         // 5%
    expert_services: 0.20,  // 20%
    default: 0.12,          // 12%
  };

  // Deposit percentages
  private readonly depositRate = 0.25; // 25% deposit

  /**
   * Get current price for a service
   */
  async getPrice(
    providerId: string,
    date: string,
    travelers: number = 1
  ): Promise<number> {
    try {
      // Get base price from provider
      const provider = await db.execute(
        `SELECT base_price, price_per_person FROM service_providers WHERE id = ?`,
        [providerId]
      );

      if (!provider.rows || provider.rows.length === 0) {
        throw new Error('Provider not found');
      }

      const { base_price, price_per_person } = provider.rows[0];

      // Check for dynamic pricing rules
      const dynamicPrice = await this.getDynamicPrice(providerId, date);
      if (dynamicPrice) {
        return dynamicPrice * travelers;
      }

      // Default pricing: base + per person
      return base_price + (price_per_person * (travelers - 1));
    } catch (error: any) {
      console.error('Get price error:', error);
      throw new Error(`Pricing error: ${error.message}`);
    }
  }

  /**
   * Get dynamic pricing based on demand, season, etc.
   */
  private async getDynamicPrice(providerId: string, date: string): Promise<number | null> {
    try {
      // Check for special pricing rules
      const pricing = await db.execute(
        `SELECT price FROM dynamic_pricing
        WHERE provider_id = ?
          AND ? BETWEEN start_date AND end_date
        ORDER BY priority DESC
        LIMIT 1`,
        [providerId, date]
      );

      return pricing.rows?.[0]?.price || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Calculate platform fees
   */
  calculatePlatformFees(serviceAmount: number, category: string): FeeBreakdown {
    const feeRate = this.feeRates[category as keyof typeof this.feeRates] || this.feeRates.default;
    
    const platformFee = Math.round(serviceAmount * feeRate * 100) / 100;
    const providerDeduction = platformFee;
    const providerPayout = serviceAmount - providerDeduction;
    const totalAmount = serviceAmount + platformFee;

    return {
      serviceAmount,
      platformFee,
      providerDeduction,
      providerPayout,
      totalAmount,
    };
  }

  /**
   * Calculate deposit amount (25% default)
   */
  calculateDeposit(totalAmount: number, customRate?: number): number {
    const rate = customRate || this.depositRate;
    return Math.round(totalAmount * rate * 100) / 100;
  }

  /**
   * Calculate balance due
   */
  calculateBalance(totalAmount: number, depositPaid: number): number {
    return Math.round((totalAmount - depositPaid) * 100) / 100;
  }

  /**
   * Calculate expert fee (for personal assistant bookings)
   */
  calculateExpertFee(bookingAmount: number, expertTier: string = 'standard'): number {
    const expertRates = {
      standard: 0.10,   // 10%
      premium: 0.15,    // 15%
      concierge: 0.20,  // 20%
    };

    const rate = expertRates[expertTier as keyof typeof expertRates] || expertRates.standard;
    return Math.round(bookingAmount * rate * 100) / 100;
  }

  /**
   * Apply promo code discount
   */
  async applyPromoCode(code: string, amount: number, userId: string) {
    try {
      const promo = await db.execute(
        `SELECT * FROM promo_codes
        WHERE code = ?
          AND active = 1
          AND (expires_at IS NULL OR expires_at > datetime('now'))
          AND (usage_limit IS NULL OR usage_count < usage_limit)`,
        [code.toUpperCase()]
      );

      if (!promo.rows || promo.rows.length === 0) {
        return { valid: false, error: 'Invalid or expired promo code' };
      }

      const promoData = promo.rows[0];

      // Check if user already used this code
      const userUsage = await db.execute(
        `SELECT id FROM promo_code_usage
        WHERE promo_code_id = ? AND user_id = ?`,
        [promoData.id, userId]
      );

      if (userUsage.rows && userUsage.rows.length > 0) {
        return { valid: false, error: 'Promo code already used' };
      }

      // Calculate discount
      let discount = 0;
      if (promoData.discount_type === 'percentage') {
        discount = Math.round(amount * (promoData.discount_value / 100) * 100) / 100;
        if (promoData.max_discount && discount > promoData.max_discount) {
          discount = promoData.max_discount;
        }
      } else {
        // Fixed amount
        discount = promoData.discount_value;
      }

      // Ensure discount doesn't exceed amount
      discount = Math.min(discount, amount);

      return {
        valid: true,
        discount,
        finalAmount: amount - discount,
        promoCodeId: promoData.id,
      };
    } catch (error: any) {
      console.error('Promo code error:', error);
      return { valid: false, error: error.message };
    }
  }

  /**
   * Record promo code usage
   */
  async recordPromoUsage(promoCodeId: string, userId: string, bookingId: string) {
    try {
      await db.execute(
        `INSERT INTO promo_code_usage (
          promo_code_id, user_id, booking_id, used_at
        ) VALUES (?, ?, ?, datetime('now'))`,
        [promoCodeId, userId, bookingId]
      );

      // Increment usage count
      await db.execute(
        `UPDATE promo_codes SET usage_count = usage_count + 1 WHERE id = ?`,
        [promoCodeId]
      );
    } catch (error) {
      console.error('Record promo usage error:', error);
    }
  }

  /**
   * Get price estimate for trip planning
   */
  async estimateTripCost(tripItems: any[]) {
    let total = 0;
    const breakdown: any[] = [];

    for (const item of tripItems) {
      try {
        const price = await this.getPrice(item.providerId, item.date, item.travelers || 1);
        const fees = this.calculatePlatformFees(price, item.category);

        breakdown.push({
          title: item.title,
          serviceAmount: fees.serviceAmount,
          platformFee: fees.platformFee,
          totalAmount: fees.totalAmount,
        });

        total += fees.totalAmount;
      } catch (error) {
        console.error(`Error estimating ${item.title}:`, error);
      }
    }

    const depositAmount = this.calculateDeposit(total);
    const balanceAmount = this.calculateBalance(total, depositAmount);

    return {
      breakdown,
      subtotal: total,
      depositAmount,
      balanceAmount,
      totalAmount: total,
    };
  }
}

export const pricingService = new PricingService();
