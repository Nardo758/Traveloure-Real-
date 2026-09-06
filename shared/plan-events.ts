/**
 * PLAN EVENTS — the shape a "What's happening" row holds before it becomes a `user_experiences`
 * row, and the ONE rule for what a row that answered nothing inherits from the plan.
 * Ledger `2026-09-04-event-time-ui`; cites `2026-09-04-stops-and-event-time` (migration 282,
 * CLAUDE.md Locked Decision 35) and `2026-09-04-plan-mint` (Locked Decision 30 (b)).
 *
 * IT LIVES IN `shared/` FOR ONE REASON: the same two answers are needed on BOTH sides of the wire.
 * The plan modal posts an event directly when a trip row already exists; the pre-trip pen drain
 * (`server/services/pending-events.service.ts`) creates the same row at mint when it did not. Both
 * must normalize a held row the same way and both must resolve an unanswered day/place the same
 * way, and two copies of that is the derivation-drift class §18 rule 1 names — it is exactly how
 * one door starts stamping the plan's first day while the other leaves it blank.
 *
 * ── WHAT A DRAFT MAY HOLD, AND WHAT ABSENT MEANS (§13) ──────────────────────────────────────
 * `title` is the only required field: it is what the traveler ticked or typed, and it is the row's
 * identity (the drain is idempotent on it). Every other field is OPTIONAL and ABSENT MEANS THE
 * TRAVELER DID NOT ANSWER — never a fabricated value wearing their authority:
 *
 *   · `eventDate` absent  ⇒ no day was chosen. The step shows the plan's first day as a
 *     PLACEHOLDER and does not write it; the day is only inherited at CREATE time, below, where
 *     it is the plan's own fact rather than a claim about what the traveler picked.
 *   · `startTime` absent  ⇒ NO TIME WAS GIVEN, and the created row's `start_time` stays NULL.
 *     There is no inheritance for a time: a plan has no "first hour" to fall back on, and
 *     midnight or "all day" would both be claims nobody made (Locked Decision 35).
 *   · `location` absent   ⇒ no place was named; the plan's destination is inherited at create,
 *     which is what the modal has always sent and what the drain has always written.
 *
 * FORMATS ARE SHAPE CHECKS ONLY, and they are the SAME shapes the two admission rails enforce —
 * `userExperienceStartTimeSchema` (`shared/schema.ts`, the format authority for the column) and
 * the `PUT /api/trip-context` allowlist. Nothing here validates a RANGE ("25:00" survives) for the
 * reason stated at that schema: a range rule invented by a normalizer becomes a second authority
 * the day a real time model arrives. What normalization DOES do is drop a value whose SHAPE is
 * wrong, because a malformed held value is not an answer this code can honestly pass on.
 */

/** The pen's caps, mirroring the `PUT /api/trip-context` allowlist so a held row survives a round trip. */
export const MAX_PLAN_EVENTS = 20;
export const MAX_PLAN_EVENT_TITLE = 120;
export const MAX_PLAN_EVENT_PLACE = 255;

/** "YYYY-MM-DD" — the same shape the context allowlist and `user_experiences.event_date` take. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** "HH:MM" — the same shape `userExperienceStartTimeSchema` enforces. Shape only, never a range. */
const TIME_RE = /^\d{2}:\d{2}$/;

/**
 * ONE row of the ratified Step-5 table (`docs/design/wedding-flow/ModalEvents.dc.html`,
 * `TravelEvents.dc.html`): Event · Day · Time · Place.
 */
export interface PlanEventDraft {
  /** What the traveler ticked or typed. The row's identity; never empty after normalization. */
  title: string;
  /** "YYYY-MM-DD" within the plan's range. ABSENT = no day chosen (§13). */
  eventDate?: string;
  /** "HH:MM" wall clock, read in the plan's `trips.timezone`. ABSENT = no time given (§13). */
  startTime?: string;
  /** Free text — a venue, a course, a room. ABSENT = no place named (§13). */
  location?: string;
}

/** A day/place a row with no answer of its own inherits — the PLAN's own facts, never a guess. */
export interface PlanEventDefaults {
  /** The plan's first day ("YYYY-MM-DD"). */
  startDate?: string | null;
  /** The plan's destination. */
  destination?: string | null;
}

/** What a created `user_experiences` row carries. `null` is written, not omitted, so a caller
 *  cannot mistake "we chose not to send this" for "the column has a value". */
export interface PlanEventRowValues {
  title: string;
  eventDate: string | null;
  startTime: string | null;
  location: string | null;
}

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : undefined;
}

function cleanShape(value: unknown, re: RegExp): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return re.test(trimmed) ? trimmed : undefined;
}

/**
 * The PLAN's own start day, reduced to a calendar day. Deliberately more tolerant than
 * `cleanShape(…, DATE_RE)` above: `trips.start_date` reaches the drain as whatever the mint site
 * held — sometimes a bare "YYYY-MM-DD", sometimes a full ISO instant — and both have always been
 * passed through verbatim. Taking the date part keeps that behaviour rather than silently turning
 * an inherited day into NULL, and it never re-reads the value in another zone (F-1).
 */
function calendarDay(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  // Both separators a stored date reaches us with — the ISO "T" and the SQL space — so neither
  // spelling of the same day turns into a NULL the traveler would read as "no day".
  return cleanShape(value.trim().split(/[T ]/)[0], DATE_RE);
}

