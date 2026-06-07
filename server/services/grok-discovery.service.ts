import OpenAI from "openai";
import { db } from "../db";
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

const GROK_MODEL = "grok-3";

let _grokClient: OpenAI | null = null;

function getGrokClient(): OpenAI {
  if (!_grokClient) {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      throw new Error("XAI_API_KEY is not configured");
    }
    _grokClient = new OpenAI({
      baseURL: "https://api.x.ai/v1",
      apiKey,
    });
  }
  return _grokClient;
}

const CATEGORY_PROMPTS: Record<DiscoveryCategory, string> = {
  local_food_secrets: "hidden local restaurants, street food stalls, family-run eateries, and authentic food experiences that tourists rarely find",
  hidden_viewpoints: "secret viewpoints, scenic overlooks, rooftop spots, and lesser-known places with breathtaking views",
  off_tourist_path: "off-the-beaten-path attractions, underrated neighborhoods, and authentic local experiences away from tourist crowds",
  seasonal_events: "local festivals, seasonal celebrations, traditional events, and cultural gatherings that only locals know about",
  cultural_experiences: "authentic cultural experiences, traditional workshops, local customs, and immersive cultural activities",
  secret_beaches: "hidden beaches, secluded coves, lesser-known coastal spots, and secret swimming locations",
  street_art: "street art murals, graffiti hotspots, urban art districts, and creative neighborhoods with artistic expression",
  local_markets: "authentic local markets, farmers markets, flea markets, and traditional bazaars where locals shop",
  sunset_spots: "best sunset viewing locations, romantic evening spots, and magical golden hour destinations",
  historic_gems: "overlooked historical sites, hidden archaeological spots, forgotten monuments, and secret historical locations",
  nature_escapes: "hidden nature trails, secret gardens, peaceful parks, and natural retreats away from crowds",
  nightlife_secrets: "underground bars, speakeasies, local hangouts, live music venues, and authentic nightlife spots"
};

