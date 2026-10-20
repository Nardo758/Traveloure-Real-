/**
 * THE EXPERT DOOR — the rails (ledger `2026-09-29-expert-door`).
 *
 *   GET /api/trips/:tripId/expert-help                 the "How much help do you want?" card: a band per level
 *   GET /api/trips/:tripId/expert-help/picker?level=   the gated experts who offer that level in the plan's market
 *   GET /api/expert-availability?city=                 SH-1 item 11: may a page offer "ask an expert" here? (public)
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
import { anyMarketHasExperts, expertAvailabilityForMarket } from "../services/expert-hook.service";
import { resolveMarketSlug } from "../services/trend-engine/operating-markets";

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

/**
 * SH-1 item 11 (rulings Q11.1–Q11.3). Every expert call-to-action asks this before it draws. With a city: the city's
 * market answers through the ONE rule the in-plan hook uses (`expertAvailabilityForMarket`). With no city: yes when any
 * switched-on market answers yes. An unknown city or any failure answers no — a hidden button is the safe failure.
 * The answer is a bare boolean: no expert, no count, no user id. Cached for a minute per market.
 * (Not under /api/experts/, where `/api/experts/:id` would answer first.)
 */
const AVAILABILITY_TTL_MS = 60_000;
const availabilityCache = new Map<string, { at: number; available: boolean }>();

export function resetExpertAvailabilityCache() {
  availabilityCache.clear();
}

router.get("/api/expert-availability", async (req, res) => {
  const raw = typeof req.query.city === "string" ? req.query.city.trim().slice(0, 120) : "";
  const key = raw ? resolveMarketSlug(raw) : "*";
  if (!key) return res.json({ available: false });
  const hit = availabilityCache.get(key);
  if (hit && Date.now() - hit.at < AVAILABILITY_TTL_MS) return res.json({ available: hit.available });
  let available = false;
  try {
    available = key === "*" ? await anyMarketHasExperts() : (await expertAvailabilityForMarket(key)).canAsk;
  } catch (err: any) {
    console.warn(`[expert-availability] ${key}: answered no: ${String(err?.message ?? err).slice(0, 200)}`);
    return res.json({ available: false });
  }
  availabilityCache.set(key, { at: Date.now(), available });
  res.json({ available });
});

export default router;
