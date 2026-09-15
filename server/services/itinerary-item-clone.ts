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
 *
 * ── ONE COLUMN IS DERIVED RATHER THAN CARRIED OR DROPPED ────────────────────────────────────
 * `origin` (Locked Decision 12) answers "who authored this row, relative to THIS plan's traveler",
 * so the author's stored value does not mean the same thing on the buyer's plan. It is stamped
 * server-side by `clonedItemOrigin` below, whose header states the rule and the reason.
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
  // them is a booking — the booking columns are excluded below. D-3 (decision-maker ruling
  // 2026-09-15, option A; ledger `2026-09-15-d3-readymade-separate-checkout`) names what that means
  // on the buyer's slip: a cloned item keeps its `providerServiceId` and arrives with NO booking,
  // NO slot and `routingStatus: "in_planning"`, so the slip's EXISTING neutral "Planning" routing
  // pill already says "in your plan, not booked" and the origin chip says "from your expert". The
  // buyer carts that service themselves, at its own listing price, on its own checkout — a
  // ready-made purchase and a service booking are never mixed (LD 39: the cart is this table's
  // `ready_for_checkout` projection). No new chip, no new column, no new rail.
  // `contentType`/`contentId` (migration 295, ruling 2026-09-15 punchlist D-16 (c); ledger
  // `2026-09-15-d16-plan-holds-venues-and-content`) join that list for exactly the same reason:
  // they name a piece of DISCOVER CONTENT — a gem, a hotel, an activity — which is platform-wide
  // and public, not a row in the author's trip. They are a soft reference and carry no booking and
  // no owner. (`customVenueId`, added by the same migration, is the OPPOSITE shape and is excluded
  // below.)
  "providerServiceId", "dmoExtractedPlaceId", "affiliateProductId", "gemId",
  "contentType", "contentId",
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
  // Who authored the content. This describes the ITEM's provenance, not a transaction: a
  // ready-made plan's items really were written by an expert. (`origin` is the other half of the
  // same fact and is DERIVED rather than copied — see `clonedItemOrigin` and its entry below.)
  "suggestedBy",
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
  origin: "provenance — DERIVED by the builder (`clonedItemOrigin`), never copied verbatim: the source's own value answers a question about the AUTHOR's trip, and on the BUYER's plan 'traveler'/NULL would be a false claim about a buyer who added nothing (ledger 2026-09-14-clone-items-are-expert-work)",

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
  customVenueId: "cross-user identity — a `custom_venues` row the AUTHOR created and OWNS (migration 295, ruling 2026-09-15 D-16 (b)). Every read of that table is owner-scoped (ledger `2026-09-05-custom-venues-owner-scope`), so on the buyer's plan the link resolves to nothing while still claiming the buyer has a venue of their own — the V-15 cross-user shape. The venue's own name, address and pin were copied onto the item's OWN columns when it was written, so the buyer loses no content by dropping the pointer",
  conflictsWith: "cross-trip identity — itinerary_items ids on the AUTHOR's trip",
  backupPlanId: "cross-trip identity — another itinerary item on the AUTHOR's trip. Remapping source ids onto the clone's new ids is a decision nobody has taken, so the link is DROPPED rather than left dangling (§13); `isBackupPlan` still travels, because 'this item is a fallback' is true of the content",

  // Absolute dates — the clone is minted with its own placeholder window.
  scheduledDate: "absolute date — the AUTHOR's calendar day; the buyer re-dates the plan and dayNumber carries the relative fact",
  checkIn: "absolute date — the AUTHOR's stay range",
  checkOut: "absolute date — the AUTHOR's stay range",

  // Counts that answer a question about a DIFFERENT buyer's cart (migration 298, ruling
  // 2026-09-15 D-41; ledger `2026-09-15-d41-item-quantity`).
  quantity:
    "cart answer — UNITS of the listing, and the unit count on a plan item is the BUYER's own " +
    "cart-line answer PROJECTED onto it by `cart-projection.service.ts` (D-14's admission rule, " +
    "D-41's one writer). The author's 3 says the AUTHOR wanted three, which is not an answer the " +
    "buyer gave and which no rail here could have admitted on their behalf: units are set on a " +
    "CART LINE, where `archetypeAsks` validates the question against the listing's archetype, and " +
    "this fulfilment writes no cart line. §13 — the clone therefore carries NULL, which MEANS ONE " +
    "UNIT rather than an absent answer, so the buyer's plan states the same thing every other " +
    "un-carted item on it states; if they want three they add three, through the rail that prices " +
    "them. Copying it would also be a silent money claim on a row nobody has bought",

  // Private authorship, and one dormant free-form carrier.
  privateNotes: "private — organizer-only notes written by the SELLER. The trip-level twin (trips.expertNotes) is deliberately not carried by this same fulfilment under LD 21; the item-level twin follows it. `expertNote`, the traveler-facing field, DOES travel",
  attachments: "undecided free-form — an array of {name,url} the platform has no writer for today; in the worst case it is the AUTHOR's own voucher. Under §19's posture an undecided carrier is excluded by default, and excluding it costs the buyer nothing while nothing writes it",
};

