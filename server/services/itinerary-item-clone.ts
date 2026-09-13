/**
 * itinerary-item-clone.ts — WHAT A CLONED PLAN ITEM CARRIES, stated as an ALLOWLIST.
 *
 * (punchlist V-14 + V-15, ledger `2026-09-13-clone-carries-content-not-state`;
 *  CLAUDE.md §19, §13, §14, Locked Decision 39, Locked Decision 21, Locked Decision 29)
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────────────────────
 * The ready-made clone used to build the buyer's items with a SPREAD minus four names:
 *
 *     sourceItems.map(({ id, tripId, createdAt, updatedAt, ...rest }: any) => ({
 *       ...rest, tripId: cloneTrip.id, routing_status: "in_planning",
 *     }))
 *
 * That is a DENYLIST, and §19 exists because nobody edits a denylist for a column that did not
 * exist when it was written. `bookingId` arrived in migration 159, long after that expression was
 * written, and was copied BY DEFAULT — so a buyer's plan item could point at the AUTHOR's
 * `service_bookings` row and show the AUTHOR's confirmation number (V-15). The same expression's
 * one explicit override was INERT: the object key was the snake_case `routing_status` while the
 * drizzle column key is `routingStatus`, drizzle reads values BY COLUMN KEY, and the `as any` had
 * removed the type check that would have said so — so `...rest` carried the author's own routing
 * state through, and an author item left in `ready_for_checkout` landed in the buyer's CART, which
 * under Locked Decision 39 is this table's `ready_for_checkout` projection (V-14).
 *
 * ── THE SHAPE ───────────────────────────────────────────────────────────────────────────────
 * `CLONE_CARRIED_FIELDS` is the allowlist and `buildClonedItineraryItem` copies NOTHING else, so a
 * column added tomorrow is excluded BY DEFAULT rather than carried by default. `CLONE_EXCLUDED_
 * FIELDS` records the reason for every column that does NOT travel, and the two together are
 * pinned EXHAUSTIVE against `getTableColumns(itineraryItems)` — the mechanically-true allowlist
 * shape ledger `2026-09-05-experts-public-projection` established, where "a column the allowlist
 * does not name" is COMPUTED rather than remembered. A new column belongs to NEITHER list, so the
 * pin fails and a human decides which class it is. The decision is never made by a default.
 *
 * ── THE LINE: CONTENT TRAVELS, STATE DOES NOT ───────────────────────────────────────────────
 * A buyer bought the author's PLAN — what to do, where, in what order, at roughly what cost. They
 * did not buy the author's TRANSACTIONS, their calendar, or their pointers into their own trip.
 * Three kinds of thing are therefore excluded, and each one is a different failure if carried:
 *   (a) BOOKING STATE (`bookingId`, `confirmationNumber`, `actualCost`, …) — a cross-user claim:
 *       the buyer's row would assert a purchase that is somebody else's (V-15).
 *   (b) CROSS-TRIP IDENTITY (`userExperienceId`, `participantIds`, `conflictsWith`, `backupPlanId`,
 *       `slotId`, `vendorContractId`) — a pointer into the AUTHOR's trip. Locked Decision 29 makes
 *       this explicit for one of them: a non-null `userExperienceId` must name an event whose
 *       `trip_id` IS the item's trip, and both live write rails REFUSE one that does not, so a
 *       clone carrying the author's event id would write exactly what those rails exist to reject.
 *   (c) ABSOLUTE DATES (`scheduledDate`, `checkIn`, `checkOut`) — the clone is minted with its own
 *       placeholder window and the buyer re-dates it; `dayNumber` is the relative fact that IS the
 *       content. Carrying the author's calendar dates is the stale-date class one table over.
 * §13 governs every exclusion: the clone's absent value means NOT CAPTURED FOR THIS BUYER, which
 * is the truth, and no excluded column is replaced by a guess.
 */
import { getTableColumns } from "drizzle-orm";
import { itineraryItems } from "@shared/schema";

