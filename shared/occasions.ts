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
  // ── Honeymoon (ledger `2026-09-03-occasion-hygiene`) ────────────────────────────────────────
  // "honeymoon" IS an `eventTypeEnum` member, so `eventTypeForSlug` would already pass it through
  // untouched; the entry is written out anyway because the pass-through is an accident of the two
  // vocabularies sharing a spelling, and this is a FEE decision that must be visible where the
  // other fee decisions are (§8/§14). BRANCH_MAP maps `honeymoon` -> "trip" — the same branch
  // `vacation` and `anniversary` land in, which is the branch a multi-day couple's getaway
  // belongs to. Deleting this line would not change today's behaviour; it would only hide the
  // choice until the day someone drops "honeymoon" from the enum.
  honeymoon: "honeymoon",
  // ── Golf trip (ledger `2026-09-04-golf-occasion-and-housekeeping`) ──────────────────────────
  // A golf trip is a multi-day trip, so it lands in BRANCH_MAP's "trip" branch — the same branch
  // `travel` and `romance` land in, and the same branch it already got while it WAS the `travel`
  // occasion. Written out rather than left to the unmapped "other" fallback (which reaches the
  // same branch today) because a mapping IS a fee decision (§8/§14) and belongs where the other
  // fee decisions are readable.
  "golf-trip": "vacation",
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
  // Seeded by ledger `2026-09-03-occasion-hygiene`. Couple-class, which is what the keyword sniff
  // already answered for the word "honeymoon" — so this is not a re-classification, it is the same
  // answer moved into the table that can be checked against the seeder (O1).
  honeymoon: "couple",
  // Seeded by ledger `2026-09-04-golf-occasion-and-housekeeping`. Travel-class, which is what the
  // keyword sniff already answered for a golf trip (no EVENT/COUPLE keyword matches "golf", so it
  // fell to the travel last resort) — the same answer, moved into the table O1 can check.
  "golf-trip": "travel",
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
 * Display names whose kebab-cased form is NOT the row's slug — the alias table that keeps a caller
 * holding only `experienceType.name` on the explicit tables above.
 *
 * WHY IT EXISTS (ledger `2026-09-03-occasion-hygiene`). Kebab-casing the name is a HEURISTIC that
 * happens to work while a row's name and slug agree. Renaming `wedding-anniversaries` from the
 * plural "Wedding Anniversaries" to "Wedding Anniversary" broke it in the worst possible
 * direction: "wedding-anniversary" misses `OCCASION_CLASS_BY_SLUG`, falls through to the keyword
 * sniff, matches "anniversar" in COUPLE_KEYWORDS and comes back **couple** — re-creating exactly
 * the two-products-one-word collision the explicit table was built to end (see O4). A name change
 * must never be able to silently move an occasion between classes, so the names that do not
 * kebab-case to their own slug are listed here instead of being left to luck.
 *
 * Keys are already-normalized (lowercase, hyphenated); values are real seeded slugs.
 */
const OCCASION_NAME_ALIASES: Record<string, string> = {
  "wedding-anniversary": "wedding-anniversaries",
  "romantic-getaways": "romance",
  "romantic-getaway": "romance",
  "corporate-retreats": "corporate",
  "bachelor/bachelorette-party": "bachelor-bachelorette",
};

/**
 * Normalize a slug OR a display name to the slug shape ("Wedding Anniversary" →
 * "wedding-anniversaries"), so a caller that only has `experienceType.name` still hits the explicit
 * table. Whitespace runs collapse to a single hyphen; case is folded; a name that does not
 * kebab-case to its own slug is then resolved through `OCCASION_NAME_ALIASES`.
 */
