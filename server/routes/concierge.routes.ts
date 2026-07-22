/**
 * Concierge Routes (CON-A.P3 + P5).
 *
 * Surface for the pay-per-use Concierge layer.
 *   P3 ships POST /api/concierge/requests — the durable intent log.
 *   P5 ships POST /api/concierge/quote (router service + persisted quote) and
 *     PATCH /api/concierge/requests/:id (chosenTier/status updates).
 *   P8 will wire the Full/DFY catalog through the router service.
 *
 * No auth required: guests can submit intent and request quotes (D6 — free
 * preview is the hook). userId is captured from session if present.
 */
import { Router } from "express";
import { z } from "zod";
import { and, eq, ilike, desc, sql } from "drizzle-orm";
import { db } from "../db";
import { conciergeRequests, conciergeRequestStatuses, conciergeTiers, eventPackages, coordinationStates } from "@shared/schema";
import { routeConcierge } from "../services/concierge-router.service";
import { storage } from "../storage";

const router = Router();

const createRequestSchema = z.object({
  intent: z.string().min(1).max(2000),
  eventType: z.string().max(50).optional(),
  tripId: z.string().optional(),
  cartId: z.string().optional(),
  chosenTier: z.enum(conciergeTiers).optional(),
  status: z.enum(conciergeRequestStatuses).optional(),
});

