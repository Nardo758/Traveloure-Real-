/**
 * Row 303b: reads row 303a's tile detail panel (`GET /api/discover/tiles/:tileId/panel`).
 *
 * Read only while the panel is open. The response is `private, no-store` and a Viator fact is shown
 * only inside a zero-length live window, so a reopen reads again rather than serving a held copy.
 */
import { useQuery } from "@tanstack/react-query";
import { isTilePanelId, type TileDetailPanel } from "@shared/tile-detail-panel";

export function tileDetailUrl(tileId: string): string {
  return `/api/discover/tiles/${encodeURIComponent(tileId)}/panel`;
}

export function useTileDetail(tileId: string | null, open: boolean) {
  const valid = typeof tileId === "string" && isTilePanelId(tileId);
  return useQuery<TileDetailPanel>({
    queryKey: [valid ? tileDetailUrl(tileId!) : "/api/discover/tiles/invalid/panel"],
    enabled: open && valid,
    staleTime: 0,
    gcTime: 0,
  });
}
