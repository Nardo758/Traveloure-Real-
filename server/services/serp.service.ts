/**
 * SERP API Service
 * Searches for restaurants, attractions, venues using SerpApi
 * Used to enrich AI-generated recommendations with actionable booking data
 */

interface SerpSearchResult {
  title: string;
  link?: string;
  snippet?: string;
  rating?: number;
  reviews?: number;
  price?: string;
  address?: string;
  phone?: string;
  hours?: string;
  thumbnail?: string;
  type?: string;
  placeId?: string;
}

interface SerpLocalResult {
  position: number;
  title: string;
  place_id?: string;
  data_id?: string;
  data_cid?: string;
  reviews_link?: string;
  photos_link?: string;
  gps_coordinates?: { latitude: number; longitude: number };
  place_id_search?: string;
  provider_id?: string;
  rating?: number;
  reviews?: number;
  price?: string;
  type?: string;
  types?: string[];
  address?: string;
  open_state?: string;
  hours?: string;
  operating_hours?: Record<string, string>;
  phone?: string;
  website?: string;
  thumbnail?: string;
  service_options?: Record<string, boolean>;
}

interface SerpApiResponse {
  search_metadata?: {
    status: string;
    id: string;
  };
  local_results?: SerpLocalResult[];
  organic_results?: Array<{
    position: number;
    title: string;
    link: string;
    snippet?: string;
    thumbnail?: string;
  }>;
  error?: string;
}

export interface EnrichedVenue {
  id: string;
  name: string;
  type: 'restaurant' | 'attraction' | 'nightlife' | 'hotel' | 'activity';
  rating?: number;
  reviewCount?: number;
  priceLevel?: string;
  address?: string;
  phone?: string;
  website?: string;
  hours?: string;
  thumbnail?: string;
  bookingUrl?: string;
  description?: string;
  coordinates?: { lat: number; lng: number };
  source: 'serp' | 'viator' | 'amadeus' | 'opentable';
}

class SerpService {
  private apiKey: string | undefined;
  private baseUrl = 'https://serpapi.com/search.json';

  constructor() {
    this.apiKey = process.env.SERP_API_KEY;
  }

