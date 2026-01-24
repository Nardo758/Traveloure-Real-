import OpenAI from "openai";
import { db } from "../db";
import { 
  affiliatePartners, 
  affiliateProducts, 
  affiliateScrapeJobs,
  affiliateClicks,
  type AffiliatePartner,
  type AffiliateProduct,
  type InsertAffiliateProduct
} from "@shared/schema";
import { eq, desc, and, sql, ilike } from "drizzle-orm";

const GROK_MODEL = "grok-3";

interface ScrapedProduct {
  externalId?: string;
  name: string;
  description?: string;
  shortDescription?: string;
  category?: string;
  subCategory?: string;
  price?: number;
  currency?: string;
  originalPrice?: number;
  discountPercent?: number;
  imageUrl?: string;
  imageUrls?: string[];
  productUrl: string;
  location?: string;
  city?: string;
  country?: string;
  coordinates?: { lat: number; lng: number };
  rating?: number;
  reviewCount?: number;
  duration?: string;
  highlights?: string[];
  includes?: string[];
  tags?: string[];
  availability?: string;
  bookingInfo?: string;
}

class AffiliateScraperService {
  private grokClient: OpenAI | null = null;

  private getGrokClient(): OpenAI {
    if (!this.grokClient) {
      const apiKey = process.env.XAI_API_KEY;
      if (!apiKey) {
        throw new Error("XAI_API_KEY not configured");
      }
      this.grokClient = new OpenAI({
        apiKey,
        baseURL: "https://api.x.ai/v1",
      });
    }
    return this.grokClient;
  }

  async createPartner(data: {
    name: string;
    websiteUrl: string;
    category: string;
    affiliateTrackingId?: string;
    affiliateLinkTemplate?: string;
    description?: string;
    logoUrl?: string;
    commissionRate?: number;
    scrapeConfig?: {
      productListUrl?: string;
      productSelector?: string;
      paginationType?: "page" | "scroll" | "loadMore";
      maxPages?: number;
      scrapeInterval?: number;
    };
  }): Promise<AffiliatePartner> {
    const [partner] = await db.insert(affiliatePartners).values({
      name: data.name,
      websiteUrl: data.websiteUrl,
      category: data.category,
      affiliateTrackingId: data.affiliateTrackingId,
      affiliateLinkTemplate: data.affiliateLinkTemplate,
      description: data.description,
      logoUrl: data.logoUrl,
      commissionRate: data.commissionRate?.toString(),
      scrapeConfig: data.scrapeConfig,
    }).returning();
    
    return partner;
  }

  async updatePartner(id: string, data: Partial<{
    name: string;
    websiteUrl: string;
    category: string;
    affiliateTrackingId: string;
    affiliateLinkTemplate: string;
    description: string;
    logoUrl: string;
    commissionRate: number;
    scrapeConfig: any;
    isActive: boolean;
  }>): Promise<AffiliatePartner | null> {
    const updateData: any = { ...data, updatedAt: new Date() };
    if (data.commissionRate !== undefined) {
      updateData.commissionRate = data.commissionRate.toString();
    }
    
    const [updated] = await db.update(affiliatePartners)
      .set(updateData)
      .where(eq(affiliatePartners.id, id))
      .returning();
    
    return updated || null;
  }

