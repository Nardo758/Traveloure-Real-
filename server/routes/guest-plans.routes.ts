/**
 * GATE-1B — the guest plan rails (ledger `2026-11-04-gate1b-guest-plan`; architect rulings 1–7, Nov 4, 2026).
 *
 * Waitlist mode only (open mode answers 404: the sign-in path is unchanged there), and only for a caller with no
 * session (a signed-in traveler uses the ordinary plan rails; a guest rail answers 409 `signed_in`). A-10 (ledger
 * `2026-11-05-lane6-guest-cookie`): the guest is named by an httpOnly cookie the server mints on the first guest
 * request; the `X-Guest-Session` header (queryClient.ts) names the guest only when the client says its cookies are off.
 * The server keeps only the id's SHA-256 (guest-plan.service.ts). Every body is a `.strict()` pick (§19). Another
 * session's plan, or none, is ONE 404.
 *
 *   POST  /api/guest-plans                 create (5 / session / day, 20 / IP / hour)
 *   GET   /api/guest-plans/current         the session's plan and its items
 *   PATCH /api/guest-plans/current         dates and party
 *   POST  /api/guest-plans/current/items   save one item (60 / session / hour)
 *   DELETE /api/guest-plans/current/items/:id      Undo (cut-list #1 slice C) — the session's own item only
 *   PATCH  /api/guest-plans/current/items/:id      Change day — `{ dayNumber }`, within the plan's days
 *   POST  /api/guest-plans/claim           on sign-in: the session's guest plans become the account's (isAuthenticated)
 *
 * Limits live in `server/config/guest-plan.config.ts`; the 429 body carries the approved sentence.
 */
import { GUEST_PRESENT_COOKIE } from "@shared/guest-presence";
import { parsePlanItemRef } from "@shared/plan-item-ref";
import { tripDateRangeRefusal } from "@shared/trip-date-range";
import { logger } from "../infrastructure/logger";
import { Router, type Request, type Response, type NextFunction } from "express";
import { isAuthenticated } from "../replit_integrations/auth";
import { getUserId } from "../utils/auth";
import { createRateLimiter } from "../infrastructure/rate-limiter";
import { getTravelerSignupMode } from "../services/platform-flags";
import { GUEST_PLAN_LIMITS, guestSessionCookieMaxAgeMs } from "../config/guest-plan.config";
import { GUEST_PLAN_COPY } from "@shared/guest-plan-copy";
import {
  GUEST_COOKIES_OFF_HEADER,
  GUEST_SESSION_COOKIE,
  GUEST_SESSION_HEADER,
  readCookie,
  resolveGuestSessionId,
  claimGuestPlans,
  projectClaimedBookableItems,
  createGuestPlan,
  guestPlanCreateBody,
  guestPlanItemBody,
  guestPlanUpdateBody,
  guestPlanItemMoveBody,
  deleteGuestPlanItem,
  moveGuestPlanItem,
  hashGuestSession,
  logGuestPlanRetentionBootState,
  readGuestPlan,
  saveGuestPlanItem,
  savedRefKeysForUser,
  savedRefsForUser,
  type GuestSaveTimings,
  updateGuestPlan,
} from "../services/guest-plan.service";

const router = Router();

// Ruling 6: the retention state is logged once, when the rails load at boot.
logGuestPlanRetentionBootState();

/**
 * A-10 (ledger `2026-11-05-lane6-guest-cookie`): the guest is named by the httpOnly cookie, else — only when the client
 * says its cookies are off — by the `X-Guest-Session` id. `guestOnly` resolves it once (minting a cookie for a new
 * guest) and every later step reads the same answer.
 */
function cookiesOff(req: Request): boolean {
  return (req.get(GUEST_COOKIES_OFF_HEADER) ?? "").trim().toLowerCase() === "off";
}

function sessionHash(req: Request): string | null {
  return ((req as any).guestSessionHash as string | undefined) ?? null;
}

