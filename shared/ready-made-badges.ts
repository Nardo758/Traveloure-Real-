/**
 * Ready Made Trip editorial badges — the store's curation vocabulary (MP-3).
 *
 * WHY A CLOSED SET, not free text. `ready_made_trips.badge` is a varchar(30)
 * whose value is rendered VERBATIM on public store cards and the detail page.
 * That makes it a trust claim shown to travelers, so it is not an admin note
 * field: an open text box would let any string ("#1 in Kyoto", "Best value")
 * reach a buyer with nothing behind it — the §13 fabricated-claim class. Every
 * badge here is an EDITORIAL statement the platform is making in its own voice
 * and can stand behind, never a derived or measured claim.
 *
 * Deliberately NOT in this set:
 *   - "Most popular" / "Best selling" / any ranking claim. Those assert measured
 *     demand. The lane has no sales or rating aggregate to back them (see the
 *     MP-5 gate in docs/EXECUTION_MAP.md), so they would be exactly the kind of
 *     number-shaped claim §13 prohibits.
 *   - "New". That is derivable from `reviewedAt` — a badge that duplicates a
 *     fact the card already knows adds no information and can go stale.
 *
 * Adding a value here is an editorial decision, not a mechanical one.
 */

export const READY_MADE_BADGES = [
  {
    value: "Featured",
    description: "Editorially selected for the store shelf.",
  },
  {
    value: "Staff pick",
    description: "A specific curator vouches for this build.",
  },
  {
    value: "Local favourite",
    description: "Recognised by the market's own local experts.",
  },
] as const;

export type ReadyMadeBadge = (typeof READY_MADE_BADGES)[number]["value"];

export const READY_MADE_BADGE_VALUES = READY_MADE_BADGES.map((b) => b.value) as ReadyMadeBadge[];

/** True when `value` is a badge the store is allowed to display. */
export function isReadyMadeBadge(value: unknown): value is ReadyMadeBadge {
  return typeof value === "string" && (READY_MADE_BADGE_VALUES as string[]).includes(value);
}
