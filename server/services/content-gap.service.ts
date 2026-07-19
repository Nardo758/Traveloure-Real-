/**
 * Content-gap tracker — #2, Kyoto-first.
 *
 * Answers the question the decision-maker raised: "a system that tracks the type of content we have
 * so we can tell the scraper what content to prioritize." It counts the DMO content we actually hold
 * per content type, compares it against a per-market editorial TARGET profile, and records the deficits
 * as `content_gap_alerts` rows. The priority-ingestion pass (dmo-ingestion.service.ts) then reads those
 * alerts to decide which categories the Tavily scraper should fill next — so we stop re-scraping the
 * 10 seeded heritage sites and start filling the thin categories (venues, restaurants, events…).
 *
 * §12 (one-wedge-Kyoto): the target profile is Kyoto-only. §13: this reads real counts and writes only
 * gap *metadata* — it never fabricates traveler-facing content. The target numbers are editorial config
 * (how deep a catalog we want per type), not fabricated data, analogous to the earnings-hold windows.
 *
 * The `KYOTO_CONTENT_PLAN` here is the SINGLE source of truth shared with the ingestion pass: each entry
 * carries the target count, the DMO source to attribute discovered rows to, and the Tavily discovery
 * queries used to fill the gap. Editing the plan re-tunes both the tracker and the scraper's priorities.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { contentGapAlerts, dmoRawContent } from "@shared/schema";
import type { ContentGapAlert } from "@shared/schema";

export const GAP_MARKET = "japan";
export const GAP_CITY = "Kyoto";

/** One content type's editorial plan: how much we want, where discovered rows attach, how to find them. */
export interface ContentTypePlan {
  /** dmoContentTypeEnum value. */
  contentType: string;
  /** Human label for the admin UI. */
  label: string;
  /** Editorial target — how many curated items we want in this category for a launch-ready Kyoto catalog. */
  target: number;
  /** DMO source id (dmo_sources.id) discovered rows are attributed to. Must exist (seeded from the registry). */
  sourceId: string;
  /** Tavily discovery queries — each returns a list of distinct places we turn into born-hidden stubs. */
  discoveryQueries: string[];
}

/**
 * Kyoto editorial content plan (§12). Targets reflect the experience-planning lens (weddings/events):
 * a traveler planning a Kyoto experience needs venues, restaurants and events, not only temples.
 * Targets are intentionally modest launch minimums — an expert curates the rest.
 */
export const KYOTO_CONTENT_PLAN: ContentTypePlan[] = [
  {
    contentType: "attraction",
    label: "Attractions & heritage sites",
    target: 15,
    sourceId: "dmo-jp-kyoto-travel",
    discoveryQueries: [
      "top attractions and temples to visit in Kyoto Japan",
      "must-see cultural sights in Kyoto Japan",
    ],
  },
  {
    contentType: "venue",
    label: "Event & wedding venues",
    target: 12,
    sourceId: "dmo-jp-wedding-venues",
    discoveryQueries: [
      "best wedding venues in Kyoto Japan",
      "private event venues for celebrations in Kyoto Japan",
    ],
  },
  {
    contentType: "restaurant",
    label: "Restaurants (dining & receptions)",
    target: 12,
    sourceId: "dmo-jp-gurunavi",
    discoveryQueries: [
      "best fine dining restaurants in Kyoto Japan",
      "private dining and reception restaurants in Kyoto Japan",
    ],
  },
  {
    contentType: "event",
    label: "Seasonal & cultural events",
    target: 10,
    sourceId: "dmo-jp-kyoto-travel",
    discoveryQueries: [
      "annual festivals and seasonal events in Kyoto Japan",
      "cultural experiences and ceremonies in Kyoto Japan",
    ],
  },
  {
    contentType: "destination",
    label: "Neighborhoods & areas",
    target: 8,
    sourceId: "dmo-jp-kyoto-travel",
    discoveryQueries: [
      "best neighborhoods and districts to explore in Kyoto Japan",
    ],
  },
];

const planByType = new Map(KYOTO_CONTENT_PLAN.map((p) => [p.contentType, p]));

/** Look up a content type's plan (used by the ingestion pass to resolve source + queries for a gap). */
export function getContentTypePlan(contentType: string): ContentTypePlan | undefined {
  return planByType.get(contentType);
}

/** Severity from how far short of target we are (deficit ratio). */
function severityFor(existing: number, target: number): ContentGapAlert["severity"] {
  if (target <= 0) return "low";
  const ratio = existing / target;
  if (ratio <= 0.1) return "critical";
  if (ratio <= 0.4) return "high";
  if (ratio < 1) return "medium";
  return "low";
}

