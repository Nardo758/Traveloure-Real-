/**
 * upcoming.routes.ts — GET /api/me/upcoming: Home's time axis (ledger `2026-09-07-home-time-axis`;
 * CLAUDE.md Locked Decision 45 (8)).
 *
 * ONE endpoint, read-only, session-scoped — the `plan-activity.routes.ts` precedent. The rows are
 * built by `server/services/upcoming.service.ts` (the ONE reader); this file only parses the
 * window and names the owner.
 *
 * §14 applied to reads: the owner is `getUserId(req)` — the SESSION — and nothing else. There is
 * deliberately NO `userId` on the query string (the `check-query-userid-reads` guard's predicate);
 * `?window=` is the only input and it is a bounded integer (days), clamped server-side so a client
 * cannot force an unbounded scan.
 */
import { Router } from "express";
import { getUserId } from "../utils/auth";
import { isAuthenticated } from "../replit_integrations/auth";
import {
  UPCOMING_DEFAULT_WINDOW_DAYS,
  UPCOMING_MAX_WINDOW_DAYS,
  loadUpcomingForUser,
} from "../services/upcoming.service";

const router = Router();

/** `?window=` → a whole number of days in [1, UPCOMING_MAX_WINDOW_DAYS]; absent/invalid ⇒ default. */
export function parseWindowDays(raw: unknown): number {
  if (typeof raw !== "string" || !/^\d{1,4}$/.test(raw)) return UPCOMING_DEFAULT_WINDOW_DAYS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return UPCOMING_DEFAULT_WINDOW_DAYS;
  return Math.min(n, UPCOMING_MAX_WINDOW_DAYS);
}

router.get("/api/me/upcoming", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const windowDays = parseWindowDays(req.query.window);
    const payload = await loadUpcomingForUser(userId, windowDays);
    res.json(payload);
  } catch (err) {
    console.error("[upcoming] GET failed:", err);
    res.status(500).json({ message: "Failed to load what is coming up" });
  }
});

export default router;
