const VIATOR_API_KEY = process.env.VIATOR_API_KEY;
const VIATOR_BASE_URL = 'https://api.sandbox.viator.com/partner';

export interface ViatorSearchParams {
  destination?: string;
  searchTerm?: string;
  startDate?: string;
  endDate?: string;
  currency?: string;
  count?: number;
  sortOrder?: 'TOP_SELLERS' | 'PRICE_LOW_TO_HIGH' | 'PRICE_HIGH_TO_LOW' | 'TRAVELER_RATING' | 'REVIEW_COUNT';
  filtering?: {
    lowestPrice?: number;
    highestPrice?: number;
    rating?: { from: number; to: number };
    durationInMinutes?: { from: number; to: number };
    tags?: number[];
  };
}

export interface ViatorProduct {
  productCode: string;
  title: string;
  description: string;
  duration?: {
    fixedDurationInMinutes?: number;
    variableDurationFromMinutes?: number;
    variableDurationToMinutes?: number;
  };
  pricing?: {
    summary: {
      fromPrice: number;
      fromPriceBeforeDiscount?: number;
    };
    currency: string;
  };
  reviews?: {
    totalReviews: number;
    combinedAverageRating: number;
  };
  images?: Array<{
    imageSource: string;
    caption?: string;
    isCover?: boolean;
    variants: Array<{
      url: string;
      width: number;
      height: number;
    }>;
  }>;
  flags?: string[];
  cancellationPolicy?: {
    type: string;
    description?: string;
    cancelIfBadWeather?: boolean;
    cancelIfInsufficientTravelers?: boolean;
    refundEligibility?: Array<{
      dayRangeMin?: number;
      dayRangeMax?: number;
      percentageRefundable: number;
    }>;
  };
  destinations?: Array<{
    ref: string;
    primary?: boolean;
  }>;
  tags?: Array<{
    tagId: number;
    allNamesByLocale?: Record<string, string>;
  }>;
  itinerary?: {
    itineraryType: string;
    duration?: {
      fixedDurationInMinutes?: number;
    };
    itineraryItems?: Array<{
      pointOfInterestLocation?: {
        location?: {
          name?: string;
          address?: string;
        };
      };
      description?: string;
      duration?: {
        fixedDurationInMinutes?: number;
      };
    }>;
  };
  inclusions?: Array<{
    otherDescription?: string;
    categoryDescription?: string;
    typeDescription?: string;
  }>;
  exclusions?: Array<{
    otherDescription?: string;
    categoryDescription?: string;
    typeDescription?: string;
  }>;
  additionalInfo?: string[];
  bookingConfirmationSettings?: {
    confirmationType: string;
    confirmationTypeDescription?: string;
  };
  productUrl?: string;
}

export interface ViatorDestination {
  destinationId: number;
  ref: string;
  name: string;
  type: string;
  parentId?: number;
  lookupId?: string;
  timeZone?: string;
  iataCode?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

export interface ViatorSearchResult {
  products: ViatorProduct[];
  totalCount: number;
}

class ViatorService {
  private async makeRequest<T>(endpoint: string, method: 'GET' | 'POST' = 'GET', body?: any): Promise<T> {
    if (!VIATOR_API_KEY) {
      throw new Error('VIATOR_API_KEY is not configured');
    }

    const url = `${VIATOR_BASE_URL}${endpoint}`;
    const headers: Record<string, string> = {
      'exp-api-key': VIATOR_API_KEY,
      'Accept': 'application/json;version=2.0',
      'Accept-Language': 'en-US',
    };

    if (method === 'POST' && body) {
      headers['Content-Type'] = 'application/json';
    }

    const options: RequestInit = {
      method,
      headers,
    };

    if (method === 'POST' && body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Viator API error (${response.status}):`, errorText);
      throw new Error(`Viator API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  async searchByFreetext(searchTerm: string, currency: string = 'USD', count: number = 20): Promise<ViatorSearchResult> {
    try {
      const response = await this.makeRequest<any>('/search/freetext', 'POST', {
        searchTerm,
        searchTypes: [{ searchType: 'PRODUCTS', pagination: { start: 1, count } }],
        currency,
      });

      const products = response.products?.results || [];
      return {
        products,
        totalCount: response.products?.totalCount || products.length,
      };
    } catch (error: any) {
      console.error('Viator freetext search error:', error);
      throw error;
    }
  }

  async searchProducts(params: ViatorSearchParams): Promise<ViatorSearchResult> {
    try {
      const requestBody: any = {
        currency: params.currency || 'USD',
        pagination: {
          start: 1,
          count: params.count || 20,
        },
      };

      if (params.destination) {
        requestBody.filtering = {
          ...params.filtering,
          destination: params.destination,
        };
      }

      if (params.startDate && params.endDate) {
        requestBody.filtering = {
          ...requestBody.filtering,
          startDate: params.startDate,
          endDate: params.endDate,
        };
      }

      if (params.sortOrder) {
        requestBody.sorting = { sort: params.sortOrder };
      }

      const response = await this.makeRequest<any>('/products/search', 'POST', requestBody);
      
      const products = response.products || [];
      return {
        products,
        totalCount: response.totalCount || products.length,
      };
    } catch (error: any) {
      console.error('Viator product search error:', error);
      throw error;
    }
  }

  async getDestinations(): Promise<ViatorDestination[]> {
    try {
      const response = await this.makeRequest<any>('/destinations', 'GET');
      return response.destinations || [];
    } catch (error: any) {
      console.error('Viator destinations error:', error);
      throw error;
    }
  }

  async getProductDetails(productCode: string): Promise<ViatorProduct | null> {
    try {
      const response = await this.makeRequest<ViatorProduct>(`/products/${productCode}`, 'GET');
      return response;
    } catch (error: any) {
      console.error('Viator product details error:', error);
      return null;
    }
  }

  async checkAvailability(productCode: string, travelDate: string, paxMix: Array<{ ageBand: string; numberOfTravelers: number }>): Promise<any> {
    try {
      const response = await this.makeRequest<any>('/availability/check', 'POST', {
        productCode,
        travelDate,
        paxMix,
        currency: 'USD',
      });
      return response;
    } catch (error: any) {
      console.error('Viator availability check error:', error);
      throw error;
    }
  }

  async getProductsByDestination(destinationName: string, params?: Partial<ViatorSearchParams>): Promise<ViatorSearchResult> {
    return this.searchByFreetext(destinationName, params?.currency || 'USD', params?.count || 20);
  }
}

export const viatorService = new ViatorService();
