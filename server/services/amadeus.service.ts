import Amadeus from 'amadeus';
import { apiUsageService } from './api-usage.service';

const amadeus = new Amadeus({
  clientId: process.env.AMADEUS_API_KEY!,
  clientSecret: process.env.AMADEUS_API_SECRET!,
  hostname: 'test', // Use test environment
});

// Cached OAuth2 token for direct REST calls (safety API not in SDK)
let _amadeusToken: string | null = null;
let _amadeusTokenExpiry = 0;

async function getAmadeusToken(): Promise<string> {
  if (_amadeusToken && Date.now() < _amadeusTokenExpiry - 60_000) {
    return _amadeusToken;
  }
  const res = await fetch('https://test.api.amadeus.com/v1/security/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${encodeURIComponent(process.env.AMADEUS_API_KEY!)}&client_secret=${encodeURIComponent(process.env.AMADEUS_API_SECRET!)}`,
  });
  if (!res.ok) throw new Error(`Amadeus OAuth2 failed: ${res.status}`);
  const data = await res.json() as { access_token: string; expires_in: number };
  _amadeusToken = data.access_token;
  _amadeusTokenExpiry = Date.now() + data.expires_in * 1000;
  return _amadeusToken;
}

export interface FlightSearchParams {
  originLocationCode: string;
  destinationLocationCode: string;
  departureDate: string;
  returnDate?: string;
  adults: number;
  children?: number;
  infants?: number;
  travelClass?: 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST';
  nonStop?: boolean;
  currencyCode?: string;
  max?: number;
}

export interface HotelSearchParams {
  cityCode: string;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  roomQuantity?: number;
  priceRange?: string;
  currency?: string;
  ratings?: string[];
  amenities?: string[];
}

export interface FlightOffer {
  id: string;
  source: string;
  price: {
    total: string;
    currency: string;
    grandTotal: string;
  };
  itineraries: Array<{
    duration: string;
    segments: Array<{
      departure: {
        iataCode: string;
        at: string;
      };
      arrival: {
        iataCode: string;
        at: string;
      };
      carrierCode: string;
      number: string;
      duration: string;
      numberOfStops: number;
    }>;
  }>;
  travelerPricings: Array<{
    travelerId: string;
    fareOption: string;
    travelerType: string;
    price: {
      currency: string;
      total: string;
    };
  }>;
}

export interface HotelOffer {
  hotel: {
    hotelId: string;
    name: string;
    cityCode: string;
    latitude: number;
    longitude: number;
    address?: {
      lines?: string[];
      cityName?: string;
      countryCode?: string;
    };
    rating?: string;
    amenities?: string[];
    media?: Array<{
      uri: string;
      category: string;
    }>;
  };
  offers?: Array<{
    id: string;
    checkInDate: string;
    checkOutDate: string;
    room: {
      type: string;
      description?: {
        text: string;
      };
    };
    price: {
      currency: string;
      total: string;
    };
  }>;
}

export interface PointOfInterest {
  id: string;
  type: string;
  name: string;
  category: string;
  rank: number;
  geoCode: {
    latitude: number;
    longitude: number;
  };
  tags?: string[];
}

export interface Activity {
  id: string;
  type: string;
  name: string;
  shortDescription?: string;
  description?: string;
  geoCode: {
    latitude: number;
    longitude: number;
  };
  rating?: number;
  price?: {
    amount: string;
    currencyCode: string;
  };
  pictures?: string[];
  bookingLink?: string;
  minimumDuration?: string;
}

export interface TransferOffer {
  id: string;
  type: string;
  transferType: string;
  start: {
    dateTime: string;
    locationCode: string;
  };
  end: {
    dateTime?: string;
    locationCode?: string;
    address?: {
      line?: string;
      cityName?: string;
      countryCode?: string;
    };
  };
  vehicle: {
    code: string;
    category: string;
    description: string;
    seats?: Array<{
      count: number;
    }>;
  };
  quotation: {
    monetaryAmount: string;
    currencyCode: string;
  };
  cancellationRules?: Array<{
    feeType: string;
    percentage?: string;
  }>;
}

export interface SafetyRating {
  id: string;
  type: string;
  subType: string;
  name: string;
  geoCode: {
    latitude: number;
    longitude: number;
  };
  safetyScores: {
    overall: number;
    lgbtq: number;
    medical: number;
    physicalHarm: number;
    politicalFreedom: number;
    theft: number;
    women: number;
  };
}

export interface POISearchParams {
  latitude: number;
  longitude: number;
  radius?: number;
  categories?: string[];
}

export interface ActivitySearchParams {
  latitude: number;
  longitude: number;
  radius?: number;
}

