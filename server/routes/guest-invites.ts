import { Router, Request, Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { storage } from "../storage";
import { createRateLimiter } from "../infrastructure/rate-limiter";
import crypto from "crypto";

/**
 * GUEST INVITE SYSTEM — organizer invite management + public token-based guest RSVP.
 *
 * Activation audit (A0, Jul 24 2026):
 * - Organizer endpoints (create/list/stats keyed by experienceId; delete keyed by inviteId)
 *   verify the SESSION user owns the user_experiences row (or the invite's parent
 *   experience) — §14: acting user from the session, never from the body.
 * - Guest endpoints (/api/invites/:token/*) are deliberately PUBLIC-BY-TOKEN (guests
 *   don't have accounts): every operation is scoped to the single invite row matching
 *   the unguessable token (crypto.randomBytes(16), unique column); no userId/inviteId
 *   is ever accepted from the body. Bodies are zod-validated with length/size caps,
 *   and the public endpoints are rate-limited (unauthenticated DB writes).
 * - The token GET returns a REDACTED view of the parent experience (title/destination/
 *   date only) — never the organizer's budget/preferences/stepData.
 */

// ── Zod validation schemas (all fields capped — public/unauthenticated writers) ──

const guestSchema = z.object({
  email: z.string().email("Invalid email address").max(255),
  name: z.string().min(1, "Name is required").max(255),
  phone: z.string().max(50).optional(),
});

const createInvitesSchema = z.object({
  guests: z.array(guestSchema).min(1, "At least one guest is required").max(50),
});

const originSchema = z.object({
  originCity: z.string().min(1, "Origin city is required").max(255),
  originState: z.string().max(100).optional(),
  originCountry: z.string().max(100).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

const rsvpSchema = z.object({
  rsvpStatus: z.enum(["accepted", "declined", "maybe"]),
  numberOfGuests: z.number().int().min(1).max(50).optional(),
  dietaryRestrictions: z.array(z.string().max(100)).max(20).optional(),
  accommodationPreference: z.enum(["hotel_block", "own_booking", "with_family", "undecided"]).optional(),
  transportationNeeded: z.boolean().optional(),
  specialRequests: z.string().max(2000).optional(),
  message: z.string().max(2000).optional(),
});

const inviteTemplateSchema = z.object({
  name: z.string().min(1, "Template name is required").max(255),
  subject: z.string().max(500).optional(),
  messageBody: z.string().min(1, "Message body is required").max(10000),
  eventType: z.string().max(100).optional(),
});

// Travel-plan selections are guest-chosen option blobs (flight/hotel/transport JSON from
// the recommendations surface). They are stored on the guest's OWN travel-plan row only;
// cap sizes so an unauthenticated caller can't stuff unbounded jsonb.
const optionBlob = z.record(z.any());
const isoDate = z
  .string()
  .max(40)
  .refine((s) => !Number.isNaN(new Date(s).getTime()), "Invalid date");

const travelPlansSchema = z.object({
  selectedFlight: optionBlob.optional(),
  selectedTransport: optionBlob.optional(),
  selectedAccommodation: optionBlob.optional(),
  selectedActivities: z.array(optionBlob).max(50).optional(),
  arrivalDate: isoDate.optional(),
  departureDate: isoDate.optional(),
});

// ── Helpers ──

/** Session user id — works for both Replit-OIDC (claims.sub) and email/password (id) sessions. */
function sessionUserId(req: Request): string | undefined {
  return (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
}

/** The organizer gate: the session user must OWN the user_experiences row. */
async function verifyExperienceOwnership(experienceId: string, userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  const experience = await storage.getUserExperienceById(experienceId);
  return !!experience && experience.userId != null && experience.userId === userId;
}

/**
 * Guest-safe view of the parent experience. The raw user_experiences row carries the
 * organizer's budget, preferences, stepData, mapData — none of that belongs on a public
 * token endpoint. `destination`/`startDate` aliases match what GuestInvitePage renders.
 */
function redactExperienceForGuest(experience: any) {
  if (!experience) return null;
  return {
    id: experience.id,
    title: experience.title,
    location: experience.location,
    destination: experience.location,
    eventDate: experience.eventDate,
    startDate: experience.eventDate,
    status: experience.status,
  };
}

function generateInviteToken(): string {
  return crypto.randomBytes(16).toString("base64url");
}

async function generateUniqueToken(): Promise<string> {
  let token: string;
  let exists = true;
  while (exists) {
    token = generateInviteToken();
    exists = await storage.inviteTokenExists(token!);
  }
  return token!;
}

// Public token endpoints are unauthenticated and hit the DB (view tracking, RSVP,
// origin, travel-plan writes) — throttle per IP+token (mirrors the service-requests
// limiter). 60 req / 10 min comfortably covers the full multi-step RSVP flow.
const guestTokenLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 60,
  keyGenerator: (req) => `guest-invite:${req.ip ?? "unknown"}:${req.params?.token ?? ""}`,
});

const router = Router();

// ================================================================
// ORGANIZER ROUTES (Event Host) — session-authenticated, ownership-gated
// ================================================================

/**
 * POST /api/events/:experienceId/invites
 * Create invite links for guests. Body: { guests: [{ email, name, phone? }] }
 */
router.post("/api/events/:experienceId/invites", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { experienceId } = req.params;
    const userId = sessionUserId(req);

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
        inviteLink: `${process.env.APP_URL || "https://traveloure.com"}/invite/${uniqueToken}`,
      });
    }

    return res.status(201).json({
      message: `Created ${createdInvites.length} invites`,
      invites: createdInvites,
    });
  } catch (error: any) {
    console.error("Error creating invites:", error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/events/:experienceId/invites
 * List all invites for an event (organizer only).
 */
router.get("/api/events/:experienceId/invites", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { experienceId } = req.params;
    const userId = sessionUserId(req);

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const isOwner = await verifyExperienceOwnership(experienceId, userId);
    if (!isOwner) {
      return res.status(403).json({ error: "You don't have permission to view invites for this experience" });
    }

    const invites = await storage.getInvitesByExperience(experienceId);
    const invitesWithLinks = invites.map((invite) => ({
      ...invite,
      inviteLink: `${process.env.APP_URL || "https://traveloure.com"}/invite/${invite.uniqueToken}`,
    }));

    return res.json({ invites: invitesWithLinks });
  } catch (error: any) {
    console.error("Error fetching invites:", error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/events/:experienceId/invites/stats
 * RSVP statistics for an event (organizer only).
 */
router.get("/api/events/:experienceId/invites/stats", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { experienceId } = req.params;
    const userId = sessionUserId(req);

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
      accepted: invites.filter((i) => i.rsvpStatus === "accepted").length,
      declined: invites.filter((i) => i.rsvpStatus === "declined").length,
      pending: invites.filter((i) => i.rsvpStatus === "pending").length,
      maybe: invites.filter((i) => i.rsvpStatus === "maybe").length,
      totalGuests: invites.reduce((sum, i) => sum + (i.numberOfGuests || 0), 0),
      originCities: Array.from(new Set(invites.map((i) => i.originCity).filter(Boolean))),
      viewedCount: invites.filter((i) => i.inviteViewedAt !== null).length,
      notViewedCount: invites.filter((i) => i.inviteViewedAt === null).length,
    };

    return res.json({ stats });
  } catch (error: any) {
    console.error("Error fetching stats:", error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/invites/:inviteId
 * Delete/cancel an invite — gated on ownership of the invite's PARENT experience.
 */
router.delete("/api/invites/:inviteId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { inviteId } = req.params;
    const userId = sessionUserId(req);

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
// GUEST ROUTES (Invite Recipients) — public-by-token, rate-limited.
// Every operation is scoped to the invite row matching the token param;
// no user/invite identifier is ever read from the body.
// ================================================================

/**
 * GET /api/invites/:token
 * Invite details for the guest (public). Experience is REDACTED to guest-safe fields.
 */
router.get("/api/invites/:token", guestTokenLimiter, async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const row = await storage.getInviteByToken(token);
    if (!row) {
      return res.status(404).json({ error: "Invite not found" });
    }

    const { invite, experience } = row;

    // Track view (first-view timestamp preserved; view counter incremented)
    await storage.trackInviteView(token, invite.inviteViewedAt ?? null);

    return res.json({ invite, experience: redactExperienceForGuest(experience) });
  } catch (error: any) {
    console.error("Error fetching invite:", error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/invites/:token/origin
 * Save guest's origin city (public — guests don't need accounts).
 */
router.post("/api/invites/:token/origin", guestTokenLimiter, async (req: Request, res: Response) => {
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
 * Submit RSVP (public — guests don't need accounts).
 */
router.post("/api/invites/:token/rsvp", guestTokenLimiter, async (req: Request, res: Response) => {
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
      message,
    } = validation.data;

    const updated = await storage.updateInviteRsvp(token, {
      rsvpStatus,
      rsvpDate: new Date(),
      numberOfGuests: numberOfGuests || 1,
      dietaryRestrictions: dietaryRestrictions || [],
      accommodationPreference: accommodationPreference || "undecided",
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
 * Personalized travel recommendations for the guest. Honest placeholder until the
 * flight/hotel API integration lands (§13 — never fabricates options).
 */
router.get("/api/invites/:token/recommendations", guestTokenLimiter, async (req: Request, res: Response) => {
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
        needsOrigin: true,
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
 * Update the guest's travel selections (public — scoped to the token's own plan row).
 */
router.post("/api/invites/:token/travel-plans", guestTokenLimiter, async (req: Request, res: Response) => {
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
      departureDate,
    } = validation.data;

    const row = await storage.getInviteByToken(token);
    if (!row) {
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

    const existingPlan = await storage.getTravelPlanByInviteId(row.invite.id);

    if (existingPlan) {
      const updated = await storage.updateTravelPlan(existingPlan.id, planValues);
      return res.json({ message: "Travel plans updated successfully", travelPlan: updated });
    } else {
      const created = await storage.createTravelPlan(row.invite.id, planValues);
      return res.json({ message: "Travel plans created successfully", travelPlan: created });
    }
  } catch (error: any) {
    console.error("Error updating travel plans:", error);
    return res.status(500).json({ error: error.message });
  }
});

// ================================================================
// INVITE TEMPLATES — session-scoped (§14: userId from session, never body)
// ================================================================

/**
 * POST /api/invite-templates
 * Create a custom invite template for the session user.
 */
router.post("/api/invite-templates", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = sessionUserId(req);

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const validation = inviteTemplateSchema.safeParse(req.body);
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
 * List the session user's own invite templates (self-only).
 */
router.get("/api/invite-templates/user/:userId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const requestedUserId = req.params.userId;
    const authenticatedUserId = sessionUserId(req);

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

export default router;
