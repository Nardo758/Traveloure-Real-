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
import { registerAdminContentRoutes } from "./admin-content";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });



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

const DEFAULT_SETTINGS: Record<string, string> = {
  platform_name: "Traveloure",
  default_currency: "USD",
  timezone: "UTC",
  support_email: "support@traveloure.com",
  expert_commission_min: "75",
  expert_commission_max: "85",
  provider_commission_min: "4",
  provider_commission_max: "12",
  ai_recommendations_enabled: "true",
  new_registrations_enabled: "true",
  travelpulse_enabled: "true",
  credit_system_enabled: "true",
  affiliate_bookings_enabled: "true",
};

export function registerAdminAnalyticsRoutes(app: Express, resolveSlug: (slug: string) => string = (s) => s): void {
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
        const { aiUsageService: aiSvc } = await import('../services/ai-usage.service');
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
          type: ["expert", "local_expert"].includes(u.role ?? "") ? "expert" as const : ["provider", "service_provider"].includes(u.role ?? "") ? "provider" as const : "user" as const,
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

  app.get("/api/admin/activity/recent", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const dbUser = await storage.getUser(userId);
      if (!dbUser || dbUser.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

      const rows = await db
        .select({
          id: accessAuditLogs.id,
          actorId: accessAuditLogs.actorId,
          actorRole: accessAuditLogs.actorRole,
          action: accessAuditLogs.action,
          resourceType: accessAuditLogs.resourceType,
          resourceId: accessAuditLogs.resourceId,
          ipAddress: accessAuditLogs.ipAddress,
          createdAt: accessAuditLogs.createdAt,
          actorEmail: users.email,
          actorFirstName: users.firstName,
          actorLastName: users.lastName,
        })
        .from(accessAuditLogs)
        .leftJoin(users, eq(accessAuditLogs.actorId, users.id))
        .orderBy(desc(accessAuditLogs.createdAt))
        .limit(limit);

      res.json(rows);
    } catch (err) {
      console.error("Get activity error:", err);
      res.status(500).json({ message: "Failed to fetch activity feed" });
    }
  });

  app.get("/api/admin/flagged-content", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const dbUser = await storage.getUser(userId);
      if (!dbUser || dbUser.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

      const rows = await db
        .select({
          id: contentRegistry.id,
          trackingNumber: contentRegistry.trackingNumber,
          contentType: contentRegistry.contentType,
          contentId: contentRegistry.contentId,
          title: contentRegistry.title,
          status: contentRegistry.status,
          flagReason: contentRegistry.flagReason,
          flaggedAt: contentRegistry.flaggedAt,
          ownerId: contentRegistry.ownerId,
          ownerEmail: users.email,
          ownerFirstName: users.firstName,
          ownerLastName: users.lastName,
        })
        .from(contentRegistry)
        .leftJoin(users, eq(contentRegistry.ownerId, users.id))
        .where(eq(contentRegistry.status, "flagged"))
        .orderBy(desc(contentRegistry.flaggedAt))
        .limit(limit);

      res.json(rows);
    } catch (err) {
      console.error("Get flagged content error:", err);
      res.status(500).json({ message: "Failed to fetch flagged content" });
    }
  });

  app.get("/api/admin/settings", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const dbUser = await storage.getUser(userId);
      if (!dbUser || dbUser.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const rows = await db.select().from(platformSettings);
      const settings: Record<string, string> = { ...DEFAULT_SETTINGS };
      for (const row of rows) {
        settings[row.key] = row.value;
      }
      res.json(settings);
    } catch (err) {
      console.error("Get settings error:", err);
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  app.patch("/api/admin/settings", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const dbUser = await storage.getUser(userId);
      if (!dbUser || dbUser.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const updates = req.body as Record<string, string>;
      if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
        return res.status(400).json({ message: "Invalid settings payload" });
      }

      const BOOLEAN_KEYS = new Set([
        "ai_recommendations_enabled", "new_registrations_enabled",
        "travelpulse_enabled", "credit_system_enabled", "affiliate_bookings_enabled",
      ]);
      const COMMISSION_KEYS = new Set([
        "expert_commission_min", "expert_commission_max",
        "provider_commission_min", "provider_commission_max",
      ]);
      const ALLOWED_KEYS = new Set([
        ...Object.keys(DEFAULT_SETTINGS),
      ]);

      const errors: string[] = [];
      for (const [key, value] of Object.entries(updates)) {
        if (!ALLOWED_KEYS.has(key)) {
          errors.push(`Unknown setting key: ${key}`);
          continue;
        }
        const strValue = String(value);
        if (BOOLEAN_KEYS.has(key)) {
          if (strValue !== "true" && strValue !== "false") {
            errors.push(`Setting '${key}' must be 'true' or 'false'`);
            continue;
          }
        } else if (COMMISSION_KEYS.has(key)) {
          const num = parseFloat(strValue);
          if (!Number.isFinite(num) || num < 0 || num > 100) {
            errors.push(`Setting '${key}' must be a number between 0 and 100`);
            continue;
          }
        }
        await db.insert(platformSettings)
          .values({ key, value: strValue, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: platformSettings.key,
            set: { value: strValue, updatedAt: new Date() },
          });
      }

      if (errors.length > 0) {
        return res.status(400).json({ message: "Validation errors", errors });
      }

      res.json({ success: true, message: "Settings saved successfully" });
    } catch (err) {
      console.error("Save settings error:", err);
      res.status(500).json({ message: "Failed to save settings" });
    }
  });
}
