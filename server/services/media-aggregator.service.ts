// Media Aggregator Service - Combines photos and videos from multiple sources
// Coordinates Unsplash, Pexels, and Google Places to create comprehensive media galleries

import { db } from "../db";
import { cityMediaCache, travelPulseCities, type InsertCityMediaCache, type CityMediaCache } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { unsplashService, type UnsplashMediaResult } from "./unsplash.service";
import { pexelsService, type PexelsMediaResult } from "./pexels.service";
import { googlePlacesPhotosService, type GooglePlacesPhotoResult } from "./google-places-photos.service";

export interface CityIntelligenceContext {
  cityName: string;
  country: string;
  cityId?: string;
  attractions?: string[];
  seasonalHighlights?: { month: number; highlight: string }[];
  hiddenGems?: string[];
}

export interface AggregatedMedia {
  photos: CityMediaCache[];
  videos: CityMediaCache[];
  heroImage: CityMediaCache | null;
  attractionPhotos: Record<string, CityMediaCache[]>;
  total: number;
}

class MediaAggregatorService {
  private cacheExpiryHours = 24 * 7; // Cache media for 7 days

  /**
   * Fetch and cache media for a city from all sources
   */
  async fetchAndCacheMedia(context: CityIntelligenceContext): Promise<AggregatedMedia> {
    console.log(`[MediaAggregator] Fetching media for ${context.cityName}, ${context.country}...`);

    // Check if we have fresh cached media
    const cachedMedia = await this.getCachedMedia(context.cityName, context.country);
    if (cachedMedia.total > 5 && this.isCacheFresh(cachedMedia)) {
      console.log(`[MediaAggregator] Using cached media (${cachedMedia.total} items)`);
      return cachedMedia;
    }

    // Fetch from all sources in parallel
    const [unsplashPhotos, pexelsPhotos, pexelsVideos, googlePhotos] = await Promise.all([
      this.fetchUnsplashPhotos(context),
      this.fetchPexelsPhotos(context),
      this.fetchPexelsVideos(context),
      this.fetchGooglePlacesPhotos(context),
    ]);

    // Clear old cache for this city
    await this.clearCityCache(context.cityName, context.country);

    // Store all media in cache
    const allMedia: InsertCityMediaCache[] = [];

    // Unsplash photos (mark first as hero)
    unsplashPhotos.forEach((photo, index) => {
      allMedia.push(this.transformUnsplashToCache(photo, context, index === 0 ? 'hero' : 'general', index === 0));
    });

    // Pexels photos
    pexelsPhotos.forEach((photo) => {
      if (photo.mediaType === 'photo') {
        allMedia.push(this.transformPexelsPhotoToCache(photo, context, 'general'));
      }
    });

    // Pexels videos
    pexelsVideos.forEach((video) => {
      if (video.mediaType === 'video') {
        allMedia.push(this.transformPexelsVideoToCache(video, context));
      }
    });

    // Google Places photos (for attractions)
    googlePhotos.forEach((photo) => {
      allMedia.push(this.transformGoogleToCache(photo, context));
    });

    // Insert all media into cache
    if (allMedia.length > 0) {
      await db.insert(cityMediaCache).values(allMedia);
      console.log(`[MediaAggregator] Cached ${allMedia.length} media items for ${context.cityName}`);
    }

    // Update city's primary images if we have a hero
    if (unsplashPhotos.length > 0) {
      await this.updateCityImages(context.cityId, unsplashPhotos[0]);
    }

    // Return fresh data
    return this.getCachedMedia(context.cityName, context.country);
  }

  /**
   * Get cached media for a city
   */
  async getCachedMedia(cityName: string, country: string): Promise<AggregatedMedia> {
    const media = await db.select()
      .from(cityMediaCache)
      .where(
        and(
          eq(cityMediaCache.cityName, cityName),
          eq(cityMediaCache.country, country),
          eq(cityMediaCache.isActive, true)
        )
      )
      .orderBy(desc(cityMediaCache.qualityScore));

    const photos = media.filter(m => m.mediaType === 'photo');
    const videos = media.filter(m => m.mediaType === 'video');
    const heroImage = photos.find(p => p.isPrimary) || photos[0] || null;

    // Group photos by attraction
    const attractionPhotos: Record<string, CityMediaCache[]> = {};
    photos.filter(p => p.attractionName).forEach(photo => {
      const name = photo.attractionName!;
      if (!attractionPhotos[name]) attractionPhotos[name] = [];
      attractionPhotos[name].push(photo);
    });

    return {
      photos,
      videos,
      heroImage,
      attractionPhotos,
      total: media.length,
    };
  }

