import { placesChips } from "@shared/places-path";
import { db } from "../db";
import { hideBlockedGemImage, photoBlockedFor, photoBlocks } from "./place-photo-blocks.service";
import { isBannedPhotoUrl } from "@shared/banned-photos";
import { 
  aiDiscoveredGems, 
  discoveryJobs, 
  discoveryCategories,
  type DiscoveryCategory,
  type InsertAiDiscoveredGem 
} from "@shared/schema";
import { eq, and, desc, sql, isNull } from "drizzle-orm";
import { logger } from "../infrastructure/logger";
import { unsplashService } from "./unsplash.service";
import { pexelsService } from "./pexels.service";
import { claudeService } from "./claude.service";

// The scan runs on the platform's general Anthropic client through `claudeService.completeJson`
// (cost-tracked to `ai_cost_tracking`, sourceType `ai_gem_discovery`). It ran on xAI's Grok until
// that key's callers were retired (ledger `2026-09-30-retire-xai`); a gem stamped before then keeps
// `source_model = 'grok'` — no backfill, because that is the model that wrote it (§13).

const CATEGORY_PROMPTS: Record<DiscoveryCategory, string> = {
  local_food_secrets: "hidden local restaurants, street food stalls, family-run eateries, and authentic food experiences that tourists rarely find",
  hidden_viewpoints: "viewpoints, scenic overlooks, rooftop spots, and lesser-known places with breathtaking views",
  off_tourist_path: "off-the-beaten-path attractions, underrated neighborhoods, and authentic local experiences away from tourist crowds",
  seasonal_events: "local festivals, seasonal celebrations, traditional events, and cultural gatherings that only locals know about",
  cultural_experiences: "authentic cultural experiences, traditional workshops, local customs, and immersive cultural activities",
  secret_beaches: "hidden beaches, secluded coves, lesser-known coastal spots, and swimming locations",
  street_art: "street art murals, graffiti hotspots, urban art districts, and creative neighborhoods with artistic expression",
  local_markets: "authentic local markets, farmers markets, flea markets, and traditional bazaars where locals shop",
  sunset_spots: "best sunset viewing locations, romantic evening spots, and magical golden hour destinations",
  historic_gems: "overlooked historical sites, hidden archaeological spots, forgotten monuments, and historical locations",
  nature_escapes: "hidden nature trails, gardens, peaceful parks, and natural retreats away from crowds",
  nightlife_secrets: "underground bars, speakeasies, local hangouts, live music venues, and authentic nightlife spots"
};

const CATEGORY_LABELS: Record<DiscoveryCategory, string> = {
  local_food_secrets: "Local Food",
  hidden_viewpoints: "Hidden Viewpoints",
  off_tourist_path: "Off the Tourist Path",
  seasonal_events: "Seasonal Events",
  cultural_experiences: "Cultural Experiences",
  secret_beaches: "Beaches",
  street_art: "Street Art",
  local_markets: "Local Markets",
  sunset_spots: "Sunset Spots",
  historic_gems: "Historic Gems",
  nature_escapes: "Nature Escapes",
  nightlife_secrets: "Nightlife"
};

interface DiscoveredGem {
  name: string;
  description: string;
  whySpecial: string;
  bestTimeToVisit: string;
  insiderTip: string;
  approximateLocation: string;
  coordinates?: { lat: number; lng: number };
  priceRange?: string;
  difficultyLevel?: string;
  tags: string[];
  imageSearchTerms: string[];
}

interface DiscoveryResult {
  destination: string;
  country: string;
  category: DiscoveryCategory;
  gems: DiscoveredGem[];
  confidenceScore: number;
}

/**
 * CMS-1 (ledger `2026-11-04-cms1-launch-screens`; Leon, Nov 3: traveler-facing records are admin-reviewed only): the
 * ONE predicate for a discovery gem a traveler may see on /places. `ai_discovered_gems` has no status and no hidden_at
 * column (shared/schema.ts `aiDiscoveredGems`); every row is AI-born (`source_model`), and the only review it carries is
 * `verified_by_expert`. So a row is public only once an expert verified it — an AI-only row (and a row only a traveler
 * marked, `verified_by_user`) never shows.
 */
export function publicGemWhere() {
  return eq(aiDiscoveredGems.verifiedByExpert, true);
}

/**
 * C-4 (ledger `2026-11-05-lane4-places`): a city's rows — the stored destination is the city name, or "City, Country".
 * Case-insensitive; never a prefix of another city's name.
 */
export function destinationMatches(city: string) {
  const c = city.trim().split(",")[0].trim().toLowerCase();
  return sql`(lower(${aiDiscoveredGems.destination}) = ${c} OR lower(${aiDiscoveredGems.destination}) LIKE ${c + ",%"})`;
}

