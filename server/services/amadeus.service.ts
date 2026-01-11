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
}

export const amadeusService = new AmadeusService();
