import { Express, Request, Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { storage } from "../storage";
import crypto from "crypto";

// Zod validation schemas
const guestSchema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().min(1, "Name is required"),
  phone: z.string().optional()
});

const createInvitesSchema = z.object({
  guests: z.array(guestSchema).min(1, "At least one guest is required")
});

const originSchema = z.object({
  originCity: z.string().min(1, "Origin city is required"),
  originState: z.string().optional(),
  originCountry: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional()
});

const rsvpSchema = z.object({
  rsvpStatus: z.enum(["accepted", "declined", "maybe"]),
  numberOfGuests: z.number().int().min(1).optional(),
  dietaryRestrictions: z.array(z.string()).optional(),
  accommodationPreference: z.enum(["hotel_block", "own_booking", "with_family", "undecided"]).optional(),
  transportationNeeded: z.boolean().optional(),
  specialRequests: z.string().optional(),
  message: z.string().optional()
});

const inviteTemplateSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1, "Template name is required"),
  subject: z.string().optional(),
  messageBody: z.string().min(1, "Message body is required"),
  eventType: z.string().optional()
});

const travelPlansSchema = z.object({
  selectedFlight: z.any().optional(),
  selectedTransport: z.any().optional(),
  selectedAccommodation: z.any().optional(),
  selectedActivities: z.array(z.any()).optional(),
  arrivalDate: z.string().optional(),
  departureDate: z.string().optional()
});

// Helper to verify experience ownership via storage
async function verifyExperienceOwnership(experienceId: string, userId: string): Promise<boolean> {
  const experience = await storage.getUserExperienceById(experienceId);
  return !!experience && experience.userId === userId;
}

/**
 * Generate a unique URL-safe token for invite links
 */
function generateInviteToken(): string {
  return crypto.randomBytes(16).toString('base64url');
}

/**
 * Generate a token that doesn't already exist in the database
 */
async function generateUniqueToken(): Promise<string> {
  let token: string;
  let exists = true;

  while (exists) {
    token = generateInviteToken();
    exists = await storage.inviteTokenExists(token!);
  }

  return token!;
}

/**
 * GUEST INVITE SYSTEM API ROUTES
 * Game-changing feature for destination weddings & events
 */
