/**
 * Concierge Routes (CON-A.P3 / N5).
 *
 * Surface for the pay-per-use Concierge layer. Phase 3 ships only the intent log:
 * the durable funnel record we attribute revenue and resume-flow against. Phase 5
 * layers the router service + quote endpoint on top of this module; Phase 8 wires
 * the Full/DFY catalog through it.
 *
 * No auth required: guests can submit intent (D6 — free preview is the hook).
 * If authenticated, userId is captured automatically; otherwise the row is anonymous.
 */
import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { conciergeRequests, conciergeRequestStatuses, conciergeTiers } from "@shared/schema";

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

export default router;
