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
} from "../services/content-sources.service";

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
      viewerMayActivate: mayActivateContentSource(getUserId(req)),
      activatorConfigured: contentSourceActivatorIds().length > 0,
    });
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

export default router;
