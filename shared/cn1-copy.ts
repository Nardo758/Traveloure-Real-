/**
 * CN-1 on-screen strings. Placeholders stay in the sentence ({name}, {price},
 * {hours}, {date}, {start_date}, {end_date}, {release_date}) and the reader
 * fills them. This module does not decide a hold length or an accept window.
 */

export const CN1_COPY = {
  listingTypeConcierge: "Concierge: I help during the trip",
  listingTypePlanning: "Trip planning: I build the plan",
  profileSection: "Local concierge for your trip",
  filter: "Local concierge",
  pricePerTrip: "{price} per trip",
  responseHours: "Aims to reply within {hours} hours.",
  hireCta: "Hire for this trip",
  hireConsent:
    "I agree to share this trip's plan and dates with {name} so they can help during my trip. They can view and suggest changes until {end_date}. I pay venues directly.",
  hireAuthNote: "Your card is authorized now, but you're only charged once {name} accepts.",
  hireReleased: "{name} couldn't take this trip, so the hold on your card has been released.",
  hireCancelRule:
    "You can cancel for a full release until {name} completes a task. After that, we review cancellations case by case.",
  hireAccessDates: "{name} can help with this trip from {start_date} to {end_date}.",
  taskRequested: "Requested",
  taskTravelerOk: "You said OK · {date}",
  taskDone: "Done",
  taskCouldNotGet: "Couldn't get it",
  taskLinkOnly: "You book stays and transport yourself. {name} can send you the link.",
  payoutReleaseDate: "Available from {release_date}, after the trip ends",
} as const;

export function conciergePerTripPrice(price: string): string {
  return CN1_COPY.pricePerTrip.replace("{price}", price);
}

export function conciergeResponseHoursLine(hours: number): string {
  return CN1_COPY.responseHours.replace("{hours}", String(hours));
}
