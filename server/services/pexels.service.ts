// Pexels API Service for fetching destination photos and videos
// API Docs: https://www.pexels.com/api/documentation/

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

class PexelsService {
  private baseUrl = 'https://api.pexels.com';
  private apiKey: string | null = null;

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
    const apiKey = this.getApiKey();
    const url = new URL(`${this.baseUrl}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => url.searchParams.append(key, value));

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': apiKey,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Pexels API error: ${response.status} - ${error}`);
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

    try {
      const response = await this.request<PexelsPhotoSearchResponse>('/v1/search', {
        query,
        per_page: perPage.toString(),
        page: page.toString(),
        orientation,
        size,
      });

      return response.photos.map((photo) => this.transformPhoto(photo));
    } catch (error) {
      console.error(`Pexels photo search error for "${query}":`, error);
      return [];
    }
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

    try {
      const response = await this.request<PexelsVideoSearchResponse>('/videos/search', {
        query,
        per_page: perPage.toString(),
        page: page.toString(),
        orientation,
        size,
      });

      return response.videos.map((video) => this.transformVideo(video));
    } catch (error) {
      console.error(`Pexels video search error for "${query}":`, error);
      return [];
    }
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
