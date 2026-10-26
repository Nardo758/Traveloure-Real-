/**
 * versions.routes.ts — mount: app.use(versionsRoutes) (surface step 5; ledger
 * `2026-10-04-surface-step5-map-versions`).
 *
 *   GET  /api/trips/:tripId/versions             the board: latest run's A/B/C, per-day diffs,
 *                                                badges, anchors, re-time allowance (read gate)
 *   POST /api/trips/:tripId/versions/apply-days  { days: [{ day, variantId }] } — write gate.
 *                                                Each adopted day comes back with snapshotId.
 *   GET  /api/trips/:tripId/versions/restorable  newest saved day per day (read gate)
 *   POST /api/trips/:tripId/versions/days/:day/restore  { snapshotId } — write gate; puts that day back
 *   GET  /api/trips/:tripId/versions/fixed       FB-1 step 4: the flagged days "Your plan, fixed" can fix, each
 *                                                fixable or changed since the run (read gate)
 *                                                The tap sends apply-days with `unchangedSinceRun: true`: a day changed
 *                                                since the run started is refused (one) or skipped and reported (several)
 *   GET  /api/trips/:tripId/retime-fixes         FB-1 step 4b: a FREE plan's tap-able retime fixes (owner/delegate)
 *   POST /api/trips/:tripId/retime-fixes/:itemId/apply { preview?: true } — owner/delegate; one stop's fix, the moves
 *                                                recomputed server-side; preview writes nothing
 *   POST /api/trips/:tripId/days/:day/retime     { order: itemIds, swapIn?: { variantItemId } } —
 *                                                write gate; free re-times per R-ac, else 409
 *                                                `retime_paid` with nothing written
 *
 * Gates are the plan's own (`authorizeTripLogistics`, write rails with `requireWriteAccess` — the
 * owner, a delegate or a §12 WRITE advisor); a refusal is one 404. Bodies are `.strict()` picks
 * (§19); the actor is the session (§14). No travel minute or distance leaves (R-h).
 */
import { enqueuePlanLegRecompute, runNow } from "../services/routing/plan-legs-queue";
import { Router } from "express";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { getUserId } from "../utils/auth";
import { authorizeTripLogistics } from "../utils/trip-logistics-auth";
import { VersionBoardError, applyDays, loadVersionsBoard, retimeDay } from "../services/version-board.service";
import { DayRestoreError, listRestorableDays, restoreDay } from "../services/version-day-restore.service";
import { applyDaysUnchangedSinceRun, loadFixedPlan } from "../services/fixed-plan.service";
import { FreeRetimeError, applyFreeRetimeFix, loadFreeRetimeFixes } from "../services/free-retime.service";

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
  if (err instanceof VersionBoardError || err instanceof DayRestoreError) return res.status(err.status).json({ code: err.code, message: err.message, ...err.extra });
  console.error(`[versions] ${what} failed:`, err);
  return res.status(500).json({ message: `Couldn't ${what}` });
}

router.get("/api/trips/:tripId/versions", isAuthenticated, async (req: any, res) => {
  if (!(await gate(req, res, false))) return;
  try {
    res.json(await loadVersionsBoard(req.params.tripId, new Date(), getUserId(req)));
  } catch (err) {
    fail(res, err, "read the versions");
  }
});

const applyBody = z
  .object({
    days: z.array(z.object({ day: z.number().int().min(1).max(60), variantId: z.string().min(1).max(64) }).strict()).min(1).max(60),
    // FB-1 step 4: the "Your plan, fixed" tap. The board never sends it, so its adopt is unchanged.
    unchangedSinceRun: z.literal(true).optional(),
    // Confirm before apply: the same diff, rolled back. Only with `unchangedSinceRun` (the tap's rail).
    preview: z.literal(true).optional(),
  })
  .strict()
  .refine((b) => !b.preview || b.unchangedSinceRun, { message: "preview is the tap's" });

