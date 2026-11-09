/**
 * B-10 (ruled 2026-11-09) — "is the Hotels tab on the map's Browse layer visible for this city?"
 *
 * The guest EmptySlip's **"Where are you staying?"** row must hide WITH the tab — not before it and
 * not after it. So it asks the SAME question the map asks, of the SAME four public reads, through the
 * map's own builders and the map's own tab rule (`visibleBrowseTabs`). The query keys are the map's
 * own strings, so opening the map afterwards reads this cache instead of re-fetching.
 *
 * The map's no-flicker rule comes for free: `visibleBrowseTabs(places, loaded)` shows every tab until
 * every read has answered, so this answers `true` until then — the row appears with the tab, not a
 * beat later.
 *
 * Deliberately NOT a filter: this decides whether to DRAW the row. The press goes through the map's
 * existing `openFindHost("accommodation")`, which is the same path "Find a host" uses and the same
 * tab the Browse layer already draws.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { cityContentPlaces, listingPlaces, partnerPlaces, visibleBrowseTabs } from "@/lib/browse-supply";
import { gemCategory } from "@/lib/feed-stream";
import type { BrowsePlace } from "@/lib/map-scene";

/** "Kyoto, Japan" → "Kyoto" — the same first-segment reading the map and `SlipEmptyStart` use. */
export function browseCity(destination: string | null | undefined): string {
  return (destination ?? "").split(",")[0].trim();
}

/**
 * True while the map's Browse layer would draw a Hotels tab for this city.
 * `enabled: false` ⇒ false (nothing is read, nothing is claimed).
 */
export function useHotelsTabShown(destination: string | null | undefined, enabled = true): boolean {
  const city = browseCity(destination);
  const on = enabled && !!city;
  // ── the map's four reads, in the map's own keys ────────────────────────────────────────────
  const { data: categories } = useQuery<Array<{ id: string; categoryKey?: string | null }>>({
    queryKey: ["/api/service-categories"],
    enabled: on,
    staleTime: 5 * 60_000,
  });
  const categoryKeyById = useMemo(
    () => new Map((categories ?? []).filter((c) => !!c.categoryKey).map((c) => [String(c.id), String(c.categoryKey)])),
    [categories],
  );
  const { data: listings } = useQuery<any[]>({
    queryKey: [`/api/services?location=${encodeURIComponent(city)}`],
    enabled: on,
  });
  const { data: cityPayload } = useQuery<any>({
    queryKey: ["/api/discover/location", city, "map-browse"],
    enabled: on,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await fetch(`/api/discover/location/${encodeURIComponent(city)}`);
      if (!res.ok) throw new Error("Failed to fetch city content");
      return res.json();
    },
  });
  const { data: partner } = useQuery<{ products?: any[] }>({
    queryKey: [`/api/affiliate/products?city=${encodeURIComponent(city)}&limit=100`],
    enabled: on,
  });

  const supply: BrowsePlace[] = useMemo(
    () => [
      ...listingPlaces(listings, categoryKeyById),
      ...partnerPlaces(partner?.products),
      ...cityContentPlaces(cityPayload, gemCategory),
    ],
    [listings, categoryKeyById, partner, cityPayload],
  );
  const loaded = listings !== undefined && partner !== undefined && cityPayload !== undefined;
  if (!on) return false;
  return visibleBrowseTabs(supply, loaded).some((t) => t.key === "hotels");
}
