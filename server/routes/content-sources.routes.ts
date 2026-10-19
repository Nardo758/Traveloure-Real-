/**
 * CONTENT SOURCE REGISTRY — admin routes (A6 (2), ledger `2026-10-01-a6-registry-surface`). All under
 * §2's blanket `/api/admin` guard; the actor is the SESSION (§14).
 *
 *   GET   /api/admin/content-sources                    list + whether the viewer may activate
 *   POST  /api/admin/content-sources                    create a draft (.strict — §19)
 *   PATCH /api/admin/content-sources/:id                general edit (strips terms + activation)
 *   POST  /api/admin/content-sources/:id/activate       allowlisted activator only; stamps the check
 *   POST  /api/admin/content-sources/:id/deactivate     any admin
 *   POST  /api/admin/content-sources/:id/public-ok      allowlisted activator only; `{ publicOk }`,
 *                                                       official + terms-checked rows only (ruling R-p)
 *   POST  /api/admin/content-sources/:id/signoff        CS-1 item 1: the approver (same allowlist) records
 *                                                       `{ decision: "approved" | "rejected" }`
 *   GET   /api/admin/content-sources/lookup-outcomes    PF-1: Places lookup outcomes by outcome/reason (`?days=`)
 *   GET   /api/admin/content-sources/lookup-outcomes/plan/:tripId   PF-1: each item's latest outcome on one plan
 */
import { Router, type Response } from "express";
import { isAuthenticated } from "../replit_integrations/auth";
import { getUserId } from "../utils/auth";
import { contentSourceActivatorIds, mayActivateContentSource } from "../config/content-sources.config";
import {
  ContentSourceError,
  activateContentSource,
  createContentSource,
  deactivateContentSource,
  editContentSource,
  listContentSources,
  setContentSourcePublicOk,
  signoffContentSource,
} from "../services/content-sources.service";
import { needsManualRecheck } from "@shared/source-signoff";
import { latestLookupOutcomesForPlan, lookupOutcomeCounts } from "../services/content-facts/lookup-outcomes.service";

const router = Router();

function fail(res: Response, err: unknown) {
  if (err instanceof ContentSourceError) return res.status(err.status).json({ error: err.code, ...(err.details ?? {}) });
  console.error("[content-sources]", err);
  return res.status(500).json({ error: "content_sources_failed" });
}

router.get("/api/admin/content-sources", isAuthenticated, async (req, res) => {
  try {
    const sources = await listContentSources();
    res.json({
      sources,
      // CS-1 item 1: reading-class sources a machine may not fetch — rechecked by a person.
      manualRecheckIds: sources.filter((r) => needsManualRecheck(r)).map((r) => r.id),
      viewerMayActivate: mayActivateContentSource(getUserId(req)),
      activatorConfigured: contentSourceActivatorIds().length > 0,
    });
  } catch (err) {
    fail(res, err);
  }
});

// PF-1 ruling 3 (ledger `2026-10-11-pf1-lookup-outcomes`): counts by outcome and reason over a window (default
// and maximum from config), and the plan view — each item's LATEST outcome on one plan. Read-only.
router.get("/api/admin/content-sources/lookup-outcomes", isAuthenticated, async (req, res) => {
  try {
    const raw = typeof req.query.days === "string" ? Number.parseInt(req.query.days, 10) : undefined;
    res.json(await lookupOutcomeCounts(raw && Number.isFinite(raw) && raw > 0 ? raw : undefined));
  } catch (err) {
    fail(res, err);
  }
});

router.get("/api/admin/content-sources/lookup-outcomes/plan/:tripId", isAuthenticated, async (req, res) => {
  const tripId = String(req.params.tripId ?? "").trim();
  if (!tripId || tripId.length > 64) return res.status(400).json({ error: "invalid_trip_id" });
  try {
    res.json({ tripId, items: await latestLookupOutcomesForPlan(tripId) });
  } catch (err) {
    fail(res, err);
  }
});

router.post("/api/admin/content-sources", isAuthenticated, async (req, res) => {
  try {
    const actor = getUserId(req);
    if (!actor) return res.status(401).json({ error: "unauthenticated" });
    res.status(201).json({ source: await createContentSource(req.body, actor) });
  } catch (err) {
    fail(res, err);
  }
});

router.patch("/api/admin/content-sources/:id", isAuthenticated, async (req, res) => {
  try {
    res.json({ source: await editContentSource(req.params.id, req.body) });
  } catch (err) {
    fail(res, err);
  }
});

router.post("/api/admin/content-sources/:id/activate", isAuthenticated, async (req, res) => {
  try {
    res.json({ source: await activateContentSource(req.params.id, getUserId(req) ?? null) });
  } catch (err) {
    fail(res, err);
  }
});

router.post("/api/admin/content-sources/:id/deactivate", isAuthenticated, async (req, res) => {
  try {
    res.json({ source: await deactivateContentSource(req.params.id) });
  } catch (err) {
    fail(res, err);
  }
});

router.post("/api/admin/content-sources/:id/public-ok", isAuthenticated, async (req, res) => {
  try {
    res.json({ source: await setContentSourcePublicOk(req.params.id, req.body, getUserId(req) ?? null) });
  } catch (err) {
    fail(res, err);
  }
});

router.post("/api/admin/content-sources/:id/signoff", isAuthenticated, async (req, res) => {
  try {
    res.json({ source: await signoffContentSource(req.params.id, req.body, getUserId(req) ?? null) });
  } catch (err) {
    fail(res, err);
  }
});

export default router;
