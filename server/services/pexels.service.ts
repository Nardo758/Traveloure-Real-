// Pexels API Service for fetching destination photos and videos
// API Docs: https://www.pexels.com/api/documentation/
import { reportProviderResult, outcomeFromHttpStatus } from "./provider-health.service";
import {
  pexelsBackoffMaxMs,
  pexelsBackoffMinMs,
  pexelsCacheMaxEntries,
  pexelsCacheTtlMs,
  pexelsEmptyTtlMs,
} from "../config/pexels.config";

/**
 * QA round 4 R4-10: how long Pexels asked us to wait after a 429, read from its own headers — `Retry-After`
 * (seconds or an HTTP date) first, then `X-Ratelimit-Reset` (a Unix time in seconds). Null when neither names a
 * future time; the caller then backs off on its own doubling schedule. Pure.
 */
export function rateLimitWaitMs(headers: { get(name: string): string | null }, now: number): number | null {
  const retryAfter = headers.get("retry-after");
  if (retryAfter != null && retryAfter.trim() !== "") {
    const secs = Number(retryAfter);
    if (Number.isFinite(secs) && secs >= 0) return secs > 0 ? secs * 1000 : null;
    const at = Date.parse(retryAfter);
    if (Number.isFinite(at) && at > now) return at - now;
  }
  const reset = Number(headers.get("x-ratelimit-reset"));
  if (Number.isFinite(reset) && reset * 1000 > now) return reset * 1000 - now;
  return null;
}

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  photographer_id: number;
  avg_color: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
    portrait: string;
    landscape: string;
    tiny: string;
  };
  alt: string;
}

interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  url: string;
  duration: number;
  user: {
    id: number;
    name: string;
    url: string;
  };
  video_files: {
    id: number;
    quality: string;
    file_type: string;
    width: number;
    height: number;
    link: string;
  }[];
  video_pictures: {
    id: number;
    picture: string;
    nr: number;
  }[];
}

interface PexelsPhotoSearchResponse {
  total_results: number;
  page: number;
  per_page: number;
  photos: PexelsPhoto[];
  next_page?: string;
}

interface PexelsVideoSearchResponse {
  total_results: number;
  page: number;
  per_page: number;
  videos: PexelsVideo[];
  next_page?: string;
}

export interface PexelsPhotoResult {
  source: 'pexels';
  mediaType: 'photo';
  url: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  photographerName: string;
  photographerUrl: string;
  sourceName: string;
  sourceUrl: string;
  license: string;
  description: string | null;
}

export interface PexelsVideoResult {
  source: 'pexels';
  mediaType: 'video';
  url: string;
  thumbnailUrl: string;
  previewUrl: string;
  width: number;
  height: number;
  duration: number;
  photographerName: string;
  photographerUrl: string;
  sourceName: string;
  sourceUrl: string;
  license: string;
}

export type PexelsMediaResult = PexelsPhotoResult | PexelsVideoResult;

class PexelsRateLimitedError extends Error {
  status = 429;
}

export class PexelsService {
  private baseUrl = 'https://api.pexels.com';
  private apiKey: string | null = null;
  private readonly now: () => number;
  /**
   * QA round 4 R4-10: after a 429 no search is sent until this time; a search inside the window answers [] with no
   * call. The wait is Pexels's own (`rateLimitWaitMs`), else a doubling backoff from config, reset by a success.
   */
  private blockedUntil = 0;
  private backoffMs = 0;
  /** One answer per query (results for `PEXELS_CACHE_TTL_MS`, an empty answer or a failure for `PEXELS_EMPTY_TTL_MS`). */
  private cache = new Map<string, { expires: number; value: unknown[] }>();
  /** The same query asked twice at once makes one call. */
  private inflight = new Map<string, Promise<unknown[]>>();

  constructor(opts: { now?: () => number } = {}) {
    this.now = opts.now ?? Date.now;
  }

  /** True while a 429's wait is running. */
  isRateLimited(): boolean {
    return this.now() < this.blockedUntil;
  }

