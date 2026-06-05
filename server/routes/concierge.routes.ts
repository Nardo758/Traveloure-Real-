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
import { eq } from "drizzle-orm";
import { db } from "../db";
import { conciergeRequests, conciergeRequestStatuses, conciergeTiers } from "@shared/schema";
import { routeConcierge } from "../services/concierge-router.service";

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
    res.json(row);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "validation_failed", details: err.errors });
    }
    console.error("[concierge/requests/:id PATCH] error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
