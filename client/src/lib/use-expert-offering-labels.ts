/**
 * useExpertOfferingLabels — `expert_offering_types.offering_type_key` → `display_name`,
 * read live from the public catalog.
 *
 * Ledger `2026-09-04-earn-contained-fixes` (gap 8). `expert_specializations` and the
 * application's jsonb both hold a MIX of vocabularies, and one of them is offering keys —
 * which only the DB can name, because the catalog is admin-editable (a hardcoded map here
 * would be stale the day a row is renamed; §18 rule 1).
 *
 * ONE query key, so React Query dedupes it across every expert card in a list — a browse page
 * with forty cards makes one request, not forty.
 *
 * Returns `{}` while loading or on failure, which is the honest empty answer: an unresolved
 * key then renders AS-IS through `labelForExpertSpecialization`'s rule 3, never as a blank
 * chip and never as an invented label (§13).
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

interface ExpertOfferingTypeRow {
  offering_type_key: string;
  display_name: string;
}

export function useExpertOfferingLabels(): Record<string, string> {
  const { data } = useQuery<ExpertOfferingTypeRow[]>({
    queryKey: ["/api/offering-types/experts"],
    staleTime: 5 * 60_000,
  });
  return useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of data ?? []) {
      if (row?.offering_type_key && row?.display_name) map[row.offering_type_key] = row.display_name;
    }
    return map;
  }, [data]);
}
