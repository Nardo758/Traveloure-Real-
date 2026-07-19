#!/usr/bin/env tsx

/**
 * DMO Kyoto Heritage Seed (D1 — first real content in the DMO pipeline).
 *
 * Live UNESCO/Firecrawl/Tavily ingestion (the DMOCrawler path) is gated on outbound
 * network access to the DMO domains + API credentials (FIRECRAWL/TAVILY/BRAVE keys),
 * so it can only run in a deploy environment, not from CI/dev. This seed bootstraps the
 * pipeline with a small set of REAL, canonical Kyoto UNESCO World Heritage component
 * sites (from "Historic Monuments of Ancient Kyoto", WHC list #688) as born-hidden
 * `dmo_raw_content` rows, so the Expert Workspace has real content to curate before/until
 * live ingestion runs.
 *
 * These are deliberately THIN factual stubs (name + type + ward + UNESCO source). The
 * whole point of the workspace is that experts enrich them — hours, wedding/venue notes,
 * imagery, pricing — before publish. Nothing here reaches travelers: every row is
 * `status='pending_expert_review'` + `discover_page_visible=false` (the D1a gate).
 *
 * Scope: Kyoto-only per §12 (Uji/Otsu components of site #688 are intentionally excluded).
 * Source: dmo-jp-unesco (must be seeded first by dmo-sources.seed.ts — FK on source_id).
 * Idempotent: upserts on the (source_url, source_id) unique constraint; re-running is a no-op.
 *
 * Run: `tsx server/seeds/dmo-kyoto-heritage.seed.ts`
 */

import { db } from "../db";
import { dmoRawContent } from "@shared/schema";

const UNESCO_SOURCE_ID = "dmo-jp-unesco";
const UNESCO_SITE_URL = "https://whc.unesco.org/en/list/688"; // Historic Monuments of Ancient Kyoto

interface HeritageSeed {
  slug: string;
  name: string;
  ward: string; // Kyoto ward (neighborhood)
  kind: "temple" | "shrine" | "castle";
  note: string; // one factual clause; experts enrich the rest
}

// Canonical Kyoto-city component sites of UNESCO WHC #688 (Uji/Otsu excluded per §12).
const KYOTO_HERITAGE: HeritageSeed[] = [
  { slug: "kinkaku-ji", name: "Kinkaku-ji (Rokuon-ji)", ward: "Kita", kind: "temple", note: "The Golden Pavilion, a Zen temple whose top two floors are covered in gold leaf." },
  { slug: "ginkaku-ji", name: "Ginkaku-ji (Jisho-ji)", ward: "Sakyo", kind: "temple", note: "The Silver Pavilion, known for its dry sand garden and moss grounds." },
  { slug: "kiyomizu-dera", name: "Kiyomizu-dera", ward: "Higashiyama", kind: "temple", note: "A hillside temple famous for its large wooden stage overlooking Kyoto." },
  { slug: "ryoan-ji", name: "Ryoan-ji", ward: "Ukyo", kind: "temple", note: "Home to Japan's most celebrated Zen rock garden." },
  { slug: "nijo-castle", name: "Nijo Castle (Nijo-jo)", ward: "Nakagyo", kind: "castle", note: "A shogunate castle known for its ornate palace and nightingale floors." },
  { slug: "tenryu-ji", name: "Tenryu-ji", ward: "Ukyo", kind: "temple", note: "A leading Zen temple in Arashiyama with a classic strolling garden." },
  { slug: "to-ji", name: "To-ji", ward: "Minami", kind: "temple", note: "Home to Japan's tallest wooden pagoda." },
  { slug: "nishi-hongan-ji", name: "Nishi Hongan-ji", ward: "Shimogyo", kind: "temple", note: "Head temple of the Jodo Shinshu Hongwanji-ha school of Buddhism." },
  { slug: "daigo-ji", name: "Daigo-ji", ward: "Fushimi", kind: "temple", note: "A sprawling temple complex renowned for its spring cherry blossoms." },
  { slug: "saiho-ji", name: "Saiho-ji (Kokedera)", ward: "Nishikyo", kind: "temple", note: "The Moss Temple, whose garden is carpeted in over a hundred varieties of moss." },
];

export async function seedDmoKyotoHeritage(): Promise<{ upserted: number }> {
  let upserted = 0;

  for (const site of KYOTO_HERITAGE) {
    const sourceUrl = `${UNESCO_SITE_URL}#${site.slug}`;
    await db
      .insert(dmoRawContent)
      .values({
        sourceId: UNESCO_SOURCE_ID,
        externalId: `unesco-688-${site.slug}`,
        contentType: "attraction",
        status: "pending_expert_review",
        name: site.name,
        slug: site.slug,
        description: site.note,
        shortDescription: site.note,
        country: "Japan",
        city: "Kyoto",
        neighborhood: site.ward,
        rawData: {
          source: "UNESCO World Heritage Centre",
          site: 688,
          siteName: "Historic Monuments of Ancient Kyoto (Kyoto, Uji and Otsu Cities)",
          component: site.name,
        },
        tags: ["unesco", "heritage", site.kind],
        categories: ["heritage"],
        sourceUrl,
        sourcePageTitle: "Historic Monuments of Ancient Kyoto — UNESCO World Heritage Centre",
        scrapedBy: "seed:dmo-kyoto-heritage",
        license: "unknown",
        confidenceScore: "1.00", // official UNESCO listing
        // Born-hidden — an admin must approve this raw content into the expert library (intake gate, "B").
        expertWorkspaceVisible: false,
        discoverPageVisible: false,
      })
      .onConflictDoNothing({
        target: [dmoRawContent.sourceUrl, dmoRawContent.sourceId],
      });
    upserted += 1;
  }

  return { upserted };
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  seedDmoKyotoHeritage()
    .then((result) => {
      console.log(`[dmo-kyoto-heritage.seed] upserted ${result.upserted} Kyoto heritage stubs`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("[dmo-kyoto-heritage.seed] failed:", err);
      process.exit(1);
    });
}
