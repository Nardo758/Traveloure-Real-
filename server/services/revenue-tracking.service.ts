import { storage } from "../storage";
import { db } from "../db";
import { 
  platformRevenue, expertEarnings, providerEarnings, 
  serviceBookings, templatePurchases, expertTips, affiliateEarnings,
  dailyRevenueSummary, revenueSplits,
  contentRegistry
} from "@shared/schema";
import { eq, desc, sql, and, gte, lte, count, sum } from "drizzle-orm";

export interface RevenueEvent {
  sourceType: 'booking_commission' | 'template_commission' | 'affiliate_commission' | 'tip_commission' | 'subscription' | 'other';
  sourceId: string;
  trackingNumber?: string;
  grossAmount: number;
  expertId?: string;
  expertShare?: number;
  providerId?: string;
  providerShare?: number;
  description?: string;
  metadata?: Record<string, any>;
}

export interface UnifiedRevenueDashboard {
  platform: {
    totalRevenue: number;
    thisMonth: number;
    lastMonth: number;
    growthPercent: number;
    bySource: Record<string, number>;
  };
  experts: {
    totalPaid: number;
    totalPending: number;
    activeExperts: number;
  };
  providers: {
    totalPaid: number;
    totalPending: number;
    activeProviders: number;
  };
  recentTransactions: Array<{
    id: string;
    date: Date;
    sourceType: string;
    grossAmount: number;
    platformFee: number;
    trackingNumber?: string;
  }>;
  dailyTrend: Array<{
    date: string;
    platformRevenue: number;
    expertPayouts: number;
    providerPayouts: number;
  }>;
}

class RevenueTrackingService {
  async recordRevenueEvent(event: RevenueEvent): Promise<void> {
    const revenueSplit = await storage.getRevenueSplit(event.sourceType.replace('_commission', ''));
    const platformPercentage = parseFloat(revenueSplit?.platformPercentage || '10') / 100;
    
    const platformFee = event.grossAmount * platformPercentage;
    // Use consistent 3% processing fee rate across all revenue calculations
    const processingFeeRate = 0.03;
    const processingFees = platformFee * processingFeeRate;
    const netAmount = platformFee - processingFees;

    await storage.recordPlatformRevenue({
      sourceType: event.sourceType,
      sourceId: event.sourceId,
      trackingNumber: event.trackingNumber,
      grossAmount: String(event.grossAmount),
      platformFee: String(platformFee),
      netAmount: String(netAmount),
      processingFees: String(processingFees),
      expertId: event.expertId,
      expertEarnings: event.expertShare ? String(event.expertShare) : '0',
      providerId: event.providerId,
      providerEarnings: event.providerShare ? String(event.providerShare) : '0',
      description: event.description,
      metadata: event.metadata || {},
      status: 'recorded',
      transactionDate: new Date(),
    });

    if (event.expertId && event.expertShare) {
      await storage.createExpertEarning({
        expertId: event.expertId,
        type: event.sourceType,
        amount: String(event.expertShare),
        referenceId: event.sourceId,
        referenceType: event.sourceType,
        description: event.description,
        status: 'pending',
      });
    }

    if (event.providerId && event.providerShare) {
      await storage.createProviderEarning({
        providerId: event.providerId,
        type: event.sourceType,
        amount: String(event.providerShare),
        sourceType: event.sourceType,
        sourceId: event.sourceId,
        trackingNumber: event.trackingNumber,
        description: event.description,
        status: 'pending',
      });
    }
  }

  async getUnifiedDashboard(): Promise<UnifiedRevenueDashboard> {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const [platformSummary, thisMonthRevenue, lastMonthRevenue] = await Promise.all([
      storage.getPlatformRevenueSummary(),
      storage.getPlatformRevenueSummary(thisMonthStart, now),
      storage.getPlatformRevenueSummary(lastMonthStart, lastMonthEnd),
    ]);

    const growthPercent = lastMonthRevenue.totalPlatformFee > 0
      ? ((thisMonthRevenue.totalPlatformFee - lastMonthRevenue.totalPlatformFee) / lastMonthRevenue.totalPlatformFee) * 100
      : 0;

    const [expertStats, providerStats, recentTxns, dailyTrend] = await Promise.all([
      this.getExpertEarningsStats(),
      this.getProviderEarningsStats(),
      this.getRecentTransactions(10),
      this.getDailyTrend(30),
    ]);

    return {
      platform: {
        totalRevenue: platformSummary.totalPlatformFee,
        thisMonth: thisMonthRevenue.totalPlatformFee,
        lastMonth: lastMonthRevenue.totalPlatformFee,
        growthPercent: Math.round(growthPercent * 10) / 10,
        bySource: platformSummary.bySource,
      },
      experts: expertStats,
      providers: providerStats,
      recentTransactions: recentTxns,
      dailyTrend,
    };
  }