  /**
   * Get media for display in city detail view
   */
  async getMediaForCity(cityName: string, country: string): Promise<{
    hero: CityMediaCache | null;
    gallery: CityMediaCache[];
    videos: CityMediaCache[];
    byAttraction: Record<string, CityMediaCache[]>;
  }> {
    const cached = await this.getCachedMedia(cityName, country);
    
    return {
      hero: cached.heroImage,
      gallery: cached.photos.slice(0, 12), // Limit to 12 for gallery
      videos: cached.videos.slice(0, 4), // Limit to 4 videos
      byAttraction: cached.attractionPhotos,
    };
  }

  // === Private methods ===

  private async fetchUnsplashPhotos(context: CityIntelligenceContext): Promise<UnsplashMediaResult[]> {
    try {
      const photos = await unsplashService.getCityPhotos(context.cityName, context.country, 8);
      console.log(`[MediaAggregator] Fetched ${photos.length} Unsplash photos`);
      return photos;
    } catch (error) {
      console.error('[MediaAggregator] Unsplash fetch error:', error);
      return [];
    }
  }

  private async fetchPexelsPhotos(context: CityIntelligenceContext): Promise<PexelsMediaResult[]> {
    try {
      const photos = await pexelsService.getCityPhotos(context.cityName, context.country, 6);
      console.log(`[MediaAggregator] Fetched ${photos.length} Pexels photos`);
      return photos;
    } catch (error) {
      console.error('[MediaAggregator] Pexels photo fetch error:', error);
      return [];
    }
  }

  private async fetchPexelsVideos(context: CityIntelligenceContext): Promise<PexelsMediaResult[]> {
    try {
      const videos = await pexelsService.getCityVideos(context.cityName, context.country, 4);
      console.log(`[MediaAggregator] Fetched ${videos.length} Pexels videos`);
      return videos;
    } catch (error) {
      console.error('[MediaAggregator] Pexels video fetch error:', error);
      return [];
    }
  }

  private async fetchGooglePlacesPhotos(context: CityIntelligenceContext): Promise<GooglePlacesPhotoResult[]> {
    try {
      if (context.attractions && context.attractions.length > 0) {
        const photos = await googlePlacesPhotosService.getMultipleAttractionPhotos(
          context.attractions.slice(0, 5),
          context.cityName
        );
        console.log(`[MediaAggregator] Fetched ${photos.length} Google Places photos`);
        return photos;
      }
      // Fallback to landmark photos
      const photos = await googlePlacesPhotosService.getCityLandmarkPhotos(
        context.cityName,
        context.country,
        5
      );
      console.log(`[MediaAggregator] Fetched ${photos.length} Google Places landmark photos`);
      return photos;
    } catch (error) {
      console.error('[MediaAggregator] Google Places fetch error:', error);
      return [];
    }
  }

  private transformUnsplashToCache(
    photo: UnsplashMediaResult,
    context: CityIntelligenceContext,
    contextType: string,
    isPrimary: boolean
  ): InsertCityMediaCache {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.cacheExpiryHours);

