import Amadeus from 'amadeus';

const amadeus = new Amadeus({
  clientId: process.env.AMADEUS_API_KEY!,
  clientSecret: process.env.AMADEUS_API_SECRET!,
  hostname: 'test', // Use test environment
});

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

      return response.data || [];
    } catch (error: any) {
      console.error('Amadeus flight search error:', error?.response?.body || error);
      throw new Error(error?.response?.body?.errors?.[0]?.detail || 'Flight search failed');
    }
  }

  async searchHotels(params: HotelSearchParams): Promise<HotelOffer[]> {
    try {
      // First, get hotel list by city
      const hotelListResponse = await amadeus.referenceData.locations.hotels.byCity.get({
        cityCode: params.cityCode,
      });

      const hotelIds = hotelListResponse.data?.slice(0, 20).map((h: any) => h.hotelId) || [];
      
      if (hotelIds.length === 0) {
        return [];
      }

      // Then get offers for those hotels
      const offersResponse = await amadeus.shopping.hotelOffersSearch.get({
        hotelIds: hotelIds.join(','),
        checkInDate: params.checkInDate,
        checkOutDate: params.checkOutDate,
        adults: params.adults,
        roomQuantity: params.roomQuantity || 1,
        currency: params.currency || 'USD',
      });

      return offersResponse.data || [];
    } catch (error: any) {
      console.error('Amadeus hotel search error:', error?.response?.body || error);
      throw new Error(error?.response?.body?.errors?.[0]?.detail || 'Hotel search failed');
    }
  }

  async searchAirportsByKeyword(keyword: string): Promise<any[]> {
    try {
      const response = await amadeus.referenceData.locations.get({
        keyword: keyword,
        subType: 'AIRPORT,CITY',
      });
      return response.data || [];
    } catch (error: any) {
      console.error('Amadeus location search error:', error?.response?.body || error);
      throw new Error(error?.response?.body?.errors?.[0]?.detail || 'Location search failed');
    }
  }

  async searchCitiesByKeyword(keyword: string): Promise<any[]> {
    try {
      const response = await amadeus.referenceData.locations.get({
        keyword: keyword,
        subType: 'CITY',
      });
      return response.data || [];
    } catch (error: any) {
      console.error('Amadeus city search error:', error?.response?.body || error);
      throw new Error(error?.response?.body?.errors?.[0]?.detail || 'City search failed');
    }
  }

  async searchPointsOfInterest(params: POISearchParams): Promise<PointOfInterest[]> {
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
      return response.data || [];
    } catch (error: any) {
      console.error('Amadeus POI search error:', error?.response?.body || error);
      if (error?.response?.statusCode === 404) {
        return [];
      }
      throw new Error(error?.response?.body?.errors?.[0]?.detail || 'POI search failed');
    }
  }

  async getPointOfInterestById(poiId: string): Promise<PointOfInterest | null> {
    try {
      const response = await (amadeus.referenceData.locations as any).pointOfInterest(poiId).get();
      return response.data || null;
    } catch (error: any) {
      console.error('Amadeus POI get error:', error?.response?.body || error);
      return null;
    }
  }

  async searchActivities(params: ActivitySearchParams): Promise<Activity[]> {
    try {
      const response = await (amadeus.shopping as any).activities.get({
        latitude: params.latitude,
        longitude: params.longitude,
        radius: params.radius || 20,
      });
      return response.data || [];
    } catch (error: any) {
      console.error('Amadeus activities search error:', error?.response?.body || error);
      if (error?.response?.statusCode === 404) {
        return [];
      }
      throw new Error(error?.response?.body?.errors?.[0]?.detail || 'Activities search failed');
    }
  }

  async getActivityById(activityId: string): Promise<Activity | null> {
    try {
      const response = await (amadeus.shopping as any).activity(activityId).get();
      return response.data || null;
    } catch (error: any) {
      console.error('Amadeus activity get error:', error?.response?.body || error);
      return null;
    }
  }

  async searchTransfers(params: TransferSearchParams): Promise<TransferOffer[]> {
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
      return response.data || [];
    } catch (error: any) {
      console.error('Amadeus transfers search error:', error?.response?.body || error);
      if (error?.response?.statusCode === 404 || error?.response?.statusCode === 400) {
        return [];
      }
      throw new Error(error?.response?.body?.errors?.[0]?.detail || 'Transfers search failed');
    }
  }

  async getSafetyRatings(params: SafetySearchParams): Promise<SafetyRating[]> {
    try {
      const response = await (amadeus as any).safety.safetyRatedLocations.get({
        latitude: params.latitude,
        longitude: params.longitude,
        radius: params.radius || 5,
      });
      return response.data || [];
    } catch (error: any) {
      console.error('Amadeus safety search error:', error?.response?.body || error);
      if (error?.response?.statusCode === 404) {
        return [];
      }
      throw new Error(error?.response?.body?.errors?.[0]?.detail || 'Safety ratings search failed');
    }
  }

  async getSafetyRatingById(locationId: string): Promise<SafetyRating | null> {
    try {
      const response = await (amadeus as any).safety.safetyRatedLocation(locationId).get();
      return response.data || null;
    } catch (error: any) {
      console.error('Amadeus safety get error:', error?.response?.body || error);
      return null;
    }
  }
}

export const amadeusService = new AmadeusService();
