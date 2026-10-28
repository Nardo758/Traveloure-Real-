/**
 * Row 198 (strings 4–16; approved by Leon Oct 26, 2026): the comparison page's plain words.
 * HELD for Leon (founder wording review): item 6 (versionsLine), item 10 (actionFailed*) and the
 * Q8 "versions" tail (applyConfirmRevisit). Everything else here is approved.
 */
import { parseTotal } from "./slip-proposal-preview";

export const COMPARISON_PAGE_COPY = {
  // #4 (singular derived, Q6).
  bookedKept: (n: number): string =>
    n === 1 ? "1 booked item is kept in every version" : `${n} booked items are kept in every version`,
  // #5 (singular derived, Q6).
  leftOut: (n: number): string =>
    n === 1 ? "1 item left out. Your expert has it." : `${n} items left out. Your expert has them.`,
  // #6, HELD (Leon confirmed yes Oct 27; held again by the Architect, Oct 27, 10:30 PM ET).
  versionsLine: (n: number): string =>
    n === 1 ? "1 version for your remaining items" : `${n} versions for your remaining items`,
  // #7.
  adoptedDescription: "Your plan is updated. Nothing was bought.",
  // #8: Marketing's two sentences, then the revisit tail ("versions", HELD, Q8).
  applyConfirmKept: "Items you've booked, put in your cart, or sent to your expert stay as they are. Nothing is bought here.",
  applyConfirmRevisit: "The other versions stay available to revisit.",
  // #9.
  applyFailedTitle: "We couldn't apply that version.",
  applyFailedDescription: "Your plan is unchanged.",
  // #10, HELD.
  actionFailedTitle: "We couldn't do that.",
  actionFailedDescription: "Your plan is unchanged.",
  // #11.
  noResultBody: "We didn't get a result this time. Your plan is unchanged. You can retry generation or browse your original plan below.",
  noAlternativesHeading: "We didn't find any alternatives this time.",
  noAlternativesBody: (withCartTail: boolean): string =>
    `We didn't get a result this time. Your plan is unchanged. You can re-run the optimizer${withCartTail ? " or go back to your cart" : ""}.`,
  // #12.
  suggestedVersion: "Suggested version",
  // #13.
  lookingForAlternatives: "Looking for alternatives...",
  // #14.
  whatsDifferent: "What's different",
  // #15.
  extrasThatFit: "Extras that fit your plan",
  // #16: a missing price is said, never shown as $0.
  priceNotAvailable: "Price not available",
} as const;

/** #16: "$1,250" for a real amount (a real "0" is "$0"); "Price not available" when none. */
export function formatComparisonPrice(value: string | number | null | undefined): string {
  const n = parseTotal(value);
  return n == null ? COMPARISON_PAGE_COPY.priceNotAvailable : `$${n.toLocaleString()}`;
}

/** #16: the per-person figure, or null (omit the line) when the total is missing. */
export function formatComparisonPerPerson(
  value: string | number | null | undefined,
  travelers: number | null | undefined,
): string | null {
  const n = parseTotal(value);
  if (n == null) return null;
  return `$${(n / (travelers || 1)).toLocaleString(undefined, { maximumFractionDigits: 0 })}/person`;
}
