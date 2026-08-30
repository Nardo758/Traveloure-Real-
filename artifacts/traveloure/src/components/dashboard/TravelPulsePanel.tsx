import { useQuery } from "@tanstack/react-query";

// Real shape of GET /api/travelpulse/cities?limit=N (server/routes/content.routes.ts:4766,
// travelPulseService.getTrendingCities → shared/schema.ts travelPulseCities). Only fields we
// actually read are declared; everything else on the row is ignored.
interface TravelPulseCityRow {
  cityName: string;
  pulseScore?: number | null;
  trendingScore?: number | null;
  currentHighlight?: string | null;
  dealAlert?: string | null;
  priceChange?: string | number | null;
  priceTrend?: "up" | "down" | "stable" | string | null;
  crowdLevel?: string | null;
}

interface TravelPulseCitiesResponse {
  cities: TravelPulseCityRow[];
  count: number;
}

interface PulseItem {
  city: string;
  text: string;
  indicator: string;
  type: "up" | "down" | "neutral";
}

// R-I(1): the panel previously queried a nonexistent /api/travelpulse/feed and rendered a
// hardcoded 8-item fallback (fake Kyoto/JPY/Fushimi Inari entries) whenever that 404'd — i.e.
// always. It now reads the real trending-cities endpoint and derives every row from real
// columns; there is no fabricated fallback (CLAUDE.md §13).
function toPulseItem(row: TravelPulseCityRow): PulseItem | null {
  if (!row?.cityName) return null;

  const priceChangeNum =
    row.priceChange !== null && row.priceChange !== undefined
      ? Number(row.priceChange)
      : null;

  const text = row.currentHighlight || row.dealAlert || null;
  if (!text) return null; // never render a row with no real signal to show

  let indicator = "";
  let type: PulseItem["type"] = "neutral";
  if (priceChangeNum !== null && !Number.isNaN(priceChangeNum)) {
    indicator = `${priceChangeNum > 0 ? "+" : ""}${priceChangeNum}%`;
    type = priceChangeNum > 0 ? "up" : priceChangeNum < 0 ? "down" : "neutral";
  } else if (row.priceTrend === "up" || row.priceTrend === "down") {
    indicator = row.priceTrend;
    type = row.priceTrend;
  } else if (typeof row.trendingScore === "number") {
    indicator = `pulse ${row.trendingScore}`;
  } else if (row.crowdLevel) {
    indicator = row.crowdLevel;
  }

  return { city: row.cityName, text, indicator, type };
}

export function TravelPulsePanel() {
  const { data, isLoading } = useQuery<TravelPulseCitiesResponse>({
    queryKey: ["/api/travelpulse/cities", { limit: 10 }],
    queryFn: async () => {
      const res = await fetch("/api/travelpulse/cities?limit=10", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch trending cities");
      return res.json();
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const items: PulseItem[] = (data?.cities ?? [])
    .map(toPulseItem)
    .filter((item): item is PulseItem => item !== null);

  const doubled = items.length > 0 ? [...items, ...items] : [];

  const indicatorColor = (type: string) => {
    if (type === "up") return { text: "#5DCAA5", bg: "rgba(93,202,165,0.12)" };
    if (type === "down") return { text: "#F09595", bg: "rgba(240,149,149,0.12)" };
    return { text: "#FAC775", bg: "rgba(250,199,117,0.12)" };
  };

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "#0D2137" }}
      data-testid="travelpulse-panel"
    >
      <div className="flex justify-between items-center px-3.5 pt-2.5">
        <span className="text-[9px] font-semibold text-[#5DCAA5] uppercase tracking-widest">
          TravelPulse
        </span>
        <span className="text-[8px] text-[#E8B339] cursor-pointer hover:underline">
          Upgrade →
        </span>
      </div>

      <div className="relative h-[180px] overflow-hidden my-2">
        {/* Fade gradients */}
        <div
          className="absolute top-0 left-0 right-0 h-5 z-10 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, #0D2137, transparent)" }}
        />
        <div
          className="absolute bottom-0 left-0 right-0 h-5 z-10 pointer-events-none"
          style={{ background: "linear-gradient(to top, #0D2137, transparent)" }}
        />

        {doubled.length > 0 ? (
          <div
            className="px-3.5"
            style={{ animation: "tpVerticalScroll 30s linear infinite" }}
          >
            {doubled.map((item, i) => {
              const colors = indicatorColor(item.type);
              return (
                <div
                  key={i}
                  className="py-[7px]"
                  style={{
                    borderTop:
                      i > 0 ? "0.5px solid rgba(255,255,255,0.06)" : "none",
                  }}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-semibold text-[#5DCAA5]">
                      {item.city}
                    </span>
                    {item.indicator && (
                      <span
                        className="text-[8px] px-1.5 rounded"
                        style={{ color: colors.text, background: colors.bg }}
                      >
                        {item.indicator}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-[#E1F5EE] leading-snug mt-0.5">
                    {item.text}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full px-3.5">
            <span className="text-[10px] text-[#7A9BAE] text-center">
              {isLoading ? "Loading trends…" : "No trending data yet"}
            </span>
          </div>
        )}
      </div>

      <style>{`
        @keyframes tpVerticalScroll {
          0% { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }
      `}</style>
    </div>
  );
}
