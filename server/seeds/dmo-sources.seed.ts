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
import { ALL_DMO_SOURCES, type DMOSourceDefinition } from "../content/providers/DMOSourceRegistry";

/**
 * Ratified content-source-map expansion (decision-maker ratified; see CLAUDE.md's tiered
 * content-source map — Tier 1 government/DMO, Tier 2 open data, Tier 3 primary venue/registries,
 * Tier 4 events/social). Kept here rather than in `DMOSourceRegistry.ts` (out of this change's file
 * ownership) — merged into the same upsert loop below so it goes through the identical idempotent
 * (domain, market) upsert path as the rest of the registry. No `license` column exists on
 * `dmo_sources` (only `attributionRequired`/`attributionText`); licensing detail that doesn't map to
 * those two columns is recorded in `notes` instead of invented as a fake field.
 *
 * Every domain below was verified reachable/real before being added (never invented — see the seed
 * task's report for what was checked and what was skipped for domain uncertainty).
 *
 * SKIPPED: a Kyoto Convention & Visitors Bureau entry distinct from the existing
 * `dmo-jp-kyoto-travel` (kyoto.travel) row. The suggested domain "hellokcvb.kyoto" could not be
 * confirmed; KCVB's actual site (meetkyoto.jp) is a MICE/conference-bureau portal, not a general
 * tourism-content DMO site comparable to the other Tier-1 city entries below, and kyoto.travel
 * already covers Kyoto in this registry. Left out rather than guessed at (CLAUDE.md §13).
 */
