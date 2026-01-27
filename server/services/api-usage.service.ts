import { db } from "../db";
import { apiUsageLogs } from "@shared/schema";
import { eq, desc, sql, gte, and } from "drizzle-orm";

export interface ApiUsageLogParams {
  provider: string;
  endpoint: string;
  operation: string;
  userId?: string;
  requestCount?: number;
  estimatedCostCents: number;
  costPerCallCents: number;
  responseTimeMs?: number;
  success?: boolean;
  errorMessage?: string;
  resultCount?: number;
  metadata?: Record<string, any>;
}

// Amadeus Self-Service API pricing (cents per call)
// Based on https://developers.amadeus.com/pricing (Jan 2026)
export const AMADEUS_PRICING = {
  // Flight APIs - $0.003-$0.01 per call
  flight_offers_search: 0.3, // $0.003
  flight_offers_price: 0.5,
  flight_create_orders: 1.0,
  flight_order_management: 0.3,
  seatmap_display: 0.5,
  
  // Hotel APIs - $0.003-$0.02 per call
  hotel_list: 0.3, // $0.003
  hotel_search: 0.5,
  hotel_offers: 1.0,
  hotel_booking: 2.0,
  
  // Location/Reference APIs - typically free or very low cost
  airport_city_search: 0.1,
  airline_lookup: 0.1,
  
  // Points of Interest - $0.003-$0.01 per call
  poi_search: 0.3,
  poi_by_id: 0.3,
  
  // Activities - $0.01-$0.02 per call
  activities_search: 1.0,
  activity_by_id: 0.5,
  
  // Transfers - $0.01-$0.02 per call
  transfer_offers: 1.0,
  transfer_order: 2.0,
  
  // Safety ratings - $0.003 per call
  safety_rated_locations: 0.3,
  
  // Default for unknown endpoints
  default: 0.5,
} as const;

export class ApiUsageService {
  
  async logApiCall(params: ApiUsageLogParams): Promise<void> {
    try {
      await db.insert(apiUsageLogs).values({
        provider: params.provider,
        endpoint: params.endpoint,
        operation: params.operation,
        userId: params.userId || null,
        requestCount: params.requestCount || 1,
        estimatedCostCents: params.estimatedCostCents,
        costPerCallCents: params.costPerCallCents,
        responseTimeMs: params.responseTimeMs || 0,
        success: params.success ?? true,
        errorMessage: params.errorMessage || null,
        resultCount: params.resultCount || 0,
        metadata: params.metadata || {},
      });
    } catch (error) {
      console.error('[ApiUsageService] Failed to log API call:', error);
    }
  }

  async logAmadeusCall(
    endpoint: keyof typeof AMADEUS_PRICING | string,
    operation: string,
    options: {
      userId?: string;
      responseTimeMs?: number;
      success?: boolean;
      errorMessage?: string;
      resultCount?: number;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<void> {
    const costPerCallCents = AMADEUS_PRICING[endpoint as keyof typeof AMADEUS_PRICING] || AMADEUS_PRICING.default;
    
    await this.logApiCall({
      provider: 'amadeus',
      endpoint,
      operation,
      userId: options.userId,
      estimatedCostCents: Math.round(costPerCallCents),
      costPerCallCents: Math.round(costPerCallCents * 100) / 100,
      responseTimeMs: options.responseTimeMs,
      success: options.success,
      errorMessage: options.errorMessage,
      resultCount: options.resultCount,
      metadata: options.metadata,
    });
  }

  async getUsageSummary(days: number = 30): Promise<{
    totalCalls: number;
    totalCostCents: number;
    totalCostDollars: number;
    byProvider: Record<string, { calls: number; costCents: number }>;
    byEndpoint: Record<string, { calls: number; costCents: number }>;
    averageResponseTimeMs: number;
    successRate: number;
  }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const logs = await db.select()
      .from(apiUsageLogs)
      .where(gte(apiUsageLogs.createdAt, cutoffDate));

    const totalCalls = logs.reduce((sum, log) => sum + (log.requestCount || 1), 0);
    const totalCostCents = logs.reduce((sum, log) => sum + (log.estimatedCostCents || 0), 0);
    const successfulCalls = logs.filter(log => log.success).length;
    const totalResponseTime = logs.reduce((sum, log) => sum + (log.responseTimeMs || 0), 0);

    const byProvider: Record<string, { calls: number; costCents: number }> = {};
    const byEndpoint: Record<string, { calls: number; costCents: number }> = {};

    for (const log of logs) {
      const provider = log.provider;
      const endpoint = log.endpoint;
      const calls = log.requestCount || 1;
      const cost = log.estimatedCostCents || 0;

      if (!byProvider[provider]) {
        byProvider[provider] = { calls: 0, costCents: 0 };
      }
      byProvider[provider].calls += calls;
      byProvider[provider].costCents += cost;

      if (!byEndpoint[endpoint]) {
        byEndpoint[endpoint] = { calls: 0, costCents: 0 };
      }
      byEndpoint[endpoint].calls += calls;
      byEndpoint[endpoint].costCents += cost;
    }

    return {
      totalCalls,
      totalCostCents,
      totalCostDollars: totalCostCents / 100,
      byProvider,
      byEndpoint,
      averageResponseTimeMs: logs.length > 0 ? Math.round(totalResponseTime / logs.length) : 0,
      successRate: logs.length > 0 ? Math.round((successfulCalls / logs.length) * 100) : 100,
    };
  }

  async getDailyUsage(days: number = 30): Promise<Array<{
    date: string;
    calls: number;
    costCents: number;
  }>> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await db.execute(sql`
      SELECT 
        DATE(created_at) as date,
        SUM(request_count) as calls,
        SUM(estimated_cost_cents) as cost_cents
      FROM api_usage_logs
      WHERE created_at >= ${cutoffDate}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT ${days}
    `);

    return (result.rows as any[]).map(row => ({
      date: row.date,
      calls: parseInt(row.calls) || 0,
      costCents: parseInt(row.cost_cents) || 0,
    }));
  }

  async getRecentLogs(limit: number = 100): Promise<Array<{
    id: string;
    provider: string;
    endpoint: string;
    operation: string;
    requestCount: number;
    estimatedCostCents: number;
    responseTimeMs: number;
    success: boolean;
    errorMessage: string | null;
    resultCount: number;
    createdAt: Date | null;
  }>> {
    const logs = await db.select()
      .from(apiUsageLogs)
      .orderBy(desc(apiUsageLogs.createdAt))
      .limit(limit);

    return logs.map(log => ({
      id: log.id,
      provider: log.provider,
      endpoint: log.endpoint,
      operation: log.operation,
      requestCount: log.requestCount || 1,
      estimatedCostCents: log.estimatedCostCents || 0,
      responseTimeMs: log.responseTimeMs || 0,
      success: log.success ?? true,
      errorMessage: log.errorMessage,
      resultCount: log.resultCount || 0,
      createdAt: log.createdAt,
    }));
  }

  getPricingInfo(): {
    providers: Record<string, {
      endpoints: Record<string, number>;
      note: string;
    }>;
    lastUpdated: string;
  } {
    return {
      providers: {
        amadeus: {
          endpoints: AMADEUS_PRICING,
          note: 'Amadeus Self-Service API pricing (cents per call). Free tier: 1,000-10,000 calls/month depending on endpoint.',
        },
      },
      lastUpdated: '2026-01',
    };
  }
}

export const apiUsageService = new ApiUsageService();
