/**
 * What an `expired` booking row on My Bookings says happened next (R164/R165 follow-up; decision-maker
 * Sep 27, 2026: "the traveler isn't left with a row that leads nowhere").
 *
 * An `expired` booking is a checkout that was never paid and was released. When the booking carried
 * a plan item, the release returned that item to the plan (R164's `revertPurchasedItemsForBooking`),
 * so the row says so and links to the plan, where it can be booked again. Without a plan item nothing
 * went back anywhere, so the row does not claim it did (§13); it links to the listing instead.
 */
export interface ExpiredNextStep {
  line: string;
  href: string;
  cta: string;
}

export function expiredBookingNextStep(b: {
  status: string;
  tripId?: string | null;
  serviceId?: string | null;
  bookingDetails?: { itineraryItemId?: unknown } | null;
}): ExpiredNextStep | null {
  if (b.status !== "expired") return null;
  const hasPlanItem = typeof b.bookingDetails?.itineraryItemId === "string" && !!b.tripId;
  if (hasPlanItem) {
    return { line: "Not completed · back in your plan", href: `/plans/${b.tripId}`, cta: "Book it from your plan" };
  }
  if (b.serviceId) {
    return { line: "Not completed · you can book it again", href: `/services/${b.serviceId}`, cta: "Book again" };
  }
  return { line: "Not completed", href: "/my-trips", cta: "Go to My plans" };
}
