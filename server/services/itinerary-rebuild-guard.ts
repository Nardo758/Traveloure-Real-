import { and, isNull, ne, notInArray, type SQL } from "drizzle-orm";
import { itineraryItems } from "@shared/schema";
import {
  ITEM_MONEY_COMMITTED_STATUSES,
  itineraryItemIsMoneyCommitted,
  itineraryItemIsPaid,
} from "@shared/itinerary-item-money";
import { itineraryItemIsExpertWork } from "@shared/itinerary-item-expert";

/**
 * D-1 money-safety guard (ledger 2026-08-31-two-surfaces-one-handoff).
 *
 * A "rebuild items" delete — the AI Regenerate wipe (POST /api/trips/:id/generate-itinerary)
 * and the generated-itinerary snapshot re-apply (saveGeneratedItinerarySnapshot, used by the Grok
 * generate rail and the Plus occasion drafts) — must NEVER destroy a row the traveler has committed
 * money to. Both handlers previously deleted their AI/traveler set with no routing-status guard, so a
 * regenerate could drop an `origin='ai'` stop the traveler had already routed to `ready_for_checkout`
 * or `purchased` (severing a `booking_id` from its plan item).
 *
 * §18 rule 1 (a privileged predicate has ONE author — two authors resolving it two ways is how the
 * class returns): every rebuild delete ANDs in THIS single predicate rather than re-implementing it.
 *
 * Spare anything in checkout or purchased, OR carrying a booking reference — the booking clause is
 * belt-and-suspenders for a booked row whose routing status has drifted (Leon's ruling): a booked row
 * must survive a rebuild whatever its status reads.
 */
export const REBUILD_PROTECTED_STATUSES = ["ready_for_checkout", "purchased"] as const;

/**
 * ── THE EXPERT-WORK CLAUSE (CLAUDE.md Locked Decision 42 D3, ratified Sep 5 2026) ──
 *
 * D3: a row carrying `expert_note` (ruling 21) or `origin='expert'` (ruling 12) is PAID HUMAN
 * WORK — it joins every protection money already had. This is the WHERE-clause form of that one
 * class; the row-level form is `itineraryItemIsExpertWork` (`shared/itinerary-item-expert.ts`),
 * imported above so the two forms sit beside each other and are read together (the money
 * predicate's own precedent, below). ONE class added to the EXISTING predicates — never a
 * second, parallel "is this expert work?" test written beside them (D3's own words).
 *
 * ANDed into `itineraryItemRebuildDeletable()` here and into the two apply-to-trip replace
 * deletes (`plancard.routes.ts`, `storage.deleteInPlanningItineraryItemsByTrip`), whose
 * "in_planning-only" exemption no longer sufficed: an in_planning expert-work row was exactly
 * the row a machine wipe could destroy.
 */
export function itineraryItemNotExpertWork(): SQL {
  return and(
    isNull(itineraryItems.expertNote),
    ne(itineraryItems.origin, "expert"),
  )!;
}

/**
 * ANDed into a rebuild DELETE's WHERE clause to restrict it to rows that are safe to replace.
 * A row is deletable only when it is NOT in a protected status, carries no booking reference,
 * AND is not expert work (D3).
 */
export function itineraryItemRebuildDeletable(): SQL {
  return and(
    notInArray(itineraryItems.routingStatus, [...REBUILD_PROTECTED_STATUSES]),
    isNull(itineraryItems.bookingId),
    itineraryItemNotExpertWork(),
  )!;
}

/**
 * ── THE SAME QUESTION, FOR ONE ROW (ledger `2026-09-05-slip-own-your-plan`, review R14) ──
 *
 * The predicate above is a WHERE clause: it answers "which rows may a rebuild replace?" for a set.
 * The slip's ✕ and the trip-scoped DELETE ask the same question about ONE row already in hand, and
 * §18 rule 1 refuses a second predicate that agrees with this one only by luck. The row-level
 * answer therefore lives in `shared/itinerary-item-money.ts` — shared because the other asker is
 * the CLIENT, which holds the plancard DTO rather than a DB row — and is re-exported here so the
 * two forms of the answer sit beside each other and are read together.
 *
 * THE TWO SETS ARE DELIBERATELY NOT IDENTICAL, and the direction that matters is asserted in
 * `server/__tests__/item-delete-booked-guard.test.ts`: every status the row-level predicate calls
 * money-committed is ALSO in `REBUILD_PROTECTED_STATUSES`, so no rail can delete what the other
 * protects. The rebuild set is WIDER (it also spares `ready_for_checkout`) because a machine wipe
 * must not empty a traveler's checkout queue as a side effect, while a traveler pressing ✕ on
 * their own not-yet-charged row is doing exactly what they meant to do (see that module's header).
 */
export {
  ITEM_MONEY_COMMITTED_STATUSES,
  itineraryItemIsMoneyCommitted,
  itineraryItemIsPaid,
};

// D3's row-level form, re-exported on the money predicates' own precedent above: the two forms
// of the expert-work answer (this module's SQL clause, the shared module's row test) are read
// together. NOT added to the row-level money predicate — a traveler pressing ✕ on their own
// row is doing what they meant; D3 protects expert work from MACHINE rewrites (optimizer apply,
// AI rebuild), not from the owner.
export { itineraryItemIsExpertWork };
