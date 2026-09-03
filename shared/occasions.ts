/**
 * OCCASIONS — the ONE mapping module for the platform's occasion vocabulary.
 *
 * THE PROBLEM THIS CLOSES (ledger `2026-09-03-occasion-vocabulary`). The product carried FOUR
 * occasion vocabularies that could drift apart with nothing to notice:
 *
 *   1. `eventTypeEnum` (shared/schema.ts) — 10 values, the `trips.event_type` column.
 *   2. A hand-typed 6-item `<Select>` in `client/src/components/trip/edit-trip-panel.tsx`, whose
 *      default value ("trip") was not even a member of (1).
 *   3. `experienceTypeSlugEnum` — declared in shared/schema.ts and referenced NOWHERE else. DEAD,
 *      and deleted by this lane: a fifth list that no reader consulted is drift with no upside.
 *   4. The `experience_types` DB table — read by `GET /api/experience-types`, seeded by
 *      `server/seeds/experience-template-tabs.seed.ts`. **This is the ONE runtime vocabulary.**
 *
 * THE RULE: (4) is the source. Nothing else enumerates occasions for the user. This module holds
 * only the TRANSLATIONS between that vocabulary and the two machine vocabularies that already
 * exist — `eventTypeEnum` (a persisted column with literal-reading consumers) and the presentation
 * class the Trip Strip's possessive lead is keyed on. It deliberately does NOT hold a list of
 * occasions to render: a surface that needs the list fetches it.
 *
 * Pure data + pure functions. No DB, no fetch, no React — importable from client and server alike.
 */
import { eventTypeEnum } from "./schema";

export type EventType = (typeof eventTypeEnum)[number];

/**
 * GET /api/experience-types returns platform experience-type slugs (e.g.
 * "corporate-events", "wedding-anniversaries", "boys-trip") which are NOT the
 * same vocabulary as `trips.eventType` (shared/schema.ts eventTypeEnum). Writing
 * a raw slug there silently breaks isEventOptimizer/the coordination-fee event-
 * credit branch (optimization-fee.service.ts BRANCH_MAP reads literal
 * "wedding"/"corporate"). Map explicitly; never invent semantics — an
 * unrecognized slug (e.g. "boys-trip", "baby-shower") maps to "other".
 *
 * MOVED VERBATIM from `client/src/components/intake-panel.tsx`'s EVENT_TYPE_SLUG_MAP (that file
 * now imports it). The entries are UNCHANGED — deliberately: every added mapping moves a trip into
 * a different fee/optimizer branch, which is a decision-maker call, not a refactor's side effect.
 */
export const OCCASION_SLUG_TO_EVENT_TYPE: Record<string, EventType> = {
  "corporate-events": "corporate",
  "wedding-anniversaries": "anniversary",
  vacation: "vacation",
  travel: "vacation",
  // ── The four occasions seeded by ledger `2026-09-03-occasion-switches` ──────────────────────
  // Each eventType was chosen by reading which FEE/OPTIMIZER BRANCH it lands the trip in
  // (`server/services/optimization-fee.service.ts` BRANCH_MAP: vacation/adventure/honeymoon/
  // anniversary → "trip"; proposal/birthday → "experience"; wedding/corporate → "event"; anything
  // unmapped → "trip"), not by which word reads nicest — a mapping IS a fee decision (§8/§14).
  romance: "vacation", // a couple's getaway is a trip; "trip" branch, same as `travel`.
  corporate: "corporate", // "Corporate Retreats" — the "event" branch, same as `corporate-events`.
  "milestone-birthday": "birthday", // the "experience" branch, same as `birthday`.
  // No eventTypeEnum member describes a family gathering. "other" is unmapped in BRANCH_MAP and
  // therefore lands in the DEFAULT "trip" branch — the same branch every unclassified trip already
  // gets. Listed explicitly rather than left to the fallback so the choice is visible and
  // reviewable; borrowing "wedding" or "corporate" would silently buy this occasion the event
  // branch's fee semantics (§13 — an honest "we do not claim to know" beats a nearer-looking guess).
  "family-occasion": "other",
};

/**
 * The `trips.event_type` value for an experience-type slug. A slug that IS already an eventTypeEnum
 * member passes through (wedding, proposal, birthday); anything else goes through the explicit map
 * above; anything unmapped is **"other"** — an honest "we do not claim to know", never a guess at a
 * nearer-looking member (§13).
 */
