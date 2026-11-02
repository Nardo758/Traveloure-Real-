/**
 * concierge-task-log.routes.ts — CN-1e, the concierge task log. Mount: app.use(conciergeTaskLogRoutes).
 *
 * Every route is signed-in; who may act is decided in server/services/concierge-task-log.service.ts
 * from the booking row (the traveler and the assigned expert), never from the body. Bodies are
 * `.strict()` picks (§19). Errors are machine codes; no traveler- or expert-facing wording here.
 * An admin may read an engagement's tasks (audited); an admin never acts on one.
 */
import { Router } from "express";
import { isAuthenticated } from "../replit_integrations/auth";
import { getUserId } from "../utils/auth";
import {
  CONCIERGE_TASK_ERRORS,
  conciergeTaskCreateBodySchema,
  conciergeTaskDoneBodySchema,
  conciergeTaskEmptyBodySchema,
  conciergeTaskNoteBodySchema,
  type ConciergeTaskState,
} from "@shared/concierge-task-log";
import { createConciergeTask, listConciergeTasks, transitionConciergeTask, type TaskResult } from "../services/concierge-task-log.service";
import { recordAdminAudit } from "../services/admin-query.service";

const router = Router();

function send(res: any, result: TaskResult<unknown>) {
  return res.status(result.status).json(result.body);
}

function invalid(res: any) {
  return res.status(400).json({ code: CONCIERGE_TASK_ERRORS.invalidBody });
}

router.post("/api/concierge/bookings/:bookingId/tasks", isAuthenticated, async (req, res) => {
  // Ownership: the service resolves the booking and admits only its traveler or, for the expert's moves, its assigned expert inside the access window.
  const parsed = conciergeTaskCreateBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) return invalid(res);
  try {
    return send(res, await createConciergeTask(req.params.bookingId, getUserId(req)!, parsed.data));
  } catch (err) {
    console.error(`[concierge-task] create failed (${(err as any)?.code ?? "error"})`);
    return res.status(500).json({ code: "concierge_task_failed" });
  }
});

router.get("/api/concierge/bookings/:bookingId/tasks", isAuthenticated, async (req, res) => {
  // Ownership: the service resolves the booking and admits only its traveler or, for the expert's moves, its assigned expert inside the access window.
  try {
    const userId = getUserId(req)!;
    const result = await listConciergeTasks(req.params.bookingId, userId);
    if (result.ok && result.body.viewer === "admin") {
      await recordAdminAudit({
        actorId: userId,
        actorRole: "admin",
        action: "concierge_tasks_read",
        resourceType: "service_booking",
        resourceId: req.params.bookingId,
        ipAddress: req.ip ?? null,
        userAgent: req.get("user-agent") ?? null,
      });
    }
    res.set("Cache-Control", "private, no-store");
    return send(res, result);
  } catch (err) {
    console.error(`[concierge-task] list failed (${(err as any)?.code ?? "error"})`);
    return res.status(500).json({ code: "concierge_task_failed" });
  }
});

async function runTransition(
  req: any,
  res: any,
  to: Exclude<ConciergeTaskState, "requested">,
  schema: typeof conciergeTaskDoneBodySchema | typeof conciergeTaskNoteBodySchema | typeof conciergeTaskEmptyBodySchema,
) {
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) return invalid(res);
  try {
    return send(res, await transitionConciergeTask(req.params.taskId, getUserId(req)!, to, parsed.data as { linkUrl?: string; note?: string }));
  } catch (err) {
    console.error(`[concierge-task] ${to} failed (${(err as any)?.code ?? "error"})`);
    return res.status(500).json({ code: "concierge_task_failed" });
  }
}

// One registration per route so the mutation-auth extractor sees each.
router.post("/api/concierge/tasks/:taskId/traveler-ok", isAuthenticated, async (req, res) => {
  // Ownership: the service resolves the booking and admits only its traveler or, for the expert's moves, its assigned expert inside the access window.
  return runTransition(req, res, "traveler_ok", conciergeTaskEmptyBodySchema);
});
router.post("/api/concierge/tasks/:taskId/done", isAuthenticated, async (req, res) => {
  // Ownership: the service resolves the booking and admits only its traveler or, for the expert's moves, its assigned expert inside the access window.
  return runTransition(req, res, "done", conciergeTaskDoneBodySchema);
});
router.post("/api/concierge/tasks/:taskId/could-not-get", isAuthenticated, async (req, res) => {
  // Ownership: the service resolves the booking and admits only its traveler or, for the expert's moves, its assigned expert inside the access window.
  return runTransition(req, res, "could_not_get", conciergeTaskNoteBodySchema);
});
router.post("/api/concierge/tasks/:taskId/withdraw", isAuthenticated, async (req, res) => {
  // Ownership: the service resolves the booking and admits only its traveler or, for the expert's moves, its assigned expert inside the access window.
  return runTransition(req, res, "withdrawn", conciergeTaskEmptyBodySchema);
});

export default router;