export interface TransferSearchParams {
  startLocationCode: string;
  endAddressLine?: string;
  endCityName?: string;
  endGeoCode?: string;
  transferType: 'PRIVATE' | 'SHARED';
  startDateTime: string;
  passengers: number;
}

export interface SafetySearchParams {
  latitude: number;
  longitude: number;
  radius?: number;
}

export class AmadeusService {
  async searchFlights(params: FlightSearchParams): Promise<FlightOffer[]> {
    const startTime = Date.now();
    try {
      const response = await amadeus.shopping.flightOffersSearch.get({
        originLocationCode: params.originLocationCode,
        destinationLocationCode: params.destinationLocationCode,
        departureDate: params.departureDate,
        returnDate: params.returnDate,
        adults: params.adults,
        children: params.children,
        infants: params.infants,
        travelClass: params.travelClass || 'ECONOMY',
        nonStop: params.nonStop || false,
        currencyCode: params.currencyCode || 'USD',
        max: params.max || 10,
      });

      const results = response.data || [];
      await apiUsageService.logAmadeusCall('flight_offers_search', 'search', {
        responseTimeMs: Date.now() - startTime,
        success: true,
        resultCount: results.length,
        metadata: { origin: params.originLocationCode, destination: params.destinationLocationCode },
      });
      return results;
    } catch (error: any) {
      await apiUsageService.logAmadeusCall('flight_offers_search', 'search', {
        responseTimeMs: Date.now() - startTime,
        success: false,
        errorMessage: error?.response?.body?.errors?.[0]?.detail || 'Flight search failed',
      });
      console.error('Amadeus flight search error:', error?.response?.body || error);
      throw new Error(error?.response?.body?.errors?.[0]?.detail || 'Flight search failed');
    }
  }

  async searchHotels(params: HotelSearchParams): Promise<HotelOffer[]> {
    const startTime = Date.now();
    try {
      // First, get hotel list by city
      const hotelListResponse = await amadeus.referenceData.locations.hotels.byCity.get({
        cityCode: params.cityCode,
      });
      await apiUsageService.logAmadeusCall('hotel_list', 'list', {
        responseTimeMs: Date.now() - startTime,
        success: true,
        resultCount: hotelListResponse.data?.length || 0,
        metadata: { cityCode: params.cityCode },
      });

      const hotelIds = hotelListResponse.data?.slice(0, 20).map((h: any) => h.hotelId) || [];
      
      if (hotelIds.length === 0) {
        return [];
      }

      // Then get offers for those hotels
      const offersStartTime = Date.now();
      const offersResponse = await amadeus.shopping.hotelOffersSearch.get({
        hotelIds: hotelIds.join(','),
        checkInDate: params.checkInDate,
        checkOutDate: params.checkOutDate,
        adults: params.adults,
        roomQuantity: params.roomQuantity || 1,
        currency: params.currency || 'USD',
      });

      const results = offersResponse.data || [];
      await apiUsageService.logAmadeusCall('hotel_offers', 'search', {
        responseTimeMs: Date.now() - offersStartTime,
        success: true,
        resultCount: results.length,
        metadata: { cityCode: params.cityCode, hotelCount: hotelIds.length },
      });
      return results;
    } catch (error: any) {
      await apiUsageService.logAmadeusCall('hotel_search', 'search', {
        responseTimeMs: Date.now() - startTime,
        success: false,
        errorMessage: error?.response?.body?.errors?.[0]?.detail || 'Hotel search failed',
      });
      console.error('Amadeus hotel search error:', error?.response?.body || error);
      throw new Error(error?.response?.body?.errors?.[0]?.detail || 'Hotel search failed');
    }
  }

  async searchAirportsByKeyword(keyword: string): Promise<any[]> {
    const startTime = Date.now();
    try {
      const response = await amadeus.referenceData.locations.get({
        keyword: keyword,
        subType: 'AIRPORT,CITY',
      });
      const results = response.data || [];
      await apiUsageService.logAmadeusCall('airport_city_search', 'search', {
        responseTimeMs: Date.now() - startTime,
        success: true,
        resultCount: results.length,
        metadata: { keyword },
      });
      return results;
    } catch (error: any) {
      await apiUsageService.logAmadeusCall('airport_city_search', 'search', {
        responseTimeMs: Date.now() - startTime,
        success: false,
        errorMessage: error?.response?.body?.errors?.[0]?.detail || 'Location search failed',
      });
      console.error('Amadeus location search error:', error?.response?.body || error);
      throw new Error(error?.response?.body?.errors?.[0]?.detail || 'Location search failed');
    }
  }

