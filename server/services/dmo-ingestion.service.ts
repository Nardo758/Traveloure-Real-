/**
 * DMO ingestion service — D3, Kyoto-first, Tavily-only.
 *
 * Enriches the born-hidden Kyoto DMO stubs (seeded by dmo-kyoto-heritage.seed.ts as thin
 * `dmo_raw_content` rows) with real content, using Tavily for BOTH stages:
 *   1. discover  — tavily.search("<site> Kyoto Japan") → best source URL
 *   2. scrape    — tavily.extract(url, { format: "markdown" }) → page content
 *
 * Why Tavily-only: Tavily's SDK exposes `search` AND `extract`, so the whole pipeline runs on a
 * single TAVILY_API_KEY — no Firecrawl (scrape) or Brave (discover) key required. The existing
 * DMOCrawler (Firecrawl-coupled) is left untouched; this is an isolated, key-gated path.
 *
 * D1a is preserved end-to-end: enriched rows stay `status='pending_expert_review'` and
 * `discover_page_visible=false`. Machine/DMO content NEVER reaches travelers without expert review
 * (the Expert Workspace DMO Library, D2). §13: if TAVILY_API_KEY is absent, this writes NOTHING and
 * reports `ready:false` — it never fabricates content.
 *
 * The live run happens at deploy: outbound scraping to Tavily + source domains is blocked by the
 * agent proxy in dev/CI, so this is exercised there with a stubbed client and runs for real on Replit.
 */
import { tavily, type TavilyClient } from "tavily";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { dmoRawContent } from "@shared/schema";
import {
  analyzeKyotoContentGaps,
  listOpenKyotoGaps,
  getContentTypePlan,
  GAP_CITY,
} from "./content-gap.service";

export interface KyotoIngestStats {
  ready: boolean;
  reason?: string;
  total: number;
  enriched: number;
  failed: number;
  skipped: number;
  ranAt: Date;
  error?: string;
}

export interface IngestOptions {
  /** Max stubs to process in one pass (guards Tavily spend). Default 10 (the seeded Kyoto set). */
  limit?: number;
  /** Re-enrich rows already scraped by Tavily. Default false — skip them to avoid re-spending. */
  force?: boolean;
}

const CITY = "Kyoto";
const MAX_DESCRIPTION_CHARS = 6000; // keep the row lean; experts trim/curate the rest
const PER_SITE_DELAY_MS = 500; // gentle pacing between Tavily calls

/** True only when a Tavily key is configured. Gates all ingestion; no key ⇒ no writes (§13). */
export function isDmoIngestReady(): boolean {
  return !!process.env.TAVILY_API_KEY;
}