export function normalizeOccasionKey(slugOrName: string): string {
  const kebab = slugOrName.trim().toLowerCase().replace(/\s+/g, "-");
  return OCCASION_NAME_ALIASES[kebab] ?? kebab;
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

/**
 * THE REVERSE LOOKUP, AND WHY IT REFUSES TO GUESS (ledger `2026-09-03-switch-readers`).
 *
 * `eventTypeForSlug` is MANY-TO-ONE: `travel`, `romance` and `vacation` all land on `"vacation"`;
 * `birthday` and `milestone-birthday` both land on `"birthday"`. So a `trips.event_type` value
 * does NOT identify an occasion row, and a surface that has only a trip (the slip does — the
 * plancard DTO carries no experience-type id) cannot in general recover the occasion it was
 * planned as.
 *
 * This function says so out loud instead of picking a nearest match. It returns a row ONLY when
 * exactly ONE occasion in the supplied list maps to that event type; zero matches or two return
 * `null`, and the caller falls back to the plain-plan shape (§13). Concretely that means the
 * proposal case — the one occasion the seeder marks `visibility: "hidden"`, and the reason the
 * slip needs this at all — resolves unambiguously (`proposal` is itself an `eventTypeEnum` member,
 * so it is the only slug that maps to `"proposal"`), while an ambiguous family like
 * birthday/milestone-birthday honestly resolves to nothing rather than to whichever row happened
 * to be seeded first.
 *
 * Generic over `{ slug }` so it takes an `ExperienceType[]` straight off `GET /api/experience-types`
 * without this module importing a row type.
 */
export function findOccasionByEventType<T extends { slug: string }>(
  rows: readonly T[] | null | undefined,
  eventType: string | null | undefined,
): T | null {
  const wanted = (eventType || "").trim().toLowerCase();
  if (!wanted || !rows) return null;
  const matches = rows.filter((r) => eventTypeForSlug(r.slug) === wanted);
  return matches.length === 1 ? matches[0] : null;
}

/**
 * The occasion row for a slug or a display name, matched the same normalized way the edit panel
 * seeds its select (`normalizeOccasionKey` on both sides, so "Wedding Anniversaries" finds
 * `wedding-anniversaries`). Returns `null` when nothing matches — never a nearest-looking row.
 */
export function findOccasionByKey<T extends { slug: string; name?: string | null }>(
  rows: readonly T[] | null | undefined,
  slugOrName: string | null | undefined,
): T | null {
  const wanted = normalizeOccasionKey(slugOrName || "");
  if (!wanted || !rows) return null;
  return (
    rows.find(
      (r) =>
        normalizeOccasionKey(r.slug) === wanted ||
        (typeof r.name === "string" && normalizeOccasionKey(r.name) === wanted),
    ) ?? null
  );
}

/**
 * THE PLAN'S OCCASION, RESOLVED EVENTS-FIRST (ledger `2026-09-05-slip-switch-reads-events-first`;
 * CLAUDE.md Locked Decision 42's D1 client step, Locked Decisions 28 and 29).
 *
 * ── WHY A SECOND ATTEMPT WAS NEEDED ─────────────────────────────────────────────────────────
 * `findOccasionByEventType` above is the only lookup a slip had, and it is correct but narrow:
 * `eventTypeForSlug` is many-to-one, so it returns a row ONLY on a unique match and honestly
 * refuses the rest. Concretely that leaves most of the seeded catalog unresolvable from a trip —
 * `birthday`/`milestone-birthday` both map to `"birthday"`, `corporate`/`corporate-events` both
 * to `"corporate"`, and the whole travel family (`travel`, `romance`, `golf-trip`, …) collapses
 * onto `"vacation"` — so their slips fell back to the plain-trip shape even though the traveler
 * had picked a specific occasion. `trips` carries no `experience_type_id` today (a later lane
 * adds the column), so there was nothing exact to read.
 *
 * There IS something exact one level down. An event inside a plan is a `user_experiences` row
 * (Locked Decision 29) and that row's `experience_type_id` is NOT NULL — it names the occasion by
 * ID, no vocabulary bridge in between. The plancard payload already ships those rows as its
 * `events` array with `experienceTypeId` on each. So: **when every event on the plan names the
 * SAME occasion, that occasion IS the plan's** — an exact identity, not a guess.
 *
 * ── §13, AND WHY THE AGREEMENT TEST IS STRICT ───────────────────────────────────────────────
 * Attempt 1 fires only when there is one unanimous answer. Events that disagree, an events array
 * where any event carries no id, an id no supplied row matches (a row deleted between two reads,
 * or one this viewer's gate did not return), and an empty/absent array are ALL "this does not
 * identify an occasion" — and every one of them falls through to attempt 2 rather than picking a
 * majority, a first, or a nearest. A plan holding a ceremony and a rehearsal dinner from two
 * different occasions has not told us which one it is, and answering anyway would wear the
 * traveler's authority for a choice they never made.
 *
 * Both attempts failing is `null`, which every caller renders as the PLAIN-TRIP shape and says so
 * — unchanged from before this function existed. Widening, never narrowing: attempt 2 is exactly
 * today's lookup, reached with exactly today's inputs.
 *
 * Pure — no React, no fetch, no DB — so both attempts are testable on their own and neither can
 * drift into a second copy at a call site (§18 rule 1).
 */
export interface PlanEventOccasionRef {
  /** `user_experiences.experience_type_id` as the plancard `events` array ships it. */
  experienceTypeId?: string | null;
}

/**
 * The ONE occasion every supplied event names, or `null` when they do not agree on one.
 *
 * Exported for the pins: the agreement rule is the interesting half of the resolver and is worth
 * asserting without a row list in the way.
 */
export function unanimousEventOccasionId(
  events: readonly PlanEventOccasionRef[] | null | undefined,
): string | null {
  if (!events || events.length === 0) return null;
  let agreed: string | null = null;
  for (const event of events) {
    const id = typeof event?.experienceTypeId === "string" ? event.experienceTypeId.trim() : "";
    // An event with no occasion id cannot vote, and it cannot be ignored either: the plan then
    // has an event we cannot attribute, so the plan does not unanimously name anything (§13).
    if (!id) return null;
    if (agreed === null) agreed = id;
    else if (agreed !== id) return null;
  }
  return agreed;
}

/** The occasion row with this id, or `null`. An id nothing matches is never a nearest row. */
export function findOccasionById<T extends { id: string }>(
  rows: readonly T[] | null | undefined,
  id: string | null | undefined,
): T | null {
  const wanted = (id || "").trim();
  if (!wanted || !rows) return null;
  return rows.find((r) => r.id === wanted) ?? null;
}

/**
 * Resolve the occasion behind a plan: events first (exact), then the event-type lookup (unique
 * match only), then `null` (the plain-trip shape).
 */
export function resolveOccasionForPlan<T extends { id: string; slug: string }>(input: {
  events?: readonly PlanEventOccasionRef[] | null;
  eventType?: string | null;
  occasions?: readonly T[] | null;
}): T | null {
  const { events, eventType, occasions } = input;
  // ATTEMPT 1 — the plan's own events name the occasion by id. Exact; no vocabulary bridge.
  const byId = findOccasionById(occasions, unanimousEventOccasionId(events));
  if (byId) return byId;
  // ATTEMPT 2 — today's lookup, unchanged: a row only when the event type identifies exactly one.
  return findOccasionByEventType(occasions, eventType);
}
