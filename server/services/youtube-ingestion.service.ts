/**
 * YouTube guide-video ingestion — admin-triggered (decision-maker ratified social-source build,
 * Aug 9 2026). "Top 10 <city>" guide videos are the same content shape the DMO Research Reader
 * already extracts places from (dmo-place-extraction.service.ts's `classifyDmoShape`), so a video's
 * DESCRIPTION text (not a transcript — the API doesn't hand those out for free) becomes the row's
 * `description`, which is exactly what place extraction reads.
 *
 * Posture mirrors server/services/dmo-ingestion.service.ts (the Tavily exemplar) verbatim:
 *   - No API key ⇒ `{ready: false}` and ZERO writes (§13 — no fabrication, honest keyless behavior).
 *   - Rows are born admin-gated (`expertWorkspaceVisible: false`). Admin approval
 *     (POST /api/admin/dmo/intake/:id/approve, server/routes/admin.routes.ts) is what flips them
 *     visible AND fires place pre-extraction (`runPlaceExtraction`) — this file does NOT extract
 *     places itself, matching the existing exemplar's division of labor.
 *   - Idempotent on re-run via the SAME (source_url, source_id) unique constraint the Tavily gap-fill
 *     path uses (`dmo_raw_content_source_url_unique`, shared/schema.ts) — `sourceUrl` is the
 *     canonical `https://www.youtube.com/watch?v=<id>` URL, which is naturally unique per video, and
 *     `sourceId` is the resolved youtube.com `dmo_sources` row. A re-run of the same
 *     market/city/query is a no-op past the first pass (see `skippedDuplicate`).
 *
 * Source resolution: the youtube.com `dmo_sources` registry row is resolved at RUNTIME by domain
 * lookup (never trusted from the request — §14/§19 posture: linkage/identity fields are
 * server-resolved). The seed registry (server/seeds/dmo-sources.seed.ts) is owned by a sibling
 * effort and is intentionally not imported/touched here.
 *
 * Guide-shape filter: mirrors `GUIDE_TITLE_RE` from dmo-place-extraction.service.ts verbatim rather
 * than importing it — that export lives in a file this task's ownership excludes, and duplicating a
 * one-line regex is cheaper than an unreviewed cross-file coupling on a task boundary. Keep the two
 * patterns in sync by hand if either changes.
 *
 * YouTube API ToS note: cached API response data (titles, descriptions, thumbnails, channel/publish
 * metadata) is subject to the YouTube API Services Terms of Service, which require it be refreshed
 * or deleted periodically rather than archived indefinitely — this ingestion is a cache, not a
 * permanent copy. Every row's `rawData.fetchedAt` records when its data was pulled from the API so a
 * future refresh/purge job (not built yet — see the PR report) has what it needs to comply.
 */
import { ilike } from "drizzle-orm";
import { db } from "../db";
import { dmoRawContent, dmoSources } from "@shared/schema";
import { recordDmoExtractionRun } from "./dmo-extraction-runs.service";

// Mirrors dmo-place-extraction.service.ts's GUIDE_TITLE_RE (see file header for why this isn't a
// shared import). "Top 10 Kyoto", "Best Temples in Kyoto", "Kyoto Travel Guide", etc.
const GUIDE_TITLE_RE = /\b(top\s*\d+|best|guide|favou?rite|must[- ]?see|things\s+to\s+do)\b/i;

const YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const YOUTUBE_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";
const MIN_DURATION_SECONDS = 120; // shorts are < 2 minutes — not guide-shaped, skip them
const DEFAULT_MAX_RESULTS = 15;

export interface YoutubeIngestArgs {
  market: string;
  city: string;
  /** Defaults to "<city> travel guide top places". */
  query?: string;
  /** Capped at 15 regardless of what's passed. */
  maxResults?: number;
}

export interface YoutubeIngestStats {
  ready: boolean;
  reason?: string;
  scanned: number;
  upserted: number;
  skippedShape: number;
  skippedShort: number;
  skippedDuplicate: number;
  error?: string;
}

/** True only when a YouTube Data API key is configured. No key ⇒ no writes (§13, mirrors isDmoIngestReady). */
export function isYoutubeIngestReady(): boolean {
  return !!process.env.YOUTUBE_API_KEY;
}

