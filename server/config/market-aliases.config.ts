/**
 * MARKET ALIASES — P0 legs ruling 5 (decision-maker, Oct 10, 2026; ledger `2026-10-10-p0-legs-baseline`).
 *
 * `resolveMarketSlug` stamps `trips.market_slug`, which picks the market's transport profile — and a
 * plan whose destination names a part of a market ("Arashiyama", "Kyoto Station") used to resolve to
 * NULL, so its legs had no transit coverage and defaulted to drive. Each OPERATING market lists the
 * places inside it a traveler may type as their destination. Matching is normalised whole-word
 * containment on the destination string (case, accents and punctuation ignored); a destination that
 * names two markets resolves to none (§13 — never the nearest guess).
 *
 * `notIf`: words that mean the SAME city name elsewhere (Porto Alegre, Cartagena in Spain) — a
 * destination containing one does not resolve to that market.
 *
 * Operating markets only: a key here that is not an operating market is ignored by the resolver.
 */
export interface MarketAliasEntry {
  aliases: readonly string[];
  notIf?: readonly string[];
}

export const MARKET_ALIASES: Readonly<Record<string, MarketAliasEntry>> = {
  kyoto: {
    aliases: ["arashiyama", "gion", "higashiyama", "fushimi", "fushimi inari", "kyoto prefecture", "kyoto station", "kiyomizu", "sagano", "pontocho", "kawaramachi", "nishiki"],
  },
  goa: {
    aliases: ["panaji", "panjim", "calangute", "baga", "anjuna", "candolim", "colva", "palolem", "margao", "vagator", "north goa", "south goa"],
  },
  mumbai: {
    aliases: ["bombay", "colaba", "bandra", "juhu", "andheri", "worli", "navi mumbai"],
  },
  jaipur: {
    aliases: ["amer fort", "pink city"],
  },
  edinburgh: {
    aliases: ["leith", "holyrood"],
    notIf: ["indiana", "texas"],
  },
  porto: {
    aliases: ["oporto", "vila nova de gaia", "matosinhos", "foz do douro"],
    notIf: ["alegre", "seguro", "velho", "cervo", "santo", "brazil", "brasil"],
  },
  bogota: {
    aliases: ["usaquen", "chapinero", "la candelaria"],
  },
  cartagena: {
    aliases: ["cartagena de indias", "getsemani", "bocagrande"],
    notIf: ["spain", "espana", "murcia"],
  },
};
