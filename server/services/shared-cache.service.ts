import { db } from "../db";
import { travelpayoutsCache } from "@shared/schema";
import { eq, and, gt, lte, sql } from "drizzle-orm";
import type { PgTable, PgColumn } from "drizzle-orm/pg-core";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function buildCacheKey(namespace: string, key: string): string {
  return `${namespace}:${key}`;
}

function log(hit: boolean, namespace: string, key: string): void {
  const status = hit ? "HIT" : "MISS";
  console.log(`[Cache] ${status} ${namespace}:${key}`);
}

export class SharedCachePrimitive {
  /**
   * Retrieve a cached value. Returns null on miss or expiry.
   */
  async get<T>(namespace: string, key: string): Promise<T | null> {
    const cacheKey = buildCacheKey(namespace, key);
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
        log(true, namespace, key);
        const data = rows[0].data;
        return data as T;
      }

      log(false, namespace, key);
      return null;
    } catch (err) {
      console.warn(`[Cache] Read error ${namespace}:${key}:`, err instanceof Error ? err.message : err);
      return null;
    }
  }

  /**
   * Store a value under namespace/key with optional TTL (defaults to 24 h).
   */
  async set<T>(namespace: string, key: string, data: T, ttlMs: number = DEFAULT_TTL_MS): Promise<void> {
    const cacheKey = buildCacheKey(namespace, key);
    const expiresAt = new Date(Date.now() + ttlMs);
    try {
      await db
        .insert(travelpayoutsCache)
        .values({ brand: namespace, cacheKey, data: data as any, expiresAt })
        .onConflictDoUpdate({
          target: travelpayoutsCache.cacheKey,
          set: { data: data as any, expiresAt, brand: namespace },
        });
    } catch (err) {
      console.warn(`[Cache] Write error ${namespace}:${key}:`, err instanceof Error ? err.message : err);
    }
  }

  /**
   * Delete a single entry.
   */
  async del(namespace: string, key: string): Promise<void> {
    const cacheKey = buildCacheKey(namespace, key);
    try {
      await db
        .delete(travelpayoutsCache)
        .where(eq(travelpayoutsCache.cacheKey, cacheKey));
    } catch (err) {
      console.warn(`[Cache] Delete error ${namespace}:${key}:`, err instanceof Error ? err.message : err);
    }
  }

  /**
   * Remove all entries in a namespace (regardless of expiry).
   */
  async flush(namespace: string): Promise<number> {
    try {
      const deleted = await db
        .delete(travelpayoutsCache)
        .where(eq(travelpayoutsCache.brand, namespace))
        .returning({ id: travelpayoutsCache.id });
      return deleted.length;
    } catch (err) {
      console.warn(`[Cache] Flush error for namespace "${namespace}":`, err instanceof Error ? err.message : err);
      return 0;
    }
  }

  /**
   * Remove all expired entries from the shared KV store.
   * Optionally restrict to a specific namespace.
   */
  async flushExpired(namespace?: string): Promise<number> {
    const now = new Date();
    try {
      const condition = namespace
        ? and(lte(travelpayoutsCache.expiresAt, now), eq(travelpayoutsCache.brand, namespace))
        : lte(travelpayoutsCache.expiresAt, now);

      const deleted = await db
        .delete(travelpayoutsCache)
        .where(condition)
        .returning({ id: travelpayoutsCache.id });

      if (deleted.length > 0) {
        const target = namespace ? `namespace "${namespace}"` : "all namespaces";
        console.log(`[Cache] Flushed ${deleted.length} expired entries from ${target}`);
      }

      return deleted.length;
    } catch (err) {
      console.warn(`[Cache] FlushExpired error:`, err instanceof Error ? err.message : err);
      return 0;
    }
  }

  /**
   * Return cached value or call factory, cache the result, and return it.
   */
  async getOrSet<T>(
    namespace: string,
    key: string,
    factory: () => Promise<T>,
    ttlMs: number = DEFAULT_TTL_MS
  ): Promise<T> {
    const cached = await this.get<T>(namespace, key);
    if (cached !== null) return cached;

    const fresh = await factory();
    await this.set(namespace, key, fresh, ttlMs);
    return fresh;
  }

  /**
   * Generic helper for deleting expired rows from any domain-specific table that
   * has an `expiresAt` column. Used by fever-cache and amadeus cache to route
   * their cleanup through a shared surface without changing their DB tables.
   */
  async cleanupDomainTable(
    table: PgTable,
    expiresAtCol: PgColumn
  ): Promise<number> {
    const now = new Date();
    try {
      const deleted = await db
        .delete(table)
        .where(lte(expiresAtCol, now))
        .returning();
      return deleted.length;
    } catch (err) {
      console.warn(`[Cache] Domain table cleanup error:`, err instanceof Error ? err.message : err);
      return 0;
    }
  }
}

export const sharedCache = new SharedCachePrimitive();
