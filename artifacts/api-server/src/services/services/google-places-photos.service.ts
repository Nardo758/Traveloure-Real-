// Google Places Photos Service for fetching real attraction photos
// Uses Google Maps API that's already configured in the project
import { reportProviderResult } from "./provider-health.service";

interface PlaceSearchResult {
  place_id: string;
  name: string;
  formatted_address?: string;
  photos?: {
    photo_reference: string;
    height: number;
    width: number;
    html_attributions: string[];
  }[];
}

interface PlaceDetailsResult {
  place_id: string;
  name: string;
  formatted_address?: string;
  photos?: {
    photo_reference: string;
    height: number;
    width: number;
    html_attributions: string[];
  }[];
}

export interface GooglePlacesPhotoResult {
  source: 'google_places';
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
  googlePlaceId: string;
  attractionName: string;
  htmlAttributions: string[]; // Required by Google - must display exactly as provided
}

class GooglePlacesPhotosService {
  private apiKey: string | null = null;

  private getApiKey(): string {
    if (!this.apiKey) {
      this.apiKey = process.env.GOOGLE_MAPS_API_KEY || '';
      if (!this.apiKey) {
        throw new Error('GOOGLE_MAPS_API_KEY is not configured');
      }
    }
    return this.apiKey;
  }

  /**
   * Build a Google Places Photo URL
   */
  private buildPhotoUrl(photoReference: string, maxWidth: number = 800): string {
    const apiKey = this.getApiKey();
    return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxWidth}&photo_reference=${photoReference}&key=${apiKey}`;
  }

  /**
   * Search for a place and get its photos
   */
  async searchPlacePhotos(query: string, options: {
    maxPhotos?: number;
  } = {}): Promise<GooglePlacesPhotoResult[]> {
    const { maxPhotos = 3 } = options;
    const apiKey = this.getApiKey();

    try {
      // Text search to find the place
      const searchUrl = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
      searchUrl.searchParams.append('query', query);
      searchUrl.searchParams.append('key', apiKey);

      const searchResponse = await fetch(searchUrl.toString());
      if (!searchResponse.ok) {
        reportProviderResult("google_places", "error", `HTTP ${searchResponse.status}`);
        throw new Error(`Google Places search failed: ${searchResponse.status}`);
      }

      const searchData = await searchResponse.json();

      // Google Places returns 200 OK even on billing/quota failures — the real signal is the body's
      // `status` field (OK / ZERO_RESULTS / REQUEST_DENIED / OVER_QUERY_LIMIT / INVALID_REQUEST). Not
      // checking it is exactly how a billing-denied account silently looks like "no results" (§13 —
      // the Google Places REQUEST_DENIED evidence this registry closes).
      if (searchData.status === "REQUEST_DENIED") {
        reportProviderResult("google_places", "auth", searchData.error_message || "REQUEST_DENIED");
        return [];
      }
      if (searchData.status === "OVER_QUERY_LIMIT") {
        reportProviderResult("google_places", "quota", searchData.error_message || "OVER_QUERY_LIMIT");
        return [];
      }
      if (searchData.status && searchData.status !== "OK" && searchData.status !== "ZERO_RESULTS") {
        reportProviderResult("google_places", "error", searchData.error_message || searchData.status);
        return [];
      }

      if (!searchData.results || searchData.results.length === 0) {
        reportProviderResult("google_places", "empty");
        return [];
      }

      // Get first result's photos
      const place: PlaceSearchResult = searchData.results[0];
      if (!place.photos || place.photos.length === 0) {
        reportProviderResult("google_places", "empty");
        return [];
      }

      reportProviderResult("google_places", "ok");
      // Transform photos to our format
      return place.photos.slice(0, maxPhotos).map((photo) => this.transformPhoto(photo, place));
    } catch (error) {
      reportProviderResult("google_places", "error", error instanceof Error ? error.message : String(error));
      console.error(`Google Places search error for "${query}":`, error);
      return [];
    }
  }

  /**
   * Get photos for a specific attraction in a city
   */
  async getAttractionPhotos(attractionName: string, cityName: string, limit: number = 3): Promise<GooglePlacesPhotoResult[]> {
    const query = `${attractionName} ${cityName}`;
    return this.searchPlacePhotos(query, { maxPhotos: limit });
  }

  /**
   * Get photos for multiple attractions
   */
  async getMultipleAttractionPhotos(attractions: string[], cityName: string): Promise<GooglePlacesPhotoResult[]> {
    const results: GooglePlacesPhotoResult[] = [];
    
    // Process in parallel with limit
    const promises = attractions.slice(0, 5).map(async (attraction) => {
      const photos = await this.getAttractionPhotos(attraction, cityName, 2);
      return photos;
    });

    const allPhotos = await Promise.all(promises);
    allPhotos.forEach((photos) => results.push(...photos));

    return results;
  }

  /**
   * Get landmark photos for a city
   */
  async getCityLandmarkPhotos(cityName: string, country: string, limit: number = 5): Promise<GooglePlacesPhotoResult[]> {
    // Search for famous landmarks in the city
    const query = `famous landmarks ${cityName} ${country}`;
    return this.searchPlacePhotos(query, { maxPhotos: limit });
  }

  private transformPhoto(
    photo: { photo_reference: string; height: number; width: number; html_attributions: string[] },
    place: PlaceSearchResult
  ): GooglePlacesPhotoResult {
    // Extract photographer name from HTML attribution if available
    let photographerName = 'Google Maps User';
    let photographerUrl = '';
    
    if (photo.html_attributions && photo.html_attributions.length > 0) {
      const attribution = photo.html_attributions[0];
      // Try to extract name and URL from HTML like: <a href="url">Name</a>
      const nameMatch = attribution.match(/>([^<]+)</);
      const urlMatch = attribution.match(/href="([^"]+)"/);
      if (nameMatch) photographerName = nameMatch[1];
      if (urlMatch) photographerUrl = urlMatch[1];
    }

    return {
      source: 'google_places',
      mediaType: 'photo',
      url: this.buildPhotoUrl(photo.photo_reference, 800),
      thumbnailUrl: this.buildPhotoUrl(photo.photo_reference, 400),
      width: photo.width,
      height: photo.height,
      photographerName,
      photographerUrl,
      sourceName: 'Google Maps',
      sourceUrl: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
      license: 'Google Maps Terms of Service',
      googlePlaceId: place.place_id,
      attractionName: place.name,
      htmlAttributions: photo.html_attributions || [], // Required by Google - must display exactly as provided
    };
  }
}

export const googlePlacesPhotosService = new GooglePlacesPhotosService();