type ItineraryItemRow = typeof itineraryItems.$inferSelect;
type ItineraryItemColumn = keyof ItineraryItemRow;

/**
 * THE ALLOWLIST — the author's CONTENT, and only that. Every entry is a fact about the plan the
 * buyer paid for; none of them says anything about a transaction, a calendar date, or a row in
 * the author's own trip.
 */
export const CLONE_CARRIED_FIELDS = [
  // What it is
  "title", "description", "itemType",
  // When, relative to the plan (dayNumber is NOT NULL and is the ordering content; the wall-clock
  // strings are stored verbatim and never converted — the same posture Locked Decision 30 takes).
  "dayNumber", "startTime", "endTime", "durationMinutes", "isFlexible",
  // Where
  "locationName", "locationAddress", "latitude", "longitude", "googlePlaceId",
  // How you get there from the previous item — a property of the SEQUENCE, which is the content.
  "travelFromPrevious", "transportProvided", "pickupPoint", "dropOffPoint",
  // What it is grounded to. All three are pointers into PLATFORM-WIDE catalogs (provider_services,
  // dmo_extracted_places, affiliate_products), NOT into the author's trip: they are the author's
  // recommendation of a bookable or known thing, which is exactly what the buyer bought. None of
  // them is a booking — the booking columns are excluded below.
  "providerServiceId", "dmoExtractedPlaceId", "affiliateProductId", "gemId",
  // What the author reckons it costs. `estimatedCost` is a JUDGEMENT the author published as part
  // of the plan (§8: it is not a fee, a rate or a commission — it is a traveler-facing estimate),
  // so it travels; `actualCost` is what the AUTHOR actually paid and does not.
  "estimatedCost", "currency", "costPerPerson",
  // Planning attributes the optimizer and the day-shape readers use.
  "energyLevel", "isOutdoor", "weatherDependent", "weatherConditions", "isBackupPlan",
  "minParticipants", "maxParticipants",
  "energyCost", "energyType", "attendanceRequirement", "peakTimingPreference",
  // The author's words. `notes` is the plan's own prose and `expertNote` is the traveler-facing
  // "from your expert" field Locked Decision 21 created — the per-item twin of the trip-level
  // `expertTravelerNote` this same fulfilment already carries. The PRIVATE twin (`privateNotes`)
  // is excluded below for the same reason `trips.expertNotes` is.
  "notes", "expertNote",
  // Who authored the content. These describe the ITEM's provenance, not a transaction: a
  // ready-made plan's items really were written by an expert, and Locked Decision 42 D23's origin
  // chip and D3's protected set both read a TRUE answer here rather than a flattened one.
  "suggestedBy", "origin",
  // Order within the day.
  "sortOrder",
] as const satisfies readonly ItineraryItemColumn[];

/**
 * EVERYTHING ELSE, with the reason it stays behind. This map is not consulted at runtime — the
 * builder copies the allowlist and nothing else — it exists so the exhaustiveness pin can prove
 * every column was DECIDED, and so the decision is readable a year from now.
 */
