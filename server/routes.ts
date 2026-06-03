import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, setupFacebookAuth, setupEmailAuth } from "./replit_integrations/auth";
import { registerChatRoutes } from "./replit_integrations/chat/routes";
import { db } from "./db";
import { eq, sql } from "drizzle-orm";
import { expertServiceOfferings, expertServiceCategories } from "@shared/schema";

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

  // ─── Seed canonical service templates (per-title idempotent) ───────────────
  (async () => {
    try {
      const CANONICAL_TEMPLATES = [
        {
          title: "Quick Consultation",
          description: "15-minute video call to answer quick travel questions and provide immediate guidance",
          serviceType: "consultation",
          deliveryMethod: "video",
          deliveryTimeframe: "15 min",
          suggestedPrice: "29",
          requirements: JSON.stringify(["Travel question or topic to discuss"]),
          whatIncluded: JSON.stringify(["15-min video call", "Personalized advice", "Follow-up summary email"]),
          isActive: true,
          sortOrder: 1,
        },
        {
          title: "Cart Review & Optimization",
          description: "Expert review of your travel cart to find savings and better alternatives",
          serviceType: "review",
          deliveryMethod: "document",
          deliveryTimeframe: "24 hours",
          suggestedPrice: "49",
          requirements: JSON.stringify(["Cart link or selections", "Budget constraints"]),
          whatIncluded: JSON.stringify(["Written recommendations", "Alternative suggestions", "Savings estimate"]),
          isActive: true,
          sortOrder: 2,
        },
        {
          title: "Full Trip Planning",
          description: "Comprehensive trip planning from start to finish with personalized itinerary",
          serviceType: "planning",
          deliveryMethod: "hybrid",
          deliveryTimeframe: "3-5 days",
          suggestedPrice: "249",
          requirements: JSON.stringify(["Destination", "Dates", "Budget", "Interests", "Travel style"]),
          whatIncluded: JSON.stringify(["Full itinerary", "Booking links", "Restaurant reservations", "Daily schedule", "Packing list"]),
          isActive: true,
          sortOrder: 3,
        },
        {
          title: "Destination Deep Dive",
          description: "In-depth guide to a specific destination with local insights and hidden gems",
          serviceType: "custom",
          deliveryMethod: "document",
          deliveryTimeframe: "48 hours",
          suggestedPrice: "79",
          requirements: JSON.stringify(["Destination", "Travel dates", "Interests"]),
          whatIncluded: JSON.stringify(["PDF guide", "Local recommendations", "Maps", "Insider tips", "Safety advice"]),
          isActive: true,
          sortOrder: 4,
        },
        {
          title: "Honeymoon Planning Package",
          description: "Romantic trip planning with special touches and memorable experiences",
          serviceType: "planning",
          deliveryMethod: "hybrid",
          deliveryTimeframe: "5-7 days",
          suggestedPrice: "399",
          requirements: JSON.stringify(["Couple preferences", "Budget", "Dates", "Special requests"]),
          whatIncluded: JSON.stringify(["Custom itinerary", "Romantic experiences", "Special arrangements", "Booking assistance"]),
          isActive: true,
          sortOrder: 5,
        },
        {
          title: "Group Trip Coordinator",
          description: "Organize and coordinate travel for groups with complex logistics",
          serviceType: "planning",
          deliveryMethod: "video",
          deliveryTimeframe: "1 week",
          suggestedPrice: "349",
          requirements: JSON.stringify(["Group size", "Budget per person", "Destination preferences", "Special needs"]),
          whatIncluded: JSON.stringify(["Group logistics", "Shared itinerary", "Booking coordination", "Communication support"]),
          isActive: true,
          sortOrder: 6,
        },
      ];

      const existing = await storage.getServiceTemplates();
      const existingTitles = new Set(existing.map((t: any) => t.title));
      let inserted = 0;
      for (const tpl of CANONICAL_TEMPLATES) {
        if (!existingTitles.has(tpl.title)) {
          await storage.createServiceTemplate(tpl as any);
          inserted++;
        }
      }
      if (inserted > 0) {
        console.log(`[Seed] Inserted ${inserted} canonical service template(s) into DB.`);
      }
    } catch (err) {
      console.warn("[Seed] Could not seed service templates:", err);
    }
  })();

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

  return httpServer;
}
