import { sharedCache } from "../shared-cache.service";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function getCachedFeed(brand: string, cacheKey: string): Promise<any[] | null> {
  const data = await sharedCache.get<any[]>(brand, cacheKey);
  return data;
}

export async function setCachedFeed(brand: string, cacheKey: string, data: any[]): Promise<void> {
  await sharedCache.set(brand, cacheKey, data, CACHE_TTL_MS);
}
