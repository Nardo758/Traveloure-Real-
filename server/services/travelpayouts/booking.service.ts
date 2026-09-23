import { getTravelpayoutsToken, getTravelpayoutsMarker } from "./travelpayouts-client";
import type { CatalogItem } from "../experience-catalog.service";

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
    label: `traveloure-${getTravelpayoutsMarker()}`,
    checkin: checkIn,
    checkout: checkOut,
    group_adults: String(guests),
    no_rooms: "1",
  });
  if (stars) params.set("class", String(stars));
  return `https://www.booking.com/searchresults.html?${params.toString()}`;
}

function buildTpUrl(city: string, stars?: number): string {
  const base = `https://www.travelpayouts.com/hotels/booking?marker=${getTravelpayoutsMarker()}&currency=USD&city=${encodeURIComponent(city)}`;
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

  // These cards are SEARCH ENTRY POINTS into Booking.com — one per star class — not hotels with
  // quotes. No price, rating or amenity was ever fetched for them, so none is shown (§13, board
  // #1200, ledger `2026-09-23-phase2-honesty`): the old "from $200/night", the 9.2 ratings and the
  // "Free cancellation / Breakfast options" lines were written here, not returned by any partner.
  // Real rates appear on the partner's page for the traveler's own dates.
  const tiers = [
    { stars: 5, label: "5-star" },
    { stars: 4, label: "4-star" },
    { stars: 3, label: "3-star" },
    { stars: 2, label: "2-star" },
    { stars: 0, label: "All" },
  ];

  return tiers.slice(0, params.limit || 5).map((t): CatalogItem => {
    const bookingUrl = t.stars
      ? buildBookingUrl(city, checkIn, checkOut, guests, t.stars)
      : buildBookingUrl(city, checkIn, checkOut, guests);
    const affiliateUrl = buildTpUrl(city, t.stars || undefined);

    return {
      id: `booking-${city.toLowerCase().replace(/\s+/g, "-")}-${t.stars || "all"}star`,
      type: "hotel",
      provider: "booking_com",
      externalId: `booking-${t.stars}`,
      title: t.stars ? `${t.label} hotels in ${city}` : `All places to stay in ${city}`,
      description: `Search ${t.stars ? `${t.label} hotels` : "hotels, apartments and guesthouses"} in ${city} on Booking.com. Prices and availability are shown by Booking.com for your dates.`,
      imageUrl: null,
      price: null,
      currency,
      rating: null,
      reviewCount: null,
      destination: params.destination,
      location: null,
      duration: null,
      categories: ["hotel", t.stars ? `${t.stars}-star` : "accommodation"],
      tags: ["booking.com", t.stars ? `${t.stars}-star` : "all-types"],
      bookingUrl,
      affiliateUrl,
      source: "travelpayouts/booking",
      lastUpdated: new Date(),
    } as CatalogItem;
  });
}
