import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { 
  users, helpGuideTrips, touristPlaceResults, touristPlacesSearches, 
  aiBlueprints, vendors, insertVendorSchema,
  insertLocalExpertFormSchema, insertServiceProviderFormSchema,
  insertProviderServiceSchema, insertServiceCategorySchema,
  insertServiceSubcategorySchema, insertFaqSchema,
  insertServiceTemplateSchema, insertServiceBookingSchema, insertServiceReviewSchema,
  itineraryComparisons, itineraryVariants, itineraryVariantItems, itineraryVariantMetrics,
  userExperienceItems, userExperiences, providerServices, cartItems,
  insertCustomVenueSchema
} from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";
import OpenAI from "openai";
import { generateOptimizedItineraries, getComparisonWithVariants, selectVariant } from "./itinerary-optimizer";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Auth setup
  await setupAuth(app);
  registerAuthRoutes(app);

  // Trips Routes
  app.get(api.trips.list.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const trips = await storage.getTrips(userId);
    res.json(trips);
  });

  app.get(api.trips.get.path, isAuthenticated, async (req, res) => {
    const trip = await storage.getTrip(req.params.id);
    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }
    // Check ownership
    const userId = (req.user as any).claims.sub;
    if (trip.userId !== userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    res.json(trip);
  });

  app.post(api.trips.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.trips.create.input.parse(req.body);
      const userId = (req.user as any).claims.sub;
      const trip = await storage.createTrip({ ...input, userId });
      res.status(201).json(trip);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.patch(api.trips.update.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.trips.update.input.parse(req.body);
      const trip = await storage.getTrip(req.params.id);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      
      const userId = (req.user as any).claims.sub;
      if (trip.userId !== userId) return res.status(401).json({ message: "Unauthorized" });

      const updatedTrip = await storage.updateTrip(req.params.id, input);
      res.json(updatedTrip);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete(api.trips.delete.path, isAuthenticated, async (req, res) => {
    const trip = await storage.getTrip(req.params.id);
    if (!trip) return res.status(404).json({ message: "Trip not found" });
    
    const userId = (req.user as any).claims.sub;
    if (trip.userId !== userId) return res.status(401).json({ message: "Unauthorized" });

    await storage.deleteTrip(req.params.id);
    res.status(204).send();
  });

  app.post(api.trips.generateItinerary.path, isAuthenticated, async (req, res) => {
    const trip = await storage.getTrip(req.params.id);
    if (!trip) return res.status(404).json({ message: "Trip not found" });

    // Mock AI Generation for MVP
    const itinerary = await storage.createGeneratedItinerary({
      tripId: trip.id,
      itineraryData: {
        days: [
          {
            day: 1,
            activities: [
              { time: "10:00 AM", title: "Visit City Center", description: "Explore the main square." },
              { time: "2:00 PM", title: "Lunch at Local Cafe", description: "Try the famous pastry." }
            ]
          },
           {
            day: 2,
            activities: [
              { time: "09:00 AM", title: "Museum Tour", description: "Learn about local history." },
              { time: "4:00 PM", title: "Sunset View", description: "Best view in the city." }
            ]
          }
        ]
      },
      status: "generated"
    });
    res.status(201).json(itinerary);
  });

  // Tourist Places Routes
  app.get(api.touristPlaces.search.path, async (req, res) => {
    const query = req.query.query as string;
    if (!query) return res.json([]);
    const results = await storage.searchTouristPlaces(query);
    res.json(results);
  });

  // Chats Routes
  app.get(api.chats.list.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const chats = await storage.getChats(userId);
    res.json(chats);
  });

  app.post(api.chats.create.path, isAuthenticated, async (req, res) => {
     try {
      const input = api.chats.create.input.parse(req.body);
      // For MVP, just create it directly
      const chat = await storage.createChat(input);
      res.status(201).json(chat);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // Help Guide Trips Routes
  app.get(api.helpGuideTrips.list.path, async (req, res) => {
    const trips = await storage.getHelpGuideTrips();
    res.json(trips);
  });

  app.get(api.helpGuideTrips.get.path, async (req, res) => {
    const trip = await storage.getHelpGuideTrip(req.params.id);
    if (!trip) return res.status(404).json({ message: "Trip not found" });
    res.json(trip);
  });

  // AI Blueprint Generation API
  app.post("/api/ai/generate-blueprint", isAuthenticated, async (req, res) => {
    try {
      const { eventType, destination, travelers, startDate, endDate, budget, preferences } = req.body;
      const userId = (req.user as any).claims.sub;

      const prompt = `You are an expert travel planner. Create a detailed trip blueprint for the following:
      
Event Type: ${eventType || 'vacation'}
Destination: ${destination || 'To be determined'}
Number of Travelers: ${travelers || 2}
Dates: ${startDate || 'flexible'} to ${endDate || 'flexible'}
Budget: ${budget || 'moderate'}
Special Preferences: ${JSON.stringify(preferences || {})}

Please provide a comprehensive travel blueprint in JSON format with this structure:
{
  "title": "Trip title",
  "overview": "Brief trip overview",
  "estimatedBudget": { "min": number, "max": number, "currency": "USD" },
  "recommendedDuration": { "days": number, "nights": number },
  "highlights": ["highlight1", "highlight2", ...],
  "itinerary": [
    {
      "day": 1,
      "title": "Day title",
      "description": "Day overview",
      "activities": [
        { "time": "9:00 AM", "title": "Activity", "description": "Description", "estimatedCost": 50 }
      ],
      "meals": { "breakfast": "suggestion", "lunch": "suggestion", "dinner": "suggestion" },
      "accommodation": "Hotel recommendation"
    }
  ],
  "packingList": ["item1", "item2"],
  "travelTips": ["tip1", "tip2"],
  "recommendedVendors": [
    { "type": "hotel", "name": "Hotel Name", "reason": "Why recommended" }
  ]
}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a professional travel planning assistant. Always respond with valid JSON." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        max_tokens: 4000,
      });

      const blueprintContent = completion.choices[0]?.message?.content;
      const blueprintData = blueprintContent ? JSON.parse(blueprintContent) : {};

      const [blueprint] = await db.insert(aiBlueprints).values({
        userId,
        eventType: eventType || 'vacation',
        destination,
        blueprintData,
        status: 'generated',
      }).returning();

      res.status(201).json(blueprint);
    } catch (error) {
      console.error("Error generating blueprint:", error);
      res.status(500).json({ message: "Failed to generate blueprint" });
    }
  });

  // AI Chat Endpoint for Trip Planning
  app.post("/api/ai/chat", isAuthenticated, async (req, res) => {
    try {
      const { messages, tripContext } = req.body;

      const systemPrompt = `You are an expert travel advisor assistant for Traveloure. 
You help users plan trips, answer questions about destinations, provide recommendations for hotels, restaurants, activities, and help with wedding/honeymoon/special event planning.
${tripContext ? `Current trip context: ${JSON.stringify(tripContext)}` : ''}
Be friendly, helpful, and provide specific actionable advice. If recommending specific places, provide names and brief descriptions.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages
        ],
        max_tokens: 1500,
      });

      const response = completion.choices[0]?.message?.content || "I'm sorry, I couldn't process your request.";
      res.json({ response });
    } catch (error) {
      console.error("Error in AI chat:", error);
      res.status(500).json({ message: "Failed to process chat request" });
    }
  });

  // Experience AI Optimization endpoint
  app.post("/api/ai/optimize-experience", isAuthenticated, async (req, res) => {
    try {
      const { experienceType, destination, date, selectedServices, preferences } = req.body;
      
      const servicesContext = selectedServices?.map((s: any) => ({
        name: s.name,
        provider: s.provider,
        price: s.price,
        category: s.category
      })) || [];

      const systemPrompt = `You are an expert experience planning optimizer for Traveloure. 
Analyze the user's selected services and provide optimization recommendations.
Experience Type: ${experienceType}
Destination: ${destination || "Not specified"}
Date: ${date || "Flexible"}
Selected Services: ${JSON.stringify(servicesContext)}
Preferences: ${JSON.stringify(preferences || {})}

Provide a comprehensive optimization analysis in JSON format with this structure:
{
  "overallScore": number between 0-100,
  "summary": "Brief summary of the analysis",
  "recommendations": [
    { 
      "type": "timing" | "cost" | "quality" | "logistics" | "alternative",
      "title": "Recommendation title",
      "description": "Detailed recommendation",
      "impact": "high" | "medium" | "low",
      "potentialSavings": number or null
    }
  ],
  "optimizedSchedule": [
    {
      "time": "HH:MM AM/PM",
      "activity": "Activity name",
      "location": "Location",
      "notes": "Any special notes"
    }
  ],
  "estimatedTotal": {
    "original": number,
    "optimized": number,
    "savings": number
  },
  "warnings": ["Any concerns or warnings about the plan"]
}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Please analyze and optimize my ${experienceType} experience plan.` }
        ],
        response_format: { type: "json_object" },
        max_tokens: 2000,
      });

      const responseText = completion.choices[0]?.message?.content || "{}";
      const optimization = JSON.parse(responseText);
      
      res.json(optimization);
    } catch (error) {
      console.error("Error in experience optimization:", error);
      res.status(500).json({ 
        message: "Failed to optimize experience",
        overallScore: 0,
        summary: "Unable to process optimization request",
        recommendations: [],
        optimizedSchedule: [],
        estimatedTotal: { original: 0, optimized: 0, savings: 0 },
        warnings: ["Optimization service temporarily unavailable"]
      });
    }
  });

  // Vendors Routes
  app.get("/api/vendors", async (req, res) => {
    const { category, city } = req.query;
    const vendorList = await storage.getVendors(
      category as string | undefined, 
      city as string | undefined
    );
    res.json(vendorList);
  });

  app.post("/api/vendors", isAuthenticated, async (req, res) => {
    try {
      const input = insertVendorSchema.parse(req.body);
      const vendor = await storage.createVendor(input);
      res.status(201).json(vendor);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error creating vendor:", err);
      res.status(500).json({ message: "Failed to create vendor" });
    }
  });

  // === Expert Application Routes ===
  
  // Get current user's expert application
  app.get("/api/expert-application", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const form = await storage.getLocalExpertForm(userId);
    res.json(form || null);
  });

  // Submit expert application
  app.post("/api/expert-application", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      
      const existing = await storage.getLocalExpertForm(userId);
      if (existing) {
        return res.status(400).json({ message: "You already have an application submitted" });
      }

      const input = insertLocalExpertFormSchema.parse(req.body);
      const form = await storage.createLocalExpertForm({ ...input, userId });
      res.status(201).json(form);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error creating expert application:", err);
      res.status(500).json({ message: "Failed to submit application" });
    }
  });

  // Admin: Get platform stats
  app.get("/api/admin/stats", isAuthenticated, async (req, res) => {
    const user = req.user as any;
    if (user.claims.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    try {
      // Get counts from database
      const allUsers = await db.select().from(users);
      const allBookings = await storage.getServiceBookings({});
      const pendingExperts = await storage.getLocalExpertForms("pending");
      const pendingProviders = await storage.getServiceProviderForms("pending");
      
      const totalUsers = allUsers.length;
      const totalBookings = allBookings.length;
      
      // Calculate revenue from completed bookings
      const completedBookings = allBookings.filter(b => b.status === "completed");
      const totalRevenue = completedBookings.reduce((sum, b) => sum + parseFloat(b.platformFee || "0"), 0);
      
      // This month's revenue
      const now = new Date();
      const thisMonth = now.getMonth();
      const thisYear = now.getFullYear();
      const monthlyRevenue = completedBookings
        .filter(b => {
          const date = b.createdAt ? new Date(b.createdAt) : null;
          return date && date.getMonth() === thisMonth && date.getFullYear() === thisYear;
        })
        .reduce((sum, b) => sum + parseFloat(b.platformFee || "0"), 0);
      
      // New users today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const newUsersToday = allUsers.filter(u => {
        const created = u.createdAt ? new Date(u.createdAt) : null;
        return created && created >= today;
      }).length;
      
      res.json({
        totalUsers,
        totalBookings,
        totalRevenue,
        monthlyRevenue,
        newUsersToday,
        pendingExpertApplications: pendingExperts.length,
        pendingProviderApplications: pendingProviders.length,
      });
    } catch (err) {
      console.error("Admin stats error:", err);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // Admin: Get all expert applications
  app.get("/api/admin/expert-applications", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const status = req.query.status as string | undefined;
    const forms = await storage.getLocalExpertForms(status);
    res.json(forms);
  });

  // Admin: Update expert application status
  app.patch("/api/admin/expert-applications/:id/status", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const { status, rejectionMessage } = req.body;
    const updated = await storage.updateLocalExpertFormStatus(req.params.id, status, rejectionMessage);
    if (!updated) {
      return res.status(404).json({ message: "Application not found" });
    }
    
    // If approved, update user role to expert
    if (status === "approved") {
      await db.update(users).set({ role: "expert" }).where(eq(users.id, updated.userId));
    }
    
    res.json(updated);
  });

  // === Provider Application Routes ===
  
  // Get current user's provider application
  app.get("/api/provider-application", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const form = await storage.getServiceProviderForm(userId);
    res.json(form || null);
  });

  // Submit provider application
  app.post("/api/provider-application", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      
      const existing = await storage.getServiceProviderForm(userId);
      if (existing) {
        return res.status(400).json({ message: "You already have an application submitted" });
      }

      const input = insertServiceProviderFormSchema.parse(req.body);
      const form = await storage.createServiceProviderForm({ ...input, userId });
      res.status(201).json(form);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error creating provider application:", err);
      res.status(500).json({ message: "Failed to submit application" });
    }
  });

  // Admin: Get all provider applications
  app.get("/api/admin/provider-applications", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const status = req.query.status as string | undefined;
    const forms = await storage.getServiceProviderForms(status);
    res.json(forms);
  });

  // Admin: Update provider application status
  app.patch("/api/admin/provider-applications/:id/status", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const { status, rejectionMessage } = req.body;
    const updated = await storage.updateServiceProviderFormStatus(req.params.id, status, rejectionMessage);
    if (!updated) {
      return res.status(404).json({ message: "Application not found" });
    }
    res.json(updated);
  });

  // === Provider Services Routes ===
  
  // Get all active provider services (public - for experience browsing)
  app.get("/api/provider-services", async (req, res) => {
    const services = await storage.getAllProviderServices();
    res.json(services);
  });
  
  // Get provider's services
  app.get("/api/provider/services", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const services = await storage.getProviderServices(userId);
    res.json(services);
  });

  // Create a new service
  app.post("/api/provider/services", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const input = insertProviderServiceSchema.parse(req.body);
      const service = await storage.createProviderService({ ...input, userId });
      res.status(201).json(service);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error creating provider service:", err);
      res.status(500).json({ message: "Failed to create service" });
    }
  });

  // Update a service
  app.patch("/api/provider/services/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const services = await storage.getProviderServices(userId);
      const ownedService = services.find(s => s.id === req.params.id);
      if (!ownedService) {
        return res.status(404).json({ message: "Service not found or not owned by you" });
      }
      const input = insertProviderServiceSchema.partial().parse(req.body);
      // Remove userId from input to prevent ownership transfer
      const { userId: _, ...safeInput } = input as any;
      const updated = await storage.updateProviderService(req.params.id, safeInput);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to update service" });
    }
  });

  // Delete a service
  app.delete("/api/provider/services/:id", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const services = await storage.getProviderServices(userId);
    const ownedService = services.find(s => s.id === req.params.id);
    if (!ownedService) {
      return res.status(404).json({ message: "Service not found or not owned by you" });
    }
    await storage.deleteProviderService(req.params.id);
    res.status(204).send();
  });

  // === Service Categories Routes ===
  
  // Get all categories
  app.get("/api/service-categories", async (req, res) => {
    const categories = await storage.getServiceCategories();
    res.json(categories);
  });

  // Create category (admin)
  app.post("/api/service-categories", isAuthenticated, async (req, res) => {
    try {
      const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const input = insertServiceCategorySchema.parse(req.body);
      const category = await storage.createServiceCategory(input);
      res.status(201).json(category);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to create category" });
    }
  });

  // Get subcategories for a category
  app.get("/api/service-categories/:categoryId/subcategories", async (req, res) => {
    const subcategories = await storage.getServiceSubcategories(req.params.categoryId);
    res.json(subcategories);
  });

  // Create subcategory (admin)
  app.post("/api/service-subcategories", isAuthenticated, async (req, res) => {
    try {
      const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const input = insertServiceSubcategorySchema.parse(req.body);
      const subcategory = await storage.createServiceSubcategory(input);
      res.status(201).json(subcategory);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to create subcategory" });
    }
  });

  // === Custom Venues Routes ===
  
  // Get custom venues (with optional filters)
  app.get("/api/custom-venues", async (req, res) => {
    const { userId, tripId, experienceType } = req.query;
    const venues = await storage.getCustomVenues(
      userId as string | undefined,
      tripId as string | undefined,
      experienceType as string | undefined
    );
    res.json(venues);
  });

  // Get single custom venue
  app.get("/api/custom-venues/:id", async (req, res) => {
    const venue = await storage.getCustomVenue(req.params.id);
    if (!venue) {
      return res.status(404).json({ message: "Custom venue not found" });
    }
    res.json(venue);
  });

  // Create custom venue
  app.post("/api/custom-venues", async (req, res) => {
    try {
      const input = insertCustomVenueSchema.parse(req.body);
      const venue = await storage.createCustomVenue(input);
      res.status(201).json(venue);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error creating custom venue:", err);
      res.status(500).json({ message: "Failed to create custom venue" });
    }
  });

  // Update custom venue
  app.patch("/api/custom-venues/:id", async (req, res) => {
    try {
      const input = insertCustomVenueSchema.partial().parse(req.body);
      const updated = await storage.updateCustomVenue(req.params.id, input);
      if (!updated) {
        return res.status(404).json({ message: "Custom venue not found" });
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to update custom venue" });
    }
  });

  // Delete custom venue
  app.delete("/api/custom-venues/:id", async (req, res) => {
    await storage.deleteCustomVenue(req.params.id);
    res.status(204).send();
  });

  // === Experience Types Routes ===
  
  // Slug aliasing for backward compatibility
  const slugAliases: Record<string, string> = {
    "romance": "date-night",
    "corporate": "corporate-events",
  };
  
  function resolveSlug(slug: string): string {
    return slugAliases[slug] || slug;
  }
  
  // Get all experience types (filter out legacy slugs for frontend)
  app.get("/api/experience-types", async (req, res) => {
    const types = await storage.getExperienceTypes();
    // Filter out legacy slugs that have been aliased
    const legacySlugs = Object.keys(slugAliases);
    const filteredTypes = types.filter(t => !legacySlugs.includes(t.slug));
    res.json(filteredTypes);
  });

  // Get experience type by slug (with alias resolution)
  app.get("/api/experience-types/:slug", async (req, res) => {
    const resolvedSlug = resolveSlug(req.params.slug);
    const type = await storage.getExperienceTypeBySlug(resolvedSlug);
    if (!type) {
      return res.status(404).json({ message: "Experience type not found" });
    }
    res.json(type);
  });

  // Get template steps for an experience type
  app.get("/api/experience-types/:id/steps", async (req, res) => {
    const steps = await storage.getExperienceTemplateSteps(req.params.id);
    res.json(steps);
  });

  // === User Experiences Routes ===

  // Get user's experiences
  app.get("/api/user-experiences", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const experiences = await storage.getUserExperiences(userId);
    res.json(experiences);
  });

  // Get single experience with items
  app.get("/api/user-experiences/:id", isAuthenticated, async (req, res) => {
    const experience = await storage.getUserExperience(req.params.id);
    if (!experience) {
      return res.status(404).json({ message: "Experience not found" });
    }
    const items = await storage.getUserExperienceItems(req.params.id);
    res.json({ ...experience, items });
  });

  // Create new experience
  app.post("/api/user-experiences", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const experience = await storage.createUserExperience({ ...req.body, userId });
      res.status(201).json(experience);
    } catch (err) {
      res.status(500).json({ message: "Failed to create experience" });
    }
  });

  // Update experience
  app.patch("/api/user-experiences/:id", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const experience = await storage.getUserExperience(req.params.id);
    if (!experience || experience.userId !== userId) {
      return res.status(404).json({ message: "Experience not found" });
    }
    const updated = await storage.updateUserExperience(req.params.id, req.body);
    res.json(updated);
  });

  // Delete experience
  app.delete("/api/user-experiences/:id", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const experience = await storage.getUserExperience(req.params.id);
    if (!experience || experience.userId !== userId) {
      return res.status(404).json({ message: "Experience not found" });
    }
    await storage.deleteUserExperience(req.params.id);
    res.status(204).send();
  });

  // Add item to experience
  app.post("/api/user-experiences/:id/items", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const experience = await storage.getUserExperience(req.params.id);
    if (!experience || experience.userId !== userId) {
      return res.status(404).json({ message: "Experience not found" });
    }
    const item = await storage.addUserExperienceItem({ ...req.body, userExperienceId: req.params.id });
    res.status(201).json(item);
  });

  // Update experience item
  app.patch("/api/user-experience-items/:id", isAuthenticated, async (req, res) => {
    const updated = await storage.updateUserExperienceItem(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ message: "Item not found" });
    }
    res.json(updated);
  });

  // Remove experience item
  app.delete("/api/user-experience-items/:id", isAuthenticated, async (req, res) => {
    await storage.removeUserExperienceItem(req.params.id);
    res.status(204).send();
  });

  // === FAQ Routes ===
  
  // Get all FAQs
  app.get("/api/faqs", async (req, res) => {
    const category = req.query.category as string | undefined;
    const faqsList = await storage.getFAQs(category);
    res.json(faqsList);
  });

  // Create FAQ (admin)
  app.post("/api/faqs", isAuthenticated, async (req, res) => {
    try {
      const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const input = insertFaqSchema.parse(req.body);
      const faq = await storage.createFAQ(input);
      res.status(201).json(faq);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to create FAQ" });
    }
  });

  // Update FAQ (admin)
  app.patch("/api/faqs/:id", isAuthenticated, async (req, res) => {
    try {
      const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const input = insertFaqSchema.partial().parse(req.body);
      const updated = await storage.updateFAQ(req.params.id, input);
      if (!updated) {
        return res.status(404).json({ message: "FAQ not found" });
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to update FAQ" });
    }
  });

  // Delete FAQ (admin)
  app.delete("/api/faqs/:id", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    await storage.deleteFAQ(req.params.id);
    res.status(204).send();
  });

  // === Wallet & Credits Routes ===
  
  // Get current user's wallet
  app.get("/api/wallet", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const wallet = await storage.getOrCreateWallet(userId);
    res.json(wallet);
  });

  // Get wallet transactions
  app.get("/api/wallet/transactions", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const wallet = await storage.getWallet(userId);
    if (!wallet) {
      return res.json([]);
    }
    const transactions = await storage.getCreditTransactions(wallet.id);
    res.json(transactions);
  });

  // Add credits (admin only - for production, integrate with payment provider)
  app.post("/api/wallet/add-credits", isAuthenticated, async (req, res) => {
    try {
      const adminUser = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
      if (!adminUser || adminUser.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { userId, amount, description } = req.body;
      if (!userId || !amount || amount <= 0) {
        return res.status(400).json({ message: "Invalid userId or amount" });
      }
      const transaction = await storage.addCredits(userId, amount, description || "Credit purchase");
      res.status(201).json(transaction);
    } catch (err) {
      console.error("Error adding credits:", err);
      res.status(500).json({ message: "Failed to add credits" });
    }
  });

  // === Service Templates Routes (Admin manages, Experts browse) ===
  
  // Get all active service templates
  app.get("/api/service-templates", async (req, res) => {
    const categoryId = req.query.categoryId as string | undefined;
    const templates = await storage.getServiceTemplates(categoryId);
    res.json(templates);
  });

  // Get single template
  app.get("/api/service-templates/:id", async (req, res) => {
    const template = await storage.getServiceTemplate(req.params.id);
    if (!template) {
      return res.status(404).json({ message: "Template not found" });
    }
    res.json(template);
  });

  // Create template (admin only)
  app.post("/api/admin/service-templates", isAuthenticated, async (req, res) => {
    try {
      const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const input = insertServiceTemplateSchema.parse(req.body);
      const template = await storage.createServiceTemplate(input);
      res.status(201).json(template);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to create template" });
    }
  });

  // Update template (admin only)
  app.patch("/api/admin/service-templates/:id", isAuthenticated, async (req, res) => {
    try {
      const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const input = insertServiceTemplateSchema.partial().parse(req.body);
      const updated = await storage.updateServiceTemplate(req.params.id, input);
      if (!updated) {
        return res.status(404).json({ message: "Template not found" });
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to update template" });
    }
  });

  // Delete template (admin only - soft delete)
  app.delete("/api/admin/service-templates/:id", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    await storage.deleteServiceTemplate(req.params.id);
    res.status(204).send();
  });

  // === Admin Service Category Management ===

  // Get all categories with subcategories
  app.get("/api/admin/categories", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const type = req.query.type as string | undefined;
    const categories = await storage.getServiceCategories(type);
    const subcategories = await storage.getAllServiceSubcategories();
    
    // Attach subcategories to each category
    const categoriesWithSubs = categories.map(cat => ({
      ...cat,
      subcategories: subcategories.filter(sub => sub.categoryId === cat.id)
    }));
    res.json(categoriesWithSubs);
  });

  // Get single category
  app.get("/api/admin/categories/:id", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const category = await storage.getServiceCategoryById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    const subcategories = await storage.getServiceSubcategories(req.params.id);
    res.json({ ...category, subcategories });
  });

  // Create category (admin only)
  app.post("/api/admin/categories", isAuthenticated, async (req, res) => {
    try {
      const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const input = insertServiceCategorySchema.parse(req.body);
      const category = await storage.createServiceCategory(input);
      res.status(201).json(category);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to create category" });
    }
  });

  // Update category (admin only)
  app.patch("/api/admin/categories/:id", isAuthenticated, async (req, res) => {
    try {
      const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const input = insertServiceCategorySchema.partial().parse(req.body);
      const updated = await storage.updateServiceCategory(req.params.id, input);
      if (!updated) {
        return res.status(404).json({ message: "Category not found" });
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to update category" });
    }
  });

  // Delete category (admin only)
  app.delete("/api/admin/categories/:id", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    await storage.deleteServiceCategory(req.params.id);
    res.status(204).send();
  });

  // Create subcategory (admin only)
  app.post("/api/admin/categories/:categoryId/subcategories", isAuthenticated, async (req, res) => {
    try {
      const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const category = await storage.getServiceCategoryById(req.params.categoryId);
      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }
      const input = insertServiceSubcategorySchema.parse({ ...req.body, categoryId: req.params.categoryId });
      const subcategory = await storage.createServiceSubcategory(input);
      res.status(201).json(subcategory);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to create subcategory" });
    }
  });

  // Update subcategory (admin only)
  app.patch("/api/admin/subcategories/:id", isAuthenticated, async (req, res) => {
    try {
      const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const input = insertServiceSubcategorySchema.partial().parse(req.body);
      const updated = await storage.updateServiceSubcategory(req.params.id, input);
      if (!updated) {
        return res.status(404).json({ message: "Subcategory not found" });
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to update subcategory" });
    }
  });

  // Delete subcategory (admin only)
  app.delete("/api/admin/subcategories/:id", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    await storage.deleteServiceSubcategory(req.params.id);
    res.status(204).send();
  });

  // Seed 15 core categories (admin only - run once)
  app.post("/api/admin/seed-categories", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    const coreCategories = [
      { name: "Photography & Videography", slug: "photography-videography", description: "Portrait, event, engagement, family, architectural photography and travel videos, drone footage", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["portfolio", "insurance"], priceRange: { min: 150, max: 1000 }, sortOrder: 1 },
      { name: "Transportation & Logistics", slug: "transportation-logistics", description: "Private drivers, airport transfers, day trips, specialty transport", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["license", "insurance", "vehicle_registration"], priceRange: { min: 50, max: 800 }, sortOrder: 2 },
      { name: "Food & Culinary", slug: "food-culinary", description: "Private chefs, cooking lessons, meal prep, sommelier services, food tours", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["culinary_credentials", "food_handler_license"], priceRange: { min: 100, max: 600 }, sortOrder: 3 },
      { name: "Childcare & Family", slug: "childcare-family", description: "Babysitters, nannies, kids activity coordinators, family assistants", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["background_check", "cpr_certification", "references"], priceRange: { min: 20, max: 150 }, sortOrder: 4 },
      { name: "Tours & Experiences", slug: "tours-experiences", description: "Tour guides, walking tours, museum tours, adventure guides, cultural experiences", categoryType: "hybrid", verificationRequired: true, requiredDocuments: ["tour_guide_license", "insurance"], priceRange: { min: 100, max: 500 }, sortOrder: 5 },
      { name: "Personal Assistance", slug: "personal-assistance", description: "Travel companions, personal concierge, executive assistants", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["background_check", "references", "first_aid"], priceRange: { min: 100, max: 300 }, sortOrder: 6 },
      { name: "TaskRabbit Services", slug: "taskrabbit-services", description: "Handyman, delivery, cleaning, property management", categoryType: "service_provider", verificationRequired: false, requiredDocuments: [], priceRange: { min: 30, max: 200 }, sortOrder: 7 },
      { name: "Health & Wellness", slug: "health-wellness", description: "Fitness instructors, massage therapists, yoga teachers, wellness coaches", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["certification", "insurance"], priceRange: { min: 50, max: 200 }, sortOrder: 8 },
      { name: "Beauty & Styling", slug: "beauty-styling", description: "Hair stylists, makeup artists, personal stylists", categoryType: "service_provider", verificationRequired: false, requiredDocuments: ["portfolio"], priceRange: { min: 75, max: 300 }, sortOrder: 9 },
      { name: "Pets & Animals", slug: "pets-animals", description: "Pet sitters, dog walkers, animal experience guides", categoryType: "service_provider", verificationRequired: false, requiredDocuments: ["references"], priceRange: { min: 25, max: 100 }, sortOrder: 10 },
      { name: "Events & Celebrations", slug: "events-celebrations", description: "Event coordinators, florists, bakers, party planners", categoryType: "service_provider", verificationRequired: false, requiredDocuments: ["portfolio"], priceRange: { min: 100, max: 1500 }, sortOrder: 11 },
      { name: "Technology & Connectivity", slug: "technology-connectivity", description: "Tech support, social media management, photography editing", categoryType: "service_provider", verificationRequired: false, requiredDocuments: [], priceRange: { min: 50, max: 150 }, sortOrder: 12 },
      { name: "Language & Translation", slug: "language-translation", description: "Translators, interpreters, language tutors", categoryType: "hybrid", verificationRequired: true, requiredDocuments: ["certification", "references"], priceRange: { min: 50, max: 200 }, sortOrder: 13 },
      { name: "Specialty Services", slug: "specialty-services", description: "Wedding coordinators, relocation specialists, legal/visa assistants", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["license", "insurance"], priceRange: { min: 200, max: 2000 }, sortOrder: 14 },
      { name: "Custom / Other", slug: "custom-other", description: "Custom service requests, user-suggested categories", categoryType: "service_provider", verificationRequired: true, requiredDocuments: [], priceRange: { min: 0, max: 0 }, sortOrder: 15 },
    ];
    
    const created = [];
    for (const cat of coreCategories) {
      try {
        const existing = await storage.getServiceCategoryBySlug(cat.slug);
        if (!existing) {
          const newCat = await storage.createServiceCategory(cat as any);
          created.push(newCat);
        }
      } catch (err) {
        console.error(`Failed to create category ${cat.name}:`, err);
      }
    }
    
    res.json({ message: `Created ${created.length} categories`, categories: created });
  });

  // === Enhanced Expert Services Routes ===
  
  // Get single service by ID (public - for booking page)
  app.get("/api/services/:id", async (req, res) => {
    const service = await storage.getProviderServiceById(req.params.id);
    if (!service || service.status !== "active") {
      return res.status(404).json({ message: "Service not found" });
    }
    res.json(service);
  });

  // Browse all active services (public marketplace)
  app.get("/api/services", async (req, res) => {
    const categoryId = req.query.categoryId as string | undefined;
    const location = req.query.location as string | undefined;
    const services = await storage.getAllActiveServices(categoryId, location);
    res.json(services);
  });

  // Unified Discovery Search (public - with advanced filtering)
  app.get("/api/discover", async (req, res) => {
    const filters = {
      query: req.query.q as string | undefined,
      categoryId: req.query.categoryId as string | undefined,
      location: req.query.location as string | undefined,
      minPrice: req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined,
      maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined,
      minRating: req.query.minRating ? parseFloat(req.query.minRating as string) : undefined,
      sortBy: req.query.sortBy as "rating" | "price_low" | "price_high" | "reviews" | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
    };
    const result = await storage.unifiedSearch(filters);
    res.json(result);
  });

  // AI-Powered Service Recommendations
  app.post("/api/discover/recommendations", async (req, res) => {
    try {
      // Validate API key is configured
      if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY || !process.env.AI_INTEGRATIONS_OPENAI_BASE_URL) {
        return res.status(503).json({ message: "AI service not configured" });
      }

      // Validate request body
      const requestSchema = z.object({
        query: z.string().optional(),
        destination: z.string().optional(),
        tripType: z.string().optional(),
        budget: z.string().optional(),
      });
      
      const validatedBody = requestSchema.safeParse(req.body);
      if (!validatedBody.success) {
        return res.status(400).json({ message: "Invalid request body" });
      }
      
      const { query, destination, tripType, budget } = validatedBody.data;
      
      // Get all categories and available services for context
      const categories = await storage.getServiceCategories();
      const allServices = await storage.getAllActiveServices();
      
      // Build service summaries for AI context (limit to prevent token overflow)
      const serviceSummaries = allServices.slice(0, 50).map(s => ({
        id: s.id,
        name: s.serviceName,
        category: categories.find((c: { id: string; name: string }) => c.id === s.categoryId)?.name || "Other",
        price: s.price,
        rating: s.averageRating,
        location: s.location,
        description: s.shortDescription || s.description?.substring(0, 100),
      }));
      
      const categoryList = categories.map((c) => `${c.name} (${c.slug || "other"})`).join(", ");
      
      const prompt = `You are a travel service recommendation AI for Traveloure, a travel marketplace.

Based on the user's needs, recommend relevant service categories and specific services they might need.

User's Request:
- Search Query: ${query || "Not specified"}
- Destination: ${destination || "Not specified"}
- Trip Type: ${tripType || "General travel"}
- Budget: ${budget || "Flexible"}

Available Service Categories: ${categoryList}

Available Services (sample):
${JSON.stringify(serviceSummaries, null, 2)}

Please provide recommendations in this JSON format:
{
  "recommendedCategories": [
    {
      "slug": "category-slug",
      "name": "Category Name",
      "reason": "Why this category is relevant"
    }
  ],
  "recommendedServices": [
    {
      "id": "service-id",
      "reason": "Why this service is recommended"
    }
  ],
  "suggestions": "Brief personalized travel tip or suggestion based on their needs"
}

Provide 2-4 category recommendations and up to 5 specific service recommendations if relevant services are available.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a helpful travel planning assistant. Always respond with valid JSON." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 1024,
      });

      const responseText = completion.choices[0]?.message?.content || "{}";
      const recommendations = JSON.parse(responseText);
      
      // Enrich recommendations with full service data
      const enrichedServices = [];
      for (const rec of recommendations.recommendedServices || []) {
        const service = allServices.find(s => s.id === rec.id);
        if (service) {
          enrichedServices.push({
            ...service,
            recommendationReason: rec.reason,
          });
        }
      }
      
      res.json({
        recommendedCategories: recommendations.recommendedCategories || [],
        recommendedServices: enrichedServices,
        suggestions: recommendations.suggestions || "",
      });
    } catch (err) {
      console.error("AI Recommendations error:", err);
      res.status(500).json({ message: "Failed to generate recommendations" });
    }
  });

  // Get expert's services by status
  app.get("/api/expert/services", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const status = req.query.status as string | undefined;
    const services = await storage.getProviderServicesByStatus(userId, status);
    res.json(services);
  });

  // Toggle service status (pause/activate)
  app.patch("/api/expert/services/:id/status", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const service = await storage.getProviderServiceById(req.params.id);
      if (!service || service.userId !== userId) {
        return res.status(404).json({ message: "Service not found or not owned by you" });
      }
      const { status } = req.body;
      if (!["active", "paused", "draft"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const updated = await storage.toggleServiceStatus(req.params.id, status);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update status" });
    }
  });

  // Duplicate a service
  app.post("/api/expert/services/:id/duplicate", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const service = await storage.getProviderServiceById(req.params.id);
      if (!service || service.userId !== userId) {
        return res.status(404).json({ message: "Service not found or not owned by you" });
      }
      const duplicated = await storage.duplicateService(req.params.id, userId);
      res.status(201).json(duplicated);
    } catch (err) {
      res.status(500).json({ message: "Failed to duplicate service" });
    }
  });

  // Create service from template
  app.post("/api/expert/services/from-template/:templateId", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const template = await storage.getServiceTemplate(req.params.templateId);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      // Create service from template
      const serviceData = {
        userId,
        serviceName: template.title,
        description: template.description,
        categoryId: template.categoryId,
        price: template.suggestedPrice || "0",
        serviceType: template.serviceType,
        deliveryMethod: template.deliveryMethod,
        deliveryTimeframe: template.deliveryTimeframe,
        requirements: template.requirements,
        whatIncluded: template.whatIncluded,
        status: "draft",
      };
      
      const service = await storage.createProviderService(serviceData as any);
      res.status(201).json(service);
    } catch (err) {
      console.error("Error creating service from template:", err);
      res.status(500).json({ message: "Failed to create service from template" });
    }
  });

  // === Service Bookings Routes ===
  
  // Get bookings for provider (their services)
  app.get("/api/expert/bookings", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const status = req.query.status as string | undefined;
    const bookings = await storage.getServiceBookings({ providerId: userId, status });
    res.json(bookings);
  });

  // Get bookings for traveler (services they booked)
  // Provider bookings (for calendar)
  app.get("/api/provider/bookings", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const status = req.query.status as string | undefined;
    const bookings = await storage.getServiceBookings({ providerId: userId, status });
    
    // Enrich with service details
    const enrichedBookings = await Promise.all(bookings.map(async (booking) => {
      const service = await storage.getProviderServiceById(booking.serviceId);
      return { ...booking, service };
    }));
    
    res.json(enrichedBookings);
  });

  app.get("/api/my-bookings", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const status = req.query.status as string | undefined;
    const bookings = await storage.getServiceBookings({ travelerId: userId, status });
    
    // Enrich bookings with hasReview flag
    const enrichedBookings = await Promise.all(bookings.map(async (booking) => {
      const reviews = await storage.getReviewsByBookingId(booking.id);
      return { ...booking, hasReview: reviews.length > 0 };
    }));
    
    res.json(enrichedBookings);
  });

  // Get single booking
  app.get("/api/bookings/:id", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const booking = await storage.getServiceBooking(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    // Check if user is traveler or provider
    if (booking.travelerId !== userId && booking.providerId !== userId) {
      return res.status(403).json({ message: "Not authorized to view this booking" });
    }
    res.json(booking);
  });

  // Create a booking
  app.post("/api/bookings", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const input = insertServiceBookingSchema.parse(req.body);
      
      // Verify service exists and is active
      const service = await storage.getProviderServiceById(input.serviceId);
      if (!service || service.status !== "active") {
        return res.status(404).json({ message: "Service not found or not available" });
      }
      
      const booking = await storage.createServiceBooking({
        ...input,
        travelerId: userId,
        providerId: service.userId,
      });
      
      // Increment service bookings count
      await storage.incrementServiceBookings(service.id, Number(service.price) || 0);
      
      res.status(201).json(booking);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error creating booking:", err);
      res.status(500).json({ message: "Failed to create booking" });
    }
  });

  // Update booking status (provider actions)
  app.patch("/api/expert/bookings/:id/status", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const booking = await storage.getServiceBooking(req.params.id);
      if (!booking || booking.providerId !== userId) {
        return res.status(404).json({ message: "Booking not found or not yours" });
      }
      const { status, reason } = req.body;
      const updated = await storage.updateServiceBookingStatus(req.params.id, status, reason);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update booking status" });
    }
  });

  // Cancel booking (traveler action)
  app.post("/api/bookings/:id/cancel", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const booking = await storage.getServiceBooking(req.params.id);
      if (!booking || booking.travelerId !== userId) {
        return res.status(404).json({ message: "Booking not found or not yours" });
      }
      if (booking.status !== "pending" && booking.status !== "confirmed") {
        return res.status(400).json({ message: "Cannot cancel this booking" });
      }
      const { reason } = req.body;
      const updated = await storage.updateServiceBookingStatus(req.params.id, "cancelled", reason);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to cancel booking" });
    }
  });

  // === Notifications Routes ===

  // Get user notifications
  app.get("/api/notifications", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const unreadOnly = req.query.unread === "true";
    const notifications = await storage.getNotifications(userId, unreadOnly);
    res.json(notifications);
  });

  // Get unread count
  app.get("/api/notifications/unread-count", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const count = await storage.getUnreadCount(userId);
    res.json({ count });
  });

  // Mark notification as read
  app.patch("/api/notifications/:id/read", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const notification = await storage.markAsRead(req.params.id);
    if (notification && notification.userId !== userId) {
      return res.status(403).json({ message: "Not your notification" });
    }
    res.json(notification);
  });

  // Mark all as read
  app.post("/api/notifications/mark-all-read", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    await storage.markAllAsRead(userId);
    res.json({ success: true });
  });

  // Delete notification
  app.delete("/api/notifications/:id", isAuthenticated, async (req, res) => {
    await storage.deleteNotification(req.params.id);
    res.json({ success: true });
  });

  // === Service Reviews Routes ===
  
  // Get reviews for a service
  app.get("/api/services/:serviceId/reviews", async (req, res) => {
    const reviews = await storage.getServiceReviews(req.params.serviceId);
    res.json(reviews);
  });

  // Create a review (only after completed booking)
  app.post("/api/services/:serviceId/reviews", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      
      // Verify user has a completed booking for this service
      const bookings = await storage.getServiceBookings({ 
        travelerId: userId, 
        status: "completed" 
      });
      const hasCompletedBooking = bookings.some(b => b.serviceId === req.params.serviceId);
      if (!hasCompletedBooking) {
        return res.status(403).json({ message: "You can only review services you've completed" });
      }
      
      const service = await storage.getProviderServiceById(req.params.serviceId);
      if (!service) {
        return res.status(404).json({ message: "Service not found" });
      }
      
      const input = insertServiceReviewSchema.parse({
        ...req.body,
        serviceId: req.params.serviceId,
        travelerId: userId,
        providerId: service.userId,
      });
      
      const review = await storage.createServiceReview(input);
      res.status(201).json(review);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error creating review:", err);
      res.status(500).json({ message: "Failed to create review" });
    }
  });

  // Provider responds to a review
  app.post("/api/expert/reviews/:id/respond", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const review = await storage.getServiceReview(req.params.id);
      if (!review || review.providerId !== userId) {
        return res.status(404).json({ message: "Review not found or not for your service" });
      }
      const { responseText } = req.body;
      if (!responseText) {
        return res.status(400).json({ message: "Response text required" });
      }
      const updated = await storage.addReviewResponse(req.params.id, responseText);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to respond to review" });
    }
  });

  // Get expert's analytics/stats
  app.get("/api/expert/analytics", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const services = await storage.getProviderServicesByStatus(userId);
    const bookings = await storage.getServiceBookings({ providerId: userId });
    
    const totalRevenue = services.reduce((sum, s) => sum + Number(s.totalRevenue || 0), 0);
    const totalBookings = services.reduce((sum, s) => sum + (s.bookingsCount || 0), 0);
    const avgRating = services.filter(s => s.averageRating).reduce((sum, s, _, arr) => 
      sum + Number(s.averageRating) / arr.length, 0
    );
    
    const pendingBookings = bookings.filter(b => b.status === "pending").length;
    const completedBookings = bookings.filter(b => b.status === "completed").length;
    
    res.json({
      totalServices: services.length,
      activeServices: services.filter(s => s.status === "active").length,
      draftServices: services.filter(s => s.status === "draft").length,
      pausedServices: services.filter(s => s.status === "paused").length,
      totalRevenue,
      totalBookings,
      averageRating: avgRating || null,
      pendingBookings,
      completedBookings,
    });
  });

  // === Cart Routes ===

  // Get cart items
  app.get("/api/cart", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const rawSlug = req.query.experience as string | undefined;
    const experienceSlug = rawSlug ? resolveSlug(rawSlug) : undefined;
    const items = await storage.getCartItems(userId, experienceSlug);
    
    // Calculate totals
    const subtotal = items.reduce((sum, item) => {
      const price = parseFloat(item.service?.price || "0");
      return sum + (price * (item.quantity || 1));
    }, 0);
    
    const platformFee = subtotal * 0.20; // 20% platform fee
    const total = subtotal + platformFee;
    
    res.json({
      items,
      subtotal: subtotal.toFixed(2),
      platformFee: platformFee.toFixed(2),
      total: total.toFixed(2),
      itemCount: items.length,
    });
  });

  // Add to cart
  app.post("/api/cart", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { serviceId, quantity, tripId, scheduledDate, notes, experienceSlug: rawSlug } = req.body;
      
      if (!serviceId) {
        return res.status(400).json({ message: "Service ID is required" });
      }
      
      // Verify service exists
      const service = await storage.getProviderServiceById(serviceId);
      if (!service) {
        return res.status(404).json({ message: "Service not found" });
      }
      
      // Resolve slug aliases
      const experienceSlug = rawSlug ? resolveSlug(rawSlug) : "general";
      
      const item = await storage.addToCart(userId, {
        serviceId,
        quantity: quantity || 1,
        tripId,
        scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
        notes,
        experienceSlug,
      });
      
      res.status(201).json(item);
    } catch (err) {
      console.error("Add to cart error:", err);
      res.status(500).json({ message: "Failed to add to cart" });
    }
  });

  // Update cart item
  app.patch("/api/cart/:id", isAuthenticated, async (req, res) => {
    try {
      const { quantity, scheduledDate, notes } = req.body;
      const updated = await storage.updateCartItem(req.params.id, {
        quantity,
        scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
        notes,
      });
      
      if (!updated) {
        return res.status(404).json({ message: "Cart item not found" });
      }
      
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update cart item" });
    }
  });

  // Remove from cart
  app.delete("/api/cart/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.removeFromCart(req.params.id);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to remove from cart" });
    }
  });

  // Clear cart
  app.delete("/api/cart", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const experienceSlug = req.query.experience as string | undefined;
      await storage.clearCart(userId, experienceSlug);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to clear cart" });
    }
  });

  // === Checkout & Auto-Contract Generation ===

  // Create booking with auto-contract
  app.post("/api/checkout", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { tripId, notes } = req.body;
      
      // Get cart items
      const cartData = await storage.getCartItems(userId);
      
      if (cartData.length === 0) {
        return res.status(400).json({ message: "Cart is empty" });
      }
      
      // Calculate totals
      const subtotal = cartData.reduce((sum, item) => {
        const price = parseFloat(item.service?.price || "0");
        return sum + (price * (item.quantity || 1));
      }, 0);
      const platformFee = subtotal * 0.20;
      const total = subtotal + platformFee;
      
      // Create bookings for each cart item
      const bookings = [];
      for (const item of cartData) {
        if (!item.service) continue;
        
        const price = parseFloat(item.service.price || "0") * (item.quantity || 1);
        const fee = price * 0.20;
        
        // Create contract for this booking
        const contract = await storage.createContract({
          title: `Booking: ${item.service.serviceName}`,
          tripTo: item.service.location || "N/A",
          description: `Service booking for ${item.service.serviceName}. ${notes || ""}`,
          amount: price.toFixed(2),
        });
        
        // Create booking
        const booking = await storage.createServiceBooking({
          serviceId: item.serviceId,
          travelerId: userId,
          providerId: item.service.userId,
          contractId: contract.id,
          tripId: tripId || item.tripId,
          bookingDetails: {
            scheduledDate: item.scheduledDate,
            notes: item.notes || notes,
            quantity: item.quantity || 1,
          },
          totalAmount: price.toFixed(2),
          platformFee: fee.toFixed(2),
          providerEarnings: (price - fee).toFixed(2),
          status: "pending",
        });
        
        // Increment bookings count for the service
        await storage.incrementServiceBookings(item.serviceId, 1);
        
        // Create notification for provider
        await storage.createNotification({
          userId: item.service.userId,
          type: "booking_created",
          title: "New Booking Request",
          message: `You have a new booking for ${item.service.serviceName}`,
          relatedId: booking.id,
          relatedType: "booking",
        });
        
        bookings.push({ booking, contract });
      }
      
      // Clear cart after successful checkout
      await storage.clearCart(userId);
      
      res.status(201).json({
        success: true,
        bookings,
        total: total.toFixed(2),
        message: "Booking created successfully. Proceed to payment.",
      });
    } catch (err) {
      console.error("Checkout error:", err);
      res.status(500).json({ message: "Checkout failed" });
    }
  });

  // Get contract details
  app.get("/api/contracts/:id", isAuthenticated, async (req, res) => {
    const contract = await storage.getContract(req.params.id);
    if (!contract) {
      return res.status(404).json({ message: "Contract not found" });
    }
    res.json(contract);
  });

  // === Itinerary Comparison & Optimization Routes ===

  app.post("/api/itinerary-comparisons", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { userExperienceId, tripId, title, destination, startDate, endDate, budget, travelers, baselineItems: inlineBaselineItems } = req.body;

      const [comparison] = await db
        .insert(itineraryComparisons)
        .values({
          userId,
          userExperienceId,
          tripId,
          title: title || "My Itinerary Comparison",
          destination,
          startDate,
          endDate,
          budget: budget?.toString(),
          travelers: travelers || 1,
          status: "generating",
        })
        .returning();

      // Auto-generate AI alternatives immediately
      let baselineItems: any[] = [];

      if (inlineBaselineItems && inlineBaselineItems.length > 0) {
        baselineItems = inlineBaselineItems.map((item: any, index: number) => ({
          id: `inline-${index}`,
          name: item.name,
          description: item.description || "",
          serviceType: item.category || "service",
          price: parseFloat(item.price || "0"),
          rating: item.rating || 4.5,
          location: item.location || "",
          duration: item.duration || 120,
          dayNumber: item.dayNumber || Math.floor(index / 3) + 1,
          timeSlot: item.timeSlot || ["morning", "afternoon", "evening"][index % 3],
          category: item.category || "service",
          provider: item.provider || "Provider"
        }));
      } else {
        // Fall back to cart items
        const cartItemsData = await db
          .select({
            cartItem: cartItems,
            service: providerServices,
          })
          .from(cartItems)
          .leftJoin(providerServices, eq(cartItems.serviceId, providerServices.id))
          .where(eq(cartItems.userId, userId));

        baselineItems = cartItemsData.map((item, index) => ({
          id: item.cartItem.id,
          name: item.service?.serviceName || "Unknown Service",
          description: item.service?.shortDescription,
          serviceType: item.service?.serviceType,
          price: parseFloat(item.service?.price || "0"),
          rating: parseFloat(item.service?.averageRating || "4.5"),
          location: item.service?.location,
          duration: 120,
          dayNumber: Math.floor(index / 3) + 1,
          timeSlot: ["morning", "afternoon", "evening"][index % 3],
          category: item.service?.serviceType || "service",
          provider: "Provider"
        }));
      }

      // Trigger AI optimization in background if we have items
      if (baselineItems.length > 0) {
        const availableServices = await db
          .select()
          .from(providerServices)
          .where(eq(providerServices.status, "active"))
          .limit(100);

        // Ensure dates are in YYYY-MM-DD format
        const formatDate = (d: string | undefined | null) => {
          if (!d) return new Date().toISOString().split('T')[0];
          if (d.includes('T')) return d.split('T')[0];
          return d;
        };

        generateOptimizedItineraries(
          comparison.id,
          userId,
          baselineItems,
          availableServices,
          destination || "Unknown",
          formatDate(startDate),
          formatDate(endDate),
          budget ? parseFloat(budget) : undefined,
          travelers || 1
        ).catch((err) => console.error("Background optimization error:", err));
      }

      res.status(201).json(comparison);
    } catch (error) {
      console.error("Error creating comparison:", error);
      res.status(500).json({ message: "Failed to create comparison" });
    }
  });

  app.get("/api/itinerary-comparisons", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const comparisons = await db
        .select()
        .from(itineraryComparisons)
        .where(eq(itineraryComparisons.userId, userId))
        .orderBy(itineraryComparisons.createdAt);

      res.json(comparisons);
    } catch (error) {
      console.error("Error fetching comparisons:", error);
      res.status(500).json({ message: "Failed to fetch comparisons" });
    }
  });

  app.get("/api/itinerary-comparisons/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const result = await getComparisonWithVariants(req.params.id);

      if (!result) {
        return res.status(404).json({ message: "Comparison not found" });
      }

      if (result.comparison.userId !== userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      res.json(result);
    } catch (error) {
      console.error("Error fetching comparison:", error);
      res.status(500).json({ message: "Failed to fetch comparison" });
    }
  });

  app.post("/api/itinerary-comparisons/:id/generate", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const comparisonId = req.params.id;
      const { baselineItems: inlineBaselineItems } = req.body;

      const comparison = await db.query.itineraryComparisons.findFirst({
        where: eq(itineraryComparisons.id, comparisonId),
      });

      if (!comparison) {
        return res.status(404).json({ message: "Comparison not found" });
      }

      if (comparison.userId !== userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      let baselineItems: any[] = [];

      if (inlineBaselineItems && inlineBaselineItems.length > 0) {
        baselineItems = inlineBaselineItems.map((item: any, index: number) => ({
          id: `inline-${index}`,
          name: item.name,
          description: item.description || "",
          serviceType: "external",
          price: parseFloat(item.price || "0"),
          rating: item.rating || 4.5,
          location: item.location || "",
          duration: item.duration || 120,
          dayNumber: item.dayNumber || Math.floor(index / 3) + 1,
          timeSlot: item.timeSlot || ["morning", "afternoon", "evening"][index % 3],
          category: item.category || "service",
          provider: item.provider || "Provider"
        }));
      } else if (comparison.userExperienceId) {
        const items = await db
          .select()
          .from(userExperienceItems)
          .where(eq(userExperienceItems.userExperienceId, comparison.userExperienceId));

        baselineItems = items.map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          serviceType: item.providerServiceId ? "provider" : "external",
          price: parseFloat(item.price || "0"),
          rating: 4.5,
          location: item.location,
          duration: 120,
          dayNumber: 1,
          timeSlot: item.scheduledTime || "morning",
        }));
      } else {
        const cartItemsData = await db
          .select({
            cartItem: cartItems,
            service: providerServices,
          })
          .from(cartItems)
          .leftJoin(providerServices, eq(cartItems.serviceId, providerServices.id))
          .where(eq(cartItems.userId, userId));

        baselineItems = cartItemsData.map((item, index) => ({
          id: item.cartItem.id,
          name: item.service?.serviceName || "Unknown Service",
          description: item.service?.shortDescription,
          serviceType: item.service?.serviceType,
          price: parseFloat(item.service?.price || "0"),
          rating: parseFloat(item.service?.averageRating || "4.5"),
          location: item.service?.location,
          duration: 120,
          dayNumber: Math.floor(index / 3) + 1,
          timeSlot: ["morning", "afternoon", "evening"][index % 3],
        }));
      }

      if (baselineItems.length === 0) {
        return res.status(400).json({ message: "No items to optimize. Add services to your cart or experience first." });
      }

      const availableServices = await db
        .select()
        .from(providerServices)
        .where(eq(providerServices.status, "active"))
        .limit(100);

      res.json({ message: "Optimization started", status: "generating" });

      generateOptimizedItineraries(
        comparisonId,
        userId,
        baselineItems,
        availableServices,
        comparison.destination || "Unknown",
        comparison.startDate || new Date().toISOString(),
        comparison.endDate || new Date().toISOString(),
        comparison.budget ? parseFloat(comparison.budget) : undefined,
        comparison.travelers || 1
      ).catch((err) => console.error("Background optimization error:", err));

    } catch (error) {
      console.error("Error starting optimization:", error);
      res.status(500).json({ message: "Failed to start optimization" });
    }
  });

  app.post("/api/itinerary-comparisons/:id/select", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { variantId } = req.body;

      const comparison = await db.query.itineraryComparisons.findFirst({
        where: eq(itineraryComparisons.id, req.params.id),
      });

      if (!comparison) {
        return res.status(404).json({ message: "Comparison not found" });
      }

      if (comparison.userId !== userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const result = await selectVariant(req.params.id, variantId);

      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }

      res.json({ message: "Variant selected", variant: result.variant });
    } catch (error) {
      console.error("Error selecting variant:", error);
      res.status(500).json({ message: "Failed to select variant" });
    }
  });

  app.post("/api/itinerary-comparisons/:id/apply-to-cart", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const comparisonId = req.params.id;

      const comparison = await db.query.itineraryComparisons.findFirst({
        where: eq(itineraryComparisons.id, comparisonId),
      });

      if (!comparison || comparison.userId !== userId) {
        return res.status(404).json({ message: "Comparison not found" });
      }

      if (!comparison.selectedVariantId) {
        return res.status(400).json({ message: "No variant selected" });
      }

      const variantItems = await db
        .select()
        .from(itineraryVariantItems)
        .where(eq(itineraryVariantItems.variantId, comparison.selectedVariantId));

      await db.delete(cartItems).where(eq(cartItems.userId, userId));

      for (const item of variantItems) {
        if (item.providerServiceId) {
          await db.insert(cartItems).values({
            userId,
            serviceId: item.providerServiceId,
            quantity: 1,
            notes: `Day ${item.dayNumber} - ${item.timeSlot}`,
          });
        }
      }

      res.json({ message: "Cart updated with selected itinerary", itemsAdded: variantItems.length });
    } catch (error) {
      console.error("Error applying to cart:", error);
      res.status(500).json({ message: "Failed to apply itinerary to cart" });
    }
  });

  // === COORDINATION HUB API ROUTES ===

  // Vendor Availability Slots
  app.get("/api/vendor-availability/:serviceId", async (req, res) => {
    try {
      const { serviceId } = req.params;
      const { date } = req.query;
      const slots = await storage.getVendorAvailabilitySlots(serviceId, date as string | undefined);
      res.json(slots);
    } catch (error) {
      console.error("Error fetching availability slots:", error);
      res.status(500).json({ message: "Failed to fetch availability" });
    }
  });

  app.get("/api/provider/availability", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const slots = await storage.getProviderAvailabilitySlots(userId);
      res.json(slots);
    } catch (error) {
      console.error("Error fetching provider availability:", error);
      res.status(500).json({ message: "Failed to fetch availability" });
    }
  });

  app.post("/api/provider/availability", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const slot = await storage.createVendorAvailabilitySlot({ ...req.body, providerId: userId });
      res.status(201).json(slot);
    } catch (error) {
      console.error("Error creating availability slot:", error);
      res.status(500).json({ message: "Failed to create availability slot" });
    }
  });

  app.patch("/api/provider/availability/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const existingSlot = await storage.getVendorAvailabilitySlot(req.params.id);
      if (!existingSlot) return res.status(404).json({ message: "Slot not found" });
      if (existingSlot.providerId !== userId) return res.status(403).json({ message: "Unauthorized" });
      const slot = await storage.updateVendorAvailabilitySlot(req.params.id, req.body);
      res.json(slot);
    } catch (error) {
      console.error("Error updating availability slot:", error);
      res.status(500).json({ message: "Failed to update availability slot" });
    }
  });

  app.delete("/api/provider/availability/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const existingSlot = await storage.getVendorAvailabilitySlot(req.params.id);
      if (!existingSlot) return res.status(404).json({ message: "Slot not found" });
      if (existingSlot.providerId !== userId) return res.status(403).json({ message: "Unauthorized" });
      await storage.deleteVendorAvailabilitySlot(req.params.id);
      res.json({ message: "Slot deleted" });
    } catch (error) {
      console.error("Error deleting availability slot:", error);
      res.status(500).json({ message: "Failed to delete availability slot" });
    }
  });

  app.post("/api/vendor-availability/:id/book", isAuthenticated, async (req, res) => {
    try {
      const slot = await storage.bookSlot(req.params.id);
      if (!slot) return res.status(404).json({ message: "Slot not found" });
      res.json(slot);
    } catch (error) {
      console.error("Error booking slot:", error);
      res.status(500).json({ message: "Failed to book slot" });
    }
  });

  // Coordination States
  app.get("/api/coordination-states", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const states = await storage.getCoordinationStates(userId);
      res.json(states);
    } catch (error) {
      console.error("Error fetching coordination states:", error);
      res.status(500).json({ message: "Failed to fetch coordination states" });
    }
  });

  app.get("/api/coordination-states/:id", isAuthenticated, async (req, res) => {
    try {
      const state = await storage.getCoordinationState(req.params.id);
      if (!state) return res.status(404).json({ message: "Coordination state not found" });
      const userId = (req.user as any).claims.sub;
      if (state.userId !== userId) return res.status(403).json({ message: "Unauthorized" });
      res.json(state);
    } catch (error) {
      console.error("Error fetching coordination state:", error);
      res.status(500).json({ message: "Failed to fetch coordination state" });
    }
  });

  app.get("/api/coordination-states/active/:experienceType", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const state = await storage.getActiveCoordinationState(userId, req.params.experienceType);
      res.json(state || null);
    } catch (error) {
      console.error("Error fetching active coordination state:", error);
      res.status(500).json({ message: "Failed to fetch active coordination state" });
    }
  });

  app.post("/api/coordination-states", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const state = await storage.createCoordinationState({ ...req.body, userId });
      res.status(201).json(state);
    } catch (error) {
      console.error("Error creating coordination state:", error);
      res.status(500).json({ message: "Failed to create coordination state" });
    }
  });

  app.patch("/api/coordination-states/:id", isAuthenticated, async (req, res) => {
    try {
      const state = await storage.getCoordinationState(req.params.id);
      if (!state) return res.status(404).json({ message: "Coordination state not found" });
      const userId = (req.user as any).claims.sub;
      if (state.userId !== userId) return res.status(403).json({ message: "Unauthorized" });
      const updated = await storage.updateCoordinationState(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating coordination state:", error);
      res.status(500).json({ message: "Failed to update coordination state" });
    }
  });

  app.patch("/api/coordination-states/:id/status", isAuthenticated, async (req, res) => {
    try {
      const state = await storage.getCoordinationState(req.params.id);
      if (!state) return res.status(404).json({ message: "Coordination state not found" });
      const userId = (req.user as any).claims.sub;
      if (state.userId !== userId) return res.status(403).json({ message: "Unauthorized" });
      const { status, ...historyEntry } = req.body;
      const updated = await storage.updateCoordinationStatus(req.params.id, status, historyEntry);
      res.json(updated);
    } catch (error) {
      console.error("Error updating coordination status:", error);
      res.status(500).json({ message: "Failed to update coordination status" });
    }
  });

  app.delete("/api/coordination-states/:id", isAuthenticated, async (req, res) => {
    try {
      const state = await storage.getCoordinationState(req.params.id);
      if (!state) return res.status(404).json({ message: "Coordination state not found" });
      const userId = (req.user as any).claims.sub;
      if (state.userId !== userId) return res.status(403).json({ message: "Unauthorized" });
      await storage.deleteCoordinationState(req.params.id);
      res.json({ message: "Coordination state deleted" });
    } catch (error) {
      console.error("Error deleting coordination state:", error);
      res.status(500).json({ message: "Failed to delete coordination state" });
    }
  });

  // Coordination Bookings
  app.get("/api/coordination-states/:coordinationId/bookings", isAuthenticated, async (req, res) => {
    try {
      const state = await storage.getCoordinationState(req.params.coordinationId);
      if (!state) return res.status(404).json({ message: "Coordination state not found" });
      const userId = (req.user as any).claims.sub;
      if (state.userId !== userId) return res.status(403).json({ message: "Unauthorized" });
      const bookings = await storage.getCoordinationBookings(req.params.coordinationId);
      res.json(bookings);
    } catch (error) {
      console.error("Error fetching coordination bookings:", error);
      res.status(500).json({ message: "Failed to fetch bookings" });
    }
  });

  app.post("/api/coordination-states/:coordinationId/bookings", isAuthenticated, async (req, res) => {
    try {
      const state = await storage.getCoordinationState(req.params.coordinationId);
      if (!state) return res.status(404).json({ message: "Coordination state not found" });
      const userId = (req.user as any).claims.sub;
      if (state.userId !== userId) return res.status(403).json({ message: "Unauthorized" });
      const booking = await storage.createCoordinationBooking({ 
        ...req.body, 
        coordinationId: req.params.coordinationId 
      });
      res.status(201).json(booking);
    } catch (error) {
      console.error("Error creating coordination booking:", error);
      res.status(500).json({ message: "Failed to create booking" });
    }
  });

  app.patch("/api/coordination-bookings/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const booking = await storage.getCoordinationBooking(req.params.id);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      const state = await storage.getCoordinationState(booking.coordinationId);
      if (!state || state.userId !== userId) return res.status(403).json({ message: "Unauthorized" });
      const updated = await storage.updateCoordinationBooking(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating coordination booking:", error);
      res.status(500).json({ message: "Failed to update booking" });
    }
  });

  app.post("/api/coordination-bookings/:id/confirm", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const booking = await storage.getCoordinationBooking(req.params.id);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      const state = await storage.getCoordinationState(booking.coordinationId);
      if (!state || state.userId !== userId) return res.status(403).json({ message: "Unauthorized" });
      const { bookingReference, confirmationDetails } = req.body;
      const updated = await storage.confirmCoordinationBooking(req.params.id, bookingReference, confirmationDetails);
      res.json(updated);
    } catch (error) {
      console.error("Error confirming booking:", error);
      res.status(500).json({ message: "Failed to confirm booking" });
    }
  });

  app.delete("/api/coordination-bookings/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const booking = await storage.getCoordinationBooking(req.params.id);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      const state = await storage.getCoordinationState(booking.coordinationId);
      if (!state || state.userId !== userId) return res.status(403).json({ message: "Unauthorized" });
      await storage.deleteCoordinationBooking(req.params.id);
      res.json({ message: "Booking deleted" });
    } catch (error) {
      console.error("Error deleting booking:", error);
      res.status(500).json({ message: "Failed to delete booking" });
    }
  });

  // Call seed database
  seedDatabase().catch(err => console.error("Error seeding database:", err));

  return httpServer;
}

// Seed Database Function
export async function seedDatabase() {
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

    await db.insert(touristPlaceResults).values([
      {
        searchId: search.id,
        country: "Japan",
        city: "Tokyo",
        place: "Senso-ji",
        description: "Ancient Buddhist temple.",
        activities: ["Praying", "Shopping"],
        festivals: ["Sanja Matsuri"],
        category: "Temple",
        bestMonths: "Spring, Autumn"
      }
    ]).catch(err => console.log("Seeding tourist places failed:", err.message));
  }
}
