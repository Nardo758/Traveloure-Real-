import FirecrawlApp from "@mendable/firecrawl-js";
import { TavilyClient } from "tavily";

// Brave Search API is a simple REST API — no official SDK, so we use fetch
interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
  age?: string;
  is_source_local?: boolean;
  is_source_both?: boolean;
  family_friendly?: boolean;
}

interface BraveSearchResponse {
  web?: {
    results: BraveSearchResult[];
  };
  query?: {
    original: string;
    show_strict_warning: boolean;
    is_navigational: boolean;
    is_news_breaking: boolean;
    spellcheck_off: boolean;
    country: string;
    bad_results: boolean;
    should_fallback: boolean;
    postal_code: string;
    city: string;
    header_country: string;
    more_results_available: boolean;
  };
}

// ============================================================
// CONFIGURATION INTERFACES
// ============================================================

interface CrawlerConfig {
  firecrawlApiKey: string;
  tavilyApiKey: string;
  braveApiKey: string;
}

interface VenueSchema {
  venue_name?: string;
  location?: {
    city?: string;
    country?: string;
    lat?: number;
    lng?: number;
  };
  venue_type?: string;
  capacity?: { min?: number; max?: number; unit?: string };
  ceremony_types?: string[];
  pricing?: {
    currency?: string;
    range_min?: number;
    range_max?: number;
    basis?: string;
    notes?: string;
  };
  description?: string;
  images?: string[];
  hours?: Record<string, string>;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  inquiry_required?: boolean;
}

interface ScrapedResult {
  url: string;
  markdown?: string;
  html?: string;
  json?: VenueSchema;
  metadata?: {
    title?: string;
    source?: string;
    language?: string;
  };
  actions?: any;
}

interface ExtractJob {
  urls: string[];
  schema?: object;
  prompt?: string;
}

interface CrawlJob {
  startUrl: string;
  includePaths?: string[];
  excludePaths?: string[];
  maxDepth?: number;
  limit?: number;
}

// ============================================================
// DMOCrawler — The AI Scraping Engine
// ============================================================

export class DMOCrawler {
  private firecrawl: FirecrawlApp;
  private tavily: TavilyClient;
  private braveApiKey: string;
  private rateLimiters: Map<string, number> = new Map();

  constructor(config: CrawlerConfig) {
    this.firecrawl = new FirecrawlApp({ apiKey: config.firecrawlApiKey });
    this.tavily = new TavilyClient({ apiKey: config.tavilyApiKey });
    this.braveApiKey = config.braveApiKey;
  }

  // ----------------------------------------------------------------
  // 1. DISCOVERY — Find DMO and venue pages
  // ----------------------------------------------------------------

  /**
   * Discover URLs using Brave Search (cheaper, independent index).
   * Fallback to Tavily if Brave returns thin results.
   */
  async discoverUrls(query: string, market: string, opts: { count?: number; site?: string } = {}): Promise<string[]> {
    const { count = 20, site } = opts;
    const searchQuery = site ? `${query} site:${site}` : query;

    // Try Brave first (cheaper: $5/1K queries)
    const braveResults = await this.braveSearch(searchQuery, count);

    if (braveResults.length >= 5) {
      return braveResults.map((r) => r.url);
    }

    // Fallback to Tavily (bundles search + extraction, $0.008/credit)
    console.log(`[DMOCrawler] Brave returned ${braveResults.length} results for "${query}". Falling back to Tavily...`);
    const tavilyResults = await this.tavily.search({
      query: searchQuery,
      max_results: count,
      search_depth: "basic",
      include_answer: false,
    });

    return tavilyResults.results.map((r: any) => r.url);
  }

  /**
   * Brave Search API call.
   * Docs: https://api.search.brave.com/app/documentation/web-search/get-started
   */
  private async braveSearch(query: string, count: number): Promise<BraveSearchResult[]> {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(Math.min(count, 20)));
    url.searchParams.set("offset", "0");
    url.searchParams.set("mkt", "en-US");
    url.searchParams.set("safesearch", "off");
    url.searchParams.set("freshness", "all");
    url.searchParams.set("text_decorations", "false");
    url.searchParams.set("spellcheck", "false");

