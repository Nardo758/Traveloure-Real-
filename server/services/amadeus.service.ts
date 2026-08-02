/**
 * RETIRED SOURCE — do not re-enable against the old SDK/endpoints.
 *
 * Amadeus decommissioned its Self-Service API on 2026-07-17: self-service keys
 * were disabled, the developer portal closed, and the API hostnames were taken
 * down entirely. Verified 2026-08-01 from this environment:
 *   - `test.api.amadeus.com` → DNS does not resolve (NXDOMAIN)
 *   - `api.amadeus.com`      → DNS does not resolve (NXDOMAIN)
 *   - the SDK's token POST fails with NetworkError before leaving the box
 * (General DNS works — this is a vendor shutdown, not an egress problem.
 * Public confirmation: PhocusWire, "Amadeus to shut down self-service APIs
 * portal for developers"; migration guides date the cutoff to July 17, 2026.)
 *
 * The only official successor is Amadeus Enterprise, which requires a sales
 * contract — an owner decision, not a code fix. Until such a migration:
 *   - every method below short-circuits WITHOUT attempting a network call;
 *   - list-shaped methods return [] and detail methods return null;
 *   - the /api/amadeus/* routes return an explicit 410 "retired" response
 *     (see server/routes/content.routes.ts) instead of raw 500s;
 *   - /api/amadeus/locations still serves the DB location cache (which is
 *     real previously-fetched Amadeus data) and returns [] on a cache miss.
 *
 * Replacement coverage: activities/tours → Viator, WeGoTrip, GetYourGuide;
 * airport transfers → Kiwitaxi + Welcome Pickups (/api/catalog/airport-transfers);
 * hotels → remaining catalog sources. If an Enterprise contract ever lands,
 * rebuild against the Enterprise endpoints and un-retire the provider in
 * provider-health.service.ts.
 */
import { reportProviderResult } from './provider-health.service';

export const AMADEUS_RETIRED = true;
export const AMADEUS_RETIRED_MESSAGE =
  "Amadeus discontinued its Self-Service API on July 17, 2026. This data source has been retired.";

let warnedOnce = false;
function warnRetired(method: string): void {
  reportProviderResult('amadeus', 'error', AMADEUS_RETIRED_MESSAGE);
  if (warnedOnce) return;
  warnedOnce = true;
  console.warn(`[Amadeus] ${method} called but the provider is RETIRED (Self-Service API shut down 2026-07-17). ` +
    `Returning empty results. See amadeus.service.ts header.`);
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

/**
 * Retired stub — every method returns an honest empty result without touching
 * the network. See the file header for why and for replacement coverage.
 */
export class AmadeusService {
  async searchFlights(_params: FlightSearchParams): Promise<FlightOffer[]> {
    warnRetired('searchFlights');
    return [];
  }

  async searchHotels(_params: HotelSearchParams): Promise<HotelOffer[]> {
    warnRetired('searchHotels');
    return [];
  }

  async searchAirportsByKeyword(_keyword: string): Promise<any[]> {
    warnRetired('searchAirportsByKeyword');
    return [];
  }

  async searchCitiesByKeyword(_keyword: string): Promise<any[]> {
    warnRetired('searchCitiesByKeyword');
    return [];
  }

  async searchPointsOfInterest(_params: POISearchParams): Promise<PointOfInterest[]> {
    warnRetired('searchPointsOfInterest');
    return [];
  }

  async getPointOfInterestById(_poiId: string): Promise<PointOfInterest | null> {
    warnRetired('getPointOfInterestById');
    return null;
  }

  async searchActivities(_params: ActivitySearchParams): Promise<Activity[]> {
    warnRetired('searchActivities');
    return [];
  }

  async getActivityById(_activityId: string): Promise<Activity | null> {
    warnRetired('getActivityById');
    return null;
  }

  async searchTransfers(_params: TransferSearchParams): Promise<TransferOffer[]> {
    warnRetired('searchTransfers');
    return [];
  }

  async getSafetyRatings(_params: SafetySearchParams): Promise<SafetyRating[]> {
    warnRetired('getSafetyRatings');
    return [];
  }

  async getSafetyRatingById(_locationId: string): Promise<SafetyRating | null> {
    warnRetired('getSafetyRatingById');
    return null;
  }
}

export const amadeusService = new AmadeusService();