    return {
      cityId: context.cityId,
      cityName: context.cityName,
      country: context.country,
      source: 'unsplash',
      mediaType: 'photo',
      url: photo.url,
      thumbnailUrl: photo.thumbnailUrl,
      width: photo.width,
      height: photo.height,
      context: contextType,
      contextQuery: `${context.cityName} ${context.country} travel`,
      photographerName: photo.photographerName,
      photographerUrl: photo.photographerUrl,
      sourceName: photo.sourceName,
      sourceUrl: photo.sourceUrl,
      license: photo.license,
      qualityScore: isPrimary ? 100 : 80,
      isPrimary,
      expiresAt,
      isActive: true,
    };
  }

  private transformPexelsPhotoToCache(
    photo: PexelsMediaResult,
    context: CityIntelligenceContext,
    contextType: string
  ): InsertCityMediaCache {
    if (photo.mediaType !== 'photo') throw new Error('Expected photo');
    
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.cacheExpiryHours);

    return {
      cityId: context.cityId,
      cityName: context.cityName,
      country: context.country,
      source: 'pexels',
      mediaType: 'photo',
      url: photo.url,
      thumbnailUrl: photo.thumbnailUrl,
      width: photo.width,
      height: photo.height,
      context: contextType,
      contextQuery: `${context.cityName} ${context.country} travel`,
      photographerName: photo.photographerName,
      photographerUrl: photo.photographerUrl,
      sourceName: photo.sourceName,
      sourceUrl: photo.sourceUrl,
      license: photo.license,
      qualityScore: 70,
      isPrimary: false,
      expiresAt,
      isActive: true,
    };
  }

  private transformPexelsVideoToCache(
    video: PexelsMediaResult,
    context: CityIntelligenceContext
  ): InsertCityMediaCache {
    if (video.mediaType !== 'video') throw new Error('Expected video');
    
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.cacheExpiryHours);

    return {
      cityId: context.cityId,
      cityName: context.cityName,
      country: context.country,
      source: 'pexels',
      mediaType: 'video',
      url: video.url,
      thumbnailUrl: video.thumbnailUrl,
      previewUrl: video.previewUrl,
      width: video.width,
      height: video.height,
      duration: video.duration,
      context: 'general',
      contextQuery: `${context.cityName} travel`,
      photographerName: video.photographerName,
      photographerUrl: video.photographerUrl,
      sourceName: video.sourceName,
      sourceUrl: video.sourceUrl,
      license: video.license,
      qualityScore: 75,
      isPrimary: false,
      expiresAt,
      isActive: true,
    };
  }

  private transformGoogleToCache(
    photo: GooglePlacesPhotoResult,
    context: CityIntelligenceContext
  ): InsertCityMediaCache {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.cacheExpiryHours);

    return {
      cityId: context.cityId,
      cityName: context.cityName,
      country: context.country,
      source: 'google_places',
      mediaType: 'photo',
      url: photo.url,
      thumbnailUrl: photo.thumbnailUrl,
      width: photo.width,
      height: photo.height,
      context: 'attraction',
      contextQuery: photo.attractionName,
      attractionName: photo.attractionName,
      photographerName: photo.photographerName,
      photographerUrl: photo.photographerUrl,
      sourceName: photo.sourceName,
      sourceUrl: photo.sourceUrl,
      license: photo.license,
      googlePlaceId: photo.googlePlaceId,
      qualityScore: 85, // Google Places often has better quality for attractions
      isPrimary: false,
      expiresAt,
      isActive: true,
    };
  }

  private async clearCityCache(cityName: string, country: string): Promise<void> {
    await db.delete(cityMediaCache)
      .where(
        and(
          eq(cityMediaCache.cityName, cityName),
          eq(cityMediaCache.country, country)
        )
      );
  }

  private async updateCityImages(cityId: string | undefined, heroPhoto: UnsplashMediaResult): Promise<void> {
    if (!cityId) return;

    try {
      await db.update(travelPulseCities)
        .set({
          imageUrl: heroPhoto.url,
          thumbnailUrl: heroPhoto.thumbnailUrl,
          lastUpdated: new Date(),
        })
        .where(eq(travelPulseCities.id, cityId));
    } catch (error) {
      console.error('[MediaAggregator] Failed to update city images:', error);
    }
  }

  private isCacheFresh(cached: AggregatedMedia): boolean {
    if (cached.photos.length === 0) return false;
    
    // Check if oldest item is still valid
    const oldestPhoto = cached.photos[cached.photos.length - 1];
    if (!oldestPhoto.expiresAt) return true;
    
    return new Date() < new Date(oldestPhoto.expiresAt);
  }
}

export const mediaAggregatorService = new MediaAggregatorService();
