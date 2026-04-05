interface TickerItem {
  city: string;
  text: string;
  type: "up" | "down" | "neutral";
}

export function TravelPulseTicker({ items }: { items: TickerItem[] }) {
  const doubled = [...items, ...items];
  return (
    <div className="bg-[#0D2137] rounded-xl overflow-hidden mb-4">
      <div className="flex justify-between items-center px-4 pt-2">
        <span className="text-[10px] font-semibold text-[#5DCAA5] uppercase tracking-wider">
          TravelPulse
        </span>
        <span className="text-[10px] text-[#E8B339] bg-[#E8B339]/15 px-2.5 py-0.5 rounded-full">
          Live
        </span>
      </div>
      <div className="overflow-hidden py-2.5 relative">
        <div className="absolute left-0 top-0 bottom-0 w-10 bg-gradient-to-r from-[#0D2137] to-transparent z-10" />
        <div className="absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-[#0D2137] to-transparent z-10" />
        <div className="flex gap-8 animate-ticker-scroll whitespace-nowrap px-4 hover:[animation-play-state:paused]">
          {doubled.map((item, i) => (
            <span key={i} className="inline-flex items-center gap-2 flex-shrink-0">
              <span className="text-[10px] text-[#5DCAA5] uppercase font-medium tracking-wide">
                {item.city}
              </span>
              <span className="text-[10px] text-white/15">|</span>
              <span className="text-xs text-[#E1F5EE]">{item.text}</span>
            </span>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-ticker-scroll {
          animation: ticker-scroll 26s linear infinite;
        }
      `}</style>
    </div>
  );
}