/** Parses an ISO-8601 duration ("PT4M13S") to whole seconds. Unparseable/absent → 0 (treated as a short). */
function parseIsoDurationSeconds(iso: string | undefined | null): number {
  if (!iso) return 0;
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return 0;
  const [, h, mn, s] = m;
  return parseInt(h || "0", 10) * 3600 + parseInt(mn || "0", 10) * 60 + parseInt(s || "0", 10);
}

function bestThumbnail(thumbnails: any): string | null {
  if (!thumbnails) return null;
  return (
    thumbnails.maxres?.url ||
    thumbnails.standard?.url ||
    thumbnails.high?.url ||
    thumbnails.medium?.url ||
    thumbnails.default?.url ||
    null
  );
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || null;

type FetchLike = typeof globalThis.fetch;

/**
 * Ingests "top 10 <city>" guide-shaped YouTube videos into `dmo_raw_content`, born-hidden. Keyless
 * ⇒ `{ready:false}`, zero writes. `fetchImpl` is injectable so tests can drive this against fixture
 * responses with no real API key or outbound network access; production always calls the real
 * `fetch` against the YouTube Data API v3.
 *
 * Thin wrapper over `ingestYoutubeGuidesInner`: every call (ready or not — the keyless case is
 * intercepted by the route before this is ever invoked, see admin.routes.ts) writes ONE
 * `dmo_extraction_runs` row (kind "youtube_ingest", CLAUDE.md §17 lesson by analogy) so the
 * Content Ops admin page's "last run" line is real, not silence. A ledger-write failure is
 * caught and logged — it must never mask or fail an otherwise-successful ingestion pass.
 */
export async function ingestYoutubeGuides(
  args: YoutubeIngestArgs,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<YoutubeIngestStats> {
  const stats = await ingestYoutubeGuidesInner(args, fetchImpl);
  try {
    await recordDmoExtractionRun("youtube_ingest", stats as unknown as Record<string, unknown>);
  } catch (err: any) {
    console.warn("[youtube-ingest] failed to record run ledger row:", err?.message || err);
  }
  return stats;
}

async function ingestYoutubeGuidesInner(
  args: YoutubeIngestArgs,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<YoutubeIngestStats> {
  const base: YoutubeIngestStats = {
    ready: true,
    scanned: 0,
    upserted: 0,
    skippedShape: 0,
    skippedShort: 0,
    skippedDuplicate: 0,
  };

  if (!isYoutubeIngestReady()) {
    return { ...base, ready: false, reason: "YOUTUBE_API_KEY not set" };
  }

  const market = args.market?.trim();
  const city = args.city?.trim();
  if (!market || !city) {
    return { ...base, ready: false, reason: "market and city are required" };
  }

  // Resolve the registered youtube.com dmo_sources row by DOMAIN LOOKUP (never a client-supplied
  // sourceId — §14/§19). dmo_sources is unique on (domain, market), so more than one youtube.com row
  // can exist (one per market); prefer an exact market match, otherwise fall back to whichever
  // youtube.com row exists so a single-market seed still resolves.
  let source: typeof dmoSources.$inferSelect | undefined;
  try {
    const rows = await db.select().from(dmoSources).where(ilike(dmoSources.domain, "youtube.com"));
    source = rows.find((r) => r.market?.toLowerCase() === market.toLowerCase()) ?? rows[0];
  } catch (err: any) {
    return { ...base, error: err?.message || String(err) };
  }
  if (!source) {
    return { ...base, ready: false, reason: "youtube source not registered" };
  }

  const apiKey = process.env.YOUTUBE_API_KEY as string;
  const maxResults = Math.max(1, Math.min(args.maxResults ?? DEFAULT_MAX_RESULTS, DEFAULT_MAX_RESULTS));
  const query = args.query?.trim() || `${city} travel guide top places`;

  // 1. search.list — discover candidate videos.
  const searchUrl = new URL(YOUTUBE_SEARCH_URL);
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("relevanceLanguage", "en");
  searchUrl.searchParams.set("maxResults", String(maxResults));
  searchUrl.searchParams.set("safeSearch", "strict");
  searchUrl.searchParams.set("key", apiKey);

  let searchItems: any[];
  try {
    const res = await fetchImpl(searchUrl.toString());
    if (!res.ok) {
      return { ...base, error: `YouTube search.list failed: ${res.status} ${res.statusText}` };
    }
    const json: any = await res.json();
    searchItems = Array.isArray(json.items) ? json.items : [];
  } catch (err: any) {
    return { ...base, error: err?.message || String(err) };
  }

  const videoIds = searchItems
    .map((it) => it?.id?.videoId)
    .filter((id: any): id is string => typeof id === "string" && id.length > 0);
  if (videoIds.length === 0) {
    return base;
  }

  // 2. videos.list — full descriptions (search.list truncates them) + contentDetails.duration (to
  // filter shorts, which search.list doesn't expose at all).
  const videosUrl = new URL(YOUTUBE_VIDEOS_URL);
  videosUrl.searchParams.set("part", "snippet,contentDetails");
  videosUrl.searchParams.set("id", videoIds.join(","));
  videosUrl.searchParams.set("key", apiKey);

  let videoItems: any[];
  try {
    const res = await fetchImpl(videosUrl.toString());
    if (!res.ok) {
      return { ...base, error: `YouTube videos.list failed: ${res.status} ${res.statusText}` };
    }
    const json: any = await res.json();
    videoItems = Array.isArray(json.items) ? json.items : [];
  } catch (err: any) {
    return { ...base, error: err?.message || String(err) };
  }

  base.scanned = videoItems.length;
  const fetchedAt = new Date().toISOString();

  for (const item of videoItems) {
    const id: string | undefined = item?.id;
    const snippet = item?.snippet;
    if (!id || !snippet?.title) continue;

    const durationSeconds = parseIsoDurationSeconds(item?.contentDetails?.duration);
    if (durationSeconds < MIN_DURATION_SECONDS) {
      base.skippedShort++;
      continue;
    }

    if (!GUIDE_TITLE_RE.test(snippet.title)) {
      base.skippedShape++;
      continue;
    }

    const title: string = snippet.title.slice(0, 255);
    const sourceUrl = `https://www.youtube.com/watch?v=${id}`;

    try {
      const inserted = await db
        .insert(dmoRawContent)
        .values({
          sourceId: source.id,
          externalId: id,
          contentType: "itinerary",
          status: "pending_expert_review",
          name: title,
          slug: slugify(title),
          // The DESCRIPTION field is what place extraction reads (dmo-place-extraction.service.ts).
          description: snippet.description || null,
          country: market,
          city,
          primaryImageUrl: bestThumbnail(snippet.thumbnails),
          sourceUrl,
          sourcePageTitle: title,
          scrapedBy: "youtube-api",
          scrapedAt: new Date(),
          // Metadata cached under the YouTube API ToS, not a redistribution license — see file header.
          license: "restricted",
          // Official API data, not scraped HTML — a step up from Tavily's gap-fill discovery score
          // (0.40, dmo-ingestion.service.ts) but still machine-sourced, unverified by an expert.
          // NOTE: dmo_sources.confidence ("official_api" in dmoSourceConfidenceEnum) is the row that
          // best matches the "official_api" framing in the build spec — that column belongs to the
          // seed registry (server/seeds/dmo-sources.seed.ts), which is out of this file's ownership
          // for this task, so it's left to whatever the sibling agent's seed sets.
          confidenceScore: "0.60",
          rawData: {
            channelTitle: snippet.channelTitle ?? null,
            publishedAt: snippet.publishedAt ?? null,
            durationSeconds,
            query,
            // dmo_raw_content has no attributionText column (that lives on dmo_sources); the
            // video link-back IS the attribution, so it's recorded here per-row.
            attributionText: `Video: "${title}" — ${sourceUrl}`,
            fetchedAt,
          },
          tags: ["youtube", "guide-video"],
          // Born admin-gated (D1a/"B") — approval flips this true and fires pre-extraction.
          expertWorkspaceVisible: false,
          discoverPageVisible: false,
        })
        .onConflictDoNothing({ target: [dmoRawContent.sourceUrl, dmoRawContent.sourceId] })
        .returning({ id: dmoRawContent.id });

      if (inserted.length > 0) {
        base.upserted++;
      } else {
        base.skippedDuplicate++;
      }
    } catch (err: any) {
      console.warn(`[youtube-ingest] row insert failed (${id}):`, err?.message || err);
    }
  }

  console.log(
    `[youtube-ingest] ${city} (${market}) pass complete — scanned ${base.scanned}, upserted ${base.upserted}, ` +
      `skippedShape ${base.skippedShape}, skippedShort ${base.skippedShort}, skippedDuplicate ${base.skippedDuplicate}`,
  );
  return base;
}
