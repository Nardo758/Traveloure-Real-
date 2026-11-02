/**
 * CN-1g (ledger `2026-11-02-cn1g-retire-legacy-concierge-server`): the legacy `/api/concierge/*`
 * funnel is retired. Its six routes answer a permanent 410 for every caller, signed in or not —
 * no auth runs first. EXACT paths only: the CN-1 concierge modules (`/api/concierge-task-kinds`,
 * `/api/admin/concierge-task-kinds`, `/api/concierge/bookings/:bookingId/tasks`,
 * `/api/concierge/tasks/:taskId/*`) are untouched. The CS-3 expert claim folds into the CN-1 hire.
 */
import type { RequestHandler } from "express";

const RETIRED: ReadonlyArray<{ method: string; pattern: RegExp }> = [
  { method: "POST", pattern: /^\/api\/concierge\/requests\/?$/ },
  { method: "POST", pattern: /^\/api\/concierge\/quote\/?$/ },
  { method: "PATCH", pattern: /^\/api\/concierge\/requests\/[^/]+\/?$/ },
  { method: "POST", pattern: /^\/api\/concierge\/requests\/[^/]+\/claim\/?$/ },
  { method: "POST", pattern: /^\/api\/concierge\/escalations\/?$/ },
  { method: "GET", pattern: /^\/api\/concierge\/event-packages\/?$/ },
];

export function isRetiredConciergeRoute(method: string, path: string): boolean {
  const m = method.toUpperCase();
  return RETIRED.some((r) => r.method === m && r.pattern.test(path));
}

export const conciergeRetiredMiddleware: RequestHandler = (req, res, next) => {
  if (!isRetiredConciergeRoute(req.method, req.path)) return next();
  res.status(410).json({ code: "concierge_retired", message: "This concierge flow has been retired." });
};
