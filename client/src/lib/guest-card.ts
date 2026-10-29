/**
 * Order 279 (ledger `2026-10-29-guest-post-rsvp-card`): what the post-RSVP card shows, read from
 * the landing rows row 278 already builds (`guestLandingRows`). The card shows the event's date,
 * time, city and street address only; the address row exists only when the server sent
 * `landing.venueAddress`, which it releases after an accepted RSVP (row 277). No host, note, venue,
 * RSVP-by or other row reaches the card, and no row is invented when a key is absent.
 */
import type { GuestLandingRow } from "./guest-landing";

export const GUEST_CARD_ROW_KEYS = ["date", "time", "city", "address"] as const;

export function guestCardRows(rows: readonly GuestLandingRow[]): GuestLandingRow[] {
  return rows.filter((row) => (GUEST_CARD_ROW_KEYS as readonly string[]).includes(row.key));
}

/** The city for the card's line: the landing's `area`, trimmed; absent or blank means none. */
export function guestCardCity(area: string | undefined | null): string | undefined {
  return typeof area === "string" && area.trim().length > 0 ? area.trim() : undefined;
}
