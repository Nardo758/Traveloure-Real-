/**
 * Item 3 (ledger `2026-10-10-health-hotel-supply`) — the operator threshold under which a live market's
 * rankable hotel supply is reported `low` on `/api/health`. A count, never a rate (§8). Env-overridable by
 * name; an unset, non-numeric or non-positive value reads the ruled default.
 */
export const HOTEL_SUPPLY_MIN_DEFAULT = 20;

export function hotelSupplyMin(env: Record<string, string | undefined> = process.env): number {
  const raw = env.HOTEL_SUPPLY_MIN;
  if (raw == null || raw.trim() === "") return HOTEL_SUPPLY_MIN_DEFAULT;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : HOTEL_SUPPLY_MIN_DEFAULT;
}
