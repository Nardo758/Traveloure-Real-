/**
 * Item 3 (ledger `2026-10-10-health-hotel-supply`) — `/api/health`'s `supply.hotels`: per live market, how
 * many stays the where-to-stay ranker could rank (located), and whether that is under `HOTEL_SUPPLY_MIN`.
 * REPORT ONLY — no traveler surface reads it. The count is `cityHotels(city).length`, the ranker's ONE
 * reader (§18 rule 1): the same sources (platform stays, located `hotel_cache` rows, affiliate lodging), the
 * same location predicate and the same row caps — so it can never claim supply the ranker would not see.
 * A market whose read fails reports `rankable: null` and no `low` claim (§13). Cached in process for a few
 * minutes because the probe is public and polled.
 */
import { OPERATING_MARKETS } from "@shared/operating-markets";
import { hotelSupplyMin } from "../config/hotel-supply.config";
import { cityHotels } from "./where-to-stay.service";

export interface MarketHotelSupply {
  rankable: number | null;
  low: boolean | null;
  bySource: { platform: number; hotel_cache: number; affiliate: number } | null;
}
export interface HotelSupplyReport {
  min: number;
  markets: Record<string, MarketHotelSupply>;
}

type Hotel = { kind: "platform" | "hotel_cache" | "affiliate" };

/** PURE: one market's line from the ranker's rows (or null when the read failed). */
export function marketHotelSupply(rows: readonly Hotel[] | null, min: number): MarketHotelSupply {
  if (!rows) return { rankable: null, low: null, bySource: null };
  const bySource = { platform: 0, hotel_cache: 0, affiliate: 0 };
  for (const r of rows) bySource[r.kind] += 1;
  return { rankable: rows.length, low: rows.length < min, bySource };
}

const TTL_MS = 5 * 60_000;
let cached: { at: number; report: HotelSupplyReport } | null = null;

export async function readHotelSupply(
  opts: { now?: number; read?: (city: string) => Promise<readonly Hotel[]>; env?: Record<string, string | undefined> } = {},
): Promise<HotelSupplyReport> {
  const now = opts.now ?? Date.now();
  if (!opts.read && cached && now - cached.at < TTL_MS) return cached.report;
  const read = opts.read ?? cityHotels;
  const min = hotelSupplyMin(opts.env);
  const lines = await Promise.all(
    OPERATING_MARKETS.map(async (m) => [m.marketKey, marketHotelSupply(await read(m.cityName).catch(() => null), min)] as const),
  );
  const report: HotelSupplyReport = { min, markets: Object.fromEntries(lines) };
  if (!opts.read) cached = { at: now, report };
  return report;
}
