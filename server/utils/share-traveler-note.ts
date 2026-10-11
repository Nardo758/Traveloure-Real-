/**
 * SH-1 — THE EXPERT'S TRAVELER NOTE IS THE TRAVELER'S, ON EVERY SHARE ENDPOINT (decision-maker,
 * Oct 9, 2026; ledger `2026-10-09-sh1-share-traveler-note`).
 *
 * `trips.expert_traveler_note` (§21, migration 187) is the expert's note TO the traveler. It was
 * sent to every holder of a share link — the public `GET /api/itinerary-share/:token` said so in
 * a comment, and `GET /api/trips/:id?token=` spread it to a token-only guest. A share link hands
 * out the itinerary; the note is a message to one person, so it is a privacy leak, not a feature.
 *
 * ONE rule (§18 rule 1), read by both share rails: a viewer who reached the plan ONLY through a
 * share link sees the note only when they are the plan's traveler — the trip owner, by session.
 * The builder side of the plan (an assigned advisor, who wrote it, and the managing EA, who acts
 * for the owner) keeps it on the trip GET, where those arms are decided; they are not share
 * viewers. An absent note stays `null` (§13). Pure: no db, no session object.
 */
export function shareViewerIsPlanTraveler(viewerId: string | null | undefined, tripOwnerId: string | null | undefined): boolean {
  return typeof viewerId === "string" && viewerId.length > 0 && typeof tripOwnerId === "string" && tripOwnerId === viewerId;
}

/** The note a share viewer may receive: the note for the plan's traveler, `null` for anyone else. */
export function travelerNoteForShareViewer(
  note: string | null | undefined,
  viewerId: string | null | undefined,
  tripOwnerId: string | null | undefined,
): string | null {
  return shareViewerIsPlanTraveler(viewerId, tripOwnerId) ? (note ?? null) : null;
}
