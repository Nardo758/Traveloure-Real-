/**
 * Fever Partner API Service
 * Integrates with Fever (feverup.com) for event discovery and ticketing
 * 
 * API Documentation: https://business.feverup.com/
 * Partner Portal: https://app.impact.com (after partner approval)
 * 
 * This service provides:
 * - Event discovery by city/destination
 * - Event search by keyword
 * - Event details for booking integration
 * - Affiliate tracking for commission
 */

export interface FeverEvent {
  id: string;
  title: string;
  slug: string;
  description?: string;
  shortDescription?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  category: string;
  subcategory?: string;
  city: string;
  cityCode: string;
  country: string;
  venue?: {
    name: string;
    address?: string;
    coordinates?: { lat: number; lng: number };
  };
  dates: {
    startDate: string;
    endDate?: string;
    sessions?: Array<{
      id: string;
      datetime: string;
      available: boolean;
    }>;
  };
  pricing: {
    currency: string;
    minPrice?: number;
    maxPrice?: number;
    priceRange?: string;
  };
  rating?: number;
  reviewCount?: number;
  isFree: boolean;
  isSoldOut: boolean;
  bookingUrl: string;
  affiliateUrl?: string;
  tags?: string[];
  highlights?: string[];
}

export interface FeverCity {
  code: string;
  name: string;
  country: string;
  countryCode: string;
  timezone: string;
  coordinates?: { lat: number; lng: number };
  eventCount?: number;
}

export interface FeverSearchParams {
  city: string;
  query?: string;
  category?: string;
  startDate?: string;
  endDate?: string;
  minPrice?: number;
  maxPrice?: number;
  isFree?: boolean;
  page?: number;
  limit?: number;
  sortBy?: 'date' | 'popularity' | 'price' | 'rating';
}

export interface FeverSearchResponse {
  events: FeverEvent[];
  total: number;
  page: number;
  totalPages: number;
  city: FeverCity;
}

interface FeverApiConfig {
  apiKey?: string;
  partnerId?: string;
  baseUrl: string;
}

class FeverService {
  private config: FeverApiConfig;
  private isConfigured: boolean = false;

  // Fever operates in these cities (launch markets)
  private static readonly SUPPORTED_CITIES: FeverCity[] = [
    { code: 'MAD', name: 'Madrid', country: 'Spain', countryCode: 'ES', timezone: 'Europe/Madrid' },
    { code: 'BCN', name: 'Barcelona', country: 'Spain', countryCode: 'ES', timezone: 'Europe/Madrid' },
    { code: 'LON', name: 'London', country: 'United Kingdom', countryCode: 'GB', timezone: 'Europe/London' },
    { code: 'NYC', name: 'New York', country: 'United States', countryCode: 'US', timezone: 'America/New_York' },
    { code: 'LAX', name: 'Los Angeles', country: 'United States', countryCode: 'US', timezone: 'America/Los_Angeles' },
    { code: 'PAR', name: 'Paris', country: 'France', countryCode: 'FR', timezone: 'Europe/Paris' },
    { code: 'LIS', name: 'Lisbon', country: 'Portugal', countryCode: 'PT', timezone: 'Europe/Lisbon' },
    { code: 'POR', name: 'Porto', country: 'Portugal', countryCode: 'PT', timezone: 'Europe/Lisbon' },
    { code: 'MIL', name: 'Milan', country: 'Italy', countryCode: 'IT', timezone: 'Europe/Rome' },
    { code: 'ROM', name: 'Rome', country: 'Italy', countryCode: 'IT', timezone: 'Europe/Rome' },
    { code: 'BER', name: 'Berlin', country: 'Germany', countryCode: 'DE', timezone: 'Europe/Berlin' },
    { code: 'AMS', name: 'Amsterdam', country: 'Netherlands', countryCode: 'NL', timezone: 'Europe/Amsterdam' },
    { code: 'DUB', name: 'Dublin', country: 'Ireland', countryCode: 'IE', timezone: 'Europe/Dublin' },
    { code: 'EDI', name: 'Edinburgh', country: 'United Kingdom', countryCode: 'GB', timezone: 'Europe/London' },
    { code: 'MEX', name: 'Mexico City', country: 'Mexico', countryCode: 'MX', timezone: 'America/Mexico_City' },
    { code: 'BOG', name: 'Bogotá', country: 'Colombia', countryCode: 'CO', timezone: 'America/Bogota' },
    { code: 'BUE', name: 'Buenos Aires', country: 'Argentina', countryCode: 'AR', timezone: 'America/Argentina/Buenos_Aires' },
    { code: 'SAO', name: 'São Paulo', country: 'Brazil', countryCode: 'BR', timezone: 'America/Sao_Paulo' },
    { code: 'SYD', name: 'Sydney', country: 'Australia', countryCode: 'AU', timezone: 'Australia/Sydney' },
    { code: 'SIN', name: 'Singapore', country: 'Singapore', countryCode: 'SG', timezone: 'Asia/Singapore' },
    { code: 'HKG', name: 'Hong Kong', country: 'Hong Kong', countryCode: 'HK', timezone: 'Asia/Hong_Kong' },
    { code: 'TYO', name: 'Tokyo', country: 'Japan', countryCode: 'JP', timezone: 'Asia/Tokyo' },
    { code: 'SEO', name: 'Seoul', country: 'South Korea', countryCode: 'KR', timezone: 'Asia/Seoul' },
    { code: 'BOM', name: 'Mumbai', country: 'India', countryCode: 'IN', timezone: 'Asia/Kolkata' },
    { code: 'DEL', name: 'Delhi', country: 'India', countryCode: 'IN', timezone: 'Asia/Kolkata' },
    { code: 'JAI', name: 'Jaipur', country: 'India', countryCode: 'IN', timezone: 'Asia/Kolkata' },
    { code: 'GOA', name: 'Goa', country: 'India', countryCode: 'IN', timezone: 'Asia/Kolkata' },
    { code: 'KYO', name: 'Kyoto', country: 'Japan', countryCode: 'JP', timezone: 'Asia/Tokyo' },
    { code: 'CTG', name: 'Cartagena', country: 'Colombia', countryCode: 'CO', timezone: 'America/Bogota' },
  ];

