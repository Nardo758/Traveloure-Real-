import { Router } from "express";
import { getUserId } from "../utils/auth";
import { isAuthenticated } from "../replit_integrations/auth";
import { db } from "../db";
import { savedItems } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { saveItemBodySchema } from "@shared/saved-items";

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
