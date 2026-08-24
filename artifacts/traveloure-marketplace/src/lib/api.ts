import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const API_BASE = "";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Unauthorized");
    }
    throw new Error(`API error: ${res.statusText}`);
  }
  return res.json();
}

export type Service = {
  id: string;
  serviceName: string;
  shortDescription: string;
  price: string;
  priceBasedOn: string;
  location: string;
  averageRating: string | number;
  reviewCount: number;
  deliveryTimeframe: string;
  categoryId: string;
  providerFirstName: string | null;
  providerLastName: string | null;
  providerBusinessName: string | null;
  providerHandle: string | null;
  serviceImage: string | null;
  galleryImages: string[] | null;
  status: string;
};

export type ServiceCategory = {
  id: string;
  name: string;
  categoryKey?: string;
};

export type DiscoverResult = {
  services: Service[];
  total: number;
};

export type ReadyMadeListing = {
  id: string;
  title: string;
  planType: string | null;
  planTypeCustom: string | null;
  market: string;
  durationDays: number;
  pricingMode: string;
  priceCents: number | null;
  heroImageUrl: string | null;
  authorName: string;
  authorHandle: string | null;
  section: string;
  insideCounts: Record<string, number> | null;
};

export type ReadyMadeResponse = {
  listings: ReadyMadeListing[];
};

export type DestinationsResponse = {
  data: string[];
  total: number;
  hasMore: boolean;
  limit: number;
  offset: number;
};

export type CalendarEvent = {
  id: string;
  country: string;
  city: string;
  title: string;
  specificDate: string | null;
  startMonth: number | string | null;
  endMonth: number | string | null;
  metadata?: {
    affiliateUrl?: string | null;
    bookingUrl?: string | null;
  } | null;
};

// 1. Discover Services
export function useDiscoverServices(params: {
  q?: string;
  categoryId?: string;
  location?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  sortBy?: string;
  limit?: number;
  offset?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params.q) searchParams.set("q", params.q);
  if (params.categoryId && params.categoryId !== "all") searchParams.set("categoryId", params.categoryId);
  if (params.location) searchParams.set("location", params.location);
  if (params.minPrice) searchParams.set("minPrice", params.minPrice.toString());
  if (params.maxPrice) searchParams.set("maxPrice", params.maxPrice.toString());
  if (params.minRating) searchParams.set("minRating", params.minRating.toString());
  if (params.sortBy) searchParams.set("sortBy", params.sortBy);
  if (params.limit) searchParams.set("limit", params.limit.toString());
  if (params.offset) searchParams.set("offset", params.offset.toString());

  return useQuery<DiscoverResult>({
    queryKey: ["discover-services", searchParams.toString()],
    queryFn: () => fetchJson(`/api/discover?${searchParams.toString()}`),
  });
}

// 2. Service Categories
export function useServiceCategories() {
  return useQuery<ServiceCategory[]>({
    queryKey: ["service-categories"],
    queryFn: () => fetchJson(`/api/service-categories`),
  });
}

// 3. Add to Cart Mutation
export function useAddToCart() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ serviceId, quantity = 1 }: { serviceId: string; quantity?: number }) => {
      try {
        return await fetchJson(`/api/cart`, {
          method: "POST",
          body: JSON.stringify({ serviceId, quantity }),
        });
      } catch (err: any) {
        if (err.message === "Unauthorized") {
          const pendingIds: string[] = JSON.parse(
            localStorage.getItem("traveloure_guest_cart_pending") || "[]",
          );
          if (!pendingIds.includes(serviceId)) {
            pendingIds.push(serviceId);
          }
          localStorage.setItem(
            "traveloure_guest_cart_pending",
            JSON.stringify(pendingIds),
          );
          return { success: true, guest: true };
        }
        throw err;
      }
    },
    onSuccess: (data: any) => {
      if (data?.guest) {
        toast({
          title: "Sign-in required",
          description: "Item saved to your pending cart. Please sign in to complete your purchase.",
        });
      } else {
        toast({
          title: "Added to trip",
          description: "Service has been added to your cart.",
        });
      }
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not add to cart. Please try again.",
      });
    }
  });
}

// 4. Ready Made
export function useReadyMade(planType?: string) {
  const searchParams = new URLSearchParams();
  if (planType && planType !== "All editions") searchParams.set("planType", planType);
  return useQuery<ReadyMadeResponse>({
    queryKey: ["ready-made", planType],
    queryFn: () => fetchJson(`/api/ready-made?${searchParams.toString()}`),
  });
}

// 5. Destinations
export function useDestinations() {
  return useQuery<DestinationsResponse>({
    queryKey: ["destinations"],
    queryFn: () => fetchJson(`/api/destinations`),
  });
}

// 6. Calendar Countries
export function useCalendarCountries() {
  return useQuery<string[]>({
    queryKey: ["calendar-countries"],
    queryFn: () => fetchJson(`/api/destination-calendar/countries`),
  });
}

// 7. Calendar Events
export function useCalendarEvents(country?: string) {
  return useQuery<CalendarEvent[]>({
    queryKey: ["calendar-events", country],
    queryFn: () => fetchJson(`/api/destination-calendar/events?country=${encodeURIComponent(country || "")}`),
    enabled: !!country,
  });
}
