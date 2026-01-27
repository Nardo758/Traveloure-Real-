import { db } from "../db";
import { aiUsageLogs, type InsertAiUsageLog, type AiUsageLog } from "@shared/schema";
import { eq, sql, desc, and, gte, lte } from "drizzle-orm";
import { GrokUsageStats } from "./grok.service";

export interface AIUsageLogInput {
  provider: 'grok' | 'anthropic' | 'openai';
  model: string;
  operation: string;
  userId?: string;
  usage: GrokUsageStats;
  responseTimeMs?: number;
  success?: boolean;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface UsageSummary {
  totalCalls: number;
  totalTokens: number;
  totalCostCents: number;
  totalCostDollars: number;
  byProvider: Record<string, { calls: number; tokens: number; costCents: number }>;
  byOperation: Record<string, { calls: number; tokens: number; costCents: number }>;
  byModel: Record<string, { calls: number; tokens: number; costCents: number }>;
  averageResponseTimeMs: number;
  successRate: number;
}

export interface DailyUsage {
  date: string;
  calls: number;
  tokens: number;
  costCents: number;
}

class AIUsageService {
  async logUsage(input: AIUsageLogInput): Promise<AiUsageLog | null> {
    try {
      const costCents = input.usage.costCents ?? Math.round(input.usage.estimatedCost * 100);
      
      const [log] = await db.insert(aiUsageLogs).values({
        provider: input.provider,
        model: input.model,
        operation: input.operation,
        userId: input.userId ?? null,
        promptTokens: input.usage.promptTokens,
        completionTokens: input.usage.completionTokens,
        totalTokens: input.usage.totalTokens,
        estimatedCostCents: costCents,
        inputCostPerMillion: input.usage.inputRate ?? 0,
        outputCostPerMillion: input.usage.outputRate ?? 0,
        responseTimeMs: input.responseTimeMs ?? 0,
        success: input.success ?? true,
        errorMessage: input.errorMessage ?? null,
        metadata: input.metadata ?? {},
      }).returning();
      
      return log;
    } catch (error) {
      console.error('[AIUsageService] Failed to log usage:', error);
      return null;
    }
  }

  async getSummary(startDate?: Date, endDate?: Date): Promise<UsageSummary> {
    const conditions = [];
    if (startDate) {
      conditions.push(gte(aiUsageLogs.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(aiUsageLogs.createdAt, endDate));
    }

    const logs = await db.select().from(aiUsageLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const byProvider: Record<string, { calls: number; tokens: number; costCents: number }> = {};
    const byOperation: Record<string, { calls: number; tokens: number; costCents: number }> = {};
    const byModel: Record<string, { calls: number; tokens: number; costCents: number }> = {};
    
    let totalResponseTime = 0;
    let successCount = 0;

    for (const log of logs) {
      if (!byProvider[log.provider]) {
        byProvider[log.provider] = { calls: 0, tokens: 0, costCents: 0 };
      }
      byProvider[log.provider].calls++;
      byProvider[log.provider].tokens += log.totalTokens;
      byProvider[log.provider].costCents += log.estimatedCostCents;

      if (!byOperation[log.operation]) {
        byOperation[log.operation] = { calls: 0, tokens: 0, costCents: 0 };
      }
      byOperation[log.operation].calls++;
      byOperation[log.operation].tokens += log.totalTokens;
      byOperation[log.operation].costCents += log.estimatedCostCents;

      if (!byModel[log.model]) {
        byModel[log.model] = { calls: 0, tokens: 0, costCents: 0 };
      }
      byModel[log.model].calls++;
      byModel[log.model].tokens += log.totalTokens;
      byModel[log.model].costCents += log.estimatedCostCents;

      totalResponseTime += log.responseTimeMs ?? 0;
      if (log.success) successCount++;
    }

    const totalCalls = logs.length;
    const totalTokens = logs.reduce((sum, l) => sum + l.totalTokens, 0);
    const totalCostCents = logs.reduce((sum, l) => sum + l.estimatedCostCents, 0);

    return {
      totalCalls,
      totalTokens,
      totalCostCents,
      totalCostDollars: totalCostCents / 100,
      byProvider,
      byOperation,
      byModel,
      averageResponseTimeMs: totalCalls > 0 ? Math.round(totalResponseTime / totalCalls) : 0,
      successRate: totalCalls > 0 ? Math.round((successCount / totalCalls) * 100) : 100,
    };
  }

  async getDailyUsage(days: number = 30): Promise<DailyUsage[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const logs = await db.select().from(aiUsageLogs)
      .where(gte(aiUsageLogs.createdAt, startDate))
      .orderBy(desc(aiUsageLogs.createdAt));

    const dailyMap = new Map<string, DailyUsage>();

    for (const log of logs) {
      const date = log.createdAt?.toISOString().split('T')[0] ?? '';
      if (!dailyMap.has(date)) {
        dailyMap.set(date, { date, calls: 0, tokens: 0, costCents: 0 });
      }
      const day = dailyMap.get(date)!;
      day.calls++;
      day.tokens += log.totalTokens;
      day.costCents += log.estimatedCostCents;
    }

    return Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  async getRecentLogs(limit: number = 100): Promise<AiUsageLog[]> {
    return db.select().from(aiUsageLogs)
      .orderBy(desc(aiUsageLogs.createdAt))
      .limit(limit);
  }

  async getLogsByOperation(operation: string, limit: number = 50): Promise<AiUsageLog[]> {
    return db.select().from(aiUsageLogs)
      .where(eq(aiUsageLogs.operation, operation))
      .orderBy(desc(aiUsageLogs.createdAt))
      .limit(limit);
  }

  async getLogsByProvider(provider: string, limit: number = 50): Promise<AiUsageLog[]> {
    return db.select().from(aiUsageLogs)
      .where(eq(aiUsageLogs.provider, provider))
      .orderBy(desc(aiUsageLogs.createdAt))
      .limit(limit);
  }
}

export const aiUsageService = new AIUsageService();
