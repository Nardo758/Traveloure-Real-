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

const TRACKED_PROVIDERS = ["amadeus", "serpapi", "serp_api"];

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  amadeus: "Amadeus",
  serpapi: "SerpAPI",
  serp_api: "SerpAPI",
};

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

  // Filter to only tracked/billed providers before aggregating
  const logs = await db
    .select()
    .from(apiUsageLogs)
    .where(
      and(
        gte(apiUsageLogs.createdAt, from),
        lte(apiUsageLogs.createdAt, to),
        inArray(apiUsageLogs.provider, TRACKED_PROVIDERS)
      )
    );

  // Aggregate by normalized display name to deduplicate serpapi/serp_api
  const aggregated: Record<string, { calls: number; costTenths: number }> = {};

  for (const log of logs) {
    const label = PROVIDER_DISPLAY_NAMES[log.provider.toLowerCase()] ?? log.provider;
    if (!aggregated[label]) {
      aggregated[label] = { calls: 0, costTenths: 0 };
    }
    aggregated[label].calls += log.requestCount || 1;
    aggregated[label].costTenths += log.estimatedCostCents || 0;
  }

  const entries: ApiCostEntry[] = Object.entries(aggregated).map(([provider, data]) => ({
    provider,
    calls: data.calls,
    // estimatedCostCents stores tenths-of-cents for external API logs (see api-usage.service.ts)
    costDollars: data.costTenths / 1000,
  }));

  entries.sort((a, b) => b.costDollars - a.costDollars);

  const totalCostDollars = entries.reduce((sum, e) => sum + e.costDollars, 0);

  return { entries, totalCostDollars };
}