  // Event categories supported by Fever
  private static readonly CATEGORIES = [
    'experiences',
    'concerts',
    'theater',
    'exhibitions',
    'festivals',
    'nightlife',
    'food-drink',
    'sports',
    'wellness',
    'tours',
    'classes',
    'family',
  ];

  constructor() {
    this.config = {
      apiKey: process.env.FEVER_API_KEY,
      partnerId: process.env.FEVER_PARTNER_ID,
      baseUrl: 'https://api.feverup.com/v1', // Official partner API base URL
    };

    this.isConfigured = !!(this.config.apiKey && this.config.partnerId);

    if (!this.isConfigured) {
      console.warn('[Fever] API not configured - FEVER_API_KEY and FEVER_PARTNER_ID required');
      console.warn('[Fever] Complete partner signup at https://app.impact.com to get credentials');
    }
  }

  /**
   * Check if the service is properly configured
   */
  public isReady(): boolean {
    return this.isConfigured;
  }

  /**
   * Get list of supported cities
   */
  public getSupportedCities(): FeverCity[] {
    return FeverService.SUPPORTED_CITIES;
  }

  /**
   * Get list of event categories
   */
  public getCategories(): string[] {
    return FeverService.CATEGORIES;
  }

  /**
   * Find city by name or code
   */
  public findCity(nameOrCode: string): FeverCity | undefined {
    const normalized = nameOrCode.toLowerCase().trim();
    return FeverService.SUPPORTED_CITIES.find(
      city => 
        city.code.toLowerCase() === normalized ||
        city.name.toLowerCase() === normalized ||
        city.name.toLowerCase().includes(normalized)
    );
  }

  /**
   * Build affiliate tracking URL for an event
   */
  public buildAffiliateUrl(eventUrl: string): string {
    if (!this.config.partnerId) {
      return eventUrl;
    }
    
    // Impact.com tracking URL format
    const trackingUrl = new URL('https://feverup.sjv.io/c/' + this.config.partnerId);
    trackingUrl.searchParams.set('u', eventUrl);
    return trackingUrl.toString();
  }

