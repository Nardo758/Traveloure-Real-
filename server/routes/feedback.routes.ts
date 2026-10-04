/**
 * feedback.routes.ts — mount: app.use(feedbackRoutes) (ledger `2026-10-04-feedback-phase-a`).
 *
 *   GET    /api/plans/:id/feedback   the caller's own answers and which moments are open
 *   POST   /api/plans/:id/feedback   { moment, code, text? } — one row per plan × moment × user
 *   DELETE /api/plans/:id/feedback   { moment } — undo the caller's own answer
 *   GET    /api/admin/feedback       counts by city × group × moment × code, plus that filter's
 *                                    free text (under the §2 blanket admin guard)
 *
 * Plan routes are gated by the plan's READ predicate (`authorizeTripLogistics`); an unreadable plan
 * is one 404. The user is the session (§14); every context column is server-filled. Bodies are
 * `.strict()` picks (§19). An unknown moment/code pair is a 409; text past the cap is a 400 —
 * refused, never cut.
 */
import { Router } from "express";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { getUserId } from "../utils/auth";
import { authorizeTripLogistics } from "../utils/trip-logistics-auth";
import { TAP_TEXT_MAX, feedbackText, isFeedbackMoment, isFeedbackPair } from "@shared/feedback";
import { clearFeedback, feedbackReport, feedbackState, recordFeedback } from "../services/feedback.service";

const router = Router();

const postBody = z.object({ moment: z.string().max(40), code: z.string().max(40), text: z.string().max(4000).optional().nullable() }).strict();
const deleteBody = z.object({ moment: z.string().max(40) }).strict();

async function gate(req: any, res: any): Promise<string | null> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: "Not authenticated" });
    return null;
  }
  const denied = await authorizeTripLogistics(req.params.id, userId, `${req.method} ${req.path}`);
  if (denied) {
    res.status(404).json({ message: "No such plan" });
    return null;
  }
  return userId;
}

router.get("/api/plans/:id/feedback", isAuthenticated, async (req: any, res) => {
  const userId = await gate(req, res);
  if (!userId) return;
  try {
    res.json(await feedbackState(req.params.id, userId));
  } catch (err) {
    console.error("[feedback] read failed:", err);
    res.status(500).json({ message: "Couldn't read feedback" });
  }
});

router.post("/api/plans/:id/feedback", isAuthenticated, async (req: any, res) => {
  const userId = await gate(req, res);
  if (!userId) return;
  const parsed = postBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: "Send a moment and a code" });
  const { moment, code } = parsed.data;
  if (!isFeedbackMoment(moment) || !isFeedbackPair(moment, code)) {
    return res.status(409).json({ code: "unknown_feedback", message: "That answer isn't one this moment takes" });
  }
  const text = feedbackText(code, parsed.data.text);
  if (!text.ok) return res.status(400).json({ code: "text_too_long", message: `Keep it under ${TAP_TEXT_MAX} characters`, max: TAP_TEXT_MAX });
  try {
    const out = await recordFeedback({ tripId: req.params.id, userId, moment, code, text: text.text });
    res.status(out.updated ? 200 : 201).json({ moment, code, updated: out.updated });
  } catch (err) {
    console.error("[feedback] write failed:", err);
    res.status(500).json({ message: "Couldn't save that" });
  }
});

router.delete("/api/plans/:id/feedback", isAuthenticated, async (req: any, res) => {
  const userId = await gate(req, res);
  if (!userId) return;
  const parsed = deleteBody.safeParse(req.body ?? {});
  if (!parsed.success || !isFeedbackMoment(parsed.data.moment)) return res.status(400).json({ message: "Send a moment" });
  try {
    res.json({ cleared: await clearFeedback({ tripId: req.params.id, userId, moment: parsed.data.moment }) });
  } catch (err) {
    console.error("[feedback] undo failed:", err);
    res.status(500).json({ message: "Couldn't undo that" });
  }
});

const dateParam = (v: unknown): Date | null => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(v)) return null;
  const d = new Date(v.length === 10 ? `${v}T00:00:00Z` : v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const strParam = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : null);

router.get("/api/admin/feedback", isAuthenticated, async (req: any, res) => {
  try {
    const to = dateParam(req.query.to);
    res.json(
      await feedbackReport({
        from: dateParam(req.query.from),
        // An inclusive end day.
        to: to && typeof req.query.to === "string" && req.query.to.length === 10 ? new Date(to.getTime() + 86_400_000 - 1) : to,
        city: strParam(req.query.city),
        groupKey: strParam(req.query.group),
        moment: strParam(req.query.moment),
        code: strParam(req.query.code),
      }),
    );
  } catch (err) {
    console.error("[feedback] admin read failed:", err);
    res.status(500).json({ message: "Couldn't read feedback" });
  }
});

export default router;
