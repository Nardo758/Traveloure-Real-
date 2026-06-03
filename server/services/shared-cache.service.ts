import { db } from "../db";
import { travelpayoutsCache } from "@shared/schema";
import { eq, and, gt, lte } from "drizzle-orm";
import type { PgTable, PgColumn } from "drizzle-orm/pg-core";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Canonical DB key: namespace and key are combined with a double-colon separator
 * that cannot appear in any travelpayouts brand name or cache key, guaranteeing
 * global uniqueness within the single `travelpayouts_cache` table even when two
 * namespaces happen to use the same logical key string.
 */
function dbKey(namespace: string, key: string): string {
  return `${namespace}::${key}`;
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
    try {
      const now = new Date();
      const rows = await db
        .select()
        .from(travelpayoutsCache)
        .where(
          and(
            eq(travelpayoutsCache.brand, namespace),
            eq(travelpayoutsCache.cacheKey, dbKey(namespace, key)),
            gt(travelpayoutsCache.expiresAt, now)
          )
        )
        .limit(1);

      if (rows.length > 0) {
        log(true, namespace, key);
        return rows[0].data as T;
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
   * The composite `dbKey(namespace, key)` is used as the unique DB cacheKey.
   */
  async set<T>(namespace: string, key: string, data: T, ttlMs: number = DEFAULT_TTL_MS): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlMs);
    const compositeKey = dbKey(namespace, key);
    try {
      await db
        .insert(travelpayoutsCache)
        .values({ brand: namespace, cacheKey: compositeKey, data: data as any, expiresAt })
        .onConflictDoUpdate({
          target: travelpayoutsCache.cacheKey,
          set: { data: data as any, expiresAt, brand: namespace },
        });
    } catch (err) {
      console.warn(`[Cache] Write error ${namespace}:${key}:`, err instanceof Error ? err.message : err);
    }
  }

  /**
   * Delete a single entry by namespace and key.
   */
  async del(namespace: string, key: string): Promise<void> {
    try {
      await db
        .delete(travelpayoutsCache)
        .where(eq(travelpayoutsCache.cacheKey, dbKey(namespace, key)));
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
   * has an `expiresAt` column. Allows domain caches (hotel, flight, activity) to
   * route their cleanup through a shared surface without changing their DB tables.
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

  /**
   * List all non-expired entries for a namespace.
   * Returns { key, data, expiresAt } — key is stripped of namespace prefix.
   */
  async listNamespace<T>(namespace: string): Promise<Array<{ key: string; data: T; expiresAt: Date }>> {
    const now = new Date();
    const prefix = `${namespace}::`;
    try {
      const rows = await db
        .select()
        .from(travelpayoutsCache)
        .where(
          and(
            eq(travelpayoutsCache.brand, namespace),
            gt(travelpayoutsCache.expiresAt, now)
          )
        );
      return rows.map(r => ({
        key: r.cacheKey.startsWith(prefix) ? r.cacheKey.slice(prefix.length) : r.cacheKey,
        data: r.data as T,
        expiresAt: r.expiresAt,
      }));
    } catch (err) {
      console.warn(`[Cache] ListNamespace error for "${namespace}":`, err instanceof Error ? err.message : err);
      return [];
    }
  }
}

export const sharedCache = new SharedCachePrimitive();
