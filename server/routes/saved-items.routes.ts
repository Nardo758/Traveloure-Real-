import { Router } from "express";
import { isAuthenticated } from "../replit_integrations/auth";
import { db } from "../db";
import { savedItems } from "@shared/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

router.get("/api/saved-items", isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
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
    const userId = (req.user as any)?.id;
    const { contentType, contentId, contentName, contentImage, city } = req.body;

    if (!contentType || !contentId || !contentName) {
      return res.status(400).json({ error: "contentType, contentId, and contentName are required" });
    }

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

router.delete("/api/saved-items/:id", isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
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
