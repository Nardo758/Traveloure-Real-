/**
 * Pricing Service
 * Dynamic pricing, fee calculations, deposit handling
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import { resolveCommissionRates } from './commission';

interface FeeBreakdown {
  serviceAmount: number;
  platformFee: number;
  providerDeduction: number;
  providerPayout: number;
  totalAmount: number;
}

class PricingService {
  // FEE-3: deposit rate resolves from booking_fee_configs.platform_deposit_rate.
  // 0.25 is the safe fallback if the row is missing/unseeded so checkout cannot
  // silently drop to a 0 deposit. Cached for 60 s to bound DB load.
  private static readonly DEFAULT_DEPOSIT_RATE = 0.25;
  private static readonly RATE_CACHE_TTL_MS = 60_000;
  private depositRateCache: { value: number; expiresAt: number } | null = null;

  private async loadDepositRate(): Promise<number> {
    if (this.depositRateCache && this.depositRateCache.expiresAt > Date.now()) {
      return this.depositRateCache.value;
    }
    try {
      const result = await db.execute(sql`
        SELECT CAST(platform_fee_percent AS FLOAT) AS rate
        FROM booking_fee_configs
        WHERE category = 'platform_deposit_rate' AND is_active = true
        LIMIT 1
      `);
      const row = result.rows?.[0] as { rate: number | null } | undefined;
      const value = row?.rate !== undefined && row.rate !== null
        ? Number(row.rate) / 100
        : PricingService.DEFAULT_DEPOSIT_RATE;
      this.depositRateCache = { value, expiresAt: Date.now() + PricingService.RATE_CACHE_TTL_MS };
      return value;
    } catch (err) {
      console.warn('[pricing] deposit-rate config lookup failed, using fallback:', err);
      return PricingService.DEFAULT_DEPOSIT_RATE;
    }
  }

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
      const provider = await db.execute(sql`
        SELECT base_price, price_per_person FROM service_providers WHERE id = ${providerId}
      `);

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
      const pricing = await db.execute(sql`
        SELECT price FROM dynamic_pricing
        WHERE provider_id = ${providerId}
          AND ${date} BETWEEN start_date AND end_date
        ORDER BY priority DESC
        LIMIT 1
      `);

      const row = pricing.rows?.[0] as { price: number } | undefined;
      return row?.price || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Calculate platform fees.
   * Reads the live rate from booking_fee_configs via resolveCommissionRates so
   * admin overrides take effect immediately without a restart.
   */
  async calculatePlatformFees(serviceAmount: number, category: string): Promise<FeeBreakdown> {
    const rates = await resolveCommissionRates(category);
    const feeRate = rates.platformFeeRate;

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
   * Calculate deposit amount. Rate resolves from booking_fee_configs.platform_deposit_rate
   * (admin-editable). Falls back to 0.25 if the config row is missing/unreachable.
   */
  async calculateDeposit(totalAmount: number, customRate?: number): Promise<number> {
    const rate = customRate ?? await this.loadDepositRate();
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
      const upperCode = code.toUpperCase();
      const promo = await db.execute(sql`
        SELECT * FROM promo_codes
        WHERE code = ${upperCode}
          AND active = true
          AND (expires_at IS NULL OR expires_at > NOW())
          AND (usage_limit IS NULL OR usage_count < usage_limit)
      `);

      if (!promo.rows || promo.rows.length === 0) {
        return { valid: false, error: 'Invalid or expired promo code' };
      }

      const promoData = promo.rows[0] as any;

      // Check if user already used this code
      const userUsage = await db.execute(sql`
        SELECT id FROM promo_code_usage
        WHERE promo_code_id = ${promoData.id} AND user_id = ${userId}
      `);

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
      await db.execute(sql`
        INSERT INTO promo_code_usage (
          promo_code_id, user_id, booking_id, used_at
        ) VALUES (${promoCodeId}, ${userId}, ${bookingId}, NOW())
      `);

      // Increment usage count
      await db.execute(sql`
        UPDATE promo_codes SET usage_count = usage_count + 1 WHERE id = ${promoCodeId}
      `);
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
        const fees = await this.calculatePlatformFees(price, item.category);

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

    const depositAmount = await this.calculateDeposit(total);
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