    try {
      const res = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": this.braveApiKey,
        },
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => "unknown");
        console.error(`[DMOCrawler] Brave Search error: ${res.status} ${errBody}`);
        return [];
      }

      const data: BraveSearchResponse = await res.json();
      return data.web?.results || [];
    } catch (err) {
      console.error("[DMOCrawler] Brave Search fetch error:", err);
      return [];
    }
  }

  // ----------------------------------------------------------------
  // 2. EXTRACTION — Scrape full content from discovered URLs
  // ----------------------------------------------------------------

  /**
   * Scrape a single URL into clean markdown + structured JSON.
   * Handles JS rendering, anti-bot, PDF parsing automatically.
   */
  async scrapeUrl(url: string, opts: { formats?: ("markdown" | "html" | "json")[]; prompt?: string } = {}): Promise<ScrapedResult> {
    const formats = opts.formats || ["markdown", "json"];
    const jsonOptions = opts.prompt
      ? { prompt: opts.prompt }
      : undefined;

    const result = await this.firecrawl.scrapeUrl(url, {
      formats,
      ...(jsonOptions ? { jsonOptions } : {}),
    });

    if (!result.success) {
      throw new Error(`[DMOCrawler] Firecrawl scrape failed for ${url}: ${result.error}`);
    }

    return {
      url,
      markdown: result.markdown || undefined,
      html: result.html || undefined,
      json: result.json as VenueSchema || undefined,
      metadata: {
        title: result.metadata?.title || undefined,
        source: result.metadata?.sourceURL || undefined,
        language: result.metadata?.language || undefined,
      },
    };
  }

  /**
   * Batch scrape multiple URLs asynchronously.
   * Best for processing 50–200 URLs at once.
   */
  async batchScrape(urls: string[], opts: { formats?: ("markdown" | "json")[]; prompt?: string } = {}): Promise<ScrapedResult[]> {
    if (urls.length === 0) return [];

    const formats = opts.formats || ["markdown", "json"];
    const jsonOptions = opts.prompt
      ? { prompt: opts.prompt }
      : undefined;

    const job = await this.firecrawl.asyncBatchScrapeUrls(urls, {
      formats,
      ...(jsonOptions ? { jsonOptions } : {}),
    });

    // Poll for completion
    let status: any = await this.firecrawl.checkBatchScrapeStatus(job.id);
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes at 5-second intervals

    while (status.status !== "completed" && status.status !== "failed" && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      status = await this.firecrawl.checkBatchScrapeStatus(job.id);
      attempts++;
    }

    if (status.status === "failed") {
      throw new Error(`[DMOCrawler] Batch scrape failed: ${status.error}`);
    }

    if (status.status !== "completed") {
      throw new Error(`[DMOCrawler] Batch scrape timed out after ${attempts * 5}s`);
    }

    return (status.data || []).map((item: any) => ({
      url: item.metadata?.sourceURL || item.url,
      markdown: item.markdown || undefined,
      html: item.html || undefined,
      json: item.json as VenueSchema || undefined,
      metadata: {
        title: item.metadata?.title || undefined,
        source: item.metadata?.sourceURL || undefined,
        language: item.metadata?.language || undefined,
      },
    }));
  }

  // ----------------------------------------------------------------
  // 3. CRAWL — Map entire venue sites recursively
  // ----------------------------------------------------------------

  /**
   * Crawl an entire website starting from a URL, following links.
   * Filters by includePaths (e.g., ["/wedding", "/weddings"]) to target wedding sections.
   */
  async crawlSite(startUrl: string, opts: CrawlJob): Promise<ScrapedResult[]> {
    const job = await this.firecrawl.asyncCrawlUrl(startUrl, {
      includePaths: opts.includePaths,
      excludePaths: opts.excludePaths,
      maxDepth: opts.maxDepth || 2,
      limit: opts.limit || 50,
      scrapeOptions: {
        formats: ["markdown"],
      },
    });

    // Poll for completion
    let status: any = await this.firecrawl.checkCrawlStatus(job.id);
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes at 5-second intervals

    while (status.status !== "completed" && status.status !== "failed" && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      status = await this.firecrawl.checkCrawlStatus(job.id);
      attempts++;
    }

    if (status.status === "failed") {
      throw new Error(`[DMOCrawler] Crawl failed: ${status.error}`);
    }

    if (status.status !== "completed") {
      throw new Error(`[DMOCrawler] Crawl timed out after ${attempts * 5}s`);
    }

    return (status.data || []).map((item: any) => ({
      url: item.metadata?.sourceURL || item.url,
      markdown: item.markdown || undefined,
      metadata: {
        title: item.metadata?.title || undefined,
        source: item.metadata?.sourceURL || undefined,
        language: item.metadata?.language || undefined,
      },
    }));
  }

  // ----------------------------------------------------------------
  // 4. STRUCTURED EXTRACTION — LLM-powered schema extraction
  // ----------------------------------------------------------------

  /**
   * Extract structured data from a URL using Firecrawl's LLM extraction.
   * Define a schema and Firecrawl's LLM fills it in.
   */
  async extractStructured(url: string, schema: object): Promise<any> {
    const result = await this.firecrawl.scrapeUrl(url, {
      formats: ["json"],
      jsonOptions: {
        schema,
      },
    });

    if (!result.success) {
      throw new Error(`[DMOCrawler] Structured extraction failed for ${url}: ${result.error}`);
    }

    return result.json;
  }

  // ----------------------------------------------------------------
  // 5. TAVILY SEARCH + EXTRACT — One-call discovery + content
  // ----------------------------------------------------------------

  /**
   * Use Tavily for search + extraction in one API call.
   * More expensive than Brave + Firecrawl separately, but fewer moving parts.
   * Best for: quick research, real-time answers, narrow queries.
   */
  async tavilySearchAndExtract(query: string, opts: { max_results?: number; include_answer?: boolean } = {}): Promise<any> {
    const result = await this.tavily.search({
      query,
      max_results: opts.max_results || 5,
      search_depth: "advanced",
      include_answer: opts.include_answer ?? true,
      include_raw_content: true,
      include_images: true,
    });

    return {
      answer: result.answer,
      query: result.query,
      results: result.results.map((r: any) => ({
        title: r.title,
        url: r.url,
        content: r.content,
        raw_content: r.raw_content,
        score: r.score,
        images: r.images,
      })),
    };
  }

  // ----------------------------------------------------------------
  // 6. HIGH-LEVEL WORKFLOWS
  // ----------------------------------------------------------------

  /**
   * Discover → Scrape → Extract workflow for a single market query.
   * Example: "wedding venues in Phuket" → discovers URLs → scrapes → extracts structured data.
   */
  async discoverAndExtract(query: string, market: string, opts: { site?: string; maxUrls?: number; extractSchema?: object } = {}): Promise<ScrapedResult[]> {
    const urls = await this.discoverUrls(query, market, { count: opts.maxUrls || 10, site: opts.site });

    if (urls.length === 0) {
      console.log(`[DMOCrawler] No URLs discovered for "${query}" in ${market}`);
      return [];
    }

    const defaultPrompt = `
      Extract wedding/event venue information as JSON with these fields:
      venue_name (string), location.city (string), location.country (string), 
      location.lat (number), location.lng (number), venue_type (string: temple|church|hotel|quinta|palace|beach|garden|heritage|other),
      capacity.min (number), capacity.max (number), capacity.unit (string: guests|seated|standing),
      ceremony_types (string array), pricing.currency (string), pricing.range_min (number), pricing.range_max (number),
      pricing.basis (string: per_guest|flat|package), pricing.notes (string),
      description (string), images (string array of URLs), hours (object with day keys), address (string),
      phone (string), email (string), website (string), inquiry_required (boolean).
      If pricing is not listed, set inquiry_required to true.
    `;

    const results = await this.batchScrape(urls, {
      formats: ["markdown", "json"],
      prompt: opts.extractSchema ? undefined : defaultPrompt,
    });

    return results;
  }

  /**
   * Crawl a venue site's wedding section entirely.
   * Example: crawl "https://amanpuri.com" with includePaths ["/wedding", "/weddings"]
   */
  async crawlVenueWeddingPages(baseUrl: string, opts: { maxDepth?: number; limit?: number } = {}): Promise<ScrapedResult[]> {
    return this.crawlSite(baseUrl, {
      startUrl: baseUrl,
      includePaths: ["/wedding", "/weddings", "/bodas", "/eventos", "/events", "/venue-hire", "/celebrations"],
      excludePaths: ["/blog", "/news", "/contact", "/privacy", "/terms"],
      maxDepth: opts.maxDepth || 2,
      limit: opts.limit || 50,
    });
  }

  /**
   * Scrape a wedding directory listing page and extract all venue cards.
   * Example: "https://www.hitched.co.uk/wedding-venues/london/"
   */
  async scrapeDirectoryPage(directoryUrl: string): Promise<ScrapedResult[]> {
    const result = await this.scrapeUrl(directoryUrl, {
      formats: ["markdown"],
    });

    // The markdown will contain all venue cards. We can then extract individual venue URLs
    // and batch-scrape them. For now, return the directory page content.
    return [result];
  }

  // ----------------------------------------------------------------
  // 7. UTILITIES
  // ----------------------------------------------------------------

  /**
   * Rate-limited wrapper for any async function.
   * Respects per-source rate limits (e.g., 1 req/sec for DMO sites).
   */
  async withRateLimit<T>(sourceDomain: string, fn: () => Promise<T>, rateLimitRps: number = 1): Promise<T> {
    const lastCall = this.rateLimiters.get(sourceDomain) || 0;
    const now = Date.now();
    const minInterval = 1000 / rateLimitRps;
    const wait = Math.max(0, lastCall + minInterval - now);

    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }

    this.rateLimiters.set(sourceDomain, Date.now());
    return fn();
  }

  /**
   * Calculate confidence score for a scraped result.
   */
  calculateConfidence(raw: VenueSchema, metadata: any): number {
    let score = 0.5; // Base for scraped content

    if (raw.pricing && !raw.inquiry_required) score += 0.2;
    if (raw.capacity && (raw.capacity.max || 0) > 0) score += 0.1;
    if (raw.images && raw.images.length > 0) score += 0.1;
    if (metadata?.source?.includes("official") || metadata?.source?.includes("gov")) score += 0.1;

    return Math.min(score, 1.0);
  }

  /**
   * Normalize scraped venue data to Traveloure's DMO schema.
   */
  normalizeToSchema(raw: VenueSchema, url: string, sourceId: string, scrapedBy: string): any {
    const confidence = this.calculateConfidence(raw, { source: url });

    return {
      sourceId,
      externalId: undefined,
      contentType: "venue",
      status: "pending_expert_review",
      name: raw.venue_name || "Unknown Venue",
      description: raw.description || "",
      shortDescription: raw.description?.slice(0, 200) || "",
      country: raw.location?.country || "",
      city: raw.location?.city || "",
      latitude: raw.location?.lat ? String(raw.location.lat) : undefined,
      longitude: raw.location?.lng ? String(raw.location.lng) : undefined,
      address: raw.address || "",
      rawData: raw,
      extractedData: raw,
      images: raw.images?.map((url: string) => ({ url, alt: raw.venue_name, license: "unknown" })) || [],
      primaryImageUrl: raw.images?.[0] || undefined,
      tags: ["wedding_venue", ...(raw.ceremony_types || [])],
      categories: [raw.venue_type || "other"],
      eventTypes: ["wedding", "proposal", "anniversary", "birthday"],
      sourceUrl: url,
      sourcePageTitle: raw.venue_name,
      scrapedAt: new Date(),
      scrapedBy,
      license: "unknown",
      confidenceScore: String(confidence),
      dataQualityFlags: [],
      expertWorkspaceVisible: true,
      discoverPageVisible: false,
      expertReviewedAt: null,
      expertReviewedBy: null,
      publishedAt: null,
      publishedBy: null,
    };
  }
}

// ============================================================
// FACTORY / EXPORT
// ============================================================

export function createDMOCrawler(): DMOCrawler {
  const config: CrawlerConfig = {
    firecrawlApiKey: process.env.FIRECRAWL_API_KEY || "",
    tavilyApiKey: process.env.TAVILY_API_KEY || "",
    braveApiKey: process.env.BRAVE_API_KEY || "",
  };

  if (!config.firecrawlApiKey) {
    console.warn("[DMOCrawler] FIRECRAWL_API_KEY not set. Scraping will fail.");
  }
  if (!config.tavilyApiKey) {
    console.warn("[DMOCrawler] TAVILY_API_KEY not set. Tavily fallback will fail.");
  }
  if (!config.braveApiKey) {
    console.warn("[DMOCrawler] BRAVE_API_KEY not set. Brave discovery will fail.");
  }

  return new DMOCrawler(config);
}
