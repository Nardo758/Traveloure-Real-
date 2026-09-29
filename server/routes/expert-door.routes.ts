/**
 * THE EXPERT DOOR — the rails (ledger `2026-09-29-expert-door`).
 *
 *   GET /api/trips/:tripId/expert-help                 the "How much help do you want?" card: a band per level
 *   GET /api/trips/:tripId/expert-help/picker?level=   the gated experts who offer that level in the plan's market
 *
 * Owner or delegate only; anything else is ONE 404 (LD 40). Every figure is the server's (§E4). The
 * request itself is the EXISTING storefront rail (`POST /api/expert-booking-requests`), and the door's
 * funnel rows ride the ONE client event rail (`POST /api/trips/:tripId/slip-events`).
 */
import { Router } from "express";
import { isAuthenticated } from "../replit_integrations/auth";
import { getUserId } from "../utils/auth";
import { isHelpLevel } from "@shared/expert-door";
import { ExpertDoorError, expertHelpOverview, expertPicker } from "../services/expert-door.service";

const router = Router();

function fail(res: any, err: unknown, what: string) {
  if (err instanceof ExpertDoorError) return res.status(err.status).json({ code: err.code, message: err.message });
  console.error(`[expert-door] ${what} failed:`, err);
  return res.status(500).json({ message: "Something went wrong finding a local expert" });
}

router.get("/api/trips/:tripId/expert-help", isAuthenticated, async (req: any, res) => {
  try {
    res.json(await expertHelpOverview(req.params.tripId, getUserId(req)));
  } catch (err) {
    fail(res, err, "overview");
  }
});

router.get("/api/trips/:tripId/expert-help/picker", isAuthenticated, async (req: any, res) => {
  const level = req.query.level;
  if (!isHelpLevel(level)) return res.status(400).json({ code: "invalid_level", message: "That isn't a level of help this plan offers" });
  try {
    res.json(await expertPicker(req.params.tripId, getUserId(req), level));
  } catch (err) {
    fail(res, err, "picker");
  }
});

export default router;
