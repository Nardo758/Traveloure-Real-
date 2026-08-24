import { getTravelpayoutsToken } from "./travelpayouts-client";
import type { CatalogItem } from "../experience-catalog.service";

export interface RentalcarsSearchParams {
  pickupLocation: string;
  pickupDate?: string;
  dropoffDate?: string;
  dropoffLocation?: string;
  driverAge?: number;
  limit?: number;
  currency?: string;
}

const CAR_CLASSES = [
  { cls: "Economy", icon: "🚗", label: "Economy Cars", pricePerDay: 25, seats: 5, desc: "Compact & affordable · Great for city drives" },
  { cls: "Compact", icon: "🚙", label: "Compact Cars", pricePerDay: 35, seats: 5, desc: "Balance of comfort & economy" },
  { cls: "SUV", icon: "🛻", label: "SUVs & 4WDs", pricePerDay: 65, seats: 7, desc: "Space for the whole family · Off-road ready" },
  { cls: "Luxury", icon: "🏎️", label: "Luxury & Premium", pricePerDay: 95, seats: 5, desc: "Top brands · Full extras included" },
  { cls: "Van", icon: "🚐", label: "Vans & Minibuses", pricePerDay: 75, seats: 9, desc: "Group travel · Extra cargo room" },
];

export async function searchRentalcars(params: RentalcarsSearchParams): Promise<CatalogItem[]> {
  const token = getTravelpayoutsToken();
  if (!token) return [];

  const pickupDate = params.pickupDate || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const dropoffDate = params.dropoffDate || new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  const days = Math.max(1, Math.round(
    (new Date(dropoffDate).getTime() - new Date(pickupDate).getTime()) / 86400000
  ));
  const city = params.pickupLocation.split(",")[0].trim();

  const affiliateBase = `https://www.rentalcars.com/en/car-hire/${encodeURIComponent(city.toLowerCase())}/`
    + `?puDate=${pickupDate}&doDate=${dropoffDate}&driverAge=${params.driverAge || 30}&affiliateCode=travelpayouts`;

  return CAR_CLASSES.slice(0, params.limit || 4).map((c): CatalogItem => ({
    id: `rentalcars-${city.toLowerCase().replace(/\s+/g, "-")}-${c.cls.toLowerCase()}`,
    type: "car_rental",
    provider: "rentalcars",
    externalId: `rentalcars-${c.cls}`,
    title: `${c.icon} ${c.label} — ${city}`,
    description: `${c.desc} · ${c.seats} seats · ${days} day${days > 1 ? "s" : ""} · Free cancellation`,
    imageUrl: null,
    price: c.pricePerDay * days,
    currency: params.currency || "USD",
    rating: 4.5,
    reviewCount: null,
    destination: params.pickupLocation,
    location: null,
    duration: `${days} day${days > 1 ? "s" : ""}`,
    categories: ["car-rental", c.cls.toLowerCase()],
    tags: ["rentalcars", "car-rental", c.cls.toLowerCase()],
    bookingUrl: affiliateBase + `&carClass=${c.cls}`,
    affiliateUrl: affiliateBase + `&carClass=${c.cls}`,
    source: "travelpayouts/rentalcars",
    lastUpdated: new Date(),
  } as CatalogItem));
}
