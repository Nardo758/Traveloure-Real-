import { db } from "../db";
import { travelpayoutsCache } from "@shared/schema";
import { eq, and, gt, lte, sql } from "drizzle-orm";
import type { PgTable, PgColumn } from "drizzle-orm/pg-core";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function log(hit: boolean, namespace: string, key: string): void {
  const status = hit ? "HIT" : "MISS";
  console.log(`[Cache] ${status} ${namespace}:${key}`);
}

export class SharedCachePrimitive {
  /**
   * Retrieve a cached value. Returns null on miss or expiry.
   * `namespace` maps to the `brand` column; `key` maps to `cacheKey` as-is.
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
            eq(travelpayoutsCache.cacheKey, key),
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
   * `namespace` is stored in `brand`; `key` is stored in `cacheKey` unchanged.
   */
  async set<T>(namespace: string, key: string, data: T, ttlMs: number = DEFAULT_TTL_MS): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlMs);
    try {
      await db
        .insert(travelpayoutsCache)
        .values({ brand: namespace, cacheKey: key, data: data as any, expiresAt })
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
        .where(
          and(
            eq(travelpayoutsCache.brand, namespace),
            eq(travelpayoutsCache.cacheKey, key)
          )
        );
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
   * has an `expiresAt` column. Allows domain caches (e.g. hotel, flight) to route
   * their cleanup through a single shared surface without changing their DB tables.
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
   * Returns an array of { key, data, expiresAt } objects.
   */
  async listNamespace<T>(namespace: string): Promise<Array<{ key: string; data: T; expiresAt: Date }>> {
    const now = new Date();
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
      return rows.map(r => ({ key: r.cacheKey, data: r.data as T, expiresAt: r.expiresAt }));
    } catch (err) {
      console.warn(`[Cache] ListNamespace error for "${namespace}":`, err instanceof Error ? err.message : err);
      return [];
    }
  }
}

export const sharedCache = new SharedCachePrimitive();
