/**
 * admin-place-coords.routes.ts — mount: app.use(adminPlaceCoordsRoutes) — paths declare /api/admin/place-coords*;
 * §2 blanket requireAdmin on the /api/admin prefix is the auth (no per-endpoint guard, by rule).
 *
 * LG-1 (ledger `2026-10-17-lg1-osm-place-coords`): an admin enters a curated stop's coordinate from its official
 * site, keyed by the Google place id — the interim until self-hosted Photon (9b-f). The body is a `.strict()`
 * allowlist (§19); the author is the session (§14). Nothing is deleted here.
 */
import { Router } from "express";
import { z } from "zod";
import { getUserId } from "../utils/auth";
import { adminPlaceCoordBodySchema } from "@shared/open-coords";
import { adminPlaceCoordRows, openPlaceCoordCounts, setAdminPlaceCoord } from "../services/routing/open-place-coords.service";

const router = Router();

const placeIdSchema = z.string().trim().min(1).max(255);
router.get("/api/admin/place-coords", async (req, res) => {
  try {
    const raw = typeof req.query.placeIds === "string" ? req.query.placeIds : "";
    const ids = raw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 200);
    const [rows, counts] = await Promise.all([adminPlaceCoordRows(ids), openPlaceCoordCounts()]);
    res.json({ ...rows, counts });
  } catch (err) {
    console.error("[admin/place-coords] read failed", err);
    res.status(500).json({ message: "Failed to read place coordinates" });
  }
});

router.put("/api/admin/place-coords/:placeId", async (req, res) => {
  const placeId = placeIdSchema.safeParse(req.params.placeId);
  const body = adminPlaceCoordBodySchema.safeParse(req.body ?? {});
  if (!placeId.success || !body.success) {
    return res.status(400).json({ message: "Invalid place coordinate", issues: body.success ? undefined : body.error.issues });
  }
  const adminId = getUserId(req);
  if (!adminId) return res.status(401).json({ message: "Unauthorized" });
  try {
    const row = await setAdminPlaceCoord({ placeId: placeId.data, lat: body.data.lat, lng: body.data.lng, sourceUrl: body.data.sourceUrl, note: body.data.note ?? null }, adminId);
    res.json({ row });
  } catch (err) {
    console.error("[admin/place-coords] write failed", err);
    res.status(500).json({ message: "Failed to save place coordinate" });
  }
});

export default router;
