import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { users, helpGuideTrips, touristPlacesSearches } from "@shared/schema";
import { registerAuthDomain } from "./routes/auth";
import instagramRoutes from "./routes/instagram";
import bookingsRoutes from "./routes/bookings";
import bookingActionsRoutes from "./routes/booking-actions";
import messagesRouter from "./routes/messages";
import myItineraryRoutes from "./routes/my-itinerary.routes";
import transportHubRoutes from "./routes/transport-hub.routes";
import plancardRoutes from "./routes/plancard.routes";
import itineraryComparisonRoutes from "./routes/itinerary-comparisons";
import { registerAdminRoutes } from "./routes/admin";
import { registerProviderRoutes } from "./routes/provider";
import { registerExpertRoutes } from "./routes/expert";
import { registerCartRoutes } from "./routes/cart";
import { registerItineraryShareRoutes } from "./routes/itinerary";
import { registerMiscRoutes } from "./routes/misc";
import { travelPulseScheduler } from "./services/travelpulse-scheduler.service";

const slugAliases: Record<string, string> = {
  "romance": "date-night",
  "corporate": "corporate-events",
};

function resolveSlug(slug: string): string {
  return slugAliases[slug] || slug;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Auth: Replit, Facebook, and email authentication
  await registerAuthDomain(app);

  // Sub-routers (self-contained Express routers)
  app.use("/api/instagram", instagramRoutes);
  app.use("/api/bookings", bookingsRoutes);
  app.use("/api", bookingActionsRoutes);
  app.use("/api/messages", messagesRouter);
  app.use(myItineraryRoutes);
  app.use(transportHubRoutes);
  app.use(plancardRoutes);
  app.use(itineraryComparisonRoutes);

  // Background services
  travelPulseScheduler.start();

  // Domain route registration
  registerAdminRoutes(app, resolveSlug);
  registerProviderRoutes(app, resolveSlug);
  registerExpertRoutes(app, resolveSlug);
  registerCartRoutes(app, resolveSlug);
  registerItineraryShareRoutes(app, resolveSlug);
  registerMiscRoutes(app, resolveSlug);

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
    const usersList = await db.select().from(users).limit(1);
    let userId = usersList[0]?.id;

    if (!userId) {
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

    await db.insert(touristPlacesSearches).values({ search: "Tokyo" });
  }
}
