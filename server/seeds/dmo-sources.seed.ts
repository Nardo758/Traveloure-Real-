#!/usr/bin/env tsx

/**
 * DMO Sources Seed.
 *
 * Populates the `dmo_sources` table from the in-code DMOSourceRegistry
 * (server/content/providers/DMOSourceRegistry.ts). Without this, the registry
 * endpoints (`/api/expert-workspace/sources`) work (they read the in-code array),
 * but `dmo_scrape_jobs.source_id` FKs to `dmo_sources` — so triggering a scrape job
 * against a registry source id would FK-fail. Seeding closes that gap.
 *
 * We write the registry's string `id` (e.g. "dmo-jp-jnto") as the row PK so scrape
 * jobs created against a picked source line up with a real row.
 *
 * Scope note (§12 — one-wedge-Kyoto): seeding source *definitions* for all markets is
 * inert scaffolding — a definition does nothing until a scrape job runs against it, and
 * ingestion stays Kyoto-scoped. The registry is the single source of truth; this only
 * mirrors it into the DB.
 *
 * Idempotent: upserts on the (domain, market) unique constraint — re-running refreshes
 * metadata for existing sources and never duplicates.
 *
 * Run: `tsx server/seeds/dmo-sources.seed.ts`
 */

import { db } from "../db";
import { dmoSources } from "@shared/schema";
import { ALL_DMO_SOURCES } from "../content/providers/DMOSourceRegistry";

export async function seedDmoSources(): Promise<{ upserted: number }> {
  let upserted = 0;

  for (const src of ALL_DMO_SOURCES) {
    await db
      .insert(dmoSources)
      .values({
        id: src.id,
        name: src.name,
        domain: src.domain,
        sourceType: src.sourceType,
        market: src.market,
        marketRegion: src.marketRegion,
        apiEndpoint: src.apiEndpoint ?? null,
        apiDocsUrl: src.apiDocsUrl ?? null,
        partnerPortalUrl: src.partnerPortalUrl ?? null,
        scrapeConfig: src.scrapeConfig ?? {},
        confidence: src.confidence,
        attributionRequired: src.attributionRequired,
        attributionText: src.attributionText ?? null,
        isActive: src.isActive,
        notes: src.notes ?? null,
      })
      .onConflictDoUpdate({
        target: [dmoSources.domain, dmoSources.market],
        set: {
          name: src.name,
          sourceType: src.sourceType,
          marketRegion: src.marketRegion,
          apiEndpoint: src.apiEndpoint ?? null,
          apiDocsUrl: src.apiDocsUrl ?? null,
          partnerPortalUrl: src.partnerPortalUrl ?? null,
          scrapeConfig: src.scrapeConfig ?? {},
          confidence: src.confidence,
          attributionRequired: src.attributionRequired,
          attributionText: src.attributionText ?? null,
          isActive: src.isActive,
          notes: src.notes ?? null,
          updatedAt: new Date(),
        },
      });
    upserted += 1;
  }

  return { upserted };
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  seedDmoSources()
    .then((result) => {
      console.log(`[dmo-sources.seed] upserted ${result.upserted} DMO sources`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("[dmo-sources.seed] failed:", err);
      process.exit(1);
    });
}
