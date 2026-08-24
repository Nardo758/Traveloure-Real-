/**
 * Pure aggregation helper for the Travelpayouts cache status endpoint.
 * Extracted to a separate module so it can be unit-tested without standing
 * up an HTTP server or a real database connection.
 */

export interface CacheRow {
  brand: string;
  cacheKey: string;
  expiresAt: Date;
  /** null for rows that pre-date migration 221 — surfaced as "unknown" */
  refreshedAt: Date | null;
}

export interface BrandStatus {
  brand: string;
  totalKeys: number;
  staleKeys: number;
  freshKeys: number;
  /** null = all keys pre-date the refreshedAt column (unknown last refresh) */
  lastRefreshedAt: Date | null;
  earliestExpiresAt: Date | null;
  latestExpiresAt: Date | null;
  /** true when ALL keys are expired — no fresh data available for this brand */
  isStale: boolean;
  keys: Array<{
    cacheKey: string;
    refreshedAt: Date | null;
    expiresAt: Date;
    isStale: boolean;
  }>;
}

/**
 * Aggregate a flat list of cache rows into per-brand freshness summaries.
 * Returns brands sorted alphabetically.
 *
 * Staleness policy: a brand is stale when ALL of its keys have expired
 * (freshKeys === 0). A brand with even one unexpired key is considered fresh
 * at the brand level; per-key isStale reflects individual key expiry.
 *
 * Legacy null refreshedAt (rows that pre-date migration 221) are not
 * synthesised — lastRefreshedAt stays null if no upserted rows exist for
 * that brand, so the caller can surface "unknown" rather than a false value.
 */
export function aggregateBrandStatus(rows: CacheRow[], now: Date): BrandStatus[] {
  const brandMap = new Map<string, BrandStatus>();

  for (const row of rows) {
    const stale = row.expiresAt < now;
    if (!brandMap.has(row.brand)) {
      brandMap.set(row.brand, {
        brand: row.brand,
        totalKeys: 0,
        staleKeys: 0,
        freshKeys: 0,
        lastRefreshedAt: null,
        earliestExpiresAt: null,
        latestExpiresAt: null,
        isStale: false,
        keys: [],
      });
    }
    const entry = brandMap.get(row.brand)!;
    entry.totalKeys += 1;
    if (stale) entry.staleKeys += 1;
    else entry.freshKeys += 1;

    if (
      row.refreshedAt &&
      (entry.lastRefreshedAt === null || row.refreshedAt > entry.lastRefreshedAt)
    ) {
      entry.lastRefreshedAt = row.refreshedAt;
    }

    if (entry.earliestExpiresAt === null || row.expiresAt < entry.earliestExpiresAt) {
      entry.earliestExpiresAt = row.expiresAt;
    }
    if (entry.latestExpiresAt === null || row.expiresAt > entry.latestExpiresAt) {
      entry.latestExpiresAt = row.expiresAt;
    }

    entry.keys.push({
      cacheKey: row.cacheKey,
      refreshedAt: row.refreshedAt,
      expiresAt: row.expiresAt,
      isStale: stale,
    });
  }

  const brandEntries = Array.from(brandMap.values());
  for (const entry of brandEntries) {
    entry.isStale = entry.freshKeys === 0;
  }
  return brandEntries.sort((a, b) => a.brand.localeCompare(b.brand));
}