/**
 * Normalize anything that claims to be a list of drafts — a pen read off a jsonb blob, a legacy
 * `string[]` of bare titles, the modal's own in-memory rows — into the canonical shape.
 *
 * Rules, all of which exist because this runs on values that have been round-tripped through
 * storage a caller does not control:
 *  - a non-string / empty title drops the whole row (a row with no title is not an event);
 *  - a BARE STRING is accepted as a title-only draft, which is exactly the legacy
 *    `pendingEventTitles` shape — read for one release, then it is simply never written again;
 *  - a malformed `eventDate` / `startTime` / `location` is DROPPED, leaving the field absent
 *    (= not answered), and never coerced into a nearby-looking value;
 *  - duplicates collapse case-insensitively on the title, FIRST occurrence winning, because the
 *    drain is idempotent by title and two rows of one name would race for the same event;
 *  - the list is capped, and it is NEVER re-sorted: the traveler's tick order is the order.
 */
export function normalizePlanEvents(input: unknown): PlanEventDraft[] {
  if (!Array.isArray(input)) return [];
  const out: PlanEventDraft[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const source: any = typeof raw === "string" ? { title: raw } : raw;
    if (!source || typeof source !== "object") continue;
    const title = cleanText(source.title, MAX_PLAN_EVENT_TITLE);
    if (!title) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const draft: PlanEventDraft = { title };
    const eventDate = cleanShape(source.eventDate, DATE_RE);
    if (eventDate) draft.eventDate = eventDate;
    const startTime = cleanShape(source.startTime, TIME_RE);
    if (startTime) draft.startTime = startTime;
    const location = cleanText(source.location, MAX_PLAN_EVENT_PLACE);
    if (location) draft.location = location;
    out.push(draft);
    if (out.length >= MAX_PLAN_EVENTS) break;
  }
  return out;
}

/**
 * THE ONE INHERITANCE RULE, stated once for both create rails.
 *
 * A row the traveler gave a day/place keeps it. A row they did not falls back to the PLAN's own
 * first day and destination — which is precisely what the modal has always posted and what the
 * pen drain has always written, so this changes no existing behaviour; it just stops being written
 * twice. The TIME has no fallback and never gains one: a plan carries no hour, and NULL is the
 * honest answer for a time nobody gave (Locked Decision 35, §13).
 */
export function planEventRowValues(
  draft: PlanEventDraft,
  defaults: PlanEventDefaults = {},
): PlanEventRowValues {
  return {
    title: draft.title,
    eventDate: draft.eventDate || calendarDay(defaults.startDate) || null,
    startTime: draft.startTime || null,
    location: draft.location || cleanText(defaults.destination, MAX_PLAN_EVENT_PLACE) || null,
  };
}

/**
 * ── TITLE IS THE IDENTITY OF AN EVENT INSIDE A PLAN, STATED ONCE ────────────────────────────
 * Ledger `2026-09-06-event-mint-dedupe`.
 *
 * Three rails create the same kind of row and every one of them needs the same answer to "does
 * this plan already carry this event?": the pre-trip pen drain at mint
 * (`server/services/pending-events.service.ts`, whose rule 4 is exactly this), the plan modal's
 * own save (`PlanModal.commitPlan`), and the slip's one-time "Organize into events"
 * (`eventsNotYetCreated`). Each of them had, or was missing, its own copy — which is how a plan
 * came to hold "Ceremony, Reception, Ceremony, Reception": the drain skipped nothing because
 * nothing existed when it ran, and the modal a moment later skipped nothing because it never
 * asked. One authority, three callers (§18 rule 1).
 *
 * WHAT IS AND IS NOT PART OF THE IDENTITY. The TITLE is, case- and space-insensitively, because
 * that is what `normalizePlanEvents` already collapses a pen's own duplicates on. The day, the
 * time and the place are NOT: they are answers a traveler can edit between two passes, and
 * including them would fork one event into two the moment a time was corrected. An absent or
 * blank existing title matches NOTHING (§13 — "no answer" is not a name, and must never swallow
 * a real one).
 *
 * IT SKIPS; IT NEVER REWRITES. A row that is already on the plan keeps every answer it has —
 * editing one is `PATCH /api/user-experiences/:id`, a different act with its own rail.
 *
 * THIS IS NOT A CONSTRAINT AND MUST NOT BECOME ONE. `user_experiences` carries no UNIQUE index
 * and no CHECK for this, deliberately: a constraint added here is the publish-time drizzle-push
 * failure the Coordination Prevention rules warn about, and it would also refuse a plan whose
 * traveler genuinely wants two events of one name — which is theirs to decide on the surfaces
 * that create one at a time, not this rule's.
 */

/** The identity key of an event title. Trimmed and lowercased — nothing else. */
export function planEventTitleKey(title: string): string {
  return title.trim().toLowerCase();
}

/**
 * The drafts a writer should actually create: those the plan does not already carry by title.
 *
 * @param drafts         what this rail is about to create, in the traveler's own order.
 * @param existingTitles the titles the plan already holds. A blank/absent entry is ignored.
 */
export function eventsNotYetOnPlan(
  drafts: readonly PlanEventDraft[],
  existingTitles: readonly (string | null | undefined)[],
): PlanEventDraft[] {
  const existing = new Set<string>();
  for (const title of existingTitles) {
    if (typeof title !== "string") continue;
    const key = planEventTitleKey(title);
    if (key) existing.add(key);
  }
  return drafts.filter((draft) => !existing.has(planEventTitleKey(draft.title)));
}
