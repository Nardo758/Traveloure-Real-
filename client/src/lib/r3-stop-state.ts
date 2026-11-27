/**
 * R3 U9 - the one "asked for" tag vocabulary. Booked wins, then the traveller's quote for this stop: `requested` is
 * "asked", `quoted` is "quote received". Every other lifecycle draws nothing. No price, no date, no buttons.
 */
export type StopState = "asked" | "quote" | "booked";

export const STOP_STATE_LABEL: Record<StopState, string> = {
  asked: "Asked \u00b7 waiting for the host",
  quote: "Quote received",
  booked: "Booked",
};

export interface QuoteForState {
  itineraryItemId?: string | null;
  lifecycle?: string | null;
}

export function stopStateFor(stop: any, quotes: readonly QuoteForState[] | undefined): StopState | null {
  if (stop?.booking) return "booked";
  const id = stop?.id ? String(stop.id) : null;
  if (!id) return null;
  const mine = (quotes ?? []).find((q) => q?.itineraryItemId && String(q.itineraryItemId) === id);
  if (!mine) return null;
  if (mine.lifecycle === "requested") return "asked";
  if (mine.lifecycle === "quoted") return "quote";
  return null;
}

export function stopStateTagLabel(state: StopState): string {
  return STOP_STATE_LABEL[state];
}