class GemDiscoveryService {
  private discoveryLogger = logger.child({ service: "gem-discovery" });

  async discoverGemsForDestination(
    destination: string,
    categories: DiscoveryCategory[] = [...discoveryCategories],
    options?: { maxGemsPerCategory?: number; actorUserId?: string | null }
  ): Promise<{ jobId: string; totalGems: number }> {
    const maxGems = options?.maxGemsPerCategory || 5;
    
    const [job] = await db.insert(discoveryJobs).values({
      destination,
      categories,
      status: "running",
      startedAt: new Date(),
    }).returning();

    this.discoveryLogger.info({ jobId: job.id, destination, categories }, "Starting discovery job");

    let totalGems = 0;

    try {
      for (const category of categories) {
        try {
          const result = await this.discoverCategoryGems(destination, category, maxGems, options?.actorUserId ?? null);
          
          for (const gem of result.gems) {
            const existingRows = await db
              .select({ imageUrl: aiDiscoveredGems.imageUrl })
              .from(aiDiscoveredGems)
              .where(
                and(
                  eq(aiDiscoveredGems.destination, result.destination),
                  eq(aiDiscoveredGems.name, gem.name),
                  eq(aiDiscoveredGems.category, category)
                )
              )
              .limit(1);

            const existingImageUrl = existingRows[0]?.imageUrl;
            const imageUrl = existingImageUrl
              ? existingImageUrl
              : await this.fetchGemPhoto(
                  gem.name,
                  result.destination,
                  gem.imageSearchTerms ?? []
                );
            await this.saveGem({
              destination: result.destination,
              country: result.country,
              category,
              name: gem.name,
              description: gem.description,
              whySpecial: gem.whySpecial,
              bestTimeToVisit: gem.bestTimeToVisit,
              insiderTip: gem.insiderTip,
              approximateLocation: gem.approximateLocation,
              coordinates: gem.coordinates,
              priceRange: gem.priceRange,
              difficultyLevel: gem.difficultyLevel,
              tags: gem.tags,
              imageUrl: imageUrl ?? undefined,
              imageSearchTerms: gem.imageSearchTerms,
              relatedExperiences: [],
              sourceModel: result.model,
              // The model's own self-rating; absent ⇒ not recorded, never a default (§13).
              confidenceScore: typeof result.confidenceScore === "number" ? result.confidenceScore.toString() : undefined,
            });
            totalGems++;
          }

          this.discoveryLogger.info({ 
            category, 
            gemsFound: result.gems.length 
          }, "Category discovery completed");
        } catch (error: any) {
          this.discoveryLogger.error({ 
            category, 
            error: error.message 
          }, "Category discovery failed");
        }
      }

      await db.update(discoveryJobs)
        .set({
          status: "completed",
          completedAt: new Date(),
          gemsDiscovered: totalGems,
        })
        .where(eq(discoveryJobs.id, job.id));

      this.discoveryLogger.info({ 
        jobId: job.id, 
        totalGems 
      }, "Discovery job completed");

      return { jobId: job.id, totalGems };
    } catch (error: any) {
      await db.update(discoveryJobs)
        .set({
          status: "failed",
          completedAt: new Date(),
          errorMessage: error.message,
          gemsDiscovered: totalGems,
        })
        .where(eq(discoveryJobs.id, job.id));

      throw error;
    }
  }