export const CLONE_EXCLUDED_FIELDS: Readonly<Record<string, string>> = {
  // Identity and parentage — the clone mints its own.
  id: "identity — the clone's row mints a new id",
  tripId: "parentage — set by the builder to the buyer's clone trip",
  createdAt: "audit — the clone is created now, not when the author wrote the item",
  updatedAt: "audit — same",

  // Lifecycle / routing state. NOT carried, and `routingStatus` is set EXPLICITLY by the builder
  // (this is V-14: the old override named a key drizzle does not read, so the author's value came
  // through and an author row in `ready_for_checkout` landed in the buyer's cart under LD 39).
  routingStatus: "state — the builder sets it to in_planning; a clone never inherits author-side routing",
  status: "state — the value set includes booked/confirmed/completed, which are claims about the AUTHOR's item",

  // Booking state — V-15. A different user's transaction.
  bookingId: "booking state — FK to the AUTHOR's service_bookings row (a cross-user claim)",
  bookingStatus: "booking state — the AUTHOR's booking lifecycle",
  bookingReference: "booking state — the AUTHOR's reference with a partner",
  confirmationNumber: "booking state — the AUTHOR's confirmation, shown to a buyer who holds no booking",
  actualCost: "booking state — what the AUTHOR actually paid; the buyer has paid nothing yet",
  vendorContractId: "booking state — a contract between the AUTHOR and a vendor",
  slotId: "booking state — an availability slot the AUTHOR picked on a provider's inventory",

  // Cross-trip identity — pointers into the author's own trip.
  userExperienceId: "cross-trip identity — an event on the AUTHOR's trip; LD 29 requires the event's trip_id to BE the item's trip and both live write rails refuse a pairing that fails it. NULL is the clone's own implicit event",
  participantIds: "cross-trip identity — trip_participants ids belonging to the AUTHOR's trip",
  conflictsWith: "cross-trip identity — itinerary_items ids on the AUTHOR's trip",
  backupPlanId: "cross-trip identity — another itinerary item on the AUTHOR's trip. Remapping source ids onto the clone's new ids is a decision nobody has taken, so the link is DROPPED rather than left dangling (§13); `isBackupPlan` still travels, because 'this item is a fallback' is true of the content",

  // Absolute dates — the clone is minted with its own placeholder window.
  scheduledDate: "absolute date — the AUTHOR's calendar day; the buyer re-dates the plan and dayNumber carries the relative fact",
  checkIn: "absolute date — the AUTHOR's stay range",
  checkOut: "absolute date — the AUTHOR's stay range",

  // Private authorship, and one dormant free-form carrier.
  privateNotes: "private — organizer-only notes written by the SELLER. The trip-level twin (trips.expertNotes) is deliberately not carried by this same fulfilment under LD 21; the item-level twin follows it. `expertNote`, the traveler-facing field, DOES travel",
  attachments: "undecided free-form — an array of {name,url} the platform has no writer for today; in the worst case it is the AUTHOR's own voucher. Under §19's posture an undecided carrier is excluded by default, and excluding it costs the buyer nothing while nothing writes it",
};

/** Every column on the table, computed — never a hand-copied list (§18 rule 1). */
export function itineraryItemColumnNames(): string[] {
  return Object.keys(getTableColumns(itineraryItems));
}

/**
 * The exhaustiveness answer, computed against the live table definition. `undecided` is the one
 * that matters: a column named by NEITHER list is a column nobody has classified, and the
 * committed pin fails on it so the classification happens deliberately.
 */
export function cloneFieldCoverage(): { undecided: string[]; unknown: string[] } {
  const columns = new Set(itineraryItemColumnNames());
  const decided = new Set<string>(
    (CLONE_CARRIED_FIELDS as readonly string[]).concat(Object.keys(CLONE_EXCLUDED_FIELDS)),
  );
  return {
    undecided: Array.from(columns).filter((c) => !decided.has(c)).sort(),
    unknown: Array.from(decided).filter((c) => !columns.has(c)).sort(),
  };
}

/**
 * Build ONE cloned item row from a source row. The ONLY author of a ready-made clone's item shape
 * (§18 rule 1) — a second copy of this decision is how one rail starts carrying what the other
 * strips, and the mirror-of-the-production-expression unit test that used to sit beside this
 * service is exactly that failure: it reproduced the snake_case key and passed for the defect's
 * whole life.
 */
export function buildClonedItineraryItem(
  source: ItineraryItemRow,
  cloneTripId: string,
): typeof itineraryItems.$inferInsert {
  const carried: Record<string, unknown> = {};
  for (const field of CLONE_CARRIED_FIELDS) {
    carried[field] = source[field];
  }
  return {
    ...(carried as Omit<typeof itineraryItems.$inferInsert, "tripId" | "routingStatus">),
    tripId: cloneTripId,
    // The V-14 fix, written in the key drizzle actually reads. A clone is born in the buyer's
    // planner, never in their cart (LD 39: the cart IS this table's ready_for_checkout projection).
    routingStatus: "in_planning",
  };
}
