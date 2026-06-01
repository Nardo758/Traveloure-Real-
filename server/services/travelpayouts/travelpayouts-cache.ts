import { db } from "../../db";
import { travelpayoutsCache } from "@shared/schema";
import { eq, and, gt } from "drizzle-orm";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function getCachedFeed(brand: string, cacheKey: string): Promise<any[] | null> {
  try {
    const now = new Date();
    const rows = await db
      .select()
      .from(travelpayoutsCache)
      .where(
        and(
          eq(travelpayoutsCache.cacheKey, cacheKey),
          gt(travelpayoutsCache.expiresAt, now)
        )
      )
      .limit(1);

    if (rows.length > 0) {
      const data = rows[0].data;
      return Array.isArray(data) ? data : [];
    }
    return null;
  } catch (err) {
    console.warn(`[TravelpayoutsCache] Read failed for ${cacheKey}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

export async function setCachedFeed(brand: string, cacheKey: string, data: any[]): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + CACHE_TTL_MS);
    await db
      .insert(travelpayoutsCache)
      .values({ brand, cacheKey, data: data as any, expiresAt })
      .onConflictDoUpdate({
        target: travelpayoutsCache.cacheKey,
        set: { data: data as any, expiresAt, brand },
      });
  } catch (err) {
    console.warn(`[TravelpayoutsCache] Write failed for ${cacheKey}:`, err instanceof Error ? err.message : err);
  }
}
