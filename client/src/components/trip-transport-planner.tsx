import { useState, useMemo, useCallback, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  ChevronUp,
  Sparkles,
  Leaf,
  Clock,
  DollarSign,
  Star,
  Loader2,
  RotateCcw,
  Pencil,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

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
    rawData?: {
      hotel?: {
        latitude: number;
        longitude: number;
        name?: string;
      };
    };
  };
}

interface TransportSegment {
  id: string;
  transportLegId?: string | null;
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
}

interface PackageLeg {
  segmentId: string;
  mode: string;
  provider: string;
  estimatedCost: { min: number; max: number };
  estimatedDuration: string;
  notes: string;
}

interface TransportPackage {
  id: string;
  name: string;
  icon: string;
  description: string;
  totalCost: { min: number; max: number };
  totalTime: string;
  convenience: number;
  ecoScore: number;
  bestFor: string;
  legs: PackageLeg[];
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

export interface ExistingTransportLeg {
  id: string;
  fromName: string;
  toName: string;
  userSelectedMode?: string | null;
}

interface TripTransportPlannerProps {
  cart: CartItem[];
  destination: string;
  startDate?: Date;
  endDate?: Date;
  travelers: number;
  arrivalAirport?: string;
  existingTransportLegs?: ExistingTransportLeg[];
  onBookTransfer?: (segment: TransportSegment, option: TransportOption) => void;
}

const TRANSPORT_MODES = [
  { value: "private_car", label: "Private Car", icon: Car },
  { value: "rideshare", label: "Rideshare/Taxi", icon: Car },
  { value: "public_transit", label: "Public Transit", icon: Train },
  { value: "shuttle", label: "Shared Shuttle", icon: Bus },
  { value: "walking", label: "Walking", icon: MapPin },
];

const IMMEDIATE_MODE_TIME_MIN: Record<string, number> = {
  private_car: 20, rideshare: 25, shuttle: 35, public_transit: 45, walking: 60,
};
const BASE_RIDESHARE_COST = 20;
function getImmediateCostEstimate(mode: string): number {
  const mult = getModeMultiplier(mode, "rideshare");
  return Math.round(BASE_RIDESHARE_COST * mult);
}


function getModeIcon(mode: string) {
  switch (mode) {
    case "private_car": return <Car className="h-4 w-4" />;
    case "rideshare": return <Car className="h-4 w-4" />;
    case "public_transit": return <Train className="h-4 w-4" />;
    case "shuttle": return <Bus className="h-4 w-4" />;
    case "walking": return <MapPin className="h-4 w-4" />;
    default: return <Car className="h-4 w-4" />;
  }
}

function getPackageIcon(icon: string) {
  switch (icon) {
    case "car": return <Car className="h-5 w-5" />;
    case "train": return <Train className="h-5 w-5" />;
    case "sparkles": return <Sparkles className="h-5 w-5" />;
    default: return <Car className="h-5 w-5" />;
  }
}

function getModeMultiplier(newMode: string, originalMode: string): number {
  const costIndex: Record<string, number> = {
    private_car: 1.0,
    rideshare: 0.7,
    shuttle: 0.4,
    public_transit: 0.2,
    walking: 0,
  };
  const origCost = costIndex[originalMode] ?? 0.5;
  const newCost = costIndex[newMode] ?? 0.5;
  if (origCost === 0) return newCost > 0 ? 1 : 0;
  return newCost / origCost;
}

function mapStoredModeToLocal(storedMode: string): string | null {
  const map: Record<string, string> = {
    taxi: "rideshare",
    rideshare: "rideshare",
    private_car: "private_car",
    private_driver: "private_car",
    rental_car: "private_car",
    bus: "shuttle",
    shuttle: "shuttle",
    transit: "public_transit",
    train: "public_transit",
    tram: "public_transit",
    public_transit: "public_transit",
    walk: "walking",
    walking: "walking",
  };
  return map[storedMode] ?? null;
}

function getConvenienceColor(score: number) {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-600";
}

function getLocationIcon(type: string) {
  switch (type) {
    case "airport": return <Plane className="h-3.5 w-3.5 text-blue-600 shrink-0" />;
    case "hotel": return <Hotel className="h-3.5 w-3.5 text-purple-600 shrink-0" />;
    case "activity": return <MapPin className="h-3.5 w-3.5 text-orange-600 shrink-0" />;
    default: return <MapPin className="h-3.5 w-3.5 shrink-0" />;
  }
}

export function TripTransportPlanner({
  cart,
  destination,
  startDate,
  endDate,
  travelers,
  arrivalAirport,
  existingTransportLegs,
  onBookTransfer
}: TripTransportPlannerProps) {
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [customOverrides, setCustomOverrides] = useState<Record<string, string>>({});
  const [immediateOverrides, setImmediateOverrides] = useState<Record<string, string>>({});
  const [showLegs, setShowLegs] = useState(false);
  const [packagesGenerated, setPackagesGenerated] = useState(false);
  const [dbSyncDone, setDbSyncDone] = useState(false);

  const { data: fetchedLegs } = useQuery<ExistingTransportLeg[]>({
    queryKey: ["/api/transport-legs/user"],
    retry: false,
    staleTime: 60_000,
  });

  const resolvedLegs = existingTransportLegs ?? fetchedLegs ?? [];

  const segments = useMemo(() => {
    const result: TransportSegment[] = [];
    
    const flights = cart.filter(item => item.type === 'flights' || item.type === 'flight');
    const hotels = cart.filter(item => 
      item.type === 'hotels' || item.type === 'hotel' || item.type === 'accommodations' || item.type === 'accommodation'
    );
    const activities = cart.filter(item => 
      item.type === 'activity' || item.type === 'activities' || item.type === 'tour' || item.type === 'tours'
    ).sort((a, b) => {
      const dateA = a.date || '';
      const dateB = b.date || '';
      return dateA.localeCompare(dateB);
    });

    const sortedFlights = [...flights].sort((a, b) => {
      const dateA = a.metadata?.departureTime || a.date || '';
      const dateB = b.metadata?.departureTime || b.date || '';
      return dateA.localeCompare(dateB);
    });
    const arrivalFlight = sortedFlights.length > 0 ? sortedFlights[0] : undefined;
    const departureFlight = sortedFlights.length > 1 ? sortedFlights[sortedFlights.length - 1] : undefined;

    const hotel = hotels[0];
    const hotelRawData = hotel?.metadata?.rawData?.hotel;
    const hotelCoords = hotelRawData ? { lat: hotelRawData.latitude, lng: hotelRawData.longitude } : undefined;
    const hotelIncludesTransfer = hotel?.metadata?.includesAirportTransfer === true;

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
          coordinates: hotelCoords
        },
        date: arrivalFlight.date || startDate?.toISOString().split('T')[0] || '',
        status: hotelIncludesTransfer ? 'covered' : 'needs_transport',
        coveredBy: hotelIncludesTransfer ? 'Hotel provides free airport transfer' : undefined,
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
          coordinates: hotelCoords
        },
        date: startDate.toISOString().split('T')[0],
        status: hotelIncludesTransfer ? 'covered' : 'needs_transport',
        coveredBy: hotelIncludesTransfer ? 'Hotel provides free airport transfer' : undefined,
      });
    }

    activities.forEach((activity, index) => {
      const activityDate = activity.date || '';
      const fromLocation = index === 0 ? hotel : activities[index - 1];
      const fromCoords = index === 0 ? hotelCoords : activities[index - 1]?.metadata?.meetingPointCoordinates;
      
      if (fromLocation) {
        result.push({
          id: `to-activity-${activity.id}`,
          type: index === 0 ? 'hotel_to_activity' : 'activity_to_activity',
          from: {
            name: fromLocation.name,
            type: index === 0 ? 'hotel' : 'activity',
            coordinates: fromCoords
          },
          to: {
            name: activity.name,
            type: 'activity',
            coordinates: activity.metadata?.meetingPointCoordinates,
            time: activity.metadata?.departureTime
          },
          date: activityDate,
          status: 'needs_transport',
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
          coordinates: hotelCoords
        },
        to: {
          name: arrivalAirport || `${destination} Airport`,
          type: 'airport',
          time: departureFlight?.metadata?.departureTime
        },
        date: departureFlight?.date || endDate?.toISOString().split('T')[0] || '',
        status: hotelIncludesTransfer ? 'covered' : 'needs_transport',
        coveredBy: hotelIncludesTransfer ? 'Hotel provides free airport transfer' : undefined,
      });
    }

    if (resolvedLegs.length > 0) {
      for (const seg of result) {
        const matched = resolvedLegs.find(etl => {
          const fromMatch = etl.fromName?.toLowerCase().includes(seg.from.name.toLowerCase()) ||
            seg.from.name.toLowerCase().includes(etl.fromName?.toLowerCase() || "");
          const toMatch = etl.toName?.toLowerCase().includes(seg.to.name.toLowerCase()) ||
            seg.to.name.toLowerCase().includes(etl.toName?.toLowerCase() || "");
          return fromMatch && toMatch;
        });
        if (matched) {
          seg.transportLegId = matched.id;
        }
      }
    }

    return result;
  }, [cart, destination, startDate, endDate, travelers, arrivalAirport, resolvedLegs]);

  useEffect(() => {
    if (dbSyncDone || resolvedLegs.length === 0) return;
    const overrides: Record<string, string> = {};
    for (const seg of segments) {
      if (!seg.transportLegId) continue;
      const etl = resolvedLegs.find(l => l.id === seg.transportLegId);
      if (etl?.userSelectedMode) {
        const mapped = mapStoredModeToLocal(etl.userSelectedMode);
        if (mapped) overrides[seg.id] = mapped;
      }
    }
    if (Object.keys(overrides).length > 0) {
      setImmediateOverrides(prev => ({ ...overrides, ...prev }));
    }
    setDbSyncDone(true);
  }, [segments, resolvedLegs, dbSyncDone]);

  const needsTransportSegments = useMemo(
    () => segments.filter(s => s.status === 'needs_transport'),
    [segments]
  );

  const tripDays = useMemo(() => {
    if (startDate && endDate) {
      return Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
    }
    return 3;
  }, [startDate, endDate]);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const segmentsForAI = needsTransportSegments.map(s => ({
        id: s.id,
        type: s.type,
        from: { name: s.from.name, type: s.from.type },
        to: { name: s.to.name, type: s.to.type },
        date: s.date,
      }));

      const res = await apiRequest("POST", "/api/transport-packages/generate", {
        segments: segmentsForAI,
        destination,
        travelers,
        tripDays,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setPackagesGenerated(true);
      if (data.packages && data.packages.length > 0) {
        setSelectedPackageId(data.packages.find((p: TransportPackage) => p.id === 'hybrid')?.id || data.packages[0].id);
      }
    },
  });

  const packages: TransportPackage[] = generateMutation.data?.packages || [];

  const selectedPackage = packages.find(p => p.id === selectedPackageId);

  const effectiveLegs = useMemo(() => {
    if (!selectedPackage) return [];
    return selectedPackage.legs.map(leg => {
      const override = customOverrides[leg.segmentId];
      if (override && override !== leg.mode) {
        const costMultiplier = getModeMultiplier(override, leg.mode);
        return {
          ...leg,
          mode: override,
          isCustomized: true,
          estimatedCost: {
            min: Math.round(leg.estimatedCost.min * costMultiplier),
            max: Math.round(leg.estimatedCost.max * costMultiplier),
          },
        };
      }
      return { ...leg, isCustomized: false };
    });
  }, [selectedPackage, customOverrides]);

  const derivedTotals = useMemo(() => {
    if (effectiveLegs.length === 0) return null;
    const totalMin = effectiveLegs.reduce((sum, l) => sum + l.estimatedCost.min, 0);
    const totalMax = effectiveLegs.reduce((sum, l) => sum + l.estimatedCost.max, 0);
    return { min: totalMin, max: totalMax };
  }, [effectiveLegs]);

  const totalImmediateCost = useMemo(() => {
    const needSegs = segments.filter(s => s.status === 'needs_transport');
    if (needSegs.length === 0) return null;
    let total = 0;
    for (const seg of needSegs) {
      const mode = immediateOverrides[seg.id] || "rideshare";
      total += getImmediateCostEstimate(mode);
    }
    return total;
  }, [segments, immediateOverrides]);

  const immediateModeMutation = useMutation({
    mutationFn: async ({ legId, mode }: { legId: string; mode: string }) => {
      return apiRequest("PATCH", `/api/transport-legs/${legId}/mode`, { selectedMode: mode });
    },
  });

  const handleImmediateModeChange = useCallback((seg: TransportSegment, mode: string) => {
    setImmediateOverrides(prev => ({ ...prev, [seg.id]: mode }));
    if (seg.transportLegId) {
      immediateModeMutation.mutate({ legId: seg.transportLegId, mode });
    }
  }, [immediateModeMutation]);

  const handleOverrideLeg = useCallback((segmentId: string, mode: string) => {
    setCustomOverrides(prev => ({ ...prev, [segmentId]: mode }));
  }, []);

  const handleResetOverrides = useCallback(() => {
    setCustomOverrides({});
  }, []);

  const customCount = Object.keys(customOverrides).length;
  const immediateCustomCount = Object.keys(immediateOverrides).length;

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
        <CardTitle className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Car className="h-5 w-5 text-[#FF385C]" />
            Trip Transportation
          </div>
          <div className="flex gap-2 flex-wrap">
            {segments.filter(s => s.status === 'covered').length > 0 && (
              <Badge variant="outline" data-testid="badge-covered-count">
                <Check className="h-3 w-3 mr-1" />
                {segments.filter(s => s.status === 'covered').length} covered
              </Badge>
            )}
            <Badge variant="outline" data-testid="badge-needs-count">
              <AlertCircle className="h-3 w-3 mr-1" />
              {needsTransportSegments.length} legs
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {needsTransportSegments.length > 0 && (
          <div className="space-y-3" data-testid="immediate-legs-section">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-sm">Select Transport per Leg</h4>
                <Badge variant="outline">
                  <Pencil className="h-3 w-3 mr-1" />
                  {needsTransportSegments.length} leg{needsTransportSegments.length !== 1 ? "s" : ""}
                </Badge>
              </div>
              {immediateCustomCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setImmediateOverrides({})}
                  data-testid="button-reset-immediate"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Reset {immediateCustomCount} change{immediateCustomCount !== 1 ? "s" : ""}
                </Button>
              )}
            </div>

            <div className="space-y-2">
              {needsTransportSegments.map((seg) => {
                const selectedMode = immediateOverrides[seg.id] || "rideshare";
                const costEst = getImmediateCostEstimate(selectedMode);
                const timeMin = IMMEDIATE_MODE_TIME_MIN[selectedMode] ?? 25;
                const isChanged = immediateOverrides[seg.id] !== undefined;
                return (
                  <div
                    key={seg.id}
                    className={cn(
                      "border rounded-md p-3 space-y-2",
                      isChanged
                        ? "border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-700"
                        : "bg-muted/20"
                    )}
                    data-testid={`immediate-leg-${seg.id}`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 text-sm min-w-0">
                        {getLocationIcon(seg.from.type)}
                        <span className="truncate max-w-[110px] font-medium">{seg.from.name}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                        {getLocationIcon(seg.to.type)}
                        <span className="truncate max-w-[110px] font-medium">{seg.to.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {seg.date && (
                          <span className="text-xs text-muted-foreground hidden sm:inline">{seg.date}</span>
                        )}
                        <Select
                          value={selectedMode}
                          onValueChange={(val) => handleImmediateModeChange(seg, val)}
                        >
                          <SelectTrigger
                            className="w-[160px] h-8 text-xs"
                            data-testid={`select-immediate-mode-${seg.id}`}
                          >
                            <span className="flex items-center gap-1.5">
                              {getModeIcon(selectedMode)}
                              <span>{TRANSPORT_MODES.find(m => m.value === selectedMode)?.label ?? selectedMode}</span>
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            {TRANSPORT_MODES.map(m => (
                              <SelectItem key={m.value} value={m.value}>
                                <span className="flex items-center gap-1.5">
                                  <m.icon className="h-3 w-3" />
                                  {m.label}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        {costEst === 0 ? "Free" : `~$${costEst}`}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        ~{timeMin} min
                      </span>
                      {isChanged && (
                        <Badge variant="outline" className="text-xs h-5 border-amber-300 text-amber-700 dark:text-amber-400">
                          Customized
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {totalImmediateCost !== null && (
              <div className="p-3 rounded-md bg-muted/30 border border-border flex items-center justify-between gap-2">
                <span className="text-sm font-medium flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                  Estimated Transport Cost
                </span>
                <span className="text-sm font-bold">
                  {totalImmediateCost === 0 ? "Free" : `~$${totalImmediateCost}`}
                </span>
              </div>
            )}

            {!generateMutation.isPending && (
              <div className="pt-1 flex items-center gap-3 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => generateMutation.mutate()}
                  data-testid="button-generate-packages"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Get AI Package Recommendations
                </Button>
                <span className="text-xs text-muted-foreground">
                  Analyzes all {needsTransportSegments.length} legs and suggests optimal packages
                </span>
              </div>
            )}
          </div>
        )}

        {generateMutation.isPending && (
          <div className="py-8 space-y-4" data-testid="transport-loading">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-[#FF385C]" />
              <p className="font-medium">Analyzing {needsTransportSegments.length} transport legs...</p>
              <p className="text-sm text-muted-foreground mt-1">Building personalized transport packages for {destination}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[1, 2, 3].map(i => (
                <Card key={i} className="border-dashed">
                  <CardContent className="p-4 space-y-3">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-4 w-16" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {generateMutation.isError && (
          <div className="text-center py-6 space-y-3" data-testid="transport-error">
            <AlertCircle className="h-10 w-10 mx-auto text-destructive" />
            <p className="text-sm text-destructive">Failed to generate transport packages. Please try again.</p>
            <Button variant="outline" onClick={() => generateMutation.mutate()} data-testid="button-retry-packages">
              <RotateCcw className="h-4 w-4 mr-2" /> Retry
            </Button>
          </div>
        )}

        {packagesGenerated && packages.length > 0 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3" data-testid="transport-packages">
              {packages.map((pkg) => {
                const isSelected = selectedPackageId === pkg.id;
                return (
                  <Card
                    key={pkg.id}
                    className={cn(
                      "cursor-pointer transition-all relative",
                      isSelected
                        ? "ring-2 ring-[#FF385C] border-[#FF385C]"
                        : "hover-elevate"
                    )}
                    onClick={() => {
                      setSelectedPackageId(pkg.id);
                      setCustomOverrides({});
                    }}
                    data-testid={`transport-package-${pkg.id}`}
                  >
                    {isSelected && (
                      <div className="absolute -top-2.5 left-3">
                        <Badge className="bg-[#FF385C] text-white border-0">Selected</Badge>
                      </div>
                    )}
                    <CardContent className="p-4 pt-5 space-y-3">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "p-1.5 rounded-md",
                          pkg.id === 'private' ? "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" :
                          pkg.id === 'public' ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" :
                          "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                        )}>
                          {getPackageIcon(pkg.icon)}
                        </div>
                        <div>
                          <h4 className="font-semibold text-sm">{pkg.name}</h4>
                          <p className="text-xs text-muted-foreground">{pkg.bestFor}</p>
                        </div>
                      </div>

                      <p className="text-xs text-muted-foreground leading-relaxed">{pkg.description}</p>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <DollarSign className="h-3.5 w-3.5" /> Cost
                          </span>
                          <span className="font-semibold">${pkg.totalCost.min}–${pkg.totalCost.max}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" /> Travel Time
                          </span>
                          <span className="font-medium">{pkg.totalTime}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <Star className="h-3.5 w-3.5" /> Convenience
                          </span>
                          <span className={cn("font-medium", getConvenienceColor(pkg.convenience))}>
                            {pkg.convenience}/100
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <Leaf className="h-3.5 w-3.5" /> Eco Score
                          </span>
                          <span className={cn("font-medium", getConvenienceColor(pkg.ecoScore))}>
                            {pkg.ecoScore}/100
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {selectedPackage && (
              <div className="mt-4 space-y-3" data-testid="transport-leg-details">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-sm">Leg-by-Leg Breakdown</h4>
                    <Badge variant="outline">
                      <Pencil className="h-3 w-3 mr-1" />
                      Customize per leg
                    </Badge>
                  </div>
                  {customCount > 0 && (
                    <Button variant="ghost" size="sm" onClick={handleResetOverrides} data-testid="button-reset-overrides">
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Reset {customCount} change{customCount > 1 ? 's' : ''}
                    </Button>
                  )}
                </div>

                <div className="space-y-2">
                  {effectiveLegs.map((leg, idx) => {
                    const segment = segments.find(s => s.id === leg.segmentId);
                    if (!segment) return null;
                    const isCustomized = (leg as any).isCustomized;
                    return (
                      <div
                        key={leg.segmentId}
                        className={cn(
                          "border rounded-md p-3 space-y-2",
                          isCustomized ? "border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-700" : "bg-muted/20"
                        )}
                        data-testid={`transport-leg-${leg.segmentId}`}
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 text-sm min-w-0">
                            {getLocationIcon(segment.from.type)}
                            <span className="truncate max-w-[120px] font-medium">{segment.from.name}</span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                            {getLocationIcon(segment.to.type)}
                            <span className="truncate max-w-[120px] font-medium">{segment.to.name}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {segment.date && (
                              <span className="text-xs text-muted-foreground">{segment.date}</span>
                            )}
                            <Select
                              value={customOverrides[leg.segmentId] || leg.mode}
                              onValueChange={(val) => handleOverrideLeg(leg.segmentId, val)}
                            >
                              <SelectTrigger className="w-[150px] h-8 text-xs" data-testid={`select-mode-${leg.segmentId}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {TRANSPORT_MODES.map(m => (
                                  <SelectItem key={m.value} value={m.value}>
                                    <span className="flex items-center gap-1.5">
                                      <m.icon className="h-3 w-3" />
                                      {m.label}
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            {getModeIcon(leg.mode)}
                            {leg.provider}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {leg.estimatedDuration}
                          </span>
                          <span className="flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />
                            ${leg.estimatedCost.min}–${leg.estimatedCost.max}
                          </span>
                          {isCustomized && (
                            <Badge variant="outline" className="text-xs h-5">
                              Customized
                            </Badge>
                          )}
                        </div>
                        {leg.notes && (
                          <p className="text-xs text-muted-foreground">{leg.notes}</p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {customCount > 0 && derivedTotals && selectedPackage && (
                  <div className="mt-3 p-3 rounded-md bg-muted/30 border border-border" data-testid="transport-custom-totals">
                    <div className="flex items-center justify-between gap-4 flex-wrap text-sm">
                      <span className="font-medium">Updated Estimate</span>
                      <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1.5">
                          <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="line-through text-muted-foreground text-xs">
                            ${selectedPackage.totalCost.min}–${selectedPackage.totalCost.max}
                          </span>
                          <span className="font-semibold">${derivedTotals.min}–${derivedTotals.max}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-2 flex-wrap">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPackagesGenerated(false);
                  setSelectedPackageId(null);
                  setCustomOverrides({});
                  generateMutation.reset();
                }}
                data-testid="button-regenerate"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Regenerate Packages
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(`https://12go.asia/en?z=13805109&curr=USD&departcity=${encodeURIComponent(destination)}`, '_blank')}
                data-testid="button-browse-12go"
              >
                Browse 12Go Transportation <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </>
        )}

        {segments.filter(s => s.status === 'covered').length > 0 && !packagesGenerated && (
          <div className="space-y-2 pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Already Covered</p>
            {segments.filter(s => s.status === 'covered').map(seg => (
              <div
                key={seg.id}
                className="flex items-center gap-2 p-2.5 rounded-md bg-green-50/50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-sm"
                data-testid={`transport-covered-${seg.id}`}
              >
                <Check className="h-4 w-4 text-green-600 shrink-0" />
                {getLocationIcon(seg.from.type)}
                <span className="truncate">{seg.from.name}</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                {getLocationIcon(seg.to.type)}
                <span className="truncate">{seg.to.name}</span>
                <span className="ml-auto text-xs text-green-600 shrink-0">{seg.coveredBy}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