  async getPartners(options?: {
    category?: string;
    isActive?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ partners: AffiliatePartner[]; total: number }> {
    let query = db.select().from(affiliatePartners).$dynamic();
    let countQuery = db.select({ count: sql<number>`count(*)` }).from(affiliatePartners).$dynamic();

    if (options?.category) {
      query = query.where(eq(affiliatePartners.category, options.category));
      countQuery = countQuery.where(eq(affiliatePartners.category, options.category));
    }

    if (options?.isActive !== undefined) {
      const condition = eq(affiliatePartners.isActive, options.isActive);
      query = query.where(options?.category 
        ? and(eq(affiliatePartners.category, options.category), condition)
        : condition
      );
    }

    const partners = await query
      .orderBy(desc(affiliatePartners.createdAt))
      .limit(options?.limit || 50)
      .offset(options?.offset || 0);

    const [{ count }] = await countQuery;

    return { partners, total: Number(count) };
  }

  async getPartnerById(id: string): Promise<AffiliatePartner | null> {
    const [partner] = await db.select()
      .from(affiliatePartners)
      .where(eq(affiliatePartners.id, id))
      .limit(1);
    
    return partner || null;
  }

  async deletePartner(id: string): Promise<boolean> {
    const result = await db.delete(affiliatePartners)
      .where(eq(affiliatePartners.id, id));
    
    return (result.rowCount ?? 0) > 0;
  }

  async scrapePartnerWebsite(partnerId: string): Promise<{
    jobId: string;
    productsFound: number;
    productsNew: number;
    productsUpdated: number;
    message: string;
  }> {
    const partner = await this.getPartnerById(partnerId);
    if (!partner) {
      throw new Error("Partner not found");
    }

    const [job] = await db.insert(affiliateScrapeJobs).values({
      partnerId,
      status: "running",
      startedAt: new Date(),
    }).returning();

    try {
      const scrapeUrl = partner.scrapeConfig?.productListUrl || partner.websiteUrl;
      
      const htmlContent = await this.fetchWebPage(scrapeUrl);
      
      const products = await this.extractProductsWithAI(htmlContent, partner);
      
      let productsNew = 0;
      let productsUpdated = 0;

      for (const product of products) {
        const affiliateUrl = this.generateAffiliateUrl(product.productUrl, partner);
        
        const existingProduct = await db.select()
          .from(affiliateProducts)
          .where(and(
            eq(affiliateProducts.partnerId, partnerId),
            eq(affiliateProducts.productUrl, product.productUrl)
          ))
          .limit(1);

        if (existingProduct.length > 0) {
          await db.update(affiliateProducts)
            .set({
              ...product,
              affiliateUrl,
              lastScrapedAt: new Date(),
              updatedAt: new Date(),
              price: product.price?.toString(),
              originalPrice: product.originalPrice?.toString(),
              rating: product.rating?.toString(),
            })
            .where(eq(affiliateProducts.id, existingProduct[0].id));
          productsUpdated++;
        } else {
          await db.insert(affiliateProducts).values({
            partnerId,
            ...product,
            affiliateUrl,
            lastScrapedAt: new Date(),
            price: product.price?.toString(),
            originalPrice: product.originalPrice?.toString(),
            rating: product.rating?.toString(),
          });
          productsNew++;
        }
      }

      await db.update(affiliateScrapeJobs)
        .set({
          status: "completed",
          productsFound: products.length,
          productsNew,
          productsUpdated,
          completedAt: new Date(),
        })
        .where(eq(affiliateScrapeJobs.id, job.id));

      await db.update(affiliatePartners)
        .set({ lastScrapedAt: new Date(), updatedAt: new Date() })
        .where(eq(affiliatePartners.id, partnerId));

      return {
        jobId: job.id,
        productsFound: products.length,
        productsNew,
        productsUpdated,
        message: `Successfully scraped ${products.length} products from ${partner.name}`,
      };
    } catch (error: any) {
      await db.update(affiliateScrapeJobs)
        .set({
          status: "failed",
          errorMessage: error.message,
          completedAt: new Date(),
        })
        .where(eq(affiliateScrapeJobs.id, job.id));

      throw error;
    }
  }

  private async fetchWebPage(url: string): Promise<string> {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch page: ${response.status} ${response.statusText}`);
      }

      return await response.text();
    } catch (error: any) {
      console.error("Fetch error:", error);
      throw new Error(`Failed to fetch page: ${error.message}`);
    }
  }

  private async extractProductsWithAI(html: string, partner: AffiliatePartner): Promise<ScrapedProduct[]> {
    const grok = this.getGrokClient();
    
    const truncatedHtml = html.length > 50000 ? html.substring(0, 50000) : html;

    const prompt = `You are an expert web scraper. Analyze this HTML from the website "${partner.name}" (${partner.websiteUrl}) and extract all product/service listings.

The partner category is: ${partner.category}

Extract each product with these fields:
- name (required): Product/service name
- description: Full description
- shortDescription: Brief summary (max 150 chars)
- category: Product category
- subCategory: Sub-category if applicable
- price: Numeric price value (just the number)
- currency: Currency code (USD, EUR, etc.)
- originalPrice: Original price if on sale
- discountPercent: Discount percentage if on sale
- imageUrl: Main product image URL
- imageUrls: Array of all image URLs
- productUrl: Direct link to the product page (required)
- location: Location/address
- city: City name
- country: Country name
- rating: Numeric rating (1-5 scale)
- reviewCount: Number of reviews
- duration: Duration (for tours/activities)
- highlights: Array of key highlights
- includes: Array of what's included
- tags: Array of relevant tags
- availability: Availability info
- bookingInfo: Booking instructions

Return a JSON array of products. Only include products you can confidently extract.
If URLs are relative, make them absolute using the base URL: ${partner.websiteUrl}

HTML Content:
${truncatedHtml}`;

    try {
      const response = await grok.chat.completions.create({
        model: GROK_MODEL,
        messages: [
          {
            role: "system",
            content: "You are a precise web scraping assistant. Extract product data from HTML and return valid JSON arrays only. Be thorough but accurate."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from AI");
      }

      const parsed = JSON.parse(content);
      const products = parsed.products || parsed.items || parsed.listings || parsed;
      
      if (!Array.isArray(products)) {
        console.warn("AI response was not an array, returning empty");
        return [];
      }

      return products.filter((p: any) => p.name && p.productUrl).map((p: any) => ({
        externalId: p.externalId,
        name: p.name,
        description: p.description,
        shortDescription: p.shortDescription,
        category: p.category,
        subCategory: p.subCategory,
        price: typeof p.price === 'number' ? p.price : parseFloat(p.price) || undefined,
        currency: p.currency || 'USD',
        originalPrice: typeof p.originalPrice === 'number' ? p.originalPrice : parseFloat(p.originalPrice) || undefined,
        discountPercent: p.discountPercent,
        imageUrl: p.imageUrl,
        imageUrls: p.imageUrls || [],
        productUrl: p.productUrl,
        location: p.location,
        city: p.city,
        country: p.country,
        coordinates: p.coordinates,
        rating: typeof p.rating === 'number' ? p.rating : parseFloat(p.rating) || undefined,
        reviewCount: p.reviewCount,
        duration: p.duration,
        highlights: p.highlights || [],
        includes: p.includes || [],
        tags: p.tags || [],
        availability: p.availability,
        bookingInfo: p.bookingInfo,
      }));
    } catch (error: any) {
      console.error("AI extraction error:", error);
      throw new Error(`Failed to extract products: ${error.message}`);
    }
  }

  generateAffiliateUrl(productUrl: string, partner: AffiliatePartner): string {
    if (partner.affiliateLinkTemplate && partner.affiliateTrackingId) {
      return partner.affiliateLinkTemplate
        .replace("{url}", encodeURIComponent(productUrl))
        .replace("{tracking_id}", partner.affiliateTrackingId)
        .replace("{product_url}", productUrl);
    }

    if (partner.affiliateTrackingId) {
      const url = new URL(productUrl);
      url.searchParams.set("ref", partner.affiliateTrackingId);
      url.searchParams.set("utm_source", "traveloure");
      url.searchParams.set("utm_medium", "affiliate");
      return url.toString();
    }

    return productUrl;
  }

  async getProducts(options?: {
    partnerId?: string;
    category?: string;
    city?: string;
    country?: string;
    search?: string;
    minPrice?: number;
    maxPrice?: number;
    minRating?: number;
    limit?: number;
    offset?: number;
  }): Promise<{ products: AffiliateProduct[]; total: number }> {
    let query = db.select().from(affiliateProducts).$dynamic();
    let countQuery = db.select({ count: sql<number>`count(*)` }).from(affiliateProducts).$dynamic();

    const conditions: any[] = [];

    if (options?.partnerId) {
      conditions.push(eq(affiliateProducts.partnerId, options.partnerId));
    }
    if (options?.category) {
      conditions.push(eq(affiliateProducts.category, options.category));
    }
    if (options?.city) {
      conditions.push(ilike(affiliateProducts.city, `%${options.city}%`));
    }
    if (options?.country) {
      conditions.push(ilike(affiliateProducts.country, `%${options.country}%`));
    }
    if (options?.search) {
      conditions.push(ilike(affiliateProducts.name, `%${options.search}%`));
    }

    if (conditions.length > 0) {
      const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
      query = query.where(whereClause);
      countQuery = countQuery.where(whereClause);
    }

    const products = await query
      .orderBy(desc(affiliateProducts.rating), desc(affiliateProducts.reviewCount))
      .limit(options?.limit || 50)
      .offset(options?.offset || 0);

    const [{ count }] = await countQuery;

    return { products, total: Number(count) };
  }

  async getProductById(id: string): Promise<AffiliateProduct | null> {
    const [product] = await db.select()
      .from(affiliateProducts)
      .where(eq(affiliateProducts.id, id))
      .limit(1);
    
    return product || null;
  }

  async trackClick(data: {
    productId?: string;
    partnerId?: string;
    userId?: string;
    tripId?: string;
    itineraryItemId?: string;
    referrer?: string;
    userAgent?: string;
    ipAddress?: string;
  }): Promise<{ affiliateUrl: string }> {
    await db.insert(affiliateClicks).values(data);

    if (data.productId) {
      const product = await this.getProductById(data.productId);
      if (product) {
        return { affiliateUrl: product.affiliateUrl || product.productUrl };
      }
    }

    if (data.partnerId) {
      const partner = await this.getPartnerById(data.partnerId);
      if (partner) {
        return { affiliateUrl: partner.websiteUrl };
      }
    }

    throw new Error("Product or partner not found");
  }

  async getScrapeJobs(options?: {
    partnerId?: string;
    status?: string;
    limit?: number;
  }): Promise<any[]> {
    let query = db.select().from(affiliateScrapeJobs).$dynamic();

    if (options?.partnerId) {
      query = query.where(eq(affiliateScrapeJobs.partnerId, options.partnerId));
    }
    if (options?.status) {
      query = query.where(eq(affiliateScrapeJobs.status, options.status));
    }

    return await query
      .orderBy(desc(affiliateScrapeJobs.createdAt))
      .limit(options?.limit || 20);
  }

  async getPartnerCategories(): Promise<{ value: string; label: string }[]> {
    return [
      { value: "tours_activities", label: "Tours & Activities" },
      { value: "hotels_accommodation", label: "Hotels & Accommodation" },
      { value: "transportation", label: "Transportation" },
      { value: "restaurants_dining", label: "Restaurants & Dining" },
      { value: "events_tickets", label: "Events & Tickets" },
      { value: "experiences", label: "Experiences" },
      { value: "travel_gear", label: "Travel Gear" },
      { value: "insurance", label: "Insurance" },
      { value: "other", label: "Other" },
    ];
  }
}

export const affiliateScraperService = new AffiliateScraperService();
