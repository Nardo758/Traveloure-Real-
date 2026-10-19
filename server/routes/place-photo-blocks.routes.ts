/**
 * CS-1 item 1 — per-place no_photos, admin routes (ledger `2026-10-18-cs1-source-signoff`). Under §2's blanket
 * `/api/admin` guard; the actor is the SESSION (§14). Only the approver (the content-source activator allowlist) adds a
 * block; there is no delete route — a block is never removed by code.
 *
 *   GET   /api/admin/place-photo-blocks     the blocks
 *   POST  /api/admin/place-photo-blocks     add one: `{ placeId?, placeName?, city?, reason }` (.strict — §19)
 */
import { Router } from "express";
import { isAuthenticated } from "../replit_integrations/auth";
import { getUserId } from "../utils/auth";
import { PhotoBlockError, addPlacePhotoBlock, listPlacePhotoBlocks } from "../services/place-photo-blocks.service";

const router = Router();

router.get("/api/admin/place-photo-blocks", isAuthenticated, async (_req, res) => {
  try {
    res.json({ blocks: await listPlacePhotoBlocks() });
  } catch (err) {
    console.error("[place-photo-blocks]", err);
    res.status(500).json({ error: "photo_blocks_failed" });
  }
});

router.post("/api/admin/place-photo-blocks", isAuthenticated, async (req, res) => {
  try {
    res.status(201).json({ block: await addPlacePhotoBlock(req.body, getUserId(req) ?? null) });
  } catch (err) {
    if (err instanceof PhotoBlockError) return res.status(err.status).json({ error: err.code, ...(err.details ?? {}) });
    console.error("[place-photo-blocks]", err);
    res.status(500).json({ error: "photo_blocks_failed" });
  }
});

export default router;