function getClient(): TavilyClient {
  return tavily({ apiKey: process.env.TAVILY_API_KEY as string });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Enrich the seeded Kyoto DMO stubs in place. Idempotent-friendly: re-running skips rows already
 * enriched by Tavily unless `force` is set. Each site is isolated in its own try/catch so one
 * failure never aborts the batch. Returns per-run counts; writes nothing when not ready.
 */
export async function ingestKyotoHeritage(
  opts: IngestOptions = {},
  // Optional injected Tavily client — used by tests to exercise the DB/D1a logic without the
  // (proxy-blocked, credit-spending) live API. Production always builds its own from the env key.
  clientOverride?: TavilyClient,
): Promise<KyotoIngestStats> {
  const ranAt = new Date();
  const base: KyotoIngestStats = { ready: true, total: 0, enriched: 0, failed: 0, skipped: 0, ranAt };

  if (!isDmoIngestReady()) {
    return {
      ...base,
      ready: false,
      reason: "TAVILY_API_KEY not set — skipping DMO ingestion (no content written).",
    };
  }

  const limit = Math.max(1, Math.min(opts.limit ?? 10, 50));

  // Not-force runs select only stubs NOT yet Tavily-enriched, ordered deterministically — so the
  // job progresses through the set across passes and a fully-enriched set is a true no-op (idempotent).
  const notYetEnriched = sql`${dmoRawContent.scrapedBy} IS DISTINCT FROM 'tavily'`;
  let stubs;
  try {
    stubs = await db
      .select()
      .from(dmoRawContent)
      .where(opts.force ? eq(dmoRawContent.city, CITY) : and(eq(dmoRawContent.city, CITY), notYetEnriched))
      .orderBy(dmoRawContent.name)
      .limit(limit);
  } catch (err: any) {
    return { ...base, error: err?.message || String(err) };
  }

  base.total = stubs.length;
  const client = clientOverride ?? getClient();

  for (const stub of stubs) {
    // Skip rows already enriched by Tavily unless forced (avoids re-spending credits).
    if (!opts.force && stub.scrapedBy === "tavily") {
      base.skipped++;
      continue;
    }

    try {
      // 1. Discover the best source page for this site (Tavily search).
      const query = `${stub.name} ${CITY} Japan`;
      const search = await client.search(query, {
        maxResults: 3,
        searchDepth: "basic",
        includeAnswer: false,
      });
      const discoveredUrl: string | undefined = search.results?.[0]?.url;
      if (!discoveredUrl) {
        base.failed++;
        continue;
      }

      // 2. Scrape the page content (Tavily extract).
      const extract = await client.extract([discoveredUrl], {
        format: "markdown",
        extractDepth: "advanced",
      });
      const result = extract.results?.[0];
      const content = result?.rawContent?.trim();
      if (!content) {
        base.failed++;
        continue;
      }

      // 3. Enrich the stub in place — D1a preserved (status + discover_page_visible untouched).
      await db
        .update(dmoRawContent)
        .set({
          description: content.slice(0, MAX_DESCRIPTION_CHARS),
          sourcePageTitle: result?.title || stub.name,
          scrapedBy: "tavily",
          scrapedAt: new Date(),
          confidenceScore: "0.6",
          rawData: {
            discoveredUrl,
            extractedTitle: result?.title ?? null,
            extractedChars: content.length,
            originalNote: stub.description ?? null,
            canonicalSourceUrl: stub.sourceUrl,
          },
          updatedAt: new Date(),
        })
        .where(eq(dmoRawContent.id, stub.id));

      base.enriched++;
    } catch (err: any) {
      // One site's failure must not abort the batch.
      console.warn(`[dmo-ingest] Failed to enrich "${stub.name}" (${stub.id}):`, err?.message || err);
      base.failed++;
    }

    await sleep(PER_SITE_DELAY_MS);
  }

  console.log(
    `[dmo-ingest] Kyoto pass complete — enriched ${base.enriched}, failed ${base.failed}, skipped ${base.skipped} of ${base.total}`,
  );
  return base;
}

// ── Priority (gap-driven) ingestion (#2) ─────────────────────────────────────
// Instead of re-scraping the 10 seeded heritage sites, this reads the open content-gap alerts
// (which categories are thin — venues, restaurants, events…) and runs Tavily searches to fill them
// with NEW born-hidden stubs. So the scraper's priorities are driven by what we're actually missing.

export interface GapFillStats {
  ready: boolean;
  reason?: string;
  gapsProcessed: number;
  created: number;
  duplicates: number;
  failed: number;
  ranAt: Date;
  perGap: Array<{ contentType: string; created: number; duplicates: number; failed: number }>;
  error?: string;
}

export interface GapFillOptions {
  /** Max gap categories to fill in one pass (Tavily-spend guard). Default 3, highest-severity first. */
  maxGaps?: number;
  /** Max new stubs to create per gap category in one pass. Default 6. */
  maxPerGap?: number;
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || null;

/**
 * Fill the thinnest Kyoto content categories from their gap alerts, using Tavily search for discovery.
 * Each search result becomes a THIN born-hidden `dmo_raw_content` stub (D1a: pending_expert_review +
 * discover_page_visible=false) that an expert enriches later — matching the seed philosophy. Dedups on
 * (source_url, source_id) so re-runs and overlapping queries don't create duplicates. §13: no Tavily key
 * ⇒ zero writes, ready:false. Re-analyzes gaps at the end so the queue reflects the new coverage.
 */
export async function ingestKyotoContentGaps(
  opts: GapFillOptions = {},
  clientOverride?: TavilyClient,
): Promise<GapFillStats> {
  const ranAt = new Date();
  const base: GapFillStats = {
    ready: true,
    gapsProcessed: 0,
    created: 0,
    duplicates: 0,
    failed: 0,
    ranAt,
    perGap: [],
  };

  if (!isDmoIngestReady()) {
    return {
      ...base,
      ready: false,
      reason: "TAVILY_API_KEY not set — skipping gap-fill ingestion (no content written).",
    };
  }

  const maxGaps = Math.max(1, Math.min(opts.maxGaps ?? 3, 5));
  const maxPerGap = Math.max(1, Math.min(opts.maxPerGap ?? 6, 15));

  // Refresh coverage → open gaps first, so we fill the current picture (highest severity first).
  try {
    await analyzeKyotoContentGaps();
  } catch (err: any) {
    return { ...base, error: err?.message || String(err) };
  }
  const gaps = (await listOpenKyotoGaps()).slice(0, maxGaps);
  const client = clientOverride ?? getClient();

  for (const gap of gaps) {
    const plan = getContentTypePlan(gap.contentType);
    if (!plan) continue; // no discovery recipe for this type — leave it for manual sourcing
    const perGap = { contentType: gap.contentType, created: 0, duplicates: 0, failed: 0 };
    base.gapsProcessed++;

    for (const query of plan.discoveryQueries) {
      if (perGap.created + perGap.duplicates >= maxPerGap) break;
      try {
        const search = await client.search(query, {
          maxResults: Math.min(maxPerGap, 8),
          searchDepth: "basic",
          includeAnswer: false,
        });
        const results = search.results ?? [];
        for (const r of results) {
          if (perGap.created + perGap.duplicates >= maxPerGap) break;
          const url = r?.url;
          const title = r?.title?.trim();
          if (!url || !title) continue;
          try {
            const snippet = (r.content ?? "").trim().slice(0, MAX_DESCRIPTION_CHARS);
            const inserted = await db
              .insert(dmoRawContent)
              .values({
                sourceId: plan.sourceId,
                contentType: plan.contentType,
                status: "pending_expert_review",
                name: title.slice(0, 255),
                slug: slugify(title),
                description: snippet || null,
                shortDescription: snippet ? snippet.slice(0, 280) : null,
                country: "Japan",
                city: GAP_CITY,
                rawData: {
                  discoveredVia: "tavily:gap",
                  gapContentType: plan.contentType,
                  query,
                  score: r.score ?? null,
                },
                tags: ["tavily-discovered", plan.contentType],
                sourceUrl: url,
                sourcePageTitle: title.slice(0, 255),
                scrapedBy: "tavily:gap",
                scrapedAt: new Date(),
                confidenceScore: "0.40", // machine-discovered, unverified — expert curates before publish
                // Born-hidden — an admin must approve this raw content into the expert library (intake gate, "B").
                expertWorkspaceVisible: false,
                discoverPageVisible: false,
              })
              .onConflictDoNothing({
                target: [dmoRawContent.sourceUrl, dmoRawContent.sourceId],
              })
              .returning({ id: dmoRawContent.id });
            if (inserted.length > 0) {
              perGap.created++;
              base.created++;
            } else {
              perGap.duplicates++;
              base.duplicates++;
            }
          } catch (rowErr: any) {
            console.warn(`[dmo-gap] row insert failed (${plan.contentType}):`, rowErr?.message || rowErr);
            perGap.failed++;
            base.failed++;
          }
        }
      } catch (err: any) {
        console.warn(`[dmo-gap] Tavily search failed for "${query}":`, err?.message || err);
        perGap.failed++;
        base.failed++;
      }
      await sleep(PER_SITE_DELAY_MS);
    }

    base.perGap.push(perGap);
  }

  // Reconcile the gap queue against the new coverage.
  try {
    await analyzeKyotoContentGaps();
  } catch {
    /* best-effort — the fill already happened */
  }

  console.log(
    `[dmo-gap] Kyoto gap-fill complete — created ${base.created}, duplicates ${base.duplicates}, failed ${base.failed} across ${base.gapsProcessed} gaps`,
  );
  return base;
}
