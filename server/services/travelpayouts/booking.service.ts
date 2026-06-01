import { getTravelpayoutsToken } from "./travelpayouts-client";
import type { CatalogItem } from "../experience-catalog.service";

const TP_MARKER = "405110";
const TP_AID = "304142";

export interface BookingSearchParams {
  destination: string;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  limit?: number;
  currency?: string;
}

function buildBookingUrl(city: string, checkIn: string, checkOut: string, guests: number, stars?: number): string {
  const params = new URLSearchParams({
    ss: city,
    aid: TP_AID,
    label: `traveloure-${TP_MARKER}`,
    checkin: checkIn,
    checkout: checkOut,
    group_adults: String(guests),
    no_rooms: "1",
  });
  if (stars) params.set("class", String(stars));
  return `https://www.booking.com/searchresults.html?${params.toString()}`;
}

function buildTpUrl(city: string, stars?: number): string {
  const base = `https://www.travelpayouts.com/hotels/booking?marker=${TP_MARKER}&currency=USD&city=${encodeURIComponent(city)}`;
  return stars ? `${base}&stars=${stars}` : base;
}

export async function searchBooking(params: BookingSearchParams): Promise<CatalogItem[]> {
  const token = getTravelpayoutsToken();
  if (!token) return [];

  const city = params.destination.split(",")[0].trim();
  const checkIn = params.checkIn || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const checkOut = params.checkOut || new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  const guests = params.guests || 2;
  const currency = params.currency || "USD";

  const tiers = [
    { stars: 5, label: "Luxury 5★", priceFrom: 200, desc: "Top-rated luxury properties · Free cancellation" },
    { stars: 4, label: "Superior 4★", priceFrom: 100, desc: "Excellent rated hotels · Breakfast options available" },
    { stars: 3, label: "Comfortable 3★", priceFrom: 55, desc: "Great value hotels · Central locations" },
    { stars: 2, label: "Budget 2★", priceFrom: 30, desc: "Affordable stays · Essentials included" },
    { stars: 0, label: "All Properties", priceFrom: 20, desc: "Apartments, hostels, guesthouses & more" },
  ];

  return tiers.slice(0, params.limit || 5).map((t, i): CatalogItem => {
    const bookingUrl = t.stars
      ? buildBookingUrl(city, checkIn, checkOut, guests, t.stars)
      : buildBookingUrl(city, checkIn, checkOut, guests);
    const affiliateUrl = buildTpUrl(city, t.stars || undefined);

    return {
      id: `booking-${city.toLowerCase().replace(/\s+/g, "-")}-${t.stars || "all"}star`,
      type: "hotel",
      provider: "booking_com",
      externalId: `booking-${t.stars}`,
      title: `${t.label} Hotels in ${city}`,
      description: `${t.desc} · from ${currency} ${t.priceFrom}/night`,
      imageUrl: null,
      price: t.priceFrom,
      currency,
      rating: t.stars >= 4 ? 9.2 - i * 0.2 : t.stars === 3 ? 8.4 : 8.0,
      reviewCount: null,
      destination: params.destination,
      location: null,
      duration: null,
      categories: ["hotel", t.stars ? `${t.stars}-star` : "accommodation"],
      tags: ["booking.com", t.stars ? `${t.stars}-star` : "all-types", "free-cancellation"],
      bookingUrl,
      affiliateUrl,
      source: "travelpayouts/booking",
      lastUpdated: new Date(),
    } as CatalogItem;
  });
}
