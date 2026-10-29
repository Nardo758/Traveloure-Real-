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
} as const;
