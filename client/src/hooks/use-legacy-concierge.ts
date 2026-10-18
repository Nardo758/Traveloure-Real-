import { useQuery } from "@tanstack/react-query";
import { LEGACY_CONCIERGE_ROUTE, legacyConciergeShown } from "@shared/legacy-concierge";

/**
 * Whether the old done-for-you concierge's doors are shown (ledger `2026-10-18-legacy-concierge-hidden`).
 * Off while the read is loading or failed, and off unless the server answers `{ enabled: true }`.
 */
export function useLegacyConciergeShown(): { shown: boolean; settled: boolean } {
  const q = useQuery<{ enabled: boolean }>({ queryKey: [LEGACY_CONCIERGE_ROUTE], staleTime: 60_000, retry: false });
  return { shown: legacyConciergeShown(q.data), settled: !q.isLoading };
}