  async searchCitiesByKeyword(keyword: string): Promise<any[]> {
    const startTime = Date.now();
    try {
      const response = await amadeus.referenceData.locations.get({
        keyword: keyword,
        subType: 'CITY',
      });
      const results = response.data || [];
      await apiUsageService.logAmadeusCall('airport_city_search', 'search', {
        responseTimeMs: Date.now() - startTime,
        success: true,
        resultCount: results.length,
        metadata: { keyword, type: 'city' },
      });
      return results;
    } catch (error: any) {
      await apiUsageService.logAmadeusCall('airport_city_search', 'search', {
        responseTimeMs: Date.now() - startTime,
        success: false,
        errorMessage: error?.response?.body?.errors?.[0]?.detail || 'City search failed',
      });
      console.error('Amadeus city search error:', error?.response?.body || error);
      throw new Error(error?.response?.body?.errors?.[0]?.detail || 'City search failed');
    }
  }

  async searchPointsOfInterest(params: POISearchParams): Promise<PointOfInterest[]> {
    const startTime = Date.now();
    try {
      const queryParams: any = {
        latitude: params.latitude,
        longitude: params.longitude,
        radius: params.radius || 5,
      };
      
      if (params.categories && params.categories.length > 0) {
        queryParams.categories = params.categories.join(',');
      }

      const response = await (amadeus.referenceData.locations as any).pointsOfInterest.get(queryParams);
      const results = response.data || [];
      await apiUsageService.logAmadeusCall('poi_search', 'search', {
        responseTimeMs: Date.now() - startTime,
        success: true,
        resultCount: results.length,
        metadata: { latitude: params.latitude, longitude: params.longitude },
      });
      return results;
    } catch (error: any) {
      await apiUsageService.logAmadeusCall('poi_search', 'search', {
        responseTimeMs: Date.now() - startTime,
        success: error?.response?.statusCode === 404,
        errorMessage: error?.response?.statusCode !== 404 ? (error?.response?.body?.errors?.[0]?.detail || 'POI search failed') : undefined,
      });
      console.error('Amadeus POI search error:', error?.response?.body || error);
      if (error?.response?.statusCode === 404) {
        return [];
      }
      throw new Error(error?.response?.body?.errors?.[0]?.detail || 'POI search failed');
    }
  }

  async getPointOfInterestById(poiId: string): Promise<PointOfInterest | null> {
    const startTime = Date.now();
    try {
      const response = await (amadeus.referenceData.locations as any).pointOfInterest(poiId).get();
      await apiUsageService.logAmadeusCall('poi_by_id', 'get', {
        responseTimeMs: Date.now() - startTime,
        success: true,
        resultCount: response.data ? 1 : 0,
        metadata: { poiId },
      });
      return response.data || null;
    } catch (error: any) {
      await apiUsageService.logAmadeusCall('poi_by_id', 'get', {
        responseTimeMs: Date.now() - startTime,
        success: false,
        errorMessage: error?.response?.body?.errors?.[0]?.detail,
      });
      console.error('Amadeus POI get error:', error?.response?.body || error);
      return null;
    }
  }

  async searchActivities(params: ActivitySearchParams): Promise<Activity[]> {
    const startTime = Date.now();
    try {
      const response = await (amadeus.shopping as any).activities.get({
        latitude: params.latitude,
        longitude: params.longitude,
        radius: params.radius || 20,
      });
      const results = response.data || [];
      await apiUsageService.logAmadeusCall('activities_search', 'search', {
        responseTimeMs: Date.now() - startTime,
        success: true,
        resultCount: results.length,
        metadata: { latitude: params.latitude, longitude: params.longitude },
      });
      return results;
    } catch (error: any) {
      await apiUsageService.logAmadeusCall('activities_search', 'search', {
        responseTimeMs: Date.now() - startTime,
        success: error?.response?.statusCode === 404,
        errorMessage: error?.response?.statusCode !== 404 ? (error?.response?.body?.errors?.[0]?.detail || 'Activities search failed') : undefined,
      });
      console.error('Amadeus activities search error:', error?.response?.body || error);
      if (error?.response?.statusCode === 404) {
        return [];
      }
      throw new Error(error?.response?.body?.errors?.[0]?.detail || 'Activities search failed');
    }
  }

