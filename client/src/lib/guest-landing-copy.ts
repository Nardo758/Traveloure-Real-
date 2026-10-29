/**
 * Row 278 (ledger `2026-10-28-guest-landing-render`): the labels on the guest invite landing.
 *
 * WORDING HELD FOR LEON. Marketing's proposals from the fix queue (row 278 notes, Oct 28, 2026,
 * after the Architect's 01:45 ET ruling pt847u); not approved. Every label the landing shows lives
 * here so the wording can be swapped without touching the page.
 */
export const GUEST_LANDING_COPY = {
  hostedBy: (name: string) => `Hosted by ${name}`,
  date: "Date",
  time: "Time",
  venue: "Venue",
  city: "City",
  noteFrom: (name: string) => `Note from ${name}`,
  rsvpBy: (date: string) => `RSVP by ${date}`,
  addressAfterRsvp: "The address is shared after you RSVP.",
} as const;
