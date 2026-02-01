import { Express, Request, Response } from "express";
import { db } from "../db";
import { eq, and, desc } from "drizzle-orm";
import { 
  eventInvites, 
  guestTravelPlans, 
  inviteTemplates,
  inviteSendLog,
  InsertEventInvite,
  InsertGuestTravelPlan,
  InsertInviteTemplate
} from "../../shared/guest-invites-schema";
import { userExperiences } from "../../shared/schema";
import crypto from "crypto";

/**
 * Generate a unique URL-safe token for invite links
 */
function generateInviteToken(): string {
  return crypto.randomBytes(16).toString('base64url');
}

/**
 * Generate multiple unique tokens
 */
async function generateUniqueToken(): Promise<string> {
  let token: string;
  let exists = true;
  
  while (exists) {
    token = generateInviteToken();
    const existing = await db.select().from(eventInvites).where(eq(eventInvites.uniqueToken, token)).limit(1);
    exists = existing.length > 0;
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
  app.post("/api/events/:experienceId/invites", async (req: Request, res: Response) => {
    try {
      const { experienceId } = req.params;
      const { guests } = req.body;
      
      if (!Array.isArray(guests) || guests.length === 0) {
        return res.status(400).json({ error: "Guests array is required" });
      }
      
      // Verify user owns this experience
      const experience = await db.select()
        .from(userExperiences)
        .where(eq(userExperiences.id, experienceId))
        .limit(1);
      
      if (experience.length === 0) {
        return res.status(404).json({ error: "Experience not found" });
      }
      
      const organizerId = experience[0].userId;
      
      // Create invites in batch
      const createdInvites = [];
      for (const guest of guests) {
        const uniqueToken = await generateUniqueToken();
        
        const [invite] = await db.insert(eventInvites).values({
          experienceId,
          organizerId,
          guestEmail: guest.email,
          guestName: guest.name,
          guestPhone: guest.phone,
          uniqueToken,
          inviteSentAt: new Date(),
        }).returning();
        
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
  app.get("/api/events/:experienceId/invites", async (req: Request, res: Response) => {
    try {
      const { experienceId } = req.params;
      
      const invites = await db.select()
        .from(eventInvites)
        .where(eq(eventInvites.experienceId, experienceId))
        .orderBy(desc(eventInvites.createdAt));
      
      // Add invite links
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
  app.get("/api/events/:experienceId/invites/stats", async (req: Request, res: Response) => {
    try {
      const { experienceId } = req.params;
      
      const invites = await db.select()
        .from(eventInvites)
        .where(eq(eventInvites.experienceId, experienceId));
      
      const stats = {
        total: invites.length,
        accepted: invites.filter(i => i.rsvpStatus === 'accepted').length,
        declined: invites.filter(i => i.rsvpStatus === 'declined').length,
        pending: invites.filter(i => i.rsvpStatus === 'pending').length,
        maybe: invites.filter(i => i.rsvpStatus === 'maybe').length,
        totalGuests: invites.reduce((sum, i) => sum + (i.numberOfGuests || 0), 0),
        originCities: [...new Set(invites.map(i => i.originCity).filter(Boolean))],
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
  app.delete("/api/invites/:inviteId", async (req: Request, res: Response) => {
    try {
      const { inviteId } = req.params;
      
      await db.delete(eventInvites).where(eq(eventInvites.id, inviteId));
      
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
      
      // Get invite with experience details
      const [invite] = await db.select({
        invite: eventInvites,
        experience: userExperiences,
      })
      .from(eventInvites)
      .leftJoin(userExperiences, eq(eventInvites.experienceId, userExperiences.id))
      .where(eq(eventInvites.uniqueToken, token))
      .limit(1);
      
      if (!invite) {
        return res.status(404).json({ error: "Invite not found" });
      }
      
      // Track view
      const isFirstView = !invite.invite.inviteViewedAt;
      await db.update(eventInvites)
        .set({
          inviteViewedAt: isFirstView ? new Date() : invite.invite.inviteViewedAt,
          lastViewedAt: new Date(),
          viewCount: (invite.invite.viewCount || 0) + 1,
        })
        .where(eq(eventInvites.uniqueToken, token));
      
      return res.json({
        invite: invite.invite,
        experience: invite.experience,
      });
      
    } catch (error: any) {
      console.error("Error fetching invite:", error);
      return res.status(500).json({ error: error.message });
    }
  });
  
  /**
   * POST /api/invites/:token/origin
   * Save guest's origin city
   */
  app.post("/api/invites/:token/origin", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const { originCity, originState, originCountry, latitude, longitude } = req.body;
      
      if (!originCity) {
        return res.status(400).json({ error: "Origin city is required" });
      }
      
      // Update invite with origin
      const [updated] = await db.update(eventInvites)
        .set({
          originCity,
          originState,
          originCountry,
          originLatitude: latitude,
          originLongitude: longitude,
        })
        .where(eq(eventInvites.uniqueToken, token))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: "Invite not found" });
      }
      
      return res.json({ 
        message: "Origin city saved successfully",
        invite: updated 
      });
      
    } catch (error: any) {
      console.error("Error saving origin:", error);
      return res.status(500).json({ error: error.message });
    }
  });
  
  /**
   * POST /api/invites/:token/rsvp
   * Submit RSVP
   */
  app.post("/api/invites/:token/rsvp", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const { 
        rsvpStatus, 
        numberOfGuests, 
        dietaryRestrictions,
        accommodationPreference,
        transportationNeeded,
        specialRequests,
        message 
      } = req.body;
      
      if (!rsvpStatus || !['accepted', 'declined', 'maybe'].includes(rsvpStatus)) {
        return res.status(400).json({ error: "Valid RSVP status required (accepted, declined, maybe)" });
      }
      
      const [updated] = await db.update(eventInvites)
        .set({
          rsvpStatus,
          rsvpDate: new Date(),
          numberOfGuests: numberOfGuests || 1,
          dietaryRestrictions: dietaryRestrictions || [],
          accommodationPreference: accommodationPreference || 'undecided',
          transportationNeeded: transportationNeeded || false,
          specialRequests,
          message,
        })
        .where(eq(eventInvites.uniqueToken, token))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: "Invite not found" });
      }
      
      return res.json({ 
        message: "RSVP submitted successfully",
        invite: updated 
      });
      
    } catch (error: any) {
      console.error("Error submitting RSVP:", error);
      return res.status(500).json({ error: error.message });
    }
  });
  
  /**
   * GET /api/invites/:token/recommendations
   * Get personalized travel recommendations for guest
   * Based on origin city → event destination
   */
  app.get("/api/invites/:token/recommendations", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      
      // Get invite and experience
      const [result] = await db.select({
        invite: eventInvites,
        experience: userExperiences,
      })
      .from(eventInvites)
      .leftJoin(userExperiences, eq(eventInvites.experienceId, userExperiences.id))
      .where(eq(eventInvites.uniqueToken, token))
      .limit(1);
      
      if (!result) {
        return res.status(404).json({ error: "Invite not found" });
      }
      
      const { invite, experience } = result;
      
      if (!invite.originCity) {
        return res.status(400).json({ 
          error: "Origin city not set. Please set your city of origin first.",
          needsOrigin: true 
        });
      }
      
      // Get or create travel plans
      let [travelPlan] = await db.select()
        .from(guestTravelPlans)
        .where(eq(guestTravelPlans.inviteId, invite.id))
        .limit(1);
      
      if (!travelPlan) {
        [travelPlan] = await db.insert(guestTravelPlans)
          .values({ inviteId: invite.id })
          .returning();
      }
      
      // TODO: Integrate SERP APIs here
      // For now, return structure with placeholders
      const recommendations = {
        origin: {
          city: invite.originCity,
          state: invite.originState,
          country: invite.originCountry,
        },
        destination: {
          city: experience?.destination,
          eventDate: experience?.startDate,
        },
        flights: travelPlan.flightOptions || [],
        groundTransport: travelPlan.transportOptions || [],
        accommodations: travelPlan.accommodationOptions || [],
        activities: travelPlan.activityRecommendations || [],
        estimatedCost: travelPlan.estimatedTotalCost,
        needsApiIntegration: true, // TODO: Remove when SERP APIs integrated
      };
      
      return res.json({ 
        recommendations,
        travelPlan 
      });
      
    } catch (error: any) {
      console.error("Error fetching recommendations:", error);
      return res.status(500).json({ error: error.message });
    }
  });
  
  /**
   * POST /api/invites/:token/travel-plans
   * Update guest's travel selections
   */
  app.post("/api/invites/:token/travel-plans", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const { 
        selectedFlight,
        selectedTransport,
        selectedAccommodation,
        selectedActivities,
        arrivalDate,
        departureDate
      } = req.body;
      
      // Get invite
      const [invite] = await db.select()
        .from(eventInvites)
        .where(eq(eventInvites.uniqueToken, token))
        .limit(1);
      
      if (!invite) {
        return res.status(404).json({ error: "Invite not found" });
      }
      
      // Update or create travel plan
      const [travelPlan] = await db.select()
        .from(guestTravelPlans)
        .where(eq(guestTravelPlans.inviteId, invite.id))
        .limit(1);
      
      if (travelPlan) {
        const [updated] = await db.update(guestTravelPlans)
          .set({
            selectedFlight,
            selectedTransport,
            selectedAccommodation,
            selectedActivities,
            arrivalDate: arrivalDate ? new Date(arrivalDate) : undefined,
            departureDate: departureDate ? new Date(departureDate) : undefined,
          })
          .where(eq(guestTravelPlans.id, travelPlan.id))
          .returning();
        
        return res.json({ 
          message: "Travel plans updated successfully",
          travelPlan: updated 
        });
      } else {
        const [created] = await db.insert(guestTravelPlans)
          .values({
            inviteId: invite.id,
            selectedFlight,
            selectedTransport,
            selectedAccommodation,
            selectedActivities,
            arrivalDate: arrivalDate ? new Date(arrivalDate) : undefined,
            departureDate: departureDate ? new Date(departureDate) : undefined,
          })
          .returning();
        
        return res.json({ 
          message: "Travel plans created successfully",
          travelPlan: created 
        });
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
  app.post("/api/invite-templates", async (req: Request, res: Response) => {
    try {
      const { userId, name, subject, messageBody, eventType } = req.body;
      
      if (!userId || !name || !messageBody) {
        return res.status(400).json({ error: "userId, name, and messageBody are required" });
      }
      
      const [template] = await db.insert(inviteTemplates)
        .values({
          userId,
          name,
          subject,
          messageBody,
          eventType,
        })
        .returning();
      
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
  app.get("/api/invite-templates/user/:userId", async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      
      const templates = await db.select()
        .from(inviteTemplates)
        .where(eq(inviteTemplates.userId, userId))
        .orderBy(desc(inviteTemplates.createdAt));
      
      return res.json({ templates });
      
    } catch (error: any) {
      console.error("Error fetching templates:", error);
      return res.status(500).json({ error: error.message });
    }
  });
}
