/**
 * OWN YOUR PLAN — the pure rules behind the slip's ✕ ✎ ↑↓ and its "Add something to this event".
 *
 * Ledger `2026-09-05-slip-own-your-plan`; CLAUDE.md Locked Decision 42 rows 1.6 / S1 / S2 / D16,
 * Locked Decision 39 (every add surface is a view of `itinerary_items`), Locked Decision 29 (the
 * item→event link and its allowlist), §13, §14 and §18 rule 1.
 *
 * WHY A PURE MODULE. Every decision below is a rule, not a rendering: WHO gets a tool, WHICH
 * endpoint each tool calls, WHAT is allowed into the body, and — the one that is easy to get
 * quietly wrong — WHICH DAY a hand-added item lands on. Kept here they are testable with no DOM
 * and cannot be restated at a call site (§18 rule 1); the component in `SlipItemTools.tsx` is only
 * the buttons and the fetches.
 *
 * NO NEW ENDPOINT EXISTS FOR ANY OF THIS. The four rails are the ones already on the platform:
 *   add      POST   /api/trips/:tripId/itinerary-items          (LD 39's one add rail; the
 *                                                                monolith copy shadows the twin)
 *   edit     PATCH  /api/trips/:tripId/itinerary-items/:itemId   (the trips.routes.ts copy)
 *   delete   DELETE /api/trips/:tripId/itinerary-items/:itemId   (same file; now 409s on a
 *                                                                booked row, review R14)
 *   reorder  POST   /api/trips/:tripId/itinerary/reorder         (the Workstation's own shape:
 *                                                                { dayNumber, itemIds })
 */
import {
  itineraryItemIsMoneyCommitted,
  itineraryItemIsPaid,
} from "@shared/itinerary-item-money";

/** The four rails, written down once so a test can pin them and a caller cannot invent a fifth. */
export const SLIP_ITEM_ENDPOINTS = {
  add: (tripId: string) => `/api/trips/${tripId}/itinerary-items`,
  edit: (tripId: string, itemId: string) => `/api/trips/${tripId}/itinerary-items/${itemId}`,
  remove: (tripId: string, itemId: string) => `/api/trips/${tripId}/itinerary-items/${itemId}`,
  reorder: (tripId: string) => `/api/trips/${tripId}/itinerary/reorder`,
} as const;

export const SLIP_ADD_EVENT_LABEL = "Add something to this event";
export const SLIP_ADD_DAY_LABEL = "Add something to this day";
/**
 * §13 — WHY AN ADD CONTROL CAN BE ABSENT, SAID OUT LOUD. `itinerary_items.day_number` is NOT NULL,
 * so an item must land on a numbered day. A slot the EVENTS alone brought into being (an event
 * with no date, or a plan whose start date is unknown) resolves to no day at all, and filing the
 * traveler's item on "day 1" would be a day nobody chose. The control is replaced by this, which
 * names the missing fact rather than pretending the surface is broken.
 */
export const SLIP_ADD_NEEDS_A_DAY_NOTE = "Give this event a date to add things under it.";
export const SLIP_DELETE_CONFIRM_LABEL = "Remove this from the plan?";
/**
 * S3's line on the item row, in the ratified `ItemRow` artboard's own words (ledger
 * `2026-09-06-slip-conformance`).
 *
 * The row mounts the EXISTING per-item thread (`ItemComments`, migration 165 — the same component
 * the Trip Card and the Workstation mount). What the SLIP calls that thread is the slip's decision,
 * not the component's, so the label is stated HERE and passed in; the component keeps its own
 * default ("Comment" / "N comments") for the two mounts that were not part of this ruling.
 *
 * §13 — the slip mount shows NO COUNT beside it. The artboard draws none, and the plancard payload
 * carries none: a number here could only come from somewhere other than the thread it describes.
 * The real count still renders inside the opened thread, from that thread's own read.
 */
export const SLIP_ASK_EXPERT_LABEL = "Ask your expert about this";
/** The four things the form asks. Deliberately no cost field — see `buildSlipAddItemBody`. */
export const SLIP_ITEM_FORM_FIELDS = ["title", "startTime", "locationName", "notes"] as const;

// ── WHO GETS WHICH TOOL ────────────────────────────────────────────────────────────────────────

export interface SlipItemToolset {
  reorder: boolean;
  edit: boolean;
  remove: boolean;
}

const NO_TOOLS: SlipItemToolset = { reorder: false, edit: false, remove: false };

