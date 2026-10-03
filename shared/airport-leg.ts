/**
 * THE AIRPORT ↔ LODGING LEG (surface step 3, ruling R-i; ledger `2026-10-03-surface-step3-anchor-panel`).
 *
 * When the plan holds a FLIGHT anchor and a STAY, a `LegRow` sits between the arrival anchor and the
 * first stop (and before the departure anchor). Its modes, in order: a platform private car — ONLY
 * when a platform transport listing in the city fits the party — then rail, then an affiliate
 * transfer. Pure; the server answers the one question it cannot (`platformCarFits`).
 *
 * No travel minutes and no distance are ever derived here (R242 / A8 off), and the row renders on the
 * owner's slip only — never on a public page.
 */
export type AirportLegMode = "private_car" | "rail" | "affiliate_transfer";

export const AIRPORT_LEG_MODE_LABEL: Readonly<Record<AirportLegMode, string>> = {
  private_car: "Private car",
  rail: "Train",
  affiliate_transfer: "Airport transfer",
};

/** The modes offered, in R-i's order. A private car only when a platform listing fits the party. */
export function airportLegModes(input: { platformCarFits: boolean }): AirportLegMode[] {
  return [...(input.platformCarFits ? (["private_car"] as const) : []), "rail", "affiliate_transfer"];
}

/** Does the leg render? A flight in that direction AND a stay on the plan — never one without the other. */
export function showsAirportLeg(input: { hasFlight: boolean; stayName: string | null }): boolean {
  return input.hasFlight && !!(input.stayName ?? "").trim();
}

/** "Airport → Hotel Kanra" / "Hotel Kanra → Airport". The airport is named only when the anchor says it. */
export function airportLegLine(direction: "arrival" | "departure", stayName: string, airport: string | null): string {
  const a = (airport ?? "").trim() || "Airport";
  return direction === "arrival" ? `${a} → ${stayName}` : `${stayName} → ${a}`;
}

/**
 * Does a platform transport listing fit the party? `party_size_max` NULL = no stated cap (fits);
 * a party of unknown size is checked against nothing and fits any listing (§13 — never a guessed size).
 */
export function listingFitsParty(partySizeMax: number | null | undefined, party: number | null | undefined): boolean {
  if (partySizeMax == null || party == null || !Number.isFinite(party)) return true;
  return partySizeMax >= party;
}