  /**
   * Make authenticated API request
   */
  private async makeRequest<T>(
    endpoint: string, 
    params?: Record<string, string | number | boolean>
  ): Promise<T | null> {
    if (!this.isConfigured) {
      console.warn('[Fever] Cannot make request - API not configured');
      return null;
    }

    try {
      const url = new URL(`${this.config.baseUrl}${endpoint}`);
      
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            url.searchParams.set(key, String(value));
          }
        });
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'X-Partner-ID': this.config.partnerId!,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        console.error(`[Fever] API error: ${response.status} ${response.statusText}`);
        return null;
      }

      return await response.json() as T;
    } catch (error) {
      console.error('[Fever] Request failed:', error);
      return null;
    }
  }

  /**
   * Search events by city and optional filters
   */
  public async searchEvents(params: FeverSearchParams): Promise<FeverSearchResponse | null> {
    if (!this.isConfigured) {
      console.warn('[Fever] Returning mock data - API not configured');
      return this.getMockSearchResponse(params);
    }

    const city = this.findCity(params.city);
    if (!city) {
      console.warn(`[Fever] City not found: ${params.city}`);
      return null;
    }

    const response = await this.makeRequest<any>('/events/search', {
      city: city.code,
      q: params.query || '',
      category: params.category || '',
      start_date: params.startDate || '',
      end_date: params.endDate || '',
      min_price: params.minPrice || 0,
      max_price: params.maxPrice || 0,
      free: params.isFree || false,
      page: params.page || 1,
      limit: params.limit || 20,
      sort: params.sortBy || 'popularity',
    });

    if (!response) return null;

    return this.transformSearchResponse(response, city);
  }

  /**
   * Get event details by ID
   */
  public async getEventById(eventId: string): Promise<FeverEvent | null> {
    if (!this.isConfigured) {
      return this.getMockEvent(eventId);
    }

    const response = await this.makeRequest<any>(`/events/${eventId}`);
    if (!response) return null;

    return this.transformEvent(response);
  }

  /**
   * Get upcoming events for a city
   */
  public async getUpcomingEvents(
    cityNameOrCode: string, 
    options?: { limit?: number; category?: string }
  ): Promise<FeverEvent[]> {
    const result = await this.searchEvents({
      city: cityNameOrCode,
      limit: options?.limit || 10,
      category: options?.category,
      sortBy: 'date',
    });

    return result?.events || [];
  }

  /**
   * Get events for a specific date range
   */
  public async getEventsByDateRange(
    cityNameOrCode: string,
    startDate: string,
    endDate: string,
    options?: { category?: string; limit?: number }
  ): Promise<FeverEvent[]> {
    const result = await this.searchEvents({
      city: cityNameOrCode,
      startDate,
      endDate,
      limit: options?.limit || 50,
      category: options?.category,
    });

    return result?.events || [];
  }

  /**
   * Get free events in a city
   */
  public async getFreeEvents(
    cityNameOrCode: string,
    options?: { limit?: number }
  ): Promise<FeverEvent[]> {
    const result = await this.searchEvents({
      city: cityNameOrCode,
      isFree: true,
      limit: options?.limit || 20,
    });

    return result?.events || [];
  }

  /**
   * Transform API response to our event format
   */
  private transformEvent(apiEvent: any): FeverEvent {
    const baseUrl = `https://feverup.com/m/${apiEvent.slug || apiEvent.id}`;
    
    return {
      id: String(apiEvent.id),
      title: apiEvent.name || apiEvent.title,
      slug: apiEvent.slug || '',
      description: apiEvent.description,
      shortDescription: apiEvent.short_description || apiEvent.description?.substring(0, 200),
      imageUrl: apiEvent.image_url || apiEvent.cover_image,
      thumbnailUrl: apiEvent.thumbnail_url || apiEvent.image_url,
      category: apiEvent.category || 'experiences',
      subcategory: apiEvent.subcategory,
      city: apiEvent.city_name || apiEvent.city,
      cityCode: apiEvent.city_code || '',
      country: apiEvent.country || '',
      venue: apiEvent.venue ? {
        name: apiEvent.venue.name,
        address: apiEvent.venue.address,
        coordinates: apiEvent.venue.coordinates ? {
          lat: apiEvent.venue.coordinates.latitude,
          lng: apiEvent.venue.coordinates.longitude,
        } : undefined,
      } : undefined,
      dates: {
        startDate: apiEvent.start_date || apiEvent.date,
        endDate: apiEvent.end_date,
        sessions: apiEvent.sessions?.map((s: any) => ({
          id: String(s.id),
          datetime: s.datetime || s.date,
          available: s.available !== false,
        })),
      },
      pricing: {
        currency: apiEvent.currency || 'USD',
        minPrice: apiEvent.min_price || apiEvent.price,
        maxPrice: apiEvent.max_price,
        priceRange: apiEvent.price_range,
      },
      rating: apiEvent.rating,
      reviewCount: apiEvent.review_count || apiEvent.reviews,
      isFree: apiEvent.is_free || apiEvent.price === 0,
      isSoldOut: apiEvent.is_sold_out || false,
      bookingUrl: baseUrl,
      affiliateUrl: this.buildAffiliateUrl(baseUrl),
      tags: apiEvent.tags || [],
      highlights: apiEvent.highlights || [],
    };
  }

  /**
   * Transform search response
   */
  private transformSearchResponse(response: any, city: FeverCity): FeverSearchResponse {
    const events = (response.results || response.events || []).map((e: any) => 
      this.transformEvent(e)
    );

    return {
      events,
      total: response.total || events.length,
      page: response.page || 1,
      totalPages: response.total_pages || Math.ceil((response.total || events.length) / 20),
      city,
    };
  }

  /**
   * Generate mock search response for development
   */
  private getMockSearchResponse(params: FeverSearchParams): FeverSearchResponse {
    const city = this.findCity(params.city) || {
      code: 'UNK',
      name: params.city,
      country: 'Unknown',
      countryCode: 'XX',
      timezone: 'UTC',
    };

    const mockEvents = this.generateMockEvents(city, params.limit || 10);

    return {
      events: mockEvents,
      total: mockEvents.length,
      page: params.page || 1,
      totalPages: 1,
      city,
    };
  }

  /**
   * Generate mock event for development
   */
  private getMockEvent(eventId: string): FeverEvent {
    return {
      id: eventId,
      title: 'Sample Fever Experience',
      slug: 'sample-experience',
      description: 'This is a placeholder event. Connect your Fever Partner API to see real events.',
      shortDescription: 'Placeholder event for development',
      imageUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800',
      thumbnailUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400',
      category: 'experiences',
      city: 'Sample City',
      cityCode: 'SMP',
      country: 'Sample Country',
      dates: {
        startDate: new Date().toISOString(),
      },
      pricing: {
        currency: 'USD',
        minPrice: 25,
        priceRange: '$25 - $50',
      },
      isFree: false,
      isSoldOut: false,
      bookingUrl: 'https://feverup.com',
      tags: ['sample', 'placeholder'],
    };
  }

  /**
   * Generate mock events for a city
   */
  private generateMockEvents(city: FeverCity, count: number): FeverEvent[] {
    const eventTypes = [
      { title: 'Candlelight Concert', category: 'concerts', price: 35 },
      { title: 'Immersive Art Experience', category: 'exhibitions', price: 45 },
      { title: 'Secret Food Tour', category: 'food-drink', price: 65 },
      { title: 'Rooftop Yoga Session', category: 'wellness', price: 25 },
      { title: 'Comedy Night', category: 'theater', price: 30 },
      { title: 'Wine Tasting Experience', category: 'food-drink', price: 55 },
      { title: 'Street Art Walking Tour', category: 'tours', price: 20 },
      { title: 'Sunset Boat Cruise', category: 'experiences', price: 75 },
      { title: 'Local Market Food Tour', category: 'food-drink', price: 40 },
      { title: 'Live Jazz Evening', category: 'concerts', price: 35 },
    ];

    const events: FeverEvent[] = [];
    const now = new Date();

    for (let i = 0; i < Math.min(count, eventTypes.length); i++) {
      const eventType = eventTypes[i];
      const eventDate = new Date(now);
      eventDate.setDate(eventDate.getDate() + Math.floor(Math.random() * 60) + 1);

      events.push({
        id: `mock-${city.code.toLowerCase()}-${i + 1}`,
        title: `${eventType.title} in ${city.name}`,
        slug: `${eventType.title.toLowerCase().replace(/\s+/g, '-')}-${city.code.toLowerCase()}`,
        description: `Experience an unforgettable ${eventType.title.toLowerCase()} in the heart of ${city.name}. This unique event combines local culture with world-class entertainment.`,
        shortDescription: `${eventType.title} - A unique experience in ${city.name}`,
        imageUrl: `https://images.unsplash.com/photo-${1500000000000 + i * 100000}?w=800`,
        thumbnailUrl: `https://images.unsplash.com/photo-${1500000000000 + i * 100000}?w=400`,
        category: eventType.category,
        city: city.name,
        cityCode: city.code,
        country: city.country,
        dates: {
          startDate: eventDate.toISOString(),
        },
        pricing: {
          currency: 'USD',
          minPrice: eventType.price,
          priceRange: `$${eventType.price} - $${eventType.price + 20}`,
        },
        rating: 4 + Math.random() * 0.9,
        reviewCount: Math.floor(Math.random() * 500) + 50,
        isFree: false,
        isSoldOut: false,
        bookingUrl: `https://feverup.com/m/mock-event-${i}`,
        affiliateUrl: this.buildAffiliateUrl(`https://feverup.com/m/mock-event-${i}`),
        tags: [eventType.category, city.name.toLowerCase(), 'featured'],
      });
    }

    return events;
  }
}

// Export singleton instance
export const feverService = new FeverService();
