export interface CatalogItem {
  id: string;
  type: "activity" | "hotel" | "event" | "flight" | "transfer" | "car_rental" | "esim" | "transport" | "poi" | "restaurant";
  provider: string;
  externalId: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  price: number | null;
  currency: string;
  rating: number | null;
  reviewCount: number | null;
  destination: string | null;
  location: { lat: number; lng: number } | null;
  duration: string | null;
  categories: string[];
  tags: string[];
  bookingUrl: string | null;
  affiliateUrl?: string | null;
  source?: string | null;
  lastUpdated: string | null;
  cuisine?: string | null;
  priceLevel?: string | null;
}

export interface CatalogSearchResult {
  items: CatalogItem[];
  total: number;
  page?: number;
  pageSize?: number;
  filters?: {
    destinations: string[];
    priceRange: { min: number; max: number };
    providers: string[];
  };
}