export const PROPOSED_DMO_SOURCES: DMOSourceDefinition[] = [
  // --- TIER 1: city DMOs (confidence 'scraped' — no documented partner/media program was
  // confirmed with enough certainty to claim 'partner_pack'; see per-entry notes for what was
  // observed) ---
  {
    id: "dmo-jp-gotokyo",
    name: "Go Tokyo — Tokyo Convention & Visitors Bureau",
    domain: "gotokyo.org",
    sourceType: "scraped",
    market: "japan",
    marketRegion: "apac",
    confidence: "scraped",
    attributionRequired: false,
    isActive: true,
    scrapeConfig: { rateLimit: 1, paths: ["/en/"], respectRobotsTxt: true, language: "en" },
    notes: "Official Tokyo tourism site (Tokyo Metropolitan Gov't + Tokyo Convention & Visitors Bureau). Has a Travel Trade & Press section (gotokyo.org/en/agent/) and a Media Support Program page, but registration terms/API access were not confirmed — kept at 'scraped' rather than claiming 'partner_pack' without verifying the program's actual access grant.",
  },
  {
    id: "dmo-jp-osaka-info",
    name: "Osaka Convention & Tourism Bureau — OSAKA-INFO",
    domain: "osaka-info.jp",
    sourceType: "scraped",
    market: "japan",
    marketRegion: "apac",
    confidence: "scraped",
    attributionRequired: false,
    isActive: true,
    scrapeConfig: { rateLimit: 1, paths: ["/en/"], respectRobotsTxt: true, language: "en" },
    notes: "Osaka's certified DMO (Osaka Convention & Tourism Bureau). Has a downloadable guidebook/resources section (octb.osaka-info.jp) but no confirmed trade-registration program, so kept at 'scraped'.",
  },
  {
    id: "dmo-es-barcelonaturisme",
    name: "Turisme de Barcelona",
    domain: "barcelonaturisme.com",
    sourceType: "scraped",
    market: "spain",
    marketRegion: "europe",
    confidence: "scraped",
    attributionRequired: false,
    isActive: true,
    scrapeConfig: { rateLimit: 1, paths: ["/wv3/en/"], respectRobotsTxt: true, language: "en" },
    notes: "Official Barcelona DMO consortium (city council + chamber of commerce + promotion foundation). Runs a distinct professional/trade subdomain (professional.barcelonaturisme.com) but its registration terms were not confirmed — kept at 'scraped'. First entry for market 'spain'.",
  },
  {
    id: "dmo-pt-visitlisboa",
    name: "Visit Lisboa — Turismo de Lisboa",
    domain: "visitlisboa.com",
    sourceType: "scraped",
    market: "portugal",
    marketRegion: "europe",
    confidence: "scraped",
    attributionRequired: false,
    isActive: true,
    scrapeConfig: { rateLimit: 1, paths: ["/en/"], respectRobotsTxt: true, language: "en" },
    notes: "Official Lisbon regional tourism promotion agency (Turismo de Lisboa / Visitors & Convention Bureau), nonprofit private association.",
  },
  {
    id: "dmo-fr-parisjetaime",
    name: "Paris je t'aime — Paris Convention and Visitors Bureau",
    domain: "parisjetaime.com",
    sourceType: "scraped",
    market: "france",
    marketRegion: "europe",
    confidence: "scraped",
    attributionRequired: false,
    isActive: true,
    scrapeConfig: { rateLimit: 1, paths: ["/eng/"], respectRobotsTxt: true, language: "en" },
    notes: "Official Paris Tourist Office site. First entry for market 'france'.",
  },

  // --- TIER 2: open data (confidence 'official_api') ---
  {
    id: "dmo-global-wikidata",
    name: "Wikidata",
    domain: "wikidata.org",
    sourceType: "api",
    market: "global",
    marketRegion: "global",
    apiEndpoint: "https://www.wikidata.org/w/api.php",
    apiDocsUrl: "https://www.wikidata.org/wiki/Wikidata:Data_access",
    confidence: "official_api",
    attributionRequired: false,
    isActive: true,
    notes: "Structured entity data (places, landmarks, coordinates). License: CC0 (public domain dedication) — no attribution legally required, though citing Wikidata as source is good practice.",
  },
  {
    id: "dmo-global-osm-overpass",
    name: "OpenStreetMap POIs (Overpass API)",
    domain: "openstreetmap.org",
    sourceType: "api",
    market: "global",
    marketRegion: "global",
    apiEndpoint: "https://overpass-api.de/api/interpreter",
    apiDocsUrl: "https://wiki.openstreetmap.org/wiki/Overpass_API",
    confidence: "official_api",
    attributionRequired: true,
    attributionText: "© OpenStreetMap contributors",
    isActive: true,
    notes: "POI/geometry pull via Overpass, distinct from the existing market_geography water/parks/roads extract (server/services/market-extract.service.ts) which already carries the same ODbL attribution (see docs/MARKET_LAUNCH_CHECKLIST.md). License: ODbL — attribution required; share-alike applies to derived data extracts.",
  },
  {
    id: "dmo-fr-paris-opendata",
    name: "Paris Open Data",
    domain: "opendata.paris.fr",
    sourceType: "api",
    market: "france",
    marketRegion: "europe",
    apiEndpoint: "https://opendata.paris.fr/api/explore/v2.1/",
    apiDocsUrl: "https://opendata.paris.fr/pages/faq/",
    confidence: "official_api",
    attributionRequired: true,
    attributionText: "© Ville de Paris — Open Data Paris",
    isActive: true,
    notes: "City of Paris open-data portal (Explore API v2). License: ODbL (confirmed — portal states datasets are published under ODbL) — attribution required.",
  },
  {
    id: "dmo-us-nyc-opendata",
    name: "NYC Open Data",
    domain: "data.cityofnewyork.us",
    sourceType: "api",
    market: "united_states",
    marketRegion: "americas",
    apiEndpoint: "https://data.cityofnewyork.us/resource/",
    apiDocsUrl: "https://opendata.cityofnewyork.us/",
    confidence: "official_api",
    attributionRequired: false,
    isActive: true,
    notes: "NYC's Socrata open-data portal. License varies by individual dataset; the portal's blanket terms were not confirmed for every dataset, so treat per-dataset license as unknown until checked at ingest time rather than assumed public domain. First entry for market 'united_states'.",
  },
  {
    id: "dmo-es-barcelona-opendata",
    name: "Barcelona Open Data (Open Data BCN)",
    domain: "opendata-ajuntament.barcelona.cat",
    sourceType: "api",
    market: "spain",
    marketRegion: "europe",
    apiEndpoint: "https://opendata-ajuntament.barcelona.cat/data/api/",
    apiDocsUrl: "https://opendata-ajuntament.barcelona.cat/en/api-cataleg",
    confidence: "official_api",
    attributionRequired: false,
    isActive: true,
    notes: "Barcelona City Council open-data portal (CKAN-based). Per-dataset license was not confirmed in the portal metadata reviewed — license: unknown, do not assume permissive; verify before redistribution.",
  },

  // --- TIER 3: primary/registries ---
  {
    id: "dmo-jp-bunka-cultural-properties",
    name: "Agency for Cultural Affairs — Cultural Properties Database",
    domain: "bunka.go.jp",
    sourceType: "scraped",
    market: "japan",
    marketRegion: "apac",
    confidence: "scraped",
    attributionRequired: false,
    isActive: true,
    scrapeConfig: { rateLimit: 1, paths: ["/english/policy/cultural_properties/"], respectRobotsTxt: true, language: "en" },
    notes: "Japanese national government registry of National Treasures / Important Cultural Properties (temples, shrines, structures) — heritage-venue content, essential context for temple/shrine wedding venues. No public API confirmed; scrape the English cultural-properties portal pages.",
  },
  {
    id: "dmo-jp-env-national-parks",
    name: "Ministry of the Environment — National Parks of Japan",
    domain: "env.go.jp",
    sourceType: "scraped",
    market: "japan",
    marketRegion: "apac",
    confidence: "scraped",
    attributionRequired: false,
    isActive: true,
    scrapeConfig: { rateLimit: 1, paths: ["/en/nature/nps/park/"], respectRobotsTxt: true, language: "en" },
    notes: "Japanese national government registry of national/quasi-national parks (designation, visitor centers, permits). No public API confirmed; scrape the English National Parks of Japan pages.",
  },

  // --- TIER 4: events / social-source scaffold (inert until an ingestion adapter lands) ---
  {
    id: "dmo-global-youtube",
    name: "YouTube — Destination Guide Videos",
    domain: "youtube.com",
    sourceType: "api",
    market: "global",
    marketRegion: "global",
    apiEndpoint: "https://www.googleapis.com/youtube/v3/",
    apiDocsUrl: "https://developers.google.com/youtube/v3",
    confidence: "official_api",
    attributionRequired: false,
    isActive: true,
    notes: "metadata-only ingestion; adapter = youtube-ingestion.service. This row is scaffolding — the registry definition exists ahead of the adapter build, matching the file's existing scope note that a source definition is inert until a scrape/ingest job actually runs against it.",
  },
];

export async function seedDmoSources(): Promise<{ upserted: number }> {
  let upserted = 0;

  for (const src of [...ALL_DMO_SOURCES, ...PROPOSED_DMO_SOURCES]) {
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
