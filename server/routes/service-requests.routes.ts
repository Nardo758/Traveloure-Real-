import { Router } from "express";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { serviceRequests, adminNotifications, insertServiceRequestSchema } from "@shared/schema";
import { isAuthenticated } from "../replit_integrations/auth";
import { createRateLimiter } from "../infrastructure/rate-limiter";

/**
 * Traveler-submitted service requests — the "request a service that doesn't exist
 * yet" surface. A traveler describes what they're looking for in a city; the request
 * lands in the admin queue (admin_notifications + a dedicated list) so admins can
 * triage supply gaps and mark a request fulfilled once a matching service exists.
 *
 * Distinct from the machine-generated service_demand_signals / aggregate demand_signals
 * (those are analytics, not per-traveler requests). travelerId is derived from the
 * session (§14) — never from the body. Admin endpoints sit under /api/admin and inherit
 * the blanket adminApiGuard (§2). New table (migration 123); no money path.
 */
const router = Router();

function sessionUserId(req: any): string | undefined {
  return (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
}

// Per-user throttle: each POST also inserts an admin_notifications row, so cap how
// fast an authenticated user can enqueue requests (prevents flooding the admin queue).
// Keyed by the session user (set by isAuthenticated, which runs first), IP as fallback.
const serviceRequestLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  maxRequests: 5,
  keyGenerator: (req) => `service-request:${sessionUserId(req) ?? req.ip ?? "unknown"}`,
});

// POST /api/service-requests — traveler submits a request.
router.post("/api/service-requests", isAuthenticated, serviceRequestLimiter, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const input = insertServiceRequestSchema.parse(req.body);
    const [created] = await db
      .insert(serviceRequests)
      .values({
        travelerId: userId, // server-derived, never from body (§14)
        city: input.city,
        country: input.country ?? null,
        serviceType: input.serviceType ?? null,
        description: input.description,
        budget: input.budget ?? null,
        // status defaults to 'open'
      })
      .returning();

    // Non-fatal: surface in the admin queue where admins already look.
    try {
      await db.insert(adminNotifications).values({
        type: "service_request",
        message: `New service request in ${created.city}: ${created.description.slice(0, 140)}`,
        destination: created.city,
        isRead: false,
        metadata: { serviceRequestId: created.id, travelerId: userId },
      });
    } catch (notifErr: any) {
      console.warn("[service-requests] admin_notifications insert failed (non-fatal):", notifErr?.message);
    }

    res.status(201).json(created);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid input" });
    }
    console.error("Error creating service request:", err);
    res.status(500).json({ message: "Failed to submit request" });
  }
});

// GET /api/service-requests/mine — the traveler's own requests.
router.get("/api/service-requests/mine", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Authentication required" });
    const rows = await db
      .select()
      .from(serviceRequests)
      .where(eq(serviceRequests.travelerId, userId))
      .orderBy(desc(serviceRequests.createdAt));
    res.json(rows);
  } catch (err) {
    console.error("Error listing own service requests:", err);
    res.status(500).json({ message: "Failed to load requests" });
  }
});

// GET /api/admin/service-requests?status=open — admin triage queue (adminApiGuard).
router.get("/api/admin/service-requests", async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const valid = ["open", "fulfilled", "closed"];
    const rows = await db
      .select()
      .from(serviceRequests)
      .where(status && valid.includes(status) ? eq(serviceRequests.status, status) : undefined)
      .orderBy(desc(serviceRequests.createdAt))
      .limit(200);
    res.json(rows);
  } catch (err) {
    console.error("Error listing service requests:", err);
    res.status(500).json({ message: "Failed to load requests" });
  }
});

// PATCH /api/admin/service-requests/:id — admin updates status / notes (adminApiGuard).
router.patch("/api/admin/service-requests/:id", async (req, res) => {
  try {
    const schema = z.object({
      status: z.enum(["open", "fulfilled", "closed"]).optional(),
      adminNotes: z.string().max(2000).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input" });

    const patch: Record<string, any> = { updatedAt: new Date() };
    if (parsed.data.status !== undefined) patch.status = parsed.data.status;
    if (parsed.data.adminNotes !== undefined) patch.adminNotes = parsed.data.adminNotes;

    const [updated] = await db
      .update(serviceRequests)
      .set(patch)
      .where(eq(serviceRequests.id, req.params.id))
      .returning();
    if (!updated) return res.status(404).json({ message: "Request not found" });
    res.json(updated);
  } catch (err) {
    console.error("Error updating service request:", err);
    res.status(500).json({ message: "Failed to update request" });
  }
});

export default router;