  private async makeRequest(params: Record<string, string>): Promise<SerpApiResponse | null> {
    if (!this.apiKey) {
      console.warn('[SERP] API key not configured');
      return null;
    }

    const searchParams = new URLSearchParams({
      ...params,
      api_key: this.apiKey,
    });

    try {
      const response = await fetch(`${this.baseUrl}?${searchParams.toString()}`);
      
      if (!response.ok) {
        console.error(`[SERP] API error: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json() as SerpApiResponse;
      
      if (data.error) {
        console.error(`[SERP] API returned error: ${data.error}`);
        return null;
      }

      return data;
    } catch (error) {
      console.error('[SERP] Request failed:', error);
      return null;
    }
  }

  async searchRestaurants(city: string, country: string, query?: string): Promise<EnrichedVenue[]> {
    const searchQuery = query 
      ? `${query} restaurant ${city} ${country}`
      : `best restaurants ${city} ${country}`;

    const data = await this.makeRequest({
      engine: 'google_maps',
      q: searchQuery,
      type: 'search',
      hl: 'en',
    });

    if (!data?.local_results) {
      return [];
    }

    return data.local_results.slice(0, 10).map((result, idx) => ({
      id: result.place_id || result.data_id || `serp-rest-${idx}`,
      name: result.title,
      type: 'restaurant' as const,
      rating: result.rating,
      reviewCount: result.reviews,
      priceLevel: result.price,
      address: result.address,
      phone: result.phone,
      website: result.website,
      hours: result.hours || result.open_state,
      thumbnail: result.thumbnail,
      coordinates: result.gps_coordinates 
        ? { lat: result.gps_coordinates.latitude, lng: result.gps_coordinates.longitude }
        : undefined,
      source: 'serp' as const,
    }));
  }

  async searchAttractions(city: string, country: string, query?: string): Promise<EnrichedVenue[]> {
    const searchQuery = query 
      ? `${query} ${city} ${country}`
      : `top attractions things to do ${city} ${country}`;

    const data = await this.makeRequest({
      engine: 'google_maps',
      q: searchQuery,
      type: 'search',
      hl: 'en',
    });

    if (!data?.local_results) {
      return [];
    }

    return data.local_results.slice(0, 10).map((result, idx) => ({
      id: result.place_id || result.data_id || `serp-attr-${idx}`,
      name: result.title,
      type: 'attraction' as const,
      rating: result.rating,
      reviewCount: result.reviews,
      priceLevel: result.price,
      address: result.address,
      phone: result.phone,
      website: result.website,
      hours: result.hours || result.open_state,
      thumbnail: result.thumbnail,
      coordinates: result.gps_coordinates 
        ? { lat: result.gps_coordinates.latitude, lng: result.gps_coordinates.longitude }
        : undefined,
      source: 'serp' as const,
    }));
  }

  async searchNightlife(city: string, country: string): Promise<EnrichedVenue[]> {
    const data = await this.makeRequest({
      engine: 'google_maps',
      q: `best bars nightclubs nightlife ${city} ${country}`,
      type: 'search',
      hl: 'en',
    });

    if (!data?.local_results) {
      return [];
    }

    return data.local_results.slice(0, 10).map((result, idx) => ({
      id: result.place_id || result.data_id || `serp-night-${idx}`,
      name: result.title,
      type: 'nightlife' as const,
      rating: result.rating,
      reviewCount: result.reviews,
      priceLevel: result.price,
      address: result.address,
      phone: result.phone,
      website: result.website,
      hours: result.hours || result.open_state,
      thumbnail: result.thumbnail,
      coordinates: result.gps_coordinates 
        ? { lat: result.gps_coordinates.latitude, lng: result.gps_coordinates.longitude }
        : undefined,
      source: 'serp' as const,
    }));
  }

  async searchVenueByName(name: string, city: string, country: string): Promise<EnrichedVenue | null> {
    const data = await this.makeRequest({
      engine: 'google_maps',
      q: `${name} ${city} ${country}`,
      type: 'search',
      hl: 'en',
    });

    if (!data?.local_results?.[0]) {
      return null;
    }

    const result = data.local_results[0];
    
    return {
      id: result.place_id || result.data_id || 'serp-venue-0',
      name: result.title,
      type: this.inferVenueType(result.types || []),
      rating: result.rating,
      reviewCount: result.reviews,
      priceLevel: result.price,
      address: result.address,
      phone: result.phone,
      website: result.website,
      hours: result.hours || result.open_state,
      thumbnail: result.thumbnail,
      coordinates: result.gps_coordinates 
        ? { lat: result.gps_coordinates.latitude, lng: result.gps_coordinates.longitude }
        : undefined,
      source: 'serp' as const,
    };
  }

  async enrichAIRecommendation(
    aiRecommendation: { name: string; type: string; reason?: string },
    city: string,
    country: string
  ): Promise<EnrichedVenue | null> {
    const venue = await this.searchVenueByName(aiRecommendation.name, city, country);
    
    if (venue) {
      venue.description = aiRecommendation.reason;
    }
    
    return venue;
  }

  async enrichMultipleRecommendations(
    recommendations: Array<{ name: string; type: string; reason?: string }>,
    city: string,
    country: string
  ): Promise<EnrichedVenue[]> {
    const enrichedVenues: EnrichedVenue[] = [];
    
    for (const rec of recommendations.slice(0, 5)) {
      const venue = await this.enrichAIRecommendation(rec, city, country);
      if (venue) {
        enrichedVenues.push(venue);
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    return enrichedVenues;
  }

  private inferVenueType(types: string[]): 'restaurant' | 'attraction' | 'nightlife' | 'hotel' | 'activity' {
    const typeString = types.join(' ').toLowerCase();
    
    if (typeString.includes('restaurant') || typeString.includes('food') || typeString.includes('cafe')) {
      return 'restaurant';
    }
    if (typeString.includes('bar') || typeString.includes('club') || typeString.includes('nightlife')) {
      return 'nightlife';
    }
    if (typeString.includes('hotel') || typeString.includes('lodging')) {
      return 'hotel';
    }
    if (typeString.includes('museum') || typeString.includes('park') || typeString.includes('tourist')) {
      return 'attraction';
    }
    
    return 'activity';
  }
}

export const serpService = new SerpService();
