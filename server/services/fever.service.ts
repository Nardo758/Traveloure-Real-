/**
 * Fever Partner API Service via Impact.com
 * Integrates with Fever (feverup.com) for event discovery and ticketing
 * through the Impact.com partner platform
 * 
 * API Documentation: https://integrations.impact.com/impact-publisher/reference/overview
 * Partner Portal: https://app.impact.com
 * 
 * This service provides:
 * - Event discovery by city/destination from Fever's product catalog
 * - Event search by keyword
 * - Event details for booking integration
 * - Affiliate tracking for commission via Impact.com
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

interface ImpactCatalog {
  Id: string;
  Name: string;
  AdvertiserName: string;
  CampaignId: string;
  CampaignName: string;
  NumberOfItems: number;
  DateLastUpdated: string;
  ItemsUri: string;
}

interface ImpactCatalogItem {
  CatalogItemId: string;
  Name: string;
  Description: string;
  Manufacturer?: string;
  CurrentPrice: number;
  OriginalPrice?: number;
  Currency: string;
  Url: string;
  ImageUrl?: string;
  AdditionalImageUrls?: string[];
  StockAvailability?: string;
  LaunchDate?: string;
  ExpirationDate?: string;
  Category?: string;
  Labels?: string[];
}

interface ImpactApiConfig {
  accountSid: string;
  authToken: string;
  baseUrl: string;
}

class FeverService {
  private config: ImpactApiConfig;
  private isConfigured: boolean = false;
  private feverCatalogId: string | null = null;

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
      accountSid: process.env.IMPACT_ACCOUNT_SID || '',
      authToken: process.env.IMPACT_AUTH_TOKEN || '',
      baseUrl: 'https://api.impact.com',
    };

    this.isConfigured = !!(this.config.accountSid && this.config.authToken);

    if (!this.isConfigured) {
      console.warn('[Fever/Impact] API not configured - IMPACT_ACCOUNT_SID and IMPACT_AUTH_TOKEN required');
      console.warn('[Fever/Impact] Get credentials from https://app.impact.com/secure/mediapartner/account-settings-flow.ihtml');
    } else {
      console.log('[Fever/Impact] API configured with Account SID:', this.config.accountSid.substring(0, 10) + '...');
      // Initialize by finding Fever catalog
      this.initializeFeverCatalog();
    }
  }

  /**
   * Initialize by finding the Fever catalog in Impact.com
   */
  private async initializeFeverCatalog(): Promise<void> {
    try {
      const catalogs = await this.listCatalogs();
      if (catalogs) {
        // Look for Fever catalog (case-insensitive search)
        const feverCatalog = catalogs.find(c => 
          c.Name.toLowerCase().includes('fever') || 
          c.AdvertiserName.toLowerCase().includes('fever')
        );
        
        if (feverCatalog) {
          this.feverCatalogId = feverCatalog.Id;
          console.log(`[Fever/Impact] Found Fever catalog: ${feverCatalog.Name} (ID: ${feverCatalog.Id})`);
        } else {
          console.warn('[Fever/Impact] Fever catalog not found. Available catalogs:', 
            catalogs.map(c => c.Name).join(', '));
        }
      }
    } catch (error) {
      console.error('[Fever/Impact] Failed to initialize Fever catalog:', error);
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
    if (!this.config.accountSid) {
      return eventUrl;
    }
    
    // Impact.com tracking URL format
    const trackingUrl = new URL('https://feverup.sjv.io/c/' + this.config.accountSid);
    trackingUrl.searchParams.set('u', eventUrl);
    return trackingUrl.toString();
  }

  /**
   * Create Basic Auth header
   */
  private getAuthHeader(): string {
    const credentials = Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString('base64');
    return `Basic ${credentials}`;
  }

  /**
   * Make authenticated API request to Impact.com
   */
  private async makeRequest<T>(endpoint: string): Promise<T | null> {
    if (!this.isConfigured) {
      console.warn('[Fever/Impact] Cannot make request - API not configured');
      return null;
    }

    try {
      const url = `${this.config.baseUrl}${endpoint}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        console.error(`[Fever/Impact] API error: ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        console.error(`[Fever/Impact] Error details:`, errorText);
        return null;
      }

      return await response.json() as T;
    } catch (error) {
      console.error('[Fever/Impact] Request failed:', error);
      return null;
    }
  }

  /**
   * List all available catalogs from Impact.com
   */
  public async listCatalogs(): Promise<ImpactCatalog[] | null> {
    const response = await this.makeRequest<{ Catalogs: ImpactCatalog[] }>(
      `/Mediapartners/${this.config.accountSid}/Catalogs`
    );
    return response?.Catalogs || null;
  }

  /**
   * Get catalog items from Impact.com
   */
  public async getCatalogItems(
    catalogId: string, 
    options?: { keyword?: string; category?: string; page?: number; pageSize?: number }
  ): Promise<ImpactCatalogItem[] | null> {
    let endpoint = `/Mediapartners/${this.config.accountSid}/Catalogs/${catalogId}/Items`;
    
    const params = new URLSearchParams();
    if (options?.keyword) params.set('Keyword', options.keyword);
    if (options?.category) params.set('Category', options.category);
    if (options?.page) params.set('Page', String(options.page));
    if (options?.pageSize) params.set('PageSize', String(options.pageSize));
    
    if (params.toString()) {
      endpoint += `?${params.toString()}`;
    }

    const response = await this.makeRequest<{ Items: ImpactCatalogItem[] }>(endpoint);
    return response?.Items || null;
  }

  /**
   * Transform Impact.com catalog item to FeverEvent
   */
  private transformCatalogItemToEvent(item: ImpactCatalogItem, city: FeverCity): FeverEvent {
    // Parse category from Labels or Category field
    const category = this.inferCategory(item.Category, item.Labels);
    
    return {
      id: item.CatalogItemId,
      title: item.Name,
      slug: item.Name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
      description: item.Description,
      shortDescription: item.Description?.substring(0, 200),
      imageUrl: item.ImageUrl,
      thumbnailUrl: item.ImageUrl,
      category,
      city: city.name,
      cityCode: city.code,
      country: city.country,
      dates: {
        startDate: item.LaunchDate || new Date().toISOString(),
        endDate: item.ExpirationDate,
      },
      pricing: {
        currency: item.Currency || 'USD',
        minPrice: item.CurrentPrice,
        maxPrice: item.OriginalPrice,
        priceRange: item.OriginalPrice && item.OriginalPrice !== item.CurrentPrice
          ? `$${item.CurrentPrice} - $${item.OriginalPrice}`
          : `$${item.CurrentPrice}`,
      },
      isFree: item.CurrentPrice === 0,
      isSoldOut: item.StockAvailability === 'OutOfStock',
      bookingUrl: item.Url,
      affiliateUrl: this.buildAffiliateUrl(item.Url),
      tags: item.Labels || [],
    };
  }

  /**
   * Infer event category from catalog data
   */
  private inferCategory(category?: string, labels?: string[]): string {
    const text = [category, ...(labels || [])].join(' ').toLowerCase();
    
    if (text.includes('concert') || text.includes('music') || text.includes('live')) return 'concerts';
    if (text.includes('theater') || text.includes('theatre') || text.includes('comedy')) return 'theater';
    if (text.includes('exhibition') || text.includes('museum') || text.includes('art')) return 'exhibitions';
    if (text.includes('festival')) return 'festivals';
    if (text.includes('nightlife') || text.includes('club') || text.includes('party')) return 'nightlife';
    if (text.includes('food') || text.includes('drink') || text.includes('dining') || text.includes('wine')) return 'food-drink';
    if (text.includes('sport')) return 'sports';
    if (text.includes('wellness') || text.includes('spa') || text.includes('yoga')) return 'wellness';
    if (text.includes('tour') || text.includes('walk')) return 'tours';
    if (text.includes('class') || text.includes('workshop')) return 'classes';
    if (text.includes('family') || text.includes('kids') || text.includes('children')) return 'family';
    
    return 'experiences';
  }

  /**
   * Search events by city and optional filters
   */
  public async searchEvents(params: FeverSearchParams): Promise<FeverSearchResponse | null> {
    const city = this.findCity(params.city);
    if (!city) {
      console.warn(`[Fever/Impact] City not found: ${params.city}`);
      return null;
    }

    // If not configured or no Fever catalog found, return mock data
    if (!this.isConfigured || !this.feverCatalogId) {
      console.warn('[Fever/Impact] Returning mock data - API not configured or Fever catalog not found');
      return this.getMockSearchResponse(params);
    }

    // Search for events in the city
    const keyword = [city.name, params.query].filter(Boolean).join(' ');
    const items = await this.getCatalogItems(this.feverCatalogId, {
      keyword,
      category: params.category,
      page: params.page,
      pageSize: params.limit || 20,
    });

    if (!items) {
      return this.getMockSearchResponse(params);
    }

    const events = items.map(item => this.transformCatalogItemToEvent(item, city));

    return {
      events,
      total: events.length,
      page: params.page || 1,
      totalPages: 1,
      city,
    };
  }

  /**
   * Get event details by ID
   */
  public async getEventById(eventId: string): Promise<FeverEvent | null> {
    if (!this.isConfigured || !this.feverCatalogId) {
      return this.getMockEvent(eventId);
    }

    const response = await this.makeRequest<ImpactCatalogItem>(
      `/Mediapartners/${this.config.accountSid}/Catalogs/${this.feverCatalogId}/Items/${eventId}`
    );
    
    if (!response) return this.getMockEvent(eventId);

    // Use a default city for single event lookups
    const defaultCity = FeverService.SUPPORTED_CITIES[0];
    return this.transformCatalogItemToEvent(response, defaultCity);
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
      description: 'This is a placeholder event. Connect your Impact.com credentials (IMPACT_ACCOUNT_SID and IMPACT_AUTH_TOKEN) to see real Fever events.',
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
