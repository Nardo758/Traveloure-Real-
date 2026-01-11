declare module 'amadeus' {
  interface AmadeusConfig {
    clientId: string;
    clientSecret: string;
    hostname?: 'test' | 'production';
  }

  interface AmadeusResponse<T> {
    data: T;
    result: any;
    body: string;
  }

  interface FlightOffersSearchParams {
    originLocationCode: string;
    destinationLocationCode: string;
    departureDate: string;
    returnDate?: string;
    adults: number;
    children?: number;
    infants?: number;
    travelClass?: string;
    nonStop?: boolean;
    currencyCode?: string;
    max?: number;
  }

  interface HotelOffersSearchParams {
    hotelIds: string;
    checkInDate: string;
    checkOutDate: string;
    adults: number;
    roomQuantity?: number;
    currency?: string;
  }

  interface LocationSearchParams {
    keyword: string;
    subType: string;
  }

  interface HotelsByCityParams {
    cityCode: string;
  }

  class Amadeus {
    constructor(config: AmadeusConfig);
    
    shopping: {
      flightOffersSearch: {
        get(params: FlightOffersSearchParams): Promise<AmadeusResponse<any[]>>;
        post(body: any): Promise<AmadeusResponse<any[]>>;
      };
      hotelOffersSearch: {
        get(params: HotelOffersSearchParams): Promise<AmadeusResponse<any[]>>;
      };
    };
    
    referenceData: {
      locations: {
        get(params: LocationSearchParams): Promise<AmadeusResponse<any[]>>;
        hotels: {
          byCity: {
            get(params: HotelsByCityParams): Promise<AmadeusResponse<any[]>>;
          };
        };
      };
    };
  }

  export = Amadeus;
}
