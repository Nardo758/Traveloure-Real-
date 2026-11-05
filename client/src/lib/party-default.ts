/**
 * R3-16 (round 3 ruling, Nov 5, 2026; ledger `2026-11-05-r3-followups`): the start dialog and the plan page both show
 * two adults as the party form's default. It is SHOWN, never stored (Locked Decision 33: an untouched party is NULL,
 * never 2; ruling 38: a shown default and a chosen value are different facts). Pure, so both surfaces read one rule.
 */
import { DEFAULT_ADULTS } from "@shared/plan-vocabulary";

/** What the adults field draws: the stated value, or two while nobody has stated or touched it. */
export function partyFieldShown(stated: string, edited: boolean): string {
  return stated !== "" || edited ? stated : String(DEFAULT_ADULTS);
}
