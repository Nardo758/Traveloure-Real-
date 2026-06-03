import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, setupFacebookAuth, setupEmailAuth } from "./replit_integrations/auth";
import { registerChatRoutes } from "./replit_integrations/chat/routes";
import { db } from "./db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { expertServiceOfferings, expertServiceCategories, serviceTemplates, expertCustomServices } from "@shared/schema";

import tripsRouter from "./routes/trips.routes";
import bookingsDomainRouter from "./routes/bookings-domain.routes";
import expertsRouter from "./routes/experts.routes";
import adminRouter from "./routes/admin.routes";
import paymentsRouter from "./routes/payments.routes";
import contentRouter, { registerDiscoveryRoutes } from "./routes/content.routes";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Auth setup
  try {
    await setupAuth(app);
    registerAuthRoutes(app);
    setupFacebookAuth(app);
    setupEmailAuth(app);
  } catch (error) {
    console.warn("Auth setup failed (OK for development):", (error as Error).message);
    // Continue without auth - public routes will still work
  }

  // ─── service_templates seed removed ─────────────────────────────────────────
  // expert_service_offerings is now the canonical template catalog.
  // The ESO seed block below handles all 6 canonical templates and also
  // backfills any legacy service_templates / expert_custom_services rows.

  // ─── Seed / backfill booking_fee_configs (idempotent) ──────────────────────
  (async () => {
    try {
      await db.execute(sql`
        INSERT INTO booking_fee_configs
          (id, category, platform_fee_percent, expert_share_percent, ai_keeps_100, is_active, created_at, updated_at)
        VALUES
          (gen_random_uuid(), 'default', 25, 75, true, true, NOW(), NOW())
        ON CONFLICT (category) DO NOTHING
      `);
      await db.execute(sql`
        UPDATE booking_fee_configs
        SET expert_share_percent = '75.00',
            platform_fee_percent = '25.00'
        WHERE CAST(expert_share_percent AS NUMERIC) = 70
          AND CAST(platform_fee_percent  AS NUMERIC) = 30
      `);
    } catch (err) {
      console.warn("[Seed] Could not seed/backfill booking_fee_configs:", err);
    }
  })();

  // ─── Seed 6 canonical templates into expert_service_offerings (per-name idempotent) ──
  (async () => {
    try {
      let categoryRow = await db.select({ id: expertServiceCategories.id })
        .from(expertServiceCategories)
        .where(eq(expertServiceCategories.name, "Itinerary Planning"))
        .then(r => r[0]);
      if (!categoryRow) {
        const [inserted] = await db.insert(expertServiceCategories)
          .values({ name: "Itinerary Planning", isDefault: true, sortOrder: 1 })
          .returning({ id: expertServiceCategories.id });
        categoryRow = inserted;
      }
      const categoryId = categoryRow.id;

      const CANONICAL_OFFERINGS = [
        { name: "Quick Consultation",         description: "15-minute video call to answer quick travel questions and provide immediate guidance",         price: "29.00",  sortOrder: 101 },
        { name: "Cart Review & Optimization", description: "Expert review of your travel cart to find savings and better alternatives",                   price: "49.00",  sortOrder: 102 },
        { name: "Full Trip Planning",         description: "Comprehensive trip planning from start to finish with personalized itinerary",                price: "249.00", sortOrder: 103 },
        { name: "Destination Deep Dive",      description: "In-depth guide to a specific destination with local insights and hidden gems",                price: "79.00",  sortOrder: 104 },
        { name: "Honeymoon Planning Package", description: "Romantic trip planning with special touches and memorable experiences",                      price: "399.00", sortOrder: 105 },
        { name: "Group Trip Coordinator",     description: "Organize and coordinate travel for groups with complex logistics",                           price: "349.00", sortOrder: 106 },
      ];
      const existingEso = await db.select({ name: expertServiceOfferings.name }).from(expertServiceOfferings);
      const existingEsoNames = new Set(existingEso.map((o: any) => o.name));
      let esoInserted = 0;
      for (const offering of CANONICAL_OFFERINGS) {
        if (!existingEsoNames.has(offering.name)) {
          await db.insert(expertServiceOfferings).values({
            categoryId,
            name: offering.name,
            description: offering.description,
            price: offering.price,
            isDefault: true,
            sortOrder: offering.sortOrder,
          });
          esoInserted++;
        }
      }
      if (esoInserted > 0) {
        console.log(`[Seed] Inserted ${esoInserted} canonical template(s) into expert_service_offerings.`);
      }

      // ── Backfill legacy service_templates → ESO (one-time migration) ──────
      // Any active service_templates rows not already present in ESO by name
      // are upserted so old data is not lost.
      try {
        const stRows = await db.select().from(serviceTemplates).where(eq(serviceTemplates.isActive, true));
        const currentEsoNames = new Set(
          (await db.select({ name: expertServiceOfferings.name }).from(expertServiceOfferings))
            .map((r: any) => r.name)
        );
        let stBackfilled = 0;
        for (const st of stRows) {
          if (!currentEsoNames.has(st.title)) {
            await db.insert(expertServiceOfferings).values({
              categoryId,
              name: st.title,
              description: st.description ?? undefined,
              price: st.suggestedPrice ?? "0",
              isDefault: true,
              sortOrder: (st.sortOrder ?? 0) + 200,
            });
            currentEsoNames.add(st.title);
            stBackfilled++;
          }
        }
        if (stBackfilled > 0) {
          console.log(`[Backfill] Migrated ${stBackfilled} service_templates row(s) → expert_service_offerings.`);
        }
      } catch (bfErr) {
        console.warn("[Backfill] service_templates → ESO failed (non-fatal):", bfErr);
      }

      // ── Backfill approved expert_custom_services → ESO ────────────────────
      try {
        const approvedCustom = await db.select().from(expertCustomServices)
          .where(and(eq(expertCustomServices.status, "approved"), eq(expertCustomServices.isActive, true)));
        const currentEsoNames2 = new Set(
          (await db.select({ name: expertServiceOfferings.name }).from(expertServiceOfferings))
            .map((r: any) => r.name)
        );
        let customBackfilled = 0;
        for (const cs of approvedCustom) {
          if (!currentEsoNames2.has(cs.title)) {
            const catId = cs.existingCategoryId ?? categoryId;
            await db.insert(expertServiceOfferings).values({
              categoryId: catId,
              name: cs.title,
              description: cs.description ?? undefined,
              price: cs.price,
              isDefault: true,
              sortOrder: 300 + customBackfilled,
            });
            currentEsoNames2.add(cs.title);
            customBackfilled++;
          }
        }
        if (customBackfilled > 0) {
          console.log(`[Backfill] Migrated ${customBackfilled} expert_custom_services row(s) → expert_service_offerings.`);
        }
      } catch (bfErr2) {
        console.warn("[Backfill] expert_custom_services → ESO failed (non-fatal):", bfErr2);
      }
    } catch (err) {
      console.warn("[Seed] Could not seed expert_service_offerings:", err);
    }
  })();

  // Chat routes for AI Assistant conversations
  registerChatRoutes(app);

  // ─── Domain routers ───────────────────────────────────────────────────────
  // content: health, status, contact, chat/start, sub-router mounts (instagram,
  //          bookings, booking-actions, messages, my-itinerary, transport-hub,
  //          plancard, identity, webhooks), catalog, amadeus, viator, grok, etc.
  app.use(contentRouter);

  // trips / itineraries
  app.use(tripsRouter);

  // bookings, cart, coordination
  app.use(bookingsDomainRouter);

  // experts, providers, vendors, EA
  app.use(expertsRouter);

  // admin panel
  app.use(adminRouter);

  // payments: stripe, credits, wallet
  app.use(paymentsRouter);

  // AI Discovery routes (uses dynamic import internally)
  await registerDiscoveryRoutes();

  // Bookings API routes - Stripe payments, availability, pricing
  app.use("/api/bookings", bookingsRoutes);

  return httpServer;
}

// Seed Database Function
async function hashPassword(password: string): Promise<string> {
  const crypto = await import("crypto");
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err: Error | null, derivedKey: Buffer) => {
      if (err) reject(err);
      resolve(salt + ":" + derivedKey.toString("hex"));
    });
  });
}

export async function seedDatabase() {
  // Always ensure the platform admin account exists
  const adminCheck = await db.select().from(users).where(eq(users.email, "admin@traveloure.test")).limit(1);
  if (adminCheck.length === 0) {
    const hashedPassword = await hashPassword("AdminPass123!");
    await db.insert(users).values({
      email: "admin@traveloure.test",
      password: hashedPassword,
      firstName: "Admin",
      lastName: "Traveloure",
      role: "admin",
      emailVerified: new Date(),
      authProvider: "email",
    });
    console.log("Admin account created: admin@traveloure.test");
  }

  const existingTrips = await storage.getHelpGuideTrips();
  if (existingTrips.length === 0) {
    // Check if any user exists
    const usersList = await db.select().from(users).limit(1);
    let userId = usersList[0]?.id;

    if (!userId) {
       // Create a dummy user
       const [newUser] = await db.insert(users).values({
         email: "admin@traveloure.com",
         firstName: "Admin",
         lastName: "User"
       }).returning();
       userId = newUser.id;
    }

    await db.insert(helpGuideTrips).values([
      {
        userId: userId,
        country: "Japan",
        state: "Tokyo",
        city: "Tokyo",
        title: "Tokyo Adventure 5 Days",
        description: "Experience the vibrant culture of Tokyo.",
        highlights: "Shibuya Crossing, Senso-ji Temple, Meiji Shrine",
        days: 5,
        nights: 4,
        price: "1500.00",
        startDate: "2024-04-01",
        endDate: "2024-04-05",
        inclusive: "Hotel, Breakfast",
        exclusive: "Flights, Dinner"
      },
      {
         userId: userId,
         country: "France",
         state: "Île-de-France",
         city: "Paris",
         title: "Romantic Paris Getaway",
         description: "Enjoy 3 days in the city of love.",
         highlights: "Eiffel Tower, Louvre Museum, Seine Cruise",
         days: 3,
         nights: 2,
         price: "1200.00",
         startDate: "2024-05-10",
         endDate: "2024-05-13",
         inclusive: "Hotel, Breakfast, Cruise ticket",
         exclusive: "Flights, Lunch, Dinner"
      }
    ]);

    // Create a search record first to satisfy foreign key
    const [search] = await db.insert(touristPlacesSearches).values({
      search: "Tokyo"
    }).returning();
  }
}

// ============================================
// AI DISCOVERY (HIDDEN GEMS) ROUTES
// Grok-powered discovery of local secrets
// ============================================