/**
 * D16 — THE SLIP'S EDIT CONTROLS ARE THE OWNER'S. An advisor viewing the plan keeps read, note,
 * suggest and message; their edit surface is the Workstation, and a second one on the traveler's
 * own plan would be two places the same mutation is authored and two places §12 has to be
 * remembered. This is a RENDER rule and grants nothing: the server's own gates are untouched.
 *
 * The money rules are the ratified `ItemRow` artboard's callout 5, in one place:
 *   · a PAID row (`routing_status = 'purchased'`) carries NO tools at all;
 *   · a BOOKED row (a `booking` of its own) keeps ↑ and ✎ and loses ✕ — removing it would orphan
 *     a booking the plan cannot see;
 *   · every other row carries all three.
 * The predicate is the SHARED one the DELETE rail refuses on, never a second copy (§18 rule 1).
 */
export function slipItemTools(input: {
  isOwner: boolean;
  routingStatus?: string | null;
  bookingId?: string | null;
}): SlipItemToolset {
  if (!input.isOwner) return NO_TOOLS;
  if (itineraryItemIsPaid(input)) return NO_TOOLS;
  const money = itineraryItemIsMoneyCommitted(input);
  return { reorder: true, edit: true, remove: !money };
}

// ── WHICH DAY A HAND-ADDED ITEM LANDS ON ───────────────────────────────────────────────────────

/** "YYYY-MM-DD" out of a date column, an ISO timestamp, or nothing. Never repaired, never guessed. */
function calendarDay(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const day = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/** Whole days between two "YYYY-MM-DD" strings, computed in UTC so no zone can shift the answer. */
function daysBetween(fromDay: string, toDay: string): number {
  const [fy, fm, fd] = fromDay.split("-").map(Number);
  const [ty, tm, td] = toDay.split("-").map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86400000);
}

/**
 * The day number a new item should carry, or NULL when the plan has not told us one.
 *
 * Two honest sources and no third:
 *   1. the slot's own `dayNum` — the plan's own day index, already a fact;
 *   2. the slot's machine date measured against the plan's start date — the EXACT inverse of the
 *      server's `dayDateIso(startDate, dayNum)`, so it is arithmetic over two real values rather
 *      than a guess. This is what lets a brand-new plan (events ticked at step 5, zero items, and
 *      therefore zero item-derived days) accept its first item at all.
 *
 * NULL when neither holds, and NULL when the date falls BEFORE the plan starts — a negative day
 * index is not a day, and clamping it to 1 would file the item on a day nobody chose (§13).
 */
export function resolveAddDayNumber(input: {
  dayNum: number | null | undefined;
  dateIso?: string | null;
  tripStartDate?: string | null;
}): number | null {
  if (typeof input.dayNum === "number" && Number.isFinite(input.dayNum) && input.dayNum >= 1) {
    return input.dayNum;
  }
  const day = calendarDay(input.dateIso);
  const start = calendarDay(input.tripStartDate);
  if (!day || !start) return null;
  const n = daysBetween(start, day) + 1;
  return n >= 1 ? n : null;
}

// ── THE BODIES ─────────────────────────────────────────────────────────────────────────────────

export interface SlipItemFormValues {
  title: string;
  /** "HH:MM" wall clock, as typed. Stored verbatim — the plan's zone is read at render (LD 30). */
  startTime: string;
  locationName: string;
  /** The traveler's own note, which is `itinerary_items.description` — NOT `expert_note` (D4). */
  notes: string;
}

export const EMPTY_SLIP_ITEM_FORM: SlipItemFormValues = {
  title: "",
  startTime: "",
  locationName: "",
  notes: "",
};