/** Sets (or refreshes — a rolling lifetime) the guest cookie. httpOnly; never read by the page. */
function setGuestCookie(res: Response, id: string) {
  const secure = process.env.NODE_ENV === "production" && process.env.SESSION_COOKIE_INSECURE !== "1";
  res.cookie(GUEST_SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/api/guest-plans",
    maxAge: guestSessionCookieMaxAgeMs(),
  });
  // PLAN-2 C4: the companion the page CAN read — no id, only that a guest exists — so a sign-in with no guest sends no
  // claim (shared/guest-presence.ts). Same lifetime as the guest cookie.
  res.cookie(GUEST_PRESENT_COOKIE, "1", { httpOnly: false, sameSite: "lax", secure, path: "/", maxAge: guestSessionCookieMaxAgeMs() });
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
    const who = resolveGuestSessionId({
      cookie: readCookie(req.headers.cookie, GUEST_SESSION_COOKIE),
      header: req.get(GUEST_SESSION_HEADER),
      cookiesOff: cookiesOff(req),
    });
    const hash = who ? hashGuestSession(who.id) : null;
    if (!who || !hash) return res.status(400).json({ code: "guest_session_required" });
    (req as any).guestSessionHash = hash;
    if (who.source !== "header") setGuestCookie(res, who.id);
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
    // A-5: get-or-create — 201 for a new plan, 200 for the session's plan as it stands.
    res.status(out.created ? 201 : 200).json(out.view);
  } catch {
    res.status(500).json({ code: "error" });
  }
});

router.get("/api/guest-plans/current", guestOnly, async (req, res) => {
  try {
    const view = await readGuestPlan(sessionHash(req)!);
    res.set("Cache-Control", "private, no-store");
    // R3-1: "no plan yet" is an answer, not an error — 200 with null. A plan is made only by the get-or-create POST.
    res.json(view ?? null);
  } catch (err: any) {
    logger.error({ route: "GET /api/guest-plans/current", code: err?.code, err: err?.message }, "guest plan read failed");
    res.status(500).json({ code: "error" });
  }
});

router.patch("/api/guest-plans/current", guestOnly, async (req, res) => {
  const parsed = guestPlanUpdateBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ code: "invalid_body" });
  try {
    const started = Date.now();
    // R4-8: the guest window may never be saved reversed either — the SAME rule, and the same 400 code,
    // as the signed-in rail (PATCH /api/trips/:id). The service's own body schema already refuses a
    // reversed PAIR (guest-plan.service.ts), but it answers the generic "invalid_body"; this answers
    // end_before_start, and it also judges a body that moves only ONE end against the end already stored.
    // Same-day stays valid. Line comments only here, like the rest of this file.
    const stored = await readGuestPlan(sessionHash(req)!);
    const nextStart = parsed.data.startDate ?? stored?.plan?.startDate ?? null;
    const nextEnd = parsed.data.endDate ?? stored?.plan?.endDate ?? null;
    const refusal = tripDateRangeRefusal(nextStart, nextEnd);
    if (refusal) return res.status(400).json(refusal);
    const view = await updateGuestPlan(sessionHash(req)!, parsed.data);
    // R3-1: the server's own time for the save, so a slow "Saving…" says whether the wait was here.
    res.set("Server-Timing", `update;dur=${Date.now() - started}`);
    if (!view) return res.status(404).json({ code: "not_found" });
    res.json(view);
  } catch (err: any) {
    logger.error({ route: "PATCH /api/guest-plans/current", code: err?.code, err: err?.message }, "guest plan update failed");
    res.status(500).json({ code: "error" });
  }
});

router.post("/api/guest-plans/current/items", guestOnly, savesPerSession, async (req, res) => {
  // CAP-2: the body is a PlanItemRef; an unknown kind and a malformed envelope get their own reason codes.
  const ref = parsePlanItemRef(req.body ?? {});
  if (!ref.ok) return res.status(400).json({ code: ref.reason });
  const parsed = guestPlanItemBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ code: "unplaceable" });
  try {
    const timings: GuestSaveTimings = { plan: 0, resolve: 0, write: 0, read: 0 };
    const out = await saveGuestPlanItem(sessionHash(req)!, parsed.data, timings);
    // R3-1: where the save spent its time (plan read, source resolve, write, read-back), in ms.
    res.set("Server-Timing", Object.entries(timings).map(([k, v]) => `${k};dur=${v}`).join(", "));
    // A-1 / CAP-2: a save the server cannot place is a 400 carrying its reason — never a saved title with nothing
    // behind it. No plan yet is a 404.
    if (!out.ok) return out.code === "no_plan" ? res.status(404).json({ code: "not_found" }) : res.status(400).json({ code: out.code, ...(out.eventDate ? { eventDate: out.eventDate } : {}) });
    // R3-1 (round 3 ruling): a committed write answers 200 with its item — a new one and one the plan already held
    // (A-11) alike; `existing` says which.
    res.status(200).json({ id: out.itemId, located: out.located, existing: out.existing, item: out.item });
  } catch (err: any) {
    // R3-1: name the failure in the log (it was swallowed before, so a 500 said nothing about its cause).
    logger.error({ route: "POST /api/guest-plans/current/items", code: err?.code, err: err?.message, stack: err?.stack }, "guest save failed");
    res.status(500).json({ code: "error" });
  }
});

