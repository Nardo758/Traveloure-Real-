import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

// The ONE neighbourhood pick (ruling 112 Q1): a single searchable pick, one neighbourhood,
// because the column is one neighbourhood. Shared by ServiceForm and the property builder
// (ledger `2026-10-10-pb1-property-category-city`) so the two surfaces cannot drift.
// The neighbourhood is the ONE structured signal the server derives `city` from
// (server/utils/service-city.ts `deriveCityPatch`).

export interface NeighborhoodOption {
  id: string;
  city: string;
  country: string;
  name: string;
  slug: string;
  centroidLat?: string | number | null;
  centroidLng?: string | number | null;
  radiusKm?: string | number | null;
}

// Fetch all pages sequentially (the reference catalog may exceed the 200-row page).
export function useAllNeighborhoods() {
  return useQuery<NeighborhoodOption[]>({
    queryKey: ["/api/city-neighborhoods", "all"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const PAGE = 200;
      let all: NeighborhoodOption[] = [];
      let offset = 0;
      for (;;) {
        const res = await fetch(`/api/city-neighborhoods?limit=${PAGE}&offset=${offset}`);
        const json = (await res.json()) as { data: NeighborhoodOption[]; hasMore: boolean };
        all = all.concat(json.data);
        if (!json.hasMore) break;
        offset += PAGE;
      }
      return all;
    },
  });
}

interface NeighborhoodPickerProps {
  neighborhoods: NeighborhoodOption[];
  value: string;
  onChange: (slug: string) => void;
  /** Rendered when the catalog has no rows at all. */
  emptyText?: string;
}

export function NeighborhoodPicker({
  neighborhoods,
  value,
  onChange,
  emptyText = "No neighborhoods available.",
}: NeighborhoodPickerProps) {
  const [query, setQuery] = useState("");

  if (neighborhoods.length === 0) {
    return <p className="text-xs text-muted-foreground" data-testid="text-no-neighborhoods">{emptyText}</p>;
  }

  const sel = value ? neighborhoods.find((n) => n.slug === value) : undefined;
  const q = query.trim().toLowerCase();
  const filtered = q
    ? neighborhoods.filter(
        (n) =>
          n.name.toLowerCase().includes(q) ||
          n.city.toLowerCase().includes(q) ||
          n.country.toLowerCase().includes(q),
      )
    : neighborhoods;

  return (
    <>
      {value && (
        <div className="flex items-center gap-2 mb-2" data-testid="chip-selected-neighborhood">
          <Badge variant="secondary" className="rounded-full px-3">
            {sel ? `${sel.name} · ${sel.city}` : value}
          </Badge>
          <button
            type="button"
            className="text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground"
            onClick={() => onChange("")}
            data-testid="button-clear-neighborhood"
          >
            Clear
          </button>
        </div>
      )}
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search neighborhoods or cities…"
        className="mb-2"
        data-testid="input-neighborhood-search"
      />
      <div className="border rounded-md max-h-48 overflow-y-auto p-2 space-y-1">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground px-1 py-2" data-testid="text-no-neighborhood-match">
            Nothing matches "{query}".
          </p>
        ) : (
          Object.entries(
            filtered.reduce<Record<string, NeighborhoodOption[]>>((acc, n) => {
              const key = `${n.city}, ${n.country}`;
              if (!acc[key]) acc[key] = [];
              acc[key].push(n);
              return acc;
            }, {}),
          ).map(([cityLabel, items]) => (
            <div key={cityLabel}>
              <p className="text-xs font-semibold text-muted-foreground px-1 py-0.5 uppercase tracking-wide">
                {cityLabel}
              </p>
              {items.map((n) => {
                const selected = value === n.slug;
                return (
                  <button
                    key={n.slug}
                    type="button"
                    onClick={() => onChange(selected ? "" : n.slug)}
                    className={`flex w-full items-center gap-2 px-2 py-1 rounded text-left text-sm hover:bg-accent ${selected ? "bg-accent font-medium" : ""}`}
                    data-testid={`option-neighborhood-${n.slug}`}
                    aria-pressed={selected}
                  >
                    <span className="flex-1">{n.name}</span>
                    {selected && (
                      <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4">selected</Badge>
                    )}
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
    </>
  );
}
