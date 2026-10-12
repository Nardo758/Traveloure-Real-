/**
 * P0-e item 4 (decision-maker, Oct 12, 2026; ledger `2026-10-12-p0e-findings-and-gaps`): the wards of each
 * operating market, by market slug. They join the market's `city_neighborhoods` rows as the "area names"
 * an item title may name without naming a place ("Late Dinner in Shimogyo"). `city_neighborhoods` holds
 * the neighbourhoods a traveler browses (Gion, Higashiyama…), not the administrative wards, so the wards
 * are listed here. A market not listed has no wards on record — its neighbourhood rows still apply.
 */
export const MARKET_WARDS: Readonly<Record<string, readonly string[]>> = {
  // Kyoto City's eleven wards (ku).
  kyoto: ["Kita", "Kamigyo", "Sakyo", "Nakagyo", "Higashiyama", "Yamashina", "Shimogyo", "Minami", "Ukyo", "Nishikyo", "Fushimi"],
};