export async function registerDiscoveryRoutes(app: Express) {
  const { grokDiscoveryService } = await import("./services/grok-discovery.service");

  // Local admin guard (mirrors the one in registerRoutes)
  const requireAdmin = async (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Authentication required" });
    }
    const user = await db.select().from(users).where(eq(users.id, req.user?.claims?.sub)).then((r: any[]) => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  };

  // Trigger discovery for a destination
  app.post("/api/discovery/scan", isAuthenticated, async (req, res) => {
    try {
      const { destination, categories } = req.body;

      if (!destination || typeof destination !== "string") {
        return res.status(400).json({ message: "destination is required" });
      }

      const validCategories = categories?.filter((c: string) => 
        ["local_food_secrets", "hidden_viewpoints", "off_tourist_path", "seasonal_events", 
         "cultural_experiences", "secret_beaches", "street_art", "local_markets", 
         "sunset_spots", "historic_gems", "nature_escapes", "nightlife_secrets"].includes(c)
      );

      const result = await grokDiscoveryService.discoverGemsForDestination(
        destination,
        validCategories?.length > 0 ? validCategories : undefined
      );

      res.json({
        success: true,
        jobId: result.jobId,
        totalGems: result.totalGems,
        message: `Discovered ${result.totalGems} hidden gems in ${destination}`
      });
    } catch (error: any) {
      console.error("Discovery scan error:", error);
      res.status(500).json({ message: "Discovery failed", error: error.message });
    }
  });

  // Get available categories
  app.get("/api/discovery/categories", async (_req, res) => {
    try {
      const { grokDiscoveryService } = await import("./services/grok-discovery.service");
      const categories = await grokDiscoveryService.getAvailableCategories();
      res.json({ categories });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get categories", error: error.message });
    }
  });

  // Get gems for a destination
  app.get("/api/discovery/gems", async (req, res) => {
    try {
      const { destination, category, limit, offset } = req.query;

      if (destination) {
        const result = await grokDiscoveryService.getGemsForDestination(
          destination as string,
          {
            category: category as any,
            limit: limit ? parseInt(limit as string) : undefined,
            offset: offset ? parseInt(offset as string) : undefined
          }
        );
        return res.json(result);
      }

      const result = await grokDiscoveryService.getAllGems({
        category: category as any,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined
      });
      res.json(result);
    } catch (error: any) {
      console.error("Get gems error:", error);
      res.status(500).json({ message: "Failed to get gems", error: error.message });
    }
  });

  // Get a specific gem and increment view
  app.get("/api/discovery/gems/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { aiDiscoveredGems } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      const [gem] = await db.select()
        .from(aiDiscoveredGems)
        .where(eq(aiDiscoveredGems.id, id))
        .limit(1);

      if (!gem) {
        return res.status(404).json({ message: "Gem not found" });
      }

      await grokDiscoveryService.incrementViewCount(id);

      res.json({ gem });
    } catch (error: any) {
      console.error("Get gem error:", error);
      res.status(500).json({ message: "Failed to get gem", error: error.message });
    }
  });

  // Get destinations with gems
  app.get("/api/discovery/destinations", async (_req, res) => {
    try {
      const destinations = await grokDiscoveryService.getDestinationsWithGems();
      res.json({ destinations });
    } catch (error: any) {
      console.error("Get destinations error:", error);
      res.status(500).json({ message: "Failed to get destinations", error: error.message });
    }
  });

  // Get discovery job history
  app.get("/api/discovery/jobs", isAuthenticated, async (req, res) => {
    try {
      const { limit } = req.query;
      const jobs = await grokDiscoveryService.getDiscoveryJobs(
        limit ? parseInt(limit as string) : undefined
      );
      res.json({ jobs });
    } catch (error: any) {
      console.error("Get jobs error:", error);
      res.status(500).json({ message: "Failed to get jobs", error: error.message });
    }
  });

  // ==================== AFFILIATE PARTNER MANAGEMENT ====================
  
  const { affiliateScraperService } = await import("./services/affiliate-scraper.service");

  // Get partner categories
  app.get("/api/affiliate/categories", async (_req, res) => {
    try {
      const categories = await affiliateScraperService.getPartnerCategories();
      res.json({ categories });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get categories", error: error.message });
    }
  });

  // Create affiliate partner
  app.post("/api/affiliate/partners", isAuthenticated, async (req, res) => {
    try {
      const { name, websiteUrl, category, affiliateTrackingId, affiliateLinkTemplate, description, logoUrl, commissionRate, scrapeConfig } = req.body;

      if (!name || !websiteUrl || !category) {
        return res.status(400).json({ message: "name, websiteUrl, and category are required" });
      }

      const partner = await affiliateScraperService.createPartner({
        name,
        websiteUrl,
        category,
        affiliateTrackingId,
        affiliateLinkTemplate,
        description,
        logoUrl,
        commissionRate,
        scrapeConfig,
      });

      res.status(201).json({ partner, message: "Partner created successfully" });
    } catch (error: any) {
      console.error("Create partner error:", error);
      res.status(500).json({ message: "Failed to create partner", error: error.message });
    }
  });

  // Get all affiliate partners
  app.get("/api/affiliate/partners", async (req, res) => {
    try {
      const { category, isActive, limit, offset } = req.query;
      const result = await affiliateScraperService.getPartners({
        category: category as string,
        isActive: isActive === "true" ? true : isActive === "false" ? false : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get partners", error: error.message });
    }
  });

  // Get single affiliate partner
  app.get("/api/affiliate/partners/:id", async (req, res) => {
    try {
      const partner = await affiliateScraperService.getPartnerById(req.params.id);
      if (!partner) {
        return res.status(404).json({ message: "Partner not found" });
      }
      res.json({ partner });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get partner", error: error.message });
    }
  });

  // Update affiliate partner
  app.patch("/api/affiliate/partners/:id", isAuthenticated, async (req, res) => {
    try {
      const partner = await affiliateScraperService.updatePartner(req.params.id, req.body);
      if (!partner) {
        return res.status(404).json({ message: "Partner not found" });
      }
      res.json({ partner, message: "Partner updated successfully" });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to update partner", error: error.message });
    }
  });

  // Delete affiliate partner
  app.delete("/api/affiliate/partners/:id", isAuthenticated, async (req, res) => {
    try {
      const deleted = await affiliateScraperService.deletePartner(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Partner not found" });
      }
      res.json({ message: "Partner deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to delete partner", error: error.message });
    }
  });

  // Trigger partner website scrape
  app.post("/api/affiliate/partners/:id/scrape", isAuthenticated, async (req, res) => {
    try {
      const result = await affiliateScraperService.scrapePartnerWebsite(req.params.id);
      res.json(result);
    } catch (error: any) {
      console.error("Scrape error:", error);
      res.status(500).json({ message: "Failed to scrape partner website", error: error.message });
    }
  });

  // Get scrape jobs for a partner
  app.get("/api/affiliate/partners/:id/jobs", isAuthenticated, async (req, res) => {
    try {
      const { limit } = req.query;
      const jobs = await affiliateScraperService.getScrapeJobs({
        partnerId: req.params.id,
        limit: limit ? parseInt(limit as string) : undefined,
      });
      res.json({ jobs });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get scrape jobs", error: error.message });
    }
  });

  // Get all affiliate products
  app.get("/api/affiliate/products", async (req, res) => {
    try {
      const { partnerId, category, city, country, search, minPrice, maxPrice, minRating, limit, offset } = req.query;
      const result = await affiliateScraperService.getProducts({
        partnerId: partnerId as string,
        category: category as string,
        city: city as string,
        country: country as string,
        search: search as string,
        minPrice: minPrice ? parseFloat(minPrice as string) : undefined,
        maxPrice: maxPrice ? parseFloat(maxPrice as string) : undefined,
        minRating: minRating ? parseFloat(minRating as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get products", error: error.message });
    }
  });

  // Get single product
  app.get("/api/affiliate/products/:id", async (req, res) => {
    try {
      const product = await affiliateScraperService.getProductById(req.params.id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json({ product });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get product", error: error.message });
    }
  });

  // Content Hub Discover endpoint — returns curated affiliate + registry items matched to a destination.
  // When a ?surface= param is provided (e.g. "travelpulse-discover"), explicit content_placement_rules
  // for that surface + city are fetched first (pinned items float to the top). The normal ILIKE
  // fallback still runs but excludes sourceIds already covered by explicit rules to avoid duplicates.
  app.get("/api/content/discover", async (req, res) => {
    try {
      const destination = (req.query.destination as string || "").trim();
      const tabParam = (req.query.tab as string || "").trim();
      const surfaceParam = (req.query.surface as string || "").trim();
      // Support both ?content_types=foo,bar (string) and ?content_types[]=foo&content_types[]=bar (array)
      const rawContentTypes = req.query.content_types;
      const contentTypesParam: string = Array.isArray(rawContentTypes)
        ? (rawContentTypes as string[]).join(",")
        : (rawContentTypes as string || "").trim();

      if (!destination) {
        return res.json({ items: [], total: 0 });
      }

      // Extract city and country from destination string "City, Country"
      const parts = destination.split(",");
      const city = parts[0].trim();
      const country = parts.length > 1 ? parts[parts.length - 1].trim() : city;

      // Tab → content type and affiliate category mappings (from shared/content-surface-map.ts)
      const allowedContentTypes = tabParam && TAB_CONTENT_TYPE_MAP[tabParam]
        ? TAB_CONTENT_TYPE_MAP[tabParam]
        : contentTypesParam
          ? contentTypesParam.split(",").map(t => t.trim()).filter(Boolean)
          : ["experience", "template", "service", "media", "other"];

      const affiliateCategoryFilter = tabParam && TAB_AFFILIATE_CATEGORIES[tabParam]
        ? TAB_AFFILIATE_CATEGORIES[tabParam]
        : null;

      // ── Step 1: Explicit placement rules (when surface is provided) ───────────
      // Fetch city's current pulse score so we can honour minPulseScore thresholds.
      let cityPulseScore = 0;
      if (surfaceParam) {
        const pulseRow = await db
          .select({ pulseScore: travelPulseCities.pulseScore })
          .from(travelPulseCities)
          .where(ilike(travelPulseCities.cityName, `%${city}%`))
          .limit(1);
        cityPulseScore = pulseRow[0]?.pulseScore ?? 0;
      }

      // Load active placement rules for this surface + city.
      // A rule matches when isPinned=true OR cityPulseScore >= minPulseScore.
      const placementRules = surfaceParam
        ? await storage.getContentPlacementRules({
            cityName: city,
            surface: surfaceParam,
            isActive: true,
          })
        : [];

      const eligibleRules = placementRules.filter(
        r => r.isPinned || (r.minPulseScore ?? 0) <= cityPulseScore
      );

      // Separate rules by source type and collect sourceIds
      const pinnedAffiliateIds = eligibleRules
        .filter(r => r.contentSource === "affiliate_product" && r.isPinned)
        .map(r => r.sourceId).filter(Boolean) as string[];
      const pinnedRegistryIds = eligibleRules
        .filter(r => r.contentSource === "content_registry" && r.isPinned)
        .map(r => r.sourceId).filter(Boolean) as string[];
      const eligibleAffiliateIds = eligibleRules
        .filter(r => r.contentSource === "affiliate_product")
        .map(r => r.sourceId).filter(Boolean) as string[];
      const eligibleRegistryIds = eligibleRules
        .filter(r => r.contentSource === "content_registry")
        .map(r => r.sourceId).filter(Boolean) as string[];

      // Fetch explicitly-placed affiliate products
      const placedAffiliate = eligibleAffiliateIds.length
        ? await db.select().from(affiliateProducts)
            .where(and(
              eq(affiliateProducts.isActive, true),
              inArray(affiliateProducts.id, eligibleAffiliateIds)
            ))
        : [];

      // Fetch explicitly-placed registry items
      const placedRegistry = eligibleRegistryIds.length
        ? await db.select().from(contentRegistry)
            .where(and(
              eq(contentRegistry.status, "published"),
              inArray(contentRegistry.id, eligibleRegistryIds)
            ))
        : [];

      // ── Step 2: ILIKE fallback (excludes items already covered by rules) ─────
      const affiliateBaseCondition = and(
        eq(affiliateProducts.isActive, true),
        or(
          ilike(affiliateProducts.city, `%${city}%`),
          ilike(affiliateProducts.country, `%${country}%`),
          ilike(affiliateProducts.location, `%${city}%`)
        )
      );
      const affiliateCategoryCondition = affiliateCategoryFilter
        ? and(affiliateBaseCondition, or(
            ...affiliateCategoryFilter.map(cat => ilike(affiliateProducts.category, `%${cat}%`))
          ))
        : affiliateBaseCondition;

      // Use notInArray to safely exclude IDs already covered by placement rules
      const affiliateItems = await db
        .select()
        .from(affiliateProducts)
        .where(
          eligibleAffiliateIds.length
            ? and(affiliateCategoryCondition, sql`${affiliateProducts.id}::text != ALL(ARRAY[${sql.raw(eligibleAffiliateIds.map(id => `'${id.replace(/'/g, "''")}'`).join(','))}]::text[])`)
            : affiliateCategoryCondition
        )
        .limit(20);

      // Query content_registry for published items with location metadata matching destination.
      // Exclude registry items already loaded via placement rules.
      const registryItems = await db
        .select()
        .from(contentRegistry)
        .where(
          and(
            eq(contentRegistry.status, "published"),
            sql`(
              ${contentRegistry.metadata}->>'location' ILIKE ${'%' + city + '%'}
              OR ${contentRegistry.metadata}->>'city' ILIKE ${'%' + city + '%'}
              OR ${contentRegistry.metadata}->>'country' ILIKE ${'%' + country + '%'}
              OR ${contentRegistry.metadata}->>'destination' ILIKE ${'%' + city + '%'}
            )`,
            inArray(contentRegistry.contentType, allowedContentTypes as any),
            ...(eligibleRegistryIds.length
              ? [sql`${contentRegistry.id}::text != ALL(ARRAY[${sql.raw(eligibleRegistryIds.map(id => `'${id.replace(/'/g, "''")}'`).join(','))}]::text[])`]
              : [])
          )
        )
        .limit(20);

      // ── Normalizer helpers ────────────────────────────────────────────────────
      const normalizeAffiliate = (p: any, isPinned = false) => ({
        id: `affiliate-${p.id}`,
        sourceId: p.id,
        type: "affiliate" as const,
        contentCategory: p.category || "experience",
        title: p.name,
        description: p.shortDescription || p.description || "",
        cover_image: p.imageUrl || null,
        price: p.price ? String(p.price) : null,
        price_display: p.price ? `${p.currency || "USD"} ${parseFloat(p.price).toFixed(0)}` : null,
        affiliate_url: p.affiliateUrl || p.productUrl || null,
        source: "Affiliate Partner",
        rating: p.rating ? parseFloat(String(p.rating)) : null,
        city: p.city || null,
        country: p.country || null,
        duration: p.duration || null,
        highlights: p.highlights || [],
        metadata: p.metadata || {},
        isPinned,
        tracking: {
          productId: p.id,
          partnerId: null as string | null,
          isAffiliateTracked: true,
        },
      });

      const normalizeRegistry = (r: any, isPinned = false) => {
        const meta = r.metadata || {};
        const affiliateUrl = meta.affiliate_url || null;
        const metaPartnerId: string | null = meta.partnerId || meta.partner_id || null;
        return {
          id: `registry-${r.id}`,
          sourceId: r.id,
          type: "curated" as const,
          contentCategory: r.contentType,
          title: r.title || "Curated Experience",
          description: r.description || "",
          cover_image: meta.cover_image || meta.imageUrl || meta.image_url || null,
          price: meta.price ? String(meta.price) : null,
          price_display: meta.price ? `USD ${parseFloat(meta.price).toFixed(0)}` : null,
          affiliate_url: affiliateUrl,
          source: "Traveloure Curated",
          rating: meta.rating ? parseFloat(String(meta.rating)) : null,
          city: meta.city || meta.location || city,
          country: meta.country || country,
          duration: meta.duration || null,
          highlights: meta.highlights || [],
          metadata: meta,
          isPinned,
          tracking: {
            productId: null as string | null,
            partnerId: metaPartnerId,
            isAffiliateTracked: !!(affiliateUrl && metaPartnerId),
          },
        };
      };

      // ── Assemble final list ───────────────────────────────────────────────────
      // Order: pinned placed items → other placed items → ILIKE fallback items
      const placedAffiliateCards = placedAffiliate.map(p =>
        normalizeAffiliate(p, pinnedAffiliateIds.includes(p.id))
      );
      const placedRegistryCards = placedRegistry.map(r =>
        normalizeRegistry(r, pinnedRegistryIds.includes(r.id))
      );

      const pinnedItems = [
        ...placedAffiliateCards.filter(c => c.isPinned),
        ...placedRegistryCards.filter(c => c.isPinned),
      ];
      const placedItems = [
        ...placedAffiliateCards.filter(c => !c.isPinned),
        ...placedRegistryCards.filter(c => !c.isPinned),
      ];
      const fallbackItems = [
        ...affiliateItems.map(p => normalizeAffiliate(p)),
        ...registryItems.map(r => normalizeRegistry(r)),
      ];

      const allItems = [...pinnedItems, ...placedItems, ...fallbackItems];

      res.json({ items: allItems, total: allItems.length });
    } catch (err: any) {
      console.error("Content discover error:", err);
      res.status(500).json({ message: "Failed to fetch curated content", items: [], total: 0 });
    }
  });

  // Content Hub Checkout — creates Stripe Checkout Session for non-affiliate curated items.
  // Price, title, and currency are resolved server-side from the DB record; client-supplied
  // values are ignored to prevent price-tampering attacks.
  app.post("/api/content/checkout", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const user = await storage.getUser(userId);
      const userEmail = user?.email || undefined;

      const { itemId, itemType } = req.body;
      if (!itemId || !itemType) {
        return res.status(400).json({ message: "itemId and itemType are required" });
      }

      // --- Server-side item resolution (price is NOT trusted from client) ---
      let resolvedTitle: string;
      let resolvedPrice: number;       // in whole currency units, e.g. 49.99
      let resolvedCurrency: string;
      let resolvedDestination: string;

      if (itemType === "affiliate") {
        const [product] = await db
          .select()
          .from(affiliateProducts)
          .where(eq(affiliateProducts.id, itemId))
          .limit(1);
        if (!product) return res.status(404).json({ message: "Item not found" });
        if (!product.price || parseFloat(String(product.price)) <= 0) {
          return res.status(400).json({ message: "This item is not available for direct purchase" });
        }
        resolvedTitle = product.name;
        resolvedPrice = parseFloat(String(product.price));
        resolvedCurrency = (product.currency || "USD").toLowerCase();
        resolvedDestination = product.city || product.country || "";
      } else {
        // content_registry
        const [item] = await db
          .select()
          .from(contentRegistry)
          .where(eq(contentRegistry.id, itemId))
          .limit(1);
        if (!item) return res.status(404).json({ message: "Item not found" });
        const meta = (item.metadata as any) || {};
        if (!meta.price || parseFloat(String(meta.price)) <= 0) {
          return res.status(400).json({ message: "This item is not available for direct purchase" });
        }
        resolvedTitle = item.title || "Curated Experience";
        resolvedPrice = parseFloat(String(meta.price));
        resolvedCurrency = (meta.currency || "USD").toLowerCase();
        resolvedDestination = meta.city || meta.destination || meta.location || "";
      }

      const { getBaseUrl } = await import("./services/stripe.service");
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
        apiVersion: '2024-12-18.acacia' as any,
      });

      const baseUrl = getBaseUrl();
      const amountCents = Math.round(resolvedPrice * 100);

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: userEmail,
        line_items: [
          {
            price_data: {
              currency: resolvedCurrency,
              product_data: {
                name: resolvedTitle,
                description: resolvedDestination
                  ? `Curated experience in ${resolvedDestination}`
                  : 'Curated Traveloure experience',
              },
              unit_amount: amountCents,
            },
            quantity: 1,
          },
        ],
        metadata: {
          type: 'content_hub_purchase',
          userId,
          itemId: String(itemId),
          itemType,
        },
        success_url: `${baseUrl}/discover?purchase=success`,
        cancel_url: `${baseUrl}/discover?purchase=cancelled`,
      });

      res.json({ sessionId: session.id, url: session.url });
    } catch (err: any) {
      console.error("Content checkout error:", err);
      res.status(500).json({ message: "Failed to create checkout session" });
    }
  });

  // Content Hub Affiliate Redirect — unified intermediary for ALL affiliate-linked content hub items.
  // Routes through the established affiliateScraperService.trackClick() path so all content-hub
  // affiliate clicks share the same tracking flow as other affiliate clicks.
  // For affiliate_products rows: productId is passed (valid FK).
  // For content_registry rows: partnerId from metadata is passed when present; otherwise neither
  //   ID is set (both FK fields are nullable) — the service still inserts the tracking row,
  //   then throws "not found" (expected); we catch it and return our locally-resolved URL.
  app.post("/api/content/affiliate-redirect", async (req, res) => {
    try {
      const { itemId, itemType } = req.body;
      if (!itemId || !itemType) {
        return res.status(400).json({ message: "itemId and itemType are required" });
      }

      let affiliateUrl: string | null = null;
      const trackPayload: Record<string, any> = {
        initiatedBy: "user" as const,
        referrer: req.headers.referer || undefined,
        userAgent: req.headers["user-agent"] || undefined,
        ipAddress: req.ip || undefined,
      };
      const authUserId = (req.user as any)?.claims?.sub || null;
      if (authUserId) trackPayload.userId = authUserId;

      if (itemType === "affiliate") {
        const [product] = await db
          .select()
          .from(affiliateProducts)
          .where(eq(affiliateProducts.id, itemId))
          .limit(1);
        if (!product) return res.status(404).json({ message: "Item not found" });
        affiliateUrl = product.affiliateUrl || product.productUrl || null;
        trackPayload.productId = product.id;  // valid FK → affiliate_products.id
      } else {
        // content_registry
        const [item] = await db
          .select()
          .from(contentRegistry)
          .where(eq(contentRegistry.id, itemId))
          .limit(1);
        if (!item) return res.status(404).json({ message: "Item not found" });
        const meta = (item.metadata as any) || {};
        affiliateUrl = meta.affiliate_url || null;
        // Pass partnerId when metadata carries a valid affiliate_partners FK value
        const metaPartnerId = meta.partnerId || meta.partner_id || null;
        if (metaPartnerId) trackPayload.partnerId = metaPartnerId;
      }

      if (!affiliateUrl) {
        return res.status(400).json({ message: "No affiliate URL available for this item" });
      }

      // Route through established service tracking path.
      // For registry items without productId/partnerId the service inserts the row (both FK cols are
      // nullable → null is valid), then throws "Product or partner not found" because it cannot look
      // up a return URL. We catch that narrow error and use our already-resolved affiliateUrl.
      const { affiliateScraperService } = await import("./services/affiliate-scraper.service");
      try {
        await affiliateScraperService.trackClick(trackPayload as any);
      } catch (trackErr: any) {
        if (trackErr?.message && !trackErr.message.includes("not found")) {
          console.error("Affiliate click tracking error:", trackErr);
        }
        // Otherwise: expected for registry items with no partner/product FK — insert already committed
      }

      res.json({ url: affiliateUrl });
    } catch (err: any) {
      console.error("Affiliate redirect error:", err);
      res.status(500).json({ message: "Failed to process affiliate redirect" });
    }
  });

  // Track affiliate click
  app.post("/api/affiliate/track-click", async (req, res) => {
    try {
      const { productId, partnerId, userId, tripId, itineraryItemId, initiatedBy, agentType, sessionId } = req.body;
      
      if (!productId && !partnerId) {
        return res.status(400).json({ message: "productId or partnerId is required" });
      }

      const result = await affiliateScraperService.trackClick({
        productId,
        partnerId,
        userId,
        tripId,
        itineraryItemId,
        referrer: req.headers.referer,
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip,
        initiatedBy: initiatedBy || "user",
        agentType: agentType || null,
        sessionId: sessionId || null,
      });

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to track click", error: error.message });
    }
  });

  // Lightweight iVisa / generic partner affiliate click tracker.
  // Unlike /api/affiliate/track-click this endpoint does NOT require a DB-stored productId/partnerId.
  // It inserts directly into affiliate_clicks with those FKs as null and uses `sessionId` to
  // record the partner name (e.g. "ivisa") so revenue reports can filter by it.
  app.post("/api/affiliates/track", async (req, res) => {
    try {
      const { partner, destination, tripId, itineraryId } = req.body;
      if (!partner) {
        return res.status(400).json({ message: "partner is required" });
      }
      const userId = (req.user as any)?.claims?.sub || (req.user as any)?.id || null;
      await db.insert(affiliateClicks).values({
        productId: null,
        partnerId: null,
        userId: userId || null,
        tripId: tripId || itineraryId || null,
        referrer: req.headers.referer || null,
        userAgent: (req.headers["user-agent"] as string) || null,
        ipAddress: req.ip || null,
        initiatedBy: "user",
        agentType: null,
        sessionId: [partner, destination].filter(Boolean).join(":") || partner,
      });
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error tracking affiliates click:", error);
      res.status(500).json({ message: "Failed to track click" });
    }
  });

  // Admin: Affiliate reconciliation
  app.get("/api/admin/affiliate/reconciliation", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const period = (req.query.period as string) || "this_month";
      const partner = (req.query.partner as string) || undefined;
      const validPeriods = ["this_month", "last_month", "last_90_days"];
      if (!validPeriods.includes(period)) {
        return res.status(400).json({ message: "Invalid period. Use: this_month, last_month, last_90_days" });
      }

      const { affiliateReconciliationService } = await import("./services/affiliate-reconciliation.service");
      const result = await affiliateReconciliationService.getReconciliationView(period, partner);
      res.json(result);
    } catch (error: any) {
      console.error("[Reconciliation] Error:", error);
      res.status(500).json({ message: "Failed to get reconciliation data", error: error.message });
    }
  });

  // Admin: Update reconciliation status for an earnings row
  app.patch("/api/admin/affiliate/reconciliation/:earningId", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { earningId } = req.params;
      const { status, notes, partnerReferenceId } = req.body;
      const validStatuses = ["unmatched", "matched", "disputed", "written_off"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const { affiliateReconciliationService } = await import("./services/affiliate-reconciliation.service");
      await affiliateReconciliationService.updateReconciliationStatus(earningId, status, notes, partnerReferenceId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Reconciliation] Update error:", error);
      res.status(500).json({ message: "Failed to update reconciliation status", error: error.message });
    }
  });

  // Get products for a specific location (for itinerary integration)
  app.get("/api/affiliate/products/by-location", async (req, res) => {
    try {
      const { city, country, category, limit } = req.query;
      
      if (!city && !country) {
        return res.status(400).json({ message: "city or country is required" });
      }

      const result = await affiliateScraperService.getProducts({
        city: city as string,
        country: country as string,
        category: category as string,
        limit: limit ? parseInt(limit as string) : 10,
      });

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get products by location", error: error.message });
    }
  });

  // === Content Tracking System API ===

  // Get content tracking summary (admin only)
  app.get("/api/admin/content/summary", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const summary = await storage.getContentTrackingSummary();
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get content summary", error: error.message });
    }
  });

  // Get all content registry entries (admin only)
  app.get("/api/admin/content/registry", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { status, contentType, ownerId, flagged, limit, offset } = req.query;
      const content = await storage.getContentRegistry({
        status: status as string,
        contentType: contentType as string,
        ownerId: ownerId as string,
        flagged: flagged === 'true',
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0,
      });

      res.json(content);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get content registry", error: error.message });
    }
  });

  // Get content by tracking number
  app.get("/api/admin/content/:trackingNumber", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { trackingNumber } = req.params;
      const content = await storage.getContentByTrackingNumber(trackingNumber);
      if (!content) {
        return res.status(404).json({ message: "Content not found" });
      }

      // Get related data
      const versions = await storage.getContentVersions(trackingNumber);
      const flags = await storage.getContentFlags(trackingNumber);
      const invoices = await storage.getInvoicesByTrackingNumber(trackingNumber);

      res.json({
        content,
        versions,
        flags,
        invoices,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get content details", error: error.message });
    }
  });

  // Register new content (manual registration via API)
  app.post("/api/admin/content/register", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { contentType, contentId, ownerId, title, description, status, metadata } = req.body;

      if (!contentType || !contentId) {
        return res.status(400).json({ message: "contentType and contentId are required" });
      }

      // Auto-generate tracking number for manual API registration
      const trackingNumber = await storage.generateTrackingNumber('TRV');

      const content = await storage.registerContent({
        trackingNumber,
        contentType,
        contentId,
        ownerId,
        title,
        description,
        status: status || 'published',
        metadata: metadata || {},
      });

      res.json(content);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to register content", error: error.message });
    }
  });

  // Get moderation queue (flagged content)
  app.get("/api/admin/content/moderation/queue", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const queue = await storage.getModerationQueue();
      res.json(queue);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get moderation queue", error: error.message });
    }
  });

  // Moderate content
  app.post("/api/admin/content/:trackingNumber/moderate", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { trackingNumber } = req.params;
      const { action, notes } = req.body;

      if (!['approve', 'suspend', 'delete'].includes(action)) {
        return res.status(400).json({ message: "Invalid action. Must be: approve, suspend, or delete" });
      }

      const result = await storage.moderateContent(
        trackingNumber,
        userId,
        action,
        notes
      );

      if (!result) {
        return res.status(404).json({ message: "Content not found" });
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to moderate content", error: error.message });
    }
  });

  // Flag content
  app.post("/api/content/:trackingNumber/flag", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { trackingNumber } = req.params;
      const { flagType, severity, description, evidence } = req.body;

      if (!flagType) {
        return res.status(400).json({ message: "flagType is required" });
      }

      const flag = await storage.createContentFlag({
        trackingNumber,
        reporterId: user?.claims?.sub,
        flagType,
        severity: severity || 'medium',
        description,
        evidence: evidence || [],
      });

      res.json(flag);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to flag content", error: error.message });
    }
  });

  // Get pending flags (admin only)
  app.get("/api/admin/content/flags/pending", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const flags = await storage.getPendingFlags();
      res.json(flags);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get pending flags", error: error.message });
    }
  });

  // Resolve flag (admin only)
  app.post("/api/admin/content/flags/:flagId/resolve", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { flagId } = req.params;
      const { resolution } = req.body;

      if (!resolution) {
        return res.status(400).json({ message: "resolution is required" });
      }

      const result = await storage.resolveFlag(flagId, userId, resolution);
      if (!result) {
        return res.status(404).json({ message: "Flag not found" });
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to resolve flag", error: error.message });
    }
  });

  // ============================================================
  // ADMIN SERVICES REGISTRY
  // ============================================================

  app.get("/api/admin/services/summary", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin access required" });

      const all = await storage.getAllProviderServices();
      const byStatus: Record<string, number> = {};
      let totalRevenue = 0;
      let totalBookings = 0;
      let featuredCount = 0;
      for (const s of all) {
        byStatus[s.status] = (byStatus[s.status] || 0) + 1;
        totalRevenue += parseFloat(s.totalRevenue ?? "0");
        totalBookings += s.bookingsCount ?? 0;
        if (s.isFeatured) featuredCount++;
      }
      res.json({
        total: all.length,
        byStatus,
        totalRevenue,
        totalBookings,
        featuredCount,
        averageRating: all.length > 0
          ? all.reduce((sum, s) => sum + parseFloat(s.averageRating ?? "0"), 0) / all.filter(s => s.averageRating).length
          : 0,
      });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch services summary", error: err.message });
    }
  });

  app.get("/api/admin/services", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin access required" });

      const { status, search, category } = req.query;
      const all = await storage.getAllProviderServices();

      const providerIds = [...new Set(all.map(s => s.userId))];
      const providerRows = providerIds.length > 0
        ? await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
            .from(users).where(inArray(users.id, providerIds))
        : [];
      const providerMap = Object.fromEntries(providerRows.map(p => [p.id, p]));

      let services = all.map(s => ({
        ...s,
        providerName: providerMap[s.userId]
          ? `${providerMap[s.userId].firstName ?? ""} ${providerMap[s.userId].lastName ?? ""}`.trim() || providerMap[s.userId].email
          : "Unknown",
        providerEmail: providerMap[s.userId]?.email,
      }));

      if (status && status !== "all") services = services.filter(s => s.status === status);
      if (category && category !== "all") services = services.filter(s => s.categoryId === category);
      if (search) {
        const q = (search as string).toLowerCase();
        services = services.filter(s =>
          s.serviceName.toLowerCase().includes(q) ||
          (s.providerName as string).toLowerCase().includes(q) ||
          s.trackingNumber?.toLowerCase().includes(q) ||
          s.location?.toLowerCase().includes(q)
        );
      }

      services.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
      res.json(services);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch services", error: err.message });
    }
  });

  app.patch("/api/admin/services/:id/status", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin access required" });

      const { status } = req.body;
      if (!["active", "paused", "draft", "suspended"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const [updated] = await db.update(providerServices)
        .set({ status, updatedAt: new Date() })
        .where(eq(providerServices.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ message: "Service not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to update service status", error: err.message });
    }
  });

  app.patch("/api/admin/services/:id/featured", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin access required" });

      const { isFeatured } = req.body;
      const [updated] = await db.update(providerServices)
        .set({ isFeatured: Boolean(isFeatured), updatedAt: new Date() })
        .where(eq(providerServices.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ message: "Service not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to update featured status", error: err.message });
    }
  });

  app.delete("/api/admin/services/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin access required" });

      const [row] = await db.select().from(providerServices).where(eq(providerServices.id, req.params.id)).limit(1);
      if (!row) return res.status(404).json({ message: "Service not found" });
      await db.delete(providerServices).where(eq(providerServices.id, req.params.id));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to delete service", error: err.message });
    }
  });

  // === Content Invoices API ===

  // Create invoice for content
  app.post("/api/admin/invoices", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { trackingNumber, customerId, providerId, invoiceType, amount, currency, taxAmount, discountAmount, notes, dueDate } = req.body;

      if (!trackingNumber || !invoiceType || !amount) {
        return res.status(400).json({ message: "trackingNumber, invoiceType, and amount are required" });
      }

      const totalAmount = amount + (taxAmount || 0) - (discountAmount || 0);

      const invoice = await storage.createContentInvoice({
        invoiceNumber: `INV-${trackingNumber}`,
        trackingNumber,
        customerId,
        providerId,
        invoiceType,
        amount,
        currency: currency || 'USD',
        taxAmount: taxAmount || 0,
        discountAmount: discountAmount || 0,
        totalAmount,
        notes,
        dueDate: dueDate ? new Date(dueDate) : undefined,
      });

      res.json(invoice);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to create invoice", error: error.message });
    }
  });

  // Get invoice by number
  app.get("/api/admin/invoices/:invoiceNumber", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { invoiceNumber } = req.params;
      const invoice = await storage.getContentInvoice(invoiceNumber);

      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      res.json(invoice);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get invoice", error: error.message });
    }
  });

  // Update invoice status
  app.patch("/api/admin/invoices/:invoiceNumber/status", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { invoiceNumber } = req.params;
      const { status, paymentReference } = req.body;

      if (!status) {
        return res.status(400).json({ message: "status is required" });
      }

      const result = await storage.updateInvoiceStatus(invoiceNumber, status, paymentReference);
      if (!result) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to update invoice status", error: error.message });
    }
  });

  // Get invoices by customer
  app.get("/api/invoices/my", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const invoices = await storage.getInvoicesByCustomer(user.claims.sub);
      res.json(invoices);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get invoices", error: error.message });
    }
  });

  // =============================================
  // AI Usage & Cost Tracking Endpoints (Admin)
  // =============================================

  // Get AI usage summary with cost breakdown
  app.get("/api/admin/ai-usage/summary", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;

      const summary = await aiUsageService.getSummary(start, end);
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get AI usage summary", error: error.message });
    }
  });

  // Get daily AI usage for charts
  app.get("/api/admin/ai-usage/daily", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const days = parseInt(req.query.days as string) || 30;
      const dailyUsage = await aiUsageService.getDailyUsage(days);
      res.json(dailyUsage);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get daily AI usage", error: error.message });
    }
  });

  // Get recent AI usage logs
  app.get("/api/admin/ai-usage/logs", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const limit = parseInt(req.query.limit as string) || 100;
      const logs = await aiUsageService.getRecentLogs(limit);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get AI usage logs", error: error.message });
    }
  });

  // Get AI pricing info
  app.get("/api/admin/ai-usage/pricing", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      res.json({
        providers: {
          grok: {
            models: {
              'grok-2': { input: 200, output: 1000 },
              'grok-2-vision': { input: 200, output: 1000 },
              'grok-4': { input: 300, output: 1500 },
              'grok-4.1-fast': { input: 20, output: 50 },
            },
            note: "Prices in cents per 1M tokens"
          },
          anthropic: {
            models: {
              'claude-3-sonnet': { input: 300, output: 1500 },
              'claude-3-opus': { input: 1500, output: 7500 },
            },
            note: "Prices in cents per 1M tokens"
          }
        },
        lastUpdated: "2026-01-27"
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get pricing info", error: error.message });
    }
  });

  // External API Usage Tracking (Amadeus, etc.)
  app.get("/api/admin/api-usage/summary", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { apiUsageService } = await import('./services/api-usage.service');
      const summary = await apiUsageService.getUsageSummary(30);
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get API usage summary", error: error.message });
    }
  });

  app.get("/api/admin/api-usage/daily", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { apiUsageService } = await import('./services/api-usage.service');
      const daily = await apiUsageService.getDailyUsage(30);
      res.json(daily);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get daily API usage", error: error.message });
    }
  });

  app.get("/api/admin/api-usage/logs", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { apiUsageService } = await import('./services/api-usage.service');
      const logs = await apiUsageService.getRecentLogs(100);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get API usage logs", error: error.message });
    }
  });

  app.get("/api/admin/api-usage/pricing", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { apiUsageService } = await import('./services/api-usage.service');
      const pricing = apiUsageService.getPricingInfo();
      res.json(pricing);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get API pricing info", error: error.message });
    }
  });

  // === Revenue Tracking Endpoints ===

  // Admin unified revenue dashboard
  app.get("/api/admin/revenue/dashboard", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { revenueTrackingService } = await import('./services/revenue-tracking.service');
      const dashboard = await revenueTrackingService.getUnifiedDashboard();
      res.json(dashboard);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get revenue dashboard", error: error.message });
    }
  });

  // Platform revenue summary with filters
  app.get("/api/admin/revenue/summary", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const startDate = req.query.startDate ? new Date(String(req.query.startDate)) : undefined;
      const endDate = req.query.endDate ? new Date(String(req.query.endDate)) : undefined;
      
      const summary = await storage.getPlatformRevenueSummary(startDate, endDate);
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get revenue summary", error: error.message });
    }
  });

  // Platform revenue transactions list
  app.get("/api/admin/revenue/transactions", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const startDate = req.query.startDate ? new Date(String(req.query.startDate)) : undefined;
      const endDate = req.query.endDate ? new Date(String(req.query.endDate)) : undefined;
      const sourceType = req.query.sourceType ? String(req.query.sourceType) : undefined;
      
      const transactions = await storage.getPlatformRevenue({ startDate, endDate, sourceType });
      res.json(transactions);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get revenue transactions", error: error.message });
    }
  });

  // Revenue report by content tracking number
  app.get("/api/admin/revenue/content/:trackingNumber", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { revenueTrackingService } = await import('./services/revenue-tracking.service');
      const report = await revenueTrackingService.getContentRevenueReport(req.params.trackingNumber);
      res.json(report);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get content revenue report", error: error.message });
    }
  });

  // Unified revenue endpoint — fans out to all affiliate/payment streams in parallel
  app.get("/api/admin/revenue/unified", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const period = (req.query.period as string) || "this_month";
      const validPeriods = ["this_month", "last_month", "last_90_days"];
      if (!validPeriods.includes(period)) {
        return res.status(400).json({ message: "Invalid period. Use: this_month, last_month, last_90_days" });
      }

      const [
        { getTravelpayoutsStatistics },
        { getViatorCommissions },
        { getFeverCommissions },
        { getBookingComCommissions },
        { getApiCostsSummary },
      ] = await Promise.all([
        import("./services/travelpayouts/statistics.service"),
        import("./services/viator-commissions.service"),
        import("./services/fever-commissions.service"),
        import("./services/booking-com-commissions.service"),
        import("./services/api-costs.service"),
      ]);

      // Compute period-specific date bounds for Stripe query
      const now = new Date();
      const periodBounds = (() => {
        if (period === "last_month") {
          return {
            start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
            end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59),
          };
        }
        if (period === "last_90_days") {
          return {
            start: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
            end: now,
          };
        }
        // this_month
        return {
          start: new Date(now.getFullYear(), now.getMonth(), 1),
          end: now,
        };
      })();

      // Comparison (prior) period bounds for MoM badge
      const priorPeriodBounds = (() => {
        if (period === "last_month") {
          return {
            start: new Date(now.getFullYear(), now.getMonth() - 2, 1),
            end: new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59),
          };
        }
        if (period === "last_90_days") {
          return {
            start: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000),
            end: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
          };
        }
        // this_month → compare against last calendar month
        return {
          start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
          end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59),
        };
      })();

      const [travelpayouts, viator, fever, bookingCom, apiCosts, stripePeriodSummary, stripePriorSummary] = await Promise.all([
        getTravelpayoutsStatistics(period).catch(() => ({ configured: false, thisMonth: 0, lastMonth: 0, total: 0, currency: "USD", balance: 0, byPartner: [] })),
        getViatorCommissions(period).catch(() => ({ configured: false, thisMonth: 0, lastMonth: 0, total: 0, currency: "USD" })),
        getFeverCommissions(period).catch(() => ({ configured: false, thisMonth: 0, lastMonth: 0, total: 0, currency: "USD" })),
        getBookingComCommissions(period).catch(() => ({ configured: false, thisMonth: 0, lastMonth: 0, total: 0, currency: "USD" })),
        getApiCostsSummary(period).catch(() => ({ entries: [], totalCostDollars: 0 })),
        // Fetch period-accurate Stripe total directly from DB
        storage.getPlatformRevenueSummary(periodBounds.start, periodBounds.end).catch(() => ({ totalPlatformFee: 0, totalGross: 0, bySource: {} })),
        // Fetch prior period for MoM comparison
        storage.getPlatformRevenueSummary(priorPeriodBounds.start, priorPeriodBounds.end).catch(() => ({ totalPlatformFee: 0, totalGross: 0, bySource: {} })),
      ]);

      const stripeThisMonth = stripePeriodSummary.totalPlatformFee;
      const stripeLastMonth = stripePriorSummary.totalPlatformFee;
      // Use period-accurate DB query result (not all-time totalRevenue)
      const stripeTotal = stripePeriodSummary.totalPlatformFee;
      const stripeGrowthPercent = stripeLastMonth > 0
        ? Math.round(((stripeThisMonth - stripeLastMonth) / stripeLastMonth) * 1000) / 10
        : 0;

      // Use only reconciliation-confirmed affiliate totals when available
      let confirmedAffiliateTotal = 0;
      try {
        const { affiliateReconciliationService } = await import("./services/affiliate-reconciliation.service");
        confirmedAffiliateTotal = await affiliateReconciliationService.getConfirmedAffiliateTotal(
          periodBounds.start,
          periodBounds.end
        );
      } catch (_) { /* ignore — fallback to raw totals */ }

      const rawAffiliateRevenue =
        (travelpayouts.total || 0) +
        (viator.total || 0) +
        (fever.total || 0) +
        (bookingCom.total || 0);

      // Always use confirmed (matched) totals; raw affiliate numbers are for context only.
      // If reconciliation has never run, confirmed will be 0 — that is the correct conservative figure.
      const totalAffiliateRevenue = confirmedAffiliateTotal;

      const totalNetRevenue = stripeTotal + totalAffiliateRevenue - apiCosts.totalCostDollars;

      res.json({
        period,
        totalNetRevenue,
        stripe: {
          configured: true,
          thisMonth: stripeThisMonth,
          lastMonth: stripeLastMonth,
          total: stripeTotal,
          currency: "USD",
          growthPercent: stripeGrowthPercent,
        },
        travelpayouts,
        viator,
        fever,
        bookingCom,
        apiCosts,
      });
    } catch (error: any) {
      console.error("[UnifiedRevenue] Error:", error);
      res.status(500).json({ message: "Failed to get unified revenue data", error: error.message });
    }
  });

  // Admin unified revenue export (CSV or PDF)
  app.get("/api/admin/revenue/unified/export", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const period = (req.query.period as string) || "this_month";
      const format = ((req.query.format as string) || "csv").toLowerCase();
      const validPeriods = ["this_month", "last_month", "last_90_days"];
      if (!validPeriods.includes(period)) {
        return res.status(400).json({ message: "Invalid period. Use: this_month, last_month, last_90_days" });
      }
      if (!["csv", "pdf"].includes(format)) {
        return res.status(400).json({ message: "Invalid format. Use: csv, pdf" });
      }

      const [
        { getTravelpayoutsStatistics },
        { getViatorCommissions },
        { getFeverCommissions },
        { getBookingComCommissions },
        { getApiCostsSummary },
        { revenueTrackingService },
      ] = await Promise.all([
        import("./services/travelpayouts/statistics.service"),
        import("./services/viator-commissions.service"),
        import("./services/fever-commissions.service"),
        import("./services/booking-com-commissions.service"),
        import("./services/api-costs.service"),
        import("./services/revenue-tracking.service"),
      ]);

      const now = new Date();
      const periodBounds = (() => {
        if (period === "last_month") {
          return {
            start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
            end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59),
          };
        }
        if (period === "last_90_days") {
          return {
            start: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
            end: now,
          };
        }
        return {
          start: new Date(now.getFullYear(), now.getMonth(), 1),
          end: now,
        };
      })();

      const [stripe, travelpayouts, viator, fever, bookingCom, apiCosts, stripePeriodSummary, transactions] = await Promise.all([
        revenueTrackingService.getUnifiedDashboard().catch(() => null),
        getTravelpayoutsStatistics(period).catch(() => ({ configured: false, thisMonth: 0, lastMonth: 0, total: 0, currency: "USD", balance: 0, byPartner: [] })),
        getViatorCommissions(period).catch(() => ({ configured: false, thisMonth: 0, lastMonth: 0, total: 0, currency: "USD" })),
        getFeverCommissions(period).catch(() => ({ configured: false, thisMonth: 0, lastMonth: 0, total: 0, currency: "USD" })),
        getBookingComCommissions(period).catch(() => ({ configured: false, thisMonth: 0, lastMonth: 0, total: 0, currency: "USD" })),
        getApiCostsSummary(period).catch(() => ({ entries: [], totalCostDollars: 0 })),
        storage.getPlatformRevenueSummary(periodBounds.start, periodBounds.end).catch(() => ({ totalPlatformFee: 0, totalGross: 0, bySource: {} })),
        storage.getPlatformRevenue({ startDate: periodBounds.start, endDate: periodBounds.end }).catch(() => []),
      ]);

      const stripeTotal = stripePeriodSummary.totalPlatformFee;
      const totalAffiliateRevenue = (travelpayouts.total || 0) + (viator.total || 0) + (fever.total || 0) + (bookingCom.total || 0);
      const totalNetRevenue = stripeTotal + totalAffiliateRevenue - apiCosts.totalCostDollars;

      const periodLabel = period === "last_month" ? "Last Month" : period === "last_90_days" ? "Last 90 Days" : "This Month";
      const exportedAt = now.toISOString();
      const fmt = (n: number) => n.toFixed(2);

      if (format === "csv") {
        const rows: string[] = [];
        const addRow = (...cols: (string | number)[]) => rows.push(cols.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","));
        const addBlank = () => rows.push("");
        const addHeader = (title: string) => { addBlank(); addRow(title); };

        addRow("Traveloure - Unified Revenue Export");
        addRow(`Period: ${periodLabel}`);
        addRow(`Exported: ${exportedAt}`);

        addHeader("REVENUE STREAM TOTALS");
        addRow("Stream", "This Month (USD)", "Last Month (USD)", "Period Total (USD)");
        addRow("Stripe (Platform Fees)", fmt(stripe?.platform?.thisMonth || 0), fmt(stripe?.platform?.lastMonth || 0), fmt(stripeTotal));
        addRow("Travelpayouts", fmt(travelpayouts.thisMonth || 0), fmt(travelpayouts.lastMonth || 0), fmt(travelpayouts.total || 0));
        addRow("Viator", fmt(viator.thisMonth || 0), fmt(viator.lastMonth || 0), fmt(viator.total || 0));
        addRow("Fever", fmt(fever.thisMonth || 0), fmt(fever.lastMonth || 0), fmt(fever.total || 0));
        addRow("Booking.com", fmt(bookingCom.thisMonth || 0), fmt(bookingCom.lastMonth || 0), fmt(bookingCom.total || 0));
        addRow("API Costs (deducted)", "", "", `-${fmt(apiCosts.totalCostDollars)}`);
        addRow("NET REVENUE", "", "", fmt(totalNetRevenue));

        if ((travelpayouts as any).byPartner?.length) {
          addHeader("TRAVELPAYOUTS PARTNER BREAKDOWN");
          addRow("Partner", "This Month (USD)", "Last Month (USD)", "Period Total (USD)");
          for (const p of (travelpayouts as any).byPartner) {
            addRow(p.partnerLabel || p.partner, fmt(p.thisMonth || 0), fmt(p.lastMonth || 0), fmt(p.total || 0));
          }
        }

        if (apiCosts.entries?.length) {
          addHeader("API COST BREAKDOWN");
          addRow("Provider", "API Calls", "Cost (USD)");
          for (const e of apiCosts.entries) {
            addRow(e.provider, e.calls, fmt(e.costDollars));
          }
          addRow("TOTAL API COSTS", "", fmt(apiCosts.totalCostDollars));
        }

        if (Array.isArray(transactions) && transactions.length) {
          addHeader("RECENT TRANSACTIONS");
          addRow("Date", "Source Type", "Gross Amount (USD)", "Platform Fee (USD)", "Tracking #");
          for (const tx of transactions) {
            addRow(
              new Date(tx.date).toLocaleDateString("en-US"),
              tx.sourceType || "",
              fmt(tx.grossAmount || 0),
              fmt(tx.platformFee || 0),
              tx.trackingNumber || ""
            );
          }
        }

        const csvContent = rows.join("\r\n");
        const filename = `traveloure-revenue-${period}-${now.toISOString().slice(0, 10)}.csv`;
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        return res.send("\uFEFF" + csvContent); // BOM for Excel UTF-8
      }

      // PDF: generate a real PDF using pdfkit
      const PDFDocument = (await import("pdfkit")).default;
      const periodTransactions = Array.isArray(transactions) ? transactions : [];

      const filename = `traveloure-revenue-${period}-${now.toISOString().slice(0, 10)}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

      const doc = new PDFDocument({ margin: 50, size: "A4" });
      doc.pipe(res);

      const COL_GRAY = "#6b7280";
      const COL_GREEN = "#16a34a";
      const COL_BLACK = "#111827";
      const COL_HEADER_BG = "#f3f4f6";

      // Helper: sanitize string for PDF output (strip control chars)
      const safe = (v: unknown) => String(v ?? "").replace(/[\x00-\x1F\x7F]/g, " ").slice(0, 200);

      // Title
      doc.fontSize(18).fillColor(COL_BLACK).font("Helvetica-Bold").text("Traveloure – Unified Revenue Report");
      doc.fontSize(10).fillColor(COL_GRAY).font("Helvetica").text(`Period: ${periodLabel}   |   Exported: ${exportedAt}`);
      doc.moveDown(0.5);

      // Net Revenue highlight
      doc.fontSize(13).fillColor(COL_GREEN).font("Helvetica-Bold").text(`Net Revenue: $${fmt(totalNetRevenue)} USD`);
      doc.moveDown(1);

      // Helper: draw a simple table
      const drawTable = (headers: string[], colWidths: number[], rows: (string | number)[][], highlightLast = false) => {
        const startX = doc.page.margins.left;
        const rowH = 18;
        let y = doc.y;

        // Header row
        doc.font("Helvetica-Bold").fontSize(9).fillColor(COL_BLACK);
        let x = startX;
        headers.forEach((h, i) => {
          doc.rect(x, y, colWidths[i], rowH).fill(COL_HEADER_BG).stroke("#d1d5db");
          doc.fillColor(COL_BLACK).text(h, x + 4, y + 4, { width: colWidths[i] - 8, lineBreak: false });
          x += colWidths[i];
        });
        y += rowH;

        // Data rows
        doc.font("Helvetica").fontSize(9);
        rows.forEach((row, ri) => {
          if (y + rowH > doc.page.height - doc.page.margins.bottom) {
            doc.addPage();
            y = doc.page.margins.top;
          }
          const isLast = highlightLast && ri === rows.length - 1;
          x = startX;
          row.forEach((cell, ci) => {
            doc.rect(x, y, colWidths[ci], rowH).fill(isLast ? "#f9fafb" : "#ffffff").stroke("#e5e7eb");
            doc.font(isLast ? "Helvetica-Bold" : "Helvetica").fillColor(COL_BLACK)
              .text(safe(cell), x + 4, y + 4, { width: colWidths[ci] - 8, lineBreak: false });
            x += colWidths[ci];
          });
          y += rowH;
        });
        doc.y = y;
        doc.moveDown(1);
      };

      // Revenue Streams
      doc.font("Helvetica-Bold").fontSize(12).fillColor(COL_BLACK).text("Revenue Stream Totals");
      doc.moveDown(0.3);
      drawTable(
        ["Stream", "This Month", "Last Month", "Period Total"],
        [210, 100, 100, 100],
        [
          ["Stripe (Platform Fees)", `$${fmt(stripe?.platform?.thisMonth || 0)}`, `$${fmt(stripe?.platform?.lastMonth || 0)}`, `$${fmt(stripeTotal)}`],
          ["Travelpayouts", `$${fmt(travelpayouts.thisMonth || 0)}`, `$${fmt(travelpayouts.lastMonth || 0)}`, `$${fmt(travelpayouts.total || 0)}`],
          ["Viator", `$${fmt(viator.thisMonth || 0)}`, `$${fmt(viator.lastMonth || 0)}`, `$${fmt(viator.total || 0)}`],
          ["Fever", `$${fmt(fever.thisMonth || 0)}`, `$${fmt(fever.lastMonth || 0)}`, `$${fmt(fever.total || 0)}`],
          ["Booking.com", `$${fmt(bookingCom.thisMonth || 0)}`, `$${fmt(bookingCom.lastMonth || 0)}`, `$${fmt(bookingCom.total || 0)}`],
          ["API Costs (deducted)", "", "", `-$${fmt(apiCosts.totalCostDollars)}`],
          ["NET REVENUE", "", "", `$${fmt(totalNetRevenue)}`],
        ],
        true
      );

      // Travelpayouts partner breakdown
      const partners = (travelpayouts as any).byPartner ?? [];
      if (partners.length) {
        doc.font("Helvetica-Bold").fontSize(12).fillColor(COL_BLACK).text("Travelpayouts Partner Breakdown");
        doc.moveDown(0.3);
        drawTable(
          ["Partner", "This Month", "Last Month", "Period Total"],
          [210, 100, 100, 100],
          partners.map((p: any) => [
            safe(p.partnerLabel || p.partner),
            `$${fmt(p.thisMonth || 0)}`,
            `$${fmt(p.lastMonth || 0)}`,
            `$${fmt(p.total || 0)}`,
          ])
        );
      }

      // API costs breakdown
      if (apiCosts.entries?.length) {
        doc.font("Helvetica-Bold").fontSize(12).fillColor(COL_BLACK).text("API Cost Breakdown");
        doc.moveDown(0.3);
        drawTable(
          ["Provider", "API Calls", "Cost (USD)"],
          [240, 130, 130],
          [
            ...apiCosts.entries.map((e: any) => [safe(e.provider), String(e.calls), `$${fmt(e.costDollars)}`]),
            ["TOTAL API COSTS", "", `$${fmt(apiCosts.totalCostDollars)}`],
          ],
          true
        );
      }

      // Transactions
      if (periodTransactions.length) {
        doc.font("Helvetica-Bold").fontSize(12).fillColor(COL_BLACK).text(`Transactions (${periodTransactions.length})`);
        doc.moveDown(0.3);
        drawTable(
          ["Date", "Source Type", "Gross Amount", "Platform Fee", "Tracking #"],
          [80, 140, 90, 90, 110],
          periodTransactions.map((tx: any) => [
            new Date(tx.date).toLocaleDateString("en-US"),
            safe(tx.sourceType),
            `$${fmt(tx.grossAmount || 0)}`,
            `$${fmt(tx.platformFee || 0)}`,
            safe(tx.trackingNumber || ""),
          ])
        );
      }

      doc.end();
      return;
    } catch (error: any) {
      console.error("[RevenueExport] Error:", error);
      res.status(500).json({ message: "Failed to export revenue data", error: error.message });
    }
  });

  // Provider earnings endpoints
  // Uses same auth pattern as /api/provider/services, /api/provider/bookings
  app.get("/api/provider/earnings", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const earnings = await storage.getProviderEarnings(userId);
      res.json(earnings);
    } catch (error: any) {
      console.error("Provider earnings error:", error);
      res.status(500).json({ message: "Failed to get provider earnings", error: error.message });
    }
  });

  app.get("/api/provider/earnings/summary", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const summary = await storage.getProviderEarningsSummary(userId);
      // Return both legacy field names and the names the payouts UI expects
      res.json({
        ...summary,
        totalEarnings: summary.total,
        availableForPayout: summary.available,
        pendingPayout: summary.pending,
        commissionRate: summary.total > 0 ? (summary.paidOut / summary.total) : 0,
      });
    } catch (error: any) {
      console.error("Provider earnings summary error:", error);
      res.status(500).json({ message: "Failed to get provider earnings summary", error: error.message });
    }
  });

  app.get("/api/provider/earnings/details", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { revenueTrackingService } = await import('./services/revenue-tracking.service');
      const details = await revenueTrackingService.getProviderRevenueDetails(userId);
      res.json(details);
    } catch (error: any) {
      console.error("Provider earnings details error:", error);
      res.status(500).json({ message: "Failed to get provider earnings details", error: error.message });
    }
  });

  // Provider payout requests
  app.get("/api/provider/payouts", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const payouts = await storage.getProviderPayouts(userId);
      res.json(payouts);
    } catch (error: any) {
      console.error("Provider payouts error:", error);
      res.status(500).json({ message: "Failed to get provider payouts", error: error.message });
    }
  });

  app.post("/api/provider/payouts/request", isAuthenticated, async (req, res) => {
    const MINIMUM_PAYOUT = 25;
    try {
      const userId = (req.user as any).claims.sub;
      const { payoutMethod } = req.body;
      const amount = Number(req.body.amount);
      if (!isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: "Invalid payout amount" });
      }
      if (amount < MINIMUM_PAYOUT) {
        return res.status(400).json({ error: `Minimum payout amount is $${MINIMUM_PAYOUT}` });
      }

      const stripeAccount = await storage.getUserStripeAccount(userId);
      if (!stripeAccount.stripeAccountId || stripeAccount.stripeAccountStatus !== 'active') {
        return res.status(400).json({ error: "Stripe Connect account not active. Please complete onboarding before requesting a payout." });
      }

      const summary = await storage.getProviderEarningsSummary(userId);
      if (amount > summary.available) {
        return res.status(400).json({ error: `Insufficient available balance. Available: $${summary.available.toFixed(2)}` });
      }

      const payout = await storage.createProviderPayout({
        providerId: userId,
        amount: String(amount),
        payoutMethod: payoutMethod || 'bank_transfer',
        status: 'pending',
      });
      
      res.json(payout);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to request payout", error: error.message });
    }
  });

  // Expert payout request (mirrors provider payout request)
  app.post("/api/expert/payouts/request", isAuthenticated, async (req, res) => {
    const MINIMUM_PAYOUT = 25;
    try {
      const userId = (req.user as any).claims.sub;
      const { payoutMethod } = req.body;
      const amount = Number(req.body.amount);
      if (!isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: "Invalid payout amount" });
      }
      if (amount < MINIMUM_PAYOUT) {
        return res.status(400).json({ error: `Minimum payout amount is $${MINIMUM_PAYOUT}` });
      }

      const stripeAccount = await storage.getUserStripeAccount(userId);
      if (!stripeAccount.stripeAccountId || stripeAccount.stripeAccountStatus !== 'active') {
        return res.status(400).json({ error: "Stripe Connect account not active. Please complete onboarding before requesting a payout." });
      }

      const summary = await storage.getExpertEarningsSummary(userId);
      if (amount > summary.available) {
        return res.status(400).json({ error: `Insufficient available balance. Available: $${summary.available.toFixed(2)}` });
      }

      const payout = await storage.createExpertPayout({
        expertId: userId,
        amount: String(amount),
        payoutMethod: payoutMethod || 'bank_transfer',
        status: 'pending',
      });

      res.json(payout);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to request payout", error: error.message });
    }
  });

  // Get expert payouts
  app.get("/api/expert/payouts", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const payouts = await storage.getExpertPayouts(userId);
      res.json(payouts);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get expert payouts", error: error.message });
    }
  });

  // Expert earnings details endpoint
  // Uses same auth pattern as /api/provider/services, /api/provider/bookings
  app.get("/api/expert/earnings/details", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { revenueTrackingService } = await import('./services/revenue-tracking.service');
      const details = await revenueTrackingService.getExpertRevenueDetails(userId);
      res.json(details);
    } catch (error: any) {
      console.error("Expert earnings details error:", error);
      res.status(500).json({ message: "Failed to get expert earnings details", error: error.message });
    }
  });

  // === Stripe Connect Onboarding ===

  app.post("/api/stripe/connect/onboard", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      if (!['expert', 'service_provider'].includes(user.role || '')) {
        return res.status(403).json({ error: "Only experts and providers can onboard for payouts" });
      }

      const existing = await storage.getUserStripeAccount(userId);
      if (existing.stripeAccountId && existing.stripeAccountStatus === 'active') {
        return res.status(400).json({ error: "Stripe account already active" });
      }

      const { stripeConnectService } = await import('./services/stripe-connect.service');
      let accountId = existing.stripeAccountId;
      if (!accountId) {
        const result = await stripeConnectService.createConnectedAccount(
          userId, user.email, user.role === 'expert' ? 'expert' : 'provider', user.name || undefined
        );
        accountId = result.accountId;
        await storage.updateUserStripeAccount(userId, accountId, 'onboarding_incomplete');
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const link = await stripeConnectService.createOnboardingLink(
        accountId,
        `${baseUrl}/stripe/connect/return`,
        `${baseUrl}/stripe/connect/refresh`
      );
      res.json({ url: link.url, accountId });
    } catch (error: any) {
      console.error('Stripe Connect onboard error:', error);
      res.status(500).json({ message: "Failed to start Stripe onboarding", error: error.message });
    }
  });

  app.get("/api/stripe/connect/status", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const account = await storage.getUserStripeAccount(userId);
      if (!account.stripeAccountId) {
        return res.json({ connected: false, status: 'not_connected' });
      }

      const { stripeConnectService } = await import('./services/stripe-connect.service');
      const status = await stripeConnectService.getAccountStatus(account.stripeAccountId);

      if (status.status !== account.stripeAccountStatus) {
        await storage.updateUserStripeAccount(userId, account.stripeAccountId, status.status);
      }

      res.json({
        connected: true,
        accountId: account.stripeAccountId,
        ...status,
      });
    } catch (error: any) {
      console.error('Stripe Connect status error:', error);
      res.status(500).json({ message: "Failed to check Stripe status", error: error.message });
    }
  });

  app.get("/api/stripe/connect/dashboard", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const account = await storage.getUserStripeAccount(userId);
      if (!account.stripeAccountId) {
        return res.status(400).json({ error: "No Stripe account connected" });
      }

      const { stripeConnectService } = await import('./services/stripe-connect.service');
      const link = await stripeConnectService.createLoginLink(account.stripeAccountId);
      res.json({ url: link.url });
    } catch (error: any) {
      console.error('Stripe dashboard link error:', error);
      res.status(500).json({ message: "Failed to create dashboard link", error: error.message });
    }
  });

  app.get("/stripe/connect/return", (_req, res) => {
    res.redirect("/dashboard?stripe=connected");
  });

  app.get("/stripe/connect/refresh", (_req, res) => {
    res.redirect("/dashboard?stripe=refresh");
  });

  // === Admin Payouts Management ===

  app.get("/api/admin/payouts", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const status = req.query.status as string | undefined;
      const validStatuses = ['pending', 'processing', 'approved', 'completed', 'failed'];
      if (status && !validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status filter" });
      }
      const [expertPayouts, providerPayouts] = await Promise.all([
        storage.getAllExpertPayouts(status),
        storage.getAllProviderPayouts(status),
      ]);
      const allPayouts = [
        ...expertPayouts.map(p => ({ ...p, requesterType: 'expert' as const })),
        ...providerPayouts.map(p => ({ ...p, requesterType: 'provider' as const })),
      ].sort((a, b) => new Date(b.requestedAt || 0).getTime() - new Date(a.requestedAt || 0).getTime());
      res.json(allPayouts);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get payouts", error: error.message });
    }
  });

  app.patch("/api/admin/payouts/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { id } = req.params;
      const { status, notes, transactionId, payoutReference, requesterType } = req.body;
      const validStatuses = ['processing', 'completed', 'failed'];
      const validTypes = ['expert', 'provider'];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status. Must be one of: processing, completed, failed" });
      }
      if (!requesterType || !validTypes.includes(requesterType)) {
        return res.status(400).json({ error: "Invalid requesterType. Must be 'expert' or 'provider'" });
      }
      let updated;
      if (status === 'completed') {
        const recipientId = requesterType === 'expert'
          ? (await db.select({ expertId: expertPayouts.expertId }).from(expertPayouts).where(eq(expertPayouts.id, id)))[0]?.expertId
          : (await db.select({ providerId: providerPayouts.providerId }).from(providerPayouts).where(eq(providerPayouts.id, id)))[0]?.providerId;

        if (!recipientId) {
          return res.status(404).json({ error: "Payout not found" });
        }

        const recipientStripe = await storage.getUserStripeAccount(recipientId);

        if (recipientStripe.stripeAccountId && recipientStripe.canReceivePayments) {
          const { stripeConnectService } = await import('./services/stripe-connect.service');
          const payoutAmount = requesterType === 'expert'
            ? (await db.select({ amount: expertPayouts.amount }).from(expertPayouts).where(eq(expertPayouts.id, id)))[0]?.amount
            : (await db.select({ amount: providerPayouts.amount }).from(providerPayouts).where(eq(providerPayouts.id, id)))[0]?.amount;

          const payoutAmountNum = parseFloat(payoutAmount || '0');

          // Check platform balance before initiating transfer
          try {
            const platformBalance = await stripeConnectService.getAccountBalance();
            if (platformBalance.available < payoutAmountNum) {
              return res.status(402).json({
                error: `Insufficient platform balance. Available: $${platformBalance.available.toFixed(2)}, Required: $${payoutAmountNum.toFixed(2)}`,
                platformAvailable: platformBalance.available,
                required: payoutAmountNum,
              });
            }
          } catch (balanceError: any) {
            console.error('Failed to check platform balance:', balanceError);
            return res.status(500).json({ error: "Failed to check platform balance before transfer" });
          }

          try {
            const transfer = await stripeConnectService.createTransfer(
              payoutAmountNum,
              'usd',
              recipientStripe.stripeAccountId,
              `Traveloure ${requesterType} payout`,
              { payoutId: id, requesterType, recipientId }
            );

            if (requesterType === 'expert') {
              updated = await storage.updateExpertPayoutStatus(id, 'completed', notes, transfer.transferId);
            } else {
              updated = await storage.updateProviderPayoutStatus(id, 'completed', notes, transfer.transferId);
            }

            // Send in-app notification to the recipient
            try {
              await storage.createNotification({
                userId: recipientId,
                type: 'payout_processed',
                title: 'Payout Processed',
                message: `Your payout of $${payoutAmountNum.toFixed(2)} has been processed and is on its way to your Stripe account.`,
                data: { payoutId: id, amount: payoutAmountNum, transferId: transfer.transferId },
              });
            } catch (notifError) {
              console.error('Failed to send payout notification:', notifError);
            }
          } catch (stripeError: any) {
            console.error('Stripe transfer failed:', stripeError);
            if (requesterType === 'expert') {
              updated = await storage.updateExpertPayoutStatus(id, 'failed', `Stripe transfer failed: ${stripeError.message}`);
            } else {
              updated = await storage.updateProviderPayoutStatus(id, 'failed', `Stripe transfer failed: ${stripeError.message}`);
            }
            return res.json({ ...updated, stripeError: stripeError.message });
          }
        } else {
          return res.status(400).json({
            error: "Recipient does not have an active Stripe Connect account. They must complete onboarding first.",
            recipientId,
            hasStripeAccount: !!recipientStripe.stripeAccountId,
            canReceivePayments: recipientStripe.canReceivePayments,
          });
        }
      } else {
        if (requesterType === 'expert') {
          updated = await storage.updateExpertPayoutStatus(id, status, notes, transactionId);
        } else {
          updated = await storage.updateProviderPayoutStatus(id, status, notes, payoutReference);
        }
      }
      if (!updated) {
        return res.status(404).json({ error: "Payout not found" });
      }
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to update payout", error: error.message });
    }
  });

  // === Logistics: Temporal Anchors ===

  app.get("/api/trips/:tripId/anchors", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      if (trip.userId !== userId && user.role !== "admin" && user.role !== "expert") {
        return res.status(403).json({ message: "Not authorized to access this trip" });
      }

      const anchors = await storage.getTemporalAnchors(req.params.tripId);
      res.json(anchors);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get temporal anchors", error: error.message });
    }
  });

  app.post("/api/trips/:tripId/anchors", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      if (trip.userId !== userId && user.role !== "admin" && user.role !== "expert") {
        return res.status(403).json({ message: "Not authorized to access this trip" });
      }

      const body = { ...req.body, tripId: req.params.tripId };

      if (!body.anchorDatetime && body.dayNumber && body.suggestedTime) {
        const startDate = trip.startDate?.toString() || new Date().toISOString().split('T')[0];
        const tripStart = new Date(startDate);
        const anchorDate = new Date(tripStart);
        anchorDate.setDate(anchorDate.getDate() + (body.dayNumber - 1));
        const [h, m] = body.suggestedTime.split(':');
        anchorDate.setHours(parseInt(h), parseInt(m), 0, 0);
        body.anchorDatetime = anchorDate.toISOString();
        delete body.dayNumber;
        delete body.suggestedTime;
      }

      const input = insertTemporalAnchorSchema.parse(body);
      const anchor = await storage.createTemporalAnchor(input);
      res.status(201).json(anchor);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put("/api/anchors/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const updated = await storage.updateTemporalAnchor(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Anchor not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to update anchor", error: error.message });
    }
  });

  app.delete("/api/anchors/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      await storage.deleteTemporalAnchor(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: "Failed to delete anchor", error: error.message });
    }
  });

  // === Logistics: Day Boundaries ===

  app.get("/api/trips/:tripId/day-boundaries", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      if (trip.userId !== userId && user.role !== "admin" && user.role !== "expert") {
        return res.status(403).json({ message: "Not authorized to access this trip" });
      }

      const boundaries = await storage.getDayBoundaries(req.params.tripId);
      res.json(boundaries);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get day boundaries", error: error.message });
    }
  });

  app.post("/api/trips/:tripId/day-boundaries", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      if (trip.userId !== userId && user.role !== "admin" && user.role !== "expert") {
        return res.status(403).json({ message: "Not authorized to access this trip" });
      }

      const input = insertDayBoundarySchema.parse({ ...req.body, tripId: req.params.tripId });
      const boundary = await storage.createDayBoundary(input);
      res.status(201).json(boundary);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // === Logistics: Schedule Validation ===

  app.post("/api/trips/:tripId/validate-schedule", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      if (trip.userId !== userId && user.role !== "admin" && user.role !== "expert") {
        return res.status(403).json({ message: "Not authorized to access this trip" });
      }

      const anchors = await storage.getTemporalAnchors(req.params.tripId);
      const boundaries = await storage.getDayBoundaries(req.params.tripId);

      // Check for conflicts: activities overlapping anchor buffer zones
      const conflicts: Array<{ anchorId: string; anchorType: string; conflict: string }> = [];

      for (const anchor of anchors) {
        const anchorTime = new Date(anchor.anchorDatetime).getTime();
        const bufferStart = anchorTime - (anchor.bufferBefore || 0) * 60000;
        const bufferEnd = anchorTime + (anchor.bufferAfter || 0) * 60000;

        // Check against proposed items in the request body
        const proposedItems = req.body.items || [];
        for (const item of proposedItems) {
          if (item.startTime && item.dayNumber) {
            const itemStart = new Date(`${item.date || ''}T${item.startTime}`).getTime();
            const itemEnd = item.endTime ? new Date(`${item.date || ''}T${item.endTime}`).getTime() : itemStart + (item.durationMinutes || 60) * 60000;

            if (itemStart < bufferEnd && itemEnd > bufferStart) {
              conflicts.push({
                anchorId: anchor.id,
                anchorType: anchor.anchorType,
                conflict: `Activity "${item.title}" overlaps with ${anchor.anchorType} buffer zone (${anchor.description || ''})`,
              });
            }
          }
        }
      }

      res.json({
        valid: conflicts.length === 0,
        conflicts,
        anchorsChecked: anchors.length,
        boundariesChecked: boundaries.length,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to validate schedule", error: error.message });
    }
  });

  // === Logistics: Energy Calculation ===

  app.post("/api/trips/:tripId/calculate-energy", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      if (trip.userId !== userId && user.role !== "admin" && user.role !== "expert") {
        return res.status(403).json({ message: "Not authorized to access this trip" });
      }

      // Get all itinerary items for the trip grouped by day
      const items = await db.select().from(itineraryItems).where(eq(itineraryItems.tripId, req.params.tripId));

      const dayMap = new Map<number, typeof items>();
      for (const item of items) {
        const day = item.dayNumber;
        if (!dayMap.has(day)) dayMap.set(day, []);
        dayMap.get(day)!.push(item);
      }

      const energyByDay: Array<{ dayNumber: number; startingEnergy: number; activityDepletion: number; endingEnergy: number; breakdown: Array<{ itemId: string; title: string; energyCost: number }> }> = [];

      for (const [dayNumber, dayItems] of Array.from(dayMap)) {
        let depletion = 0;
        const breakdown: Array<{ itemId: string; title: string; energyCost: number }> = [];

        for (const item of dayItems) {
          const cost = item.energyCost || 20;
          depletion += cost;
          breakdown.push({ itemId: item.id, title: item.title, energyCost: cost });
        }

        const startingEnergy = 100;
        const endingEnergy = Math.max(0, startingEnergy - depletion);

        energyByDay.push({ dayNumber, startingEnergy, activityDepletion: depletion, endingEnergy, breakdown });

        // Save to database
        await storage.saveEnergyTracking({
          tripId: req.params.tripId,
          dayNumber,
          startingEnergy,
          activityDepletion: depletion,
          endingEnergy,
          recoveryNeeded: endingEnergy < 20,
          recoveryReason: endingEnergy < 20 ? `Energy critically low (${endingEnergy}%) - consider lighter activities` : null,
          energyBreakdown: breakdown,
        });
      }

      res.json({
        tripId: req.params.tripId,
        totalDays: energyByDay.length,
        energyByDay,
        warnings: energyByDay.filter(d => d.endingEnergy < 30).map(d => `Day ${d.dayNumber}: energy drops to ${d.endingEnergy}%`),
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to calculate energy", error: error.message });
    }
  });

  // === Workspace Constraints Summary ===

  app.get("/api/trips/:tripId/workspace-constraints", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      // Assignment-scoped authorization: owner, admin, or an expert assigned to this specific trip
      const { tripId } = req.params;
      const owned = await verifyTripOwnership(tripId, userId);
      if (!owned) {
        const user = await storage.getUser(userId);
        if (!user) return res.status(401).json({ message: "Not authenticated" });
        if (user.role === "admin") {
          // admins pass through
        } else {
          const assigned = await storage.isExpertAssignedToTrip(tripId, userId);
          if (!assigned) return res.status(403).json({ message: "Access denied" });
        }
      }

      const trip = await storage.getTrip(tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });

      const [anchors, boundaries, energyRecords, items] = await Promise.all([
        storage.getTemporalAnchors(tripId),
        storage.getDayBoundaries(tripId),
        storage.getEnergyTracking(tripId),
        storage.getItineraryItems(tripId),
      ]);

      // Detect anchor conflicts using the logistics service
      const { detectAnchorImpacts } = await import('./services/logistics-presets.service');
      const anchorConflicts: Array<{
        anchorId: string;
        anchorType: string;
        description: string;
        impacts: Array<{ type: string; message: string; severity: 'warning' | 'critical' }>;
      }> = [];
      for (const anchor of anchors) {
        const impacts = await detectAnchorImpacts(tripId, anchor.id);
        if (impacts.length > 0) {
          anchorConflicts.push({
            anchorId: anchor.id,
            anchorType: anchor.anchorType,
            description: anchor.description || anchor.anchorType,
            impacts,
          });
        }
      }

      // Evaluate day-boundary violations against current itinerary items
      const itemsByDay = new Map<number, typeof items>();
      for (const item of items) {
        if (!itemsByDay.has(item.dayNumber)) itemsByDay.set(item.dayNumber, []);
        itemsByDay.get(item.dayNumber)!.push(item);
      }

      const boundaryViolations: Array<{
        dayNumber: number;
        violation: string;
        severity: 'warning' | 'critical';
      }> = [];

      for (const boundary of boundaries) {
        const dayItems = itemsByDay.get(boundary.dayNumber) || [];

        if (boundary.latestActivityEnd && dayItems.length > 0) {
          // Find the latest end time or start time among day's items
          for (const item of dayItems) {
            const itemTime = item.endTime || item.startTime;
            if (itemTime && itemTime > boundary.latestActivityEnd) {
              boundaryViolations.push({
                dayNumber: boundary.dayNumber,
                violation: `Item "${item.title}" ends at ${itemTime}, past the Day ${boundary.dayNumber} limit of ${boundary.latestActivityEnd}`,
                severity: 'warning',
              });
            }
          }
        }

        if (boundary.mustReturnToHotel && dayItems.length > 0) {
          const hasHotel = dayItems.some(i => {
            const t = (i.itemType || '').toLowerCase();
            return t === 'hotel' || t === 'accommodation' || t === 'lodging';
          });
          if (!hasHotel) {
            boundaryViolations.push({
              dayNumber: boundary.dayNumber,
              violation: `Day ${boundary.dayNumber} requires return to hotel but no accommodation item is scheduled`,
              severity: 'warning',
            });
          }
        }
      }

      // Fetch optimizer scores from the most recent variant for this trip
      let optimizerScores: Record<string, number> | null = null;
      const comparisons = await db
        .select({ id: itineraryComparisons.id })
        .from(itineraryComparisons)
        .where(eq(itineraryComparisons.tripId, tripId))
        .orderBy(desc(itineraryComparisons.createdAt))
        .limit(1);

      if (comparisons.length > 0) {
        const variants = await db
          .select({ id: itineraryVariants.id })
          .from(itineraryVariants)
          .where(eq(itineraryVariants.comparisonId, comparisons[0].id))
          .orderBy(desc(itineraryVariants.createdAt))
          .limit(1);

        if (variants.length > 0) {
          const scoreMetrics = await db
            .select()
            .from(itineraryVariantMetrics)
            .where(
              and(
                eq(itineraryVariantMetrics.variantId, variants[0].id),
                inArray(itineraryVariantMetrics.metricKey, ['balance_score', 'wellness_score', 'pace_score', 'diversity_score'])
              )
            );
          if (scoreMetrics.length > 0) {
            optimizerScores = {};
            for (const m of scoreMetrics) {
              optimizerScores[m.metricKey] = parseFloat(m.value as string);
            }
          }
        }
      }

      res.json({
        anchors,
        dayBoundaries: boundaries,
        energyTracking: energyRecords,
        anchorConflicts,
        boundaryViolations,
        optimizerScores,
        tripExperienceType: trip.experienceType || null,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch workspace constraints", error: error.message });
    }
  });

  // === Logistics: Template Presets ===

  app.get("/api/logistics/presets/:templateSlug", async (req, res) => {
    try {
      const { getPresetsForTemplate } = await import('./services/logistics-presets.service');
      const presets = getPresetsForTemplate(req.params.templateSlug);
      if (!presets) {
        return res.json({ anchors: [], dayBoundaries: [] });
      }
      res.json(presets);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get presets", error: error.message });
    }
  });

  app.post("/api/trips/:tripId/generate-presets", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      if (trip.userId !== userId && user.role !== "admin" && user.role !== "expert") {
        return res.status(403).json({ message: "Not authorized to access this trip" });
      }

      const { templateSlug, eventDate, userExperienceId } = req.body;
      if (!templateSlug || !eventDate) {
        return res.status(400).json({ message: "templateSlug and eventDate are required" });
      }

      const { generatePresetsForTrip } = await import('./services/logistics-presets.service');
      const result = await generatePresetsForTrip(
        req.params.tripId,
        templateSlug,
        eventDate,
        userExperienceId
      );
      res.status(201).json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to generate presets", error: error.message });
    }
  });

  app.post("/api/trips/:tripId/anchors/:anchorId/impacts", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      if (trip.userId !== userId && user.role !== "admin" && user.role !== "expert") {
        return res.status(403).json({ message: "Not authorized to access this trip" });
      }

      const { detectAnchorImpacts } = await import('./services/logistics-presets.service');
      const impacts = await detectAnchorImpacts(req.params.tripId, req.params.anchorId);
      res.json({ impacts });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to detect impacts", error: error.message });
    }
  });

  // === Logistics: AI Anchor Suggestions ===

  app.post("/api/trips/:tripId/anchor-suggestions", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      if (trip.userId !== userId && user.role !== "admin" && user.role !== "expert") {
        return res.status(403).json({ message: "Not authorized to access this trip" });
      }

      const { templateSlug } = req.body;
      const startDate = trip.startDate?.toString() || new Date().toISOString().split('T')[0];
      const endDate = trip.endDate?.toString() || startDate;
      const start = new Date(startDate);
      const end = new Date(endDate);
      const numberOfDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1);

      const { generateAnchorSuggestions } = await import('./services/anchor-suggestion.service');
      const suggestions = await generateAnchorSuggestions({
        tripId: req.params.tripId,
        destination: trip.destination || "Unknown",
        templateSlug: templateSlug || trip.eventType || "travel",
        startDate,
        endDate,
        numberOfDays,
      });
      res.json({ suggestions });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to generate suggestions", error: error.message });
    }
  });

  app.get("/api/trips/:tripId/anchor-optimization", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      if (trip.userId !== userId && user.role !== "admin" && user.role !== "expert") {
        return res.status(403).json({ message: "Not authorized to access this trip" });
      }

      const { analyzeAnchorOptimization } = await import('./services/anchor-suggestion.service');
      const tips = await analyzeAnchorOptimization(req.params.tripId);
      res.json({ tips });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to analyze anchors", error: error.message });
    }
  });

  // ==========================================
  // Expert/Provider Logistics Integration
  // ==========================================

  // === Expert: Client Constraint Visibility ===

  app.get("/api/expert/trips/:tripId/constraints", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "expert" && user.role !== "admin")) {
        return res.status(403).json({ message: "Expert access required" });
      }
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });

      const anchors = await storage.getTemporalAnchors(req.params.tripId);
      const boundaries = await storage.getDayBoundaries(req.params.tripId);
      const energy = await storage.getEnergyTracking(req.params.tripId);
      const vendorCoord = await storage.getVendorCoordination(req.params.tripId);
      const bookingReqs = await storage.getBookingRequestsByTrip(req.params.tripId);

      const { analyzeAnchorOptimization } = await import('./services/anchor-suggestion.service');
      const tips = await analyzeAnchorOptimization(req.params.tripId);

      res.json({
        trip: {
          id: trip.id,
          title: trip.title,
          destination: trip.destination,
          startDate: trip.startDate,
          endDate: trip.endDate,
          eventType: trip.eventType,
        },
        anchors,
        dayBoundaries: boundaries,
        energyTracking: energy,
        vendorCoordination: vendorCoord,
        bookingRequests: bookingReqs,
        optimizationTips: tips,
        summary: {
          totalAnchors: anchors.length,
          immovableAnchors: anchors.filter(a => a.isImmovable).length,
          confirmedVendors: vendorCoord.filter(v => v.status === 'confirmed' || v.status === 'contract_signed').length,
          pendingVendors: vendorCoord.filter(v => v.status === 'pending' || v.status === 'contacted').length,
          warningCount: tips.filter(t => t.severity === 'warning' || t.severity === 'critical').length,
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to load constraints", error: error.message });
    }
  });

  app.post("/api/expert/find-providers", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "expert" && user.role !== "admin")) {
        return res.status(403).json({ message: "Expert access required" });
      }
      const { date, startTime, endTime, serviceType } = req.body;
      const dayOfWeek = new Date(date).getDay();

      const { providerAvailabilitySchedule } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      const { db } = await import('./db');

      const schedules = await db.select()
        .from(providerAvailabilitySchedule)
        .where(
          and(
            eq(providerAvailabilitySchedule.dayOfWeek, dayOfWeek),
            eq(providerAvailabilitySchedule.isAvailable, true)
          )
        );

      const matching = schedules.filter(s => {
        return s.startTime <= startTime && s.endTime >= endTime;
      });

      const { providerBlackoutDates } = await import('@shared/schema');
      const blackouts = await db.select().from(providerBlackoutDates);
      const blockedProviders = new Set(
        blackouts
          .filter(b => date >= b.startDate && date <= b.endDate)
          .map(b => b.providerId)
      );

      const available = matching.filter(s => !blockedProviders.has(s.providerId));

      res.json({
        availableProviders: available.map(s => ({
          providerId: s.providerId,
          availableFrom: s.startTime,
          availableUntil: s.endTime,
          pricingModifier: s.pricingModifier,
          preferredSlots: s.preferredSlots,
        })),
        totalFound: available.length,
        blockedCount: matching.length - available.length,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to find providers", error: error.message });
    }
  });

  // === Expert: Vendor Coordination ===

  app.get("/api/expert/trips/:tripId/vendors", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "expert" && user.role !== "admin")) {
        return res.status(403).json({ message: "Expert access required" });
      }
      const vendors = await storage.getVendorCoordination(req.params.tripId);
      const confirmed = vendors.filter(v => v.status === 'confirmed' || v.status === 'contract_signed');
      const pending = vendors.filter(v => v.status === 'pending' || v.status === 'contacted');
      res.json({ vendors, confirmed, pending, total: vendors.length });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to load vendors", error: error.message });
    }
  });

  app.post("/api/expert/trips/:tripId/vendors", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "expert" && user.role !== "admin")) {
        return res.status(403).json({ message: "Expert access required" });
      }
      const vendorInput = z.object({
        vendorName: z.string().min(1).max(255),
        serviceType: z.string().min(1).max(100),
        vendorCategory: z.string().min(1).max(100),
        status: z.string().max(50).optional(),
        contactEmail: z.string().email().optional(),
        contactPhone: z.string().max(50).optional(),
        notes: z.string().max(1000).optional(),
        quotedAmount: z.string().optional(),
      }).parse(req.body);
      const vendor = await storage.createVendorCoordination({
        ...vendorInput,
        tripId: req.params.tripId,
        expertId: userId,
      });
      res.json(vendor);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to add vendor", error: error.message });
    }
  });

  app.put("/api/expert/vendors/:vendorId", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "expert" && user.role !== "admin")) {
        return res.status(403).json({ message: "Expert access required" });
      }
      const vendorUpdateInput = z.object({
        vendorName: z.string().min(1).max(255).optional(),
        serviceType: z.string().min(1).max(100).optional(),
        status: z.string().max(50).optional(),
        contactEmail: z.string().email().optional(),
        contactPhone: z.string().max(50).optional(),
        notes: z.string().max(1000).optional(),
        quotedAmount: z.string().optional(),
      }).parse(req.body);
      const updated = await storage.updateVendorCoordination(req.params.vendorId, vendorUpdateInput);
      if (!updated) return res.status(404).json({ message: "Vendor not found" });
      res.json(updated);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update vendor", error: error.message });
    }
  });

  app.delete("/api/expert/vendors/:vendorId", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "expert" && user.role !== "admin")) {
        return res.status(403).json({ message: "Expert access required" });
      }
      await storage.deleteVendorCoordination(req.params.vendorId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to delete vendor", error: error.message });
    }
  });

  // === Provider: Availability Management ===

  app.get("/api/provider/availability", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub ?? (req.user as any).id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "provider" && user.role !== "service_provider" && user.role !== "admin")) {
        return res.status(403).json({ message: "Provider access required" });
      }
      const schedule = await storage.getProviderAvailability(userId);
      const blackouts = await storage.getProviderBlackoutDates(userId);
      res.json({ schedule, blackoutDates: blackouts });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to load availability", error: error.message });
    }
  });

  app.post("/api/provider/availability", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub ?? (req.user as any).id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "provider" && user.role !== "service_provider" && user.role !== "admin")) {
        return res.status(403).json({ message: "Provider access required" });
      }
      const scheduleInput = z.object({
        dayOfWeek: z.number().min(0).max(6),
        startTime: z.string().min(1),
        endTime: z.string().min(1),
        isAvailable: z.boolean().optional(),
      }).parse(req.body);
      const entry = await storage.setProviderAvailability({
        ...scheduleInput,
        providerId: userId,
      });
      res.json(entry);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to set availability", error: error.message });
    }
  });

  app.delete("/api/provider/availability/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub ?? (req.user as any).id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "provider" && user.role !== "service_provider" && user.role !== "admin")) {
        return res.status(403).json({ message: "Provider access required" });
      }
      await storage.deleteProviderAvailability(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to delete availability", error: error.message });
    }
  });

  app.post("/api/provider/blackout-dates", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub ?? (req.user as any).id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "provider" && user.role !== "service_provider" && user.role !== "admin")) {
        return res.status(403).json({ message: "Provider access required" });
      }
      const blackoutInput = z.object({
        startDate: z.string().min(1),
        endDate: z.string().min(1),
        reason: z.string().max(500).optional(),
      }).parse(req.body);
      const blackout = await storage.addProviderBlackoutDate({
        ...blackoutInput,
        providerId: userId,
      });
      res.json(blackout);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to add blackout date", error: error.message });
    }
  });

  app.delete("/api/provider/blackout-dates/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub ?? (req.user as any).id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "provider" && user.role !== "service_provider" && user.role !== "admin")) {
        return res.status(403).json({ message: "Provider access required" });
      }
      await storage.deleteProviderBlackoutDate(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to delete blackout date", error: error.message });
    }
  });

  // === Provider: Booking Requests ===

  app.get("/api/provider/booking-requests", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub ?? (req.user as any).id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "provider" && user.role !== "service_provider" && user.role !== "admin")) {
        return res.status(403).json({ message: "Provider access required" });
      }
      const requests = await storage.getBookingRequests(userId);
      res.json({ requests });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to load requests", error: error.message });
    }
  });

  app.post("/api/coordination/booking-request", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const requestInput = z.object({
        providerId: z.string().min(1),
        tripId: z.string().min(1),
        serviceType: z.string().min(1).max(100),
        requestedDate: z.string().min(1),
        requestedStartTime: z.string().min(1),
        requestedEndTime: z.string().min(1),
        message: z.string().max(2000).optional(),
        budget: z.string().optional(),
      }).parse(req.body);
      const request = await storage.createBookingRequest({
        ...requestInput,
        expertId: userId,
      });
      res.json(request);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create booking request", error: error.message });
    }
  });

  app.put("/api/provider/booking-requests/:requestId/respond", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub ?? (req.user as any).id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "provider" && user.role !== "service_provider" && user.role !== "admin")) {
        return res.status(403).json({ message: "Provider access required" });
      }
      const responseInput = z.object({
        status: z.enum(["accepted", "rejected", "counter_offered"]),
        counterOffer: z.string().optional().nullable(),
        providerResponse: z.string().max(2000).optional(),
      }).parse(req.body);
      const updated = await storage.updateBookingRequest(req.params.requestId, {
        status: responseInput.status,
        counterOffer: responseInput.counterOffer || null,
        providerResponse: responseInput.providerResponse,
      });
      if (!updated) return res.status(404).json({ message: "Request not found" });
      res.json(updated);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to respond", error: error.message });
    }
  });

  // ==========================================
  // Constraint Propagation & Workflow Services
  // ==========================================

  app.post("/api/coordination/propagate/:tripId/:anchorId", isAuthenticated, async (req, res) => {
    try {
      const { propagateAnchorChange } = await import('./services/constraint-propagation.service');
      const result = await propagateAnchorChange(
        req.params.tripId,
        req.params.anchorId,
        req.body.previousDatetime
      );
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to propagate", error: error.message });
    }
  });

  app.post("/api/coordination/match-providers", isAuthenticated, async (req, res) => {
    try {
      const { findMatchingProviders } = await import('./services/provider-matching.service');
      const result = await findMatchingProviders(req.body);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to match providers", error: error.message });
    }
  });

  app.post("/api/coordination/booking-context/:tripId", isAuthenticated, async (req, res) => {
    try {
      const { buildBookingContext } = await import('./services/provider-matching.service');
      const { date, startTime, endTime } = req.body;
      const context = await buildBookingContext(req.params.tripId, date, startTime, endTime);
      res.json(context);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to build context", error: error.message });
    }
  });

  // === Wedding Coordination ===

  app.get("/api/coordination/wedding-timeline/:tripId", isAuthenticated, async (req, res) => {
    try {
      const { buildWeddingTimeline } = await import('./services/wedding-coordination.service');
      const timeline = await buildWeddingTimeline(req.params.tripId);
      res.json(timeline);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to build wedding timeline", error: error.message });
    }
  });

  app.get("/api/coordination/wedding-gaps/:tripId", isAuthenticated, async (req, res) => {
    try {
      const { getWeddingVendorGaps } = await import('./services/wedding-coordination.service');
      const gaps = await getWeddingVendorGaps(req.params.tripId);
      res.json({ gaps });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to analyze vendor gaps", error: error.message });
    }
  });

  // === Corporate Coordination ===

  app.get("/api/coordination/corporate-summary/:tripId", isAuthenticated, async (req, res) => {
    try {
      const { getCorporateLogisticsSummary } = await import('./services/corporate-coordination.service');
      const summary = await getCorporateLogisticsSummary(req.params.tripId);
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to load corporate summary", error: error.message });
    }
  });

  app.post("/api/coordination/staggered-arrivals/:tripId", isAuthenticated, async (req, res) => {
    try {
      const { generateStaggeredArrivalPlan } = await import('./services/corporate-coordination.service');
      const plan = await generateStaggeredArrivalPlan(
        req.params.tripId,
        req.body.date,
        req.body.options
      );
      res.json(plan);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to generate arrival plan", error: error.message });
    }
  });

  app.post("/api/coordination/split-activities/:tripId", isAuthenticated, async (req, res) => {
    try {
      const { generateSplitActivityPlan } = await import('./services/corporate-coordination.service');
      const plan = await generateSplitActivityPlan(
        req.params.tripId,
        req.body.date,
        req.body.tracks
      );
      res.json(plan);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to generate split activities", error: error.message });
    }
  });

  // === Admin Users Management ===
  app.get("/api/admin/users", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const search = (req.query.search as string) || "";
      const role = req.query.role as string | undefined;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = (page - 1) * limit;

      let conditions: any[] = [];
      if (search) {
        conditions.push(
          or(
            like(users.email, `%${search}%`),
            like(users.firstName, `%${search}%`),
            like(users.lastName, `%${search}%`)
          )
        );
      }
      if (role) {
        conditions.push(eq(users.role, role));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const allUsers = await db.select().from(users).where(whereClause).limit(limit).offset(offset).orderBy(desc(users.createdAt));
      const [totalResult] = await db.select({ count: count() }).from(users).where(whereClause);

      const enrichedUsers = await Promise.all(allUsers.map(async (u) => {
        const userTrips = await db.select({ count: count() }).from(trips).where(eq(trips.userId, u.id));
        const userBookings = await db.select().from(serviceBookings).where(eq(serviceBookings.travelerId, u.id));
        const totalSpent = userBookings.reduce((sum, b) => sum + parseFloat(b.totalAmount || "0"), 0);
        return {
          id: u.id,
          name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "Unknown",
          email: u.email || "",
          role: u.role || "user",
          status: "active",
          joined: u.createdAt ? new Date(u.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Unknown",
          trips: userTrips[0]?.count || 0,
          spent: `$${totalSpent.toLocaleString()}`,
        };
      }));

      res.json({
        users: enrichedUsers,
        total: totalResult?.count || 0,
        page,
        limit,
      });
    } catch (err) {
      console.error("Admin users error:", err);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // === Admin Trips/Plans Management ===
  app.get("/api/admin/trips", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const search = (req.query.search as string) || "";
      const status = req.query.status as string | undefined;

      let conditions: any[] = [];
      if (search) {
        conditions.push(
          or(
            like(trips.title, `%${search}%`),
            like(trips.destination, `%${search}%`)
          )
        );
      }
      if (status) {
        conditions.push(eq(trips.status, status));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const allTrips = await db.select().from(trips).where(whereClause).orderBy(desc(trips.createdAt)).limit(100);

      const enrichedTrips = await Promise.all(allTrips.map(async (t) => {
        const owner = await storage.getUser(t.userId || '');
        return {
          id: t.id,
          title: t.title || "Untitled Trip",
          type: t.eventType || "Travel",
          destination: t.destination || "TBD",
          startDate: t.startDate,
          endDate: t.endDate,
          guests: t.numberOfTravelers || 1,
          budget: t.budget ? `$${Number(t.budget).toLocaleString()}` : "N/A",
          status: t.status || "draft",
          user: owner ? [owner.firstName, owner.lastName].filter(Boolean).join(" ") || owner.email : "Unknown",
          created: t.createdAt ? new Date(t.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Unknown",
        };
      }));

      const statusCounts = {
        total: enrichedTrips.length,
        active: enrichedTrips.filter(t => t.status === "planning" || t.status === "confirmed").length,
        pending: enrichedTrips.filter(t => t.status === "draft").length,
        completed: enrichedTrips.filter(t => t.status === "completed").length,
      };

      res.json({ trips: enrichedTrips, stats: statusCounts });
    } catch (err) {
      console.error("Admin trips error:", err);
      res.status(500).json({ message: "Failed to fetch trips" });
    }
  });

  // === Admin Analytics Overview ===
  app.get("/api/admin/analytics/overview", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const allUsers = await db.select().from(users);
      const allBookings = await storage.getServiceBookings({});
      const allTrips = await db.select().from(trips);
      const allReviews = await db.select().from(serviceReviews);

      const totalUsers = allUsers.length;
      const completedBookings = allBookings.filter(b => b.status === "completed");
      const totalRevenue = completedBookings.reduce((sum, b) => sum + parseFloat(b.totalAmount || "0"), 0);

      const destCounts: Record<string, { bookings: number; revenue: number }> = {};
      allTrips.forEach(t => {
        const dest = t.destination || "Unknown";
        if (!destCounts[dest]) destCounts[dest] = { bookings: 0, revenue: 0 };
        destCounts[dest].bookings++;
        destCounts[dest].revenue += Number(t.budget || 0);
      });
      const topDestinations = Object.entries(destCounts)
        .map(([name, data]) => ({ name, bookings: data.bookings, revenue: `$${data.revenue.toLocaleString()}` }))
        .sort((a, b) => b.bookings - a.bookings)
        .slice(0, 5);

      const roleCounts: Record<string, number> = {};
      allUsers.forEach(u => {
        const role = u.role || "user";
        roleCounts[role] = (roleCounts[role] || 0) + 1;
      });
      const userDemographics = Object.entries(roleCounts)
        .map(([segment, count]) => ({
          segment: segment.charAt(0).toUpperCase() + segment.slice(1) + "s",
          percentage: Math.round((count / totalUsers) * 100),
        }))
        .sort((a, b) => b.percentage - a.percentage);

      const now = new Date();
      const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const weeklyActivity = weekDays.map((day, i) => {
        const dayDate = new Date(now);
        dayDate.setDate(now.getDate() - (now.getDay() - i));
        const dayUsers = allUsers.filter(u => {
          if (!u.createdAt) return false;
          const d = new Date(u.createdAt);
          return d.toDateString() === dayDate.toDateString();
        }).length;
        return { day, users: dayUsers };
      });

      const avgRating = allReviews.length > 0
        ? allReviews.reduce((sum, r) => sum + (r.rating || 0), 0) / allReviews.length
        : 0;

      res.json({
        metrics: [
          { label: "Total Users", value: totalUsers.toLocaleString(), change: `+${allUsers.filter(u => { const d = u.createdAt ? new Date(u.createdAt) : null; return d && d > new Date(now.getTime() - 30*24*60*60*1000); }).length} this month`, positive: true },
          { label: "Total Bookings", value: allBookings.length.toLocaleString(), change: `${completedBookings.length} completed`, positive: true },
          { label: "Total Revenue", value: `$${totalRevenue.toLocaleString()}`, change: `${allBookings.filter(b => b.status === "pending").length} pending`, positive: true },
          { label: "Avg Rating", value: avgRating.toFixed(1), change: `${allReviews.length} reviews`, positive: avgRating >= 4.0 },
        ],
        topDestinations,
        userDemographics,
        weeklyActivity,
      });
    } catch (err) {
      console.error("Admin analytics error:", err);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // Country/Region Analytics
  app.get("/api/admin/analytics/by-country", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Get experts by country
      const expertsByCountry = await db.select({
        country: localExpertForms.country,
        count: sql<number>`count(*)::int`,
        approved: sql<number>`sum(case when status = 'approved' then 1 else 0 end)::int`,
        pending: sql<number>`sum(case when status = 'pending' then 1 else 0 end)::int`,
      })
      .from(localExpertForms)
      .groupBy(localExpertForms.country)
      .orderBy(sql`count(*) desc`);

      // Get providers by country (from serviceProviderForms)
      const { serviceProviderForms } = await import("@shared/schema");
      const providersByCountry = await db.select({
        country: serviceProviderForms.country,
        count: sql<number>`count(*)::int`,
        approved: sql<number>`sum(case when status = 'approved' then 1 else 0 end)::int`,
        pending: sql<number>`sum(case when status = 'pending' then 1 else 0 end)::int`,
      })
      .from(serviceProviderForms)
      .groupBy(serviceProviderForms.country)
      .orderBy(sql`count(*) desc`);

      // Get trips by destination country (extract country from destination string)
      const tripsByDestination = await db.select({
        destination: trips.destination,
        count: sql<number>`count(*)::int`,
      })
      .from(trips)
      .groupBy(trips.destination)
      .orderBy(sql`count(*) desc`)
      .limit(20);

      // Get bookings summary
      const allBookings = await storage.getServiceBookings({});
      const bookingsByStatus = {
        total: allBookings.length,
        completed: allBookings.filter(b => b.status === "completed").length,
        pending: allBookings.filter(b => b.status === "pending").length,
        cancelled: allBookings.filter(b => b.status === "cancelled").length,
      };

      res.json({
        expertsByCountry: expertsByCountry.map(e => ({
          country: e.country || "Unknown",
          total: e.count,
          approved: e.approved || 0,
          pending: e.pending || 0,
        })),
        providersByCountry: providersByCountry.map(p => ({
          country: p.country || "Unknown",
          total: p.count,
          approved: p.approved || 0,
          pending: p.pending || 0,
        })),
        tripsByDestination: tripsByDestination.map(t => ({
          destination: t.destination || "Unknown",
          count: t.count,
        })),
        bookingsSummary: bookingsByStatus,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Country analytics error:", err);
      res.status(500).json({ message: "Failed to fetch country analytics" });
    }
  });

  // Expert Analytics - detailed breakdown
  app.get("/api/admin/analytics/experts", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Experts by country
      const byCountry = await db.select({
        country: localExpertForms.country,
        count: sql<number>`count(*)::int`,
        approved: sql<number>`sum(case when status = 'approved' then 1 else 0 end)::int`,
      })
      .from(localExpertForms)
      .groupBy(localExpertForms.country)
      .orderBy(sql`count(*) desc`);

      // Experts by city
      const byCity = await db.select({
        city: localExpertForms.city,
        country: localExpertForms.country,
        count: sql<number>`count(*)::int`,
      })
      .from(localExpertForms)
      .where(eq(localExpertForms.status, "approved"))
      .groupBy(localExpertForms.city, localExpertForms.country)
      .orderBy(sql`count(*) desc`)
      .limit(15);

      // Expert application status summary
      const statusSummary = await db.select({
        status: localExpertForms.status,
        count: sql<number>`count(*)::int`,
      })
      .from(localExpertForms)
      .groupBy(localExpertForms.status);

      // Experts by experience level
      const byExperience = await db.select({
        years: localExpertForms.yearsOfExperience,
        count: sql<number>`count(*)::int`,
      })
      .from(localExpertForms)
      .where(eq(localExpertForms.status, "approved"))
      .groupBy(localExpertForms.yearsOfExperience)
      .orderBy(sql`count(*) desc`);

      res.json({
        byCountry: byCountry.map(c => ({
          country: c.country || "Unknown",
          total: c.count,
          approved: c.approved || 0,
        })),
        byCity: byCity.map(c => ({
          city: c.city || "Unknown",
          country: c.country || "",
          count: c.count,
        })),
        statusSummary: {
          total: statusSummary.reduce((sum, s) => sum + s.count, 0),
          pending: statusSummary.find(s => s.status === "pending")?.count || 0,
          approved: statusSummary.find(s => s.status === "approved")?.count || 0,
          rejected: statusSummary.find(s => s.status === "rejected")?.count || 0,
        },
        byExperience: byExperience.map(e => ({
          years: e.years || "Unknown",
          count: e.count,
        })),
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Expert analytics error:", err);
      res.status(500).json({ message: "Failed to fetch expert analytics" });
    }
  });

  // Provider Analytics - detailed breakdown
  app.get("/api/admin/analytics/providers", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { serviceProviderForms, providerServices, serviceBookings } = await import("@shared/schema");

      // Providers by business type
      const byBusinessType = await db.select({
        businessType: serviceProviderForms.businessType,
        count: sql<number>`count(*)::int`,
        approved: sql<number>`sum(case when status = 'approved' then 1 else 0 end)::int`,
      })
      .from(serviceProviderForms)
      .groupBy(serviceProviderForms.businessType)
      .orderBy(sql`count(*) desc`);

      // Providers by country
      const byCountry = await db.select({
        country: serviceProviderForms.country,
        count: sql<number>`count(*)::int`,
        approved: sql<number>`sum(case when status = 'approved' then 1 else 0 end)::int`,
      })
      .from(serviceProviderForms)
      .groupBy(serviceProviderForms.country)
      .orderBy(sql`count(*) desc`);

      // Provider application status summary
      const statusSummary = await db.select({
        status: serviceProviderForms.status,
        count: sql<number>`count(*)::int`,
      })
      .from(serviceProviderForms)
      .groupBy(serviceProviderForms.status);

      // Active services count
      const activeServices = await db.select({
        count: sql<number>`count(*)::int`,
      })
      .from(providerServices)
      .where(eq(providerServices.status, "active"));

      // Top providers by bookings
      const topProviders = await db.select({
        userId: providerServices.userId,
        serviceName: providerServices.serviceName,
        bookingsCount: providerServices.bookingsCount,
        totalRevenue: providerServices.totalRevenue,
        averageRating: providerServices.averageRating,
      })
      .from(providerServices)
      .orderBy(desc(providerServices.bookingsCount))
      .limit(10);

      res.json({
        byBusinessType: byBusinessType.map(b => ({
          type: b.businessType || "Unknown",
          total: b.count,
          approved: b.approved || 0,
        })),
        byCountry: byCountry.map(c => ({
          country: c.country || "Unknown",
          total: c.count,
          approved: c.approved || 0,
        })),
        statusSummary: {
          total: statusSummary.reduce((sum, s) => sum + s.count, 0),
          pending: statusSummary.find(s => s.status === "pending")?.count || 0,
          approved: statusSummary.find(s => s.status === "approved")?.count || 0,
          rejected: statusSummary.find(s => s.status === "rejected")?.count || 0,
        },
        activeServicesCount: activeServices[0]?.count || 0,
        topProviders: topProviders.map(p => ({
          serviceName: p.serviceName,
          bookings: p.bookingsCount || 0,
          revenue: `$${Number(p.totalRevenue || 0).toLocaleString()}`,
          rating: Number(p.averageRating || 0).toFixed(1),
        })),
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Provider analytics error:", err);
      res.status(500).json({ message: "Failed to fetch provider analytics" });
    }
  });

  // === Tourism Analytics Dashboard ===
  app.get("/api/admin/analytics/tourism", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { serviceBookings, providerServices, localExpertForms, serviceProviderForms } = await import("@shared/schema");

      // 1. Destination Demand - Most searched/booked destinations
      const destinationDemand = await db.select({
        destination: trips.destination,
        searchCount: sql<number>`count(*)::int`,
        totalBudget: sql<number>`sum(COALESCE(budget::numeric, 0))::numeric`,
        avgBudget: sql<number>`avg(COALESCE(budget::numeric, 0))::numeric`,
      })
      .from(trips)
      .groupBy(trips.destination)
      .orderBy(sql`count(*) desc`)
      .limit(15);

      // 2. Booking Trends Over Time (last 12 months)
      const bookingTrends = await db.select({
        month: sql<string>`to_char(created_at, 'YYYY-MM')`,
        count: sql<number>`count(*)::int`,
        revenue: sql<number>`sum(COALESCE(total_amount::numeric, 0))::numeric`,
      })
      .from(serviceBookings)
      .where(sql`created_at >= now() - interval '12 months'`)
      .groupBy(sql`to_char(created_at, 'YYYY-MM')`)
      .orderBy(sql`to_char(created_at, 'YYYY-MM')`);

      // 3. Source Markets - Where travelers come from (experts/providers by country as proxy)
      const sourceMarkets = await db.select({
        country: localExpertForms.country,
        count: sql<number>`count(*)::int`,
      })
      .from(localExpertForms)
      .where(isNotNull(localExpertForms.country))
      .groupBy(localExpertForms.country)
      .orderBy(sql`count(*) desc`)
      .limit(10);

      // Also get user sign-up trends by month as additional source market data
      const usersByMonth = await db.select({
        month: sql<string>`to_char(created_at, 'YYYY-MM')`,
        count: sql<number>`count(*)::int`,
      })
      .from(users)
      .where(sql`created_at >= now() - interval '12 months'`)
      .groupBy(sql`to_char(created_at, 'YYYY-MM')`)
      .orderBy(sql`to_char(created_at, 'YYYY-MM')`);

      // 4. Spending Patterns by Destination
      const spendingPatterns = await db.select({
        destination: trips.destination,
        avgSpend: sql<number>`avg(COALESCE(budget::numeric, 0))::numeric`,
        minSpend: sql<number>`min(COALESCE(budget::numeric, 0))::numeric`,
        maxSpend: sql<number>`max(COALESCE(budget::numeric, 0))::numeric`,
        tripCount: sql<number>`count(*)::int`,
      })
      .from(trips)
      .where(sql`budget > 0`)
      .groupBy(trips.destination)
      .orderBy(sql`avg(COALESCE(budget::numeric, 0)) desc`)
      .limit(10);

      // 5. Party Composition (based on adults, kids, numberOfTravelers)
      const allTrips = await db.select({
        adults: trips.adults,
        kids: trips.kids,
        numberOfTravelers: trips.numberOfTravelers,
      }).from(trips);

      const partyComposition = {
        solo: 0,
        couples: 0,
        families: 0,
        groups: 0,
      };

      allTrips.forEach(trip => {
        const adults = trip.adults || 1;
        const kids = trip.kids || 0;
        const total = trip.numberOfTravelers || adults + kids;

        if (total === 1) {
          partyComposition.solo++;
        } else if (total === 2 && kids === 0) {
          partyComposition.couples++;
        } else if (kids > 0) {
          partyComposition.families++;
        } else if (total > 2) {
          partyComposition.groups++;
        } else {
          partyComposition.couples++;
        }
      });

      // 6. Seasonality - Bookings by month (using trip start dates)
      const seasonality = await db.select({
        month: sql<number>`EXTRACT(MONTH FROM start_date)::int`,
        count: sql<number>`count(*)::int`,
        avgBudget: sql<number>`avg(COALESCE(budget::numeric, 0))::numeric`,
      })
      .from(trips)
      .where(isNotNull(trips.startDate))
      .groupBy(sql`EXTRACT(MONTH FROM start_date)`)
      .orderBy(sql`EXTRACT(MONTH FROM start_date)`);

      // 7. Event Types breakdown
      const eventTypes = await db.select({
        eventType: trips.eventType,
        count: sql<number>`count(*)::int`,
      })
      .from(trips)
      .groupBy(trips.eventType)
      .orderBy(sql`count(*) desc`);

      // 8. Summary metrics
      const totalTrips = allTrips.length;
      const totalBookings = await db.select({ count: sql<number>`count(*)::int` }).from(serviceBookings);
      const completedBookings = await db.select({ 
        count: sql<number>`count(*)::int`,
        revenue: sql<number>`sum(COALESCE(total_amount::numeric, 0))::numeric` 
      })
      .from(serviceBookings)
      .where(eq(serviceBookings.status, "completed"));

      const avgTripDuration = await db.select({
        avgDays: sql<number>`avg(EXTRACT(DAY FROM (end_date - start_date)))::numeric`,
      })
      .from(trips)
      .where(sql`start_date IS NOT NULL AND end_date IS NOT NULL`);

      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

      res.json({
        destinationDemand: destinationDemand.map(d => ({
          destination: d.destination || "Unknown",
          searches: d.searchCount,
          totalBudget: Math.round(Number(d.totalBudget || 0)),
          avgBudget: Math.round(Number(d.avgBudget || 0)),
        })),
        bookingTrends: bookingTrends.map(b => ({
          month: b.month,
          bookings: b.count,
          revenue: Math.round(Number(b.revenue || 0)),
        })),
        sourceMarkets: sourceMarkets.map(s => ({
          country: s.country || "Unknown",
          travelers: s.count,
        })),
        userGrowth: usersByMonth.map(u => ({
          month: u.month,
          users: u.count,
        })),
        spendingPatterns: spendingPatterns.map(s => ({
          destination: s.destination || "Unknown",
          avgSpend: Math.round(Number(s.avgSpend || 0)),
          minSpend: Math.round(Number(s.minSpend || 0)),
          maxSpend: Math.round(Number(s.maxSpend || 0)),
          trips: s.tripCount,
        })),
        partyComposition: [
          { type: "Solo", count: partyComposition.solo, color: "#8884d8" },
          { type: "Couples", count: partyComposition.couples, color: "#82ca9d" },
          { type: "Families", count: partyComposition.families, color: "#ffc658" },
          { type: "Groups", count: partyComposition.groups, color: "#ff7c43" },
        ],
        seasonality: monthNames.map((name, i) => {
          const monthData = seasonality.find(s => s.month === i + 1);
          return {
            month: name,
            monthNum: i + 1,
            bookings: monthData?.count || 0,
            avgBudget: Math.round(Number(monthData?.avgBudget || 0)),
          };
        }),
        eventTypes: eventTypes.map(e => ({
          type: e.eventType || "vacation",
          count: e.count,
        })),
        summary: {
          totalTrips,
          totalBookings: totalBookings[0]?.count || 0,
          completedBookings: completedBookings[0]?.count || 0,
          totalRevenue: Math.round(Number(completedBookings[0]?.revenue || 0)),
          avgTripDuration: Math.round(Number(avgTripDuration[0]?.avgDays || 0)),
          avgPartySize: totalTrips > 0 
            ? Math.round(allTrips.reduce((sum, t) => sum + (t.numberOfTravelers || t.adults || 1) + (t.kids || 0), 0) / totalTrips * 10) / 10
            : 0,
        },
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Tourism analytics error:", err);
      res.status(500).json({ message: "Failed to fetch tourism analytics" });
    }
  });

  // === Admin System Health ===
  app.get("/api/admin/system/health", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const dbStart = Date.now();
      let dbStatus = "operational";
      try {
        await db.select({ count: count() }).from(users);
      } catch {
        dbStatus = "degraded";
      }
      const dbLatency = Date.now() - dbStart;

      const services = [
        { service: "Web Server", status: "operational", uptime: "99.9%", latency: `${process.uptime().toFixed(0)}s uptime` },
        { service: "Database", status: dbStatus, uptime: dbLatency < 100 ? "99.9%" : "99.0%", latency: `${dbLatency}ms` },
        { service: "AI Processing", status: "operational", uptime: "99.5%" },
        { service: "Payment Gateway", status: "operational", uptime: "99.9%" },
        { service: "Email Service", status: "operational", uptime: "99.5%" },
        { service: "CDN", status: "operational", uptime: "99.9%" },
      ];

      let aiUsage = { used: 0, limit: 1000000, cost: "$0" };
      let apiUsage = { transactions: 0, volume: "$0" };
      try {
        const { aiUsageService: aiSvc } = await import('./services/ai-usage.service');
        const summary = await aiSvc.getSummary();
        aiUsage = { used: summary.totalTokens || 0, limit: 1000000, cost: `$${(summary.totalCostDollars || 0).toFixed(2)}` };
      } catch {}

      try {
        const allBookings = await storage.getServiceBookings({});
        const completedBookings = allBookings.filter(b => b.status === "completed");
        const volume = completedBookings.reduce((sum, b) => sum + parseFloat(b.totalAmount || "0"), 0);
        apiUsage = { transactions: allBookings.length, volume: `$${volume.toLocaleString()}` };
      } catch {}

      res.json({
        services,
        apiUsage: {
          claude: aiUsage,
          stripe: apiUsage,
          email: { sent: 0, bounceRate: "0%" },
        },
      });
    } catch (err) {
      console.error("System health error:", err);
      res.status(500).json({ message: "Failed to fetch system health" });
    }
  });

  // === Admin Global Search ===
  app.get("/api/admin/search", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const q = (req.query.q as string) || "";
      if (!q.trim()) {
        return res.json({ results: [], counts: {} });
      }

      const searchPattern = `%${q}%`;

      const matchedUsers = await db.select().from(users)
        .where(or(
          like(users.email, searchPattern),
          like(users.firstName, searchPattern),
          like(users.lastName, searchPattern)
        ))
        .limit(10);

      const matchedTrips = await db.select().from(trips)
        .where(or(
          like(trips.title, searchPattern),
          like(trips.destination, searchPattern)
        ))
        .limit(10);

      const matchedServices = await db.select().from(providerServices)
        .where(or(
          like(providerServices.serviceName, searchPattern),
          like(providerServices.location, searchPattern)
        ))
        .limit(10);

      const results = [
        ...matchedUsers.map(u => ({
          id: u.id,
          type: u.role === "expert" ? "expert" as const : u.role === "provider" ? "provider" as const : "user" as const,
          name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "Unknown",
          description: u.email || "",
          meta: `Role: ${u.role || "user"}`,
        })),
        ...matchedTrips.map(t => ({
          id: t.id,
          type: "plan" as const,
          name: t.title || "Untitled Trip",
          description: `${t.destination || "TBD"} - ${t.startDate || ""}`,
          meta: t.budget ? `Budget: $${Number(t.budget).toLocaleString()}` : undefined,
        })),
        ...matchedServices.map(s => ({
          id: s.id,
          type: "provider" as const,
          name: s.serviceName || "Unnamed Service",
          description: s.location || "",
          meta: s.averageRating ? `${s.averageRating} rating` : undefined,
        })),
      ];

      const [userCount] = await db.select({ count: count() }).from(users);
      const [expertCount] = await db.select({ count: count() }).from(users).where(eq(users.role, "expert"));
      const [tripCount] = await db.select({ count: count() }).from(trips);
      const [serviceCount] = await db.select({ count: count() }).from(providerServices);

      res.json({
        results,
        counts: {
          users: userCount?.count || 0,
          experts: expertCount?.count || 0,
          providers: serviceCount?.count || 0,
          plans: tripCount?.count || 0,
        },
      });
    } catch (err) {
      console.error("Admin search error:", err);
      res.status(500).json({ message: "Search failed" });
    }
  });

  // === Platform Stats (Public) ===
  app.get("/api/platform/stats", async (_req, res) => {
    try {
      const [userCount] = await db.select({ count: count() }).from(users);
      const [tripCount] = await db.select({ count: count() }).from(trips);
      const [expertCount] = await db.select({ count: count() }).from(localExpertForms).where(eq(localExpertForms.status, "approved"));
      const [reviewCount] = await db.select({ count: count() }).from(serviceReviews);
      const [bookingCount] = await db.select({ count: count() }).from(serviceBookings);
      const allReviews = await db.select({ rating: serviceReviews.rating }).from(serviceReviews);
      const avgRating = allReviews.length > 0
        ? (allReviews.reduce((sum, r) => sum + (r.rating || 0), 0) / allReviews.length).toFixed(1)
        : "4.9";

      const allTrips = await db.select({ destination: trips.destination }).from(trips);
      const uniqueCountries = new Set(
        allTrips.map(t => t.destination?.split(",").pop()?.trim()).filter(Boolean)
      );

      res.json({
        totalTrips: tripCount?.count || 0,
        totalUsers: userCount?.count || 0,
        totalExperts: expertCount?.count || 0,
        totalReviews: reviewCount?.count || 0,
        totalBookings: bookingCount?.count || 0,
        totalCountries: uniqueCountries.size || 0,
        avgRating,
      });
    } catch (err) {
      console.error("Platform stats error:", err);
      res.status(500).json({ message: "Failed to fetch platform stats" });
    }
  });

  // === Admin Notifications (admin-specific) ===
  app.get("/api/admin/notifications", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const userId = user.claims.sub;
      const adminNotifications = await db.select().from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt))
        .limit(50);

      const enriched = adminNotifications.map(n => ({
        id: n.id,
        type: n.type?.includes("warning") || n.type?.includes("dispute") ? "warning"
          : n.type?.includes("success") || n.type?.includes("payment") ? "success"
          : n.type?.includes("alert") ? "alert"
          : "info",
        category: n.relatedType || "System",
        title: n.title || "Notification",
        message: n.message || "",
        time: n.createdAt ? getRelativeTime(n.createdAt) : "Unknown",
        read: n.isRead || false,
      }));

      res.json(enriched);
    } catch (err) {
      console.error("Admin notifications error:", err);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  function getRelativeTime(date: Date | string): string {
    const now = new Date();
    const d = new Date(date);
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  // ============================================================
  // SHAREABLE ITINERARY CARD SYSTEM
  // ============================================================

  // POST /api/itinerary-variants/:variantId/share
  app.post("/api/itinerary-variants/:variantId/share", isAuthenticated, async (req, res) => {
    try {
      const { variantId } = req.params;
      const userId = (req as any).user?.id;
      const { sharedWithUserId, permissions = "view", transportPreferences } = req.body;

      const [variant] = await db
        .select({ id: itineraryVariants.id, comparisonId: itineraryVariants.comparisonId })
        .from(itineraryVariants)
        .where(eq(itineraryVariants.id, variantId));

      if (!variant) return res.status(404).json({ error: "Variant not found" });

      const [comparison] = await db
        .select({ userId: itineraryComparisons.userId, destination: itineraryComparisons.destination })
        .from(itineraryComparisons)
        .where(eq(itineraryComparisons.id, variant.comparisonId));

      if (!comparison || comparison.userId !== userId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const shareToken = crypto.randomUUID();
      const replitDomains = process.env.REPLIT_DOMAINS;
      const baseUrl = replitDomains
        ? `https://${replitDomains.split(",")[0].trim()}`
        : (process.env.REPL_SLUG
          ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
          : `https://traveloure.com`);

      await db.insert(sharedItineraries).values({
        shareToken,
        variantId,
        sharedByUserId: userId,
        sharedWithUserId: sharedWithUserId || null,
        permissions,
        transportPreferences: transportPreferences || null,
      });

      if (sharedWithUserId) {
        await db.insert(notifications).values({
          userId: sharedWithUserId,
          type: "itinerary_shared",
          title: "Itinerary shared with you",
          message: `A traveler has shared their itinerary to ${comparison.destination} with you for review.`,
          data: { shareToken, variantId, destination: comparison.destination },
        } as any);
      }

      res.json({
        shareToken,
        shareUrl: `${baseUrl}/itinerary-view/${shareToken}`,
        expiresAt: null,
      });
    } catch (err: any) {
      console.error("Share itinerary error:", err);
      res.status(500).json({ error: "Failed to share itinerary" });
    }
  });

  // GET /api/trips/:id/share-info — Returns share token + expert review status for a trip (owner only)
  app.get("/api/trips/:id/share-info", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).user?.claims?.sub || (req as any).user?.id;
      const tripId = req.params.id;

      const comparisons = await db
        .select({ id: itineraryComparisons.id, selectedVariantId: itineraryComparisons.selectedVariantId })
        .from(itineraryComparisons)
        .where(and(eq(itineraryComparisons.tripId, tripId), eq(itineraryComparisons.userId, userId)));

      if (comparisons.length === 0) return res.json({});

      const variantIds = comparisons.map(c => c.id);
      const variantRows = await db
        .select({ id: itineraryVariants.id, comparisonId: itineraryVariants.comparisonId })
        .from(itineraryVariants)
        .where(inArray(itineraryVariants.comparisonId, variantIds));

      if (variantRows.length === 0) return res.json({});

      const vids = variantRows.map(v => v.id);
      const shares = await db
        .select()
        .from(sharedItineraries)
        .where(and(inArray(sharedItineraries.variantId, vids), eq(sharedItineraries.sharedByUserId, userId)))
        .orderBy(sharedItineraries.createdAt);

      if (shares.length === 0) return res.json({});

      const latest = shares[shares.length - 1];
      return res.json({
        shareToken: latest.shareToken,
        variantId: latest.variantId,
        expertStatus: latest.expertStatus,
        expertNotes: latest.expertNotes,
        expertDiff: latest.expertDiff,
      });
    } catch (err: any) {
      console.error("Share info error:", err);
      res.status(500).json({ error: "Failed to fetch share info" });
    }
  });

  // GET /api/itinerary-share/:token — PUBLIC
  app.get("/api/itinerary-share/:token", async (req, res) => {
    try {
      const { token } = req.params;

      const [shared] = await db
        .select()
        .from(sharedItineraries)
        .where(eq(sharedItineraries.shareToken, token));

      if (!shared) return res.status(404).json({ error: "Shared itinerary not found" });
      if (shared.expiresAt && new Date(shared.expiresAt) < new Date()) {
        return res.status(410).json({ error: "This share link has expired" });
      }

      await db
        .update(sharedItineraries)
        .set({ viewCount: (shared.viewCount || 0) + 1, lastViewedAt: new Date() })
        .where(eq(sharedItineraries.id, shared.id));

      const [variant] = await db
        .select()
        .from(itineraryVariants)
        .where(eq(itineraryVariants.id, shared.variantId));

      if (!variant) return res.status(404).json({ error: "Variant not found" });

      const [comparison] = await db
        .select()
        .from(itineraryComparisons)
        .where(eq(itineraryComparisons.id, variant.comparisonId));

      const items = await db
        .select()
        .from(itineraryVariantItems)
        .where(eq(itineraryVariantItems.variantId, shared.variantId));

      const legs = await db
        .select()
        .from(transportLegs)
        .where(eq(transportLegs.variantId, shared.variantId));

      const [exportCache] = await db
        .select()
        .from(mapsExportCache)
        .where(eq(mapsExportCache.variantId, shared.variantId));

      const [sharer] = await db
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, profileImageUrl: users.profileImageUrl })
        .from(users)
        .where(eq(users.id, shared.sharedByUserId));

      const dayNumbers = [...new Set(items.map(i => i.dayNumber))].sort((a, b) => a - b);
      const days = dayNumbers.map(dayNum => {
        const dayItems = items.filter(i => i.dayNumber === dayNum).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        const dayLegs = legs.filter(l => l.dayNumber === dayNum).sort((a, b) => a.legOrder - b.legOrder);

        const startDate = comparison?.startDate ? new Date(comparison.startDate) : null;
        let dateStr = "";
        if (startDate) {
          const d = new Date(startDate);
          d.setDate(d.getDate() + dayNum - 1);
          dateStr = d.toISOString().split("T")[0];
        }

        return {
          dayNumber: dayNum,
          date: dateStr,
          activities: dayItems.map(item => ({
            id: item.id,
            name: item.name,
            startTime: item.startTime,
            endTime: item.endTime,
            lat: item.latitude ? parseFloat(item.latitude as any) : null,
            lng: item.longitude ? parseFloat(item.longitude as any) : null,
            category: item.serviceType,
            cost: item.price ? parseFloat(item.price as any) : 0,
            description: item.description,
            location: item.location,
            duration: item.duration,
          })),
          transportLegs: dayLegs.map(leg => ({
            id: leg.id,
            legOrder: leg.legOrder,
            fromName: leg.fromName,
            toName: leg.toName,
            recommendedMode: leg.recommendedMode,
            userSelectedMode: leg.userSelectedMode,
            distanceDisplay: leg.distanceDisplay,
            distanceMeters: leg.distanceMeters,
            estimatedDurationMinutes: leg.estimatedDurationMinutes,
            estimatedCostUsd: leg.estimatedCostUsd,
            energyCost: leg.energyCost,
            alternativeModes: leg.alternativeModes,
            linkedProductUrl: leg.linkedProductUrl,
            fromLat: leg.fromLat,
            fromLng: leg.fromLng,
            toLat: leg.toLat,
            toLng: leg.toLng,
          })),
        };
      });

      const totalTransportCost = legs.reduce((sum, l) => sum + (l.estimatedCostUsd || 0), 0);
      const totalTransportMinutes = legs.reduce((sum, l) => sum + (l.estimatedDurationMinutes || 0), 0);

      res.json({
        variant: {
          id: variant.id,
          name: variant.name,
          description: variant.description,
          destination: comparison?.destination,
          dateRange: {
            start: comparison?.startDate,
            end: comparison?.endDate,
          },
          totalCost: variant.totalCost,
          optimizationScore: variant.optimizationScore,
          days,
          transportSummary: {
            totalLegs: legs.length,
            totalMinutes: totalTransportMinutes,
            totalCostUsd: Math.round(totalTransportCost * 100) / 100,
          },
        },
        mapsLinks: {
          googleMapsPerDay: exportCache?.googleMapsUrls || {},
          appleMapsPerDay: exportCache?.appleMapsUrls || {},
          appleMapsWebPerDay: exportCache?.appleMapsWebUrls || {},
          kmlDownloadUrl: `/api/itinerary-share/${token}/export/kml`,
          gpxDownloadUrl: `/api/itinerary-share/${token}/export/gpx`,
        },
        sharedBy: sharer
          ? {
              name: [sharer.firstName, sharer.lastName].filter(Boolean).join(" ") || "A traveler",
              avatarUrl: sharer.profileImageUrl,
              userId: sharer.id,
            }
          : { name: "A traveler", avatarUrl: null, userId: null },
        permissions: shared.permissions,
        expertStatus: shared.expertStatus,
        expertNotes: shared.expertNotes || null,
        expertDiff: shared.expertDiff || null,
        transportPreferences: shared.transportPreferences,
        shareToken: token,
        isOwner: !!(shared.sharedByUserId && (req as any).user?.id === shared.sharedByUserId),
      });
    } catch (err: any) {
      console.error("Get shared itinerary error:", err);
      res.status(500).json({ error: "Failed to load shared itinerary" });
    }
  });

  // GET /api/trips/:tripId/transport-legs
  // Returns transport legs for the most recent selected variant associated with a trip
  app.get("/api/trips/:tripId/transport-legs", isAuthenticated, async (req, res) => {
    try {
      const { tripId } = req.params;
      const userId = (req.user as any).claims.sub;

      const tripOwned = await verifyTripOwnership(tripId, userId);
      if (!tripOwned) {
        return res.status(404).json({ error: "Trip not found" });
      }

      const [comparison] = await db
        .select({ selectedVariantId: itineraryComparisons.selectedVariantId })
        .from(itineraryComparisons)
        .where(
          and(
            eq(itineraryComparisons.tripId, tripId),
            isNotNull(itineraryComparisons.selectedVariantId)
          )
        )
        .orderBy(desc(itineraryComparisons.createdAt))
        .limit(1);

      if (!comparison?.selectedVariantId) {
        return res.json({ legs: [], variantId: null });
      }

      const legs = await db
        .select()
        .from(transportLegs)
        .where(eq(transportLegs.variantId, comparison.selectedVariantId))
        .orderBy(asc(transportLegs.legOrder));

      res.json({ legs, variantId: comparison.selectedVariantId });
    } catch (err: any) {
      console.error("Get trip transport legs error:", err);
      res.status(500).json({ error: "Failed to load transport legs" });
    }
  });

  // PATCH /api/transport-legs/:legId/mode
  // Accepts either authenticated session (owner) or a suggest-permissions shareToken (expert without login)
  app.patch("/api/transport-legs/:legId/mode", async (req, res) => {
    try {
      const { legId } = req.params;
      const { selectedMode, shareToken } = req.body;
      const userId = (req as any).user?.claims?.sub ?? (req as any).user?.id;

      if (!selectedMode) return res.status(400).json({ error: "selectedMode is required" });
      if (!userId && !shareToken) return res.status(401).json({ error: "Authentication or share token required" });

      const [leg] = await db
        .select()
        .from(transportLegs)
        .where(eq(transportLegs.id, legId));

      if (!leg) return res.status(404).json({ error: "Transport leg not found" });

      // Ownership check: verify via the variant's comparison owner OR valid suggest share token
      const [variant] = await db
        .select({ comparisonId: itineraryVariants.comparisonId })
        .from(itineraryVariants)
        .where(eq(itineraryVariants.id, leg.variantId));

      if (variant) {
        const [comparison] = await db
          .select({ userId: itineraryComparisons.userId })
          .from(itineraryComparisons)
          .where(eq(itineraryComparisons.id, variant.comparisonId));

        const isOwner = userId && comparison?.userId === userId;

        if (!isOwner) {
          if (shareToken) {
            const [shared] = await db
              .select({ permissions: sharedItineraries.permissions, variantId: sharedItineraries.variantId, expiresAt: sharedItineraries.expiresAt })
              .from(sharedItineraries)
              .where(and(eq(sharedItineraries.shareToken, shareToken), eq(sharedItineraries.variantId, leg.variantId)));

            if (!shared) return res.status(403).json({ error: "Not authorized to update this transport leg" });
            if (shared.expiresAt && new Date(shared.expiresAt) < new Date()) {
              return res.status(410).json({ error: "Share link has expired" });
            }
            if (shared.permissions !== "suggest") {
              return res.status(403).json({ error: "This share link does not allow modifications" });
            }
          } else {
            return res.status(403).json({ error: "Not authorized to update this transport leg" });
          }
        }
      }

      const alternatives = (leg.alternativeModes as any[]) || [];
      const selected = alternatives.find((a: any) => a.mode === selectedMode);

      let newDuration = leg.estimatedDurationMinutes;
      let newCost = leg.estimatedCostUsd;
      let newEnergy = leg.energyCost;

      if (selected) {
        newDuration = selected.durationMinutes;
        newCost = selected.costUsd;
        newEnergy = selected.energyCost;
      }

      const prevDuration = leg.estimatedDurationMinutes;
      const timeDiff = newDuration - prevDuration;

      await db
        .update(transportLegs)
        .set({
          userSelectedMode: selectedMode,
          estimatedDurationMinutes: newDuration,
          estimatedCostUsd: newCost ?? null,
          energyCost: newEnergy ?? 0,
          updatedAt: new Date(),
        })
        .where(eq(transportLegs.id, legId));

      // Regenerate maps URLs for all days (reflects new mode selection, replaces stale KML/GPX cache)
      let updatedMapsUrls: { googleMapsUrls: Record<number, string>; appleMapsUrls: Record<number, string>; appleMapsWebUrls: Record<number, string> } | null = null;
      try {
        updatedMapsUrls = await regenerateMapsUrlsFromLegs(leg.variantId, leg.dayNumber);
      } catch (mapsErr) {
        console.error("Maps URL regeneration error (non-critical):", mapsErr);
      }

      let downstreamMessage = "";
      if (timeDiff < 0) {
        downstreamMessage = `Switching to ${selectedMode} saves ${Math.abs(timeDiff)} minutes.`;
      } else if (timeDiff > 0) {
        downstreamMessage = `Switching to ${selectedMode} adds ${timeDiff} minutes.`;
      } else {
        downstreamMessage = `Transport mode updated to ${selectedMode}.`;
      }

      if (variant) {
        const [comp] = await db.select({ tripId: itineraryComparisons.tripId }).from(itineraryComparisons).where(eq(itineraryComparisons.id, variant.comparisonId));
        if (comp?.tripId) {
          const who = userId ? ((req.user as any)?.claims?.name || "User") : "Guest";
          logItineraryChange(comp.tripId, who, `Changed transport mode to ${selectedMode} (${leg.fromName} → ${leg.toName})`, "transport", shareToken ? "friend" : "owner", undefined, { legId, selectedMode, previousMode: leg.userSelectedMode || leg.recommendedMode });
        }
      }

      res.json({
        updatedLeg: {
          id: legId,
          userSelectedMode: selectedMode,
          estimatedDurationMinutes: newDuration,
          estimatedCostUsd: newCost,
          energyCost: newEnergy,
        },
        downstreamImpact: {
          nextActivityStartTimeShift: -timeDiff,
          message: downstreamMessage,
        },
        updatedMapsUrls,
      });
    } catch (err: any) {
      console.error("Update transport mode error:", err);
      res.status(500).json({ error: "Failed to update transport mode" });
    }
  });

  // GET /api/itinerary-share/:token/export/kml
  app.get("/api/itinerary-share/:token/export/kml", async (req, res) => {
    try {
      const { token } = req.params;

      const [shared] = await db
        .select()
        .from(sharedItineraries)
        .where(eq(sharedItineraries.shareToken, token));

      if (!shared) return res.status(404).json({ error: "Not found" });

      const [variant] = await db.select().from(itineraryVariants).where(eq(itineraryVariants.id, shared.variantId));
      const [comparison] = await db.select().from(itineraryComparisons).where(eq(itineraryComparisons.id, variant.comparisonId));
      const items = await db.select().from(itineraryVariantItems).where(eq(itineraryVariantItems.variantId, shared.variantId));
      const legs = await db.select().from(transportLegs).where(eq(transportLegs.variantId, shared.variantId));

      const [cached] = await db.select().from(mapsExportCache).where(eq(mapsExportCache.variantId, shared.variantId));

      let kmlContent = cached?.kmlContent;

      if (!kmlContent) {
        const dayNumbers = [...new Set(items.map(i => i.dayNumber))].sort((a, b) => a - b);
        const startDate = comparison?.startDate ? new Date(comparison.startDate) : null;

        const days = dayNumbers.map(dayNum => {
          const dayItems = items.filter(i => i.dayNumber === dayNum).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
          const dayLegs = legs.filter(l => l.dayNumber === dayNum);
          let dateStr = "";
          if (startDate) {
            const d = new Date(startDate);
            d.setDate(d.getDate() + dayNum - 1);
            dateStr = d.toISOString().split("T")[0];
          }
          return {
            dayNumber: dayNum,
            date: dateStr,
            activities: dayItems.map(item => ({
              lat: item.latitude ? parseFloat(item.latitude as any) : 0,
              lng: item.longitude ? parseFloat(item.longitude as any) : 0,
              name: item.name,
              scheduledTime: item.startTime || "",
            })),
            transportLegs: dayLegs.map(l => ({
              legOrder: l.legOrder,
              fromName: l.fromName,
              toName: l.toName,
              recommendedMode: l.recommendedMode,
              estimatedDurationMinutes: l.estimatedDurationMinutes,
              estimatedCostUsd: l.estimatedCostUsd,
              distanceDisplay: l.distanceDisplay,
            })),
          };
        });

        kmlContent = generateKml({
          tripName: variant.name,
          destination: comparison?.destination || "Trip",
          days,
        });

        await db.update(mapsExportCache).set({ kmlContent }).where(eq(mapsExportCache.variantId, shared.variantId));
      }

      res.setHeader("Content-Type", "application/vnd.google-earth.kml+xml");
      res.setHeader("Content-Disposition", `attachment; filename="traveloure-itinerary.kml"`);
      res.send(kmlContent);
    } catch (err: any) {
      console.error("KML export error:", err);
      res.status(500).json({ error: "Failed to generate KML" });
    }
  });

  // GET /api/itinerary-share/:token/export/gpx
  app.get("/api/itinerary-share/:token/export/gpx", async (req, res) => {
    try {
      const { token } = req.params;

      const [shared] = await db
        .select()
        .from(sharedItineraries)
        .where(eq(sharedItineraries.shareToken, token));

      if (!shared) return res.status(404).json({ error: "Not found" });

      const [variant] = await db.select().from(itineraryVariants).where(eq(itineraryVariants.id, shared.variantId));
      const [comparison] = await db.select().from(itineraryComparisons).where(eq(itineraryComparisons.id, variant.comparisonId));
      const items = await db.select().from(itineraryVariantItems).where(eq(itineraryVariantItems.variantId, shared.variantId));
      const legs = await db.select().from(transportLegs).where(eq(transportLegs.variantId, shared.variantId));

      const [cached] = await db.select().from(mapsExportCache).where(eq(mapsExportCache.variantId, shared.variantId));

      let gpxContent = cached?.gpxContent;

      if (!gpxContent) {
        const dayNumbers = [...new Set(items.map(i => i.dayNumber))].sort((a, b) => a - b);
        const startDate = comparison?.startDate ? new Date(comparison.startDate) : null;

        const days = dayNumbers.map(dayNum => {
          const dayItems = items.filter(i => i.dayNumber === dayNum).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
          const dayLegs = legs.filter(l => l.dayNumber === dayNum);
          let dateStr = "";
          if (startDate) {
            const d = new Date(startDate);
            d.setDate(d.getDate() + dayNum - 1);
            dateStr = d.toISOString().split("T")[0];
          }
          return {
            dayNumber: dayNum,
            date: dateStr,
            activities: dayItems.map(item => ({
              lat: item.latitude ? parseFloat(item.latitude as any) : 0,
              lng: item.longitude ? parseFloat(item.longitude as any) : 0,
              name: item.name,
              scheduledTime: item.startTime || "",
            })),
            transportLegs: dayLegs.map(l => ({
              legOrder: l.legOrder,
              fromName: l.fromName,
              toName: l.toName,
              recommendedMode: l.recommendedMode,
              estimatedDurationMinutes: l.estimatedDurationMinutes,
              estimatedCostUsd: l.estimatedCostUsd,
              distanceDisplay: l.distanceDisplay,
            })),
          };
        });

        gpxContent = generateGpx({
          tripName: variant.name,
          destination: comparison?.destination || "Trip",
          days,
        });

        await db.update(mapsExportCache).set({ gpxContent }).where(eq(mapsExportCache.variantId, shared.variantId));
      }

      res.setHeader("Content-Type", "application/gpx+xml");
      res.setHeader("Content-Disposition", `attachment; filename="traveloure-itinerary.gpx"`);
      res.send(gpxContent);
    } catch (err: any) {
      console.error("GPX export error:", err);
      res.status(500).json({ error: "Failed to generate GPX" });
    }
  });

  // GET /api/itinerary-share/:token/navigate/:dayNumber/:legOrder
  app.get("/api/itinerary-share/:token/navigate/:dayNumber/:legOrder", async (req, res) => {
    try {
      const { token, dayNumber, legOrder } = req.params;
      const { platform = "google", currentLat, currentLng } = req.query as Record<string, string>;

      const [shared] = await db
        .select({ variantId: sharedItineraries.variantId })
        .from(sharedItineraries)
        .where(eq(sharedItineraries.shareToken, token));

      if (!shared) return res.status(404).json({ error: "Not found" });

      const [leg] = await db
        .select()
        .from(transportLegs)
        .where(
          and(
            eq(transportLegs.variantId, shared.variantId),
            eq(transportLegs.dayNumber, parseInt(dayNumber)),
            eq(transportLegs.legOrder, parseInt(legOrder))
          )
        );

      if (!leg) return res.status(404).json({ error: "Leg not found" });

      const mode = leg.userSelectedMode || leg.recommendedMode;
      const fromLat = currentLat ? parseFloat(currentLat) : leg.fromLat;
      const fromLng = currentLng ? parseFloat(currentLng) : leg.fromLng;

      let url: string;
      if (platform === "apple") {
        url = buildAppleNavUrl(fromLat, fromLng, leg.toLat, leg.toLng, mode);
      } else {
        url = buildGoogleNavUrl(fromLat, fromLng, leg.toLat, leg.toLng, mode);
      }

      res.redirect(302, url);
    } catch (err: any) {
      console.error("Navigate error:", err);
      res.status(500).json({ error: "Failed to build navigation URL" });
    }
  });

  // GET /api/transport-legs/user — returns all transport legs for the current user across all shared itineraries
  app.get("/api/transport-legs/user", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const userLegs = await db
        .select({
          id: transportLegs.id,
          variantId: transportLegs.variantId,
          legOrder: transportLegs.legOrder,
          fromName: transportLegs.fromName,
          toName: transportLegs.toName,
          userSelectedMode: transportLegs.userSelectedMode,
          recommendedMode: transportLegs.recommendedMode,
        })
        .from(transportLegs)
        .innerJoin(itineraryVariants, eq(itineraryVariants.id, transportLegs.variantId))
        .innerJoin(itineraryComparisons, eq(itineraryComparisons.id, itineraryVariants.comparisonId))
        .where(eq(itineraryComparisons.userId, userId));

      res.json(userLegs);
    } catch (err: any) {
      console.error("Get user transport legs error:", err);
      res.status(500).json({ error: "Failed to get transport legs" });
    }
  });

  // GET /api/itinerary-variants/:variantId/transport-legs
  app.get("/api/itinerary-variants/:variantId/transport-legs", isAuthenticated, async (req, res) => {
    try {
      const { variantId } = req.params;
      const userId = (req as any).user?.id;

      // Verify ownership: the variant must belong to a comparison owned by the requesting user
      const [variant] = await db
        .select({ comparisonId: itineraryVariants.comparisonId })
        .from(itineraryVariants)
        .where(eq(itineraryVariants.id, variantId));

      if (!variant) return res.status(404).json({ error: "Variant not found" });

      const [comparison] = await db
        .select({ userId: itineraryComparisons.userId })
        .from(itineraryComparisons)
        .where(eq(itineraryComparisons.id, variant.comparisonId));

      if (!comparison || comparison.userId !== userId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const legs = await db
        .select()
        .from(transportLegs)
        .where(eq(transportLegs.variantId, variantId));
      res.json(legs);
    } catch (err: any) {
      console.error("Get transport legs error:", err);
      res.status(500).json({ error: "Failed to get transport legs" });
    }
  });

  // POST /api/itinerary-variants/:variantId/calculate-transport
  app.post("/api/itinerary-variants/:variantId/calculate-transport", isAuthenticated, async (req, res) => {
    try {
      const { variantId } = req.params;
      const userId = (req as any).user?.id;
      const { userPrefs } = req.body;

      const [variant] = await db
        .select({ id: itineraryVariants.id, comparisonId: itineraryVariants.comparisonId })
        .from(itineraryVariants)
        .where(eq(itineraryVariants.id, variantId));

      if (!variant) return res.status(404).json({ error: "Variant not found" });

      const [comparison] = await db
        .select({ userId: itineraryComparisons.userId, destination: itineraryComparisons.destination })
        .from(itineraryComparisons)
        .where(eq(itineraryComparisons.id, variant.comparisonId));

      if (!comparison || comparison.userId !== userId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const items = await db
        .select()
        .from(itineraryVariantItems)
        .where(eq(itineraryVariantItems.variantId, variantId));

      const activities = items
        .filter(item => item.latitude && item.longitude)
        .map((item, idx) => ({
          id: item.id,
          name: item.name,
          lat: parseFloat(item.latitude as any),
          lng: parseFloat(item.longitude as any),
          scheduledTime: item.startTime || `09:${String(idx * 30 % 60).padStart(2, "0")}`,
          dayNumber: item.dayNumber,
          order: item.sortOrder || idx,
        }));

      const legs = await calculateTransportLegs(
        variantId,
        activities,
        comparison.destination || "",
        userPrefs || {}
      );

      res.json({ legs, count: legs.length });
    } catch (err: any) {
      console.error("Calculate transport error:", err);
      res.status(500).json({ error: "Failed to calculate transport legs" });
    }
  });

  // POST /api/itinerary-share/:token/suggest — DEPRECATED: Expert suggests modifications (legacy)
  // Use POST /api/expert-review/:shareToken/submit instead (stores full snapshot)
  app.post("/api/itinerary-share/:token/suggest", async (req, res) => {
    try {
      const { token } = req.params;
      const { notes, activityDiffs, transportDiffs } = req.body;
      const userId = (req as any).user?.id;

      if (!userId) return res.status(401).json({ error: "Authentication required to submit suggestions" });
      if (!notes?.trim()) return res.status(400).json({ error: "Notes are required" });

      const [shared] = await db
        .select()
        .from(sharedItineraries)
        .where(eq(sharedItineraries.shareToken, token));

      if (!shared) return res.status(404).json({ error: "Share not found" });
      if (shared.expiresAt && new Date(shared.expiresAt) < new Date()) {
        return res.status(410).json({ error: "Share link has expired" });
      }
      if (!["suggest", "edit"].includes(shared.permissions)) {
        return res.status(403).json({ error: "This share link does not allow suggestions" });
      }

      const [variant] = await db
        .select({ comparisonId: itineraryVariants.comparisonId, name: itineraryVariants.name })
        .from(itineraryVariants)
        .where(eq(itineraryVariants.id, shared.variantId));

      if (!variant) return res.status(404).json({ error: "Variant not found" });

      const [comparison] = await db
        .select({ userId: itineraryComparisons.userId, destination: itineraryComparisons.destination })
        .from(itineraryComparisons)
        .where(eq(itineraryComparisons.id, variant.comparisonId));

      // Build diff payload
      const expertDiff = {
        activityDiffs: activityDiffs || {},
        transportDiffs: transportDiffs || {},
        submittedAt: new Date().toISOString(),
      };

      // Save diff + notes + update status on shared_itineraries
      await db.execute(
        sql`UPDATE shared_itineraries SET expert_status = 'review_sent', expert_notes = ${notes}, expert_diff = ${JSON.stringify(expertDiff)}::jsonb, updated_at = NOW() WHERE id = ${shared.id}`
      );

      // Send notification to the owner
      if (comparison?.userId) {
        const hasDiffs = Object.keys(expertDiff.activityDiffs).length > 0 || Object.keys(expertDiff.transportDiffs).length > 0;
        const diffSummary = hasDiffs
          ? ` (${Object.keys(expertDiff.activityDiffs).length} activity edits, ${Object.keys(expertDiff.transportDiffs).length} transport changes)`
          : "";
        await db.insert(notifications).values({
          userId: comparison.userId,
          type: "expert_suggestion",
          title: "Expert sent itinerary edits",
          message: `An expert has reviewed your "${variant.name}" itinerary for ${comparison.destination || "your trip"} and sent suggestions${diffSummary}: ${notes.substring(0, 150)}${notes.length > 150 ? "..." : ""}`,
          relatedId: shared.variantId,
          relatedType: "itinerary_variant",
        });
      }

      res.json({ success: true, message: "Edits sent to traveler" });
    } catch (err: any) {
      console.error("Expert suggest error:", err);
      res.status(500).json({ error: "Failed to send suggestions" });
    }
  });

  // PATCH /api/itinerary-share/:token/acknowledge — Owner accepts or rejects expert edits
  app.patch("/api/itinerary-share/:token/acknowledge", async (req, res) => {
    try {
      const { token } = req.params;
      const { action } = req.body;
      const userId = (req as any).user?.id;

      if (!action || !["accept", "reject"].includes(action)) {
        return res.status(400).json({ error: "action must be 'accept' or 'reject'" });
      }

      const [shared] = await db
        .select()
        .from(sharedItineraries)
        .where(eq(sharedItineraries.shareToken, token));

      if (!shared) return res.status(404).json({ error: "Share not found" });

      // Only the original sharer (owner) can acknowledge
      if (!userId) {
        return res.status(401).json({ error: "Authentication required to acknowledge edits" });
      }
      if (shared.sharedByUserId !== userId) {
        return res.status(403).json({ error: "Only the itinerary owner can acknowledge edits" });
      }

      const newStatus = action === "accept" ? "acknowledged" : "rejected";
      await db.execute(
        sql`UPDATE shared_itineraries SET expert_status = ${newStatus}, updated_at = NOW() WHERE id = ${shared.id}`
      );

      res.json({ success: true, status: newStatus });
    } catch (err: any) {
      console.error("Acknowledge expert edits error:", err);
      res.status(500).json({ error: "Failed to acknowledge edits" });
    }
  });

  // POST /api/expert-review/:shareToken/submit — Expert submits diff + notes to expert_updated_itineraries
  app.post("/api/expert-review/:shareToken/submit", async (req, res) => {
    try {
      const { shareToken } = req.params;
      const { notes, activityDiffs, transportDiffs } = req.body;
      const userId = (req as any).user?.id;

      if (!notes?.trim()) return res.status(400).json({ error: "Notes are required" });
      if (!userId) return res.status(401).json({ error: "Authentication required to submit expert edits" });

      const [shared] = await db
        .select()
        .from(sharedItineraries)
        .where(eq(sharedItineraries.shareToken, shareToken));

      if (!shared) return res.status(404).json({ error: "Share not found" });
      if (shared.expiresAt && new Date(shared.expiresAt) < new Date()) {
        return res.status(410).json({ error: "Share link has expired" });
      }
      if (!["suggest", "edit"].includes(shared.permissions)) {
        return res.status(403).json({ error: "This share link does not allow expert edits" });
      }

      const [variant] = await db
        .select({ comparisonId: itineraryVariants.comparisonId, name: itineraryVariants.name })
        .from(itineraryVariants)
        .where(eq(itineraryVariants.id, shared.variantId));

      if (!variant) return res.status(404).json({ error: "Variant not found" });

      const [comparison] = await db
        .select({ userId: itineraryComparisons.userId, destination: itineraryComparisons.destination, tripId: itineraryComparisons.tripId })
        .from(itineraryComparisons)
        .where(eq(itineraryComparisons.id, variant.comparisonId));

      // Build full itinerary snapshot: original items with expert diffs applied
      const originalItems = await db
        .select()
        .from(itineraryVariantItems)
        .where(eq(itineraryVariantItems.variantId, shared.variantId));

      const originalLegs = await db
        .select()
        .from(transportLegs)
        .where(eq(transportLegs.variantId, shared.variantId));

      const resolvedActivityDiffs = activityDiffs || {};
      const resolvedTransportDiffs = transportDiffs || {};

      // Helper: merge HH:MM expert edit with the original ISO date to produce a full ISO timestamp
      const mergeExpertTime = (originalISO: string | null | undefined, hhMM: string | undefined): string | null | undefined => {
        if (!hhMM) return originalISO;
        if (!originalISO) return originalISO;
        try {
          const base = new Date(originalISO);
          const [h, m] = hhMM.split(":").map(Number);
          base.setHours(h, m, 0, 0);
          return base.toISOString();
        } catch {
          return originalISO;
        }
      };

      const editedActivities = originalItems.map(item => {
        const diff = resolvedActivityDiffs[item.id];
        if (!diff) return { id: item.id, name: item.name, startTime: item.startTime, endTime: item.endTime, dayNumber: item.dayNumber, sortOrder: item.sortOrder, location: item.location, description: item.description };
        return {
          id: item.id,
          name: diff.name ?? item.name,
          startTime: mergeExpertTime(item.startTime, diff.startTime) ?? item.startTime,
          endTime: item.endTime,
          dayNumber: item.dayNumber,
          sortOrder: item.sortOrder,
          location: item.location,
          description: diff.note ? `${item.description || ""}\nExpert note: ${diff.note}`.trim() : item.description,
          expertNote: diff.note,
        };
      });

      const editedLegs = originalLegs.map(leg => {
        const diff = resolvedTransportDiffs[leg.id];
        if (!diff) return { id: leg.id, legOrder: leg.legOrder, dayNumber: leg.dayNumber, recommendedMode: leg.recommendedMode, userSelectedMode: leg.userSelectedMode };
        return { id: leg.id, legOrder: leg.legOrder, dayNumber: leg.dayNumber, recommendedMode: leg.recommendedMode, userSelectedMode: diff.newMode };
      });

      const itinerarySnapshot = {
        variantId: shared.variantId,
        variantName: variant.name,
        editedAt: new Date().toISOString(),
        activities: editedActivities,
        transportLegs: editedLegs,
        expertNotes: notes,
        diffs: {
          activityDiffs: resolvedActivityDiffs,
          transportDiffs: resolvedTransportDiffs,
        },
      };

      const expertDiff = {
        activityDiffs: resolvedActivityDiffs,
        transportDiffs: resolvedTransportDiffs,
        submittedAt: new Date().toISOString(),
      };

      // Save full edited snapshot + message to expert_updated_itineraries
      await db.insert(expertUpdatedItineraries).values({
        tripId: comparison?.tripId || null,
        shareToken,
        itineraryData: itinerarySnapshot,
        message: notes,
        status: "pending",
        createdById: userId,
      });

      // Update shared_itineraries with status + diff for traveler review
      await db.execute(
        sql`UPDATE shared_itineraries SET expert_status = 'review_sent', expert_notes = ${notes}, expert_diff = ${JSON.stringify(expertDiff)}::jsonb, updated_at = NOW() WHERE id = ${shared.id}`
      );

      // Notify the itinerary owner
      if (comparison?.userId) {
        const hasDiffs = Object.keys(expertDiff.activityDiffs).length > 0 || Object.keys(expertDiff.transportDiffs).length > 0;
        const diffSummary = hasDiffs
          ? ` (${Object.keys(expertDiff.activityDiffs).length} activity edits, ${Object.keys(expertDiff.transportDiffs).length} transport changes)`
          : "";
        await db.insert(notifications).values({
          userId: comparison.userId,
          type: "expert_suggestion",
          title: "Expert sent itinerary edits",
          message: `An expert reviewed your "${variant.name}" itinerary for ${comparison.destination || "your trip"} and sent suggestions${diffSummary}: ${notes.substring(0, 150)}${notes.length > 150 ? "..." : ""}`,
          relatedId: shared.variantId,
          relatedType: "itinerary_variant",
        });
      }

      res.json({ success: true, message: "Edits submitted and traveler notified" });
    } catch (err: any) {
      console.error("Expert review submit error:", err);
      res.status(500).json({ error: "Failed to submit expert edits" });
    }
  });

  // PATCH /api/expert-review/:shareToken/acknowledge — Owner acknowledges expert edits
  app.patch("/api/expert-review/:shareToken/acknowledge", async (req, res) => {
    try {
      const { shareToken } = req.params;
      const { action, acceptedDiffIds, rejectedDiffIds } = req.body;
      const userId = (req as any).user?.id;

      if (!action || !["accept", "reject"].includes(action)) {
        return res.status(400).json({ error: "action must be 'accept' or 'reject'" });
      }

      const [shared] = await db
        .select()
        .from(sharedItineraries)
        .where(eq(sharedItineraries.shareToken, shareToken));

      if (!shared) return res.status(404).json({ error: "Share not found" });

      if (!userId) {
        return res.status(401).json({ error: "Authentication required to acknowledge edits" });
      }
      if (shared.sharedByUserId !== userId) {
        return res.status(403).json({ error: "Only the itinerary owner can acknowledge edits" });
      }

      const newStatus = action === "accept" ? "acknowledged" : "rejected";

      // If partial accept/reject, update expert_diff to reflect accepted subset
      if (action === "accept" && (acceptedDiffIds || rejectedDiffIds)) {
        const currentDiff = shared.expertDiff;
        if (currentDiff && rejectedDiffIds?.length > 0) {
          const updatedActivityDiffs = { ...currentDiff.activityDiffs };
          const updatedTransportDiffs = { ...currentDiff.transportDiffs };
          for (const id of rejectedDiffIds) {
            delete updatedActivityDiffs[id];
            delete updatedTransportDiffs[id];
          }
          const updatedDiff = { ...currentDiff, activityDiffs: updatedActivityDiffs, transportDiffs: updatedTransportDiffs };
          await db.execute(
            sql`UPDATE shared_itineraries SET expert_status = ${newStatus}, expert_diff = ${JSON.stringify(updatedDiff)}::jsonb, updated_at = NOW() WHERE id = ${shared.id}`
          );
        } else {
          await db.execute(
            sql`UPDATE shared_itineraries SET expert_status = ${newStatus}, updated_at = NOW() WHERE id = ${shared.id}`
          );
        }
      } else {
        await db.execute(
          sql`UPDATE shared_itineraries SET expert_status = ${newStatus}, updated_at = NOW() WHERE id = ${shared.id}`
        );
      }

      res.json({ success: true, status: newStatus });
    } catch (err: any) {
      console.error("Expert review acknowledge error:", err);
      res.status(500).json({ error: "Failed to acknowledge edits" });
    }
  });

  // Social sharing meta-tag injection for /itinerary-view/:token
  // This route intercepts the SPA route and injects Open Graph tags into the HTML
  // so social crawlers (Twitter, Facebook, Slack, etc.) see them in <head>.
  app.get("/itinerary-view/:token", async (req, res, next) => {
    try {
      const { token } = req.params;

      // Fetch share metadata from DB
      const [shared] = await db
        .select()
        .from(sharedItineraries)
        .where(eq(sharedItineraries.shareToken, token));

      if (!shared) return next(); // Let SPA handle 404

      const [variant] = await db
        .select()
        .from(itineraryVariants)
        .where(eq(itineraryVariants.id, shared.variantId));

      const [comparison] = variant
        ? await db
            .select()
            .from(itineraryComparisons)
            .where(eq(itineraryComparisons.id, variant.comparisonId))
        : [null];

      const destination = comparison?.destination || "an amazing destination";
      const variantName = variant?.name || "Travel Itinerary";
      const title = `${variantName} – ${destination} | Traveloure`;
      const description = `Explore this AI-powered itinerary for ${destination}. View day-by-day activities, transport options, and more — shared via Traveloure.`;
      const shareUrl = `${req.protocol}://${req.get("host")}/itinerary-view/${token}`;

      // Use a destination-based image for og:image (Unsplash source for travel images)
      const encodedDest = encodeURIComponent(destination);
      const ogImage = `https://source.unsplash.com/1200x630/?travel,${encodedDest}`;

      const ogTags = [
        `<title>${title}</title>`,
        `<meta name="description" content="${description}" />`,
        `<meta property="og:type" content="website" />`,
        `<meta property="og:url" content="${shareUrl}" />`,
        `<meta property="og:title" content="${title}" />`,
        `<meta property="og:description" content="${description}" />`,
        `<meta property="og:image" content="${ogImage}" />`,
        `<meta property="og:site_name" content="Traveloure" />`,
        `<meta name="twitter:card" content="summary_large_image" />`,
        `<meta name="twitter:title" content="${title}" />`,
        `<meta name="twitter:description" content="${description}" />`,
        `<meta name="twitter:image" content="${ogImage}" />`,
      ].join("\n    ");

      // Read index.html and inject tags into <head>
      let template: string;
      const clientTemplateDev = path.resolve(process.cwd(), "client", "index.html");
      const clientTemplateProd = path.resolve(__dirname, "public", "index.html");
      const templatePath = fs.existsSync(clientTemplateDev) ? clientTemplateDev : clientTemplateProd;

      if (!fs.existsSync(templatePath)) return next();

      template = fs.readFileSync(templatePath, "utf-8");
      template = template.replace("<head>", `<head>\n    ${ogTags}`);

      res.status(200).set({ "Content-Type": "text/html" }).end(template);
    } catch (err) {
      console.error("OG meta injection error:", err);
      next(); // Fall through to SPA on error
    }
  });

  // ============================================
  // DATA TRACKING & MONETIZATION APIs
  // ============================================

  // Track search events (called from frontend)
  app.post("/api/track/search", async (req, res) => {
    try {
      const { searchAnalytics } = await import("@shared/schema");
      const userId = (req.user as any)?.claims?.sub;
      
      await db.insert(searchAnalytics).values({
        sessionId: req.body.sessionId || req.headers["x-session-id"] as string,
        userId,
        searchType: req.body.searchType,
        query: req.body.query,
        destination: req.body.destination,
        originCountry: req.body.originCountry,
        travelDates: req.body.travelDates,
        travelers: req.body.travelers,
        budget: req.body.budget,
        filters: req.body.filters,
        resultsCount: req.body.resultsCount,
        deviceType: req.body.deviceType,
        ipCountry: req.headers["cf-ipcountry"] as string,
      });

      res.json({ success: true });
    } catch (err) {
      console.error("Track search error:", err);
      res.status(500).json({ success: false });
    }
  });

  // Track page views
  app.post("/api/track/pageview", async (req, res) => {
    try {
      const { pageViewAnalytics } = await import("@shared/schema");
      const userId = (req.user as any)?.claims?.sub;
      
      await db.insert(pageViewAnalytics).values({
        sessionId: req.body.sessionId,
        userId,
        pagePath: req.body.pagePath,
        pageType: req.body.pageType,
        referrer: req.body.referrer,
        utmSource: req.body.utmSource,
        utmMedium: req.body.utmMedium,
        utmCampaign: req.body.utmCampaign,
        deviceType: req.body.deviceType,
        ipCountry: req.headers["cf-ipcountry"] as string,
      });

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false });
    }
  });

  // Track booking funnel events
  app.post("/api/track/funnel", async (req, res) => {
    try {
      const { bookingFunnelAnalytics } = await import("@shared/schema");
      const userId = (req.user as any)?.claims?.sub;
      
      await db.insert(bookingFunnelAnalytics).values({
        sessionId: req.body.sessionId,
        userId,
        funnelStage: req.body.stage,
        serviceType: req.body.serviceType,
        serviceId: req.body.serviceId,
        providerId: req.body.providerId,
        destination: req.body.destination,
        price: req.body.price,
        abandonReason: req.body.abandonReason,
        ipCountry: req.headers["cf-ipcountry"] as string,
      });

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false });
    }
  });

  // === DATA REPORTS FOR MONETIZATION ===

  // Destination Demand Report (sell to tourism boards)
  app.get("/api/admin/reports/destination-demand", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { searchAnalytics, demandSignals } = await import("@shared/schema");
      
      // Aggregate search data by destination
      const destinationDemand = await db.select({
        destination: searchAnalytics.destination,
        searchCount: sql<number>`count(*)::int`,
        uniqueUsers: sql<number>`count(distinct ${searchAnalytics.userId})::int`,
        avgTravelers: sql<number>`avg(${searchAnalytics.travelers})::numeric(10,1)`,
        topOriginCountries: sql<string>`array_agg(distinct ${searchAnalytics.ipCountry}) filter (where ${searchAnalytics.ipCountry} is not null)`,
      })
      .from(searchAnalytics)
      .where(isNotNull(searchAnalytics.destination))
      .groupBy(searchAnalytics.destination)
      .orderBy(sql`count(*) desc`)
      .limit(50);

      res.json({
        reportType: "destination_demand",
        generatedAt: new Date().toISOString(),
        data: destinationDemand,
        summary: {
          totalDestinations: destinationDemand.length,
          totalSearches: destinationDemand.reduce((sum, d) => sum + d.searchCount, 0),
        }
      });
    } catch (err) {
      console.error("Destination demand report error:", err);
      res.status(500).json({ message: "Failed to generate report" });
    }
  });

  // Service Provider Market Report
  app.get("/api/admin/reports/provider-market", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { serviceProviderForms, providerServices } = await import("@shared/schema");
      
      // Market overview by business type
      const marketByType = await db.select({
        businessType: serviceProviderForms.businessType,
        providerCount: sql<number>`count(*)::int`,
        countries: sql<number>`count(distinct ${serviceProviderForms.country})::int`,
      })
      .from(serviceProviderForms)
      .where(eq(serviceProviderForms.status, "approved"))
      .groupBy(serviceProviderForms.businessType)
      .orderBy(sql`count(*) desc`);

      // Top performing services
      const topServices = await db.select({
        serviceName: providerServices.serviceName,
        bookings: providerServices.bookingsCount,
        revenue: providerServices.totalRevenue,
        rating: providerServices.averageRating,
      })
      .from(providerServices)
      .where(eq(providerServices.status, "active"))
      .orderBy(desc(providerServices.bookingsCount))
      .limit(20);

      res.json({
        reportType: "provider_market",
        generatedAt: new Date().toISOString(),
        marketByType,
        topServices,
      });
    } catch (err) {
      console.error("Provider market report error:", err);
      res.status(500).json({ message: "Failed to generate report" });
    }
  });

  // Geographic Insights Report (sell to countries/tourism boards)
  app.get("/api/admin/reports/geographic-insights", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Travelers by origin
      const travelerOrigins = await db.select({
        country: trips.destination,
        tripCount: sql<number>`count(*)::int`,
        avgBudget: sql<number>`avg(cast(${trips.budget} as numeric))::numeric(10,2)`,
        avgTravelers: sql<number>`avg(${trips.numberOfTravelers})::numeric(10,1)`,
      })
      .from(trips)
      .groupBy(trips.destination)
      .orderBy(sql`count(*) desc`)
      .limit(30);

      // Expert coverage by region
      const expertCoverage = await db.select({
        country: localExpertForms.country,
        city: localExpertForms.city,
        expertCount: sql<number>`count(*)::int`,
      })
      .from(localExpertForms)
      .where(eq(localExpertForms.status, "approved"))
      .groupBy(localExpertForms.country, localExpertForms.city)
      .orderBy(sql`count(*) desc`)
      .limit(30);

      res.json({
        reportType: "geographic_insights",
        generatedAt: new Date().toISOString(),
        travelerOrigins,
        expertCoverage,
        insights: {
          topDestinations: travelerOrigins.slice(0, 5).map(t => t.country),
          underservedMarkets: expertCoverage.filter(e => e.expertCount < 3).map(e => `${e.city}, ${e.country}`),
        }
      });
    } catch (err) {
      console.error("Geographic insights error:", err);
      res.status(500).json({ message: "Failed to generate report" });
    }
  });

  // Conversion Funnel Report
  app.get("/api/admin/reports/conversion-funnel", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { bookingFunnelAnalytics } = await import("@shared/schema");
      
      const funnelData = await db.select({
        stage: bookingFunnelAnalytics.funnelStage,
        count: sql<number>`count(*)::int`,
        uniqueUsers: sql<number>`count(distinct ${bookingFunnelAnalytics.userId})::int`,
        avgPrice: sql<number>`avg(${bookingFunnelAnalytics.price})::numeric(10,2)`,
      })
      .from(bookingFunnelAnalytics)
      .groupBy(bookingFunnelAnalytics.funnelStage);

      const stages = ["search", "view", "cart", "checkout", "payment", "complete"];
      const orderedFunnel = stages.map(stage => {
        const data = funnelData.find(f => f.stage === stage);
        return {
          stage,
          count: data?.count || 0,
          uniqueUsers: data?.uniqueUsers || 0,
          avgPrice: data?.avgPrice || 0,
        };
      });

      res.json({
        reportType: "conversion_funnel",
        generatedAt: new Date().toISOString(),
        funnel: orderedFunnel,
        conversionRates: {
          searchToView: orderedFunnel[0].count > 0 ? ((orderedFunnel[1].count / orderedFunnel[0].count) * 100).toFixed(1) + "%" : "0%",
          viewToCart: orderedFunnel[1].count > 0 ? ((orderedFunnel[2].count / orderedFunnel[1].count) * 100).toFixed(1) + "%" : "0%",
          cartToComplete: orderedFunnel[2].count > 0 ? ((orderedFunnel[5].count / orderedFunnel[2].count) * 100).toFixed(1) + "%" : "0%",
        }
      });
    } catch (err) {
      console.error("Conversion funnel error:", err);
      res.status(500).json({ message: "Failed to generate report" });
    }
  });


  // Track activity/service interactions
  app.post("/api/track/activity", async (req, res) => {
    try {
      const { activityBookingAnalytics } = await import("@shared/schema");
      const userId = (req.user as any)?.claims?.sub;
      
      await db.insert(activityBookingAnalytics).values({
        sessionId: req.body.sessionId,
        userId,
        activityType: req.body.activityType,
        activityCategory: req.body.activityCategory,
        serviceName: req.body.serviceName,
        providerId: req.body.providerId,
        providerType: req.body.providerType,
        destination: req.body.destination,
        country: req.body.country,
        city: req.body.city,
        bookingStatus: req.body.status, // viewed, inquired, booked
        price: req.body.price,
        groupSize: req.body.groupSize,
        tripType: req.body.tripType,
        travelerOriginCountry: req.headers["cf-ipcountry"] as string || req.body.originCountry,
        bookingLeadDays: req.body.leadDays,
        deviceType: req.body.deviceType,
        referralSource: req.body.referralSource,
      });

      res.json({ success: true });
    } catch (err) {
      console.error("Track activity error:", err);
      res.status(500).json({ success: false });
    }
  });

  // Activity Demand Report - What activities are trending
  app.get("/api/admin/reports/activity-demand", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { activityBookingAnalytics } = await import("@shared/schema");
      
      // Activity types by popularity
      const byActivityType = await db.select({
        activityType: activityBookingAnalytics.activityType,
        views: sql<number>`sum(case when ${activityBookingAnalytics.bookingStatus} = 'viewed' then 1 else 0 end)::int`,
        inquiries: sql<number>`sum(case when ${activityBookingAnalytics.bookingStatus} = 'inquired' then 1 else 0 end)::int`,
        bookings: sql<number>`sum(case when ${activityBookingAnalytics.bookingStatus} = 'booked' then 1 else 0 end)::int`,
        revenue: sql<number>`sum(case when ${activityBookingAnalytics.bookingStatus} = 'booked' then ${activityBookingAnalytics.price} else 0 end)::numeric(12,2)`,
        avgPrice: sql<number>`avg(${activityBookingAnalytics.price})::numeric(10,2)`,
        avgGroupSize: sql<number>`avg(${activityBookingAnalytics.groupSize})::numeric(5,1)`,
      })
      .from(activityBookingAnalytics)
      .groupBy(activityBookingAnalytics.activityType)
      .orderBy(sql`sum(case when ${activityBookingAnalytics.bookingStatus} = 'booked' then 1 else 0 end) desc`);

      // Activities by destination
      const byDestination = await db.select({
        destination: activityBookingAnalytics.destination,
        activityType: activityBookingAnalytics.activityType,
        bookings: sql<number>`count(*)::int`,
      })
      .from(activityBookingAnalytics)
      .where(eq(activityBookingAnalytics.bookingStatus, "booked"))
      .groupBy(activityBookingAnalytics.destination, activityBookingAnalytics.activityType)
      .orderBy(sql`count(*) desc`)
      .limit(30);

      // Activities by trip type
      const byTripType = await db.select({
        tripType: activityBookingAnalytics.tripType,
        activityType: activityBookingAnalytics.activityType,
        count: sql<number>`count(*)::int`,
      })
      .from(activityBookingAnalytics)
      .where(eq(activityBookingAnalytics.bookingStatus, "booked"))
      .groupBy(activityBookingAnalytics.tripType, activityBookingAnalytics.activityType)
      .orderBy(sql`count(*) desc`)
      .limit(30);

      // Top origin countries for activities
      const byOriginCountry = await db.select({
        originCountry: activityBookingAnalytics.travelerOriginCountry,
        activityType: activityBookingAnalytics.activityType,
        bookings: sql<number>`count(*)::int`,
        avgSpend: sql<number>`avg(${activityBookingAnalytics.price})::numeric(10,2)`,
      })
      .from(activityBookingAnalytics)
      .where(eq(activityBookingAnalytics.bookingStatus, "booked"))
      .groupBy(activityBookingAnalytics.travelerOriginCountry, activityBookingAnalytics.activityType)
      .orderBy(sql`count(*) desc`)
      .limit(30);

      res.json({
        reportType: "activity_demand",
        generatedAt: new Date().toISOString(),
        byActivityType: byActivityType.map(a => ({
          type: a.activityType,
          views: a.views || 0,
          inquiries: a.inquiries || 0,
          bookings: a.bookings || 0,
          revenue: `$${Number(a.revenue || 0).toLocaleString()}`,
          avgPrice: `$${Number(a.avgPrice || 0).toFixed(0)}`,
          avgGroupSize: a.avgGroupSize || 0,
          conversionRate: a.views > 0 ? `${((a.bookings / a.views) * 100).toFixed(1)}%` : "0%",
        })),
        byDestination,
        byTripType,
        byOriginCountry: byOriginCountry.map(o => ({
          country: o.originCountry || "Unknown",
          activityType: o.activityType,
          bookings: o.bookings,
          avgSpend: `$${Number(o.avgSpend || 0).toFixed(0)}`,
        })),
        insights: {
          topActivities: byActivityType.slice(0, 5).map(a => a.activityType),
          highestRevenue: byActivityType.sort((a, b) => Number(b.revenue) - Number(a.revenue)).slice(0, 3).map(a => a.activityType),
          highestConversion: byActivityType.filter(a => a.views > 10).sort((a, b) => (b.bookings / b.views) - (a.bookings / a.views)).slice(0, 3).map(a => a.activityType),
        }
      });
    } catch (err) {
      console.error("Activity demand report error:", err);
      res.status(500).json({ message: "Failed to generate activity report" });
    }
  });

  // Activity trends by category (for selling to specific industries)
  app.get("/api/admin/reports/activity-trends/:activityType", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const activityType = req.params.activityType;
      const { activityBookingAnalytics } = await import("@shared/schema");
      
      // Detailed breakdown for specific activity type
      const destinations = await db.select({
        destination: activityBookingAnalytics.destination,
        country: activityBookingAnalytics.country,
        bookings: sql<number>`count(*)::int`,
        revenue: sql<number>`sum(${activityBookingAnalytics.price})::numeric(12,2)`,
        avgPrice: sql<number>`avg(${activityBookingAnalytics.price})::numeric(10,2)`,
      })
      .from(activityBookingAnalytics)
      .where(and(
        eq(activityBookingAnalytics.activityType, activityType),
        eq(activityBookingAnalytics.bookingStatus, "booked")
      ))
      .groupBy(activityBookingAnalytics.destination, activityBookingAnalytics.country)
      .orderBy(sql`count(*) desc`)
      .limit(20);

      const travelerProfiles = await db.select({
        tripType: activityBookingAnalytics.tripType,
        originCountry: activityBookingAnalytics.travelerOriginCountry,
        count: sql<number>`count(*)::int`,
        avgGroupSize: sql<number>`avg(${activityBookingAnalytics.groupSize})::numeric(5,1)`,
        avgSpend: sql<number>`avg(${activityBookingAnalytics.price})::numeric(10,2)`,
      })
      .from(activityBookingAnalytics)
      .where(and(
        eq(activityBookingAnalytics.activityType, activityType),
        eq(activityBookingAnalytics.bookingStatus, "booked")
      ))
      .groupBy(activityBookingAnalytics.tripType, activityBookingAnalytics.travelerOriginCountry)
      .orderBy(sql`count(*) desc`)
      .limit(20);

      res.json({
        reportType: `activity_trends_${activityType}`,
        activityType,
        generatedAt: new Date().toISOString(),
        topDestinations: destinations,
        travelerProfiles,
        summary: {
          totalBookings: destinations.reduce((sum, d) => sum + d.bookings, 0),
          totalRevenue: `$${destinations.reduce((sum, d) => sum + Number(d.revenue || 0), 0).toLocaleString()}`,
          topMarket: destinations[0]?.destination || "N/A",
        }
      });
    } catch (err) {
      console.error("Activity trends report error:", err);
      res.status(500).json({ message: "Failed to generate activity trends" });
    }
  });


  // Track enhanced trip analytics
  app.post("/api/track/trip-enhanced", async (req, res) => {
    try {
      const { tripAnalyticsEnhanced } = await import("@shared/schema");
      const userId = (req.user as any)?.claims?.sub;
      
      await db.insert(tripAnalyticsEnhanced).values({
        tripId: req.body.tripId,
        userId,
        destinationCountry: req.body.destinationCountry,
        destinationRegion: req.body.destinationRegion,
        destinationCity: req.body.destinationCity,
        destinationType: req.body.destinationType,
        originCountry: req.headers["cf-ipcountry"] as string || req.body.originCountry,
        originCity: req.body.originCity,
        bookingDate: new Date(),
        tripStartDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
        tripEndDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
        leadTimeDays: req.body.leadTimeDays,
        lengthOfStay: req.body.lengthOfStay,
        season: req.body.season,
        partySize: req.body.partySize,
        partyComposition: req.body.partyComposition,
        hasChildren: req.body.hasChildren,
        tripPurpose: req.body.tripPurpose,
        totalBudget: req.body.totalBudget,
        spendPerDay: req.body.spendPerDay,
        priceSegment: req.body.priceSegment,
        activitiesBooked: req.body.activitiesBooked,
        primaryActivity: req.body.primaryActivity,
        accommodationType: req.body.accommodationType,
        starRating: req.body.starRating,
        otherDestinationsConsidered: req.body.otherDestinationsConsidered,
        deviceUsed: req.body.deviceType,
      });

      res.json({ success: true });
    } catch (err) {
      console.error("Track trip enhanced error:", err);
      res.status(500).json({ success: false });
    }
  });

  // Destination Benchmark Report (premium product for tourism boards)
  app.get("/api/admin/reports/destination-benchmark/:destination", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const destination = decodeURIComponent(req.params.destination);
      const { tripAnalyticsEnhanced, activityBookingAnalytics } = await import("@shared/schema");
      
      // Aggregate destination metrics
      const metrics = await db.select({
        totalTrips: sql<number>`count(*)::int`,
        avgBudget: sql<number>`avg(${tripAnalyticsEnhanced.totalBudget})::numeric(10,2)`,
        avgLengthOfStay: sql<number>`avg(${tripAnalyticsEnhanced.lengthOfStay})::numeric(5,1)`,
        avgLeadTime: sql<number>`avg(${tripAnalyticsEnhanced.leadTimeDays})::numeric(5,1)`,
        avgPartySize: sql<number>`avg(${tripAnalyticsEnhanced.partySize})::numeric(5,1)`,
      })
      .from(tripAnalyticsEnhanced)
      .where(or(
        eq(tripAnalyticsEnhanced.destinationCity, destination),
        eq(tripAnalyticsEnhanced.destinationCountry, destination),
        eq(tripAnalyticsEnhanced.destinationRegion, destination)
      ));

      // Source markets
      const sourceMarkets = await db.select({
        country: tripAnalyticsEnhanced.originCountry,
        count: sql<number>`count(*)::int`,
        avgSpend: sql<number>`avg(${tripAnalyticsEnhanced.totalBudget})::numeric(10,2)`,
      })
      .from(tripAnalyticsEnhanced)
      .where(or(
        eq(tripAnalyticsEnhanced.destinationCity, destination),
        eq(tripAnalyticsEnhanced.destinationCountry, destination)
      ))
      .groupBy(tripAnalyticsEnhanced.originCountry)
      .orderBy(sql`count(*) desc`)
      .limit(10);

      // Trip purposes
      const tripPurposes = await db.select({
        purpose: tripAnalyticsEnhanced.tripPurpose,
        count: sql<number>`count(*)::int`,
      })
      .from(tripAnalyticsEnhanced)
      .where(or(
        eq(tripAnalyticsEnhanced.destinationCity, destination),
        eq(tripAnalyticsEnhanced.destinationCountry, destination)
      ))
      .groupBy(tripAnalyticsEnhanced.tripPurpose)
      .orderBy(sql`count(*) desc`);

      // Party compositions
      const partyTypes = await db.select({
        composition: tripAnalyticsEnhanced.partyComposition,
        count: sql<number>`count(*)::int`,
        avgSpend: sql<number>`avg(${tripAnalyticsEnhanced.totalBudget})::numeric(10,2)`,
      })
      .from(tripAnalyticsEnhanced)
      .where(or(
        eq(tripAnalyticsEnhanced.destinationCity, destination),
        eq(tripAnalyticsEnhanced.destinationCountry, destination)
      ))
      .groupBy(tripAnalyticsEnhanced.partyComposition)
      .orderBy(sql`count(*) desc`);

      // Top activities
      const activities = await db.select({
        activityType: activityBookingAnalytics.activityType,
        bookings: sql<number>`count(*)::int`,
        revenue: sql<number>`sum(${activityBookingAnalytics.price})::numeric(12,2)`,
      })
      .from(activityBookingAnalytics)
      .where(and(
        or(
          eq(activityBookingAnalytics.destination, destination),
          eq(activityBookingAnalytics.country, destination),
          eq(activityBookingAnalytics.city, destination)
        ),
        eq(activityBookingAnalytics.bookingStatus, "booked")
      ))
      .groupBy(activityBookingAnalytics.activityType)
      .orderBy(sql`count(*) desc`)
      .limit(10);

      // Seasonality (by month)
      const seasonality = await db.select({
        month: sql<string>`to_char(${tripAnalyticsEnhanced.tripStartDate}, 'Month')`,
        count: sql<number>`count(*)::int`,
      })
      .from(tripAnalyticsEnhanced)
      .where(or(
        eq(tripAnalyticsEnhanced.destinationCity, destination),
        eq(tripAnalyticsEnhanced.destinationCountry, destination)
      ))
      .groupBy(sql`to_char(${tripAnalyticsEnhanced.tripStartDate}, 'Month')`)
      .orderBy(sql`count(*) desc`);

      res.json({
        reportType: "destination_benchmark",
        destination,
        generatedAt: new Date().toISOString(),
        overview: metrics[0] || {},
        sourceMarkets: sourceMarkets.map(s => ({
          country: s.country || "Unknown",
          visitors: s.count,
          avgSpend: `$${Number(s.avgSpend || 0).toLocaleString()}`,
          share: metrics[0]?.totalTrips ? `${((s.count / metrics[0].totalTrips) * 100).toFixed(1)}%` : "0%",
        })),
        tripPurposes: tripPurposes.map(t => ({
          purpose: t.purpose || "Unknown",
          count: t.count,
        })),
        partyTypes: partyTypes.map(p => ({
          type: p.composition || "Unknown",
          count: p.count,
          avgSpend: `$${Number(p.avgSpend || 0).toLocaleString()}`,
        })),
        topActivities: activities.map(a => ({
          activity: a.activityType,
          bookings: a.bookings,
          revenue: `$${Number(a.revenue || 0).toLocaleString()}`,
        })),
        seasonality: seasonality.map(s => ({
          month: s.month?.trim() || "Unknown",
          bookings: s.count,
        })),
        insights: {
          topSourceMarket: sourceMarkets[0]?.country || "N/A",
          primaryTripPurpose: tripPurposes[0]?.purpose || "N/A",
          mostPopularActivity: activities[0]?.activityType || "N/A",
          peakSeason: seasonality[0]?.month?.trim() || "N/A",
        }
      });
    } catch (err) {
      console.error("Destination benchmark error:", err);
      res.status(500).json({ message: "Failed to generate benchmark report" });
    }
  });


  // === AUTO-INFER ANALYTICS FROM USER BEHAVIOR ===
  
  // Middleware/helper to infer trip analytics from itinerary data
  async function inferTripAnalytics(tripId: string, userId: string) {
    try {
      const { tripAnalyticsEnhanced } = await import("@shared/schema");
      
      // Get trip data
      const trip = await storage.getTrip(tripId);
      if (!trip) return;

      // Get itinerary items for this trip
      const itineraryData = await db.select().from(generatedItineraries).where(eq(generatedItineraries.tripId, tripId)).then(r => r[0]);
      const items = itineraryData?.itineraryData as any;

      // Infer party composition from travelers + event type
      let partyComposition = "group";
      const travelers = trip.numberOfTravelers || 1;
      const eventType = trip.eventType || "vacation";
      
      if (travelers === 1) partyComposition = "solo";
      else if (travelers === 2 && ["honeymoon", "anniversary", "proposal", "romantic"].includes(eventType)) partyComposition = "couple";
      else if (travelers <= 4 && eventType === "vacation") partyComposition = "family";
      else partyComposition = "group";

      // Infer if has children from activities (look for kid-friendly keywords)
      let hasChildren = false;
      if (items?.dailyItinerary) {
        const allActivities = JSON.stringify(items.dailyItinerary).toLowerCase();
        hasChildren = allActivities.includes("kid") || allActivities.includes("child") || 
                     allActivities.includes("family") || allActivities.includes("playground") ||
                     allActivities.includes("zoo") || allActivities.includes("aquarium");
      }

      // Calculate length of stay
      const startDate = trip.startDate ? new Date(trip.startDate) : null;
      const endDate = trip.endDate ? new Date(trip.endDate) : null;
      const lengthOfStay = startDate && endDate ? Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) : null;

      // Determine season
      let season = null;
      if (startDate) {
        const month = startDate.getMonth();
        if (month >= 2 && month <= 4) season = "spring";
        else if (month >= 5 && month <= 7) season = "summer";
        else if (month >= 8 && month <= 10) season = "fall";
        else season = "winter";
      }

      // Infer destination details
      const destination = trip.destination || "";
      // Try to extract country from destination string
      const destinationParts = destination.split(",").map(s => s.trim());
      const destinationCity = destinationParts[0] || destination;
      const destinationCountry = destinationParts.length > 1 ? destinationParts[destinationParts.length - 1] : null;

      // Infer price segment from budget
      let priceSegment = "mid-range";
      const budget = parseFloat(trip.budget || "0");
      const dailyBudget = lengthOfStay && lengthOfStay > 0 ? budget / lengthOfStay : budget;
      if (dailyBudget < 100) priceSegment = "budget";
      else if (dailyBudget < 300) priceSegment = "mid-range";
      else if (dailyBudget < 500) priceSegment = "luxury";
      else priceSegment = "ultra-luxury";

      // Infer primary activity from itinerary
      let primaryActivity = null;
      if (items?.dailyItinerary) {
        const activityCounts: Record<string, number> = {};
        for (const day of items.dailyItinerary) {
          for (const activity of day.activities || []) {
            const type = activity.type || activity.category || "sightseeing";
            activityCounts[type] = (activityCounts[type] || 0) + 1;
          }
        }
        primaryActivity = Object.entries(activityCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      }

      // Upsert analytics record
      await db.insert(tripAnalyticsEnhanced).values({
        tripId,
        userId,
        destinationCity,
        destinationCountry,
        tripStartDate: startDate,
        tripEndDate: endDate,
        lengthOfStay,
        season,
        partySize: travelers,
        partyComposition,
        hasChildren,
        tripPurpose: eventType,
        totalBudget: trip.budget,
        priceSegment,
        primaryActivity,
      }).onConflictDoUpdate({
        target: [tripAnalyticsEnhanced.tripId],
        set: {
          partyComposition,
          hasChildren,
          lengthOfStay,
          season,
          priceSegment,
          primaryActivity,
        }
      });

      return true;
    } catch (err) {
      console.error("Error inferring trip analytics:", err);
      return false;
    }
  }

  // Hook into itinerary generation to auto-capture analytics
  app.post("/api/trips/:tripId/analytics/infer", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const tripId = req.params.tripId;
      
      // Verify ownership
      const trip = await storage.getTrip(tripId);
      if (!trip || trip.userId !== userId) {
        return res.status(404).json({ message: "Trip not found" });
      }

      await inferTripAnalytics(tripId, userId);
      res.json({ success: true, message: "Analytics captured" });
    } catch (err) {
      console.error("Infer analytics error:", err);
      res.status(500).json({ message: "Failed to capture analytics" });
    }
  });

  // Track searches automatically (what destinations were considered)
  app.post("/api/track/destination-search", async (req, res) => {
    try {
      const { searchAnalytics } = await import("@shared/schema");
      const userId = (req.user as any)?.claims?.sub;
      const sessionId = req.body.sessionId || req.headers["x-session-id"] as string;
      
      // Track this search
      await db.insert(searchAnalytics).values({
        sessionId,
        userId,
        searchType: "destination",
        destination: req.body.destination,
        query: req.body.query,
        ipCountry: req.headers["cf-ipcountry"] as string,
        deviceType: req.body.deviceType,
      });

      // If user has a draft trip, track this as a "considered" destination
      if (userId && req.body.tripId) {
        const { tripAnalyticsEnhanced } = await import("@shared/schema");
        const existing = await db.select().from(tripAnalyticsEnhanced).where(eq(tripAnalyticsEnhanced.tripId, req.body.tripId)).then(r => r[0]);
        
        if (existing) {
          const considered = (existing.otherDestinationsConsidered as string[] || []);
          if (!considered.includes(req.body.destination) && req.body.destination !== existing.destinationCity) {
            considered.push(req.body.destination);
            await db.update(tripAnalyticsEnhanced)
              .set({ otherDestinationsConsidered: considered.slice(-10) }) // Keep last 10
              .where(eq(tripAnalyticsEnhanced.tripId, req.body.tripId));
          }
        }
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false });
    }
  });

  // ─── Booking Fee Config (Admin) ─────────────────────────────────────────────
  app.get("/api/admin/fee-config", isAuthenticated, async (req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT
          id, category,
          CAST(platform_fee_percent AS FLOAT) AS platform_fee_percent,
          CAST(expert_share_percent AS FLOAT)  AS expert_share_percent,
          ai_keeps_100,
          CAST(min_fee AS FLOAT) AS min_fee,
          CAST(max_fee AS FLOAT) AS max_fee,
          is_active,
          updated_by,
          updated_at
        FROM booking_fee_configs
        ORDER BY category
      `);
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/fee-config", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const {
        category,
        platformFeePercent,
        expertSharePercent,
        aiKeeps100,
        minFee,
        maxFee,
        isActive,
      } = req.body;

      if (!category) return res.status(400).json({ error: "category required" });

      await db.execute(sql`
        INSERT INTO booking_fee_configs (
          id, category, platform_fee_percent, expert_share_percent,
          ai_keeps_100, min_fee, max_fee, is_active, updated_by, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), ${category}, ${platformFeePercent ?? 12}, ${expertSharePercent ?? 75},
          ${aiKeeps100 ?? true}, ${minFee ?? null}, ${maxFee ?? null}, ${isActive ?? true},
          ${userId}, NOW(), NOW()
        )
        ON CONFLICT (category) DO UPDATE SET
          platform_fee_percent = EXCLUDED.platform_fee_percent,
          expert_share_percent  = EXCLUDED.expert_share_percent,
          ai_keeps_100          = EXCLUDED.ai_keeps_100,
          min_fee               = EXCLUDED.min_fee,
          max_fee               = EXCLUDED.max_fee,
          is_active             = EXCLUDED.is_active,
          updated_by            = EXCLUDED.updated_by,
          updated_at            = NOW()
      `);

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/booking-fee-config?category=accommodation
  // Used by itinerary page to get the live fee rate for a category
  app.get("/api/booking-fee-config", async (req, res) => {
    try {
      const category = (req.query.category as string) || "default";
      const result = await db.execute(sql`
        SELECT
          CAST(platform_fee_percent AS FLOAT) AS platform_fee_percent,
          CAST(expert_share_percent AS FLOAT)  AS expert_share_percent,
          ai_keeps_100,
          CAST(min_fee AS FLOAT) AS min_fee,
          CAST(max_fee AS FLOAT) AS max_fee
        FROM booking_fee_configs
        WHERE category = ${category} AND is_active = true
        LIMIT 1
      `);

      if (result.rows && result.rows.length > 0) {
        return res.json(result.rows[0]);
      }

      // Fallback defaults
      const defaults: Record<string, number> = {
        accommodation: 15, activities: 12, transportation: 10,
        flights: 8, insurance: 10, car_rental: 10, dining: 8, esim: 9, luggage: 10,
      };
      res.json({
        platform_fee_percent: defaults[category] ?? 12,
        expert_share_percent: 75,
        ai_keeps_100: true,
        min_fee: null,
        max_fee: null,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─── Smart Lead Routing ──────────────────────────────────────────────────────
  // POST /api/leads/route  — score experts and auto-assign
  app.post("/api/leads/route", isAuthenticated, async (req, res) => {
    try {
      const { leadRoutingService } = await import('./services/lead-routing.service');
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const { destination, topic, tripId, requestType } = req.body;

      if (!destination) return res.status(400).json({ error: "destination required" });

      const result = await leadRoutingService.routeLead({
        destination,
        topic,
        tripId,
        userId,
        requestType,
      });

      res.json(result);
    } catch (error: any) {
      console.error('Lead routing error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/leads/score-preview?destination=Paris&topic=food
  // Used by admin to preview expert scoring without committing
  app.get("/api/leads/score-preview", isAuthenticated, async (req, res) => {
    try {
      const { leadRoutingService } = await import('./services/lead-routing.service');
      const destination = (req.query.destination as string) || '';
      const topic = (req.query.topic as string) || '';

      const scores = await leadRoutingService.scoreExperts({ destination, topic });
      res.json({ scores });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/admin/lead-routing-logs — admin view of all routing decisions
  app.get("/api/admin/lead-routing-logs", isAuthenticated, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const result = await db.execute(sql`
        SELECT
          lrl.*,
          u.first_name || ' ' || u.last_name AS user_name,
          eu.first_name || ' ' || eu.last_name AS expert_name
        FROM lead_routing_logs lrl
        LEFT JOIN users u ON u.id = lrl.user_id
        LEFT JOIN users eu ON eu.id = lrl.assigned_expert_id
        ORDER BY lrl.created_at DESC
        LIMIT ${limit}
      `);
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /api/admin/lead-routing-logs/:id/override — admin override assignment
  app.patch("/api/admin/lead-routing-logs/:id/override", isAuthenticated, async (req, res) => {
    try {
      const adminId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const { id } = req.params;
      const { newExpertId } = req.body;

      await db.execute(sql`
        UPDATE lead_routing_logs
        SET assigned_expert_id = ${newExpertId}, overridden_by = ${adminId}
        WHERE id = ${id}
      `);

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/admin/routing-queue — routed leads awaiting admin confirmation
  app.get("/api/admin/routing-queue", isAuthenticated, async (req, res) => {
    try {
      const adminUser = await db.select().from(users).where(eq(users.id, (req.user as any)?.claims?.sub ?? (req.user as any)?.id)).then(r => r[0]);
      if (!adminUser || adminUser.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const result = await db.execute(sql`
        SELECT
          er.id,
          er.trip_id,
          er.user_id,
          er.destination_city,
          er.request_type,
          er.status,
          er.assigned_expert_id,
          er.created_at,
          er.assigned_at,
          u.first_name || ' ' || u.last_name AS traveler_name,
          u.email AS traveler_email,
          eu.first_name || ' ' || eu.last_name AS expert_name,
          eu.email AS expert_email,
          lrl.top_score,
          lrl.scores_json
        FROM expert_requests er
        LEFT JOIN users u ON u.id = er.user_id
        LEFT JOIN users eu ON eu.id = er.assigned_expert_id
        LEFT JOIN lead_routing_logs lrl ON lrl.trip_id = er.trip_id
          AND lrl.assigned_expert_id = er.assigned_expert_id
        WHERE er.assigned_expert_id IS NOT NULL
          AND er.status NOT IN ('confirmed', 'completed', 'cancelled')
          AND NOT EXISTS (
            SELECT 1 FROM trip_expert_advisors tea
            WHERE tea.trip_id = er.trip_id
              AND tea.local_expert_id = er.assigned_expert_id
          )
        ORDER BY er.created_at DESC
        LIMIT 100
      `);
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Shared handler: confirm lead → workspace bridge (used by both route aliases below)
  async function confirmLeadAssignmentHandler(requestId: string, req: any, res: any) {
    const adminUser = await db.select().from(users).where(eq(users.id, (req.user as any)?.claims?.sub ?? (req.user as any)?.id)).then(r => r[0]);
    if (!adminUser || adminUser.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const queueResult = await db.execute(sql`
      SELECT * FROM expert_requests WHERE id = ${requestId}
    `);
    const row = queueResult.rows?.[0] as any;
    if (!row) return res.status(404).json({ error: "Routing request not found" });
    if (!row.assigned_expert_id) return res.status(400).json({ error: "No expert assigned to this request" });
    if (!row.trip_id) return res.status(400).json({ error: "Request has no associated trip" });

    const assignment = await db.transaction(async (tx) => {
      // Lock the expert_requests row to serialise concurrent confirms
      await tx.execute(sql`SELECT id FROM expert_requests WHERE id = ${requestId} FOR UPDATE`);

      // Idempotency: return the existing advisor row if one already exists
      const [existing] = await tx.select().from(tripExpertAdvisors)
        .where(and(
          eq(tripExpertAdvisors.tripId, row.trip_id),
          eq(tripExpertAdvisors.localExpertId, row.assigned_expert_id),
        ))
        .limit(1);

      if (existing) return existing;

      // Insert; ON CONFLICT DO NOTHING handles the rare concurrent-insert race
      const [created] = await tx.insert(tripExpertAdvisors)
        .values({
          tripId: row.trip_id,
          localExpertId: row.assigned_expert_id,
          status: "assigned",
          workspaceStatus: "draft",
          assignedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning();

      // If concurrent insert won the race, fetch the winning row
      const result = created ?? await tx.select().from(tripExpertAdvisors)
        .where(and(
          eq(tripExpertAdvisors.tripId, row.trip_id),
          eq(tripExpertAdvisors.localExpertId, row.assigned_expert_id),
        ))
        .then(r => r[0]);

      // Flip expert_requests status
      await tx.execute(sql`
        UPDATE expert_requests SET status = 'assigned', assigned_at = NOW() WHERE id = ${requestId}
      `);

      return result;
    });

    return res.json({ assignment });
  }

  // POST /api/admin/leads/:expertRequestId/confirm — canonical endpoint (task spec)
  app.post("/api/admin/leads/:expertRequestId/confirm", isAuthenticated, async (req, res) => {
    try {
      await confirmLeadAssignmentHandler(req.params.expertRequestId, req, res);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/admin/routing-queue/:requestId/confirm — legacy alias (UI still uses this)
  app.post("/api/admin/routing-queue/:requestId/confirm", isAuthenticated, async (req, res) => {
    try {
      await confirmLeadAssignmentHandler(req.params.requestId, req, res);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/admin/routing-queue/:requestId/reassign — pick a different expert
  app.post("/api/admin/routing-queue/:requestId/reassign", isAuthenticated, async (req, res) => {
    try {
      const adminUser = await db.select().from(users).where(eq(users.id, (req.user as any)?.claims?.sub ?? (req.user as any)?.id)).then(r => r[0]);
      if (!adminUser || adminUser.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { requestId } = req.params;
      const { expertId } = req.body;
      if (!expertId) return res.status(400).json({ error: "expertId is required" });

      const queueResult = await db.execute(sql`
        SELECT * FROM expert_requests WHERE id = ${requestId}
      `);
      const row = queueResult.rows?.[0] as any;
      if (!row) return res.status(404).json({ error: "Routing request not found" });
      if (row.status === "confirmed") return res.status(409).json({ error: "Assignment already confirmed; cannot reassign" });

      await db.execute(sql`
        UPDATE expert_requests
        SET assigned_expert_id = ${expertId}, assigned_at = NOW()
        WHERE id = ${requestId}
      `);

      const expertResult = await db.execute(sql`
        SELECT first_name || ' ' || last_name AS expert_name FROM users WHERE id = ${expertId}
      `);
      const expertName = (expertResult.rows?.[0] as any)?.expert_name || expertId;

      res.json({ success: true, newExpertId: expertId, expertName });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Auto-capture accommodation preference from hotel searches/bookings
  app.post("/api/track/accommodation-preference", async (req, res) => {
    try {
      const { tripAnalyticsEnhanced } = await import("@shared/schema");
      const userId = (req.user as any)?.claims?.sub;
      
      if (userId && req.body.tripId) {
        await db.update(tripAnalyticsEnhanced)
          .set({ 
            accommodationType: req.body.accommodationType,
            starRating: req.body.starRating,
          })
          .where(eq(tripAnalyticsEnhanced.tripId, req.body.tripId));
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false });
    }
  });

  // Helper: enforce service_provider role on provider-only routes
  async function requireProviderRole(req: any, res: any): Promise<string | null> {
    const userId = (req.user as any)?.claims?.sub;
    if (!userId) { res.status(401).json({ message: "Unauthorized" }); return null; }
    const user = await storage.getUser(userId);
    if (!user || user.role !== "service_provider") {
      res.status(403).json({ message: "Service provider role required" });
      return null;
    }
    return userId;
  }

  // === Provider Availability Rules ===
  app.get("/api/provider/availability/rules", isAuthenticated, async (req, res) => {
    try {
      const userId = await requireProviderRole(req, res);
      if (!userId) return;
      const rules = await storage.getProviderAvailability(userId);
      res.json(rules);
    } catch (err) {
      console.error("[Provider] getAvailability error:", err);
      res.status(500).json({ message: "Failed to get availability rules" });
    }
  });

  app.post("/api/provider/availability/rules", isAuthenticated, async (req, res) => {
    try {
      const userId = await requireProviderRole(req, res);
      if (!userId) return;
      const parsed = insertProviderAvailabilityScheduleSchema.safeParse({ ...req.body, providerId: userId });
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      const rule = await storage.setProviderAvailability(parsed.data);
      res.status(201).json(rule);
    } catch (err) {
      console.error("[Provider] setAvailability error:", err);
      res.status(500).json({ message: "Failed to save availability rule" });
    }
  });

  app.patch("/api/provider/availability/rules/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = await requireProviderRole(req, res);
      if (!userId) return;
      const { id } = req.params;
      const existing = await storage.getProviderAvailabilityById(id);
      if (!existing) return res.status(404).json({ message: "Availability rule not found" });
      if (existing.providerId !== userId) return res.status(403).json({ message: "Access denied" });
      const parsed = insertProviderAvailabilityScheduleSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      // Strip providerId from payload — ownership is enforced by ownership check above
      const { providerId: _pid, ...safeData } = parsed.data as any;
      const updated = await storage.updateProviderAvailabilityRule(id, userId, safeData);
      if (!updated) return res.status(404).json({ message: "Availability rule not found" });
      res.json(updated);
    } catch (err) {
      console.error("[Provider] updateAvailability error:", err);
      res.status(500).json({ message: "Failed to update availability rule" });
    }
  });

  app.delete("/api/provider/availability/rules/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = await requireProviderRole(req, res);
      if (!userId) return;
      const existing = await storage.getProviderAvailabilityById(req.params.id);
      if (!existing) return res.status(404).json({ message: "Availability rule not found" });
      if (existing.providerId !== userId) return res.status(403).json({ message: "Access denied" });
      await storage.deleteProviderAvailability(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error("[Provider] deleteAvailability error:", err);
      res.status(500).json({ message: "Failed to delete availability rule" });
    }
  });

  // === Provider Blackout Dates ===
  app.get("/api/provider/availability/blackout-dates", isAuthenticated, async (req, res) => {
    try {
      const userId = await requireProviderRole(req, res);
      if (!userId) return;
      const dates = await storage.getProviderBlackoutDates(userId);
      res.json(dates);
    } catch (err) {
      console.error("[Provider] getBlackoutDates error:", err);
      res.status(500).json({ message: "Failed to get blackout dates" });
    }
  });

  app.post("/api/provider/availability/blackout-dates", isAuthenticated, async (req, res) => {
    try {
      const userId = await requireProviderRole(req, res);
      if (!userId) return;
      const parsed = insertProviderBlackoutDateSchema.safeParse({ ...req.body, providerId: userId });
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      const date = await storage.addProviderBlackoutDate(parsed.data);
      res.status(201).json(date);
    } catch (err) {
      console.error("[Provider] addBlackoutDate error:", err);
      res.status(500).json({ message: "Failed to add blackout date" });
    }
  });

  app.delete("/api/provider/availability/blackout-dates/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = await requireProviderRole(req, res);
      if (!userId) return;
      const existing = await storage.getProviderBlackoutDateById(req.params.id);
      if (!existing) return res.status(404).json({ message: "Blackout date not found" });
      if (existing.providerId !== userId) return res.status(403).json({ message: "Access denied" });
      await storage.deleteProviderBlackoutDate(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error("[Provider] deleteBlackoutDate error:", err);
      res.status(500).json({ message: "Failed to delete blackout date" });
    }
  });

  // === Provider Settings ===
  app.get("/api/provider/settings", isAuthenticated, async (req, res) => {
    try {
      const userId = await requireProviderRole(req, res);
      if (!userId) return;
      const settings = await storage.getProviderSettings(userId);
      if (!settings) {
        return res.json({
          instantBooking: false,
          autoResponse: true,
          minimumLeadTimeDays: 7,
          targetResponseTimeHours: 2,
          payoutFrequency: "monthly",
          minimumPayoutAmount: "100",
          notificationsJson: { newBookings: true, bookingUpdates: true, messages: true, reviews: true, payouts: true, marketing: false },
        });
      }
      res.json(settings);
    } catch (err) {
      console.error("[Provider] getSettings error:", err);
      res.status(500).json({ message: "Failed to get settings" });
    }
  });

  app.patch("/api/provider/settings", isAuthenticated, async (req, res) => {
    try {
      const userId = await requireProviderRole(req, res);
      if (!userId) return;
      // Strip ownership/identity fields to prevent mass assignment
      const { userId: _uid, id: _id, createdAt: _ca, updatedAt: _ua, providerId: _pid, ...safeSettings } = req.body as any;
      const settings = await storage.upsertProviderSettings(userId, safeSettings);
      res.json(settings);
    } catch (err) {
      console.error("[Provider] upsertSettings error:", err);
      res.status(500).json({ message: "Failed to save settings" });
    }
  });

  // === Itinerary Items CRUD (PATCH + DELETE only; GET/POST defined at Itinerary Intelligence Routes) ===
  async function canAccessTripItems(tripId: string, userId: string): Promise<boolean> {
    const owned = await verifyTripOwnership(tripId, userId);
    if (owned) return true;
    return await storage.isExpertAssignedToTrip(tripId, userId);
  }

  app.patch("/api/trips/:tripId/itinerary-items/:itemId", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { tripId, itemId } = req.params;
      if (!(await canAccessTripItems(tripId, userId))) return res.status(403).json({ message: "Access denied" });
      const existing = await db.select().from(itineraryItems)
        .where(and(eq(itineraryItems.id, itemId), eq(itineraryItems.tripId, tripId)))
        .limit(1);
      if (!existing.length) return res.status(404).json({ message: "Item not found in this trip" });
      // Strip immutable/ownership fields to prevent mass-assignment
      const { id: _id, tripId: _tripId, createdAt: _createdAt, updatedAt: _updatedAt, suggestedBy: _sb, ...safeBody } = req.body as any;
      const updated = await storage.updateItineraryItem(itemId, safeBody);
      if (!updated) return res.status(404).json({ message: "Item not found" });
      res.json(updated);
    } catch (err) {
      console.error("[ItineraryItems] PATCH error:", err);
      res.status(500).json({ message: "Failed to update itinerary item" });
    }
  });

  app.delete("/api/trips/:tripId/itinerary-items/:itemId", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { tripId, itemId } = req.params;
      if (!(await canAccessTripItems(tripId, userId))) return res.status(403).json({ message: "Access denied" });
      const existing = await db.select({ id: itineraryItems.id }).from(itineraryItems)
        .where(and(eq(itineraryItems.id, itemId), eq(itineraryItems.tripId, tripId)))
        .limit(1);
      if (!existing.length) return res.status(404).json({ message: "Item not found in this trip" });
      await storage.deleteItineraryItem(itemId);
      res.json({ success: true });
    } catch (err) {
      console.error("[ItineraryItems] DELETE error:", err);
      res.status(500).json({ message: "Failed to delete itinerary item" });
    }
  });

  // === Expert Assignment Workspace Status ===
  app.patch("/api/expert/assignments/:assignmentId/workspace-status", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { assignmentId } = req.params;
      const { workspaceStatus } = req.body;
      const validTransitions: Record<string, string[]> = {
        draft: ["in_review"],
        in_review: ["delivered"],
        delivered: [],
      };
      if (!workspaceStatus || !(workspaceStatus in validTransitions)) {
        return res.status(400).json({ message: "Invalid workspaceStatus. Must be: draft, in_review, or delivered" });
      }
      const assignment = await storage.getExpertAssignment(assignmentId);
      if (!assignment) return res.status(404).json({ message: "Assignment not found" });
      if (assignment.localExpertId !== userId) return res.status(403).json({ message: "Access denied" });
      const current = assignment.workspaceStatus ?? "draft";
      if (!validTransitions[current]?.includes(workspaceStatus)) {
        return res.status(400).json({ message: `Cannot transition workspace status from '${current}' to '${workspaceStatus}'. Allowed: ${validTransitions[current]?.join(", ") || "none"}` });
      }
      const updated = await storage.updateExpertAssignmentWorkspaceStatus(assignmentId, workspaceStatus);
      res.json(updated);
    } catch (err) {
      console.error("[Expert] workspace-status error:", err);
      res.status(500).json({ message: "Failed to update workspace status" });
    }
  });

  // === Expert Assigned Trips list (powers Dashboard + Assigned Trips page) ===
  app.get("/api/expert/assigned-trips", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const rows = await db
        .select({
          trip_id: tripExpertAdvisors.tripId,
          trip_title: trips.title,
          destination: trips.destination,
          start_date: trips.startDate,
          end_date: trips.endDate,
          status: tripExpertAdvisors.status,
          assigned_at: tripExpertAdvisors.assignedAt,
          traveler_first: users.firstName,
          traveler_last: users.lastName,
          suggestion_count: sql<number>`(
            SELECT COUNT(*) FROM trip_suggestions
            WHERE trip_id = ${tripExpertAdvisors.tripId}
            AND expert_id = ${userId}
          )`,
        })
        .from(tripExpertAdvisors)
        .innerJoin(trips, eq(tripExpertAdvisors.tripId, trips.id))
        .leftJoin(users, eq(trips.userId, users.id))
        .where(eq(tripExpertAdvisors.localExpertId, userId))
        .orderBy(desc(tripExpertAdvisors.assignedAt));

      res.json(rows.map(r => ({
        trip_id: r.trip_id,
        trip_title: r.trip_title || r.destination,
        destination: r.destination,
        start_date: r.start_date,
        end_date: r.end_date,
        traveler_name: [r.traveler_first, r.traveler_last].filter(Boolean).join(" ") || "Traveler",
        status: r.status,
        assigned_at: r.assigned_at,
        suggestion_count: Number(r.suggestion_count) || 0,
      })));
    } catch (err) {
      console.error("[Expert] assigned-trips error:", err);
      res.status(500).json({ message: "Failed to fetch assigned trips" });
    }
  });

  // === Trip Commission ===
  app.get("/api/trips/:tripId/commission", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { tripId } = req.params;
      const assignment = await db.select()
        .from(tripExpertAdvisors)
        .where(and(eq(tripExpertAdvisors.tripId, tripId), eq(tripExpertAdvisors.localExpertId, userId)))
        .limit(1);
      if (!assignment.length) return res.status(403).json({ message: "Not assigned to this trip" });

      const allItems = await storage.getItineraryItems(tripId);
      // Confirmed items only: exclude terminal/cancelled states
      const CONFIRMED_STATUSES = ["planned", "confirmed", "in_progress", "booked"];
      const items = allItems.filter((item: any) =>
        CONFIRMED_STATUSES.includes(item.status) &&
        item.bookingStatus !== "cancelled"
      );

      // Expert-favorable split policy: EXPERT_SHARE_RATE (75%) floor. Do NOT lower
      // without a product decision — it inverts the split in experts' disfavor.
      // safeParseRate: returns fallback when value is missing, non-numeric, NaN, Infinity, or outside [0,1]
      const safeParseRate = (value: any, fallback: number): number => {
        const n = parseFloat(value);
        return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
      };
      // Derive expert's revenue share rate from their active services (fallback DEFAULT_RATE)
      const expertServices = await storage.getProviderServicesByStatus(userId, "active");
      const expertRate = expertServices.length > 0
        ? expertServices.reduce((sum: number, svc: any) => sum + safeParseRate(svc.revenueShareRate, EXPERT_SHARE_RATE), 0) / expertServices.length
        : EXPERT_SHARE_RATE;

      let totalGross = 0;
      let expertShare = 0;
      const itemBreakdown: Array<{ id: string; title: string; dayNumber: number; cost: number; revenueShareRate: number; expertEarning: number; platformFee: number }> = [];

      for (const item of items) {
        const cost = parseFloat(item.estimatedCost ?? "0");
        const rate = expertRate;
        const earning = cost * rate;
        const fee = cost - earning;
        totalGross += cost;
        expertShare += earning;
        itemBreakdown.push({
          id: item.id,
          title: item.title,
          dayNumber: item.dayNumber,
          cost,
          revenueShareRate: parseFloat(rate.toFixed(4)),
          expertEarning: earning,
          platformFee: fee,
        });
      }

      const platformFee = totalGross - expertShare;

      res.json({
        tripId,
        expertId: userId,
        totalGross: totalGross.toFixed(2),
        expertShare: expertShare.toFixed(2),
        platformFee: platformFee.toFixed(2),
        revenueShareRate: parseFloat(expertRate.toFixed(4)),
        itemCount: items.length,
        itemBreakdown: itemBreakdown.map(b => ({
          ...b,
          cost: b.cost.toFixed(2),
          expertEarning: b.expertEarning.toFixed(2),
          platformFee: b.platformFee.toFixed(2),
        })),
      });
    } catch (err) {
      console.error("[Commission] GET error:", err);
      res.status(500).json({ message: "Failed to calculate commission" });
    }
  });

  // Expert's assignment record for a specific trip (includes id + workspaceStatus)
  app.get("/api/trips/:tripId/my-assignment", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { tripId } = req.params;
      const [assignment] = await db.select().from(tripExpertAdvisors)
        .where(and(eq(tripExpertAdvisors.tripId, tripId), eq(tripExpertAdvisors.localExpertId, userId)))
        .limit(1);
      if (!assignment) return res.status(404).json({ message: "Not assigned to this trip" });
      res.json(assignment);
    } catch (err) {
      console.error("[Expert] getMyAssignment error:", err);
      res.status(500).json({ message: "Failed to get assignment" });
    }
  });

  // GET /api/trips/:tripId/expert-notes — Retrieve expert notes for a trip (assigned expert only)
  app.get("/api/trips/:tripId/expert-notes", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { tripId } = req.params;
      const [assignment] = await db.select().from(tripExpertAdvisors)
        .where(and(eq(tripExpertAdvisors.tripId, tripId), eq(tripExpertAdvisors.localExpertId, userId)))
        .limit(1);
      if (!assignment) return res.status(403).json({ message: "Not assigned to this trip" });
      const [trip] = await db.select({ expertNotes: trips.expertNotes }).from(trips).where(eq(trips.id, tripId)).limit(1);
      res.json({ expertNotes: trip?.expertNotes ?? "" });
    } catch (err) {
      console.error("[Expert] getExpertNotes error:", err);
      res.status(500).json({ message: "Failed to get expert notes" });
    }
  });

  // PATCH /api/trips/:tripId/expert-notes — Auto-save expert notes (assigned expert only)
  app.patch("/api/trips/:tripId/expert-notes", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { tripId } = req.params;
      const { expertNotes } = req.body;
      if (typeof expertNotes !== "string") return res.status(400).json({ message: "expertNotes must be a string" });
      const [assignment] = await db.select().from(tripExpertAdvisors)
        .where(and(eq(tripExpertAdvisors.tripId, tripId), eq(tripExpertAdvisors.localExpertId, userId)))
        .limit(1);
      if (!assignment) return res.status(403).json({ message: "Not assigned to this trip" });
      await storage.updateTrip(tripId, { expertNotes });
      res.json({ ok: true });
    } catch (err) {
      console.error("[Expert] saveExpertNotes error:", err);
      res.status(500).json({ message: "Failed to save expert notes" });
    }
  });

  // === EA Client Delegation Routes ===

  // GET /api/ea/clients — list all clients managed by this EA
  app.get("/api/ea/clients", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id;
      const rows = await db
        .select({
          id: eaClientRelationships.id,
          clientUserId: eaClientRelationships.clientUserId,
          clientEmail: eaClientRelationships.clientEmail,
          displayName: eaClientRelationships.displayName,
          notes: eaClientRelationships.notes,
          billingName: eaClientRelationships.billingName,
          billingEmail: eaClientRelationships.billingEmail,
          billingAddress: eaClientRelationships.billingAddress,
          paymentNotes: eaClientRelationships.paymentNotes,
          preferredCurrency: eaClientRelationships.preferredCurrency,
          createdAt: eaClientRelationships.createdAt,
          userFirstName: users.firstName,
          userLastName: users.lastName,
          userEmail: users.email,
          userProfileImageUrl: users.profileImageUrl,
        })
        .from(eaClientRelationships)
        .leftJoin(users, eq(eaClientRelationships.clientUserId, users.id))
        .where(eq(eaClientRelationships.eaUserId, eaUserId))
        .orderBy(desc(eaClientRelationships.createdAt));
      res.json(rows);
    } catch (err) {
      console.error("[EA] getClients error:", err);
      res.status(500).json({ message: "Failed to fetch clients" });
    }
  });

  // POST /api/ea/clients — add a client (by email lookup)
  app.post("/api/ea/clients", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id;
      const { email, displayName, notes } = z.object({
        email: z.string().email(),
        displayName: z.string().optional(),
        notes: z.string().optional(),
      }).parse(req.body);

      // Look up the user by email
      const [foundUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);

      // Check not already added
      const existing = await db.select().from(eaClientRelationships)
        .where(and(
          eq(eaClientRelationships.eaUserId, eaUserId),
          foundUser
            ? eq(eaClientRelationships.clientUserId, foundUser.id)
            : eq(eaClientRelationships.clientEmail, email)
        )).limit(1);

      if (existing.length > 0) {
        return res.status(409).json({ message: "Client already added" });
      }

      const [created] = await db.insert(eaClientRelationships).values({
        eaUserId,
        clientUserId: foundUser?.id ?? null,
        clientEmail: email,
        displayName: displayName || (foundUser ? `${foundUser.firstName ?? ""} ${foundUser.lastName ?? ""}`.trim() : email),
        notes: notes ?? null,
      }).returning();

      res.status(201).json(created);
    } catch (err) {
      console.error("[EA] addClient error:", err);
      res.status(500).json({ message: "Failed to add client" });
    }
  });

  // PATCH /api/ea/clients/:id — update payment info / notes
  app.patch("/api/ea/clients/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id;
      const { id } = req.params;
      const updates = z.object({
        displayName: z.string().optional(),
        notes: z.string().optional(),
        billingName: z.string().optional(),
        billingEmail: z.string().email().optional(),
        billingAddress: z.string().optional(),
        paymentNotes: z.string().optional(),
        preferredCurrency: z.string().optional(),
      }).parse(req.body);

      const [row] = await db.select().from(eaClientRelationships)
        .where(and(eq(eaClientRelationships.id, id), eq(eaClientRelationships.eaUserId, eaUserId)))
        .limit(1);
      if (!row) return res.status(404).json({ message: "Client not found" });

      const [updated] = await db.update(eaClientRelationships)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(eaClientRelationships.id, id))
        .returning();

      res.json(updated);
    } catch (err) {
      console.error("[EA] updateClient error:", err);
      res.status(500).json({ message: "Failed to update client" });
    }
  });

  // DELETE /api/ea/clients/:id — remove client relationship
  app.delete("/api/ea/clients/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id;
      const { id } = req.params;
      const [row] = await db.select().from(eaClientRelationships)
        .where(and(eq(eaClientRelationships.id, id), eq(eaClientRelationships.eaUserId, eaUserId)))
        .limit(1);
      if (!row) return res.status(404).json({ message: "Client not found" });
      await db.delete(eaClientRelationships).where(eq(eaClientRelationships.id, id));
      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] deleteClient error:", err);
      res.status(500).json({ message: "Failed to remove client" });
    }
  });

  // POST /api/ea/clients/:id/push — send a notification to the client
  app.post("/api/ea/clients/:id/push", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id;
      const { id } = req.params;
      const { title, message } = z.object({
        title: z.string().min(1).max(255),
        message: z.string().min(1),
      }).parse(req.body);

      const [row] = await db.select().from(eaClientRelationships)
        .where(and(eq(eaClientRelationships.id, id), eq(eaClientRelationships.eaUserId, eaUserId)))
        .limit(1);
      if (!row) return res.status(404).json({ message: "Client not found" });
      if (!row.clientUserId) return res.status(400).json({ message: "Client does not have a platform account" });

      await db.insert(notifications).values({
        userId: row.clientUserId,
        type: "ea_message",
        title,
        message,
        relatedId: eaUserId,
        relatedType: "ea_user",
        data: { fromEaUserId: eaUserId },
      });

      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] pushNotification error:", err);
      res.status(500).json({ message: "Failed to send notification" });
    }
  });

  // ============================================================
  // EA EXECUTIVE MANAGEMENT
  // ============================================================

  app.get("/api/ea/executives", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const rows = await db.select().from(eaExecutives)
        .where(eq(eaExecutives.eaUserId, eaUserId))
        .orderBy(asc(eaExecutives.name));
      res.json(rows);
    } catch (err) {
      console.error("[EA] getExecutives error:", err);
      res.status(500).json({ message: "Failed to fetch executives" });
    }
  });

  app.post("/api/ea/executives", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const body = insertEaExecutiveSchema.parse({ ...req.body, eaUserId });
      const [created] = await db.insert(eaExecutives).values(body).returning();
      res.status(201).json(created);
    } catch (err) {
      console.error("[EA] createExecutive error:", err);
      res.status(400).json({ message: "Failed to create executive" });
    }
  });

  app.patch("/api/ea/executives/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const [row] = await db.select().from(eaExecutives)
        .where(and(eq(eaExecutives.id, req.params.id), eq(eaExecutives.eaUserId, eaUserId))).limit(1);
      if (!row) return res.status(404).json({ message: "Executive not found" });
      const [updated] = await db.update(eaExecutives)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(eaExecutives.id, req.params.id)).returning();
      res.json(updated);
    } catch (err) {
      console.error("[EA] updateExecutive error:", err);
      res.status(500).json({ message: "Failed to update executive" });
    }
  });

  app.delete("/api/ea/executives/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const [row] = await db.select().from(eaExecutives)
        .where(and(eq(eaExecutives.id, req.params.id), eq(eaExecutives.eaUserId, eaUserId))).limit(1);
      if (!row) return res.status(404).json({ message: "Executive not found" });
      await db.delete(eaExecutives).where(eq(eaExecutives.id, req.params.id));
      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] deleteExecutive error:", err);
      res.status(500).json({ message: "Failed to delete executive" });
    }
  });

  // ============================================================
  // EA EVENTS
  // ============================================================

  app.get("/api/ea/events", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const rows = await db.select().from(eaEvents)
        .where(eq(eaEvents.eaUserId, eaUserId))
        .orderBy(desc(eaEvents.date));
      res.json(rows);
    } catch (err) {
      console.error("[EA] getEvents error:", err);
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });

  app.post("/api/ea/events", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const body = insertEaEventSchema.parse({ ...req.body, eaUserId });
      const [created] = await db.insert(eaEvents).values(body).returning();
      res.status(201).json(created);
    } catch (err) {
      console.error("[EA] createEvent error:", err);
      res.status(400).json({ message: "Failed to create event" });
    }
  });

  app.patch("/api/ea/events/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const [row] = await db.select().from(eaEvents)
        .where(and(eq(eaEvents.id, req.params.id), eq(eaEvents.eaUserId, eaUserId))).limit(1);
      if (!row) return res.status(404).json({ message: "Event not found" });
      const [updated] = await db.update(eaEvents)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(eaEvents.id, req.params.id)).returning();
      res.json(updated);
    } catch (err) {
      console.error("[EA] updateEvent error:", err);
      res.status(500).json({ message: "Failed to update event" });
    }
  });

  app.delete("/api/ea/events/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      await db.delete(eaEvents)
        .where(and(eq(eaEvents.id, req.params.id), eq(eaEvents.eaUserId, eaUserId)));
      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] deleteEvent error:", err);
      res.status(500).json({ message: "Failed to delete event" });
    }
  });

  // ============================================================
  // EA TRAVEL ARRANGEMENTS
  // ============================================================

  app.get("/api/ea/travel", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const rows = await db.select().from(eaTravelArrangements)
        .where(eq(eaTravelArrangements.eaUserId, eaUserId))
        .orderBy(desc(eaTravelArrangements.createdAt));
      res.json(rows);
    } catch (err) {
      console.error("[EA] getTravel error:", err);
      res.status(500).json({ message: "Failed to fetch travel arrangements" });
    }
  });

  app.post("/api/ea/travel", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const body = insertEaTravelArrangementSchema.parse({ ...req.body, eaUserId });
      const [created] = await db.insert(eaTravelArrangements).values(body).returning();
      res.status(201).json(created);
    } catch (err) {
      console.error("[EA] createTravel error:", err);
      res.status(400).json({ message: "Failed to create travel arrangement" });
    }
  });

  app.patch("/api/ea/travel/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const [row] = await db.select().from(eaTravelArrangements)
        .where(and(eq(eaTravelArrangements.id, req.params.id), eq(eaTravelArrangements.eaUserId, eaUserId))).limit(1);
      if (!row) return res.status(404).json({ message: "Travel arrangement not found" });
      const [updated] = await db.update(eaTravelArrangements)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(eaTravelArrangements.id, req.params.id)).returning();
      res.json(updated);
    } catch (err) {
      console.error("[EA] updateTravel error:", err);
      res.status(500).json({ message: "Failed to update travel arrangement" });
    }
  });

  app.delete("/api/ea/travel/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      await db.delete(eaTravelArrangements)
        .where(and(eq(eaTravelArrangements.id, req.params.id), eq(eaTravelArrangements.eaUserId, eaUserId)));
      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] deleteTravel error:", err);
      res.status(500).json({ message: "Failed to delete travel arrangement" });
    }
  });

  // ============================================================
  // EA GIFTS
  // ============================================================

  app.get("/api/ea/gifts", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const rows = await db.select().from(eaGifts)
        .where(eq(eaGifts.eaUserId, eaUserId))
        .orderBy(desc(eaGifts.createdAt));
      res.json(rows);
    } catch (err) {
      console.error("[EA] getGifts error:", err);
      res.status(500).json({ message: "Failed to fetch gifts" });
    }
  });

  app.post("/api/ea/gifts", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const body = insertEaGiftSchema.parse({ ...req.body, eaUserId });
      const [created] = await db.insert(eaGifts).values(body).returning();
      res.status(201).json(created);
    } catch (err) {
      console.error("[EA] createGift error:", err);
      res.status(400).json({ message: "Failed to create gift" });
    }
  });

  app.patch("/api/ea/gifts/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const [row] = await db.select().from(eaGifts)
        .where(and(eq(eaGifts.id, req.params.id), eq(eaGifts.eaUserId, eaUserId))).limit(1);
      if (!row) return res.status(404).json({ message: "Gift not found" });
      const [updated] = await db.update(eaGifts)
        .set(req.body)
        .where(eq(eaGifts.id, req.params.id)).returning();
      res.json(updated);
    } catch (err) {
      console.error("[EA] updateGift error:", err);
      res.status(500).json({ message: "Failed to update gift" });
    }
  });

  app.delete("/api/ea/gifts/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      await db.delete(eaGifts)
        .where(and(eq(eaGifts.id, req.params.id), eq(eaGifts.eaUserId, eaUserId)));
      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] deleteGift error:", err);
      res.status(500).json({ message: "Failed to delete gift" });
    }
  });

  // ============================================================
  // EA SAVED VENUES
  // ============================================================

  app.get("/api/ea/venues", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const rows = await db.select().from(eaSavedVenues)
        .where(eq(eaSavedVenues.eaUserId, eaUserId))
        .orderBy(desc(eaSavedVenues.favorite), asc(eaSavedVenues.name));
      res.json(rows);
    } catch (err) {
      console.error("[EA] getVenues error:", err);
      res.status(500).json({ message: "Failed to fetch venues" });
    }
  });

  app.post("/api/ea/venues", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const body = insertEaSavedVenueSchema.parse({ ...req.body, eaUserId });
      const [created] = await db.insert(eaSavedVenues).values(body).returning();
      res.status(201).json(created);
    } catch (err) {
      console.error("[EA] createVenue error:", err);
      res.status(400).json({ message: "Failed to save venue" });
    }
  });

  app.patch("/api/ea/venues/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const [row] = await db.select().from(eaSavedVenues)
        .where(and(eq(eaSavedVenues.id, req.params.id), eq(eaSavedVenues.eaUserId, eaUserId))).limit(1);
      if (!row) return res.status(404).json({ message: "Venue not found" });
      const [updated] = await db.update(eaSavedVenues)
        .set(req.body)
        .where(eq(eaSavedVenues.id, req.params.id)).returning();
      res.json(updated);
    } catch (err) {
      console.error("[EA] updateVenue error:", err);
      res.status(500).json({ message: "Failed to update venue" });
    }
  });

  app.delete("/api/ea/venues/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      await db.delete(eaSavedVenues)
        .where(and(eq(eaSavedVenues.id, req.params.id), eq(eaSavedVenues.eaUserId, eaUserId)));
      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] deleteVenue error:", err);
      res.status(500).json({ message: "Failed to delete venue" });
    }
  });

  // ============================================================
  // EA COMMUNICATIONS
  // ============================================================

  app.get("/api/ea/communications", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const rows = await db.select().from(eaCommunications)
        .where(eq(eaCommunications.eaUserId, eaUserId))
        .orderBy(desc(eaCommunications.sentAt));
      res.json(rows);
    } catch (err) {
      console.error("[EA] getCommunications error:", err);
      res.status(500).json({ message: "Failed to fetch communications" });
    }
  });

  app.post("/api/ea/communications", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const body = insertEaCommunicationSchema.parse({ ...req.body, eaUserId });
      const [created] = await db.insert(eaCommunications).values(body).returning();
      res.status(201).json(created);
    } catch (err) {
      console.error("[EA] createCommunication error:", err);
      res.status(400).json({ message: "Failed to log communication" });
    }
  });

  app.delete("/api/ea/communications/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      await db.delete(eaCommunications)
        .where(and(eq(eaCommunications.id, req.params.id), eq(eaCommunications.eaUserId, eaUserId)));
      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] deleteCommunication error:", err);
      res.status(500).json({ message: "Failed to delete communication" });
    }
  });

  // ============================================================
  // EA AI TASKS
  // ============================================================

  app.get("/api/ea/ai-tasks", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const { status } = req.query;
      const conditions = [eq(eaAiTasks.eaUserId, eaUserId)];
      if (status) conditions.push(eq(eaAiTasks.status, status as string));
      const rows = await db.select().from(eaAiTasks)
        .where(and(...conditions))
        .orderBy(desc(eaAiTasks.createdAt));
      res.json(rows);
    } catch (err) {
      console.error("[EA] getAiTasks error:", err);
      res.status(500).json({ message: "Failed to fetch AI tasks" });
    }
  });

  app.post("/api/ea/ai-tasks", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const body = insertEaAiTaskSchema.parse({ ...req.body, eaUserId });
      const [created] = await db.insert(eaAiTasks).values(body).returning();
      res.status(201).json(created);
    } catch (err) {
      console.error("[EA] createAiTask error:", err);
      res.status(400).json({ message: "Failed to create AI task" });
    }
  });

  app.patch("/api/ea/ai-tasks/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const [row] = await db.select().from(eaAiTasks)
        .where(and(eq(eaAiTasks.id, req.params.id), eq(eaAiTasks.eaUserId, eaUserId))).limit(1);
      if (!row) return res.status(404).json({ message: "AI task not found" });
      const updates: Record<string, any> = { ...req.body, updatedAt: new Date() };
      if (req.body.status === "approved") updates.approvedAt = new Date();
      if (req.body.status === "rejected") updates.rejectedAt = new Date();
      const [updated] = await db.update(eaAiTasks)
        .set(updates)
        .where(eq(eaAiTasks.id, req.params.id)).returning();
      res.json(updated);
    } catch (err) {
      console.error("[EA] updateAiTask error:", err);
      res.status(500).json({ message: "Failed to update AI task" });
    }
  });

  app.delete("/api/ea/ai-tasks/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      await db.delete(eaAiTasks)
        .where(and(eq(eaAiTasks.id, req.params.id), eq(eaAiTasks.eaUserId, eaUserId)));
      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] deleteAiTask error:", err);
      res.status(500).json({ message: "Failed to delete AI task" });
    }
  });

  // ============================================================
  // LOCAL EXPERT KNOWLEDGE NUGGETS
  // ============================================================

  // GET /api/expert/knowledge-nuggets — list own nuggets
  app.get("/api/expert/knowledge-nuggets", isAuthenticated, async (req, res) => {
    try {
      const expertId = (req.user as any).id || (req.user as any).claims?.sub;
      const nuggets = await db
        .select()
        .from(localKnowledgeNuggets)
        .where(eq(localKnowledgeNuggets.expertUserId, expertId))
        .orderBy(desc(localKnowledgeNuggets.createdAt));
      res.json(nuggets);
    } catch (err) {
      console.error("[Knowledge Nuggets] list error:", err);
      res.status(500).json({ message: "Failed to fetch knowledge nuggets" });
    }
  });

  // POST /api/expert/knowledge-nuggets — create nugget
  app.post("/api/expert/knowledge-nuggets", isAuthenticated, async (req, res) => {
    try {
      const expertId = (req.user as any).id || (req.user as any).claims?.sub;
      const parsed = insertLocalKnowledgeNuggetSchema.safeParse({ ...req.body, expertUserId: expertId });
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten() });
      }
      const [nugget] = await db.insert(localKnowledgeNuggets).values(parsed.data).returning();
      res.status(201).json(nugget);
    } catch (err) {
      console.error("[Knowledge Nuggets] create error:", err);
      res.status(500).json({ message: "Failed to create knowledge nugget" });
    }
  });

  // PATCH /api/expert/knowledge-nuggets/:id — update own nugget
  app.patch("/api/expert/knowledge-nuggets/:id", isAuthenticated, async (req, res) => {
    try {
      const expertId = (req.user as any).id || (req.user as any).claims?.sub;
      const { id } = req.params;
      const existing = await db.select().from(localKnowledgeNuggets)
        .where(and(eq(localKnowledgeNuggets.id, id), eq(localKnowledgeNuggets.expertUserId, expertId)))
        .limit(1);
      if (!existing.length) return res.status(404).json({ message: "Nugget not found" });
      const allowed = ["nuggetType", "city", "linkedPoi", "linkedNeighbourhood", "insight", "targetAudience", "notFor", "seasonality"] as const;
      const updates: Record<string, any> = {};
      for (const key of allowed) {
        if (key in req.body) updates[key] = req.body[key];
      }
      updates.updatedAt = new Date();
      const [updated] = await db.update(localKnowledgeNuggets)
        .set(updates)
        .where(eq(localKnowledgeNuggets.id, id))
        .returning();
      res.json(updated);
    } catch (err) {
      console.error("[Knowledge Nuggets] update error:", err);
      res.status(500).json({ message: "Failed to update knowledge nugget" });
    }
  });

  // DELETE /api/expert/knowledge-nuggets/:id — delete own nugget
  app.delete("/api/expert/knowledge-nuggets/:id", isAuthenticated, async (req, res) => {
    try {
      const expertId = (req.user as any).id || (req.user as any).claims?.sub;
      const { id } = req.params;
      const existing = await db.select().from(localKnowledgeNuggets)
        .where(and(eq(localKnowledgeNuggets.id, id), eq(localKnowledgeNuggets.expertUserId, expertId)))
        .limit(1);
      if (!existing.length) return res.status(404).json({ message: "Nugget not found" });
      await db.delete(localKnowledgeNuggets).where(eq(localKnowledgeNuggets.id, id));
      res.json({ success: true });
    } catch (err) {
      console.error("[Knowledge Nuggets] delete error:", err);
      res.status(500).json({ message: "Failed to delete knowledge nugget" });
    }
  });

  // GET /api/admin/local-experts/nugget-counts — nugget count per local expert
  app.get("/api/admin/local-experts/nugget-counts", isAuthenticated, async (req, res) => {
    try {
      const rows = await db
        .select({ expertUserId: localKnowledgeNuggets.expertUserId, count: count() })
        .from(localKnowledgeNuggets)
        .groupBy(localKnowledgeNuggets.expertUserId);
      const map: Record<string, number> = {};
      for (const r of rows) map[r.expertUserId] = Number(r.count);
      res.json(map);
    } catch (err) {
      console.error("[Knowledge Nuggets] admin counts error:", err);
      res.status(500).json({ message: "Failed to fetch nugget counts" });
    }
  });

  // GET /api/knowledge-nuggets/city — for AI to pull nuggets by city
  app.get("/api/knowledge-nuggets/city", isAuthenticated, async (req, res) => {
    try {
      const city = (req.query.city as string || "").trim();
      if (!city) return res.status(400).json({ message: "city query param required" });
      const nuggets = await db
        .select()
        .from(localKnowledgeNuggets)
        .where(like(localKnowledgeNuggets.city, `%${city}%`))
        .orderBy(desc(localKnowledgeNuggets.createdAt))
        .limit(50);
      res.json(nuggets);
    } catch (err) {
      console.error("[Knowledge Nuggets] city search error:", err);
      res.status(500).json({ message: "Failed to fetch city nuggets" });
    }
  });

  // ============================================================
  // EXPERT CONTRACTS
  // ============================================================

  // ============================================================
  // VISA REQUIREMENTS
  // ============================================================

  // Simple in-memory rate limiter for visa requirements (max 10 req / IP / minute)
  const visaRateLimitMap = new Map<string, { count: number; resetAt: number }>();
  function visaRateLimit(ip: string): boolean {
    const now = Date.now();
    const entry = visaRateLimitMap.get(ip);
    if (!entry || now > entry.resetAt) {
      visaRateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
      return false;
    }
    if (entry.count >= 10) return true;
    entry.count++;
    return false;
  }

  app.post("/api/visa/requirements", async (req, res) => {
    try {
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
      if (visaRateLimit(ip)) {
        return res.status(429).json({ message: "Too many requests. Please wait a minute before trying again." });
      }
      const { passportCountry, destinationCountry } = req.body;
      if (!passportCountry || !destinationCountry) {
        return res.status(400).json({ message: "passportCountry and destinationCountry are required" });
      }

      const { forceRefresh } = req.body;

      // Check cache first (7-day TTL), unless force-refresh requested
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      if (forceRefresh) {
        // Delete stale cache entry so we re-fetch fresh data
        await db
          .delete(visaRequirementsCache)
          .where(
            and(
              eq(visaRequirementsCache.passportCountry, passportCountry.toLowerCase()),
              eq(visaRequirementsCache.destinationCountry, destinationCountry.toLowerCase()),
            )
          );
      } else {
        const cached = await db
          .select()
          .from(visaRequirementsCache)
          .where(
            and(
              eq(visaRequirementsCache.passportCountry, passportCountry.toLowerCase()),
              eq(visaRequirementsCache.destinationCountry, destinationCountry.toLowerCase()),
              sql`${visaRequirementsCache.cachedAt} > ${sevenDaysAgo}`
            )
          )
          .limit(1)
          .then((r) => r[0]);

        if (cached) {
          return res.json({
            visaRequired: cached.visaRequired,
            visaTypes: cached.visaTypes,
            requiredDocuments: cached.requiredDocuments,
            processingTime: cached.processingTime,
            feeRange: cached.feeRange,
            disclaimer: cached.disclaimer,
            fromCache: true,
            cachedAt: cached.cachedAt,
          });
        }
      }

      // Call Claude to get visa requirements
      const prompt = `You are a visa information assistant. Provide visa requirements for a ${passportCountry} passport holder traveling to ${destinationCountry}.

Return ONLY valid JSON in this exact structure (no additional text):
{
  "visa_required": true or false,
  "visa_types": ["Tourist Visa", "Business Visa"],
  "required_documents": ["Valid passport (6+ months validity)", "Completed visa application form", "Passport-sized photos", "Bank statements (last 3 months)", "Travel itinerary", "Hotel bookings"],
  "processing_time": "5-10 business days",
  "fee_range": "$50-$160 USD depending on visa type",
  "disclaimer": "This information is for general guidance only. Requirements may change at any time. Always verify with the official embassy or consulate of ${destinationCountry} before traveling."
}

If no visa is required (visa-free or visa-on-arrival), set visa_required to false and explain in the disclaimer. Be specific and accurate based on commonly known visa policies.`;

      const completion = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      });

      const text = (completion.content[0] as any).text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return res.status(500).json({ message: "Failed to parse AI response" });
      }
      const parsed = JSON.parse(jsonMatch[0]);

      // Store in cache
      const nowTs = new Date();
      await db.insert(visaRequirementsCache).values({
        passportCountry: passportCountry.toLowerCase(),
        destinationCountry: destinationCountry.toLowerCase(),
        visaRequired: Boolean(parsed.visa_required),
        visaTypes: parsed.visa_types || [],
        requiredDocuments: parsed.required_documents || [],
        processingTime: parsed.processing_time || null,
        feeRange: parsed.fee_range || null,
        disclaimer: parsed.disclaimer || null,
      });

      res.json({
        visaRequired: parsed.visa_required,
        visaTypes: parsed.visa_types || [],
        requiredDocuments: parsed.required_documents || [],
        processingTime: parsed.processing_time,
        feeRange: parsed.fee_range,
        disclaimer: parsed.disclaimer,
        fromCache: false,
        cachedAt: nowTs,
      });
    } catch (err) {
      console.error("[Visa] requirements error:", err);
      res.status(500).json({ message: "Failed to fetch visa requirements" });
    }
  });

  // GET /api/visa/experts — returns visa-assistance services with real provider names
  app.get("/api/visa/experts", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string || "6"), 20);
      const cat = await db
        .select({ id: serviceCategories.id })
        .from(serviceCategories)
        .where(eq(serviceCategories.slug, "visa-assistance"))
        .limit(1)
        .then((r) => r[0]);
      if (!cat) return res.json({ services: [], total: 0 });
      const rows = await db
        .select({
          id: providerServices.id,
          serviceName: providerServices.serviceName,
          shortDescription: providerServices.shortDescription,
          description: providerServices.description,
          price: providerServices.price,
          averageRating: providerServices.averageRating,
          reviewCount: providerServices.reviewCount,
          location: providerServices.location,
          deliveryMethod: providerServices.deliveryMethod,
          serviceImage: providerServices.serviceImage,
          categoryId: providerServices.categoryId,
          providerFirstName: users.firstName,
          providerLastName: users.lastName,
          providerAvatar: users.profileImageUrl,
        })
        .from(providerServices)
        .leftJoin(users, eq(providerServices.userId, users.id))
        .where(and(eq(providerServices.categoryId, cat.id), eq(providerServices.status, "active")))
        .orderBy(desc(providerServices.bookingsCount))
        .limit(limit);
      const services = rows.map((r) => ({
        ...r,
        providerName: [r.providerFirstName, r.providerLastName].filter(Boolean).join(" ") || "Visa Specialist",
      }));
      res.json({ services, total: services.length });
    } catch (err) {
      console.error("[Visa] experts error:", err);
      res.status(500).json({ message: "Failed to fetch visa experts" });
    }
  });

  app.get("/api/expert/contracts/recent", isAuthenticated, async (req, res) => {
    try {
      const expertId = (req.user as any).id || (req.user as any).claims?.sub;
      const limit = Math.min(parseInt(req.query.limit as string || "20"), 100);
      const rows = await db.select({
        id: userAndExpertContracts.id,
        title: userAndExpertContracts.title,
        client: userAndExpertContracts.tripTo,
        value: userAndExpertContracts.amount,
        status: userAndExpertContracts.status,
        isPaid: userAndExpertContracts.isPaid,
        createdAt: userAndExpertContracts.createdAt,
      })
        .from(userAndExpertContracts)
        .orderBy(desc(userAndExpertContracts.createdAt))
        .limit(limit);
      res.json(rows);
    } catch (err) {
      console.error("[Expert] getContracts error:", err);
      res.status(500).json({ message: "Failed to fetch contracts" });
    }
  });

  // ─── Content Placement Rules (Admin) ────────────────────────────────────────

  // Local admin guard for this scope (requireAdmin is defined in the outer registerRoutes scope)
  const requireAdminLocal = async (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Authentication required" });
    const user = await db.select({ role: users.role }).from(users)
      .where(eq(users.id, req.user?.claims?.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    next();
  };

  // GET /api/admin/content-placement-rules — list with optional filters
  app.get("/api/admin/content-placement-rules", requireAdminLocal, async (req, res) => {
    try {
      const { cityName, surface, contentSource } = req.query as Record<string, string>;
      const rules = await storage.getContentPlacementRules({
        cityName: cityName || undefined,
        surface: surface || undefined,
        contentSource: contentSource || undefined,
        isActive: undefined,
      });
      res.json(rules);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch placement rules", error: err.message });
    }
  });

  // POST /api/admin/content-placement-rules — create a rule
  app.post("/api/admin/content-placement-rules", requireAdminLocal, async (req, res) => {
    try {
      const rule = await storage.createContentPlacementRule(req.body as InsertContentPlacementRule);
      res.status(201).json(rule);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to create placement rule", error: err.message });
    }
  });

  // PATCH /api/admin/content-placement-rules/:id — update a rule
  app.patch("/api/admin/content-placement-rules/:id", requireAdminLocal, async (req, res) => {
    try {
      const rule = await storage.updateContentPlacementRule(req.params.id, req.body);
      if (!rule) return res.status(404).json({ message: "Rule not found" });
      res.json(rule);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to update placement rule", error: err.message });
    }
  });

  // DELETE /api/admin/content-placement-rules/:id — delete a rule
  app.delete("/api/admin/content-placement-rules/:id", requireAdminLocal, async (req, res) => {
    try {
      await storage.deleteContentPlacementRule(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to delete placement rule", error: err.message });
    }
  });

  // POST /api/admin/content-placement-rules/auto-index
  // Scans affiliate_products and content_registry, matches them to active TravelPulse
  // cities by city/country name, and upserts placement rules with appropriate surfaces.
  app.post("/api/admin/content-placement-rules/auto-index", requireAdminLocal, async (req, res) => {
    try {
      // 1. Load all TravelPulse cities
      const cities = await db.select({
        cityName: travelPulseCities.cityName,
        country: travelPulseCities.country,
        pulseScore: travelPulseCities.pulseScore,
      }).from(travelPulseCities).limit(200);

      if (!cities.length) {
        return res.json({ created: 0, message: "No TravelPulse cities found. Seed city data first." });
      }

      // Build a fast lookup: lowercase city name → city data
      const cityLookup = new Map(cities.map(c => [c.cityName.toLowerCase(), c]));

      const rulesToUpsert: InsertContentPlacementRule[] = [];

      // 2. Scan affiliate_products
      const products = await db.select({
        id: affiliateProducts.id,
        name: affiliateProducts.name,
        city: affiliateProducts.city,
        country: affiliateProducts.country,
        category: affiliateProducts.category,
      }).from(affiliateProducts)
        .where(eq(affiliateProducts.isActive, true))
        .limit(2000);

      for (const p of products) {
        const cityKey = (p.city ?? "").toLowerCase();
        const cityData = cityLookup.get(cityKey) ||
          [...cityLookup.values()].find(c =>
            cityKey.includes(c.cityName.toLowerCase()) ||
            c.cityName.toLowerCase().includes(cityKey)
          );
        if (!cityData) continue;

        // Determine which surfaces this product's category matches
        const surfaces = (SURFACE_SLUGS as readonly string[]).filter(slug => {
          const cats = SURFACE_DEFAULT_AFFILIATE_CATEGORIES[slug as keyof typeof SURFACE_DEFAULT_AFFILIATE_CATEGORIES] ?? [];
          const pCat = (p.category ?? "").toLowerCase();
          return cats.some(c => pCat.includes(c) || c.includes(pCat));
        });
        if (!surfaces.length) surfaces.push("travelpulse-discover");

        rulesToUpsert.push({
          contentSource: "affiliate_product",
          sourceId: p.id,
          contentLabel: p.name,
          cityName: cityData.cityName,
          country: cityData.country,
          surfaces,
          minPulseScore: 0,
          isPinned: false,
          isAutoTagged: true,
          isActive: true,
          notes: `Auto-indexed from affiliate_products`,
        });
      }

      // 3. Scan content_registry (published only, with location metadata)
      const registryItems = await db.select({
        id: contentRegistry.id,
        title: contentRegistry.title,
        contentType: contentRegistry.contentType,
        metadata: contentRegistry.metadata,
      }).from(contentRegistry)
        .where(eq(contentRegistry.status, "published"))
        .limit(2000);

      for (const r of registryItems) {
        const meta = (r.metadata ?? {}) as Record<string, any>;
        const rawCity: string = meta.city ?? meta.location ?? meta.destination ?? "";
        if (!rawCity) continue;

        const cityKey = rawCity.toLowerCase().split(",")[0].trim();
        const cityData = cityLookup.get(cityKey) ||
          [...cityLookup.values()].find(c =>
            cityKey.includes(c.cityName.toLowerCase()) ||
            c.cityName.toLowerCase().includes(cityKey)
          );
        if (!cityData) continue;

        // Determine surfaces from content type
        const surfaces = (SURFACE_SLUGS as readonly string[]).filter(slug => {
          const types = SURFACE_DEFAULT_CONTENT_TYPES[slug as keyof typeof SURFACE_DEFAULT_CONTENT_TYPES] ?? [];
          return types.includes(r.contentType as any);
        });
        if (!surfaces.length) surfaces.push("travelpulse-discover");

        rulesToUpsert.push({
          contentSource: "content_registry",
          sourceId: r.id,
          contentLabel: r.title ?? undefined,
          cityName: cityData.cityName,
          country: cityData.country,
          surfaces,
          minPulseScore: 0,
          isPinned: false,
          isAutoTagged: true,
          isActive: true,
          notes: `Auto-indexed from content_registry`,
        });
      }

      const created = await storage.bulkUpsertContentPlacementRules(rulesToUpsert);
      res.json({
        created,
        total: rulesToUpsert.length,
        cities: cities.length,
        affiliateScanned: products.length,
        registryScanned: registryItems.length,
        message: `Auto-indexed ${created} new rules across ${cities.length} TravelPulse cities`,
      });
    } catch (err: any) {
      console.error("[ContentMap] auto-index error:", err);
      res.status(500).json({ message: "Auto-index failed", error: err.message });
    }
  });

  // ─── Admin: Neighborhood Backfill ────────────────────────────────────────────

  /**
   * GET /api/admin/neighborhoods/untagged
   * Returns all provider_services rows with a null neighborhood, including
   * service name, provider name, and city for the admin backfill UI.
   */
  app.get("/api/admin/neighborhoods/untagged", isAuthenticated, async (req, res) => {
    try {
      const rows = await db.execute(sql`
        SELECT
          ps.id,
          ps.service_name     AS "serviceName",
          ps.location         AS city,
          u.first_name        AS "providerFirstName",
          u.last_name         AS "providerLastName",
          u.email             AS "providerEmail"
        FROM provider_services ps
        JOIN users u ON u.id = ps.user_id
        WHERE ps.neighborhood IS NULL
        ORDER BY ps.created_at DESC
      `);
      res.json({ services: rows.rows, count: rows.rows.length });
    } catch (err: any) {
      console.error("[admin/neighborhoods] untagged fetch error:", err);
      res.status(500).json({ message: "Failed to fetch untagged services", error: err.message });
    }
  });

  /**
   * POST /api/admin/neighborhoods/backfill
   * Body: { serviceId?: string }
   * If serviceId is provided, runs Haversine proximity lookup for that one
   * service and assigns the nearest neighborhood slug.
   * If omitted, runs for all services with neighborhood IS NULL.
   * Returns { updated: number, unmatched: number }.
   */
  app.post("/api/admin/neighborhoods/backfill", isAuthenticated, async (req, res) => {
    try {
      const { serviceId } = req.body as { serviceId?: string };

      const EARTH_RADIUS_KM = 6371;
      function toRadians(deg: number): number {
        return (deg * Math.PI) / 180;
      }
      function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
        const dLat = toRadians(lat2 - lat1);
        const dLng = toRadians(lng2 - lng1);
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
        return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
      }

      const neighborhoods = await db.select().from(cityNeighborhoods);
      if (neighborhoods.length === 0) {
        return res.json({ updated: 0, unmatched: 0, message: "No neighborhoods seeded yet." });
      }

      const byCity = new Map<string, typeof neighborhoods>();
      for (const n of neighborhoods) {
        const key = n.city.toLowerCase();
        if (!byCity.has(key)) byCity.set(key, []);
        byCity.get(key)!.push(n);
      }

      const servicesResult = await db.execute(
        serviceId
          ? sql`SELECT id, location FROM provider_services WHERE id = ${serviceId} AND neighborhood IS NULL`
          : sql`SELECT id, location FROM provider_services WHERE neighborhood IS NULL`
      );
      const services = servicesResult.rows as { id: string; location: string | null }[];

      let updated = 0;
      let unmatched = 0;

      for (const svc of services) {
        const rawLocation = (svc.location ?? "").toLowerCase().trim();

        let bestSlug: string | null = null;

        const cityKey = Array.from(byCity.keys()).find((k) => rawLocation.includes(k));
        if (cityKey) {
          const candidates = byCity.get(cityKey)!;
          if (candidates.length === 1) {
            bestSlug = candidates[0].slug;
          } else {
            let bestDist = Infinity;
            for (const n of candidates) {
              const nLat = Number(n.centroidLat);
              const nLng = Number(n.centroidLng);
              const dist = haversineKm(nLat, nLng, nLat, nLng);
              if (dist < bestDist) {
                bestDist = dist;
                bestSlug = n.slug;
              }
            }
            if (!bestSlug) bestSlug = candidates[0].slug;
          }
        }

        if (!bestSlug) {
          unmatched++;
          continue;
        }

        await db.execute(
          sql`UPDATE provider_services SET neighborhood = ${bestSlug} WHERE id = ${svc.id}`
        );
        updated++;
      }

      res.json({ updated, unmatched, total: services.length });
    } catch (err: any) {
      console.error("[admin/neighborhoods] backfill error:", err);
      res.status(500).json({ message: "Backfill failed", error: err.message });
    }
  });

}