/**
 * ── WHO AUTHORED A CLONED ROW (ledger `2026-09-14-clone-items-are-expert-work`) ──────────────
 *
 * Locked Decision 12 gives `itinerary_items.origin` three values — `'ai' | 'traveler' | 'expert'`
 * — and stamps it SERVER-SIDE at create, never from a client. This is that stamp for the one
 * create site that has no live actor at all: a ready-made clone is written by a fulfilment job on
 * behalf of a buyer who has added nothing.
 *
 * WHY THE SOURCE VALUE CANNOT SIMPLY BE COPIED. `origin` answers "who authored this row, relative
 * to this plan's traveler", so the same stored value means different things on the two trips. On
 * the AUTHOR's build the generic create rail (`POST /api/trips/:tripId/itinerary-items`,
 * `server/routes.ts`) resolves `isAdvisor ? 'expert' : 'traveler'`, and an authoring build's
 * author is NOT an advisor — they reach the route through its separate `authored` branch — so the
 * expert's own rows are stamped `'traveler'`, and rows written before migration 181 carry NULL.
 * Copied onto the buyer's plan those read "you added" (Locked Decision 42 D23's chip) about a row
 * the buyer did not add, and they sit OUTSIDE D3's protected set, so an optimize apply could
 * delete the very content the buyer paid for.
 *
 * THE RULE, and both halves are §13:
 *   • `'ai'` is PRESERVED verbatim. The author's own trip recorded that a machine drafted the row;
 *     rewriting that to `'expert'` would assert human authorship the record denies — the false
 *     attribution line D4 drew for `expert_note`, one column over.
 *   • Everything else — `'expert'`, `'traveler'`, NULL — is stamped `'expert'`. A ready-made
 *     listing is an expert's published plan sold under their name; `'traveler'` and NULL are both
 *     false OF THE BUYER, and `'expert'` is the one value in LD 12's vocabulary that is true.
 *
 * WHAT THIS IS NOT. It is not a "do not optimize" marker and it refuses no run: Optimize stays
 * available on a clone exactly as before, and `optimizer-run-authorization.ts`'s refusal union is
 * untouched. It puts these rows in the set D3 already protects — injected as fixed constraints,
 * never emitted as suggestions, never deleted by an apply or a regenerate. Whether a purchased
 * ready-made plan is a FINISHED plan or an EDITABLE template is `docs/PUNCHLIST.md` D-1, and this
 * decides none of it.
 */
export function clonedItemOrigin(source: Pick<ItineraryItemRow, "origin">): "ai" | "expert" {
  return source.origin === "ai" ? "ai" : "expert";
}

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
    ...(carried as Omit<typeof itineraryItems.$inferInsert, "tripId" | "routingStatus" | "origin">),
    tripId: cloneTripId,
    // The V-14 fix, written in the key drizzle actually reads. A clone is born in the buyer's
    // planner, never in their cart (LD 39: the cart IS this table's ready_for_checkout projection).
    routingStatus: "in_planning",
    // LD 12's server-side provenance stamp for the one create site with no live actor — see
    // `clonedItemOrigin` above. Derived from the source row, never copied and never client-set.
    origin: clonedItemOrigin(source),
  };
}
