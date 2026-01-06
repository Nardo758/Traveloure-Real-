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
  insertServiceTemplateSchema, insertServiceBookingSchema, insertServiceReviewSchema
} from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import OpenAI from "openai";

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
        serviceName: template.name,
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
  app.get("/api/my-bookings", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const status = req.query.status as string | undefined;
    const bookings = await storage.getServiceBookings({ travelerId: userId, status });
    res.json(bookings);
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
        serviceSnapshot: {
          name: service.serviceName,
          price: service.price,
          deliveryMethod: service.deliveryMethod,
        },
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
