import { Router } from "express";
import { db } from "../db";
import {
  itineraryComparisons,
  itineraryVariants,
  itineraryVariantItems,
  cartItems,
  providerServices,
  sharedItineraries,
  userExperienceItems,
} from "@shared/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";
import {
  generateOptimizedItineraries,
  getComparisonWithVariants,
  selectVariant,
} from "../itinerary-optimizer";

const router = Router();

router.post("/api/itinerary-comparisons", isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any).claims.sub;
    const { userExperienceId, tripId, title, destination, startDate, endDate, budget, travelers, baselineItems: inlineBaselineItems, experienceTypeSlug } = req.body;

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
        experienceTypeSlug: experienceTypeSlug || null,
        status: "generating",
      })
      .returning();

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

    if (baselineItems.length > 0) {
      const availableServices = await db
        .select()
        .from(providerServices)
        .where(eq(providerServices.status, "active"))
        .limit(100);

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

router.get("/api/dashboard/trip-scores", isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any).claims.sub;

    const allComps = await db
      .select({
        tripId: itineraryComparisons.tripId,
        selectedVariantId: itineraryComparisons.selectedVariantId,
        createdAt: itineraryComparisons.createdAt,
      })
      .from(itineraryComparisons)
      .where(eq(itineraryComparisons.userId, userId))
      .orderBy(desc(itineraryComparisons.createdAt));

    const seenTripIds = new Set<string>();
    const comps = allComps.filter(c => {
      if (!c.tripId || seenTripIds.has(c.tripId)) return false;
      seenTripIds.add(c.tripId);
      return true;
    });

    const variantIds = comps
      .map(c => c.selectedVariantId)
      .filter((v): v is string => !!v);

    const [variants, shares] = await Promise.all([
      variantIds.length
        ? db
            .select({ id: itineraryVariants.id, optimizationScore: itineraryVariants.optimizationScore })
            .from(itineraryVariants)
            .where(inArray(itineraryVariants.id, variantIds))
        : Promise.resolve([]),
      variantIds.length
        ? db
            .select({ variantId: sharedItineraries.variantId, shareToken: sharedItineraries.shareToken })
            .from(sharedItineraries)
            .where(inArray(sharedItineraries.variantId, variantIds))
        : Promise.resolve([]),
    ]);

    const scoreMap = new Map(variants.map(v => [v.id, v.optimizationScore]));
    const tokenMap = new Map(shares.map(s => [s.variantId, s.shareToken]));

    const result = comps
      .filter(c => !!c.tripId)
      .map(c => ({
        tripId: c.tripId!,
        optimizationScore: c.selectedVariantId ? (scoreMap.get(c.selectedVariantId) ?? null) : null,
        shareToken: c.selectedVariantId ? (tokenMap.get(c.selectedVariantId) ?? null) : null,
      }));

    res.json(result);
  } catch (error) {
    console.error("Error fetching trip scores:", error);
    res.status(500).json({ message: "Failed to fetch trip scores" });
  }
});

router.get("/api/itinerary-comparisons", isAuthenticated, async (req, res) => {
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

router.get("/api/itinerary-comparisons/:id", isAuthenticated, async (req, res) => {
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

router.post("/api/itinerary-comparisons/:id/generate", isAuthenticated, async (req, res) => {
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

router.post("/api/itinerary-comparisons/:id/select", isAuthenticated, async (req, res) => {
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

router.post("/api/itinerary-comparisons/:id/apply-to-cart", isAuthenticated, async (req, res) => {
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

export default router;
