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
import { verifyTripOwnership, logItineraryChange, sanitizeInput, sanitizeObject, mapFeverCategoryToEventType, requireAdmin, checkAIRateLimit } from "./route-utils";
import { cacheSchedulerService } from "../services/cache-scheduler.service";
import { getTransitRoute, getMultipleTransitRoutes, TransitRequestSchema } from "../services/routes.service";
import { itineraryIntelligenceService } from "../services/itinerary-intelligence.service";
import { emergencyService } from "../services/emergency.service";
import { experienceCatalogService } from "../services/experience-catalog.service";
import { opportunityEngineService } from "../services/opportunity-engine.service";
import { generateOptimizedItineraries, getComparisonWithVariants, selectVariant } from "../itinerary-optimizer";
import { travelPulseScheduler } from "../services/travelpulse-scheduler.service";
import fs from "fs";
import path from "path";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const contactSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email"),
  phone: z.string().optional(),
  subject: z.string().min(1, "Subject is required").max(200),
  message: z.string().min(10, "Message must be at least 10 characters").max(2000),
  preferredContactMethod: z.enum(["email", "phone"]).optional(),
});


export function registerIntegrationRoutes(app: Express, resolveSlug: (slug: string) => string = (s) => s): void {
  app.get("/api/catalog/search", async (req, res) => {
    try {
      const { 
        destination, 
        query, 
        priceMin, 
        priceMax, 
        rating, 
        sortBy, 
        limit, 
        offset,
        providers,
        experienceTypeSlug,
        tabSlug
      } = req.query;

      const result = await experienceCatalogService.searchCatalog({
        destination: destination as string | undefined,
        query: query as string | undefined,
        priceMin: priceMin ? parseFloat(priceMin as string) : undefined,
        priceMax: priceMax ? parseFloat(priceMax as string) : undefined,
        rating: rating ? parseFloat(rating as string) : undefined,
        sortBy: sortBy as "popular" | "price_low" | "price_high" | "rating" | undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
        providers: providers ? (providers as string).split(",") : undefined,
        experienceTypeSlug: experienceTypeSlug as string | undefined,
        tabSlug: tabSlug as string | undefined,
      });

      res.json(result);
    } catch (error) {
      console.error("Catalog search error:", error);
      res.status(500).json({ message: "Failed to search catalog" });
    }
  });

  app.get("/api/catalog/search-hybrid", async (req, res) => {
    try {
      const { hybridCatalogSearchQuerySchema } = await import("@shared/schema");
      const parseResult = hybridCatalogSearchQuerySchema.safeParse(req.query);
      
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Validation error",
          errors: parseResult.error.flatten().fieldErrors
        });
      }

      const result = await experienceCatalogService.searchWithSerpFallback(parseResult.data);

      res.json(result);
    } catch (error) {
      console.error("Hybrid catalog search error:", error);
      res.status(500).json({ message: "Failed to search catalog" });
    }
  });

  app.get("/api/catalog/templates/:slug", async (req, res) => {
    try {
      const result = await experienceCatalogService.getExperienceTypeWithTabs(req.params.slug);
      if (!result.experienceType) {
        return res.status(404).json({ message: "Experience type not found" });
      }
      res.json(result);
    } catch (error) {
      console.error("Error fetching template:", error);
      res.status(500).json({ message: "Failed to fetch template" });
    }
  });

  app.get("/api/catalog/items/:type/:id", async (req, res) => {
    try {
      const item = await experienceCatalogService.getCatalogItem(req.params.id, req.params.type);
      if (!item) {
        return res.status(404).json({ message: "Item not found" });
      }
      res.json(item);
    } catch (error) {
      console.error("Error fetching catalog item:", error);
      res.status(500).json({ message: "Failed to fetch catalog item" });
    }
  });

  app.get("/api/catalog/destinations", async (req, res) => {
    try {
      const destinations = await experienceCatalogService.getDestinations();
      res.json(destinations);
    } catch (error) {
      console.error("Error fetching destinations:", error);
      res.status(500).json({ message: "Failed to fetch destinations" });
    }
  });

  app.get("/api/destinations", async (req, res) => {
    try {
      const destinations = await experienceCatalogService.getDestinations();
      res.json(destinations);
    } catch (error) {
      console.error("Error fetching destinations:", error);
      res.status(500).json({ message: "Failed to fetch destinations" });
    }
  });

  app.get("/api/amadeus/locations", async (req, res) => {
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
        // Sort by relevance: exact name match first, then by traveler score
        formattedLocations.sort((a: any, b: any) => {
          const keywordLower = keyword.toLowerCase();
          const nameA = (a.name || '').toLowerCase();
          const nameB = (b.name || '').toLowerCase();
          const cityA = (a.address?.cityName || '').toLowerCase();
          const cityB = (b.address?.cityName || '').toLowerCase();
          
          // Exact match on name or city name gets highest priority
          const exactMatchA = nameA === keywordLower || cityA === keywordLower;
          const exactMatchB = nameB === keywordLower || cityB === keywordLower;
          
          if (exactMatchA && !exactMatchB) return -1;
          if (!exactMatchA && exactMatchB) return 1;
          
          // Then sort by traveler score (higher is better)
          const scoreA = a.analytics?.travelers?.score ?? 0;
          const scoreB = b.analytics?.travelers?.score ?? 0;
          return scoreB - scoreA;
        });
        console.log(`[Amadeus Locations] Sorted results - first: ${(formattedLocations[0] as any)?.name} (score: ${(formattedLocations[0] as any)?.analytics?.travelers?.score ?? 0})`);
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
      
      // Sort by relevance: exact name match first, then by traveler score
      locations.sort((a: any, b: any) => {
        const keywordLower = keyword.toLowerCase();
        const nameA = (a.name || '').toLowerCase();
        const nameB = (b.name || '').toLowerCase();
        const cityA = (a.address?.cityName || '').toLowerCase();
        const cityB = (b.address?.cityName || '').toLowerCase();
        
        // Exact match on name or city name gets highest priority
        const exactMatchA = nameA === keywordLower || cityA === keywordLower;
        const exactMatchB = nameB === keywordLower || cityB === keywordLower;
        
        if (exactMatchA && !exactMatchB) return -1;
        if (!exactMatchA && exactMatchB) return 1;
        
        // Then sort by traveler score (higher is better)
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

  app.get("/api/amadeus/pois", isAuthenticated, async (req, res) => {
    try {
      const { latitude, longitude, radius, categories } = req.query;
      
      if (!latitude || !longitude) {
        return res.status(400).json({ message: "latitude and longitude are required" });
      }
      
      const pois = await amadeusService.searchPointsOfInterest({
        latitude: parseFloat(latitude as string),
        longitude: parseFloat(longitude as string),
        radius: radius ? parseInt(radius as string, 10) : 5,
        categories: categories ? (categories as string).split(',') : undefined,
      });
      
      res.json(pois);
    } catch (error: any) {
      console.error('POI search error:', error);
      res.status(500).json({ message: error.message || "POI search failed" });
    }
  });

  app.get("/api/amadeus/pois/:id", isAuthenticated, async (req, res) => {
    try {
      const poi = await amadeusService.getPointOfInterestById(req.params.id);
      if (!poi) {
        return res.status(404).json({ message: "POI not found" });
      }
      res.json(poi);
    } catch (error: any) {
      console.error('POI get error:', error);
      res.status(500).json({ message: error.message || "Failed to get POI" });
    }
  });

  app.get("/api/amadeus/activities", isAuthenticated, async (req, res) => {
    try {
      const { latitude, longitude, radius } = req.query;
      
      if (!latitude || !longitude) {
        return res.status(400).json({ message: "latitude and longitude are required" });
      }
      
      const activities = await amadeusService.searchActivities({
        latitude: parseFloat(latitude as string),
        longitude: parseFloat(longitude as string),
        radius: radius ? parseInt(radius as string, 10) : 20,
      });
      
      res.json(activities);
    } catch (error: any) {
      console.error('Amadeus activities search error:', error);
      res.status(500).json({ message: error.message || "Activities search failed" });
    }
  });

  app.get("/api/amadeus/activities/:id", isAuthenticated, async (req, res) => {
    try {
      const activity = await amadeusService.getActivityById(req.params.id);
      if (!activity) {
        return res.status(404).json({ message: "Activity not found" });
      }
      res.json(activity);
    } catch (error: any) {
      console.error('Amadeus activity get error:', error);
      res.status(500).json({ message: error.message || "Failed to get activity" });
    }
  });

  app.post("/api/amadeus/transfers", isAuthenticated, async (req, res) => {
    try {
      const parseResult = transferSearchSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Invalid request body",
          errors: parseResult.error.flatten().fieldErrors
        });
      }
      
      const { startLocationCode, endAddressLine, endCityName, endGeoCode, transferType, startDateTime, passengers } = parseResult.data;
      
      const transfers = await amadeusService.searchTransfers({
        startLocationCode,
        endAddressLine,
        endCityName,
        endGeoCode: endGeoCode as any,
        transferType: transferType as any,
        startDateTime,
        passengers,
      });
      
      res.json(transfers);
    } catch (error: any) {
      console.error('Transfers search error:', error);
      res.status(500).json({ message: error.message || "Transfers search failed" });
    }
  });

  app.get("/api/amadeus/safety", isAuthenticated, async (req, res) => {
    try {
      const { latitude, longitude, radius } = req.query;
      
      if (!latitude || !longitude) {
        return res.status(400).json({ message: "latitude and longitude are required" });
      }
      
      const safetyRatings = await amadeusService.getSafetyRatings({
        latitude: parseFloat(latitude as string),
        longitude: parseFloat(longitude as string),
        radius: radius ? parseInt(radius as string, 10) : 5,
      });
      
      res.json(safetyRatings);
    } catch (error: any) {
      console.error('Safety ratings search error:', error);
      res.status(500).json({ message: error.message || "Safety ratings search failed" });
    }
  });

  app.get("/api/amadeus/safety/:id", isAuthenticated, async (req, res) => {
    try {
      const rating = await amadeusService.getSafetyRatingById(req.params.id);
      if (!rating) {
        return res.status(404).json({ message: "Safety rating not found" });
      }
      res.json(rating);
    } catch (error: any) {
      console.error('Safety rating get error:', error);
      res.status(500).json({ message: error.message || "Failed to get safety rating" });
    }
  });

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

  app.get("/api/viator/destinations", isAuthenticated, async (req, res) => {
    try {
      const destinations = await viatorService.getDestinations();
      res.json(destinations);
    } catch (error: any) {
      console.error('Viator destinations error:', error);
      res.status(500).json({ message: error.message || "Failed to get destinations" });
    }
  });

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

  app.get("/api/cache/activities", async (req, res) => {
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
        priceChanges: results.filter((r: any) => r.priceChanged),
      });
    } catch (error: any) {
      console.error('Availability verification error:', error);
      res.status(500).json({ message: error.message || "Verification failed" });
    }
  });

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

  app.get("/api/cache/categories", isAuthenticated, async (req, res) => {
    try {
      const categories = await cacheService.getAvailableCategories();
      res.json(categories);
    } catch (error: any) {
      console.error('Get categories error:', error);
      res.status(500).json({ message: error.message || "Failed to get categories" });
    }
  });

  app.get("/api/cache/status", isAuthenticated, async (req, res) => {
    try {
      const status = await cacheSchedulerService.getCacheFreshnessStatus();
      res.json(status);
    } catch (error: any) {
      console.error('Get cache status error:', error);
      res.status(500).json({ message: error.message || "Failed to get cache status" });
    }
  });

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

  app.get("/api/serp/template-search", async (req, res) => {
    try {
      const { serpTemplateSearchQuerySchema } = await import("@shared/schema");
      const parseResult = serpTemplateSearchQuerySchema.safeParse(req.query);
      
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Validation error",
          errors: parseResult.error.flatten().fieldErrors
        });
      }

      const { serviceType, destination, template, priceRange, style, groupSize } = parseResult.data;

      const { serpService } = await import("../services/serp.service");
      
      const queryParams = serpService.buildQueryForTemplate(
        serviceType,
        destination,
        template,
        { priceRange, style, groupSize }
      );

      const results = await serpService.searchAttractions(
        destination,
        "",
        queryParams.query
      );

      res.json({ 
        results,
        query: queryParams.query,
        cached: false,
        source: "serp"
      });
    } catch (error: any) {
      console.error("Error in template SERP search:", error);
      res.status(500).json({ message: "Failed to search", error: error.message });
    }
  });

  app.post("/api/serp/track-click", async (req, res) => {
    try {
      const { serpTrackClickBodySchema } = await import("@shared/schema");
      const parseResult = serpTrackClickBodySchema.safeParse(req.body);
      
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Validation error",
          errors: parseResult.error.flatten().fieldErrors
        });
      }

      const { providerId, metadata } = parseResult.data;

      const { serpService } = await import("../services/serp.service");
      const userId = (req.user as any)?.id || null;
      
      await serpService.trackClick(providerId, userId, metadata);

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error tracking SERP click:", error);
      res.status(500).json({ message: "Failed to track click", error: error.message });
    }
  });

  app.post("/api/serp/inquiry", isAuthenticated, async (req, res) => {
    try {
      const { serpInquiryBodySchema } = await import("@shared/schema");
      const parseResult = serpInquiryBodySchema.safeParse(req.body);
      
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Validation error",
          errors: parseResult.error.flatten().fieldErrors
        });
      }

      const { 
        serpProviderId, 
        providerName, 
        providerEmail, 
        providerPhone, 
        providerWebsite, 
        message, 
        destination, 
        category, 
        template 
      } = parseResult.data;

      const { serpService } = await import("../services/serp.service");
      
      const inquiry = await serpService.createInquiry({
        userId: (req.user as any).id,
        serpProviderId,
        providerName,
        providerEmail,
        providerPhone,
        providerWebsite,
        message,
        destination,
        category,
        template
      });

      if (!inquiry) {
        return res.status(500).json({ message: "Failed to create inquiry" });
      }

      res.json({ success: true, inquiry });
    } catch (error: any) {
      console.error("Error creating SERP inquiry:", error);
      res.status(500).json({ message: "Failed to create inquiry", error: error.message });
    }
  });

  app.get("/api/serp/partnerships", isAuthenticated, async (req, res) => {
    try {
      const { limit = "20", byMarket } = req.query;
      
      const { serpService } = await import("../services/serp.service");
      
      if (byMarket === "true") {
        const report = await serpService.getPartnershipReportByMarket();
        return res.json({ byMarket: true, report });
      }

      const opportunities = await serpService.getTopPartnershipOpportunities(parseInt(limit as string));
      res.json({ opportunities });
    } catch (error: any) {
      console.error("Error fetching partnerships:", error);
      res.status(500).json({ message: "Failed to fetch partnerships", error: error.message });
    }
  });

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

  app.get("/api/fever/cities", async (_req, res) => {
    try {
      const cities = feverService.getSupportedCities();
      res.json({ cities, count: cities.length });
    } catch (error) {
      console.error("[Fever] Cities list error:", error);
      res.status(500).json({ error: "Failed to get cities list" });
    }
  });

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
}