  private async discoverCategoryGems(
    destination: string,
    category: DiscoveryCategory,
    maxGems: number,
    actorUserId: string | null,
  ): Promise<DiscoveryResult & { model: string }> {
    const categoryDescription = CATEGORY_PROMPTS[category];
    const categoryLabel = CATEGORY_LABELS[category];

    const systemPrompt = `You are a local travel expert with deep knowledge of places and authentic experiences around the world. You specialize in discovering ${categoryDescription}.

Your goal is to uncover truly special places that:
- Most tourists never find
- Locals genuinely love and recommend
- Offer authentic, memorable experiences
- Are safe and accessible but require some local knowledge to discover

Respond ONLY with valid JSON. No markdown, no code blocks, just raw JSON.`;

    const userPrompt = `Discover ${maxGems} places in ${destination} for the category "${categoryLabel}".

For each gem, provide:
1. name: The actual name of the place/experience
2. description: A vivid 2-3 sentence description
3. whySpecial: What makes this place truly unique (1-2 sentences)
4. bestTimeToVisit: Best time of day, week, or season to visit
5. insiderTip: A specific tip only locals would know
6. approximateLocation: General area/neighborhood within the destination
7. coordinates: Approximate latitude and longitude if possible (optional)
8. priceRange: One of "free", "budget", "moderate", "expensive" (optional)
9. difficultyLevel: One of "easy", "moderate", "challenging" for accessibility (optional)
10. tags: 3-5 relevant tags (e.g., "romantic", "family-friendly", "photography")
11. imageSearchTerms: 2-3 search terms that would find good photos of this place

Return the following JSON structure:
{
  "destination": "City name",
  "country": "Country name",
  "gems": [
    {
      "name": "...",
      "description": "...",
      "whySpecial": "...",
      "bestTimeToVisit": "...",
      "insiderTip": "...",
      "approximateLocation": "...",
      "coordinates": { "lat": 0.0, "lng": 0.0 },
      "priceRange": "...",
      "difficultyLevel": "...",
      "tags": ["...", "..."],
      "imageSearchTerms": ["...", "..."]
    }
  ],
  "confidenceScore": 0.85
}

Focus on authenticity and specificity. Avoid generic tourist attractions.`;

    const { result, model } = await claudeService.completeJson<DiscoveryResult>({
      system: systemPrompt,
      user: userPrompt,
      maxTokens: 4000,
      sourceType: "ai_gem_discovery",
      userId: actorUserId,
      label: `Gem discovery (${category})`,
    });
    if (!Array.isArray(result.gems)) {
      this.discoveryLogger.error({ category }, "Discovery response carried no gems array");
      throw new Error("Discovery response carried no gems array");
    }
    result.category = category;
    return { ...result, model };
  }

  /**
   * Fetches a photo URL for a gem using imageSearchTerms.
   * Tries Unsplash first, then Pexels as a fallback. Returns null if neither is available.
   */
  private async fetchGemPhoto(
    name: string,
    destination: string,
    imageSearchTerms: string[]
  ): Promise<string | null> {
    // SH-1 item 6: a place under a no_photos block is never searched for — no request at all, not only no display.
    if (await this.gemPhotoBlocked(name, destination)) return null;
    const searchQuery = imageSearchTerms.length > 0
      ? `${imageSearchTerms[0]} ${destination}`
      : `${name} ${destination}`;

    try {
      const unsplashResults = await unsplashService.searchPhotos(searchQuery, { perPage: 1, orientation: "landscape" });
      if (unsplashResults[0]?.url && !isBannedPhotoUrl(unsplashResults[0].url)) {
        return unsplashResults[0].url;
      }
    } catch {
      // fall through to Pexels
    }

    try {
      const pexelsResults = await pexelsService.searchPhotos(searchQuery, { perPage: 1 });
      const photo = pexelsResults.find((r) => r.mediaType === "photo" && !isBannedPhotoUrl(r.url));
      if (photo?.url) {
        return photo.url;
      }
    } catch {
      // no photo available
    }

    return null;
  }

  /**
   * SH-1 item 6: is this gem's place under a no_photos block (name + city, the ONE rule)? An unreadable block list
   * answers yes, so a failed read never spends a photo search on a place that may be blocked.
   */
  private async gemPhotoBlocked(name: string, destination: string): Promise<boolean> {
    try {
      return (await photoBlockedFor({ names: [name], city: destination })) !== null;
    } catch (err) {
      logger.warn({ err: String((err as any)?.message ?? err).slice(0, 200) }, `[gem-photo] block list unreadable; photo search skipped for "${name}"`);
      return true;
    }
  }

