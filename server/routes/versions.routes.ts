/**
 * versions.routes.ts — mount: app.use(versionsRoutes) (surface step 5; ledger
 * `2026-10-04-surface-step5-map-versions`).
 *
 *   GET  /api/trips/:tripId/versions             the board: latest run's A/B/C, per-day diffs,
 *                                                badges, anchors, re-time allowance (read gate)
 *   POST /api/trips/:tripId/versions/apply-days  { days: [{ day, variantId }] } — write gate
 *   POST /api/trips/:tripId/days/:day/retime     { order: itemIds, swapIn?: { variantItemId } } —
 *                                                write gate; free re-times per R-ac, else 409
 *                                                `retime_paid` with nothing written
 *
 * Gates are the plan's own (`authorizeTripLogistics`, write rails with `requireWriteAccess` — the
 * owner, a delegate or a §12 WRITE advisor); a refusal is one 404. Bodies are `.strict()` picks
 * (§19); the actor is the session (§14). No travel minute or distance leaves (R-h).
 */
import { Router } from "express";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { getUserId } from "../utils/auth";
import { authorizeTripLogistics } from "../utils/trip-logistics-auth";
import { VersionBoardError, applyDays, loadVersionsBoard, retimeDay } from "../services/version-board.service";

const router = Router();

async function gate(req: any, res: any, write: boolean): Promise<string | null> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: "Not authenticated" });
    return null;
  }
  const denied = await authorizeTripLogistics(req.params.tripId, userId, `${req.method} ${req.path}`, write ? { requireWriteAccess: true } : undefined);
  if (denied) {
    res.status(404).json({ message: "No such plan" });
    return null;
  }
  return userId;
}

function fail(res: any, err: unknown, what: string) {
  if (err instanceof VersionBoardError) return res.status(err.status).json({ code: err.code, message: err.message, ...err.extra });
  console.error(`[versions] ${what} failed:`, err);
  return res.status(500).json({ message: `Couldn't ${what}` });
}

router.get("/api/trips/:tripId/versions", isAuthenticated, async (req: any, res) => {
  if (!(await gate(req, res, false))) return;
  try {
    res.json(await loadVersionsBoard(req.params.tripId));
  } catch (err) {
    fail(res, err, "read the versions");
  }
});

const applyBody = z
  .object({ days: z.array(z.object({ day: z.number().int().min(1).max(60), variantId: z.string().min(1).max(64) }).strict()).min(1).max(60) })
  .strict();

router.post("/api/trips/:tripId/versions/apply-days", isAuthenticated, async (req: any, res) => {
  const userId = await gate(req, res, true);
  if (!userId) return;
  const parsed = applyBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: "Send the days to adopt" });
  try {
    res.json(await applyDays({ tripId: req.params.tripId, userId, days: parsed.data.days }));
  } catch (err) {
    fail(res, err, "apply those days");
  }
});

const retimeBody = z
  .object({
    order: z.array(z.string().min(1).max(64)).max(40),
    swapIn: z.object({ variantItemId: z.string().min(1).max(64) }).strict().optional().nullable(),
  })
  .strict();

router.post("/api/trips/:tripId/days/:day/retime", isAuthenticated, async (req: any, res) => {
  const userId = await gate(req, res, true);
  if (!userId) return;
  const day = Number(req.params.day);
  if (!Number.isInteger(day) || day < 1 || day > 60) return res.status(400).json({ message: "No such day" });
  const parsed = retimeBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: "Send the day's order" });
  try {
    res.json(await retimeDay({ tripId: req.params.tripId, userId, day, order: parsed.data.order, swapIn: parsed.data.swapIn ?? null }));
  } catch (err) {
    fail(res, err, "re-time that day");
  }
});

export default router;