  private remember(key: string, value: unknown[], ttlMs: number) {
    if (ttlMs <= 0) return;
    this.cache.delete(key);
    this.cache.set(key, { expires: this.now() + ttlMs, value });
    const max = pexelsCacheMaxEntries();
    while (this.cache.size > max) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  private onRateLimited(headers: { get(name: string): string | null } | null) {
    const now = this.now();
    const told = headers ? rateLimitWaitMs(headers, now) : null;
    this.backoffMs = this.backoffMs > 0 ? Math.min(this.backoffMs * 2, pexelsBackoffMaxMs()) : pexelsBackoffMinMs();
    const wait = told != null ? Math.min(told, pexelsBackoffMaxMs()) : this.backoffMs;
    this.blockedUntil = now + wait;
    console.warn(`[pexels] 429 rate limited; no Pexels search for ${Math.round(wait / 1000)}s`);
  }

  /**
   * One cached, rate-limit-aware search. Never throws: a failure answers [] (and is reported to provider health once,
   * not once per card while a 429's wait runs).
   */
  private async cachedSearch<R>(
    endpoint: string,
    params: Record<string, string>,
    pick: (json: any) => R[],
    opts: { report: boolean; label: string },
  ): Promise<R[]> {
    const key = `${endpoint}?${Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&")}`;
    const hit = this.cache.get(key);
    if (hit && hit.expires > this.now()) return hit.value as R[];
    if (hit) this.cache.delete(key);
    if (this.isRateLimited()) return [];
    const running = this.inflight.get(key);
    if (running) return running as Promise<R[]>;
    const call = (async (): Promise<R[]> => {
      try {
        const json = await this.request<any>(endpoint, params);
        const results = pick(json);
        this.backoffMs = 0;
        if (opts.report) reportProviderResult("pexels", results.length > 0 ? "ok" : "empty");
        this.remember(key, results, results.length > 0 ? pexelsCacheTtlMs() : pexelsEmptyTtlMs());
        return results;
      } catch (error) {
        const status = (error as any)?.status;
        if (error instanceof PexelsRateLimitedError) return [];
        if (opts.report) {
          reportProviderResult("pexels", status ? outcomeFromHttpStatus(status) : "error", error instanceof Error ? error.message : String(error));
        }
        if (status !== 429) {
          console.error(`Pexels ${opts.label} error for "${params.query}":`, error);
          this.remember(key, [], pexelsEmptyTtlMs());
        }
        return [];
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, call);
    return call;
  }

  private getApiKey(): string {
    if (!this.apiKey) {
      this.apiKey = process.env.PEXELS_API_KEY || '';
      if (!this.apiKey) {
        throw new Error('PEXELS_API_KEY is not configured');
      }
    }
    return this.apiKey;
  }

  private async request<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    if (this.isRateLimited()) throw new PexelsRateLimitedError("Pexels rate limit wait is running");
    const apiKey = this.getApiKey();
    const url = new URL(`${this.baseUrl}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => url.searchParams.append(key, value));

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': apiKey,
      },
    });

    if (!response.ok) {
      if (response.status === 429) this.onRateLimited(response.headers);
      const error = await response.text();
      const err = new Error(`Pexels API error: ${response.status} - ${error}`) as Error & { status?: number };
      err.status = response.status;
      throw err;
    }

    return response.json();
  }

  /**
   * Search for photos by query
   */
  async searchPhotos(query: string, options: {
    perPage?: number;
    page?: number;
    orientation?: 'landscape' | 'portrait' | 'square';
    size?: 'large' | 'medium' | 'small';
  } = {}): Promise<PexelsPhotoResult[]> {
    const { perPage = 10, page = 1, orientation = 'landscape', size = 'medium' } = options;
    return this.cachedSearch<PexelsPhotoResult>(
      '/v1/search',
      { query, per_page: perPage.toString(), page: page.toString(), orientation, size },
      (json: PexelsPhotoSearchResponse) => (json.photos ?? []).map((photo) => this.transformPhoto(photo)),
      { report: true, label: 'photo search' },
    );
  }

  /**
   * Search for videos by query
   */
  async searchVideos(query: string, options: {
    perPage?: number;
    page?: number;
    orientation?: 'landscape' | 'portrait' | 'square';
    size?: 'large' | 'medium' | 'small';
  } = {}): Promise<PexelsVideoResult[]> {
    const { perPage = 5, page = 1, orientation = 'landscape', size = 'medium' } = options;
    return this.cachedSearch<PexelsVideoResult>(
      '/videos/search',
      { query, per_page: perPage.toString(), page: page.toString(), orientation, size },
      (json: PexelsVideoSearchResponse) => (json.videos ?? []).map((video) => this.transformVideo(video)),
      { report: false, label: 'video search' },
    );
  }

  /**
   * Get photos for a specific city/destination
   */
  async getCityPhotos(cityName: string, country: string, limit: number = 5): Promise<PexelsPhotoResult[]> {
    const query = `${cityName} ${country} travel`;
    return this.searchPhotos(query, { perPage: limit, orientation: 'landscape' });
  }

  /**
   * Get videos for a specific city/destination
   */
  async getCityVideos(cityName: string, country: string, limit: number = 3): Promise<PexelsVideoResult[]> {
    const query = `${cityName} travel`;
    return this.searchVideos(query, { perPage: limit, orientation: 'landscape' });
  }

  /**
   * Get photos and videos for attractions
   */
  async getAttractionMedia(attractionName: string, cityName: string): Promise<PexelsMediaResult[]> {
    const query = `${attractionName} ${cityName}`;
    const [photos, videos] = await Promise.all([
      this.searchPhotos(query, { perPage: 2 }),
      this.searchVideos(query, { perPage: 1 }),
    ]);
    return [...photos, ...videos];
  }

  private transformPhoto(photo: PexelsPhoto): PexelsPhotoResult {
    return {
      source: 'pexels',
      mediaType: 'photo',
      url: photo.src.large, // Good balance of quality/size
      thumbnailUrl: photo.src.medium,
      width: photo.width,
      height: photo.height,
      photographerName: photo.photographer,
      photographerUrl: photo.photographer_url,
      sourceName: 'Pexels',
      sourceUrl: photo.url,
      license: 'Pexels License',
      description: photo.alt || null,
    };
  }

  private transformVideo(video: PexelsVideo): PexelsVideoResult {
    // Get the best quality video file that's reasonable size (prefer HD)
    const sortedFiles = [...video.video_files].sort((a, b) => {
      const qualityOrder: Record<string, number> = { 'hd': 2, 'sd': 1, 'hls': 0 };
      return (qualityOrder[b.quality] || 0) - (qualityOrder[a.quality] || 0);
    });
    const bestFile = sortedFiles.find(f => f.width <= 1920) || sortedFiles[0];
    const previewImage = video.video_pictures[0]?.picture || '';

    return {
      source: 'pexels',
      mediaType: 'video',
      url: bestFile?.link || '',
      thumbnailUrl: previewImage,
      previewUrl: previewImage,
      width: bestFile?.width || video.width,
      height: bestFile?.height || video.height,
      duration: video.duration,
      photographerName: video.user.name,
      photographerUrl: video.user.url,
      sourceName: 'Pexels',
      sourceUrl: video.url,
      license: 'Pexels License',
    };
  }
}

export const pexelsService = new PexelsService();