  private async getExpertEarningsStats() {
    const allEarnings = await db.select().from(expertEarnings);
    const pending = allEarnings.filter(e => e.status === 'pending');
    const paidOut = allEarnings.filter(e => e.status === 'paid_out');
    const uniqueExperts = new Set(allEarnings.map(e => e.expertId));

    return {
      totalPaid: paidOut.reduce((sum, e) => sum + parseFloat(e.amount || '0'), 0),
      totalPending: pending.reduce((sum, e) => sum + parseFloat(e.amount || '0'), 0),
      activeExperts: uniqueExperts.size,
    };
  }

  private async getProviderEarningsStats() {
    const allEarnings = await db.select().from(providerEarnings);
    const pending = allEarnings.filter(e => e.status === 'pending');
    const paidOut = allEarnings.filter(e => e.status === 'paid_out');
    const uniqueProviders = new Set(allEarnings.map(e => e.providerId));

    return {
      totalPaid: paidOut.reduce((sum, e) => sum + parseFloat(e.amount || '0'), 0),
      totalPending: pending.reduce((sum, e) => sum + parseFloat(e.amount || '0'), 0),
      activeProviders: uniqueProviders.size,
    };
  }

  private async getRecentTransactions(limit: number) {
    const txns = await db.select()
      .from(platformRevenue)
      .orderBy(desc(platformRevenue.transactionDate))
      .limit(limit);

    return txns.map(t => ({
      id: t.id,
      date: t.transactionDate || new Date(),
      sourceType: t.sourceType,
      grossAmount: parseFloat(t.grossAmount || '0'),
      platformFee: parseFloat(t.platformFee || '0'),
      trackingNumber: t.trackingNumber || undefined,
    }));
  }

  private async getDailyTrend(days: number) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const summaries = await db.select()
      .from(dailyRevenueSummary)
      .where(and(
        gte(dailyRevenueSummary.date, startDate.toISOString().split('T')[0]),
        lte(dailyRevenueSummary.date, endDate.toISOString().split('T')[0])
      ))
      .orderBy(dailyRevenueSummary.date);

    return summaries.map(s => ({
      date: s.date,
      platformRevenue: parseFloat(s.totalPlatformFee || '0'),
      expertPayouts: parseFloat(s.totalExpertEarnings || '0'),
      providerPayouts: parseFloat(s.totalProviderEarnings || '0'),
    }));
  }

  async getExpertRevenueDetails(expertId: string) {
    const [earnings, payouts, tips, affiliates] = await Promise.all([
      storage.getExpertEarnings(expertId),
      storage.getExpertPayouts(expertId),
      storage.getTipsForExpert(expertId),
      storage.getAffiliateEarnings(expertId),
    ]);

    const earningsSummary = await storage.getExpertEarningsSummary(expertId);
    const affiliateSummary = await storage.getAffiliateEarningsSummary(expertId);

    return {
      summary: {
        totalEarnings: earningsSummary.total,
        pendingEarnings: earningsSummary.pending,
        availableEarnings: earningsSummary.available,
        paidOut: earningsSummary.paidOut,
        totalTips: tips.totalAmount,
        totalAffiliateCommissions: affiliateSummary.total,
      },
      earnings: earnings.slice(0, 20),
      payouts: payouts.slice(0, 10),
      recentTips: tips.tips.slice(0, 10),
      recentAffiliateEarnings: affiliates.slice(0, 10),
    };
  }

  async getProviderRevenueDetails(providerId: string) {
    const [earnings, payouts] = await Promise.all([
      storage.getProviderEarnings(providerId),
      storage.getProviderPayouts(providerId),
    ]);

    const summary = await storage.getProviderEarningsSummary(providerId);

    const byService: Record<string, number> = {};
    for (const e of earnings) {
      const service = e.sourceType || 'other';
      byService[service] = (byService[service] || 0) + parseFloat(e.amount || '0');
    }

    return {
      summary: {
        totalEarnings: summary.total,
        pendingEarnings: summary.pending,
        availableEarnings: summary.available,
        paidOut: summary.paidOut,
      },
      byService,
      earnings: earnings.slice(0, 20),
      payouts: payouts.slice(0, 10),
    };
  }

  async getContentRevenueReport(trackingNumber: string) {
    const revenues = await db.select()
      .from(platformRevenue)
      .where(eq(platformRevenue.trackingNumber, trackingNumber))
      .orderBy(desc(platformRevenue.transactionDate));

    const content = await db.select()
      .from(contentRegistry)
      .where(eq(contentRegistry.trackingNumber, trackingNumber))
      .limit(1);

    const totalPlatformFee = revenues.reduce((sum, r) => sum + parseFloat(r.platformFee || '0'), 0);
    const totalExpertEarnings = revenues.reduce((sum, r) => sum + parseFloat(r.expertEarnings || '0'), 0);
    const totalProviderEarnings = revenues.reduce((sum, r) => sum + parseFloat(r.providerEarnings || '0'), 0);

    return {
      trackingNumber,
      content: content[0] || null,
      totalTransactions: revenues.length,
      totalGross: revenues.reduce((sum, r) => sum + parseFloat(r.grossAmount || '0'), 0),
      totalPlatformFee,
      totalExpertEarnings,
      totalProviderEarnings,
      transactions: revenues,
    };
  }
}

export const revenueTrackingService = new RevenueTrackingService();