const CATEGORY_LABELS: Record<DiscoveryCategory, string> = {
  local_food_secrets: "Local Food Secrets",
  hidden_viewpoints: "Hidden Viewpoints",
  off_tourist_path: "Off the Tourist Path",
  seasonal_events: "Seasonal Events",
  cultural_experiences: "Cultural Experiences",
  secret_beaches: "Secret Beaches",
  street_art: "Street Art",
  local_markets: "Local Markets",
  sunset_spots: "Sunset Spots",
  historic_gems: "Historic Gems",
  nature_escapes: "Nature Escapes",
  nightlife_secrets: "Nightlife Secrets"
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

class GrokDiscoveryService {
  private discoveryLogger = logger.child({ service: "grok-discovery" });

  async discoverGemsForDestination(
    destination: string,
    categories: DiscoveryCategory[] = [...discoveryCategories],
    options?: { maxGemsPerCategory?: number }
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
          const result = await this.discoverCategoryGems(destination, category, maxGems);
          
          for (const gem of result.gems) {
            const imageUrl = await this.fetchGemPhoto(
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
              sourceModel: "grok",
              confidenceScore: result.confidenceScore.toString(),
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
    maxGems: number
  ): Promise<DiscoveryResult> {
    const client = getGrokClient();
    const categoryDescription = CATEGORY_PROMPTS[category];
    const categoryLabel = CATEGORY_LABELS[category];

    const systemPrompt = `You are a local travel expert and cultural insider with deep knowledge of hidden gems and authentic experiences around the world. You specialize in discovering ${categoryDescription}.

Your goal is to uncover truly special places that:
- Most tourists never find
- Locals genuinely love and recommend
- Offer authentic, memorable experiences
- Are safe and accessible but require some local knowledge to discover

Respond ONLY with valid JSON. No markdown, no code blocks, just raw JSON.`;

    const userPrompt = `Discover ${maxGems} hidden gems in ${destination} for the category "${categoryLabel}".

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

    const response = await client.chat.completions.create({
      model: GROK_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.8,
      max_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from Grok");
    }

    const cleanedContent = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    try {
      const result = JSON.parse(cleanedContent) as DiscoveryResult;
      result.category = category;
      return result;
    } catch (parseError) {
      this.discoveryLogger.error({ 
        category, 
        content: cleanedContent.substring(0, 500) 
      }, "Failed to parse Grok response");
      throw new Error(`Failed to parse discovery response: ${parseError}`);
    }
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
    const searchQuery = imageSearchTerms.length > 0
      ? `${imageSearchTerms[0]} ${destination}`
      : `${name} ${destination}`;

    try {
      const unsplashResults = await unsplashService.searchPhotos(searchQuery, { perPage: 1, orientation: "landscape" });
      if (unsplashResults[0]?.url) {
        return unsplashResults[0].url;
      }
    } catch {
      // fall through to Pexels
    }

    try {
      const pexelsResults = await pexelsService.searchPhotos(searchQuery, { perPage: 1 });
      const photo = pexelsResults.find((r) => r.mediaType === "photo");
      if (photo?.url) {
        return photo.url;
      }
    } catch {
      // no photo available
    }

    return null;
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
      await db.update(aiDiscoveredGems)
        .set({
          ...gem,
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
    let query = db.select()
      .from(aiDiscoveredGems)
      .where(eq(aiDiscoveredGems.destination, destination))
      .$dynamic();

    if (options?.category) {
      query = query.where(
        and(
          eq(aiDiscoveredGems.destination, destination),
          eq(aiDiscoveredGems.category, options.category)
        )
      );
    }

    const gems = await query
      .orderBy(desc(aiDiscoveredGems.saveCount), desc(aiDiscoveredGems.viewCount))
      .limit(options?.limit || 50)
      .offset(options?.offset || 0);

    const [{ count }] = await db.select({ count: sql<number>`count(*)` })
      .from(aiDiscoveredGems)
      .where(eq(aiDiscoveredGems.destination, destination));

    return { gems, total: Number(count) };
  }

  async getAllGems(options?: {
    category?: DiscoveryCategory;
    limit?: number;
    offset?: number;
  }): Promise<{ gems: any[]; total: number }> {
    let baseQuery = db.select().from(aiDiscoveredGems).$dynamic();

    if (options?.category) {
      baseQuery = baseQuery.where(eq(aiDiscoveredGems.category, options.category));
    }

    const gems = await baseQuery
      .orderBy(desc(aiDiscoveredGems.saveCount), desc(aiDiscoveredGems.viewCount))
      .limit(options?.limit || 50)
      .offset(options?.offset || 0);

    let countQuery = db.select({ count: sql<number>`count(*)` })
      .from(aiDiscoveredGems)
      .$dynamic();

    if (options?.category) {
      countQuery = countQuery.where(eq(aiDiscoveredGems.category, options.category));
    }

    const [{ count }] = await countQuery;

    return { gems, total: Number(count) };
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

  async getAvailableCategories(): Promise<{ value: DiscoveryCategory; label: string }[]> {
    return discoveryCategories.map(cat => ({
      value: cat,
      label: CATEGORY_LABELS[cat]
    }));
  }

  async getDestinationsWithGems(): Promise<{ destination: string; gemCount: number }[]> {
    const results = await db.select({
      destination: aiDiscoveredGems.destination,
      gemCount: sql<number>`count(*)::int`
    })
      .from(aiDiscoveredGems)
      .groupBy(aiDiscoveredGems.destination)
      .orderBy(desc(sql`count(*)`));

    return results;
  }

  async backfillGemPhotos(): Promise<{ processed: number; updated: number; failed: number }> {
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

    for (const gem of gems) {
      try {
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

    return { processed: gems.length, updated, failed };
  }
}

export const grokDiscoveryService = new GrokDiscoveryService();
