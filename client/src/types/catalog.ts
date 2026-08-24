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
  /**
   * §16: catalog DTOs never carry partner URLs (`affiliateUrl`/`bookingUrl` are stripped
   * server-side). This opaque token — minted by the server's affiliate-url vault when the feed
   * response was built — is what the booking-agent rail resolves back to the URL, server-side
   * only. Present exactly when the item is bookable via the agent rail.
   */
  bookingToken?: string | null;
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

/**
 * Optional per-source health, present on single-source /api/catalog/* endpoints when the server's
 * provider-health registry has an entry for that source (server/services/provider-health.service.ts).
 * Additive — existing consumers that only read `.items` are unaffected.
 */
export interface CatalogSourceStatus {
  status: "ok" | "empty" | "error" | "quota" | "auth" | "retired" | "not_called";
  configured: boolean;
  retired: boolean;
  detail: string | null;
}