function trimmed(v: string | null | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * The POST body for a hand-added item, or NULL when there is no title (the one required field —
 * `itinerary_items.title` is NOT NULL, and a blank submit is refused client-side rather than sent).
 *
 * §14 — NOT ONE MONEY FIELD RIDES THIS BODY. The form asks for no cost, price or amount and this
 * builder emits none: a traveler's plan row is a planning statement, and the platform's own
 * charge/fee paths derive every figure server-side. (The Workstation's own add form does carry an
 * `estimatedCost`; that is an expert's build note on a plan they are authoring, and copying the
 * field onto the traveler's surface would put a number on a row nobody quoted.)
 *
 * §13 — AN EMPTY OPTIONAL FIELD IS OMITTED, never sent as "". An unanswered time and a time
 * cleared to the empty string are different facts, and only the column's NULL says the first.
 *
 * LD 29 — `userExperienceId` ALWAYS rides, including as an explicit `null`. Null is the plan's ONE
 * implicit unnamed event, which is a real answer and not an absence; the server's pick-based
 * allowlist reads the key's PRESENCE, and its resolver re-checks the pairing against the DB.
 */
export function buildSlipAddItemBody(
  values: SlipItemFormValues,
  context: { dayNumber: number; userExperienceId: string | null },
): Record<string, unknown> | null {
  const title = trimmed(values.title);
  if (!title) return null;
  const body: Record<string, unknown> = {
    title,
    dayNumber: context.dayNumber,
    userExperienceId: context.userExperienceId,
  };
  const startTime = trimmed(values.startTime);
  if (startTime) body.startTime = startTime;
  const locationName = trimmed(values.locationName);
  if (locationName) body.locationName = locationName;
  const notes = trimmed(values.notes);
  if (notes) body.description = notes;
  return body;
}

/**
 * The PATCH body for an edited item: ONLY what actually changed, or NULL when nothing did (no
 * request is sent) or when the title was emptied (refused — the column is NOT NULL).
 *
 * A CLEARED FIELD IS SENT AS `null`, NOT AS "". Clearing is a real act and the column's NULL is
 * how it is recorded; "" would store an empty string that reads as an answered-but-blank field.
 *
 * D4 — `expertNote` IS NOT IN THIS BODY, and must never be added to it. The field is delivered to
 * the traveler and labelled as their expert's words; a note the traveler wrote themself under that
 * label is a false attribution. (The owner strip on the server side is its own lane; this surface
 * simply never sends it.) `origin`, `suggestedBy`, `routingStatus` and `bookingId` are likewise
 * absent — all four are server-stamped provenance or money linkage.
 */
export function buildSlipEditItemBody(
  next: SlipItemFormValues,
  previous: SlipItemFormValues,
): Record<string, unknown> | null {
  const title = trimmed(next.title);
  if (!title) return null;
  const body: Record<string, unknown> = {};
  if (title !== trimmed(previous.title)) body.title = title;
  for (const [key, column] of [
    ["startTime", "startTime"],
    ["locationName", "locationName"],
    ["notes", "description"],
  ] as const) {
    const nextValue = trimmed(next[key]);
    const prevValue = trimmed(previous[key]);
    if (nextValue === prevValue) continue;
    body[column] = nextValue ? nextValue : null;
  }
  return Object.keys(body).length > 0 ? body : null;
}

// ── REORDER ────────────────────────────────────────────────────────────────────────────────────

/**
 * The `itemIds` for `POST /api/trips/:tripId/itinerary/reorder` — the DAY's full ordered id list
 * with this item and its neighbour swapped — or NULL when there is nowhere to move.
 *
 * TWO LISTS, AND BOTH ARE LOAD-BEARING. `sortOrder` is DAY-scoped (the endpoint rewrites it from
 * the array index), so the request must carry the whole day. But the slip renders items grouped by
 * EVENT, so the row directly above this one on screen is its neighbour WITHIN THE GROUP, not
 * within the day. Swapping the two group members' positions inside the day list moves the row one
 * place within its own group and leaves every other row exactly where it was.
 *
 * NULL — never a silently reordered list — when the item is at the end of its group, or when
 * either id is missing from the day list (a payload the two reads disagree about is not something
 * to repair by guessing an order).
 */
export function reorderedDayItemIds(input: {
  dayItemIds: readonly string[];
  groupItemIds: readonly string[];
  itemId: string;
  direction: -1 | 1;
}): string[] | null {
  const groupIndex = input.groupItemIds.indexOf(input.itemId);
  if (groupIndex < 0) return null;
  const neighbourId = input.groupItemIds[groupIndex + input.direction];
  if (!neighbourId) return null;
  const ids = [...input.dayItemIds];
  const from = ids.indexOf(input.itemId);
  const to = ids.indexOf(neighbourId);
  if (from < 0 || to < 0) return null;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  return ids;
}

/** TRUE when this row has a neighbour to trade places with in the given direction. */
export function canReorderInDirection(input: {
  dayItemIds: readonly string[];
  groupItemIds: readonly string[];
  itemId: string;
  direction: -1 | 1;
}): boolean {
  return reorderedDayItemIds(input) !== null;
}
