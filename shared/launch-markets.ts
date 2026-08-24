/**
 * launch-markets.ts — the single home for the launch-market scope (§12 one-wedge-Kyoto).
 *
 * F8 (earn-trace audit): the Kyoto launch scope lived only as a server-side zod DEFAULT on
 * ready-made create — a client could send any market string. The scope is now a named,
 * validated set: the store-lane write paths refuse a non-launch market, and migration 149
 * enforces it at the DB (CHECK on ready_made_trips.market).
 *
 * Growing the launch: add the market here, replace the migration-149 CHECK in a new
 * migration, and update the scripts/preflight-prod-constraints.cjs manifest entry —
 * all three, together.
 */
export const LAUNCH_MARKETS = ["Kyoto"] as const;

export type LaunchMarket = (typeof LAUNCH_MARKETS)[number];

export function isLaunchMarket(m: unknown): m is LaunchMarket {
  return typeof m === "string" && (LAUNCH_MARKETS as readonly string[]).includes(m);
}

/** The one gate message for the store-authoring role/scope gate (server 403 + client notice). */
export const STORE_GATE_MESSAGE =
  "Store listings are open to Local and Travel Experts during the Kyoto launch.";
