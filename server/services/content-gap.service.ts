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
import {
  GAP_MARKET,
  GAP_CITY,
  KYOTO_CONTENT_PLAN,
  getContentTypePlan,
  type ContentTypePlan,
} from "./content-gap-taxonomy";

// Re-export the pure taxonomy surface so "the content-gap module" still exposes the plan, the
// crosswalk and the slot-derivation as one thing (the pure core lives in content-gap-taxonomy.ts so
// it stays importable/testable WITHOUT a database — this file imports `../db`). L6: one home, no copy.
export {
  GAP_MARKET,
  GAP_CITY,
  KYOTO_CONTENT_PLAN,
  getContentTypePlan,
  // R-T1-a crosswalk + R-T1-b/-d slot-derivation:
  CATEGORY_TO_CONTENT_TYPE,
  AFFILIATE_RUNG,
  SERVICE_ONLY,
  crosswalk,
  isDmoContentType,
  TEMPLATE_CATEGORY_MATRIX,
  deriveContentPlan,
  KYOTO_DERIVED_CONTENT_PLAN,
  INERT_MARKET_CONTENT_PLANS,
  diffKyotoPlan,
} from "./content-gap-taxonomy";
export type {
  ContentTypePlan,
  DmoContentType,
  CategoryKey,
  CrosswalkTarget,
  MatrixRow,
  DerivedContentTarget,
  DerivedContentPlan,
  KyotoPlanDivergence,
} from "./content-gap-taxonomy";

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
