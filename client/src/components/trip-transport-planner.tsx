import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Plane, 
  Hotel, 
  MapPin, 
  ArrowRight, 
  Check, 
  AlertCircle, 
  Bus, 
  Car,
  Train,
  ExternalLink,
  ChevronDown,
  ChevronUp
} from "lucide-react";

interface CartItem {
  id: string;
  type: string;
  name: string;
  price: number;
  quantity: number;
  date?: string;
  details?: string;
  provider?: string;
  isExternal?: boolean;
  metadata?: {
    departureTime?: string;
    arrivalTime?: string;
    checkInDate?: string;
    checkOutDate?: string;
    meetingPoint?: string;
    meetingPointCoordinates?: { lat: number; lng: number };
    hotelAddress?: string;
    hotelCoordinates?: { lat: number; lng: number };
    airportCode?: string;
    includesAirportTransfer?: boolean;
    travelers?: number;
  };
}

interface TransportSegment {
  id: string;
  type: 'airport_to_hotel' | 'hotel_to_activity' | 'activity_to_activity' | 'hotel_to_airport';
  from: {
    name: string;
    type: 'airport' | 'hotel' | 'activity';
    coordinates?: { lat: number; lng: number };
    time?: string;
  };
  to: {
    name: string;
    type: 'airport' | 'hotel' | 'activity';
    coordinates?: { lat: number; lng: number };
    time?: string;
  };
  date: string;
  status: 'covered' | 'needs_transport' | 'optional';
  coveredBy?: string;
  options?: TransportOption[];
}

interface TransportOption {
  type: 'hotel_shuttle' | 'amadeus_transfer' | 'google_transit' | '12go' | 'taxi';
  name: string;
  provider: string;
  price?: number;
  duration?: string;
  description?: string;
  actionUrl?: string;
  isFree?: boolean;
}

interface TripTransportPlannerProps {
  cart: CartItem[];
  destination: string;
  startDate?: Date;
  endDate?: Date;
  travelers: number;
  arrivalAirport?: string;
  onBookTransfer?: (segment: TransportSegment, option: TransportOption) => void;
}

