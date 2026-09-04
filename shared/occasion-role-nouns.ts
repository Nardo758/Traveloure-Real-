/**
 * THE 20 ROLE KEYS, SPELLED OUT FOR READING.
 * Ledger `2026-09-04-which-event-hint`; cites `2026-09-04-roles-needed` (migration 280) and
 * CLAUDE.md Locked Decision 31.
 *
 * `experience_types.roles_needed` is a `text[]` of `service_categories.category_key` values, and a
 * key is a machine identifier: `private_transportation`, `hair_makeup`, `av_tech`. A surface that
 * says "suggested for private_transportation" is showing a traveler an internal id. This map is
 * the ONE place a key is turned into the words a person reads.
 *
 * WHAT THIS IS NOT — and the reason it lives here rather than in a component:
 *
 *  - **It is not a second taxonomy.** Locked Decision 31 admits `roles_needed` precisely because it
 *    POINTS INTO the existing catalog instead of founding a third vocabulary; nothing here adds a
 *    role, renames one, or groups them. Each entry is the same key written out — no key is given a
 *    meaning migration 034 did not already give it.
 *
 *  - **It is not a source for any DECISION.** Whether an occasion wants a florist is answered ONLY
 *    by the `roles_needed` array the server sends on the event row. This map is consulted AFTER
 *    that answer, purely to render it. A reader that used this to INFER a match would be the
 *    derivation-drift class §18 rule 1 names.
 *
 *  - **It cannot drift out of step with the key set.** The type is
 *    `Record<OccasionRoleKey, string>`, so a key added to `OCCASION_ROLE_KEYS` without a noun here
 *    is a COMPILE error, and a noun for a key that does not exist is a compile error too. The
 *    import is `import type`, erased at build, so this file carries no runtime dependency on
 *    `shared/schema.ts` and stays usable from a pure client module.
 *
 * A key that somehow reaches a reader WITHOUT an entry here (the column carries no DB CHECK, by
 * the publish-trap posture, so the value set is app-enforced only) gets NO noun and therefore NO
 * hint — an omitted hint is honest, a raw `av_tech` on screen is not (§13).
 */
import type { OccasionRoleKey } from "./schema";

export const OCCASION_ROLE_NOUNS: Record<OccasionRoleKey, string> = {
  accessibility_specialist: "accessibility specialists",
  accommodation: "accommodation",
  activity_provider: "activity providers",
  av_tech: "AV techs",
  caterer: "caterers",
  childcare_family: "childcare",
  concierge_vip: "VIP concierges",
  dining_venue: "dining venues",
  entertainment: "entertainment",
  event_coordinator: "event coordinators",
  florist: "florists",
  hair_makeup: "hair & makeup",
  officiant: "officiants",
  photography: "photography",
  printing_materials: "printing & materials",
  private_chef: "private chefs",
  private_transportation: "private transportation",
  rentals: "rentals",
  tour_guide: "tour guides",
  videographer: "videographers",
};

/**
 * The noun for one key, or `null` when this map has never been told about it. `null` is the
 * caller's instruction to say NOTHING — never to fall back to printing the raw key.
 */
export function occasionRoleNoun(key: string | null | undefined): string | null {
  if (!key) return null;
  return (OCCASION_ROLE_NOUNS as Record<string, string | undefined>)[key] ?? null;
}
