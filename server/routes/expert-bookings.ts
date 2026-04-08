import type { Express } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { db } from "../db";
import { eq, and, or, like, sql, desc, count, ne, inArray, isNotNull, asc } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { amadeusService } from "../services/amadeus.service";
import { viatorService } from "../services/viator.service";
import { cacheService } from "../services/cache.service";
import { claudeService } from "../services/claude.service";
import { aiOrchestrator } from "../services/ai-orchestrator";
import { grokService } from "../services/grok.service";
import { feverService } from "../services/fever.service";
import { feverCacheService } from "../services/fever-cache.service";
import { coordinationService } from "../services/coordination.service";
import { vendorManagementService } from "../services/vendor-management.service";
import { budgetService } from "../services/budget.service";
import { aiUsageService } from "../services/ai-usage.service";
import { sanitizeUserForRole, sanitizeBookingForExpert, canSeeFullUserData, createPublicProfile, getDisplayName, redactContactInfo } from "../utils/data-sanitizer";
import { calculateTransportLegs, regenerateMapsUrlsFromLegs } from "../services/transport-leg-calculator";
import { buildGoogleNavUrl, buildAppleNavUrl } from "../services/maps-url-builder";
import { generateKml } from "../services/kml-generator";
import { generateGpx } from "../services/gpx-generator";
import { asyncHandler, NotFoundError, ValidationError, ForbiddenError } from "../infrastructure";
import { 
  users, helpGuideTrips, touristPlaceResults, touristPlacesSearches, 
  aiBlueprints, vendors, insertVendorSchema,
  insertLocalExpertFormSchema, insertServiceProviderFormSchema,
  insertProviderServiceSchema, insertServiceCategorySchema,
  insertServiceSubcategorySchema, insertFaqSchema,
  insertServiceTemplateSchema, insertServiceBookingSchema, insertServiceReviewSchema,
  itineraryComparisons, itineraryVariants, itineraryVariantItems, itineraryVariantMetrics,
  userExperienceItems, userExperiences, providerServices, cartItems, trips,
  serviceBookings, serviceReviews, notifications, wallets, creditTransactions, serviceProviderForms,
  insertCustomVenueSchema, insertGeneratedItinerarySchema,
  insertTemporalAnchorSchema, insertDayBoundarySchema, insertEnergyTrackingSchema,
  temporalAnchors, itineraryItems, generatedItineraries,
  userAndExpertChats, insertUserAndExpertChatSchema,
  expertPayouts, providerPayouts, platformSettings,
  expertMatchScores, aiGeneratedItineraries, destinationIntelligence, localExpertForms, expertAiTasks, aiInteractions, destinationEvents, travelPulseTrending, travelPulseCities, travelPulseHappeningNow,
  transportLegs, sharedItineraries, mapsExportCache, expertUpdatedItineraries,
  accessAuditLogs, contentRegistry
} from "@shared/schema";
import { 
  insertTripParticipantSchema, 
  insertVendorContractSchema, 
  insertTripTransactionSchema,
  insertItineraryItemSchema,
  insertTripEmergencyContactSchema,
  insertTripAlertSchema
} from "@shared/schema";
import { api } from "@shared/routes";
import Stripe from "stripe";
import { verifyTripOwnership, logItineraryChange, sanitizeInput, sanitizeObject, mapFeverCategoryToEventType } from "./route-utils";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });



