/**
 * client:kyoto-cultural — the neighborhood-grouped Kyoto itinerary structure
 * (DISTRIBUTION_FORMATS.md `client:*`; mockup-destination-formats.html §2).
 *
 * Groups itinerary items by Kyoto NEIGHBORHOOD using the existing mounted
 * GET /api/city-neighborhoods endpoint (city_neighborhoods-backed — the same catalog the
 * earn/coverage flows read; no new endpoint). An item matches a neighborhood when its
 * locationName/locationAddress contains the neighborhood's name or slug (case-insensitive);
 * unmatched items go in an honest "Elsewhere in <city>" group — never dropped, never
 * guessed (§13). Category badges come from the format's registry sections (the section
 * WITHOUT itemTypes is the honest Experiences catch-all). The seasonal slot renders ONLY
 * when a real non-empty bestSeason exists — omitted otherwise, never invented (§13).
 *
 * Expert-notes contract: item-level notes render WITH their item inside its group.
 */
import { useQuery } from "@tanstack/react-query";
import type { BuildFormat, FormatSection } from "@/lib/build-formats/registry";
import {
  INK, MID, LINE, GROUND, CARD, BRAND, BRAND_SOFT, OK, OK_SOFT,
  type FormatDay, type FlatFormatItem,
  flattenDays, compareChrono, dayRibbon, itemNote,
} from "./format-shared";

interface CityNeighborhood {
  id: string;
  city: string;
  country: string;
  name: string;
  slug: string;
}

interface KyotoCulturalViewProps {
  format: BuildFormat;
  destination: string | null;
  days: FormatDay[];
  bestSeason: string | null;
}

/** Badge tones per registry section key — brand for temples, ok for food, muted otherwise. */
const BADGE_TONES: Record<string, { bg: string; color: string }> = {
  temples: { bg: BRAND_SOFT, color: BRAND },
  food: { bg: OK_SOFT, color: OK },
};

function sectionFor(sections: FormatSection[], item: FlatFormatItem): FormatSection | null {
  const t = (item.itemType ?? "").trim().toLowerCase();
  const typed = sections.find((s) => (s.itemTypes ?? []).includes(t));
  if (typed) return typed;
  // The honest catch-all: the section declared WITHOUT itemTypes ("Experiences").
  return sections.find((s) => !s.itemTypes || s.itemTypes.length === 0) ?? null;
}

export function KyotoCulturalView({ format, destination, days, bestSeason }: KyotoCulturalViewProps) {
  // Existing mounted neighborhoods catalog (content.routes.ts GET /api/city-neighborhoods) —
  // the same query ServiceForm's coverage picker uses; default queryFn, no new endpoint.
  const { data: hoodsResp, isLoading: hoodsLoading } = useQuery<{ data: CityNeighborhood[] }>({
    queryKey: ["/api/city-neighborhoods"],
    staleTime: 5 * 60_000,
  });
  const allNeighborhoods = hoodsResp?.data ?? [];

  const cityKey = (destination ?? "").split(",")[0].trim().toLowerCase();
  const cityDisplay = (destination ?? "").split(",")[0].trim() || "this city";
  const hoods = allNeighborhoods.filter((n) => n.city.trim().toLowerCase() === cityKey);

  const items = flattenDays(days);

  if (hoodsLoading) {
    return (
      <div style={{ fontSize: 12.5, color: MID, padding: "10px 2px" }} data-testid="kyoto-cultural-loading">
        Grouping by neighborhood…
      </div>
    );
  }

  // Match by locationName/locationAddress containing the neighborhood name or slug
  // (case-insensitive; slug also matched with hyphens as spaces). First match wins.
  const matchHood = (item: FlatFormatItem): CityNeighborhood | null => {
    const hay = `${item.locationName ?? ""} ${item.locationAddress ?? ""}`.toLowerCase();
    if (!hay.trim()) return null;
    for (const n of hoods) {
      const name = n.name.trim().toLowerCase();
      const slug = n.slug.trim().toLowerCase();
      const slugSpaced = slug.replace(/-/g, " ");
      if ((name && hay.includes(name)) || (slug && hay.includes(slug)) || (slugSpaced && hay.includes(slugSpaced))) {
        return n;
      }
    }
    return null;
  };

  const byHood = new Map<string, { name: string; items: FlatFormatItem[] }>();
  const elsewhere: FlatFormatItem[] = [];
  for (const item of items) {
    const hood = matchHood(item);
    if (hood) {
      const g = byHood.get(hood.id) ?? { name: hood.name, items: [] };
      g.items.push(item);
      byHood.set(hood.id, g);
    } else {
      elsewhere.push(item);
    }
  }

  // Walk order: groups ordered by their earliest item (day, then time); Elsewhere last.
  const groups = Array.from(byHood.entries())
    .map(([id, g]) => ({ id, name: g.name, items: [...g.items].sort(compareChrono) }))
    .sort((a, b) => compareChrono(a.items[0], b.items[0]));
  if (elsewhere.length > 0) {
    groups.push({ id: "elsewhere", name: `Elsewhere in ${cityDisplay}`, items: [...elsewhere].sort(compareChrono) });
  }

  const season = (bestSeason ?? "").trim();

  return (
    <div data-testid="kyoto-cultural-view">
      {groups.map((g) => {
        const groupDays = Array.from(new Set(g.items.map((i) => i.dayNumber)));
        // Honest meta: real count; the day tag only when the whole group sits on one day.
        const meta = `${g.items.length} ${g.items.length === 1 ? "place" : "places"}${groupDays.length === 1 ? ` · Day ${groupDays[0]}` : ""}`;
        return (
          <div
            key={g.id}
            data-testid={`hood-group-${g.id}`}
            style={{ border: `1px solid ${LINE}`, borderRadius: 11, marginBottom: 12, overflow: "hidden", background: CARD }}
          >
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, padding: "9px 13px", background: GROUND, borderBottom: `1px solid ${LINE}` }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: INK }}>{g.name}</span>
              <span style={{ fontSize: 11, color: MID }}>{meta}</span>
            </div>
            {g.items.map((item, idx) => {
              const section = sectionFor(format.sections, item);
              const tone = section ? (BADGE_TONES[section.key] ?? { bg: GROUND, color: MID }) : { bg: GROUND, color: MID };
              const note = itemNote(item);
              return (
                <div key={item.id} style={{ padding: "8px 13px", borderBottom: idx === g.items.length - 1 ? "none" : `1px solid ${GROUND}` }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 13, color: INK }}>
                    {section && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap", background: tone.bg, color: tone.color }}>
                        {section.label}
                      </span>
                    )}
                    <span style={{ minWidth: 0 }}>{item.title}</span>
                    <span style={{ marginLeft: "auto", fontSize: 10.5, color: MID, whiteSpace: "nowrap" }}>{dayRibbon(item)}</span>
                  </div>
                  {note && (
                    <div style={{ fontSize: 11.5, color: MID, marginTop: 3, paddingLeft: 2, lineHeight: 1.45 }} data-testid={`item-note-${item.id}`}>
                      {note}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Seasonal slot — renders only from real listing bestSeason data (§13). */}
      {season !== "" && (
        <div
          data-testid="kyoto-cultural-season"
          style={{ display: "flex", gap: 9, alignItems: "baseline", border: `1px dashed ${LINE}`, borderRadius: 9, padding: "8px 12px", fontSize: 12.5, color: MID, marginTop: 12 }}
        >
          <span>
            <b style={{ color: INK }}>Best season: {season}</b>
          </span>
        </div>
      )}
    </div>
  );
}
