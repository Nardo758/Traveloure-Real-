import { db } from "../db";
import { apiUsageLogs } from "@shared/schema";
import { gte, and, lte, inArray } from "drizzle-orm";

export interface ApiCostEntry {
  provider: string;
  calls: number;
  costDollars: number;
}

export interface ApiCostsSummary {
  entries: ApiCostEntry[];
  totalCostDollars: number;
}

function getDateBounds(period: string): { from: Date; to: Date } {
  const now = new Date();

  if (period === "last_month") {
    return {
      from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59),
    };
  }

  if (period === "last_90_days") {
    return {
      from: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
      to: now,
    };
  }

  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: now,
  };
}

export async function getApiCostsSummary(period: string): Promise<ApiCostsSummary> {
  const { from, to } = getDateBounds(period);
  const trackedProviders = ["amadeus", "serpapi", "serp_api"];

  const logs = await db
    .select()
    .from(apiUsageLogs)
    .where(and(gte(apiUsageLogs.createdAt, from), lte(apiUsageLogs.createdAt, to)));

  const byCostProvider: Record<string, { calls: number; costTenths: number }> = {};

  for (const log of logs) {
    const provider = log.provider.toLowerCase();
    if (!byCostProvider[provider]) {
      byCostProvider[provider] = { calls: 0, costTenths: 0 };
    }
    byCostProvider[provider].calls += log.requestCount || 1;
    byCostProvider[provider].costTenths += log.estimatedCostCents || 0;
  }

  const providerNormalize: Record<string, string> = {
    serpapi: "SerpAPI",
    serp_api: "SerpAPI",
    amadeus: "Amadeus",
  };

  const aggregated: Record<string, { calls: number; costTenths: number; label: string }> = {};
  for (const [provider, data] of Object.entries(byCostProvider)) {
    const label = providerNormalize[provider] || provider;
    if (!aggregated[label]) {
      aggregated[label] = { calls: 0, costTenths: 0, label };
    }
    aggregated[label].calls += data.calls;
    aggregated[label].costTenths += data.costTenths;
  }

  const entries: ApiCostEntry[] = Object.entries(aggregated).map(([, data]) => ({
    provider: data.label,
    calls: data.calls,
    costDollars: data.costTenths / 1000,
  }));

  entries.sort((a, b) => b.costDollars - a.costDollars);

  const totalCostDollars = entries.reduce((sum, e) => sum + e.costDollars, 0);

  return { entries, totalCostDollars };
}
