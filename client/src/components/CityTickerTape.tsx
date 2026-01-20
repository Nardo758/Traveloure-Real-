import { MapPin, Sparkles, ArrowRight } from "lucide-react";
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
      className="w-full bg-gradient-to-r from-[#FF6B6B] via-[#FF8E53] to-[#FF6B6B] text-white py-2.5 px-4"
      data-testid="top-ribbon-banner"
    >
      <div className="container mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-3 flex-shrink-0 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span className="font-semibold whitespace-nowrap hidden sm:inline">
                Join Our Beta in 8 Cities World Wide
              </span>
              <span className="font-semibold whitespace-nowrap sm:hidden">
                Beta in 8 Cities
              </span>
            </div>
            
            <div className="h-4 w-px bg-white/30 hidden md:block" />
            
            <span className="whitespace-nowrap hidden md:inline text-white/90">
              Limited Expert Spots Available
            </span>
          </div>
          
          <div className="ticker-wrapper flex-1 min-w-0 overflow-hidden mx-2">
            <div className="ticker-content-inline">
              {[...launchCities, ...launchCities, ...launchCities].map((city, index) => (
                <span
                  key={`${city.city}-${index}`}
                  className="inline-flex items-center gap-1.5 mx-3 whitespace-nowrap"
                  data-testid={`ticker-city-${city.city.toLowerCase()}-${index}`}
                >
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white/20">
                    <MapPin className="w-3 h-3" />
                  </span>
                  <span className="font-medium">{city.city}</span>
                </span>
              ))}
            </div>
          </div>
          
          <Link 
            href="/experiences/travel"
            className="flex items-center gap-1 font-semibold whitespace-nowrap bg-white/20 hover-elevate px-3 py-1 rounded-full text-xs flex-shrink-0"
            data-testid="link-apply-now"
          >
            Apply Now
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
