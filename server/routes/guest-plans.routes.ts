/**
 * GATE-1B — the guest plan rails (ledger `2026-11-04-gate1b-guest-plan`; architect rulings 1–7, Nov 4, 2026).
 *
 * Waitlist mode only (open mode answers 404: the sign-in path is unchanged there), and only for a caller with no
 * session (a signed-in traveler uses the ordinary plan rails; a guest rail answers 409 `signed_in`). The guest is
 * named by the `X-Guest-Session` header the client already sends on every request (queryClient.ts); the server keeps
 * only its SHA-256 (guest-plan.service.ts). A missing or malformed header is 400. Every body is a `.strict()` pick
 * (§19). Another session's plan, or none, is ONE 404.
 *
 *   POST  /api/guest-plans                 create (5 / session / day, 20 / IP / hour)
 *   GET   /api/guest-plans/current         the session's plan and its items
 *   PATCH /api/guest-plans/current         dates and party
 *   POST  /api/guest-plans/current/items   save one item (60 / session / hour)
 *   POST  /api/guest-plans/claim           on sign-in: the session's guest plans become the account's (isAuthenticated)
 *
 * Limits live in `server/config/guest-plan.config.ts`; the 429 body carries the approved sentence.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { isAuthenticated } from "../replit_integrations/auth";
import { getUserId } from "../utils/auth";
import { createRateLimiter } from "../infrastructure/rate-limiter";
import { getTravelerSignupMode } from "../services/platform-flags";
import { GUEST_PLAN_LIMITS } from "../config/guest-plan.config";
import { GUEST_PLAN_COPY } from "@shared/guest-plan-copy";
import {
  GUEST_SESSION_HEADER,
  claimGuestPlans,
  createGuestPlan,
  guestPlanCreateBody,
  guestPlanItemBody,
  guestPlanUpdateBody,
  hashGuestSession,
  logGuestPlanRetentionBootState,
  readGuestPlan,
  saveGuestPlanItem,
  updateGuestPlan,
} from "../services/guest-plan.service";

const router = Router();

// Ruling 6: the retention state is logged once, when the rails load at boot.
logGuestPlanRetentionBootState();

function sessionHash(req: Request): string | null {
  return hashGuestSession(req.get(GUEST_SESSION_HEADER));
}

const rateLimited = (_req: Request, res: Response) =>
  res.status(429).json({ code: "rate_limited", message: GUEST_PLAN_COPY.rateLimited });

// Keys carry the job's own prefix so they never share a bucket with another limiter.
const createPerSession = createRateLimiter({
  ...GUEST_PLAN_LIMITS.createPerSession,
  keyGenerator: (req) => `guest-plan:create:s:${sessionHash(req) ?? "none"}`,
  handler: rateLimited,
});
const createPerIp = createRateLimiter({
  ...GUEST_PLAN_LIMITS.createPerIp,
  keyGenerator: (req) => `guest-plan:create:ip:${req.ip || "unknown"}`,
  handler: rateLimited,
});
const savesPerSession = createRateLimiter({
  ...GUEST_PLAN_LIMITS.savesPerSession,
  keyGenerator: (req) => `guest-plan:save:s:${sessionHash(req) ?? "none"}`,
  handler: rateLimited,
});

/** Waitlist mode, no session, a well-formed guest header — checked before any limiter counts the request. */
async function guestOnly(req: Request, res: Response, next: NextFunction) {
  try {
    if ((await getTravelerSignupMode()) !== "waitlist") return res.status(404).json({ code: "not_found" });
    if (getUserId(req)) return res.status(409).json({ code: "signed_in" });
    if (!sessionHash(req)) return res.status(400).json({ code: "guest_session_required" });
    next();
  } catch {
    res.status(500).json({ code: "error" });
  }
}

router.post("/api/guest-plans", guestOnly, createPerSession, createPerIp, async (req, res) => {
  const parsed = guestPlanCreateBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ code: "invalid_body" });
  try {
    const out = await createGuestPlan(sessionHash(req)!, parsed.data);
    if (!out.ok) return res.status(409).json(out.code === "market_not_open" ? { code: out.code, market: out.market } : { code: out.code });
    res.status(201).json(out.view);
  } catch {
    res.status(500).json({ code: "error" });
  }
});

router.get("/api/guest-plans/current", guestOnly, async (req, res) => {
  try {
    const view = await readGuestPlan(sessionHash(req)!);
    if (!view) return res.status(404).json({ code: "not_found" });
    res.set("Cache-Control", "private, no-store");
    res.json(view);
  } catch {
    res.status(500).json({ code: "error" });
  }
});

router.patch("/api/guest-plans/current", guestOnly, async (req, res) => {
  const parsed = guestPlanUpdateBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ code: "invalid_body" });
  try {
    const view = await updateGuestPlan(sessionHash(req)!, parsed.data);
    if (!view) return res.status(404).json({ code: "not_found" });
    res.json(view);
  } catch {
    res.status(500).json({ code: "error" });
  }
});

router.post("/api/guest-plans/current/items", guestOnly, savesPerSession, async (req, res) => {
  const parsed = guestPlanItemBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ code: "invalid_body" });
  try {
    const out = await saveGuestPlanItem(sessionHash(req)!, parsed.data);
    if (!out.ok) return res.status(out.code === "unknown_gem" ? 400 : 404).json({ code: out.code === "unknown_gem" ? "unknown_gem" : "not_found" });
    res.status(201).json({ id: out.itemId });
  } catch {
    res.status(500).json({ code: "error" });
  }
});

// Ruling 5, following POST /api/cart/migrate: the session account (§14), the guest id in the body.
router.post("/api/guest-plans/claim", isAuthenticated, async (req, res) => {
  const userId = getUserId(req)!;
  const hash = hashGuestSession(req.body?.guestSessionId);
  if (!hash) return res.status(400).json({ code: "guest_session_required" });
  try {
    const tripIds = await claimGuestPlans(hash, userId);
    res.json({ success: true, tripIds });
  } catch {
    res.status(500).json({ code: "error" });
  }
});

export default router;
