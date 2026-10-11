/**
 * stay-booking.ts — S1-d-3b (ledger `2026-10-11-s1-d3b-stay-book-ui`): the client half of the LiteAPI booking
 * rail (S1-d-3a, ledger `2026-10-10-s1-d3a-liteapi-booking`). Words, the read, and the three posts — every rule
 * stays server-side: who may book, the price (re-quoted at prebook), the offer and the payment method. The page
 * only shows what the server answered.
 */
import { useQuery } from "@tanstack/react-query";

export interface StayBookingRead {
  /** Booking is on (sandbox only) AND this item is a chosen LiteAPI stay. */
  bookable: boolean;
  booking: {
    id: string;
    status: string;
    hotelConfirmationCode: string | null;
    amountCents: number | null;
    currency: string | null;
    checkin: string;
    checkout: string;
    adults: number;
    env: string;
  } | null;
}

export type StayPrebook = {
  state: "prebooked";
  bookingId: string;
  amountCents: number;
  currency: string;
  transactionId: string;
  secretKey: string;
  checkin: string;
  checkout: string;
  adults: number;
  env: string;
};

export const stayBookingQueryKey = (tripId: string, itemId: string) => [`/api/trips/${tripId}/items/${itemId}/stay-booking`] as const;

export function useStayBooking(tripId: string, itemId: string, enabled: boolean) {
  return useQuery<StayBookingRead>({ queryKey: stayBookingQueryKey(tripId, itemId), enabled, staleTime: 30_000, retry: false });
}

/** POST one step; the answer's `state` is returned for a 2xx AND a 409 (the server's named refusals). */
export async function postStayBooking(tripId: string, itemId: string, step: "prebook" | "book" | "cancel"): Promise<{ state: string } & Record<string, any>> {
  const res = await fetch(`/api/trips/${tripId}/items/${itemId}/stay-booking/${step}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const json = await res.json().catch(() => null);
  if (json && typeof json.state === "string") return json;
  throw new Error(json?.message || `Request failed (${res.status})`);
}

export const STAY_BOOK_WORDS = {
  book: "Book",
  checking: "Checking the price…",
  priceLead: "Price for your dates",
  priceNote: "Paid to Nuitée, our hotel booking partner, on the next screen. Taxes and the hotel's own fees are as Nuitée shows them.",
  continue: "Continue to payment",
  paying: "Opening secure payment…",
  confirming: "Confirming your booking…",
  confirmed: (code: string | null) => (code ? `Booked · confirmation ${code}` : "Booked"),
  backToPlan: "Back to your plan",
} as const;

/** The server's named refusals, in words. An unknown state says so rather than guessing. */
export const STAY_BOOK_REFUSALS: Record<string, string> = {
  not_found: "This stay can't be booked here.",
  booking_unavailable: "Booking isn't available right now.",
  already_booked: "This stay is already booked.",
  dates_needed: "Set your dates first — the price depends on them.",
  party_needed: "Say how many adults are coming first.",
  unavailable: "No room is available for your dates at this hotel right now.",
  no_prebook: "That price has expired. Check the price again.",
  holder_incomplete: "Add your first name, last name and email to your profile first — the hotel needs them.",
  not_confirmed: "There is no confirmed booking to cancel.",
  failed: "The hotel didn't accept the booking. You have not been booked.",
  pending: "We're still waiting for the hotel's answer. Check back shortly — nothing more is needed from you.",
  cancel_refused: "The booking couldn't be cancelled. It is still booked.",
};

export function stayRefusalText(state: string): string {
  return STAY_BOOK_REFUSALS[state] ?? "Something went wrong. Nothing was booked by this attempt.";
}

/** Money from integer minor units, in the currency the server stated. */
export function stayPriceText(amountCents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency}`;
  }
}

/** "Book" draws only for the owner, on a stay the server says is bookable, with no live booking yet. */
export function showsStayBook(input: { isOwner: boolean; read: StayBookingRead | undefined | null }): boolean {
  if (!input.isOwner || !input.read?.bookable) return false;
  const s = input.read.booking?.status;
  return !s || s === "prebooked" || s === "failed" || s === "cancelled";
}

/** Where the Payment SDK returns the traveler after paying. */
export function stayBookedReturnPath(tripId: string, itemId: string): string {
  return `/plans/${encodeURIComponent(tripId)}/stays/${encodeURIComponent(itemId)}/booked`;
}

/** The SDK's public key from the server's env ("production" ⇒ "live"); anything else is refused. */
export function paymentSdkPublicKey(env: string): "sandbox" | "live" | null {
  return env === "sandbox" ? "sandbox" : env === "production" ? "live" : null;
}
