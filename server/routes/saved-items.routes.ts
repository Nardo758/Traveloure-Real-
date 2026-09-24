import { Router } from "express";
import { getUserId } from "../utils/auth";
import { isAuthenticated } from "../replit_integrations/auth";
import { db } from "../db";
import { savedItems } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { saveItemBodySchema, shareSavedCityBodySchema } from "@shared/saved-items";
import {
  listSavedCityShares,
  readSharedSavedPlaces,
  revokeSavedCityShare,
  shareSavedCity,
} from "../services/saved-place-shares.service";

const router = Router();

router.get("/api/saved-items", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const city = req.query.city as string | undefined;

    const conditions = [eq(savedItems.userId, userId)];
    if (city) conditions.push(eq(savedItems.city, city));

    const items = await db
      .select()
      .from(savedItems)
      .where(and(...conditions))
      .orderBy(savedItems.createdAt);

    return res.json(items);
  } catch (err) {
    console.error("[saved-items] GET error:", err);
    return res.status(500).json({ error: "Failed to fetch saved items" });
  }
});

router.post("/api/saved-items", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    // §19 allowlist (board #330 — the first client caller of this route): the saving user is the
    // session, the body may name only the card being saved, and an unknown key is refused.
    const parsed = saveItemBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid saved item", issues: parsed.error.issues });
    }
    const { contentType, contentId, contentName, contentImage, city } = parsed.data;

    const [item] = await db
      .insert(savedItems)
      .values({ userId, contentType, contentId, contentName, contentImage: contentImage ?? null, city: city ?? null })
      .onConflictDoNothing()
      .returning();

    if (!item) {
      const [existing] = await db
        .select()
        .from(savedItems)
        .where(
          and(
            eq(savedItems.userId, userId),
            eq(savedItems.contentType, contentType),
            eq(savedItems.contentId, contentId),
          ),
        )
        .limit(1);
      return res.json(existing);
    }

    return res.status(201).json(item);
  } catch (err) {
    console.error("[saved-items] POST error:", err);
    return res.status(500).json({ error: "Failed to save item" });
  }
});

// ── Board #329: share ONE city's saved places as a read-only link ─────────────────────────────
// The owner is the session (§14); the body names only the city (§19). The link carries no place —
// the public read takes the owner's CURRENT saved places for that city.
router.get("/api/saved-items/shares", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    return res.json(await listSavedCityShares(userId));
  } catch (err) {
    console.error("[saved-items] shares GET error:", err);
    return res.status(500).json({ error: "Failed to load shared links" });
  }
});

router.post("/api/saved-items/shares", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const parsed = shareSavedCityBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid share request", issues: parsed.error.issues });
    }
    const result = await shareSavedCity(userId, parsed.data.city);
    if (!result.ok) {
      return res.status(404).json({ error: "You have no saved places in that city", code: result.reason });
    }
    return res.status(result.created ? 201 : 200).json(result.share);
  } catch (err) {
    console.error("[saved-items] shares POST error:", err);
    return res.status(500).json({ error: "Failed to share saved places" });
  }
});

router.delete("/api/saved-items/shares/:shareId", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const revoked = await revokeSavedCityShare(userId, req.params.shareId);
    // One 404 for "no such link", "already stopped" and "not yours" (LD 40 posture).
    if (!revoked) return res.status(404).json({ error: "Shared link not found" });
    return res.json({ success: true });
  } catch (err) {
    console.error("[saved-items] shares DELETE error:", err);
    return res.status(500).json({ error: "Failed to stop sharing" });
  }
});

// Public, read-only. No owner and no ids in the response; an unknown or stopped link is one 404.
router.get("/api/saved-places/shared/:token", async (req, res) => {
  try {
    const shared = await readSharedSavedPlaces(req.params.token);
    if (!shared) return res.status(404).json({ error: "This link is not active" });
    res.setHeader("Cache-Control", "no-store");
    return res.json(shared);
  } catch (err) {
    console.error("[saved-items] shared read error:", err);
    return res.status(500).json({ error: "Failed to load shared places" });
  }
});

router.delete("/api/saved-items/:id", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const { id } = req.params;

    await db
      .delete(savedItems)
      .where(and(eq(savedItems.id, id), eq(savedItems.userId, userId)));

    return res.json({ success: true });
  } catch (err) {
    console.error("[saved-items] DELETE error:", err);
    return res.status(500).json({ error: "Failed to remove saved item" });
  }
});

export default router;