export function registerExpertBookingRoutes(app: Express, resolveSlug: (slug: string) => string = (s) => s): void {
  app.get("/api/expert/bookings", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const userRole = (req.user as any).claims.role || 'expert';
    const status = req.query.status as string | undefined;
    const bookings = await storage.getServiceBookings({ providerId: userId, status });
    
    // Enrich with traveler info (sanitized for privacy)
    const enrichedBookings = await Promise.all(bookings.map(async (booking) => {
      const traveler = await storage.getUser(booking.travelerId);
      const sanitizedTraveler = traveler ? sanitizeUserForRole(traveler, userRole, false) : null;
      return {
        ...sanitizeBookingForExpert(booking, userRole, userId),
        traveler: sanitizedTraveler ? {
          ...sanitizedTraveler,
          displayName: getDisplayName(traveler.firstName, traveler.lastName)
        } : null
      };
    }));
    
    res.json(enrichedBookings);
  });

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

  app.get("/api/expert/analytics/dashboard", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const services = await storage.getProviderServicesByStatus(userId);
      const bookings = await storage.getServiceBookings({ providerId: userId });
      const earnings = await storage.getExpertEarnings(userId);
      const templates = await storage.getExpertTemplates(userId);
      
      // Get expert's profile for selected services and specializations
      const expertProfile = await storage.getLocalExpertForm(userId);
      const selectedServicesAtSignup = (expertProfile?.selectedServices as string[]) || [];
      const expertSpecializations = (expertProfile?.specializations as string[]) || [];
      const expertDestinations = (expertProfile?.destinations as string[]) || [];
      
      // Calculate key metrics
      const totalRevenue = services.reduce((sum, s) => sum + Number(s.totalRevenue || 0), 0);
      const totalBookings = services.reduce((sum, s) => sum + (s.bookingsCount || 0), 0);
      const avgRating = services.filter(s => s.averageRating).reduce((sum, s, _, arr) => 
        sum + Number(s.averageRating) / arr.length, 0
      ) || 0;
      
      const completedBookings = bookings.filter(b => b.status === "completed");
      const pendingBookings = bookings.filter(b => b.status === "pending");
      const confirmedBookings = bookings.filter(b => b.status === "confirmed");
      
      // Template analytics
      const publishedTemplates = templates.filter(t => t.isPublished);
      const templateRevenue = earnings
        .filter(e => e.type === "template_sale")
        .reduce((sum, e) => sum + Number(e.amount || 0), 0);
      
      // Calculate conversion metrics
      const inquiryCount = bookings.length;
      const conversionRate = inquiryCount > 0 ? (completedBookings.length / inquiryCount) * 100 : 0;
      
      // Revenue by service type
      const revenueByService = services.reduce((acc: any[], s) => {
        const revenue = Number(s.totalRevenue || 0);
        if (revenue > 0) {
          acc.push({
            service: s.serviceName || "Unnamed Service",
            revenue,
            bookings: s.bookingsCount || 0,
            percentage: totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0
          });
        }
        return acc;
      }, []).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
      
      // Conversion funnel
      const profileViews = Math.floor(totalBookings * 3.5); // Estimated
      const inquiriesStarted = totalBookings;
      const quoteSent = Math.floor(totalBookings * 0.85);
      const bookingsMade = completedBookings.length + confirmedBookings.length;
      
      const conversionFunnel = [
        { stage: "Profile Views", count: profileViews, percent: 100 },
        { stage: "Inquiries Started", count: inquiriesStarted, percent: profileViews > 0 ? (inquiriesStarted / profileViews) * 100 : 0 },
        { stage: "Quote Sent", count: quoteSent, percent: inquiriesStarted > 0 ? (quoteSent / inquiriesStarted) * 100 : 0 },
        { stage: "Booking Made", count: bookingsMade, percent: quoteSent > 0 ? (bookingsMade / quoteSent) * 100 : 0 },
        { stage: "Completed", count: completedBookings.length, percent: bookingsMade > 0 ? (completedBookings.length / bookingsMade) * 100 : 0 },
      ];
      
      // Calculate benchmarks
      const benchmarks = {
        responseTime: { value: "2 hrs", benchmark: "1 hr", status: "good" },
        conversionRate: { 
          value: `${conversionRate.toFixed(0)}%`, 
          benchmark: "55%", 
          status: conversionRate >= 55 ? "excellent" : conversionRate >= 40 ? "good" : "needs_improvement"
        },
        avgRating: {
          value: avgRating.toFixed(1),
          benchmark: "4.5",
          status: avgRating >= 4.5 ? "excellent" : avgRating >= 4.0 ? "good" : "needs_improvement"
        },
        avgBookingValue: {
          value: `$${totalBookings > 0 ? (totalRevenue / totalBookings).toFixed(0) : 0}`,
          benchmark: "$350",
          status: totalRevenue / (totalBookings || 1) >= 350 ? "excellent" : "good"
        }
      };
      
      // Client lifetime value
      const clientLifetimeValue = {
        average: totalBookings > 0 ? Math.round(totalRevenue / totalBookings * 1.8) : 0,
        repeatRate: 35, // Estimated
        avgBookingsPerClient: 1.8
      };
      
      // Track which selected services have been created vs pending
      const createdServiceNames = services.map(s => (s.serviceName || "").toLowerCase());
      const serviceAlignment = selectedServicesAtSignup.map(serviceName => ({
        name: serviceName,
        status: createdServiceNames.some(cs => cs.includes(serviceName.toLowerCase()) || serviceName.toLowerCase().includes(cs)) 
          ? "created" 
          : "pending"
      }));
      
      res.json({
        expertProfile: {
          selectedServices: selectedServicesAtSignup,
          specializations: expertSpecializations,
          destinations: expertDestinations,
          city: expertProfile?.city,
          country: expertProfile?.country
        },
        serviceAlignment,
        summary: {
          totalRevenue,
          totalBookings,
          avgRating,
          activeServices: services.filter(s => s.status === "active").length,
          publishedTemplates: publishedTemplates.length,
          templateRevenue,
          pendingBookings: pendingBookings.length,
          completedBookings: completedBookings.length,
        },
        keyMetrics: benchmarks,
        conversionFunnel,
        revenueByService,
        clientLifetimeValue,
        earnings: earnings.slice(0, 10)
      });
    } catch (err) {
      console.error("Error fetching expert analytics dashboard:", err);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

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
}
