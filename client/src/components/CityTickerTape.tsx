import { MapPin } from "lucide-react";
import { Link } from "wouter";
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
    <div 
      className="w-full bg-primary text-primary-foreground py-2 px-4"
      data-testid="top-ribbon-banner"
    >
      <div className="flex items-center justify-center gap-2 text-sm">
        <span className="font-semibold whitespace-nowrap hidden sm:inline">
          Join Our Beta in 8 Cities World Wide
        </span>
        <span className="font-semibold whitespace-nowrap sm:hidden">
          Beta in 8 Cities
        </span>
        
        <span className="text-primary-foreground/60">|</span>
        
        <span className="whitespace-nowrap hidden md:inline">
          Limited Expert Spots Available
        </span>
        
        <span className="text-primary-foreground/60 hidden md:inline">|</span>
        
        <div className="ticker-wrapper flex-1 max-w-xs sm:max-w-sm md:max-w-md overflow-hidden">
          <div className="ticker-content-inline">
            {[...launchCities, ...launchCities].map((city, index) => (
              <span
                key={`${city.city}-${index}`}
                className="inline-flex items-center gap-1 mx-2 whitespace-nowrap"
                data-testid={`ticker-city-${city.city.toLowerCase()}-${index}`}
              >
                <MapPin className="w-3 h-3" />
                <span>{city.city}</span>
              </span>
            ))}
          </div>
        </div>
        
        <span className="text-primary-foreground/60">|</span>
        
        <Link 
          href="/experiences/travel"
          className="font-semibold underline underline-offset-2 whitespace-nowrap"
          data-testid="link-apply-now"
        >
          Apply Now
        </Link>
      </div>
    </div>
  );
}