  async getActivityById(activityId: string): Promise<Activity | null> {
    const startTime = Date.now();
    try {
      const response = await (amadeus.shopping as any).activity(activityId).get();
      await apiUsageService.logAmadeusCall('activity_by_id', 'get', {
        responseTimeMs: Date.now() - startTime,
        success: true,
        resultCount: response.data ? 1 : 0,
        metadata: { activityId },
      });
      return response.data || null;
    } catch (error: any) {
      await apiUsageService.logAmadeusCall('activity_by_id', 'get', {
        responseTimeMs: Date.now() - startTime,
        success: false,
        errorMessage: error?.response?.body?.errors?.[0]?.detail,
      });
      console.error('Amadeus activity get error:', error?.response?.body || error);
      return null;
    }
  }

  async searchTransfers(params: TransferSearchParams): Promise<TransferOffer[]> {
    const startTime = Date.now();
    try {
      const requestBody: any = {
        startLocationCode: params.startLocationCode,
        transferType: params.transferType,
        startDateTime: params.startDateTime,
        passengers: params.passengers,
      };

      if (params.endAddressLine) {
        requestBody.endAddressLine = params.endAddressLine;
      }
      if (params.endCityName) {
        requestBody.endCityName = params.endCityName;
      }
      if (params.endGeoCode) {
        requestBody.endGeoCode = params.endGeoCode;
      }

      const response = await (amadeus.shopping as any).transferOffers.post(JSON.stringify(requestBody));
      const results = response.data || [];
      await apiUsageService.logAmadeusCall('transfer_offers', 'search', {
        responseTimeMs: Date.now() - startTime,
        success: true,
        resultCount: results.length,
        metadata: { startLocationCode: params.startLocationCode, transferType: params.transferType },
      });
      return results;
    } catch (error: any) {
      await apiUsageService.logAmadeusCall('transfer_offers', 'search', {
        responseTimeMs: Date.now() - startTime,
        success: error?.response?.statusCode === 404 || error?.response?.statusCode === 400,
        errorMessage: (error?.response?.statusCode !== 404 && error?.response?.statusCode !== 400) 
          ? (error?.response?.body?.errors?.[0]?.detail || 'Transfers search failed') : undefined,
      });
      console.error('Amadeus transfers search error:', error?.response?.body || error);
      if (error?.response?.statusCode === 404 || error?.response?.statusCode === 400) {
        return [];
      }
      throw new Error(error?.response?.body?.errors?.[0]?.detail || 'Transfers search failed');
    }
  }

  async getSafetyRatings(params: SafetySearchParams): Promise<SafetyRating[]> {
    const startTime = Date.now();
    try {
      const token = await getAmadeusToken();
      const url = new URL('https://test.api.amadeus.com/v1/safety/safety-rated-locations');
      url.searchParams.set('latitude', String(params.latitude));
      url.searchParams.set('longitude', String(params.longitude));
      url.searchParams.set('radius', String(params.radius || 5));
      const resp = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({})) as any;
        const detail = errBody?.errors?.[0]?.detail || `Safety API returned ${resp.status}`;
        await apiUsageService.logAmadeusCall('safety_rated_locations', 'search', {
          responseTimeMs: Date.now() - startTime,
          success: resp.status === 404,
          errorMessage: resp.status !== 404 ? detail : undefined,
        });
        if (resp.status === 404) return [];
        throw new Error(detail);
      }
      const data = await resp.json() as { data?: SafetyRating[] };
      const results = data.data || [];
      await apiUsageService.logAmadeusCall('safety_rated_locations', 'search', {
        responseTimeMs: Date.now() - startTime,
        success: true,
        resultCount: results.length,
        metadata: { latitude: params.latitude, longitude: params.longitude },
      });
      return results;
    } catch (error: any) {
      await apiUsageService.logAmadeusCall('safety_rated_locations', 'search', {
        responseTimeMs: Date.now() - startTime,
        success: false,
        errorMessage: error.message || 'Safety ratings search failed',
      });
      console.error('Amadeus safety search error:', error.message);
      if (error.message?.includes('404')) return [];
      throw error;
    }
  }

  async getSafetyRatingById(locationId: string): Promise<SafetyRating | null> {
    const startTime = Date.now();
    try {
      const response = await (amadeus as any).safety.safetyRatedLocation(locationId).get();
      await apiUsageService.logAmadeusCall('safety_rated_locations', 'get', {
        responseTimeMs: Date.now() - startTime,
        success: true,
        resultCount: response.data ? 1 : 0,
        metadata: { locationId },
      });
      return response.data || null;
    } catch (error: any) {
      await apiUsageService.logAmadeusCall('safety_rated_locations', 'get', {
        responseTimeMs: Date.now() - startTime,
        success: false,
        errorMessage: error?.response?.body?.errors?.[0]?.detail,
      });
      console.error('Amadeus safety get error:', error?.response?.body || error);
      return null;
    }
  }
}

export const amadeusService = new AmadeusService();
