/**
 * R-ax: a leg the author has PICKED — confirmed, with a chosen mode or a host pickup
 * (`pickup_provider_service_id`, migration 347). ONE definition (§18 rule 1), read by the ready-made
 * publish gate (`readyMadeLegLines`) and the leg-review read (`buildLegReview`). A confirmed leg with a
 * chosen mode, a recommended mode it showed, or a host pickup is picked. Pure.
 */
export function isPickedLeg(leg: {
  proposalStatus?: string | null;
  userSelectedMode?: string | null;
  recommendedMode?: string | null;
  pickupProviderServiceId?: string | null;
}): boolean {
  // P0-b item 9, option (a) (ledger `2026-10-11-p0b-routing-follow-ups`): a confirm no longer COPIES the
  // recommended mode into `user_selected_mode`, so a confirmed leg showing its recommended mode counts as
  // picked here — R-ax keeps its meaning (a leg shown as Confirmed is picked).
  return leg.proposalStatus === "confirmed" && (!!leg.userSelectedMode || !!leg.recommendedMode || !!leg.pickupProviderServiceId);
}
