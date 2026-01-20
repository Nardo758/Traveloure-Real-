// Unsplash API Service for fetching high-quality destination photos
// API Docs: https://unsplash.com/documentation

interface UnsplashPhoto {
  id: string;
  width: number;
  height: number;
  color: string;
  description: string | null;
  alt_description: string | null;
  urls: {
    raw: string;
    full: string;
    regular: string;
    small: string;
    thumb: string;
  };
  user: {
    id: string;
    name: string;
    username: string;
    portfolio_url: string | null;
    links: {
      html: string;
    };
  };
  links: {
    html: string;
    download: string;
    download_location: string;
  };
}

interface UnsplashSearchResponse {
  total: number;
  total_pages: number;
  results: UnsplashPhoto[];
}

export interface UnsplashMediaResult {
  source: 'unsplash';
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

class UnsplashService {
  private baseUrl = 'https://api.unsplash.com';
  private accessKey: string | null = null;

  private getAccessKey(): string {
    if (!this.accessKey) {
      this.accessKey = process.env.UNSPLASH_ACCESS_KEY || '';
      if (!this.accessKey) {
        throw new Error('UNSPLASH_ACCESS_KEY is not configured');
      }
    }
    return this.accessKey;
  }

  private async request<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    const accessKey = this.getAccessKey();
    const url = new URL(`${this.baseUrl}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => url.searchParams.append(key, value));

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Client-ID ${accessKey}`,
        'Accept-Version': 'v1',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Unsplash API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Search for photos by query (city name, landmark, etc.)
   */
  async searchPhotos(query: string, options: {
    perPage?: number;
    page?: number;
    orientation?: 'landscape' | 'portrait' | 'squarish';
    orderBy?: 'relevant' | 'latest';
  } = {}): Promise<UnsplashMediaResult[]> {
    const { perPage = 10, page = 1, orientation = 'landscape', orderBy = 'relevant' } = options;

    try {
      const response = await this.request<UnsplashSearchResponse>('/search/photos', {
        query,
        per_page: perPage.toString(),
        page: page.toString(),
        orientation,
        order_by: orderBy,
      });

      return response.results.map((photo) => this.transformPhoto(photo));
    } catch (error) {
      console.error(`Unsplash search error for "${query}":`, error);
      return [];
    }
  }

  /**
   * Get photos for a specific city/destination
   */
  async getCityPhotos(cityName: string, country: string, limit: number = 5): Promise<UnsplashMediaResult[]> {
    // Search with city + country for better results
    const query = `${cityName} ${country} travel`;
    return this.searchPhotos(query, { perPage: limit, orientation: 'landscape' });
  }

  /**
   * Get photos for a specific attraction/landmark
   */
  async getAttractionPhotos(attractionName: string, cityName: string, limit: number = 3): Promise<UnsplashMediaResult[]> {
    const query = `${attractionName} ${cityName}`;
    return this.searchPhotos(query, { perPage: limit });
  }

  /**
   * Get seasonal photos for a city
   */
  async getSeasonalPhotos(cityName: string, season: string, limit: number = 3): Promise<UnsplashMediaResult[]> {
    const query = `${cityName} ${season}`;
    return this.searchPhotos(query, { perPage: limit });
  }

  /**
   * Trigger download tracking (required by Unsplash guidelines)
   * Must be called when a photo is downloaded/displayed prominently
   */
  async trackDownload(downloadLocation: string): Promise<void> {
    try {
      await this.request<any>(downloadLocation.replace(this.baseUrl, ''));
    } catch (error) {
      console.error('Failed to track Unsplash download:', error);
    }
  }

  private transformPhoto(photo: UnsplashPhoto): UnsplashMediaResult {
    return {
      source: 'unsplash',
      mediaType: 'photo',
      url: photo.urls.regular, // 1080px width, good balance of quality/size
      thumbnailUrl: photo.urls.small, // 400px width
      width: photo.width,
      height: photo.height,
      photographerName: photo.user.name,
      photographerUrl: photo.user.links.html,
      sourceName: 'Unsplash',
      sourceUrl: photo.links.html,
      license: 'Unsplash License',
      description: photo.alt_description || photo.description,
    };
  }
}

export const unsplashService = new UnsplashService();