export interface ContentGapRow {
  contentType: string;
  label: string;
  existing: number;
  target: number;
  missing: number;
  severity: ContentGapAlert["severity"];
  alertId: string | null;
}

export interface GapAnalysis {
  market: string;
  city: string;
  ranAt: Date;
  rows: ContentGapRow[];
  openGaps: number;
}

/**
 * Recompute Kyoto content coverage and reconcile `content_gap_alerts` (idempotent):
 *   - existing = non-rejected dmo_raw_content rows for the city, per content type
 *   - if existing < target → upsert ONE open alert for (market, city, contentType) with fresh counts
 *   - if existing >= target → resolve any open alert (set resolved_at) so the queue self-clears
 * Returns the full per-type picture (met and unmet) for the admin UI.
 */
export async function analyzeKyotoContentGaps(): Promise<GapAnalysis> {
  const ranAt = new Date();

  // Real counts per content type (exclude rejected/quarantined — they aren't coverage).
  const counts = await db
    .select({ contentType: dmoRawContent.contentType, n: sql<number>`count(*)::int` })
    .from(dmoRawContent)
    .where(
      and(
        eq(dmoRawContent.city, GAP_CITY),
        sql`${dmoRawContent.status} NOT IN ('rejected', 'quarantined')`,
      ),
    )
    .groupBy(dmoRawContent.contentType);

  const existingByType = new Map(counts.map((c) => [c.contentType, Number(c.n)]));

  // Open (unresolved) alerts for this market/city, keyed by content type.
  const openAlerts = await db
    .select()
    .from(contentGapAlerts)
    .where(
      and(
        eq(contentGapAlerts.market, GAP_MARKET),
        eq(contentGapAlerts.city, GAP_CITY),
        isNull(contentGapAlerts.resolvedAt),
      ),
    );
  const openByType = new Map(openAlerts.map((a) => [a.contentType, a]));

  const rows: ContentGapRow[] = [];

  for (const plan of KYOTO_CONTENT_PLAN) {
    const existing = existingByType.get(plan.contentType) ?? 0;
    const missing = Math.max(0, plan.target - existing);
    const severity = severityFor(existing, plan.target);
    const open = openByType.get(plan.contentType);

    let alertId: string | null = open?.id ?? null;

    if (missing > 0) {
      const gapDescription = `Kyoto has ${existing} ${plan.label.toLowerCase()} vs. a target of ${plan.target} (${missing} short).`;
      if (open) {
        await db
          .update(contentGapAlerts)
          .set({
            severity,
            gapDescription,
            missingCount: missing,
            existingCount: existing,
            contentType: plan.contentType,
            updatedAt: new Date(),
          })
          .where(eq(contentGapAlerts.id, open.id));
        alertId = open.id;
      } else {
        const inserted = await db
          .insert(contentGapAlerts)
          .values({
            market: GAP_MARKET,
            city: GAP_CITY,
            contentType: plan.contentType,
            severity,
            gapDescription,
            missingCount: missing,
            existingCount: existing,
            benchmarkMarket: null,
            isAutoGenerated: true,
            generatedBy: "content-gap.analyzer",
          })
          .returning({ id: contentGapAlerts.id });
        alertId = inserted[0]?.id ?? null;
      }
    } else if (open) {
      // Target met — self-clear the alert so the queue reflects reality.
      await db
        .update(contentGapAlerts)
        .set({
          resolvedAt: new Date(),
          existingCount: existing,
          missingCount: 0,
          resolutionNotes: "Target met — auto-resolved by the content-gap analyzer.",
          updatedAt: new Date(),
        })
        .where(eq(contentGapAlerts.id, open.id));
      alertId = null;
    }

    rows.push({
      contentType: plan.contentType,
      label: plan.label,
      existing,
      target: plan.target,
      missing,
      severity,
      alertId,
    });
  }

  return {
    market: GAP_MARKET,
    city: GAP_CITY,
    ranAt,
    rows,
    openGaps: rows.filter((r) => r.missing > 0).length,
  };
}

/** List the currently-open Kyoto gap alerts (highest severity first), for the admin queue + ingestion. */
export async function listOpenKyotoGaps(): Promise<ContentGapAlert[]> {
  const rows = await db
    .select()
    .from(contentGapAlerts)
    .where(
      and(
        eq(contentGapAlerts.market, GAP_MARKET),
        eq(contentGapAlerts.city, GAP_CITY),
        isNull(contentGapAlerts.resolvedAt),
      ),
    );
  const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return rows.sort(
    (a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9) || (b.missingCount ?? 0) - (a.missingCount ?? 0),
  );
}