/**
 * Cut-list #1 slice C — the guest's Undo and Change day. The item is found only on the caller's OWN current plan, so
 * another session's item, a claimed plan's item and no item at all are the same 404 (LD 40). Shares the save limiter:
 * an undo/move is a write on the same plan.
 */
router.delete("/api/guest-plans/current/items/:id", guestOnly, savesPerSession, async (req, res) => {
  try {
    const out = await deleteGuestPlanItem(sessionHash(req)!, String(req.params.id));
    if (!out.ok) return res.status(404).json({ code: "not_found" });
    res.json(out.view);
  } catch (err: any) {
    logger.error({ route: "DELETE /api/guest-plans/current/items/:id", code: err?.code, err: err?.message }, "guest item delete failed");
    res.status(500).json({ code: "error" });
  }
});

router.patch("/api/guest-plans/current/items/:id", guestOnly, savesPerSession, async (req, res) => {
  const parsed = guestPlanItemMoveBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ code: "invalid_body" });
  try {
    const out = await moveGuestPlanItem(sessionHash(req)!, String(req.params.id), parsed.data.dayNumber);
    if (!out.ok) return out.code === "not_found" ? res.status(404).json({ code: "not_found" }) : res.status(400).json({ code: out.code });
    res.json(out.view);
  } catch (err: any) {
    logger.error({ route: "PATCH /api/guest-plans/current/items/:id", code: err?.code, err: err?.message }, "guest item move failed");
    res.status(500).json({ code: "error" });
  }
});

// Ruling 5, following POST /api/cart/migrate: the session account (§14), the guest id in the body.
/** R4b-3: the signed-in rail's saved keys — "Saved to plan" reads the plan's own items (survives a reload). */
router.get("/api/plans/saved-refs", isAuthenticated, async (req, res) => {
  try {
    const refs = await savedRefsForUser(getUserId(req)!);
    // E2 (Leon, Nov 13 2026): `keys` is unchanged for every existing reader; `refs` adds the plan and the
    // day each key sits on. Additive payload, same route, same cache header.
    res.set("Cache-Control", "private, no-store");
    res.json({ keys: refs.map((r) => r.key), refs });
  } catch (err: any) {
    logger.error({ route: "GET /api/plans/saved-refs", code: err?.code, err: err?.message }, "saved refs read failed");
    res.status(500).json({ code: "error" });
  }
});

router.post("/api/guest-plans/claim", isAuthenticated, async (req, res) => {
  const userId = getUserId(req)!;
  // A-10: the cookie's guest, else (cookies off) the id the client names; a claim never mints one.
  const who = resolveGuestSessionId(
    {
      cookie: readCookie(req.headers.cookie, GUEST_SESSION_COOKIE),
      header: req.body?.guestSessionId ?? req.get(GUEST_SESSION_HEADER),
      cookiesOff: cookiesOff(req),
    },
    { mintNew: false },
  );
  const hash = who ? hashGuestSession(who.id) : null;
  if (!hash) return res.status(400).json({ code: "guest_session_required" });
  try {
    const tripIds = await claimGuestPlans(hash, userId);
    // Cut-list #1 slice C: after the claim commits, bookable items become cart lines. Never fails the claim.
    const { carted } = await projectClaimedBookableItems(tripIds, userId).catch(() => ({ carted: [] as string[] }));
    res.json({ success: true, tripIds, cartedItemIds: carted });
  } catch {
    res.status(500).json({ code: "error" });
  }
});

export default router;
