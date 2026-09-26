/**
 * SELLER BOOKING-MODE PROMPT — routes (ledger `2026-09-25-seller-booking-mode-prompt`).
 *
 *   GET  /api/me/listings/booking-mode-status   — the SESSION owner's live listings + whether each
 *                                                 booking mode was chosen (§14: owner from the session,
 *                                                 never the query string).
 *   POST /api/me/listings/booking-mode/decide   — `.strict()` `{ mode: "instant" | "request" }` (§19);
 *                                                 sets ONLY the owner's undecided, non-quote listings,
 *                                                 through the listing PATCH rail's own storage writer.
 *   GET  /api/admin/listings/booking-mode-summary — counts for the decision-maker (when is #1101 safe
 *                                                 to merge?). Under the §2 blanket admin guard, which
 *                                                 is registered before this router is mounted.
 *
 * Per-listing choices keep using `PATCH /api/provider/services/:id` `{ bookingMode }` — a SAFE edit
 * under Locked Decision 23 — so this file adds no per-listing writer.
 */
import { Router } from "express";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { getUserId } from "../utils/auth";
import {
  decideUndecidedBookingModes,
  loadBookingModeSummary,
  loadOwnerBookingModeStatus,
} from "../services/booking-mode-status.service";

const router = Router();

const decideBody = z.object({ mode: z.enum(["instant", "request"]) }).strict();

router.get("/api/me/listings/booking-mode-status", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    res.json(await loadOwnerBookingModeStatus(userId));
  } catch (err) {
    console.error("[booking-mode-status] read failed:", err);
    res.status(500).json({ message: "Failed to load booking modes" });
  }
});

router.post("/api/me/listings/booking-mode/decide", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const parsed = decideBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Choose instant or request.", errors: parsed.error.errors });
    }
    const { updatedIds } = await decideUndecidedBookingModes(userId, parsed.data.mode);
    const status = await loadOwnerBookingModeStatus(userId);
    res.json({ updatedCount: updatedIds.length, updatedIds, ...status });
  } catch (err) {
    console.error("[booking-mode-status] bulk decide failed:", err);
    res.status(500).json({ message: "Failed to save booking modes" });
  }
});

router.get("/api/admin/listings/booking-mode-summary", async (_req, res) => {
  try {
    res.json(await loadBookingModeSummary());
  } catch (err) {
    console.error("[booking-mode-status] admin summary failed:", err);
    res.status(500).json({ message: "Failed to load booking-mode summary" });
  }
});

export default router;
