import { getTravelpayoutsToken } from "./travelpayouts-client";
import type { CatalogItem } from "../experience-catalog.service";

const DC_BASE = "https://api.discovercars.com/api/v1";

async function dcFetch(path: string, params: Record<string, string | number | undefined> = {}): Promise<any> {
  const token = getTravelpayoutsToken();
  if (!token) throw new Error("TRAVELPAYOUTS_TOKEN not configured");

  const url = new URL(path, DC_BASE);
  url.searchParams.set("affiliate_id", token);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    headers: { "Accept": "application/json" },
  });
  if (!res.ok) throw new Error(`DiscoverCars API error ${res.status}`);
  return res.json();
}

export interface DiscoverCarsSearchParams {
  pickupLocation: string;
  pickupDate: string;
  dropoffDate: string;
  dropoffLocation?: string;
  currency?: string;
  limit?: number;
}

export async function searchDiscoverCars(params: DiscoverCarsSearchParams): Promise<CatalogItem[]> {
  if (!getTravelpayoutsToken()) return [];

  try {
    const token = getTravelpayoutsToken();
    const data = await dcFetch("/cars/search", {
      pickup_location: params.pickupLocation,
      pickup_date: params.pickupDate,
      dropoff_date: params.dropoffDate,
      dropoff_location: params.dropoffLocation || params.pickupLocation,
      currency: params.currency || "USD",
    });

    const cars = data?.cars || data?.data || data?.vehicles || [];

    return (Array.isArray(cars) ? cars : []).slice(0, params.limit || 10).map((c: any): CatalogItem => ({
      id: `discovercars-${c.id || c.vehicle_id || Math.random().toString(36).slice(2)}`,
      type: "car_rental",
      provider: "discovercars",
      externalId: String(c.id || c.vehicle_id || ""),
      title: `${c.name || c.vehicle_name || "Car"} — ${c.vendor?.name || c.supplier || "Rental"}`,
      description: `${c.category || ""} · ${c.seats || "?"} seats · ${c.fuel_policy || "Fuel policy varies"}`.trim(),
      imageUrl: c.image_url || c.photo_url || null,
      price: c.total_price
        ? parseFloat(c.total_price)
        : c.price_per_day
        ? parseFloat(c.price_per_day)
        : null,
      currency: c.currency || params.currency || "USD",
      rating: c.rating ? parseFloat(c.rating) : null,
      reviewCount: c.reviews_count || null,
      destination: params.pickupLocation,
      location: null,
      duration: null,
      categories: ["car-rental", c.category || "economy"],
      tags: [
        c.transmission || "automatic",
        c.fuel_type || "petrol",
        c.air_conditioning ? "AC" : "",
      ].filter(Boolean),
      bookingUrl: c.booking_url || `https://www.discovercars.com/car-hire/${encodeURIComponent(params.pickupLocation)}?affiliate=${token}`,
      affiliateUrl: c.booking_url || `https://www.discovercars.com/car-hire/${encodeURIComponent(params.pickupLocation)}?affiliate=${token}`,
      source: "travelpayouts/discovercars",
      lastUpdated: new Date(),
    } as CatalogItem));
  } catch (err) {
    console.warn("[DiscoverCars] Search failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
