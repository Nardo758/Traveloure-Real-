import { useQuery } from "@tanstack/react-query";
import type { MarketGeography } from "@shared/geo/market-geography";

/**
 * useMarketGeography — client-side replacement for the retired shared/geo/market-geography.ts
 * MARKET_GEOGRAPHIES literal import (migration 186 / CLAUDE.md ruling, Aug 9 2026). The client no
 * longer bundles any market's geometry; it fetches the public, DB-first
 * GET /api/markets/geography endpoint instead (server/routes/markets.routes.ts →
 * server/services/market-geography.service.ts, with the committed KYOTO_GEOGRAPHY literal as
 * server-side fallback).
 *
 * §13: while loading (or when `destination` is absent), this returns `{ geography: null,
 * isLoading }` — callers render the honest "no layer yet" state, identical to a market that
 * genuinely has no geography. There is no client-side fallback shape.
 */
export function useMarketGeography(destination: string | null | undefined) {
  const query = useQuery<{ geography: MarketGeography | null }>({
    queryKey: ["market-geography", destination],
    queryFn: async () => {
      const res = await fetch(`/api/markets/geography?destination=${encodeURIComponent(destination!)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Failed to load market geography (${res.status})`);
      return res.json();
    },
    enabled: !!destination,
    staleTime: 5 * 60 * 1000,
  });

  return {
    geography: query.data?.geography ?? null,
    isLoading: query.isLoading,
  };
}