  private async saveGem(gem: InsertAiDiscoveredGem): Promise<void> {
    const existing = await db.select()
      .from(aiDiscoveredGems)
      .where(
        and(
          eq(aiDiscoveredGems.destination, gem.destination),
          eq(aiDiscoveredGems.name, gem.name),
          eq(aiDiscoveredGems.category, gem.category)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      const preservedImageUrl = (!gem.imageUrl && existing[0].imageUrl) ? existing[0].imageUrl : gem.imageUrl;
      await db.update(aiDiscoveredGems)
        .set({
          ...gem,
          imageUrl: preservedImageUrl,
          updatedAt: new Date(),
          lastRefreshedAt: new Date(),
        })
        .where(eq(aiDiscoveredGems.id, existing[0].id));
    } else {
      await db.insert(aiDiscoveredGems).values(gem);
    }
  }

  async getGemsForDestination(
    destination: string,
    options?: {
      category?: DiscoveryCategory;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ gems: any[]; total: number }> {
    // CMS-1 (ledger `2026-11-04-cms1-launch-screens`): /places shows reviewed rows only (`publicGemWhere`).
    const where = and(
      publicGemWhere(),
      destinationMatches(destination),
      options?.category ? eq(aiDiscoveredGems.category, options.category) : undefined,
    );
    const gems = await db.select()
      .from(aiDiscoveredGems)
      .where(where)
      .orderBy(desc(aiDiscoveredGems.saveCount), desc(aiDiscoveredGems.viewCount))
      .limit(options?.limit || 50)
      .offset(options?.offset || 0);

    const [{ count }] = await db.select({ count: sql<number>`count(*)` })
      .from(aiDiscoveredGems)
      .where(where);

    // CS-1 item 1: a gem of a place under a no_photos block shows no image (hidden, never deleted).
    const blocks = await photoBlocks();
    return { gems: gems.map((g) => hideBlockedGemImage(g, blocks)), total: Number(count) };
  }

  async getAllGems(options?: {
    category?: DiscoveryCategory;
    limit?: number;
    offset?: number;
  }): Promise<{ gems: any[]; total: number }> {
    // CMS-1: reviewed rows only, as above.
    const where = and(publicGemWhere(), options?.category ? eq(aiDiscoveredGems.category, options.category) : undefined);
    const gems = await db.select()
      .from(aiDiscoveredGems)
      .where(where)
      .orderBy(desc(aiDiscoveredGems.saveCount), desc(aiDiscoveredGems.viewCount))
      .limit(options?.limit || 50)
      .offset(options?.offset || 0);

    const [{ count }] = await db.select({ count: sql<number>`count(*)` })
      .from(aiDiscoveredGems)
      .where(where);

    // CS-1 item 1: a gem of a place under a no_photos block shows no image (hidden, never deleted).
    const blocks = await photoBlocks();
    return { gems: gems.map((g) => hideBlockedGemImage(g, blocks)), total: Number(count) };
  }

  async incrementViewCount(gemId: string): Promise<void> {
    await db.update(aiDiscoveredGems)
      .set({ viewCount: sql`${aiDiscoveredGems.viewCount} + 1` })
      .where(eq(aiDiscoveredGems.id, gemId));
  }

  async getDiscoveryJobs(limit: number = 20): Promise<any[]> {
    return db.select()
      .from(discoveryJobs)
      .orderBy(desc(discoveryJobs.createdAt))
      .limit(limit);
  }

  /**
   * A-20 / C-5 (ledger `2026-11-05-lane4-places`): the chips a page shows — only categories with at least one reviewed
   * item (for the city, when one is named), labelled and ordered by the approved chip set (`placesChips`).
   */
  async getAvailableCategories(destination?: string | null): Promise<{ value: string; label: string }[]> {
    const rows = await db
      .selectDistinct({ category: aiDiscoveredGems.category })
      .from(aiDiscoveredGems)
      .where(and(publicGemWhere(), destination ? destinationMatches(destination) : undefined));
    return placesChips(rows.map((r) => r.category).filter((c): c is string => typeof c === "string"));
  }

  async getDestinationsWithGems(): Promise<{ destination: string; gemCount: number }[]> {
    const results = await db.select({
      destination: aiDiscoveredGems.destination,
      gemCount: sql<number>`count(*)::int`
    })
      .from(aiDiscoveredGems)
      .where(publicGemWhere())
      .groupBy(aiDiscoveredGems.destination)
      .orderBy(desc(sql`count(*)`));

    return results;
  }

  async backfillGemPhotos(): Promise<{ processed: number; updated: number; failed: number; skippedBlocked: number }> {
    const gems = await db.select({
      id: aiDiscoveredGems.id,
      name: aiDiscoveredGems.name,
      destination: aiDiscoveredGems.destination,
      imageSearchTerms: aiDiscoveredGems.imageSearchTerms,
    })
      .from(aiDiscoveredGems)
      .where(isNull(aiDiscoveredGems.imageUrl));

    let updated = 0;
    let failed = 0;
    let skippedBlocked = 0;

    for (const gem of gems) {
      try {
        // SH-1 item 6: a blocked place is skipped before any photo request, and counted as skipped, not failed.
        if (await this.gemPhotoBlocked(gem.name, gem.destination)) {
          skippedBlocked++;
          continue;
        }
        const terms = Array.isArray(gem.imageSearchTerms) ? gem.imageSearchTerms as string[] : [];
        const imageUrl = await this.fetchGemPhoto(gem.name, gem.destination, terms);
        if (imageUrl) {
          await db.update(aiDiscoveredGems)
            .set({ imageUrl, updatedAt: new Date() })
            .where(eq(aiDiscoveredGems.id, gem.id));
          updated++;
        } else {
          failed++;
        }
      } catch (err) {
        logger.error(`backfillGemPhotos: failed for gem ${gem.id}`, err);
        failed++;
      }
    }

    return { processed: gems.length, updated, failed, skippedBlocked };
  }
}

export const gemDiscoveryService = new GemDiscoveryService();
