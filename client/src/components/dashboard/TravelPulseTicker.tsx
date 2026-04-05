import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useTrips } from "@/hooks/use-trips";

interface HappeningNowEvent {
  id?: string | number;
  city?: string;
  title?: string;
  description?: string;
  indicator?: "up" | "down" | "normal" | string;
  type?: string;
}

interface HappeningNowResponse {
  events: HappeningNowEvent[];
  city: string;
  count: number;
}

const FALLBACK_ITEMS = [
  { city: "Paris", text: "14°C avg, partly cloudy", ind: "mild", indType: "n" },
  { city: "EUR/USD", text: "1.087", ind: "+0.3%", indType: "up" },
  { city: "Tokyo", text: "Cherry blossoms: peak season", ind: "peak", indType: "up" },
  { city: "NYC", text: "Low travel disruptions today", ind: "clear", indType: "up" },
  { city: "JPY/USD", text: "152.3", ind: "+0.8%", indType: "up" },
  { city: "Bali", text: "Clear skies, 28°C", ind: "good", indType: "up" },
  { city: "London", text: "Partly cloudy, 12°C", ind: "mild", indType: "n" },
  { city: "GBP/USD", text: "1.264", ind: "-0.1%", indType: "down" },
  { city: "Dubai", text: "3 trending spots from experts", ind: "new", indType: "n" },
  { city: "Sydney", text: "25°C, sunny skies", ind: "good", indType: "up" },
];

function TickerItem({ city, text, ind, indType }: { city: string; text: string; ind: string; indType: string }) {
  const indClass =
    indType === "up"
      ? "text-[#5DCAA5] bg-[rgba(93,202,165,0.12)]"
      : indType === "down"
      ? "text-[#F09595] bg-[rgba(240,149,149,0.12)]"
      : "text-[#FAC775] bg-[rgba(250,199,117,0.12)]";

  return (
    <span className="inline-flex items-center gap-2 flex-shrink-0">
      <span className="text-[10px] text-[#5DCAA5] uppercase tracking-[0.5px] font-medium">{city}</span>
      <span className="text-[12px] text-[#E1F5EE]">{text}</span>
      <span className={`text-[10px] px-1.5 py-px rounded-lg font-medium ${indClass}`}>{ind}</span>
    </span>
  );
}

function useDestinationPulse(destinations: string[]) {
  const uniqueDests = [...new Set(destinations.slice(0, 3))];

  const q0 = useQuery<HappeningNowResponse>({
    queryKey: ["/api/travelpulse/cities", uniqueDests[0], "happening-now"],
    queryFn: () => fetch(`/api/travelpulse/cities/${encodeURIComponent(uniqueDests[0])}/happening-now`).then(r => r.json()),
    enabled: !!uniqueDests[0],
    staleTime: 5 * 60 * 1000,
  });
  const q1 = useQuery<HappeningNowResponse>({
    queryKey: ["/api/travelpulse/cities", uniqueDests[1], "happening-now"],
    queryFn: () => fetch(`/api/travelpulse/cities/${encodeURIComponent(uniqueDests[1])}/happening-now`).then(r => r.json()),
    enabled: !!uniqueDests[1],
    staleTime: 5 * 60 * 1000,
  });
  const q2 = useQuery<HappeningNowResponse>({
    queryKey: ["/api/travelpulse/cities", uniqueDests[2], "happening-now"],
    queryFn: () => fetch(`/api/travelpulse/cities/${encodeURIComponent(uniqueDests[2])}/happening-now`).then(r => r.json()),
    enabled: !!uniqueDests[2],
    staleTime: 5 * 60 * 1000,
  });

  const allEvents: Array<{ city: string; text: string; ind: string; indType: string }> = [];
  const queries = [q0, q1, q2];
  uniqueDests.forEach((dest, i) => {
    const data = queries[i].data;
    if (data?.events?.length) {
      data.events.slice(0, 4).forEach((ev) => {
        const text = ev.title || ev.description || "Live update";
        const indType = ev.indicator === "up" ? "up" : ev.indicator === "down" ? "down" : "n";
        const indLabel = ev.indicator || "live";
        allEvents.push({ city: ev.city || dest, text, ind: indLabel, indType });
      });
    }
  });

  return allEvents;
}

export function TravelPulseTicker() {
  const { data: trips } = useTrips();
  const now = new Date();

  const destinations = (trips ?? [])
    .filter(t => new Date(t.endDate) >= now)
    .map(t => t.destination)
    .filter(Boolean);

  const liveItems = useDestinationPulse(destinations);
  const items = liveItems.length > 0 ? liveItems : FALLBACK_ITEMS;

  const doubled = [...items, ...items];

  return (
    <div className="rounded-xl overflow-hidden mb-4" style={{ background: "#0D2137" }}>
      <div className="flex items-center justify-between px-4 pt-2">
        <span className="text-[10px] font-medium text-[#5DCAA5] uppercase tracking-[1.2px]">
          TravelPulse live
        </span>
        <Link href="/credits">
          <span
            className="text-[10px] text-[#E8B339] cursor-pointer px-2.5 py-0.5 rounded-full"
            style={{ background: "rgba(232,179,57,0.15)" }}
            data-testid="link-travelpulse-upgrade"
          >
            Upgrade for full access
          </span>
        </Link>
      </div>

      <div className="relative overflow-hidden py-2.5" style={{ paddingBottom: "12px" }}>
        <div
          className="absolute top-0 bottom-0 left-0 w-10 pointer-events-none z-10"
          style={{ background: "linear-gradient(90deg,#0D2137,transparent)" }}
        />
        <div
          className="absolute top-0 bottom-0 right-0 w-10 pointer-events-none z-10"
          style={{ background: "linear-gradient(270deg,#0D2137,transparent)" }}
        />

        <div
          className="flex gap-8 px-4 whitespace-nowrap animate-[ticker_32s_linear_infinite] hover:[animation-play-state:paused]"
          data-testid="travelpulse-ticker"
        >
          {doubled.map((item, i) => (
            <span key={i} className="inline-flex items-center gap-2 flex-shrink-0">
              <TickerItem city={item.city} text={item.text} ind={item.ind} indType={item.indType} />
              {i < doubled.length - 1 && (
                <span className="text-[rgba(255,255,255,0.15)] text-[10px] ml-4">|</span>
              )}
            </span>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
