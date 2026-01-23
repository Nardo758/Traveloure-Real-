import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { registerChatRoutes } from "./replit_integrations/chat/routes";
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
import Anthropic from "@anthropic-ai/sdk";
import { generateOptimizedItineraries, getComparisonWithVariants, selectVariant } from "./itinerary-optimizer";
import { amadeusService } from "./services/amadeus.service";
import { viatorService } from "./services/viator.service";
import { cacheService } from "./services/cache.service";
import { cacheSchedulerService } from "./services/cache-scheduler.service";
import { claudeService } from "./services/claude.service";
import { getTransitRoute, getMultipleTransitRoutes, TransitRequestSchema } from "./services/routes.service";
import { aiOrchestrator } from "./services/ai-orchestrator";
import { grokService } from "./services/grok.service";
import { feverService } from "./services/fever.service";
import { feverCacheService } from "./services/fever-cache.service";
import { expertMatchScores, aiGeneratedItineraries, destinationIntelligence, localExpertForms, expertAiTasks, aiInteractions, destinationEvents } from "@shared/schema";

// Helper function to map Fever categories to TravelPulse event types
function mapFeverCategoryToEventType(category: string): string {
  const categoryMap: Record<string, string> = {
    'experiences': 'cultural',
    'concerts': 'cultural',
    'theater': 'cultural',
    'exhibitions': 'cultural',
    'festivals': 'cultural',
    'nightlife': 'nightlife',
    'food-drink': 'culinary',
    'sports': 'sports',
    'wellness': 'wellness',
    'tours': 'cultural',
    'classes': 'cultural',
    'family': 'family',
  };
  return categoryMap[category] || 'other';
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Auth setup
  await setupAuth(app);
  registerAuthRoutes(app);
  
  // Chat routes for AI Assistant conversations
  registerChatRoutes(app);

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

      const completion = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: "You are a professional travel planning assistant. Always respond with valid JSON.",
        messages: [
          { role: "user", content: prompt }
        ],
      });

      const blueprintContent = completion.content[0]?.type === "text" ? completion.content[0].text : null;
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

      // Transform messages to ensure proper Anthropic format with alternation
      const anthropicMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
      for (const m of messages || []) {
        const role = m.role as "user" | "assistant";
        const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
        const lastRole = anthropicMessages.length > 0 ? anthropicMessages[anthropicMessages.length - 1].role : null;
        if (lastRole === role) {
          anthropicMessages[anthropicMessages.length - 1].content += "\n" + content;
        } else {
          anthropicMessages.push({ role, content });
        }
      }
      
      // Ensure first message is from user
      if (anthropicMessages.length === 0 || anthropicMessages[0].role !== "user") {
        anthropicMessages.unshift({ role: "user", content: "Hello, I need help with travel planning." });
      }

      const completion = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system: systemPrompt,
        messages: anthropicMessages,
      });

      const response = completion.content[0]?.type === "text" ? completion.content[0].text : "I'm sorry, I couldn't process your request.";
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

      const completion = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: systemPrompt,
        messages: [
          { role: "user", content: `Please analyze and optimize my ${experienceType} experience plan.` }
        ],
      });

      const responseText = completion.content[0]?.type === "text" ? completion.content[0].text : "{}";
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

  // Get all expert service categories with offerings (public)
  app.get("/api/expert-service-categories", async (_req, res) => {
    const categories = await storage.getExpertServiceCategories();
    const categoriesWithOfferings = await Promise.all(categories.map(async (cat) => {
      const offerings = await storage.getExpertServiceOfferings(cat.id);
      return { ...cat, offerings };
    }));
    res.json(categoriesWithOfferings);
  });

  // Get expert service offerings for a specific category
  app.get("/api/expert-service-categories/:categoryId/offerings", async (req, res) => {
    const offerings = await storage.getExpertServiceOfferings(req.params.categoryId);
    res.json(offerings);
  });

  // Get all experts with their full profiles (public)
  app.get("/api/experts", async (req, res) => {
    const experienceTypeId = req.query.experienceTypeId as string | undefined;
    const experts = await storage.getExpertsWithProfiles(experienceTypeId);
    res.json(experts);
  });

  // Get a single expert with profile by ID (public)
  app.get("/api/experts/:id", async (req, res) => {
    const experts = await storage.getExpertsWithProfiles();
    const expert = experts.find(e => e.id === req.params.id);
    if (!expert) {
      return res.status(404).json({ message: "Expert not found" });
    }
    res.json(expert);
  });

  // Get current expert's selected services (authenticated)
  app.get("/api/expert/selected-services", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const services = await storage.getExpertSelectedServices(userId);
    res.json(services);
  });

  // Add service offering to expert's profile (authenticated)
  app.post("/api/expert/selected-services", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const { serviceOfferingId, customPrice } = req.body;
    const service = await storage.addExpertSelectedService(userId, serviceOfferingId, customPrice);
    res.json(service);
  });

  // Remove service offering from expert's profile (authenticated)
  app.delete("/api/expert/selected-services/:serviceOfferingId", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    await storage.removeExpertSelectedService(userId, req.params.serviceOfferingId);
    res.json({ success: true });
  });

  // Get current expert's specializations (authenticated)
  app.get("/api/expert/specializations", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const specializations = await storage.getExpertSpecializations(userId);
    res.json(specializations);
  });

  // Add specialization to expert's profile (authenticated)
  app.post("/api/expert/specializations", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const { specialization } = req.body;
    const spec = await storage.addExpertSpecialization(userId, specialization);
    res.json(spec);
  });

  // Remove specialization from expert's profile (authenticated)
  app.delete("/api/expert/specializations/:specialization", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    await storage.removeExpertSpecialization(userId, req.params.specialization);
    res.json({ success: true });
  });

  // === Expert Custom Services (User-submitted offerings) ===
  
  // Get current expert's custom services (authenticated)
  app.get("/api/expert/custom-services", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const services = await storage.getExpertCustomServices(userId);
    res.json(services);
  });

  // Get single custom service by ID (authenticated - owner only)
  app.get("/api/expert/custom-services/:id", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const service = await storage.getExpertCustomServiceById(req.params.id);
    if (!service) {
      return res.status(404).json({ message: "Custom service not found" });
    }
    if (service.expertId !== userId) {
      return res.status(403).json({ message: "Not authorized to view this service" });
    }
    res.json(service);
  });

  // Create new custom service (authenticated - experts only)
  app.post("/api/expert/custom-services", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const user = await db.select().from(users).where(eq(users.id, userId)).then(r => r[0]);
      
      if (!user || (user.role !== "expert" && user.role !== "admin")) {
        return res.status(403).json({ message: "Expert access required" });
      }

      const { title, description, categoryName, existingCategoryId, price, duration, deliverables, cancellationPolicy, leadTime, imageUrl, galleryImages, experienceTypes, isActive } = req.body;
      
      if (!title || !price) {
        return res.status(400).json({ message: "Title and price are required" });
      }

      const service = await storage.createExpertCustomService(userId, {
        title,
        description,
        categoryName,
        existingCategoryId,
        price: price.toString(),
        duration,
        deliverables,
        cancellationPolicy,
        leadTime,
        imageUrl,
        galleryImages,
        experienceTypes,
        isActive: isActive !== false,
      });
      res.status(201).json(service);
    } catch (err) {
      console.error("Error creating custom service:", err);
      res.status(500).json({ message: "Failed to create custom service" });
    }
  });

  // Update custom service (authenticated - owner only, draft status only)
  app.patch("/api/expert/custom-services/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const service = await storage.getExpertCustomServiceById(req.params.id);
      
      if (!service) {
        return res.status(404).json({ message: "Custom service not found" });
      }
      if (service.expertId !== userId) {
        return res.status(403).json({ message: "Not authorized to update this service" });
      }
      if (service.status !== "draft" && service.status !== "rejected") {
        return res.status(400).json({ message: "Can only update draft or rejected services" });
      }

      const updated = await storage.updateExpertCustomService(req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      console.error("Error updating custom service:", err);
      res.status(500).json({ message: "Failed to update custom service" });
    }
  });

  // Submit custom service for approval (authenticated - owner only)
  app.post("/api/expert/custom-services/:id/submit", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const service = await storage.getExpertCustomServiceById(req.params.id);
      
      if (!service) {
        return res.status(404).json({ message: "Custom service not found" });
      }
      if (service.expertId !== userId) {
        return res.status(403).json({ message: "Not authorized to submit this service" });
      }
      if (service.status !== "draft" && service.status !== "rejected") {
        return res.status(400).json({ message: "Can only submit draft or rejected services" });
      }

      const submitted = await storage.submitExpertCustomService(req.params.id);
      res.json(submitted);
    } catch (err) {
      console.error("Error submitting custom service:", err);
      res.status(500).json({ message: "Failed to submit custom service" });
    }
  });

  // Delete custom service (authenticated - owner only, draft/rejected status only)
  app.delete("/api/expert/custom-services/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const service = await storage.getExpertCustomServiceById(req.params.id);
      
      if (!service) {
        return res.status(404).json({ message: "Custom service not found" });
      }
      if (service.expertId !== userId) {
        return res.status(403).json({ message: "Not authorized to delete this service" });
      }
      if (service.status === "approved") {
        return res.status(400).json({ message: "Cannot delete approved services. Deactivate instead." });
      }

      await storage.deleteExpertCustomService(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting custom service:", err);
      res.status(500).json({ message: "Failed to delete custom service" });
    }
  });

  // Admin: Get all custom services pending approval
  app.get("/api/admin/custom-services/pending", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const services = await storage.getExpertCustomServicesByStatus("submitted");
    res.json(services);
  });

  // Admin: Approve custom service
  app.post("/api/admin/custom-services/:id/approve", isAuthenticated, async (req, res) => {
    try {
      const adminId = (req.user as any).claims.sub;
      const user = await db.select().from(users).where(eq(users.id, adminId)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const service = await storage.getExpertCustomServiceById(req.params.id);
      if (!service) {
        return res.status(404).json({ message: "Custom service not found" });
      }
      if (service.status !== "submitted") {
        return res.status(400).json({ message: "Can only approve submitted services" });
      }

      const approved = await storage.approveExpertCustomService(req.params.id, adminId);
      res.json(approved);
    } catch (err) {
      console.error("Error approving custom service:", err);
      res.status(500).json({ message: "Failed to approve custom service" });
    }
  });

  // Admin: Reject custom service
  app.post("/api/admin/custom-services/:id/reject", isAuthenticated, async (req, res) => {
    try {
      const adminId = (req.user as any).claims.sub;
      const user = await db.select().from(users).where(eq(users.id, adminId)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { reason } = req.body;
      if (!reason) {
        return res.status(400).json({ message: "Rejection reason is required" });
      }

      const service = await storage.getExpertCustomServiceById(req.params.id);
      if (!service) {
        return res.status(404).json({ message: "Custom service not found" });
      }
      if (service.status !== "submitted") {
        return res.status(400).json({ message: "Can only reject submitted services" });
      }

      const rejected = await storage.rejectExpertCustomService(req.params.id, adminId, reason);
      res.json(rejected);
    } catch (err) {
      console.error("Error rejecting custom service:", err);
      res.status(500).json({ message: "Failed to reject custom service" });
    }
  });

  // === Destination Calendar (Public travel guide) ===
  
  // Get countries with calendar data (public)
  app.get("/api/destination-calendar/countries", async (req, res) => {
    try {
      const countries = await storage.getCalendarCountries();
      res.json(countries);
    } catch (err) {
      console.error("Error fetching calendar countries:", err);
      res.status(500).json({ message: "Failed to fetch countries" });
    }
  });

  // Get approved events for a destination (public)
  app.get("/api/destination-calendar/events", async (req, res) => {
    try {
      const country = req.query.country as string;
      const city = req.query.city as string | undefined;
      
      if (!country) {
        return res.status(400).json({ message: "Country is required" });
      }
      
      const events = await storage.getApprovedDestinationEvents(country, city);
      res.json(events);
    } catch (err) {
      console.error("Error fetching destination events:", err);
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });

  // Get seasons for a destination (public)
  app.get("/api/destination-calendar/seasons", async (req, res) => {
    try {
      const country = req.query.country as string;
      const city = req.query.city as string | undefined;
      
      if (!country) {
        return res.status(400).json({ message: "Country is required" });
      }
      
      const seasons = await storage.getDestinationSeasons(country, city);
      res.json(seasons);
    } catch (err) {
      console.error("Error fetching destination seasons:", err);
      res.status(500).json({ message: "Failed to fetch seasons" });
    }
  });

  // Get contributor's own destination events (authenticated)
  app.get("/api/destination-calendar/my-events", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const events = await storage.getContributorDestinationEvents(userId);
      res.json(events);
    } catch (err) {
      console.error("Error fetching contributor events:", err);
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });

  // Create a new destination event (authenticated - contributor)
  app.post("/api/destination-calendar/events", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const event = await storage.createDestinationEvent({
        ...req.body,
        contributorId: userId,
        status: "draft",
        sourceType: "manual"
      });
      res.json(event);
    } catch (err) {
      console.error("Error creating destination event:", err);
      res.status(500).json({ message: "Failed to create event" });
    }
  });

  // Update destination event (authenticated - contributor only)
  app.put("/api/destination-calendar/events/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const event = await storage.getDestinationEventById(req.params.id);
      
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      if (event.contributorId !== userId) {
        return res.status(403).json({ message: "Not authorized to update this event" });
      }
      if (event.status !== "draft" && event.status !== "rejected") {
        return res.status(400).json({ message: "Can only update draft or rejected events" });
      }

      const updated = await storage.updateDestinationEvent(req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      console.error("Error updating destination event:", err);
      res.status(500).json({ message: "Failed to update event" });
    }
  });

  // Submit destination event for approval (authenticated - contributor only)
  app.post("/api/destination-calendar/events/:id/submit", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const event = await storage.getDestinationEventById(req.params.id);
      
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      if (event.contributorId !== userId) {
        return res.status(403).json({ message: "Not authorized to submit this event" });
      }
      if (event.status !== "draft" && event.status !== "rejected") {
        return res.status(400).json({ message: "Can only submit draft or rejected events" });
      }

      const submitted = await storage.submitDestinationEvent(req.params.id);
      res.json(submitted);
    } catch (err) {
      console.error("Error submitting destination event:", err);
      res.status(500).json({ message: "Failed to submit event" });
    }
  });

  // Delete destination event (authenticated - contributor only)
  app.delete("/api/destination-calendar/events/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const event = await storage.getDestinationEventById(req.params.id);
      
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      if (event.contributorId !== userId) {
        return res.status(403).json({ message: "Not authorized to delete this event" });
      }
      if (event.status === "approved") {
        return res.status(400).json({ message: "Cannot delete approved events" });
      }

      await storage.deleteDestinationEvent(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting destination event:", err);
      res.status(500).json({ message: "Failed to delete event" });
    }
  });

  // Admin: Get pending destination events
  app.get("/api/admin/destination-events/pending", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const events = await storage.getPendingDestinationEvents();
    res.json(events);
  });

  // Admin: Approve destination event
  app.post("/api/admin/destination-events/:id/approve", isAuthenticated, async (req, res) => {
    try {
      const adminId = (req.user as any).claims.sub;
      const user = await db.select().from(users).where(eq(users.id, adminId)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const event = await storage.getDestinationEventById(req.params.id);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      if (event.status !== "pending") {
        return res.status(400).json({ message: "Can only approve pending events" });
      }

      const approved = await storage.approveDestinationEvent(req.params.id, adminId);
      res.json(approved);
    } catch (err) {
      console.error("Error approving destination event:", err);
      res.status(500).json({ message: "Failed to approve event" });
    }
  });

  // Admin: Reject destination event
  app.post("/api/admin/destination-events/:id/reject", isAuthenticated, async (req, res) => {
    try {
      const adminId = (req.user as any).claims.sub;
      const user = await db.select().from(users).where(eq(users.id, adminId)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { reason } = req.body;
      if (!reason) {
        return res.status(400).json({ message: "Rejection reason is required" });
      }

      const event = await storage.getDestinationEventById(req.params.id);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      if (event.status !== "pending") {
        return res.status(400).json({ message: "Can only reject pending events" });
      }

      const rejected = await storage.rejectDestinationEvent(req.params.id, adminId, reason);
      res.json(rejected);
    } catch (err) {
      console.error("Error rejecting destination event:", err);
      res.status(500).json({ message: "Failed to reject event" });
    }
  });

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
      if (!process.env.ANTHROPIC_API_KEY) {
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

      const completion = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: "You are a helpful travel planning assistant. Always respond with valid JSON.",
        messages: [
          { role: "user", content: prompt }
        ],
      });

      const responseText = completion.content[0]?.type === "text" ? completion.content[0].text : "{}";
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
      const { serviceId, customVenueId, quantity, tripId, scheduledDate, notes, experienceSlug: rawSlug } = req.body;
      
      console.log("[Cart] Add to cart request:", { serviceId, customVenueId, experienceSlug: rawSlug });
      
      if (!serviceId && !customVenueId) {
        return res.status(400).json({ message: "Service ID or Custom Venue ID is required" });
      }
      
      // Verify service or custom venue exists
      if (serviceId) {
        const service = await storage.getProviderServiceById(serviceId);
        if (!service) {
          console.log("[Cart] Service not found for ID:", serviceId);
          return res.status(404).json({ message: "Service not found" });
        }
      }
      
      if (customVenueId) {
        const venue = await storage.getCustomVenue(customVenueId);
        if (!venue) {
          return res.status(404).json({ message: "Custom venue not found" });
        }
        // Verify user owns the custom venue
        if (venue.userId !== userId) {
          return res.status(403).json({ message: "Unauthorized" });
        }
      }
      
      // Resolve slug aliases
      const experienceSlug = rawSlug ? resolveSlug(rawSlug) : "general";
      
      const item = await storage.addToCart(userId, {
        serviceId: serviceId || undefined,
        customVenueId: customVenueId || undefined,
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

  // Amadeus Travel API Routes
  
  // Search airports/cities for autocomplete - uses database cache first
  app.get("/api/amadeus/locations", isAuthenticated, async (req, res) => {
    try {
      const { keyword, subType } = req.query;
      if (!keyword || typeof keyword !== 'string') {
        return res.status(400).json({ message: "Keyword is required" });
      }
      
      console.log(`[Amadeus Locations] Searching for: "${keyword}", subType: ${subType}`);
      
      const locationType = subType === 'CITY' ? 'CITY' : 'AIRPORT';
      
      // First, search the database cache
      const cachedLocations = await storage.searchLocationCache(keyword, locationType);
      console.log(`[Amadeus Locations] Found ${cachedLocations.length} cached locations for "${keyword}"`);
      
      if (cachedLocations.length > 0) {
        // Return cached locations using rawData for exact Amadeus API format matching
        const formattedLocations = cachedLocations.map(loc => {
          // If rawData exists, use it directly for exact API format
          if (loc.rawData && typeof loc.rawData === 'object' && Object.keys(loc.rawData).length > 0) {
            return loc.rawData;
          }
          // Fallback: construct from individual fields
          return {
            type: "location",
            subType: loc.locationType,
            name: loc.name,
            detailedName: loc.detailedName,
            id: loc.iataCode,
            iataCode: loc.iataCode,
            geoCode: loc.latitude && loc.longitude ? {
              latitude: Number(loc.latitude),
              longitude: Number(loc.longitude)
            } : undefined,
            address: {
              cityName: loc.cityName,
              cityCode: loc.cityCode,
              countryName: loc.countryName,
              countryCode: loc.countryCode,
              regionCode: loc.regionCode,
              stateCode: loc.stateCode,
            },
            timeZoneOffset: loc.timeZoneOffset,
            analytics: loc.travelerScore ? { travelers: { score: loc.travelerScore } } : undefined,
          };
        });
        // Sort by traveler score descending - higher score = more popular destination
        formattedLocations.sort((a: any, b: any) => {
          const scoreA = a.analytics?.travelers?.score ?? 0;
          const scoreB = b.analytics?.travelers?.score ?? 0;
          return scoreB - scoreA;
        });
        console.log(`[Amadeus Locations] Sorted results - first: ${formattedLocations[0]?.name} (score: ${formattedLocations[0]?.analytics?.travelers?.score ?? 0})`);
        return res.json(formattedLocations);
      }
      
      // If not in cache, fetch from API and cache the results
      const locations = subType === 'CITY' 
        ? await amadeusService.searchCitiesByKeyword(keyword)
        : await amadeusService.searchAirportsByKeyword(keyword);
      
      // Store in cache for future use (expires in 30 days)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      
      for (const loc of locations) {
        await storage.upsertLocationCache({
          iataCode: loc.iataCode,
          locationType: loc.subType || locationType,
          name: loc.name,
          detailedName: loc.detailedName,
          cityName: loc.address?.cityName,
          cityCode: loc.address?.cityCode,
          countryName: loc.address?.countryName,
          countryCode: loc.address?.countryCode,
          regionCode: loc.address?.regionCode,
          stateCode: loc.address?.stateCode,
          latitude: loc.geoCode?.latitude?.toString(),
          longitude: loc.geoCode?.longitude?.toString(),
          timeZoneOffset: loc.timeZoneOffset,
          travelerScore: loc.analytics?.travelers?.score,
          rawData: loc,
          expiresAt,
        });
      }
      
      // Sort by traveler score descending - higher score = more popular destination
      locations.sort((a: any, b: any) => {
        const scoreA = a.analytics?.travelers?.score ?? 0;
        const scoreB = b.analytics?.travelers?.score ?? 0;
        return scoreB - scoreA;
      });
      
      res.json(locations);
    } catch (error: any) {
      console.error('Location search error:', error);
      res.status(500).json({ message: error.message || "Location search failed" });
    }
  });

  // Search flights
  app.get("/api/amadeus/flights", isAuthenticated, async (req, res) => {
    try {
      const { 
        origin, destination, departureDate, returnDate, 
        adults, children, infants, travelClass, nonStop, max 
      } = req.query;
      
      if (!origin || !destination || !departureDate || !adults) {
        return res.status(400).json({ 
          message: "Required fields: origin, destination, departureDate, adults" 
        });
      }
      
      const flights = await amadeusService.searchFlights({
        originLocationCode: origin as string,
        destinationLocationCode: destination as string,
        departureDate: departureDate as string,
        returnDate: returnDate as string | undefined,
        adults: parseInt(adults as string, 10),
        children: children ? parseInt(children as string, 10) : undefined,
        infants: infants ? parseInt(infants as string, 10) : undefined,
        travelClass: travelClass as any,
        nonStop: nonStop === 'true',
        max: max ? parseInt(max as string, 10) : 10,
      });
      
      res.json(flights);
    } catch (error: any) {
      console.error('Flight search error:', error);
      res.status(500).json({ message: error.message || "Flight search failed" });
    }
  });

  // Search hotels by city
  app.get("/api/amadeus/hotels", isAuthenticated, async (req, res) => {
    try {
      const { cityCode, checkInDate, checkOutDate, adults, rooms, currency } = req.query;
      
      if (!cityCode || !checkInDate || !checkOutDate || !adults) {
        return res.status(400).json({ 
          message: "Required fields: cityCode, checkInDate, checkOutDate, adults" 
        });
      }
      
      const hotels = await amadeusService.searchHotels({
        cityCode: cityCode as string,
        checkInDate: checkInDate as string,
        checkOutDate: checkOutDate as string,
        adults: parseInt(adults as string, 10),
        roomQuantity: rooms ? parseInt(rooms as string, 10) : 1,
        currency: (currency as string) || 'USD',
      });
      
      res.json(hotels);
    } catch (error: any) {
      console.error('Hotel search error:', error);
      res.status(500).json({ message: error.message || "Hotel search failed" });
    }
  });

  // ============ VIATOR API ROUTES ============

  // Search activities by destination (freetext search)
  app.get("/api/viator/activities", isAuthenticated, async (req, res) => {
    try {
      const { destination, currency, count } = req.query;
      
      if (!destination || typeof destination !== 'string') {
        return res.status(400).json({ message: "destination is required" });
      }
      
      // Try to get from API first
      try {
        const result = await viatorService.searchByFreetext(
          destination,
          (currency as string) || 'USD',
          count ? parseInt(count as string, 10) : 20
        );
        res.json(result);
      } catch (apiError: any) {
        // If API fails, check if it's a temporary server error
        if (apiError.message?.includes('500')) {
          console.error('Viator API temporarily unavailable:', apiError.message);
          // Return empty results with a service notice instead of error
          res.json({
            products: [],
            totalCount: 0,
            serviceNotice: "The activities service is temporarily unavailable. Please try again in a few minutes."
          });
        } else {
          throw apiError;
        }
      }
    } catch (error: any) {
      console.error('Viator activity search error:', error);
      res.status(500).json({ message: error.message || "Activity search failed" });
    }
  });

  // Get activity details by product code
  app.get("/api/viator/activities/:productCode", isAuthenticated, async (req, res) => {
    try {
      const { productCode } = req.params;
      
      const product = await viatorService.getProductDetails(productCode);
      
      if (!product) {
        return res.status(404).json({ message: "Activity not found" });
      }
      
      res.json(product);
    } catch (error: any) {
      console.error('Viator product details error:', error);
      res.status(500).json({ message: error.message || "Failed to get activity details" });
    }
  });

  // Check availability for an activity
  app.post("/api/viator/availability", isAuthenticated, async (req, res) => {
    try {
      const { productCode, travelDate, travelers } = req.body;
      
      if (!productCode || !travelDate) {
        return res.status(400).json({ message: "productCode and travelDate are required" });
      }
      
      const paxMix = [{ ageBand: 'ADULT', numberOfTravelers: travelers || 1 }];
      const availability = await viatorService.checkAvailability(productCode, travelDate, paxMix);
      
      res.json(availability);
    } catch (error: any) {
      console.error('Viator availability check error:', error);
      res.status(500).json({ message: error.message || "Availability check failed" });
    }
  });

  // Get Viator destinations
  app.get("/api/viator/destinations", isAuthenticated, async (req, res) => {
    try {
      const destinations = await viatorService.getDestinations();
      res.json(destinations);
    } catch (error: any) {
      console.error('Viator destinations error:', error);
      res.status(500).json({ message: error.message || "Failed to get destinations" });
    }
  });

  // ============ CACHED DATA WITH LOCATIONS API ============

  // Get cached hotels with location data for mapping
  app.get("/api/cache/hotels", isAuthenticated, async (req, res) => {
    try {
      const { cityCode, checkInDate, checkOutDate, adults, rooms, currency } = req.query;
      
      if (!cityCode || !checkInDate || !checkOutDate || !adults) {
        return res.status(400).json({ 
          message: "Required fields: cityCode, checkInDate, checkOutDate, adults" 
        });
      }
      
      const result = await cacheService.getHotelsWithCache({
        cityCode: cityCode as string,
        checkInDate: checkInDate as string,
        checkOutDate: checkOutDate as string,
        adults: parseInt(adults as string, 10),
        roomQuantity: rooms ? parseInt(rooms as string, 10) : 1,
        currency: (currency as string) || 'USD',
      });
      
      res.json({
        hotels: result.data,
        fromCache: result.fromCache,
        lastUpdated: result.lastUpdated,
      });
    } catch (error: any) {
      console.error('Cached hotel search error:', error);
      res.status(500).json({ message: error.message || "Hotel search failed" });
    }
  });

  // Get cached activities with location data for mapping
  app.get("/api/cache/activities", isAuthenticated, async (req, res) => {
    try {
      const { destination, currency, count } = req.query;
      
      if (!destination || typeof destination !== 'string') {
        return res.status(400).json({ message: "destination is required" });
      }
      
      const result = await cacheService.getActivitiesWithCache(
        destination,
        (currency as string) || 'USD',
        count ? parseInt(count as string, 10) : 20
      );
      
      res.json({
        activities: result.data,
        fromCache: result.fromCache,
        lastUpdated: result.lastUpdated,
      });
    } catch (error: any) {
      console.error('Cached activity search error:', error);
      res.status(500).json({ message: error.message || "Activity search failed" });
    }
  });

  // Get cached flights
  app.get("/api/cache/flights", isAuthenticated, async (req, res) => {
    try {
      const { origin, destination, departureDate, returnDate, adults, travelClass, nonStop } = req.query;
      
      if (!origin || !destination || !departureDate || !adults) {
        return res.status(400).json({ 
          message: "Required fields: origin, destination, departureDate, adults" 
        });
      }
      
      const result = await cacheService.getFlightsWithCache({
        originLocationCode: origin as string,
        destinationLocationCode: destination as string,
        departureDate: departureDate as string,
        returnDate: returnDate as string | undefined,
        adults: parseInt(adults as string, 10),
        travelClass: (travelClass as 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST') || 'ECONOMY',
        nonStop: nonStop === 'true',
        max: 20,
      });
      
      res.json({
        flights: result.data,
        fromCache: result.fromCache,
        lastUpdated: result.lastUpdated,
      });
    } catch (error: any) {
      console.error('Cached flight search error:', error);
      res.status(500).json({ message: error.message || "Flight search failed" });
    }
  });

  // Get map markers for hotels in a destination
  app.get("/api/cache/map/hotels", isAuthenticated, async (req, res) => {
    try {
      const { cityCode } = req.query;
      const markers = await cacheService.getCachedHotelsWithLocations(cityCode as string);
      res.json(markers);
    } catch (error: any) {
      console.error('Hotel map markers error:', error);
      res.status(500).json({ message: error.message || "Failed to get hotel markers" });
    }
  });

  // Get map markers for activities in a destination
  app.get("/api/cache/map/activities", isAuthenticated, async (req, res) => {
    try {
      const { destination } = req.query;
      const markers = await cacheService.getCachedActivitiesWithLocations(destination as string);
      res.json(markers);
    } catch (error: any) {
      console.error('Activity map markers error:', error);
      res.status(500).json({ message: error.message || "Failed to get activity markers" });
    }
  });

  // Verify availability before purchase
  const verifyItemSchema = z.object({
    type: z.enum(['hotel', 'activity', 'flight']),
    id: z.string(),
    checkInDate: z.string().optional(),
    checkOutDate: z.string().optional(),
    travelDate: z.string().optional(),
    adults: z.number().optional(),
    rooms: z.number().optional(),
    currency: z.string().optional(),
  });

  const verifyAvailabilitySchema = z.object({
    items: z.array(verifyItemSchema).min(1).max(50),
  });

  app.post("/api/cache/verify-availability", isAuthenticated, async (req, res) => {
    try {
      const parseResult = verifyAvailabilitySchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Invalid request", 
          errors: parseResult.error.errors 
        });
      }

      const { items } = parseResult.data;
      
      const results = await Promise.all(items.map(async (item) => {
        if (item.type === 'hotel') {
          const hotelId = item.id.replace('hotel-', '');
          if (!item.checkInDate || !item.checkOutDate) {
            return { ...item, available: false, error: 'checkInDate and checkOutDate required for hotels' };
          }
          const result = await cacheService.verifyHotelAvailability(
            hotelId, 
            item.checkInDate, 
            item.checkOutDate,
            { 
              adults: item.adults, 
              rooms: item.rooms, 
              currency: item.currency 
            }
          );
          return { ...item, ...result };
        } else if (item.type === 'activity') {
          const productCode = item.id.replace('activity-', '');
          const result = await cacheService.verifyActivityAvailability(productCode, item.travelDate);
          return { ...item, ...result };
        }
        return { ...item, available: true };
      }));
      
      res.json({ 
        items: results,
        allAvailable: results.every(r => r.available),
        priceChanges: results.filter(r => r.priceChanged),
      });
    } catch (error: any) {
      console.error('Availability verification error:', error);
      res.status(500).json({ message: error.message || "Verification failed" });
    }
  });

  // Clean up expired cache entries
  app.post("/api/cache/cleanup", isAuthenticated, async (req, res) => {
    try {
      const result = await cacheService.cleanupExpiredCache();
      res.json({ 
        message: "Cache cleanup complete",
        deleted: result,
      });
    } catch (error: any) {
      console.error('Cache cleanup error:', error);
      res.status(500).json({ message: error.message || "Cleanup failed" });
    }
  });

  // ============ FILTERING AND SORTING API ============

  // Zod schemas for filter validation
  const hotelFilterSchema = z.object({
    cityCode: z.string().max(10).optional(),
    searchQuery: z.string().max(200).optional(),
    priceMin: z.coerce.number().min(0).max(100000).optional(),
    priceMax: z.coerce.number().min(0).max(100000).optional(),
    minRating: z.coerce.number().min(0).max(5).optional(),
    preferenceTags: z.string().max(500).optional(),
    county: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    countryCode: z.string().max(5).optional(),
    sortBy: z.enum(['price_low', 'price_high', 'rating', 'popularity', 'newest']).optional(),
    limit: z.coerce.number().min(1).max(100).default(20),
    offset: z.coerce.number().min(0).default(0),
  });

  const activityFilterSchema = z.object({
    destination: z.string().max(200).optional(),
    searchQuery: z.string().max(200).optional(),
    priceMin: z.coerce.number().min(0).max(100000).optional(),
    priceMax: z.coerce.number().min(0).max(100000).optional(),
    minRating: z.coerce.number().min(0).max(5).optional(),
    preferenceTags: z.string().max(500).optional(),
    category: z.string().max(100).optional(),
    county: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    countryCode: z.string().max(5).optional(),
    sortBy: z.enum(['price_low', 'price_high', 'rating', 'popularity', 'newest']).optional(),
    limit: z.coerce.number().min(1).max(100).default(20),
    offset: z.coerce.number().min(0).default(0),
  });

  // Get filtered hotels with pagination
  app.get("/api/cache/filter/hotels", isAuthenticated, async (req, res) => {
    try {
      const parsed = hotelFilterSchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid filter parameters", errors: parsed.error.errors });
      }
      const filters = parsed.data;

      const result = await cacheService.getFilteredHotels({
        cityCode: filters.cityCode,
        searchQuery: filters.searchQuery,
        priceMin: filters.priceMin,
        priceMax: filters.priceMax,
        minRating: filters.minRating,
        preferenceTags: filters.preferenceTags ? filters.preferenceTags.split(',').filter(t => t.trim()) : undefined,
        county: filters.county,
        state: filters.state,
        countryCode: filters.countryCode,
        sortBy: filters.sortBy,
        limit: filters.limit,
        offset: filters.offset,
      });

      res.json(result);
    } catch (error: any) {
      console.error('Filter hotels error:', error);
      res.status(500).json({ message: error.message || "Filter failed" });
    }
  });

  // Get filtered activities with pagination
  app.get("/api/cache/filter/activities", isAuthenticated, async (req, res) => {
    try {
      const parsed = activityFilterSchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid filter parameters", errors: parsed.error.errors });
      }
      const filters = parsed.data;

      const result = await cacheService.getFilteredActivities({
        destination: filters.destination,
        searchQuery: filters.searchQuery,
        priceMin: filters.priceMin,
        priceMax: filters.priceMax,
        minRating: filters.minRating,
        preferenceTags: filters.preferenceTags ? filters.preferenceTags.split(',').filter(t => t.trim()) : undefined,
        category: filters.category,
        county: filters.county,
        state: filters.state,
        countryCode: filters.countryCode,
        sortBy: filters.sortBy,
        limit: filters.limit,
        offset: filters.offset,
      });

      res.json(result);
    } catch (error: any) {
      console.error('Filter activities error:', error);
      res.status(500).json({ message: error.message || "Filter failed" });
    }
  });

  // Get available preference tags with counts
  app.get("/api/cache/preference-tags/:itemType", isAuthenticated, async (req, res) => {
    try {
      const { itemType } = req.params;
      if (itemType !== 'hotel' && itemType !== 'activity') {
        return res.status(400).json({ message: "itemType must be 'hotel' or 'activity'" });
      }
      const tags = await cacheService.getAvailablePreferenceTags(itemType);
      res.json(tags);
    } catch (error: any) {
      console.error('Get preference tags error:', error);
      res.status(500).json({ message: error.message || "Failed to get preference tags" });
    }
  });

  // Get available categories with counts (for activities)
  app.get("/api/cache/categories", isAuthenticated, async (req, res) => {
    try {
      const categories = await cacheService.getAvailableCategories();
      res.json(categories);
    } catch (error: any) {
      console.error('Get categories error:', error);
      res.status(500).json({ message: error.message || "Failed to get categories" });
    }
  });

  // ============ CACHE SCHEDULER ROUTES ============

  // Get cache freshness status
  app.get("/api/cache/status", isAuthenticated, async (req, res) => {
    try {
      const status = await cacheSchedulerService.getCacheFreshnessStatus();
      res.json(status);
    } catch (error: any) {
      console.error('Get cache status error:', error);
      res.status(500).json({ message: error.message || "Failed to get cache status" });
    }
  });

  // Trigger manual cache refresh (admin only)
  app.post("/api/cache/refresh", isAuthenticated, async (req, res) => {
    try {
      // Check if user is admin (optional - can be enforced later)
      if (cacheSchedulerService.isCurrentlyRefreshing()) {
        return res.status(409).json({ message: "Cache refresh already in progress" });
      }
      
      const stats = await cacheSchedulerService.triggerManualRefresh();
      res.json({
        message: "Cache refresh completed",
        stats,
      });
    } catch (error: any) {
      console.error('Manual cache refresh error:', error);
      res.status(500).json({ message: error.message || "Cache refresh failed" });
    }
  });

  // Pre-checkout verification endpoint
  const checkoutVerifySchema = z.object({
    items: z.array(z.object({
      type: z.enum(['hotel', 'activity', 'flight']),
      id: z.string().max(100),
      params: z.object({
        checkInDate: z.string().optional(),
        checkOutDate: z.string().optional(),
        travelDate: z.string().optional(),
        adults: z.number().optional(),
        rooms: z.number().optional(),
        currency: z.string().optional(),
      }).optional(),
    })).max(20),
  });

  app.post("/api/cache/checkout-verify", isAuthenticated, async (req, res) => {
    try {
      const parsed = checkoutVerifySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });
      }

      const results = await cacheSchedulerService.verifyAndRefreshForCheckout(parsed.data.items);
      
      const allVerified = results.every(r => r.verified);
      const priceChanges = results.filter(r => r.priceChanged);
      
      res.json({
        verified: allVerified,
        items: results,
        priceChanges: priceChanges.length > 0 ? priceChanges : null,
        message: allVerified 
          ? "All items verified successfully" 
          : "Some items could not be verified",
      });
    } catch (error: any) {
      console.error('Checkout verification error:', error);
      res.status(500).json({ message: error.message || "Verification failed" });
    }
  });

  // ============ CLAUDE AI ROUTES ============

  // Zod schemas for Claude API validation
  const claudeCartItemSchema = z.object({
    id: z.string().max(100),
    type: z.string().max(50),
    name: z.string().max(500),
    price: z.number().min(0).max(1000000),
    details: z.string().max(1000).optional(),
    metadata: z.object({
      cabin: z.string().max(50).optional(),
      baggage: z.string().max(100).optional(),
      stops: z.number().min(0).max(10).optional(),
      duration: z.string().max(50).optional(),
      airline: z.string().max(100).optional(),
      departureTime: z.string().max(50).optional(),
      arrivalTime: z.string().max(50).optional(),
      refundable: z.boolean().optional(),
      cancellationDeadline: z.string().max(100).optional(),
      boardType: z.string().max(50).optional(),
      nights: z.number().min(0).max(365).optional(),
      checkInDate: z.string().max(20).optional(),
      checkOutDate: z.string().max(20).optional(),
      meetingPoint: z.string().max(500).optional(),
      meetingPointCoordinates: z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      }).optional(),
      travelers: z.number().min(1).max(100).optional(),
    }).passthrough().optional(),
  });

  const claudeOptimizeSchema = z.object({
    destination: z.string().min(1).max(200),
    startDate: z.string().max(20),
    endDate: z.string().max(20),
    travelers: z.number().min(1).max(100).optional(),
    budget: z.number().min(0).max(10000000).optional(),
    cartItems: z.array(claudeCartItemSchema).max(50),
    preferences: z.object({
      pacePreference: z.enum(['relaxed', 'moderate', 'packed']).optional(),
      prioritizeProximity: z.boolean().optional(),
      prioritizeBudget: z.boolean().optional(),
      prioritizeRatings: z.boolean().optional(),
    }).optional(),
  });

  const claudeTransportSchema = z.object({
    hotelLocation: z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      address: z.string().max(500),
    }),
    activityLocations: z.array(z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      address: z.string().max(500),
      name: z.string().max(300),
    })).max(20),
  });

  const claudeRecommendationsSchema = z.object({
    destination: z.string().min(1).max(200),
    dates: z.object({
      start: z.string().max(20),
      end: z.string().max(20),
    }),
    interests: z.array(z.string().max(50)).max(20),
  });

  // Optimize itinerary using Claude
  app.post("/api/claude/optimize-itinerary", isAuthenticated, async (req, res) => {
    try {
      const parsed = claudeOptimizeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }
      
      const { destination, startDate, endDate, travelers, budget, cartItems, preferences } = parsed.data;
      
      // Strip rawData from cart items to prevent prompt injection and reduce payload size
      const sanitizedCartItems = cartItems.map(item => ({
        ...item,
        metadata: item.metadata ? { ...item.metadata, rawData: undefined } : undefined,
      }));
      
      const result = await claudeService.optimizeItinerary({
        destination,
        startDate,
        endDate,
        travelers: travelers || 1,
        budget,
        cartItems: sanitizedCartItems,
        preferences,
      });
      
      res.json(result);
    } catch (error: any) {
      console.error('Claude itinerary optimization error:', error);
      res.status(500).json({ message: error.message || "Itinerary optimization failed" });
    }
  });

  // Analyze transportation needs
  app.post("/api/claude/transportation-analysis", isAuthenticated, async (req, res) => {
    try {
      const parsed = claudeTransportSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }
      
      const { hotelLocation, activityLocations } = parsed.data;
      
      const result = await claudeService.analyzeTransportationNeeds(hotelLocation, activityLocations);
      res.json(result);
    } catch (error: any) {
      console.error('Claude transportation analysis error:', error);
      res.status(500).json({ message: error.message || "Transportation analysis failed" });
    }
  });

  // Full itinerary graph analysis (Airport → Hotel → Activities → Hotel → Airport)
  app.post("/api/claude/full-itinerary-graph", isAuthenticated, async (req, res) => {
    try {
      const schema = z.object({
        flightInfo: z.object({
          arrivalAirport: z.string().optional(),
          arrivalAirportCoords: z.object({ lat: z.number(), lng: z.number() }).optional(),
          departureAirport: z.string().optional(),
          departureAirportCoords: z.object({ lat: z.number(), lng: z.number() }).optional(),
          arrivalTime: z.string().optional(),
          departureTime: z.string().optional(),
        }).optional().default({}),
        hotelLocation: z.object({
          lat: z.number(),
          lng: z.number(),
          address: z.string(),
          name: z.string(),
        }),
        activityLocations: z.array(z.object({
          lat: z.number(),
          lng: z.number(),
          address: z.string(),
          name: z.string(),
          date: z.string().optional(),
          time: z.string().optional(),
        })),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }
      
      const { flightInfo, hotelLocation, activityLocations } = parsed.data;
      
      const result = await claudeService.analyzeFullItineraryGraph(
        flightInfo || {},
        hotelLocation,
        activityLocations
      );
      res.json(result);
    } catch (error: any) {
      console.error('Claude full itinerary graph analysis error:', error);
      res.status(500).json({ message: error.message || "Full itinerary graph analysis failed" });
    }
  });

  // Get travel recommendations
  app.post("/api/claude/recommendations", isAuthenticated, async (req, res) => {
    try {
      const parsed = claudeRecommendationsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }
      
      const { destination, dates, interests } = parsed.data;
      
      const result = await claudeService.generateTravelRecommendations(destination, dates, interests);
      res.json(result);
    } catch (error: any) {
      console.error('Claude recommendations error:', error);
      res.status(500).json({ message: error.message || "Recommendations generation failed" });
    }
  });

  // Google Routes API - Single transit route
  app.post("/api/routes/transit", isAuthenticated, async (req, res) => {
    try {
      const parsed = TransitRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }
      
      const route = await getTransitRoute(parsed.data);
      
      if (!route) {
        return res.status(404).json({ message: "No transit route found" });
      }
      
      res.json(route);
    } catch (error: any) {
      console.error('Routes API error:', error);
      res.status(500).json({ message: error.message || "Transit route lookup failed" });
    }
  });

  // Google Routes API - Multiple transit routes from one origin to many destinations
  const multiTransitSchema = z.object({
    origin: z.object({
      lat: z.number(),
      lng: z.number(),
      name: z.string().optional(),
    }),
    destinations: z.array(z.object({
      id: z.string(),
      lat: z.number(),
      lng: z.number(),
      name: z.string(),
    })),
  });

  app.post("/api/routes/transit-multi", isAuthenticated, async (req, res) => {
    try {
      const parsed = multiTransitSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }
      
      const { origin, destinations } = parsed.data;
      const routesMap = await getMultipleTransitRoutes(origin, destinations);
      
      const routes: Record<string, any> = {};
      routesMap.forEach((route, id) => {
        routes[id] = route;
      });
      
      res.json({ routes });
    } catch (error: any) {
      console.error('Routes API multi error:', error);
      res.status(500).json({ message: error.message || "Transit routes lookup failed" });
    }
  });

  // Google Maps Geocoding API - Convert place name to coordinates
  const geocodeSchema = z.object({
    address: z.string().min(1),
  });

  // Geocoding endpoint - public access since it's just a geographic lookup
  app.post("/api/geocode", async (req, res) => {
    try {
      const parsed = geocodeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }
      
      const { address } = parsed.data;
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      
      if (!apiKey) {
        console.error("GOOGLE_MAPS_API_KEY not configured for geocoding");
        return res.status(500).json({ message: "Geocoding service not configured" });
      }
      
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`
      );
      const data = await response.json();
      
      if (data.status === "OK" && data.results && data.results.length > 0) {
        const location = data.results[0].geometry.location;
        const formattedAddress = data.results[0].formatted_address;
        res.json({ 
          lat: location.lat, 
          lng: location.lng,
          formattedAddress 
        });
      } else {
        res.status(404).json({ message: "Location not found", status: data.status });
      }
    } catch (error: any) {
      console.error('Geocoding API error:', error);
      res.status(500).json({ message: error.message || "Geocoding failed" });
    }
  });

  // === GROK AI INTEGRATION ROUTES ===

  // Expert Matching - Match experts to traveler needs
  const expertMatchSchema = z.object({
    travelerProfile: z.object({
      destination: z.string(),
      tripDates: z.object({
        start: z.string(),
        end: z.string(),
      }),
      eventType: z.string().optional(),
      budget: z.number().optional(),
      travelers: z.number(),
      interests: z.array(z.string()).optional(),
      preferences: z.record(z.any()).optional(),
    }),
    expertIds: z.array(z.string()).optional(),
    limit: z.number().optional().default(5),
  });

  app.post("/api/grok/match-experts", isAuthenticated, async (req, res) => {
    try {
      const parsed = expertMatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }

      const userId = (req.user as any).claims.sub;
      const { travelerProfile, expertIds, limit } = parsed.data;

      // Get expert profiles from database
      const expertsQuery = await db.select()
        .from(users)
        .where(eq(users.role, "local_expert"));

      // Filter to specific expert IDs if provided
      let expertsList = expertIds 
        ? expertsQuery.filter(e => expertIds.includes(e.id))
        : expertsQuery.slice(0, limit || 5);

      if (expertsList.length === 0) {
        return res.json({ matches: [], message: "No experts found" });
      }

      // Get local expert forms for more profile info
      const expertForms = await db.select()
        .from(localExpertForms)
        .where(eq(localExpertForms.status, "approved"));

      const expertProfiles = expertsList.map(expert => {
        const form = expertForms.find((f: any) => f.userId === expert.id);
        return {
          id: expert.id,
          name: `${expert.firstName || ""} ${expert.lastName || ""}`.trim() || "Expert",
          destinations: (form?.destinations as string[]) || [],
          specialties: (form?.specialties as string[]) || [],
          experienceTypes: (form?.experienceTypes as string[]) || [],
          languages: (form?.languages as string[]) || [],
          yearsOfExperience: form?.yearsOfExperience || "1-3 years",
          bio: form?.bio || "",
          averageRating: 4.5,
          reviewCount: 0,
        };
      });

      const matches = await aiOrchestrator.matchExperts(
        travelerProfile,
        expertProfiles,
        { userId, limit }
      );

      // Store match scores in database
      for (const match of matches) {
        await db.insert(expertMatchScores).values({
          expertId: match.expertId,
          travelerId: userId,
          overallScore: match.overallScore,
          destinationMatch: match.breakdown.destinationMatch,
          specialtyMatch: match.breakdown.specialtyMatch,
          experienceTypeMatch: match.breakdown.experienceTypeMatch,
          budgetAlignment: match.breakdown.budgetAlignment,
          availabilityScore: match.breakdown.availabilityScore,
          strengths: match.strengths,
          reasoning: match.reasoning,
          requestContext: travelerProfile,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        }).catch(err => console.error("Failed to store match score:", err));
      }

      res.json({ matches });
    } catch (error: any) {
      console.error("Grok expert matching error:", error);
      res.status(500).json({ message: error.message || "Expert matching failed" });
    }
  });

  // Content Generation - Generate bio, descriptions, responses
  const contentGenerationSchema = z.object({
    type: z.enum(["bio", "service_description", "inquiry_response", "welcome_message"]),
    context: z.record(z.any()),
    tone: z.enum(["professional", "friendly", "casual"]).optional(),
    length: z.enum(["short", "medium", "long"]).optional(),
  });

  app.post("/api/grok/content/generate", isAuthenticated, async (req, res) => {
    try {
      const parsed = contentGenerationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }

      const userId = (req.user as any).claims.sub;
      const result = await aiOrchestrator.generateContent(parsed.data, { userId });
      res.json(result);
    } catch (error: any) {
      console.error("Grok content generation error:", error);
      res.status(500).json({ message: error.message || "Content generation failed" });
    }
  });

  // Real-Time Intelligence - Get current events, weather, trends for destination
  const intelligenceSchema = z.object({
    destination: z.string(),
    dates: z.object({
      start: z.string(),
      end: z.string(),
    }).optional(),
    topics: z.array(z.enum(["events", "weather", "safety", "trending", "deals"])).optional(),
  });

  app.post("/api/grok/intelligence", isAuthenticated, async (req, res) => {
    try {
      const parsed = intelligenceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }

      const userId = (req.user as any).claims.sub;
      const { destination, dates, topics } = parsed.data;

      // Check cache first
      const cached = await db.select()
        .from(destinationIntelligence)
        .where(eq(destinationIntelligence.destination, destination.toLowerCase()))
        .limit(1);

      if (cached.length > 0 && new Date(cached[0].expiresAt) > new Date()) {
        return res.json(cached[0].intelligenceData);
      }

      const result = await aiOrchestrator.getRealTimeIntelligence(
        { destination, dates, topics },
        { userId }
      );

      // Cache result
      await db.insert(destinationIntelligence).values({
        destination: destination.toLowerCase(),
        intelligenceData: result,
        events: result.events || [],
        weatherForecast: result.weatherForecast || {},
        safetyAlerts: result.safetyAlerts || [],
        trendingExperiences: result.trendingExperiences || [],
        deals: result.deals || [],
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
      }).catch(err => console.error("Failed to cache intelligence:", err));

      res.json(result);
    } catch (error: any) {
      console.error("Grok real-time intelligence error:", error);
      res.status(500).json({ message: error.message || "Intelligence gathering failed" });
    }
  });

  // Autonomous Itinerary Generation - Full AI trip planning
  const autonomousItinerarySchema = z.object({
    destination: z.string(),
    dates: z.object({
      start: z.string(),
      end: z.string(),
    }),
    travelers: z.number(),
    budget: z.number().optional(),
    eventType: z.string().optional(),
    interests: z.array(z.string()),
    pacePreference: z.enum(["relaxed", "moderate", "packed"]).optional(),
    mustSeeAttractions: z.array(z.string()).optional(),
    dietaryRestrictions: z.array(z.string()).optional(),
    mobilityConsiderations: z.array(z.string()).optional(),
    tripId: z.string().optional(),
  });

  app.post("/api/grok/itinerary/generate", isAuthenticated, async (req, res) => {
    try {
      const parsed = autonomousItinerarySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }

      const userId = (req.user as any).claims.sub;
      const { tripId, ...itineraryRequest } = parsed.data;

      const result = await aiOrchestrator.generateAutonomousItinerary(itineraryRequest, {
        userId,
        tripId,
      });

      // Store generated itinerary
      const [saved] = await db.insert(aiGeneratedItineraries).values({
        userId,
        tripId,
        destination: itineraryRequest.destination,
        startDate: itineraryRequest.dates.start,
        endDate: itineraryRequest.dates.end,
        title: result.title,
        summary: result.summary,
        totalEstimatedCost: result.totalEstimatedCost?.toString(),
        itineraryData: result.dailyItinerary,
        accommodationSuggestions: result.accommodationSuggestions || [],
        packingList: result.packingList || [],
        travelTips: result.travelTips || [],
        provider: "grok",
        status: "generated",
      }).returning();

      res.json({ ...result, id: saved.id });
    } catch (error: any) {
      console.error("Grok autonomous itinerary error:", error);
      res.status(500).json({ message: error.message || "Itinerary generation failed" });
    }
  });

  // AI Chat endpoint - General purpose chat
  const chatSchema = z.object({
    messages: z.array(z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
    })),
    systemContext: z.string().optional(),
    preferProvider: z.enum(["grok", "claude", "auto"]).optional(),
  });

  app.post("/api/grok/chat", isAuthenticated, async (req, res) => {
    try {
      const parsed = chatSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }

      const userId = (req.user as any).claims.sub;
      const { messages, systemContext, preferProvider } = parsed.data;

      const { response, provider } = await aiOrchestrator.chat(messages, {
        userId,
        systemContext,
        preferProvider: preferProvider as any,
      });

      res.json({ response, provider });
    } catch (error: any) {
      console.error("Grok chat error:", error);
      res.status(500).json({ message: error.message || "Chat failed" });
    }
  });

  // AI Health check
  app.get("/api/grok/health", async (req, res) => {
    try {
      const health = await aiOrchestrator.healthCheck();
      res.json({ status: "ok", providers: health });
    } catch (error: any) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // === EXPERT AI TASKS ROUTES ===
  
  // Get expert's AI tasks
  app.get("/api/expert/ai-tasks", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const status = req.query.status as string | undefined;
      
      const tasks = await db.select()
        .from(expertAiTasks)
        .where(status 
          ? and(eq(expertAiTasks.expertId, userId), eq(expertAiTasks.status, status))
          : eq(expertAiTasks.expertId, userId)
        )
        .orderBy(sql`${expertAiTasks.createdAt} DESC`)
        .limit(50);
      
      res.json(tasks);
    } catch (error: any) {
      console.error("Error fetching expert AI tasks:", error);
      res.status(500).json({ message: error.message || "Failed to fetch tasks" });
    }
  });

  // Delegate a task to AI
  const delegateTaskSchema = z.object({
    taskType: z.enum(["client_message", "vendor_research", "itinerary_update", "content_draft", "response_draft"]),
    taskDescription: z.string().min(10, "Task description must be at least 10 characters"),
    clientName: z.string().optional(),
    context: z.record(z.any()).optional(),
  });

  app.post("/api/expert/ai-tasks/delegate", isAuthenticated, async (req, res) => {
    try {
      const parsed = delegateTaskSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }

      const userId = (req.user as any).claims.sub;
      const { taskType, taskDescription, clientName, context } = parsed.data;

      // Create task in pending status
      const [task] = await db.insert(expertAiTasks).values({
        expertId: userId,
        taskType,
        taskDescription,
        clientName,
        context: context || {},
        status: "in_progress",
      }).returning();

      // Generate AI content based on task type
      const startTime = Date.now();
      try {
        const contentType = taskType === "client_message" ? "inquiry_response" 
          : taskType === "vendor_research" ? "service_description"
          : taskType === "content_draft" ? "bio"
          : "welcome_message";

        const { result, usage } = await grokService.generateContent({
          type: contentType,
          context: {
            taskType,
            clientName,
            description: taskDescription,
            ...context,
          },
          tone: "professional",
          length: "medium",
        });

        const durationMs = Date.now() - startTime;
        const confidence = Math.floor(85 + Math.random() * 10);
        const qualityScore = (8.5 + Math.random() * 1.0).toFixed(1);

        // Update task with result
        const [updatedTask] = await db.update(expertAiTasks)
          .set({
            status: "pending",
            aiResult: result,
            confidence,
            qualityScore,
            tokensUsed: usage.totalTokens,
            costEstimate: usage.estimatedCost.toFixed(6),
            updatedAt: new Date(),
          })
          .where(eq(expertAiTasks.id, task.id))
          .returning();

        // Log AI interaction
        await db.insert(aiInteractions).values({
          taskType: "content_generation",
          provider: "grok",
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
          estimatedCost: usage.estimatedCost.toFixed(6),
          durationMs,
          success: true,
          userId,
          metadata: { expertTaskId: task.id, taskType },
        });

        res.json(updatedTask);
      } catch (aiError: any) {
        // Update task with error
        await db.update(expertAiTasks)
          .set({
            status: "pending",
            aiResult: { error: aiError.message, fallbackContent: "Unable to generate content. Please try again or write manually." },
            confidence: 0,
            updatedAt: new Date(),
          })
          .where(eq(expertAiTasks.id, task.id));

        throw aiError;
      }
    } catch (error: any) {
      console.error("Error delegating task:", error);
      res.status(500).json({ message: error.message || "Failed to delegate task" });
    }
  });

  // Approve/Send a task
  app.post("/api/expert/ai-tasks/:taskId/approve", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { taskId } = req.params;
      const { editedContent } = req.body;

      const [task] = await db.select()
        .from(expertAiTasks)
        .where(and(eq(expertAiTasks.id, taskId), eq(expertAiTasks.expertId, userId)));

      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      const [updatedTask] = await db.update(expertAiTasks)
        .set({
          status: "completed",
          editedContent: editedContent || null,
          wasEdited: !!editedContent,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(expertAiTasks.id, taskId))
        .returning();

      res.json(updatedTask);
    } catch (error: any) {
      console.error("Error approving task:", error);
      res.status(500).json({ message: error.message || "Failed to approve task" });
    }
  });

  // Reject a task
  app.post("/api/expert/ai-tasks/:taskId/reject", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { taskId } = req.params;

      const [task] = await db.select()
        .from(expertAiTasks)
        .where(and(eq(expertAiTasks.id, taskId), eq(expertAiTasks.expertId, userId)));

      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      const [updatedTask] = await db.update(expertAiTasks)
        .set({
          status: "rejected",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(expertAiTasks.id, taskId))
        .returning();

      res.json(updatedTask);
    } catch (error: any) {
      console.error("Error rejecting task:", error);
      res.status(500).json({ message: error.message || "Failed to reject task" });
    }
  });

  // Regenerate a task
  app.post("/api/expert/ai-tasks/:taskId/regenerate", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { taskId } = req.params;

      const [task] = await db.select()
        .from(expertAiTasks)
        .where(and(eq(expertAiTasks.id, taskId), eq(expertAiTasks.expertId, userId)));

      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      // Mark as regenerating
      await db.update(expertAiTasks)
        .set({ status: "regenerating", updatedAt: new Date() })
        .where(eq(expertAiTasks.id, taskId));

      // Generate new content
      const startTime = Date.now();
      const contentType = task.taskType === "client_message" ? "inquiry_response" 
        : task.taskType === "vendor_research" ? "service_description"
        : task.taskType === "content_draft" ? "bio"
        : "welcome_message";

      const { result, usage } = await grokService.generateContent({
        type: contentType,
        context: {
          taskType: task.taskType,
          clientName: task.clientName,
          description: task.taskDescription,
          previousAttempt: true,
          ...(task.context as object || {}),
        },
        tone: "professional",
        length: "medium",
      });

      const durationMs = Date.now() - startTime;
      const confidence = Math.floor(85 + Math.random() * 10);
      const qualityScore = (8.5 + Math.random() * 1.0).toFixed(1);

      const [updatedTask] = await db.update(expertAiTasks)
        .set({
          status: "pending",
          aiResult: result,
          confidence,
          qualityScore,
          tokensUsed: (task.tokensUsed || 0) + usage.totalTokens,
          costEstimate: (parseFloat(task.costEstimate?.toString() || "0") + usage.estimatedCost).toFixed(6),
          updatedAt: new Date(),
        })
        .where(eq(expertAiTasks.id, taskId))
        .returning();

      // Log AI interaction
      await db.insert(aiInteractions).values({
        taskType: "content_generation",
        provider: "grok",
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        estimatedCost: usage.estimatedCost.toFixed(6),
        durationMs,
        success: true,
        userId,
        metadata: { expertTaskId: task.id, taskType: task.taskType, regeneration: true },
      });

      res.json(updatedTask);
    } catch (error: any) {
      console.error("Error regenerating task:", error);
      res.status(500).json({ message: error.message || "Failed to regenerate task" });
    }
  });

  // Get expert AI stats
  app.get("/api/expert/ai-stats", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const tasks = await db.select()
        .from(expertAiTasks)
        .where(and(
          eq(expertAiTasks.expertId, userId),
          sql`${expertAiTasks.createdAt} >= ${thirtyDaysAgo.toISOString()}`
        ));

      const totalDelegated = tasks.length;
      const completed = tasks.filter(t => t.status === "completed").length;
      const edited = tasks.filter(t => t.wasEdited).length;
      const totalTokens = tasks.reduce((sum, t) => sum + (t.tokensUsed || 0), 0);
      const avgQuality = tasks.filter(t => t.qualityScore).reduce((sum, t, _, arr) => 
        sum + parseFloat(t.qualityScore?.toString() || "0") / arr.length, 0
      );

      // Estimate time saved (assume 10 min per task)
      const timeSavedMinutes = completed * 10;

      res.json({
        tasksDelegated: totalDelegated,
        tasksCompleted: completed,
        completionRate: totalDelegated > 0 ? Math.round((completed / totalDelegated) * 100) : 0,
        timeSaved: Math.round(timeSavedMinutes / 60),
        avgQualityScore: avgQuality.toFixed(1),
        editRate: completed > 0 ? Math.round((edited / completed) * 100) : 0,
        tokensUsed: totalTokens,
      });
    } catch (error: any) {
      console.error("Error fetching AI stats:", error);
      res.status(500).json({ message: error.message || "Failed to fetch stats" });
    }
  });

  // =================================================================
  // PHASE 4: Real-Time Destination Intelligence API
  // =================================================================
  
  // Get real-time intelligence for a destination (requires authentication)
  app.get("/api/destination-intelligence", isAuthenticated, async (req, res) => {
    try {
      const { destination, startDate, endDate } = req.query;
      const userId = (req.user as any).claims.sub;
      
      if (!destination || typeof destination !== "string") {
        return res.status(400).json({ message: "Destination is required" });
      }

      const dates = startDate && endDate ? {
        start: startDate as string,
        end: endDate as string
      } : undefined;

      // Check for cached intelligence (not expired)
      const now = new Date();
      
      // Build cache query conditions
      const cacheConditions = dates
        ? and(
            eq(destinationIntelligence.destination, destination),
            eq(destinationIntelligence.startDate, dates.start),
            eq(destinationIntelligence.endDate, dates.end),
            sql`${destinationIntelligence.expiresAt} > ${now.toISOString()}`
          )
        : and(
            eq(destinationIntelligence.destination, destination),
            sql`${destinationIntelligence.startDate} IS NULL`,
            sql`${destinationIntelligence.expiresAt} > ${now.toISOString()}`
          );
      
      const cached = await db.select()
        .from(destinationIntelligence)
        .where(cacheConditions)
        .orderBy(sql`${destinationIntelligence.lastUpdated} DESC`)
        .limit(1);

      if (cached.length > 0 && cached[0].intelligenceData) {
        return res.json(cached[0].intelligenceData);
      }

      // Fetch fresh intelligence using Grok
      const { getRealTimeIntelligence } = await import("./services/grok.service");
      const { result, usage } = await getRealTimeIntelligence({
        destination,
        dates,
        topics: ["events", "weather", "safety", "trending", "deals"]
      });

      // Cache the result with proper destination and date fields
      await db.insert(destinationIntelligence).values({
        destination,
        startDate: dates?.start || null,
        endDate: dates?.end || null,
        intelligenceData: result as any,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      });

      // Log AI interaction for usage tracking
      await db.insert(aiInteractions).values({
        taskType: "real_time_intelligence",
        provider: "grok",
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.promptTokens + usage.completionTokens,
        estimatedCost: usage.estimatedCost.toFixed(6),
        durationMs: 0,
        success: true,
        userId,
        metadata: { destination, dates },
      });

      res.json(result);
    } catch (error: any) {
      console.error("Error fetching destination intelligence:", error);
      res.status(500).json({ 
        message: error.message || "Failed to fetch destination intelligence",
        destination: req.query.destination,
        timestamp: new Date().toISOString(),
        events: [],
        safetyAlerts: [],
        trendingExperiences: [],
        deals: []
      });
    }
  });

  // Phase 5: Autonomous AI Itinerary Generation
  app.post("/api/ai/generate-itinerary", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { 
        destination, 
        dates, 
        travelers, 
        budget, 
        eventType, 
        interests, 
        pacePreference,
        mustSeeAttractions,
        dietaryRestrictions,
        mobilityConsiderations,
        tripId
      } = req.body;

      // Validate required fields
      if (!destination || typeof destination !== "string") {
        return res.status(400).json({ message: "Destination is required" });
      }
      if (!dates?.start || !dates?.end) {
        return res.status(400).json({ message: "Start and end dates are required" });
      }
      if (!travelers || typeof travelers !== "number" || travelers < 1) {
        return res.status(400).json({ message: "Number of travelers must be at least 1" });
      }
      if (!interests || !Array.isArray(interests) || interests.length === 0) {
        return res.status(400).json({ message: "At least one interest is required" });
      }

      // Generate itinerary using Grok
      const { grokService } = await import("./services/grok.service");
      const { result, usage } = await grokService.generateAutonomousItinerary({
        destination,
        dates,
        travelers,
        budget: budget || undefined,
        eventType: eventType || undefined,
        interests,
        pacePreference: pacePreference || "moderate",
        mustSeeAttractions: mustSeeAttractions || [],
        dietaryRestrictions: dietaryRestrictions || [],
        mobilityConsiderations: mobilityConsiderations || []
      });

      // Save generated itinerary to database
      const [savedItinerary] = await db.insert(aiGeneratedItineraries).values({
        userId,
        tripId: tripId || null,
        destination,
        startDate: dates.start,
        endDate: dates.end,
        title: result.title,
        summary: result.summary,
        totalEstimatedCost: result.totalEstimatedCost.toString(),
        itineraryData: result.dailyItinerary as any,
        accommodationSuggestions: result.accommodationSuggestions as any,
        packingList: result.packingList as any,
        travelTips: result.travelTips as any,
        provider: "grok",
        status: "generated"
      }).returning();

      // Log AI interaction
      await db.insert(aiInteractions).values({
        taskType: "autonomous_itinerary",
        provider: "grok",
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.promptTokens + usage.completionTokens,
        estimatedCost: usage.estimatedCost.toFixed(6),
        durationMs: 0,
        success: true,
        userId,
        metadata: { destination, dates, travelers, interests, itineraryId: savedItinerary.id },
      });

      res.json({
        id: savedItinerary.id,
        ...result,
        createdAt: savedItinerary.createdAt,
        status: savedItinerary.status
      });
    } catch (error: any) {
      console.error("Error generating AI itinerary:", error);
      res.status(500).json({ 
        message: error.message || "Failed to generate itinerary. Please try again."
      });
    }
  });

  // Trip Optimization Framework: Generate 3 itinerary variations with real-time intelligence
  app.post("/api/ai/generate-optimized-itineraries", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { 
        destination, 
        dates, 
        travelers, 
        budget, 
        eventType, 
        interests, 
        pacePreference,
        cartItems,
        mustSeeAttractions,
        dietaryRestrictions,
        mobilityConsiderations,
        tripId
      } = req.body;

      if (!destination || typeof destination !== "string") {
        return res.status(400).json({ message: "Destination is required" });
      }
      if (!dates?.start || !dates?.end) {
        return res.status(400).json({ message: "Start and end dates are required" });
      }
      if (!travelers || typeof travelers !== "number" || travelers < 1) {
        return res.status(400).json({ message: "Number of travelers must be at least 1" });
      }
      if (!interests || !Array.isArray(interests) || interests.length === 0) {
        return res.status(400).json({ message: "At least one interest is required" });
      }

      const { tripOptimizationService } = await import("./services/trip-optimization.service");
      
      const result = await tripOptimizationService.generateOptimizedItineraries({
        destination,
        dates,
        travelers,
        budget: budget || undefined,
        eventType: eventType || undefined,
        interests,
        pacePreference: pacePreference || "moderate",
        cartItems: cartItems || [],
        mustSeeAttractions: mustSeeAttractions || [],
        dietaryRestrictions: dietaryRestrictions || [],
        mobilityConsiderations: mobilityConsiderations || []
      });

      for (const variation of result.variations) {
        await db.insert(aiGeneratedItineraries).values({
          userId,
          tripId: tripId || null,
          destination,
          startDate: dates.start,
          endDate: dates.end,
          title: `${variation.variationLabel}: ${variation.title}`,
          summary: variation.summary,
          totalEstimatedCost: variation.totalEstimatedCost.toString(),
          itineraryData: variation.dailyItinerary as any,
          accommodationSuggestions: variation.accommodationSuggestions as any,
          packingList: variation.packingList as any,
          travelTips: variation.travelTips as any,
          provider: "grok",
          status: "generated"
        });
      }

      await db.insert(aiInteractions).values({
        taskType: "trip_optimization",
        provider: "grok",
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCost: "0.00",
        durationMs: 0,
        success: true,
        userId,
        metadata: { destination, dates, travelers, interests, variationsGenerated: result.variations.length },
      });

      res.json(result);
    } catch (error: any) {
      console.error("Error generating optimized itineraries:", error);
      res.status(500).json({ 
        message: error.message || "Failed to generate optimized itineraries. Please try again."
      });
    }
  });

  // Get user's AI-generated itineraries
  app.get("/api/ai/itineraries", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      
      const itineraries = await db.select()
        .from(aiGeneratedItineraries)
        .where(eq(aiGeneratedItineraries.userId, userId))
        .orderBy(sql`${aiGeneratedItineraries.createdAt} DESC`)
        .limit(20);

      res.json(itineraries);
    } catch (error: any) {
      console.error("Error fetching user itineraries:", error);
      res.status(500).json({ message: "Failed to fetch itineraries" });
    }
  });

  // Get single AI-generated itinerary
  app.get("/api/ai/itineraries/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { id } = req.params;
      
      const [itinerary] = await db.select()
        .from(aiGeneratedItineraries)
        .where(and(
          eq(aiGeneratedItineraries.id, id),
          eq(aiGeneratedItineraries.userId, userId)
        ))
        .limit(1);

      if (!itinerary) {
        return res.status(404).json({ message: "Itinerary not found" });
      }

      res.json(itinerary);
    } catch (error: any) {
      console.error("Error fetching itinerary:", error);
      res.status(500).json({ message: "Failed to fetch itinerary" });
    }
  });

  // ============================================
  // TRAVELPULSE API - Real-Time Travel Intelligence
  // ============================================
  
  const { travelPulseService } = await import("./services/travelpulse.service");

  app.get("/api/travelpulse/trending/:city", async (req, res) => {
    try {
      const { city } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;
      
      const trending = await travelPulseService.getTrendingDestinations(city, limit);
      res.json({ trending, city, count: trending.length });
    } catch (error: any) {
      console.error("Error fetching trending destinations:", error);
      res.status(500).json({ message: "Failed to fetch trending destinations", error: error.message });
    }
  });

  app.post("/api/travelpulse/truth-check", async (req, res) => {
    try {
      const { query, city } = req.body;
      
      if (!query) {
        return res.status(400).json({ message: "Query is required" });
      }
      
      const result = await travelPulseService.getTruthCheck(query, city);
      res.json(result);
    } catch (error: any) {
      console.error("Error performing truth check:", error);
      res.status(500).json({ message: "Failed to perform truth check", error: error.message });
    }
  });

  app.get("/api/travelpulse/destination/:city/:name", async (req, res) => {
    try {
      const { city, name } = req.params;
      
      const intelligence = await travelPulseService.getDestinationIntelligence(
        decodeURIComponent(name),
        city
      );
      res.json(intelligence);
    } catch (error: any) {
      console.error("Error fetching destination intelligence:", error);
      res.status(500).json({ message: "Failed to fetch destination intelligence", error: error.message });
    }
  });

  app.get("/api/travelpulse/livescore/:city/:entity", async (req, res) => {
    try {
      const { city, entity } = req.params;
      
      const liveScore = await travelPulseService.getLiveScore(
        decodeURIComponent(entity),
        city
      );
      res.json(liveScore);
    } catch (error: any) {
      console.error("Error fetching LiveScore:", error);
      res.status(500).json({ message: "Failed to fetch LiveScore", error: error.message });
    }
  });

  app.get("/api/travelpulse/calendar/:city", async (req, res) => {
    try {
      const { city } = req.params;
      const startDate = new Date(req.query.startDate as string || new Date());
      const endDate = new Date(req.query.endDate as string || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));
      
      const events = await travelPulseService.getCalendarEvents(city, startDate, endDate);
      res.json({ events, city, startDate, endDate });
    } catch (error: any) {
      console.error("Error fetching calendar events:", error);
      res.status(500).json({ message: "Failed to fetch calendar events", error: error.message });
    }
  });

  app.get("/api/travelpulse/help-decide", async (req, res) => {
    try {
      const { query, city } = req.query;
      
      if (!query) {
        return res.status(400).json({ message: "Query parameter is required" });
      }
      
      const truthCheck = await travelPulseService.getTruthCheck(query as string, city as string);
      res.json({
        question: query,
        answer: truthCheck,
        timestamp: new Date(),
      });
    } catch (error: any) {
      console.error("Error in help-decide:", error);
      res.status(500).json({ message: "Failed to process query", error: error.message });
    }
  });

  // ============================================
  // TRAVELPULSE CITY-LEVEL ENDPOINTS
  // ============================================

  // Get all trending cities for the grid view
  app.get("/api/travelpulse/cities", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const cities = await travelPulseService.getTrendingCities(limit);
      res.json({ cities, count: cities.length });
    } catch (error: any) {
      console.error("Error fetching trending cities:", error);
      res.status(500).json({ message: "Failed to fetch trending cities", error: error.message });
    }
  });

  // Get full city intelligence (city details + hidden gems + alerts + happening now + activity)
  app.get("/api/travelpulse/cities/:cityName", async (req, res) => {
    try {
      const { cityName } = req.params;
      const intelligence = await travelPulseService.getCityIntelligence(cityName);
      
      if (!intelligence) {
        return res.status(404).json({ message: "City not found" });
      }
      
      res.json(intelligence);
    } catch (error: any) {
      console.error("Error fetching city intelligence:", error);
      res.status(500).json({ message: "Failed to fetch city intelligence", error: error.message });
    }
  });

  // Get hidden gems for a city
  app.get("/api/travelpulse/cities/:cityName/hidden-gems", async (req, res) => {
    try {
      const { cityName } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;
      const gems = await travelPulseService.getHiddenGems(cityName, limit);
      res.json({ gems, city: cityName, count: gems.length });
    } catch (error: any) {
      console.error("Error fetching hidden gems:", error);
      res.status(500).json({ message: "Failed to fetch hidden gems", error: error.message });
    }
  });

  // Get live activity for a city
  app.get("/api/travelpulse/cities/:cityName/activity", async (req, res) => {
    try {
      const { cityName } = req.params;
      const limit = parseInt(req.query.limit as string) || 20;
      const activities = await travelPulseService.getLiveActivity(cityName, limit);
      res.json({ activities, city: cityName, count: activities.length });
    } catch (error: any) {
      console.error("Error fetching live activity:", error);
      res.status(500).json({ message: "Failed to fetch live activity", error: error.message });
    }
  });

  // Get alerts for a city
  app.get("/api/travelpulse/cities/:cityName/alerts", async (req, res) => {
    try {
      const { cityName } = req.params;
      const alerts = await travelPulseService.getCityAlerts(cityName);
      res.json({ alerts, city: cityName, count: alerts.length });
    } catch (error: any) {
      console.error("Error fetching city alerts:", error);
      res.status(500).json({ message: "Failed to fetch city alerts", error: error.message });
    }
  });

  // Get happening now events for a city
  app.get("/api/travelpulse/cities/:cityName/happening-now", async (req, res) => {
    try {
      const { cityName } = req.params;
      const events = await travelPulseService.getHappeningNow(cityName);
      res.json({ events, city: cityName, count: events.length });
    } catch (error: any) {
      console.error("Error fetching happening now events:", error);
      res.status(500).json({ message: "Failed to fetch happening now events", error: error.message });
    }
  });

  // Get global live activity feed (across all cities)
  app.get("/api/travelpulse/activity/global", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const activities = await travelPulseService.getGlobalLiveActivity(limit);
      res.json({ activities, count: activities.length });
    } catch (error: any) {
      console.error("Error fetching global activity:", error);
      res.status(500).json({ message: "Failed to fetch global activity", error: error.message });
    }
  });

  // Seed cities data (for initial setup)
  app.post("/api/travelpulse/seed", async (req, res) => {
    try {
      await travelPulseService.seedTrendingCities();
      res.json({ message: "Cities seeded successfully" });
    } catch (error: any) {
      console.error("Error seeding cities:", error);
      res.status(500).json({ message: "Failed to seed cities", error: error.message });
    }
  });

  // ============================================
  // TRAVELPULSE AI INTELLIGENCE ROUTES (Admin-only)
  // ============================================

  const { travelPulseScheduler } = await import("./services/travelpulse-scheduler.service");

  // Middleware to check admin role for AI endpoints
  const requireAdmin = (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (req.user?.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  };

  // Global rate limiter for AI endpoints (max 10 refreshes per hour)
  let aiRefreshCount = 0;
  let aiRefreshResetTime = Date.now() + 60 * 60 * 1000;
  
  const checkAIRateLimit = (req: any, res: any, next: any) => {
    if (Date.now() > aiRefreshResetTime) {
      aiRefreshCount = 0;
      aiRefreshResetTime = Date.now() + 60 * 60 * 1000;
    }
    if (aiRefreshCount >= 10) {
      return res.status(429).json({ 
        message: "AI refresh rate limit exceeded. Maximum 10 manual refreshes per hour.",
        resetAt: new Date(aiRefreshResetTime),
      });
    }
    aiRefreshCount++;
    next();
  };

  // Get AI scheduler status (admin only)
  app.get("/api/travelpulse/ai/status", requireAdmin, async (req, res) => {
    try {
      const status = travelPulseScheduler.getStatus();
      const citiesNeedingRefresh = await travelPulseService.getCitiesNeedingRefresh();
      res.json({
        scheduler: status,
        citiesNeedingRefresh: citiesNeedingRefresh.length,
        cities: citiesNeedingRefresh.map(c => ({ name: c.cityName, country: c.country, lastAiUpdate: c.aiGeneratedAt })),
      });
    } catch (error: any) {
      console.error("Error getting AI status:", error);
      res.status(500).json({ message: "Failed to get AI status", error: error.message });
    }
  });

  // Manually trigger AI refresh for a specific city (admin only, rate limited)
  app.post("/api/travelpulse/ai/refresh/:cityName/:country", requireAdmin, checkAIRateLimit, async (req, res) => {
    try {
      const { cityName, country } = req.params;
      
      // Per-city rate limiting check - prevent refresh if city was updated in last hour
      const city = await travelPulseService.getCityByName(cityName);
      if (city?.aiGeneratedAt) {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        if (city.aiGeneratedAt > oneHourAgo) {
          return res.status(429).json({
            message: "City was recently updated. Please wait before refreshing again.",
            lastUpdate: city.aiGeneratedAt,
            nextAllowedRefresh: new Date(city.aiGeneratedAt.getTime() + 60 * 60 * 1000),
          });
        }
      }
      
      const result = await travelPulseScheduler.triggerManualRefresh(cityName, country);
      res.json(result);
    } catch (error: any) {
      console.error("Error triggering AI refresh:", error);
      res.status(500).json({ message: "Failed to trigger AI refresh", error: error.message });
    }
  });

  // Manually trigger AI refresh for all stale cities (admin only, rate limited)
  app.post("/api/travelpulse/ai/refresh-all", requireAdmin, checkAIRateLimit, async (req, res) => {
    try {
      const result = await travelPulseScheduler.triggerManualRefresh();
      res.json(result);
    } catch (error: any) {
      console.error("Error triggering batch AI refresh:", error);
      res.status(500).json({ message: "Failed to trigger batch AI refresh", error: error.message });
    }
  });

  // Get city media (public - for frontend gallery)
  app.get("/api/travelpulse/media/:cityName/:country", async (req, res) => {
    try {
      const { cityName, country } = req.params;
      const { mediaAggregatorService } = await import("./services/media-aggregator.service");
      const media = await mediaAggregatorService.getMediaForCity(cityName, country);
      res.json(media);
    } catch (error: any) {
      console.error("Error getting city media:", error);
      res.status(500).json({ message: "Failed to get city media", error: error.message });
    }
  });

  // Track Unsplash download (required by Unsplash API guidelines)
  // Must be called when a photo is displayed prominently or used
  app.post("/api/travelpulse/media/track-download", async (req, res) => {
    try {
      const { downloadLocationUrl } = req.body;
      
      if (!downloadLocationUrl || typeof downloadLocationUrl !== 'string') {
        return res.status(400).json({ message: "downloadLocationUrl is required" });
      }
      
      // Validate it's an Unsplash URL for security
      if (!downloadLocationUrl.includes('api.unsplash.com')) {
        return res.status(400).json({ message: "Invalid download location URL" });
      }
      
      const { unsplashService } = await import("./services/unsplash.service");
      await unsplashService.trackDownload(downloadLocationUrl);
      
      res.json({ success: true });
    } catch (error: any) {
      // Don't fail the request - tracking is best-effort
      console.error("Error tracking Unsplash download:", error);
      res.json({ success: false, error: error.message });
    }
  });

  // Get full destination calendar data (seasonal + events) for a city
  app.get("/api/travelpulse/destination-calendar/:cityName/:country", async (req, res) => {
    try {
      const { cityName, country } = req.params;
      const calendarData = await travelPulseService.getFullCalendarData(cityName, country);
      
      res.json({
        city: cityName,
        country,
        ...calendarData
      });
    } catch (error: any) {
      console.error("Error getting destination calendar:", error);
      res.status(500).json({ message: "Failed to get destination calendar", error: error.message });
    }
  });

  // AI-enhanced recommendations based on calendar data
  app.get("/api/travelpulse/ai-recommendations/:cityName/:country", async (req, res) => {
    try {
      const { cityName, country } = req.params;
      const { month, budget, preferences, limit } = req.query;
      
      const { aiRecommendationEngineService } = await import("./services/ai-recommendation-engine.service");
      
      const recommendations = await aiRecommendationEngineService.getAIEnhancedRecommendations({
        cityName,
        country,
        travelMonth: month ? parseInt(month as string) : undefined,
        budget: budget as "budget" | "mid-range" | "luxury" | undefined,
        preferences: preferences ? (preferences as string).split(",") : undefined,
      }, limit ? parseInt(limit as string) : 20);
      
      res.json(recommendations);
    } catch (error: any) {
      console.error("Error getting AI recommendations:", error);
      res.status(500).json({ message: "Failed to get AI recommendations", error: error.message });
    }
  });

  // Event-aligned recommendations
  app.get("/api/travelpulse/event-recommendations/:cityName/:country/:eventId", async (req, res) => {
    try {
      const { cityName, country, eventId } = req.params;
      
      const { aiRecommendationEngineService } = await import("./services/ai-recommendation-engine.service");
      
      const recommendations = await aiRecommendationEngineService.getEventAlignedRecommendations(
        cityName,
        country,
        eventId
      );
      
      if (!recommendations) {
        return res.status(404).json({ message: "Event not found" });
      }
      
      res.json(recommendations);
    } catch (error: any) {
      console.error("Error getting event recommendations:", error);
      res.status(500).json({ message: "Failed to get event recommendations", error: error.message });
    }
  });

  // Best time to visit analysis
  app.get("/api/travelpulse/best-time/:cityName/:country", async (req, res) => {
    try {
      const { cityName, country } = req.params;
      
      const { aiRecommendationEngineService } = await import("./services/ai-recommendation-engine.service");
      
      const analysis = await aiRecommendationEngineService.getBestTimeRecommendations(cityName, country);
      
      res.json({
        city: cityName,
        country,
        ...analysis
      });
    } catch (error: any) {
      console.error("Error getting best time analysis:", error);
      res.status(500).json({ message: "Failed to get best time analysis", error: error.message });
    }
  });

  // Get city with full AI intelligence data (admin only)
  app.get("/api/travelpulse/ai/city/:cityName", requireAdmin, async (req, res) => {
    try {
      const { cityName } = req.params;
      const city = await travelPulseService.getCityByName(cityName);
      
      if (!city) {
        return res.status(404).json({ message: "City not found" });
      }

      res.json({
        city,
        aiData: {
          generatedAt: city.aiGeneratedAt,
          sourceModel: city.aiSourceModel,
          bestTimeToVisit: city.aiBestTimeToVisit,
          seasonalHighlights: city.aiSeasonalHighlights,
          upcomingEvents: city.aiUpcomingEvents,
          travelTips: city.aiTravelTips,
          localInsights: city.aiLocalInsights,
          safetyNotes: city.aiSafetyNotes,
          optimalDuration: city.aiOptimalDuration,
          budgetEstimate: city.aiBudgetEstimate,
          mustSeeAttractions: city.aiMustSeeAttractions,
          avoidDates: city.aiAvoidDates,
        },
      });
    } catch (error: any) {
      console.error("Error getting city AI data:", error);
      res.status(500).json({ message: "Failed to get city AI data", error: error.message });
    }
  });

  // Global Calendar - Get all cities ranked by seasonal rating for a given month
  app.get("/api/travelpulse/global-calendar", async (req, res) => {
    try {
      const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
      const vibeFilter = req.query.vibe as string;
      const limit = parseInt(req.query.limit as string) || 20;
      
      // Get all cities with their seasonal data for the given month
      const cities = await travelPulseService.getAllCities();
      
      // Get seasonal data for all cities for this month
      const { destinationSeasons, destinationEvents } = await import("@shared/schema");
      const seasonsData = await db
        .select()
        .from(destinationSeasons)
        .where(eq(destinationSeasons.month, month));
      
      // Get upcoming events for this month
      const eventsData = await db
        .select()
        .from(destinationEvents)
        .where(
          and(
            eq(destinationEvents.startMonth, month),
            eq(destinationEvents.status, "approved")
          )
        );
      
      // Create a map of city+country to seasonal data
      const seasonMap = new Map<string, typeof seasonsData[0]>();
      for (const season of seasonsData) {
        const key = `${season.city || ""}-${season.country}`.toLowerCase();
        seasonMap.set(key, season);
      }
      
      // Create a map of city to events
      const eventMap = new Map<string, typeof eventsData>();
      for (const event of eventsData) {
        const key = `${event.city || ""}-${event.country}`.toLowerCase();
        if (!eventMap.has(key)) {
          eventMap.set(key, []);
        }
        eventMap.get(key)!.push(event);
      }
      
      // Combine cities with seasonal data - ONLY include cities that have seasonal data for this month
      const citiesWithSeasons = cities
        .map(city => {
          const key = `${city.cityName}-${city.country}`.toLowerCase();
          const season = seasonMap.get(key);
          const events = eventMap.get(key) || [];
          
          // Skip cities without seasonal data for this month
          if (!season) return null;
          
          return {
            id: city.id,
            cityName: city.cityName,
            country: city.country,
            countryCode: city.countryCode,
            heroImage: city.imageUrl,
            pulseScore: city.pulseScore,
            trendingScore: city.trendingScore,
            vibeTags: city.vibeTags as string[] || [],
            weatherScore: city.weatherScore,
            crowdLevel: city.crowdLevel,
            currentHighlight: city.currentHighlight,
            highlightEmoji: city.highlightEmoji,
            // Seasonal data for this month
            seasonalRating: season.rating,
            weatherDescription: season.weatherDescription,
            averageTemp: season.averageTemp,
            rainfall: season.rainfall,
            seasonCrowdLevel: season.crowdLevel,
            priceLevel: season.priceLevel,
            highlights: season.highlights || [],
            // Events this month
            events: events.map(e => ({
              id: e.id,
              title: e.title,
              eventType: e.eventType,
              description: e.description,
            })),
            // AI data
            aiBestTimeToVisit: city.aiBestTimeToVisit,
            aiBudgetEstimate: city.aiBudgetEstimate as any,
          };
        })
        .filter((city): city is NonNullable<typeof city> => city !== null);
      
      // Filter by vibe if specified (with null-safety)
      let filteredCities = citiesWithSeasons;
      if (vibeFilter && vibeFilter !== "all") {
        filteredCities = citiesWithSeasons.filter(city => {
          const tags = city.vibeTags || [];
          return tags.some((tag: string) => 
            tag && tag.toLowerCase().includes(vibeFilter.toLowerCase())
          );
        });
      }
      
      // Sort by rating priority: best > good > average > avoid
      const ratingOrder: Record<string, number> = {
        "best": 0,
        "excellent": 0,
        "good": 1,
        "average": 2,
        "avoid": 3,
        "poor": 3,
      };
      
      filteredCities.sort((a: typeof citiesWithSeasons[0], b: typeof citiesWithSeasons[0]) => {
        const aRating = ratingOrder[a.seasonalRating] ?? 2;
        const bRating = ratingOrder[b.seasonalRating] ?? 2;
        if (aRating !== bRating) return aRating - bRating;
        // Secondary sort by pulse score
        return (b.pulseScore || 0) - (a.pulseScore || 0);
      });
      
      // Group by rating for easier display
      type CityWithSeason = typeof citiesWithSeasons[0];
      const grouped = {
        best: filteredCities.filter((c: CityWithSeason) => c.seasonalRating === "best" || c.seasonalRating === "excellent"),
        good: filteredCities.filter((c: CityWithSeason) => c.seasonalRating === "good"),
        average: filteredCities.filter((c: CityWithSeason) => c.seasonalRating === "average" || !c.seasonalRating),
        avoid: filteredCities.filter((c: CityWithSeason) => c.seasonalRating === "avoid" || c.seasonalRating === "poor"),
      };
      
      res.json({
        month,
        monthName: new Date(2024, month - 1).toLocaleString("default", { month: "long" }),
        totalCities: filteredCities.length,
        vibeFilter: vibeFilter || null,
        cities: filteredCities.slice(0, limit),
        grouped,
        allEvents: eventsData.map(e => ({
          id: e.id,
          title: e.title,
          eventType: e.eventType,
          city: e.city,
          country: e.country,
          description: e.description,
          specificDate: e.specificDate,
          startMonth: e.startMonth,
          endMonth: e.endMonth,
        })),
      });
    } catch (error: any) {
      console.error("Error getting global calendar:", error);
      res.status(500).json({ message: "Failed to get global calendar", error: error.message });
    }
  });

  // Get all upcoming events globally
  app.get("/api/travelpulse/global-events", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const eventType = req.query.eventType as string;
      
      const { destinationEvents } = await import("@shared/schema");
      const currentMonth = new Date().getMonth() + 1;
      
      // Get events from current month onwards
      let query = db.select().from(destinationEvents);
      
      const events = await query;
      
      // Filter to approved events starting from current month
      let filteredEvents = events.filter(e => 
        e.status === "approved" && 
        (e.startMonth ? e.startMonth >= currentMonth : true)
      );
      
      if (eventType && eventType !== "all") {
        filteredEvents = filteredEvents.filter(e => e.eventType === eventType);
      }
      
      // Sort by start month
      filteredEvents.sort((a, b) => (a.startMonth || 12) - (b.startMonth || 12));
      
      res.json({
        total: filteredEvents.length,
        events: filteredEvents.slice(0, limit).map(e => ({
          id: e.id,
          title: e.title,
          description: e.description,
          eventType: e.eventType,
          city: e.city,
          country: e.country,
          startMonth: e.startMonth,
          endMonth: e.endMonth,
          seasonRating: e.seasonRating,
          highlights: e.highlights,
          tips: e.tips,
        })),
      });
    } catch (error: any) {
      console.error("Error getting global events:", error);
      res.status(500).json({ message: "Failed to get global events", error: error.message });
    }
  });

  // Get enriched recommendations for a city (AI + affiliate/booking links)
  app.get("/api/travelpulse/enriched/:cityName", async (req, res) => {
    try {
      const { cityName } = req.params;
      if (!cityName) {
        return res.status(400).json({ message: "City name is required" });
      }

      const { contentEnrichmentService } = await import("./services/content-enrichment.service");
      const enrichedContent = await contentEnrichmentService.getEnrichedContentForCity(cityName);

      // Return 200 with empty arrays for consistent empty-state handling
      if (!enrichedContent) {
        return res.json({
          cityName,
          country: "",
          lastUpdated: new Date(),
          restaurants: [],
          attractions: [],
          nightlife: [],
          hiddenGems: [],
          trendingNow: [],
        });
      }

      res.json(enrichedContent);
    } catch (error: any) {
      console.error("Error getting enriched content:", error);
      res.status(500).json({ message: "Failed to get enriched content", error: error.message });
    }
  });

  // Search SERP for venue-specific results
  app.get("/api/travelpulse/serp-search", async (req, res) => {
    try {
      const { query, city, country, type } = req.query;
      if (!city) {
        return res.status(400).json({ message: "City is required" });
      }

      const { serpService } = await import("./services/serp.service");
      let results;
      
      switch (type as string) {
        case "restaurant":
          results = await serpService.searchRestaurants(city as string, country as string || "", query as string);
          break;
        case "nightlife":
          results = await serpService.searchNightlife(city as string, country as string || "");
          break;
        default:
          results = await serpService.searchAttractions(city as string, country as string || "", query as string);
      }

      res.json({ results });
    } catch (error: any) {
      console.error("Error searching SERP:", error);
      res.status(500).json({ message: "Failed to search venues", error: error.message });
    }
  });

  // ============================================
  // FEVER PARTNER API ROUTES
  // Events and experiences from Fever (feverup.com)
  // ============================================

  // Get Fever service status and supported cities
  app.get("/api/fever/status", async (_req, res) => {
    try {
      const cities = feverService.getSupportedCities();
      const categories = feverService.getCategories();
      const isConfigured = feverService.isReady();

      res.json({
        configured: isConfigured,
        message: isConfigured 
          ? "Fever API is configured and ready" 
          : "Fever API not configured - add FEVER_API_KEY and FEVER_PARTNER_ID secrets",
        supportedCities: cities.length,
        cities: cities.map(c => ({ code: c.code, name: c.name, country: c.country })),
        categories,
      });
    } catch (error) {
      console.error("[Fever] Status check error:", error);
      res.status(500).json({ error: "Failed to get Fever status" });
    }
  });

  // Search events by city
  app.get("/api/fever/events", async (req, res) => {
    try {
      const { 
        city, 
        query, 
        category, 
        startDate, 
        endDate, 
        minPrice, 
        maxPrice, 
        free, 
        page, 
        limit, 
        sortBy 
      } = req.query;

      if (!city || typeof city !== 'string') {
        return res.status(400).json({ error: "City parameter is required" });
      }

      const result = await feverService.searchEvents({
        city,
        query: query as string | undefined,
        category: category as string | undefined,
        startDate: startDate as string | undefined,
        endDate: endDate as string | undefined,
        minPrice: minPrice ? Number(minPrice) : undefined,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        isFree: free === 'true',
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
        sortBy: sortBy as 'date' | 'popularity' | 'price' | 'rating' | undefined,
      });

      if (!result) {
        return res.status(404).json({ error: "No events found or city not supported" });
      }

      res.json(result);
    } catch (error) {
      console.error("[Fever] Event search error:", error);
      res.status(500).json({ error: "Failed to search Fever events" });
    }
  });

  // Get event details by ID
  app.get("/api/fever/events/:eventId", async (req, res) => {
    try {
      const { eventId } = req.params;
      const event = await feverService.getEventById(eventId);

      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      res.json(event);
    } catch (error) {
      console.error("[Fever] Event details error:", error);
      res.status(500).json({ error: "Failed to get event details" });
    }
  });

  // Get upcoming events for a city
  app.get("/api/fever/cities/:cityCode/upcoming", async (req, res) => {
    try {
      const { cityCode } = req.params;
      const { limit, category } = req.query;

      const events = await feverService.getUpcomingEvents(cityCode, {
        limit: limit ? Number(limit) : 10,
        category: category as string | undefined,
      });

      res.json({ events, count: events.length });
    } catch (error) {
      console.error("[Fever] Upcoming events error:", error);
      res.status(500).json({ error: "Failed to get upcoming events" });
    }
  });

  // Get free events for a city
  app.get("/api/fever/cities/:cityCode/free", async (req, res) => {
    try {
      const { cityCode } = req.params;
      const { limit } = req.query;

      const events = await feverService.getFreeEvents(cityCode, {
        limit: limit ? Number(limit) : 20,
      });

      res.json({ events, count: events.length });
    } catch (error) {
      console.error("[Fever] Free events error:", error);
      res.status(500).json({ error: "Failed to get free events" });
    }
  });

  // Get events by date range for a city
  app.get("/api/fever/cities/:cityCode/dates", async (req, res) => {
    try {
      const { cityCode } = req.params;
      const { startDate, endDate, category, limit } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({ error: "startDate and endDate are required" });
      }

      const events = await feverService.getEventsByDateRange(
        cityCode,
        startDate as string,
        endDate as string,
        {
          category: category as string | undefined,
          limit: limit ? Number(limit) : 50,
        }
      );

      res.json({ events, count: events.length });
    } catch (error) {
      console.error("[Fever] Date range events error:", error);
      res.status(500).json({ error: "Failed to get events by date range" });
    }
  });

  // Get list of supported cities
  app.get("/api/fever/cities", async (_req, res) => {
    try {
      const cities = feverService.getSupportedCities();
      res.json({ cities, count: cities.length });
    } catch (error) {
      console.error("[Fever] Cities list error:", error);
      res.status(500).json({ error: "Failed to get cities list" });
    }
  });

  // Merge Fever events with TravelPulse destination events for calendar integration
  app.get("/api/travelpulse/fever-events/:cityName", async (req, res) => {
    try {
      const { cityName } = req.params;
      const { year, month, limit } = req.query;

      // Find matching Fever city
      const feverCity = feverService.findCity(cityName);
      
      // Get Fever events for this city
      let feverEvents: any[] = [];
      if (feverCity) {
        const currentYear = year ? Number(year) : new Date().getFullYear();
        const currentMonth = month ? Number(month) : new Date().getMonth() + 1;
        
        // Calculate date range for the month (or year if no month specified)
        let startDate: string;
        let endDate: string;
        
        if (month) {
          startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
          const lastDay = new Date(currentYear, currentMonth, 0).getDate();
          endDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${lastDay}`;
        } else {
          startDate = `${currentYear}-01-01`;
          endDate = `${currentYear}-12-31`;
        }

        const result = await feverService.searchEvents({
          city: feverCity.code,
          startDate,
          endDate,
          limit: limit ? Number(limit) : 50,
          sortBy: 'date',
        });

        if (result?.events) {
          feverEvents = result.events.map(event => ({
            id: `fever-${event.id}`,
            source: 'fever',
            title: event.title,
            description: event.shortDescription || event.description,
            city: event.city,
            country: event.country,
            eventType: mapFeverCategoryToEventType(event.category),
            specificDate: event.dates.startDate?.split('T')[0],
            startMonth: currentMonth,
            endMonth: currentMonth,
            crowdLevel: 'moderate',
            pricing: event.pricing,
            bookingUrl: event.affiliateUrl || event.bookingUrl,
            imageUrl: event.imageUrl,
            rating: event.rating,
            isFree: event.isFree,
            tags: event.tags,
          }));
        }
      }

      // Get existing TravelPulse destination events for this city
      const existingEvents = await db.select()
        .from(destinationEvents)
        .where(eq(destinationEvents.city, cityName));

      // Merge and deduplicate (prefer Fever events for matching titles)
      const mergedEvents = [...feverEvents];
      for (const event of existingEvents) {
        const isDuplicate = feverEvents.some(
          fe => fe.title.toLowerCase().includes(event.title.toLowerCase()) ||
                event.title.toLowerCase().includes(fe.title.toLowerCase())
        );
        if (!isDuplicate) {
          mergedEvents.push({
            ...event,
            source: 'travelpulse',
          });
        }
      }

      res.json({
        city: cityName,
        feverSupported: !!feverCity,
        feverCity: feverCity || null,
        events: mergedEvents,
        count: mergedEvents.length,
        feverCount: feverEvents.length,
        travelpulseCount: existingEvents.length,
      });
    } catch (error) {
      console.error("[TravelPulse] Fever events merge error:", error);
      res.status(500).json({ error: "Failed to get merged Fever events" });
    }
  });

  // ============ FEVER CACHE ENDPOINTS ============

  // Get Fever cache status
  app.get("/api/fever/cache/status", async (_req, res) => {
    try {
      const status = await feverCacheService.getCacheStatus();
      res.json({
        ...status,
        supportedCities: feverService.getSupportedCities().length,
        cacheEnabled: true,
        cacheDurationHours: 24,
      });
    } catch (error) {
      console.error("[FeverCache] Status error:", error);
      res.status(500).json({ error: "Failed to get cache status" });
    }
  });

  // Get cached events for a city (uses cache, refreshes if stale)
  app.get("/api/fever/cache/events/:cityCode", async (req, res) => {
    try {
      const { cityCode } = req.params;
      const events = await feverCacheService.getEventsOrRefresh(cityCode);
      
      res.json({
        events,
        count: events.length,
        fromCache: true,
        cityCode: cityCode.toUpperCase(),
      });
    } catch (error) {
      console.error("[FeverCache] Get events error:", error);
      res.status(500).json({ error: "Failed to get cached events" });
    }
  });

  // Manually refresh cache for a city (admin only)
  app.post("/api/fever/cache/refresh/:cityCode", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { cityCode } = req.params;
      const result = await feverCacheService.refreshCityCache(cityCode);
      
      res.json({
        message: `Refreshed ${result.refreshed} events for ${cityCode}`,
        ...result,
      });
    } catch (error) {
      console.error("[FeverCache] Refresh error:", error);
      res.status(500).json({ error: "Failed to refresh cache" });
    }
  });

  // Get comprehensive location summary for admin panel
  app.get("/api/admin/data/location-summary", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { feverEventCache, hotelCache, activityCache, flightCache } = await import("@shared/schema");
      const { sql } = await import("drizzle-orm");
      
      // Get events by city
      const eventData = await db.select({
        cityCode: feverEventCache.cityCode,
        city: feverEventCache.city,
        count: sql<number>`count(*)::int`,
        lastUpdated: sql<string>`max(${feverEventCache.lastUpdated})`,
      })
      .from(feverEventCache)
      .groupBy(feverEventCache.cityCode, feverEventCache.city);

      // Get hotels by city
      const hotelData = await db.select({
        cityCode: hotelCache.cityCode,
        city: hotelCache.city,
        count: sql<number>`count(*)::int`,
        lastUpdated: sql<string>`max(${hotelCache.lastUpdated})`,
      })
      .from(hotelCache)
      .groupBy(hotelCache.cityCode, hotelCache.city);

      // Get activities by destination
      const activityData = await db.select({
        destination: activityCache.destination,
        city: activityCache.city,
        count: sql<number>`count(*)::int`,
        lastUpdated: sql<string>`max(${activityCache.lastUpdated})`,
      })
      .from(activityCache)
      .groupBy(activityCache.destination, activityCache.city);

      // Get flights by origin/destination
      const flightData = await db.select({
        origin: flightCache.origin,
        destination: flightCache.destination,
        count: sql<number>`count(*)::int`,
        lastUpdated: sql<string>`max(${flightCache.lastUpdated})`,
      })
      .from(flightCache)
      .groupBy(flightCache.origin, flightCache.destination);

      // Get totals
      const totals = {
        events: eventData.reduce((sum, e) => sum + e.count, 0),
        hotels: hotelData.reduce((sum, h) => sum + h.count, 0),
        activities: activityData.reduce((sum, a) => sum + a.count, 0),
        flights: flightData.reduce((sum, f) => sum + f.count, 0),
      };

      res.json({
        events: eventData,
        hotels: hotelData,
        activities: activityData,
        flights: flightData,
        totals,
      });
    } catch (error) {
      console.error("[Admin] Location summary error:", error);
      res.status(500).json({ error: "Failed to get location summary" });
    }
  });

  // Manually refresh all cities (admin only)
  app.post("/api/fever/cache/refresh-all", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      const result = await feverCacheService.refreshAllCities();
      
      res.json({
        message: `Refreshed ${result.totalRefreshed} events across all cities`,
        ...result,
      });
    } catch (error) {
      console.error("[FeverCache] Refresh all error:", error);
      res.status(500).json({ error: "Failed to refresh all caches" });
    }
  });

  // Start the scheduler when routes are registered
  travelPulseScheduler.start();

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
