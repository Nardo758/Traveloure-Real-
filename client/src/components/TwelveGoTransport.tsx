import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Train, Bus, Ship, Plane, ExternalLink, MapPin, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface TwelveGoTransportProps {
  origin?: string;
  destination?: string;
  departureDate?: string;
  passengers?: number;
  className?: string;
  variant?: "full" | "compact" | "button";
}

const AFFILIATE_ID = import.meta.env.VITE_TWELVEGO_AFFILIATE_ID || "13805109";

function formatDateForUrl(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toISOString().split('T')[0];
}

function generateDeepLink(
  origin: string,
  destination: string,
  departureDate?: string,
  passengers: number = 1
): string {
  const baseUrl = "https://12go.co/en/travel";
  
  const originSlug = origin.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const destSlug = destination.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  
  let url = `${baseUrl}/${originSlug}/${destSlug}`;
  
  const params = new URLSearchParams();
  params.set('affiliate_id', AFFILIATE_ID);
  
  if (departureDate) {
    params.set('date', formatDateForUrl(departureDate));
  }
  
  if (passengers > 1) {
    params.set('people', passengers.toString());
  }
  
  return `${url}?${params.toString()}`;
}

function generateSearchLink(destination?: string): string {
  const baseUrl = "https://12go.co/en";
  const params = new URLSearchParams();
  params.set('affiliate_id', AFFILIATE_ID);
  
  if (destination) {
    params.set('q', destination);
  }
  
  return `${baseUrl}?${params.toString()}`;
}

export function TwelveGoTransport({
  origin,
  destination,
  departureDate,
  passengers = 1,
  className = "",
  variant = "full"
}: TwelveGoTransportProps) {
  
  const hasRoute = origin && destination;
  const bookingUrl = hasRoute 
    ? generateDeepLink(origin, destination, departureDate, passengers)
    : generateSearchLink(destination);

  const handleBookClick = () => {
    window.open(bookingUrl, '_blank', 'noopener,noreferrer');
  };

  if (variant === "button") {
    return (
      <Button 
        onClick={handleBookClick}
        className={className}
        data-testid="button-12go-transport"
      >
        <Train className="w-4 h-4 mr-2" />
        Find Transportation
        <ExternalLink className="w-3 h-3 ml-2" />
      </Button>
    );
  }

  if (variant === "compact") {
    return (
      <Card className={`${className}`} data-testid="card-12go-compact">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                <Train className="w-5 h-5 text-blue-600" />
                <Bus className="w-5 h-5 text-green-600" />
                <Ship className="w-5 h-5 text-cyan-600" />
              </div>
              <div>
                <p className="font-medium text-sm">Ground Transportation</p>
                <p className="text-xs text-gray-500">Trains, buses, ferries via 12Go</p>
              </div>
            </div>
            <Button size="sm" onClick={handleBookClick} data-testid="button-12go-search">
              Search
              <ExternalLink className="w-3 h-3 ml-1" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`${className}`} data-testid="card-12go-transport">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <div className="flex gap-1">
            <Train className="w-5 h-5 text-blue-600" />
            <Bus className="w-5 h-5 text-green-600" />
            <Ship className="w-5 h-5 text-cyan-600" />
          </div>
          Ground Transportation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600">
          Book trains, buses, and ferries for your trip. Powered by 12Go Travel.
        </p>
        
        {hasRoute && (
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="w-4 h-4 text-gray-400" />
              <span className="font-medium">{origin}</span>
              <span className="text-gray-400">to</span>
              <span className="font-medium">{destination}</span>
            </div>
            {departureDate && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span>{new Date(departureDate).toLocaleDateString()}</span>
              </div>
            )}
            {passengers > 1 && (
              <Badge variant="secondary" className="text-xs">
                {passengers} passengers
              </Badge>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="text-xs">
            <Train className="w-3 h-3 mr-1" /> Trains
          </Badge>
          <Badge variant="outline" className="text-xs">
            <Bus className="w-3 h-3 mr-1" /> Buses
          </Badge>
          <Badge variant="outline" className="text-xs">
            <Ship className="w-3 h-3 mr-1" /> Ferries
          </Badge>
          <Badge variant="outline" className="text-xs">
            <Plane className="w-3 h-3 mr-1" /> Flights
          </Badge>
        </div>

        <Button 
          onClick={handleBookClick} 
          className="w-full"
          data-testid="button-12go-book"
        >
          {hasRoute ? "Search Routes" : "Browse Transportation"}
          <ExternalLink className="w-4 h-4 ml-2" />
        </Button>
        
        <p className="text-xs text-gray-400 text-center">
          Opens 12Go.co in a new tab
        </p>
      </CardContent>
    </Card>
  );
}

export { generateDeepLink, generateSearchLink };