router.post("/api/concierge/requests", async (req, res) => {
  try {
    const body = createRequestSchema.parse(req.body);
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id ?? null;

    const [row] = await db
      .insert(conciergeRequests)
      .values({
        userId,
        intent: body.intent,
        eventType: body.eventType,
        tripId: body.tripId,
        cartId: body.cartId,
        chosenTier: body.chosenTier,
        status: body.status ?? "draft",
      })
      .returning();

    res.status(201).json(row);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "validation_failed", details: err.errors });
    }
    console.error("[concierge/requests] error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/concierge/quote (CON-A.P5 / N2) ─────────────────────────────
// Resolves an intent into priced delivery options (AI/Expert/Full) and persists
// a concierge_requests row with status='quoted' so the funnel is captured even
// if the user never picks a tier.

const quoteSchema = z.object({
  intent: z.string().min(1).max(2000),
  destination: z.string().max(255).optional(),
  eventType: z.string().max(50).optional(),
  tripId: z.string().optional(),
  cartId: z.string().optional(),
});

router.post("/api/concierge/quote", async (req, res) => {
  try {
    const body = quoteSchema.parse(req.body);
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id ?? null;

    const route = await routeConcierge({
      intent: body.intent,
      destination: body.destination,
      eventType: body.eventType,
      tripId: body.tripId,
      cartId: body.cartId,
    });

    const [row] = await db
      .insert(conciergeRequests)
      .values({
        userId,
        intent: body.intent,
        eventType: body.eventType,
        tripId: body.tripId,
        cartId: body.cartId,
        status: "quoted",
      })
      .returning({ id: conciergeRequests.id });

    res.json({ requestId: row.id, route });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "validation_failed", details: err.errors });
    }
    console.error("[concierge/quote] error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/concierge/requests/:id (CON-A.P5) ──────────────────────────
// Updates chosenTier (and optionally status) on an existing quote. Picking a
// tier auto-bumps status to 'selected' unless an explicit status is provided.

const updateRequestSchema = z.object({
  chosenTier: z.enum(conciergeTiers).optional(),
  status: z.enum(conciergeRequestStatuses).optional(),
});

router.patch("/api/concierge/requests/:id", async (req, res) => {
  try {
    const body = updateRequestSchema.parse(req.body);
    if (body.chosenTier === undefined && body.status === undefined) {
      return res.status(400).json({ error: "no_changes", message: "Provide chosenTier or status." });
    }

    const updates: Partial<typeof conciergeRequests.$inferInsert> = {};
    if (body.chosenTier !== undefined) updates.chosenTier = body.chosenTier;
    if (body.status !== undefined) {
      updates.status = body.status;
    } else if (body.chosenTier !== undefined) {
      updates.status = "selected";
    }

    const [row] = await db
      .update(conciergeRequests)
      .set(updates)
      .where(eq(conciergeRequests.id, req.params.id))
      .returning();

    if (!row) {
      return res.status(404).json({ error: "not_found" });
    }

    // Fulfillment wire (§7): a signed-in traveler picking the Full / done-for-you tier
    // spins up a real coordination engagement so "we'll follow up" becomes a trackable
    // event-coordination state the fee engine + coordinator workspace already understand.
    // Guests stay request-only (coordination_states.userId is NOT NULL). Idempotent —
    // one engagement per concierge request (dedup on userRequest.conciergeRequestId).
    let coordinationId: string | undefined;
    if (row.chosenTier === "full" && row.userId) {
      const [existing] = await db
        .select({ id: coordinationStates.id })
        .from(coordinationStates)
        .where(sql`${coordinationStates.userRequest}->>'conciergeRequestId' = ${row.id}`)
        .limit(1);
      if (existing) {
        coordinationId = existing.id;
      } else {
        const state = await storage.createCoordinationState({
          userId: row.userId,
          experienceType: row.eventType || "event",
          status: "intake",
          path: "concierge",
          userRequest: { conciergeRequestId: row.id, intent: row.intent, source: "concierge_full" },
        } as any);
        coordinationId = state.id;
      }
    }

    res.json({ ...row, coordinationId });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "validation_failed", details: err.errors });
    }
    console.error("[concierge/requests/:id PATCH] error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/concierge/requests/:id/claim ─────────────────────────────────
// Links an orphaned (guest) concierge request to the authenticated user and
// spins up a coordination_states row — the same path as the authenticated
// Full-pick flow in PATCH above. Auth required; idempotent.

router.post("/api/concierge/requests/:id/claim", async (req, res) => {
  try {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id ?? null;
    if (!userId) {
      return res.status(401).json({ error: "unauthenticated", message: "Sign in to claim a concierge request." });
    }

    const [row] = await db
      .select()
      .from(conciergeRequests)
      .where(eq(conciergeRequests.id, req.params.id))
      .limit(1);

    if (!row) {
      return res.status(404).json({ error: "not_found" });
    }

    // If already owned by a different user, reject.
    if (row.userId && row.userId !== userId) {
      return res.status(403).json({ error: "forbidden", message: "This request belongs to another account." });
    }

    // Stamp the userId if it was null (guest request).
    let claimed = row;
    if (!row.userId) {
      const [updated] = await db
        .update(conciergeRequests)
        .set({ userId, status: "selected", chosenTier: row.chosenTier ?? "full" })
        .where(eq(conciergeRequests.id, row.id))
        .returning();
      claimed = updated;
    }

    // Create or reuse a coordination_states row (idempotent, same as PATCH full).
    const [existing] = await db
      .select({ id: coordinationStates.id })
      .from(coordinationStates)
      .where(sql`${coordinationStates.userRequest}->>'conciergeRequestId' = ${claimed.id}`)
      .limit(1);

    let coordinationId: string;
    if (existing) {
      coordinationId = existing.id;
    } else {
      const state = await storage.createCoordinationState({
        userId,
        experienceType: claimed.eventType || "event",
        status: "intake",
        path: "concierge",
        userRequest: { conciergeRequestId: claimed.id, intent: claimed.intent, source: "concierge_guest_claim" },
      } as any);
      coordinationId = state.id;
    }

    res.json({ ...claimed, coordinationId });
  } catch (err: any) {
    console.error("[concierge/requests/:id/claim] error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/concierge/event-packages (CON-A.P8 / N6) ─────────────────────
// Public read of the Full/DFY catalog. Optional eventType + market filters.
// status defaults to 'active' so the surface only sees live packages.

router.get("/api/concierge/event-packages", async (req, res) => {
  try {
    const { eventType, market } = req.query as { eventType?: string; market?: string };
    const conditions = [eq(eventPackages.status, "active")];
    if (eventType) conditions.push(eq(eventPackages.eventType, eventType));
    if (market) conditions.push(ilike(eventPackages.market, `%${market}%`));
    const rows = await db
      .select()
      .from(eventPackages)
      .where(and(...conditions))
      .orderBy(desc(eventPackages.createdAt))
      .limit(50);
    res.json(rows);
  } catch (err: any) {
    console.error("[concierge/event-packages GET] error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