export function eventTypeForSlug(slug: string): EventType {
  const key = normalizeOccasionKey(slug);
  if ((eventTypeEnum as readonly string[]).includes(key)) return key as EventType;
  return OCCASION_SLUG_TO_EVENT_TYPE[key] ?? "other";
}

/** Vocabulary classes for the possessive OCCASION lead and the party noun. */
export type OccasionClass = "travel" | "event" | "couple";

/**
 * EXPLICIT class per seeded slug — every slug in the seeder's `templates` array
 * (`server/seeds/experience-template-tabs.seed.ts`, mirrored by `server/seed-experience-types.ts`)
 * appears here, and `shared/__tests__/occasions.test.ts` fails if one is added there without being
 * added here. A keyword sniff cannot be exhaustive by construction; a table can.
 *
 * BASELINE: these mirror what the keyword classifier already resolved, so this lane is not a silent
 * re-classification — with **ONE deliberate correction**, which is the defect the lane was opened
 * for:
 *
 *   `wedding-anniversaries` is an EVENT (a party with guests), not a couple's getaway. The keyword
 *   sniff matched "anniversar" and called it couple-class, which made it indistinguishable from
 *   `anniversary-trip` — two different products wearing one word, right down to the nav item
 *   labelled just "Anniversary". They are now different classes, and the nav label says which is
 *   which.
 *
 * Slugs whose baseline class is arguable (`retreats`, `reunions` → event; `sports-event` → travel,
 * the classifier's fallback rather than a judgement) are LEFT AT BASELINE here and raised for
 * ratification in `docs/briefs/OCCASION_VOCABULARY.md` instead. Changing them is a product ruling.
 */
export const OCCASION_CLASS_BY_SLUG: Record<string, OccasionClass> = {
  "bachelor-bachelorette": "event",
  "anniversary-trip": "couple",
  travel: "travel",
  wedding: "event",
  "date-night": "couple",
  birthday: "event",
  "corporate-events": "event",
  retreats: "event",
  // The one deliberate correction — see the note above.
  "wedding-anniversaries": "event",
  proposal: "couple",
  "boys-trip": "travel",
  "girls-trip": "travel",
  reunions: "event",
  "baby-shower": "event",
  "graduation-party": "event",
  "engagement-party": "event",
  "housewarming-party": "event",
  "retirement-party": "event",
  "career-achievement-party": "event",
  "farewell-party": "event",
  "holiday-party": "event",
  "sports-event": "travel",
  // Seeded by ledger `2026-09-03-occasion-switches`. The class is PRESENTATION vocabulary only
  // (the possessive lead and the party noun) — the flow shape comes from the row's own switch
  // columns (migration 276), never from this.
  romance: "couple",
  corporate: "event",
  "milestone-birthday": "event",
  "family-occasion": "event",
};

/**
 * Keyword fallback — the original `classify` lists, moved here unchanged. It exists for input that
 * is NOT a known slug: a free-text experience type, a legacy context blob, an occasion name a
 * surface stored before the table was the source. It is a fallback, not the answer.
 */
const EVENT_KEYWORDS = [
  "wedding", "birthday", "corporate", "party", "reunion", "shower", "graduation",
  "retirement", "farewell", "housewarming", "achievement", "holiday", "bachelor",
  "engagement", "retreat",
];
const COUPLE_KEYWORDS = ["proposal", "date night", "date-night", "anniversar", "honeymoon"];

/**
 * Normalize a slug OR a display name to the slug shape ("Wedding Anniversaries" →
 * "wedding-anniversaries"), so a caller that only has `experienceType.name` still hits the explicit
 * table. Whitespace runs collapse to a single hyphen; case is folded.
 */
export function normalizeOccasionKey(slugOrName: string): string {
  return slugOrName.trim().toLowerCase().replace(/\s+/g, "-");
}

/**
 * Classify an occasion into its vocabulary class. The EXPLICIT table wins; the keyword sniff is the
 * fallback for anything not in it; travel is the last resort, as before.
 */
export function classifyOccasion(slugOrName?: string | null): OccasionClass {
  const raw = (slugOrName || "").toLowerCase();
  const explicit = OCCASION_CLASS_BY_SLUG[normalizeOccasionKey(raw)];
  if (explicit) return explicit;
  if (COUPLE_KEYWORDS.some((k) => raw.includes(k))) return "couple";
  if (EVENT_KEYWORDS.some((k) => raw.includes(k))) return "event";
  return "travel";
}
