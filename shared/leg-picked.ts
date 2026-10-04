/**
 * R-ax: a leg the author has PICKED — confirmed, with a chosen mode or a host pickup
 * (`pickup_provider_service_id`, migration 347). ONE definition (§18 rule 1), read by the ready-made
 * publish gate (`readyMadeLegLines`) and the leg-review read (`buildLegReview`). A confirm that names
 * no mode stores the recommended mode it showed (`updateTripTransportLeg`), so a leg the Workstation
 * shows as Confirmed is picked here. Pure.
 */
export function isPickedLeg(leg: {
  proposalStatus?: string | null;
  userSelectedMode?: string | null;
  pickupProviderServiceId?: string | null;
}): boolean {
  return leg.proposalStatus === "confirmed" && (!!leg.userSelectedMode || !!leg.pickupProviderServiceId);
}