export function setupGuestInviteRoutes(app: Express) {

  // ================================================================
  // ORGANIZER ROUTES (Event Host)
  // ================================================================

  /**
   * POST /api/events/:experienceId/invites
   * Create invite links for guests
   * Body: { guests: [{ email, name, phone? }] }
   */
  app.post("/api/events/:experienceId/invites", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { experienceId } = req.params;
      const userId = (req.user as any)?.claims?.sub;

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const validation = createInvitesSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: "Validation failed", details: validation.error.errors });
      }

      const { guests } = validation.data;

      const isOwner = await verifyExperienceOwnership(experienceId, userId);
      if (!isOwner) {
        return res.status(403).json({ error: "You don't have permission to manage invites for this experience" });
      }

      const createdInvites = [];
      for (const guest of guests) {
        const uniqueToken = await generateUniqueToken();
        const invite = await storage.createEventInvite({
          experienceId,
          organizerId: userId,
          guestEmail: guest.email,
          guestName: guest.name,
          guestPhone: guest.phone,
          uniqueToken,
          inviteSentAt: new Date(),
        });
        createdInvites.push({
          ...invite,
          inviteLink: `${process.env.APP_URL || 'https://traveloure.com'}/invite/${uniqueToken}`
        });
      }

      return res.status(201).json({
        message: `Created ${createdInvites.length} invites`,
        invites: createdInvites
      });

    } catch (error: any) {
      console.error("Error creating invites:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/events/:experienceId/invites
   * Get all invites for an event
   */
  app.get("/api/events/:experienceId/invites", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { experienceId } = req.params;
      const userId = (req.user as any)?.claims?.sub;

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const isOwner = await verifyExperienceOwnership(experienceId, userId);
      if (!isOwner) {
        return res.status(403).json({ error: "You don't have permission to view invites for this experience" });
      }

      const invites = await storage.getInvitesByExperience(experienceId);
      const invitesWithLinks = invites.map(invite => ({
        ...invite,
        inviteLink: `${process.env.APP_URL || 'https://traveloure.com'}/invite/${invite.uniqueToken}`
      }));

      return res.json({ invites: invitesWithLinks });

    } catch (error: any) {
      console.error("Error fetching invites:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/events/:experienceId/invites/stats
   * Get RSVP statistics for an event
   */
  app.get("/api/events/:experienceId/invites/stats", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { experienceId } = req.params;
      const userId = (req.user as any)?.claims?.sub;

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const isOwner = await verifyExperienceOwnership(experienceId, userId);
      if (!isOwner) {
        return res.status(403).json({ error: "You don't have permission to view stats for this experience" });
      }

      const invites = await storage.getInvitesByExperience(experienceId);

      const stats = {
        total: invites.length,
        accepted: invites.filter(i => i.rsvpStatus === 'accepted').length,
        declined: invites.filter(i => i.rsvpStatus === 'declined').length,
        pending: invites.filter(i => i.rsvpStatus === 'pending').length,
        maybe: invites.filter(i => i.rsvpStatus === 'maybe').length,
        totalGuests: invites.reduce((sum, i) => sum + (i.numberOfGuests || 0), 0),
        originCities: Array.from(new Set(invites.map(i => i.originCity).filter(Boolean))),
        viewedCount: invites.filter(i => i.inviteViewedAt !== null).length,
        notViewedCount: invites.filter(i => i.inviteViewedAt === null).length,
      };

      return res.json({ stats });

    } catch (error: any) {
      console.error("Error fetching stats:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  /**
   * DELETE /api/invites/:inviteId
   * Delete/cancel an invite
   */
  app.delete("/api/invites/:inviteId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { inviteId } = req.params;
      const userId = (req.user as any)?.claims?.sub;

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const invite = await storage.getInviteById(inviteId);
      if (!invite) {
        return res.status(404).json({ error: "Invite not found" });
      }

      const isOwner = await verifyExperienceOwnership(invite.experienceId, userId);
      if (!isOwner) {
        return res.status(403).json({ error: "You don't have permission to delete this invite" });
      }

      await storage.deleteEventInvite(inviteId);
      return res.json({ message: "Invite deleted successfully" });

    } catch (error: any) {
      console.error("Error deleting invite:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // ================================================================
  // GUEST ROUTES (Invite Recipients)
  // ================================================================

  /**
   * GET /api/invites/:token
   * Get invite details for guest (public endpoint)
   */
  app.get("/api/invites/:token", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;

      const row = await storage.getInviteByToken(token);
      if (!row) {
        return res.status(404).json({ error: "Invite not found" });
      }

      const { invite, experience } = row;

      // Track view
      await storage.trackInviteView(token, invite.inviteViewedAt ?? null);

      return res.json({ invite, experience });

    } catch (error: any) {
      console.error("Error fetching invite:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/invites/:token/origin
   * Save guest's origin city (public - guests don't need accounts)
   */
  app.post("/api/invites/:token/origin", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;

      const validation = originSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: "Validation failed", details: validation.error.errors });
      }

      const { originCity, originState, originCountry, latitude, longitude } = validation.data;

      const updated = await storage.updateInviteOrigin(token, {
        originCity,
        originState,
        originCountry,
        originLatitude: latitude?.toString(),
        originLongitude: longitude?.toString(),
      });

      if (!updated) {
        return res.status(404).json({ error: "Invite not found" });
      }

      return res.json({ message: "Origin city saved successfully", invite: updated });

    } catch (error: any) {
      console.error("Error saving origin:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/invites/:token/rsvp
   * Submit RSVP (public - guests don't need accounts)
   */
  app.post("/api/invites/:token/rsvp", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;

      const validation = rsvpSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: "Validation failed", details: validation.error.errors });
      }

      const {
        rsvpStatus,
        numberOfGuests,
        dietaryRestrictions,
        accommodationPreference,
        transportationNeeded,
        specialRequests,
        message
      } = validation.data;

      const updated = await storage.updateInviteRsvp(token, {
        rsvpStatus,
        rsvpDate: new Date(),
        numberOfGuests: numberOfGuests || 1,
        dietaryRestrictions: dietaryRestrictions || [],
        accommodationPreference: accommodationPreference || 'undecided',
        transportationNeeded: transportationNeeded || false,
        specialRequests,
        message,
      });

      if (!updated) {
        return res.status(404).json({ error: "Invite not found" });
      }

      return res.json({ message: "RSVP submitted successfully", invite: updated });

    } catch (error: any) {
      console.error("Error submitting RSVP:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/invites/:token/recommendations
   * Get personalized travel recommendations for guest
   */
  app.get("/api/invites/:token/recommendations", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;

      const row = await storage.getInviteByToken(token);
      if (!row) {
        return res.status(404).json({ error: "Invite not found" });
      }

      const { invite, experience } = row;

      if (!invite.originCity) {
        return res.status(400).json({
          error: "Origin city not set. Please set your city of origin first.",
          needsOrigin: true
        });
      }

      let travelPlan = await storage.getTravelPlanByInviteId(invite.id);
      if (!travelPlan) {
        travelPlan = await storage.createTravelPlan(invite.id);
      }

      const recommendations = {
        origin: {
          city: invite.originCity,
          state: invite.originState,
          country: invite.originCountry,
        },
        destination: {
          city: experience?.location,
          eventDate: experience?.eventDate,
        },
        flights: travelPlan.flightOptions || [],
        groundTransport: travelPlan.transportOptions || [],
        accommodations: travelPlan.accommodationOptions || [],
        activities: travelPlan.activityRecommendations || [],
        estimatedCost: travelPlan.estimatedTotalCost,
        needsApiIntegration: true,
      };

      return res.json({ recommendations, travelPlan });

    } catch (error: any) {
      console.error("Error fetching recommendations:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/invites/:token/travel-plans
   * Update guest's travel selections (public - guests don't need accounts)
   */
  app.post("/api/invites/:token/travel-plans", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;

      const validation = travelPlansSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: "Validation failed", details: validation.error.errors });
      }

      const {
        selectedFlight,
        selectedTransport,
        selectedAccommodation,
        selectedActivities,
        arrivalDate,
        departureDate
      } = validation.data;

      const invite = await storage.getInviteByToken(token);
      if (!invite) {
        return res.status(404).json({ error: "Invite not found" });
      }

      const planValues = {
        selectedFlight,
        selectedTransport,
        selectedAccommodation,
        selectedActivities,
        arrivalDate: arrivalDate ? new Date(arrivalDate) : undefined,
        departureDate: departureDate ? new Date(departureDate) : undefined,
      } as any;

      const existingPlan = await storage.getTravelPlanByInviteId(invite.invite.id);

      if (existingPlan) {
        const updated = await storage.updateTravelPlan(existingPlan.id, planValues);
        return res.json({ message: "Travel plans updated successfully", travelPlan: updated });
      } else {
        const created = await storage.createTravelPlan(invite.invite.id, planValues);
        return res.json({ message: "Travel plans created successfully", travelPlan: created });
      }

    } catch (error: any) {
      console.error("Error updating travel plans:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // ================================================================
  // INVITE TEMPLATES
  // ================================================================

  /**
   * POST /api/invite-templates
   * Create custom invite template
   */
  app.post("/api/invite-templates", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.claims?.sub;

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const validation = inviteTemplateSchema.omit({ userId: true }).safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: "Validation failed", details: validation.error.errors });
      }

      const { name, subject, messageBody, eventType } = validation.data;

      const template = await storage.createInviteTemplate({ userId, name, subject, messageBody, eventType });
      return res.status(201).json({ template });

    } catch (error: any) {
      console.error("Error creating template:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/invite-templates/user/:userId
   * Get user's invite templates
   */
  app.get("/api/invite-templates/user/:userId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const requestedUserId = req.params.userId;
      const authenticatedUserId = (req.user as any)?.claims?.sub;

      if (!authenticatedUserId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (requestedUserId !== authenticatedUserId) {
        return res.status(403).json({ error: "You can only access your own templates" });
      }

      const templates = await storage.getInviteTemplatesByUser(requestedUserId);
      return res.json({ templates });

    } catch (error: any) {
      console.error("Error fetching templates:", error);
      return res.status(500).json({ error: error.message });
    }
  });
}
