/**
 * Order 279 (ledger `2026-10-29-guest-post-rsvp-card`): the words on the card a guest sees after
 * they RSVP. Leon's words, Oct 29, 2026, held on the PR for his approval. The card has no title.
 * Every string the card shows lives here; the page holds none of its own.
 */
export const GUEST_CARD_COPY = {
  /** The one line. " in {city}" is dropped when the landing carries no city. */
  line: (city?: string) =>
    city ? `See what there is to do around this event in ${city}.` : "See what there is to do around this event.",
  button: "See how it works",
  href: "/experiences",
  /** Row 280b: the guest's "plan around the event" button. APPROVED (Leon, Oct 29, Sheet row 284). */
  planButton: "Plan my day around this",
  /** Row 280b: shown under the button when the plan cannot be opened. HELD for Leon (Architect, Oct 29). */
  planError: "Couldn't open your plan. Try again.",
} as const;