router.post("/api/trips/:tripId/versions/apply-days", isAuthenticated, async (req: any, res) => {
  const userId = await gate(req, res, true);
  if (!userId) return;
  const parsed = applyBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: "Send the days to adopt" });
  try {
    const out = parsed.data.unchangedSinceRun
      ? await applyDaysUnchangedSinceRun({ tripId: req.params.tripId, userId, days: parsed.data.days, preview: parsed.data.preview })
      : await applyDays({ tripId: req.params.tripId, userId, days: parsed.data.days });
    // Step 9a ruling 6 (ledger 2026-10-07-step9a-routing-engine): applying versions writes the plan's
    // own legs for what was adopted — after the commit, best-effort, never failing the apply (§15b). A preview
    // wrote nothing, so it refreshes nothing.
    if (!parsed.data.preview) void runNow(req.params.tripId);
    res.json(out);
  } catch (err) {
    fail(res, err, "apply those days");
  }
});

router.get("/api/trips/:tripId/versions/restorable", isAuthenticated, async (req: any, res) => {
  if (!(await gate(req, res, false))) return;
  try {
    res.json(await listRestorableDays(req.params.tripId));
  } catch (err) {
    fail(res, err, "read the saved days");
  }
});

const restoreBody = z.object({ snapshotId: z.string().min(1).max(64) }).strict();

router.post("/api/trips/:tripId/versions/days/:day/restore", isAuthenticated, async (req: any, res) => {
  const userId = await gate(req, res, true);
  if (!userId) return;
  const day = Number(req.params.day);
  if (!Number.isInteger(day) || day < 1 || day > 60) return res.status(400).json({ message: "No such day" });
  const parsed = restoreBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: "Send the saved day" });
  try {
    const out = await restoreDay({ tripId: req.params.tripId, userId, day, snapshotId: parsed.data.snapshotId });
    // A second restore writes nothing, so it refreshes nothing. Same best-effort as apply-days.
    if (out.restored) void runNow(req.params.tripId);
    res.json(out);
  } catch (err) {
    fail(res, err, "restore that day");
  }
});

// FB-1 step 4 (ledger `2026-10-19-fb1-fixed-by-tap`): "Your plan, fixed" by tap. Flag-only: nothing adopts a day
// without this request, and a day the plan changed on since the run started is refused, never overwritten.
router.get("/api/trips/:tripId/versions/fixed", isAuthenticated, async (req: any, res) => {
  if (!(await gate(req, res, false))) return;
  try {
    res.json({ fixed: await loadFixedPlan(req.params.tripId) });
  } catch (err) {
    fail(res, err, "read the fixed version");
  }
});

// FB-1 step 4b (ledger `2026-10-19-fb1-free-retime`): a free plan's retime fix on tap. The owner or delegate only
// (the service's own gate, one 404); the moves are recomputed from the plan, never read from the body.
function failRetime(res: any, err: unknown, what: string) {
  if (err instanceof FreeRetimeError) return res.status(err.status).json({ code: err.code, message: err.message });
  console.error(`[retime-fixes] ${what} failed:`, err);
  return res.status(500).json({ message: `Couldn't ${what}` });
}

router.get("/api/trips/:tripId/retime-fixes", isAuthenticated, async (req: any, res) => {
  try {
    res.json({ fixes: await loadFreeRetimeFixes(req.params.tripId, getUserId(req)) });
  } catch (err) {
    failRetime(res, err, "read the fixes");
  }
});

const retimeFixBody = z.object({ preview: z.literal(true).optional() }).strict();

router.post("/api/trips/:tripId/retime-fixes/:itemId/apply", isAuthenticated, async (req: any, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Not authenticated" });
  const parsed = retimeFixBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: "Send nothing, or preview: true" });
  try {
    res.json({ fix: await applyFreeRetimeFix({ tripId: req.params.tripId, userId, itemId: req.params.itemId, preview: parsed.data.preview === true }) });
  } catch (err) {
    failRetime(res, err, "apply that fix");
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
    const out = await retimeDay({ tripId: req.params.tripId, userId, day, order: parsed.data.order, swapIn: parsed.data.swapIn ?? null });
    enqueuePlanLegRecompute(req.params.tripId); // step 9a ruling 10 (ledger 2026-10-07-step9a-routing-engine)
    res.json(out);
  } catch (err) {
    fail(res, err, "re-time that day");
  }
});

export default router;
