import { MapPin, Sparkles } from "lucide-react";
import "./CityTickerTape.css";

const launchCities = [
  { city: "Kyoto", country: "Japan" },
  { city: "Edinburgh", country: "Scotland" },
  { city: "Goa", country: "India" },
  { city: "Mumbai", country: "India" },
  { city: "Bogotá", country: "Colombia" },
  { city: "Porto", country: "Portugal" },
  { city: "Jaipur", country: "India" },
  { city: "Cartagena", country: "Colombia" },
];

export function CityTickerTape() {
  return (
    <div className="w-full overflow-hidden bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 py-3 border-y border-primary/10">
      <div className="flex items-center gap-2 mb-2 justify-center">
        <Sparkles className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium text-foreground/70">Now Live in 8 Cities</span>
        <Sparkles className="w-4 h-4 text-primary" />
      </div>
      <div className="ticker-wrapper">
        <div className="ticker-content">
          {[...launchCities, ...launchCities].map((city, index) => (
            <div
              key={`${city.city}-${index}`}
              className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-background/80 border border-border/50 flex-shrink-0"
              data-testid={`ticker-city-${city.city.toLowerCase()}-${index}`}
            >
              <MapPin className="w-3.5 h-3.5 text-primary" />
              <span className="font-medium text-foreground">{city.city}</span>
              <span className="text-muted-foreground text-sm">{city.country}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
