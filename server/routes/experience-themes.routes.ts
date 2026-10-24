/**
 * experience-themes.routes.ts — mount: app.use(experienceThemesRoutes).
 *
 * GET /api/experience-themes is public (id, slug, label, sortOrder).
 * /api/admin/experience-themes* relies on the §2 blanket requireAdmin
 * (server/routes.ts adminApiGuard). No per-endpoint guard is added here.
 */
import { Router } from "express";
import { z } from "zod";
import {
  PICK_THEME_MESSAGE,
  THEME_NAME_CANNOT_BE_SAVED_MESSAGE,
} from "@shared/experience-themes";
import { getUserId } from "../utils/auth";
import {
  acceptThemeSuggestion,
  createExperienceTheme,
  dismissThemeSuggestion,
  listPublicExperienceThemes,
  loadAdminExperienceThemes,
  updateExperienceTheme,
} from "../services/experience-themes.service";

const router = Router();

const createBody = z.object({
  label: z.string().trim().min(1).max(120),
  active: z.boolean().nullable().optional(),
}).strict();

const patchBody = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  active: z.boolean().nullable().optional(),
  sortOrder: z.number().int().min(0).max(10000).nullable().optional(),
}).strict();

router.get("/api/experience-themes", async (_req, res) => {
  try {
    const themes = await listPublicExperienceThemes();
    res.json({ themes });
  } catch (err) {
    console.error("Error listing experience themes:", err);
    res.status(500).json({ message: "Failed to list themes" });
  }
});

router.get("/api/admin/experience-themes", async (_req, res) => {
  try {
    res.json(await loadAdminExperienceThemes());
  } catch (err) {
    console.error("Error loading admin experience themes:", err);
    res.status(500).json({ message: "Failed to load themes" });
  }
});

router.post("/api/admin/experience-themes", async (req, res) => {
  const parsed = createBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: THEME_NAME_CANNOT_BE_SAVED_MESSAGE });
  }
  const created = await createExperienceTheme({
    label: parsed.data.label,
    active: parsed.data.active === undefined ? true : parsed.data.active,
  });
  if (!created.ok) return res.status(created.status).json({ message: created.message });
  res.status(201).json({ id: created.id });
});

router.patch("/api/admin/experience-themes/:id", async (req, res) => {
  const parsed = patchBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: PICK_THEME_MESSAGE });
  }
  const updated = await updateExperienceTheme(req.params.id, parsed.data);
  if (!updated.ok) return res.status(updated.status).json({ message: updated.message });
  res.json({ ok: true });
});

router.post("/api/admin/experience-theme-suggestions/:id/accept", async (req, res) => {
  const reviewerId = getUserId(req);
  if (!reviewerId) return res.status(401).json({ message: "Sign in required" });
  const result = await acceptThemeSuggestion(req.params.id, reviewerId);
  if (!result.ok) return res.status(result.status).json({ message: result.message });
  res.json({ themeId: result.themeId, created: result.created });
});

router.post("/api/admin/experience-theme-suggestions/:id/dismiss", async (req, res) => {
  const reviewerId = getUserId(req);
  if (!reviewerId) return res.status(401).json({ message: "Sign in required" });
  const result = await dismissThemeSuggestion(req.params.id, reviewerId);
  if (!result.ok) return res.status(result.status).json({ message: result.message });
  res.json({ ok: true });
});

export default router;
