/**
 * Row 277 (Architect, 2026-10-28 01:45 ET, pt847u; ledger `2026-10-28-guest-landing-fields`): the
 * DATA the guest invite landing may show, returned as `landing` on GET /api/invites/:token. The
 * server sends data only, never a label or a sentence; row 278 renders it.
 *
 * Every key is optional. An absent key means the value is not set or not released; it is never
 * null, "" or a default. `venueAddress` is present only when the guest's rsvpStatus is "accepted".
 */
export interface GuestLanding {
  /** The host's first name (users.first_name, trimmed, never split). */
  hostFirstName?: string;
  title?: string;
  /** "YYYY-MM-DD" as stored. */
  eventDate?: string;
  /** "HH:MM" wall clock as stored, never converted. */
  startTime?: string;
  /** The trip's IANA zone the time is read in; only with startTime and only when usable. */
  timezone?: string;
  /** The venue name as the host typed it (user_experiences.location). */
  venue?: string;
  /** The trip's operating-market city (from trips.market_slug). */
  area?: string;
  hostNote?: string;
  /** "YYYY-MM-DD" as stored. */
  rsvpBy?: string;
  /**
   * True when a street address is stored (row 207). Present only then; an absent
   * key means no address was stored. The address itself is `venueAddress`, and
   * that key is present only when rsvpStatus is "accepted".
   */
  hasVenueAddress?: boolean;
  /** The street address; only when rsvpStatus is "accepted". */
  venueAddress?: string;
}
