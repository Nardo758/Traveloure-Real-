/**
 * A7 — ADOPTING A VERSION CHOOSES ITS SET (product map §F2 (3); ledger
 * `2026-09-30-a7-version-per-option`). Shared by apply-to-trip, adopt-stop and adopt-stops so the
 * three decide a set one way (§18 rule 1). Every caller is gated on `versionPerOptionEnabled()`.
 *
 *   · A version's pick is chosen through the SAME `chooseOptionTx` a tap on "Choose" runs, inside a
 *     SAVEPOINT of the caller's transaction: a set that is already decided (or whose place is being
 *     booked) is reported and left alone, and never rolls back the rest of the adopt.
 *   · Only an actor with the R129 choose role (owner or delegate) decides a set. A write advisor may
 *     adopt stops, but their adopt leaves the set undecided — never a choice they may not make.
 *   · An open set HOLDS its slot: a whole-version adopt does not delete the item a still-open set is
 *     attached to (the R126 posture the free draft already takes).
 */
import { and, eq, isNotNull } from "drizzle-orm";
import { planOptionSets } from "@shared/schema";
import { SLIP_VERSION_ADOPTED_EVENT, type OptionPick } from "@shared/version-options";
import { chooseOptionTx, OptionSetError, type Role } from "./plan-option-sets.service";
import { trackFunnelEvent } from "../utils/funnelTracker";

export type PickOutcome = { decided: true; setId: string; optionId: string; itemId: string } | { decided: false; setId: string; reason: string };

export async function choosePickInTx(
  tx: any,
  input: { tripId: string; userId: string; role: Role | null; pick: OptionPick; via: "version_whole" | "version_stop" },
): Promise<PickOutcome> {
  const { pick } = input;
  if (input.role !== "owner" && input.role !== "delegate") {
    return { decided: false, setId: pick.setId, reason: "not_allowed_to_choose" };
  }
  try {
    const out = await tx.transaction((sp: any) =>
      chooseOptionTx(sp, { tripId: input.tripId, setId: pick.setId, optionId: pick.optionId, userId: input.userId, via: input.via }, input.role as Role),
    );
    return { decided: true, setId: pick.setId, optionId: pick.optionId, itemId: out.itemId };
  } catch (err) {
    if (err instanceof OptionSetError) return { decided: false, setId: pick.setId, reason: err.code };
    throw err;
  }
}

/** Items a still-open set is attached to — a whole-version adopt leaves them in place. */
export async function openSetHeldItemIds(tx: any, tripId: string): Promise<string[]> {
  const rows = await tx
    .select({ itemId: planOptionSets.itineraryItemId })
    .from(planOptionSets)
    .where(and(eq(planOptionSets.tripId, tripId), eq(planOptionSets.status, "open"), isNotNull(planOptionSets.itineraryItemId)));
  return rows.map((r: { itemId: string }) => r.itemId);
}

/** E10 (slip-funnel-events §3.10). Written after the commit, only for an adopt that added or decided something. */
export async function recordVersionAdopted(input: {
  userId: string;
  tripId: string;
  comparisonId: string;
  variantId: string | null;
  adoptMode: "whole" | "stop" | "stops";
  itemsAdded: number;
  itemsReplaced: number;
  protectedKept: number;
  setsDecided: number;
}): Promise<void> {
  if (input.itemsAdded === 0 && input.setsDecided === 0 && input.itemsReplaced === 0) return;
  await trackFunnelEvent({
    userId: input.userId,
    eventType: SLIP_VERSION_ADOPTED_EVENT,
    funnelStage: "SLIP",
    tripId: input.tripId,
    eventData: {
      comparisonId: input.comparisonId,
      variantId: input.variantId,
      adoptMode: input.adoptMode,
      itemsAdded: input.itemsAdded,
      itemsReplaced: input.itemsReplaced,
      protectedKept: input.protectedKept,
      setsDecided: input.setsDecided,
    },
  });
}