export function TripTransportPlanner({
  cart,
  destination,
  startDate,
  endDate,
  travelers,
  arrivalAirport,
  onBookTransfer
}: TripTransportPlannerProps) {
  const [expandedSegments, setExpandedSegments] = useState<Set<string>>(new Set());

  const segments = useMemo(() => {
    const result: TransportSegment[] = [];
    
    const flights = cart.filter(item => item.type === 'flight');
    const hotels = cart.filter(item => item.type === 'accommodation');
    const activities = cart.filter(item => 
      item.type === 'activity' || item.type === 'tour'
    ).sort((a, b) => {
      const dateA = a.date || a.metadata?.checkInDate || '';
      const dateB = b.date || b.metadata?.checkInDate || '';
      return dateA.localeCompare(dateB);
    });

    const arrivalFlight = flights.find(f => 
      f.name.toLowerCase().includes(destination.toLowerCase()) ||
      f.details?.toLowerCase().includes(destination.toLowerCase())
    );
    
    const departureFlight = flights.find(f => 
      f !== arrivalFlight && 
      (f.name.toLowerCase().includes(destination.toLowerCase()) ||
       f.details?.toLowerCase().includes(destination.toLowerCase()))
    );

    const hotel = hotels[0];
    const hotelIncludesTransfer = hotel?.metadata?.includesAirportTransfer;

    if (arrivalFlight && hotel) {
      result.push({
        id: 'airport-to-hotel',
        type: 'airport_to_hotel',
        from: {
          name: arrivalAirport || `${destination} Airport`,
          type: 'airport',
          time: arrivalFlight.metadata?.arrivalTime
        },
        to: {
          name: hotel.name,
          type: 'hotel',
          coordinates: hotel.metadata?.hotelCoordinates
        },
        date: arrivalFlight.date || startDate?.toISOString().split('T')[0] || '',
        status: hotelIncludesTransfer ? 'covered' : 'needs_transport',
        coveredBy: hotelIncludesTransfer ? 'Hotel provides free airport transfer' : undefined,
        options: hotelIncludesTransfer ? [] : generateTransportOptions('airport_to_hotel', destination, travelers)
      });
    } else if (hotel && startDate) {
      result.push({
        id: 'arrival-to-hotel',
        type: 'airport_to_hotel',
        from: {
          name: arrivalAirport || `${destination} Airport`,
          type: 'airport'
        },
        to: {
          name: hotel.name,
          type: 'hotel',
          coordinates: hotel.metadata?.hotelCoordinates
        },
        date: startDate.toISOString().split('T')[0],
        status: hotelIncludesTransfer ? 'covered' : 'needs_transport',
        coveredBy: hotelIncludesTransfer ? 'Hotel provides free airport transfer' : undefined,
        options: hotelIncludesTransfer ? [] : generateTransportOptions('airport_to_hotel', destination, travelers)
      });
    }

    activities.forEach((activity, index) => {
      const activityDate = activity.date || '';
      const fromLocation = index === 0 ? hotel : activities[index - 1];
      
      if (fromLocation) {
        result.push({
          id: `to-activity-${activity.id}`,
          type: index === 0 ? 'hotel_to_activity' : 'activity_to_activity',
          from: {
            name: fromLocation.name,
            type: index === 0 ? 'hotel' : 'activity',
            coordinates: fromLocation.metadata?.meetingPointCoordinates || fromLocation.metadata?.hotelCoordinates
          },
          to: {
            name: activity.name,
            type: 'activity',
            coordinates: activity.metadata?.meetingPointCoordinates,
            time: activity.metadata?.departureTime
          },
          date: activityDate,
          status: 'needs_transport',
          options: generateTransportOptions('hotel_to_activity', destination, travelers)
        });
      }
    });

    if (hotel && (departureFlight || endDate)) {
      result.push({
        id: 'hotel-to-airport',
        type: 'hotel_to_airport',
        from: {
          name: hotel.name,
          type: 'hotel',
          coordinates: hotel.metadata?.hotelCoordinates
        },
        to: {
          name: arrivalAirport || `${destination} Airport`,
          type: 'airport',
          time: departureFlight?.metadata?.departureTime
        },
        date: departureFlight?.date || endDate?.toISOString().split('T')[0] || '',
        status: hotelIncludesTransfer ? 'covered' : 'needs_transport',
        coveredBy: hotelIncludesTransfer ? 'Hotel provides free airport transfer' : undefined,
        options: hotelIncludesTransfer ? [] : generateTransportOptions('hotel_to_airport', destination, travelers)
      });
    }

    return result;
  }, [cart, destination, startDate, endDate, travelers, arrivalAirport]);

  const toggleSegment = (id: string) => {
    setExpandedSegments(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const needsTransportCount = segments.filter(s => s.status === 'needs_transport').length;
  const coveredCount = segments.filter(s => s.status === 'covered').length;

  if (segments.length === 0) {
    return (
      <Card data-testid="transport-planner-empty">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Car className="h-5 w-5 text-[#FF385C]" />
            Trip Transportation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Bus className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Add flights, hotels, or activities to your cart to see your transportation needs.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="transport-planner">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Car className="h-5 w-5 text-[#FF385C]" />
            Trip Transportation
          </div>
          <div className="flex gap-2">
            {coveredCount > 0 && (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200" data-testid="badge-covered-count">
                <Check className="h-3 w-3 mr-1" />
                {coveredCount} covered
              </Badge>
            )}
            {needsTransportCount > 0 && (
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200" data-testid="badge-needs-count">
                <AlertCircle className="h-3 w-3 mr-1" />
                {needsTransportCount} need transport
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {segments.map((segment) => (
          <div 
            key={segment.id}
            className={`border rounded-lg p-4 ${
              segment.status === 'covered' 
                ? 'bg-green-50/50 border-green-200' 
                : 'bg-amber-50/50 border-amber-200'
            }`}
            data-testid={`transport-segment-${segment.id}`}
          >
            <div 
              className="flex items-center justify-between cursor-pointer"
              onClick={() => segment.status === 'needs_transport' && toggleSegment(segment.id)}
              data-testid={`segment-header-${segment.id}`}
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  {segment.from.type === 'airport' && <Plane className="h-4 w-4 text-blue-600" />}
                  {segment.from.type === 'hotel' && <Hotel className="h-4 w-4 text-purple-600" />}
                  {segment.from.type === 'activity' && <MapPin className="h-4 w-4 text-orange-600" />}
                  <span className="font-medium text-sm">{segment.from.name}</span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <div className="flex items-center gap-2">
                  {segment.to.type === 'airport' && <Plane className="h-4 w-4 text-blue-600" />}
                  {segment.to.type === 'hotel' && <Hotel className="h-4 w-4 text-purple-600" />}
                  {segment.to.type === 'activity' && <MapPin className="h-4 w-4 text-orange-600" />}
                  <span className="font-medium text-sm">{segment.to.name}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {segment.date && (
                  <span className="text-xs text-muted-foreground">{segment.date}</span>
                )}
                {segment.status === 'covered' ? (
                  <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
                    <Check className="h-3 w-3 mr-1" />
                    Covered
                  </Badge>
                ) : (
                  <>
                    <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Need Transport
                    </Badge>
                    {expandedSegments.has(segment.id) ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </>
                )}
              </div>
            </div>

            {segment.status === 'covered' && segment.coveredBy && (
              <p className="text-sm text-green-700 mt-2 flex items-center gap-2">
                <Check className="h-4 w-4" />
                {segment.coveredBy}
              </p>
            )}

            {segment.status === 'needs_transport' && expandedSegments.has(segment.id) && segment.options && (
              <div className="mt-4 pt-4 border-t border-amber-200 space-y-3">
                <p className="text-sm font-medium text-gray-700">Transport Options:</p>
                {segment.options.map((option, idx) => (
                  <div 
                    key={idx}
                    className="flex items-center justify-between bg-white rounded-lg p-3 border"
                    data-testid={`transport-option-${segment.id}-${idx}`}
                  >
                    <div className="flex items-center gap-3">
                      {option.type === 'google_transit' && <Train className="h-5 w-5 text-blue-600" />}
                      {option.type === 'amadeus_transfer' && <Car className="h-5 w-5 text-purple-600" />}
                      {option.type === '12go' && <Bus className="h-5 w-5 text-green-600" />}
                      {option.type === 'taxi' && <Car className="h-5 w-5 text-yellow-600" />}
                      {option.type === 'hotel_shuttle' && <Bus className="h-5 w-5 text-teal-600" />}
                      <div>
                        <p className="font-medium text-sm">{option.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {option.provider}
                          {option.duration && ` • ${option.duration}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {option.isFree ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700">Free</Badge>
                      ) : option.price ? (
                        <span className="font-semibold">${option.price}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Check price</span>
                      )}
                      {option.actionUrl ? (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => window.open(option.actionUrl, '_blank')}
                          data-testid={`button-book-${segment.id}-${idx}`}
                        >
                          Book <ExternalLink className="h-3 w-3 ml-1" />
                        </Button>
                      ) : (
                        <Button 
                          size="sm"
                          onClick={() => onBookTransfer?.(segment, option)}
                          data-testid={`button-select-${segment.id}-${idx}`}
                        >
                          Select
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-start gap-3">
            <Train className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="font-medium text-blue-900">Need trains, buses, or ferries?</p>
              <p className="text-sm text-blue-700 mt-1">
                Book ground transportation for longer journeys between cities.
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-3"
                onClick={() => window.open(`https://12go.asia/en?z=13805109&curr=USD&departcity=${encodeURIComponent(destination)}`, '_blank')}
                data-testid="button-browse-12go"
              >
                Browse 12Go Transportation <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function generateTransportOptions(
  segmentType: string, 
  destination: string, 
  travelers: number
): TransportOption[] {
  const options: TransportOption[] = [];

  options.push({
    type: 'google_transit',
    name: 'Public Transit',
    provider: 'Google Maps',
    description: 'Bus, metro, or train options',
    duration: 'Varies'
  });

  if (segmentType === 'airport_to_hotel' || segmentType === 'hotel_to_airport') {
    options.push({
      type: 'amadeus_transfer',
      name: 'Private Airport Transfer',
      provider: 'Amadeus',
      description: 'Door-to-door service',
      price: Math.round(25 + (travelers * 5))
    });
  }

  options.push({
    type: 'taxi',
    name: 'Local Taxi / Ride-share',
    provider: 'Grab, Uber, or local taxi',
    description: 'On-demand pickup'
  });

  if (segmentType === 'airport_to_hotel' || segmentType === 'hotel_to_airport') {
    options.push({
      type: '12go',
      name: 'Shared Shuttle',
      provider: '12Go Asia',
      actionUrl: `https://12go.asia/en?z=13805109&curr=USD&departcity=${encodeURIComponent(destination)}`,
      price: Math.round(10 + (travelers * 3))
    });
  }

  return options;
}
