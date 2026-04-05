import { useQuery } from "@tanstack/react-query";

interface PulseItem {
  city: string;
  text: string;
  indicator: string;
  type: "up" | "down" | "neutral";
}

export function TravelPulsePanel() {
  // Try to fetch real TravelPulse data
  const { data: pulseData } = useQuery<PulseItem[]>({
    queryKey: ["/api/travelpulse/feed"],
    retry: false,
  });

  // Fallback to static data if API doesn't exist
  const items: PulseItem[] = pulseData ?? [
    {
      city: "Kyoto",
      text: "Cherry blossom peak: Apr 8-14",
      indicator: "peak",
      type: "up",
    },
    {
      city: "JPY/USD",
      text: "¥152.3 — favorable for USD",
      indicator: "+0.8%",
      type: "up",
    },
    {
      city: "Fushimi Inari",
      text: "Low crowds expected this week",
      indicator: "good",
      type: "up",
    },
    {
      city: "California",
      text: "PCH road conditions clear",
      indicator: "normal",
      type: "neutral",
    },
    {
      city: "EUR/USD",
      text: "€1.087 against USD",
      indicator: "-0.3%",
      type: "down",
    },
    {
      city: "Kyoto",
      text: "3 trending spots from experts",
      indicator: "new",
      type: "neutral",
    },
    {
      city: "Gion",
      text: "Geisha district: moderate crowds",
      indicator: "avg",
      type: "neutral",
    },
    {
      city: "NRT→KIX",
      text: "Flight prices dropped 12%",
      indicator: "↓12%",
      type: "up",
    },
  ];

  const doubled = [...items, ...items];

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

        {/* Scrolling content */}
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
                  <span
                    className="text-[8px] px-1.5 rounded"
                    style={{ color: colors.text, background: colors.bg }}
                  >
                    {item.indicator}
                  </span>
                </div>
                <div className="text-[10px] text-[#E1F5EE] leading-snug mt-0.5">
                  {item.text}
                </div>
              </div>
            );
          })}
        </div>
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
