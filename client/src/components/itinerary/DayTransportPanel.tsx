import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Car,
  Train,
  Bus,
  Bike,
  FootprintsIcon,
  Ship,
  MapPin,
  Clock,
  DollarSign,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Navigation,
  ArrowRight,
  CheckCircle2,
  Info,
} from "lucide-react";
import {
  TRANSPORT_MODE_ICONS,
  TRANSPORT_MODE_LABELS,
  openInMaps,
  detectMapsPlatform,
} from "@/lib/maps-platform";
import { cn } from "@/lib/utils";
import type { InlineTransportLegData } from "./InlineTransportSelector";

const ENHANCED_MODES = [
  { mode: "private_driver", label: "Private Car", icon: Car, description: "Door-to-door private driver" },
  { mode: "rental_car", label: "Car Rental", icon: Car, description: "Self-drive rental vehicle" },
  { mode: "rideshare", label: "Rideshare", icon: Car, description: "Uber, Lyft, or local equivalent" },
  { mode: "taxi", label: "Taxi", icon: Car, description: "Metered taxi service" },
  { mode: "transit", label: "Public Transit", icon: Train, description: "Metro, bus, tram via Google Transit" },
  { mode: "train", label: "Train", icon: Train, description: "Rail service" },
  { mode: "bus", label: "Bus", icon: Bus, description: "City or intercity bus" },
  { mode: "walk", label: "Walking", icon: FootprintsIcon, description: "Walk to destination" },
  { mode: "bike", label: "Cycling", icon: Bike, description: "Bike rental or cycling" },
  { mode: "ferry", label: "Ferry", icon: Ship, description: "Water transport" },
];

function getGoogleMode(mode: string): string {
  const modes: Record<string, string> = {
    walk: "walking", transit: "transit", train: "transit", tram: "transit", bus: "transit",
    taxi: "driving", rideshare: "driving", private_driver: "driving", rental_car: "driving",
    bike: "bicycling", ferry: "transit",
  };
  return modes[mode] || "transit";
}

function getAppleFlag(mode: string): string {
  const flags: Record<string, string> = {
    walk: "w", transit: "r", train: "r", tram: "r", bus: "r",
    taxi: "d", rideshare: "d", private_driver: "d", rental_car: "d",
    bike: "c", ferry: "r",
  };
  return flags[mode] || "r";
}

function formatCost(cost: number | null): string {
  if (cost === null || cost === undefined || cost === 0) return "Free";
  return `$${cost.toFixed(0)}`;
}

function isTransitMode(mode: string): boolean {
  return ["transit", "train", "tram", "bus", "ferry"].includes(mode);
}

function getModeColor(mode: string): string {
  const m = mode?.toLowerCase() || "";
  if (m.includes("walk") || m.includes("foot")) return "border-green-300 bg-green-50 dark:bg-green-950/20";
  if (m.includes("train") || m.includes("rail") || m.includes("metro")) return "border-blue-300 bg-blue-50 dark:bg-blue-950/20";
  if (m.includes("bus") || m.includes("transit")) return "border-purple-300 bg-purple-50 dark:bg-purple-950/20";
  if (m.includes("bike") || m.includes("cycling")) return "border-teal-300 bg-teal-50 dark:bg-teal-950/20";
  if (m.includes("boat") || m.includes("ferry")) return "border-cyan-300 bg-cyan-50 dark:bg-cyan-950/20";
  if (m.includes("private") || m.includes("rental")) return "border-amber-300 bg-amber-50 dark:bg-amber-950/20";
  return "border-orange-300 bg-orange-50 dark:bg-orange-950/20";
}

interface DayTransportPanelProps {
  dayNumber: number;
  legs: InlineTransportLegData[];
  readOnly?: boolean;
  tripId?: string;
  shareToken?: string;
  destination?: string;
  isExpertMode?: boolean;
  onModeChange?: (legId: string, newMode: string, originalMode: string) => void;
  onModeChangeSuccess?: (legId: string, timeDiffMinutes: number) => void;
}

export function DayTransportPanel({
  dayNumber,
  legs,
  readOnly = false,
  tripId,
  shareToken,
  destination,
  isExpertMode = false,
  onModeChange,
  onModeChangeSuccess,
}: DayTransportPanelProps) {
  if (!legs || legs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4 text-center" data-testid={`transport-panel-empty-day-${dayNumber}`}>
        <div className="p-4 rounded-full bg-gray-100 dark:bg-gray-800">
          <Navigation className="w-8 h-8 text-gray-400" />
        </div>
        <div>
          <h4 className="text-base font-semibold text-gray-900 dark:text-white mb-1">No transport legs</h4>
          <p className="text-sm text-gray-500 max-w-xs">
            Transport legs will appear once activities with locations are added.
          </p>
        </div>
      </div>
    );
  }

  const totalMinutes = legs.reduce((s, l) => s + (l.estimatedDurationMinutes || 0), 0);
  const totalCost = legs.reduce((s, l) => s + (l.estimatedCostUsd || 0), 0);

  return (
    <div className="space-y-3" data-testid={`transport-panel-day-${dayNumber}`}>
      <div className="flex items-center gap-4 px-1 py-2">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span className="font-medium">{totalMinutes} min total transit</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <DollarSign className="h-3.5 w-3.5" />
          <span className="font-medium">{formatCost(totalCost)}</span>
        </div>
        <Badge variant="outline" className="text-xs">
          {legs.length} leg{legs.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      <div className="space-y-2">
        {legs.map((leg) => (
          <TransportLegCard
            key={leg.id}
            leg={leg}
            readOnly={readOnly}
            tripId={tripId}
            shareToken={shareToken}
            destination={destination}
            isExpertMode={isExpertMode}
            onModeChange={onModeChange}
            onModeChangeSuccess={onModeChangeSuccess}
          />
        ))}
      </div>
    </div>
  );
}

function TransportLegCard({
  leg,
  readOnly,
  tripId,
  shareToken,
  destination,
  isExpertMode,
  onModeChange,
  onModeChangeSuccess,
}: {
  leg: InlineTransportLegData;
  readOnly?: boolean;
  tripId?: string;
  shareToken?: string;
  destination?: string;
  isExpertMode?: boolean;
  onModeChange?: (legId: string, newMode: string, originalMode: string) => void;
  onModeChangeSuccess?: (legId: string, timeDiffMinutes: number) => void;
}) {
  const { toast } = useToast();
  const originalMode = leg.userSelectedMode || leg.recommendedMode;
  const [currentMode, setCurrentMode] = useState(originalMode);
  const [displayDuration, setDisplayDuration] = useState(leg.estimatedDurationMinutes);
  const [displayCost, setDisplayCost] = useState(leg.estimatedCostUsd);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const incoming = leg.userSelectedMode || leg.recommendedMode;
    setCurrentMode(incoming);
    setDisplayDuration(leg.estimatedDurationMinutes);
    setDisplayCost(leg.estimatedCostUsd);
  }, [leg.userSelectedMode, leg.recommendedMode, leg.estimatedDurationMinutes, leg.estimatedCostUsd]);

  const isSynthesizedLeg = leg.id.startsWith("synth-");

  const allModes = [
    {
      mode: leg.recommendedMode,
      durationMinutes: leg.estimatedDurationMinutes,
      costUsd: leg.estimatedCostUsd,
      reason: "Recommended",
      isRecommended: true,
    },
    ...(leg.alternativeModes || []).map((a) => ({
      ...a,
      isRecommended: false,
    })),
  ];

  const enhancedModes = ENHANCED_MODES.map(em => {
    const existing = allModes.find(m => m.mode === em.mode);
    if (existing) {
      return { ...em, ...existing, available: true };
    }
    return { ...em, durationMinutes: 0, costUsd: null, reason: "", available: false, isRecommended: false };
  }).filter(em => em.available || ["private_driver", "rental_car", "rideshare", "transit", "walk", "bike"].includes(em.mode));

  const updateModeMutation = useMutation({
    mutationFn: async (selectedMode: string) => {
      if (isExpertMode || isSynthesizedLeg) {
        return { localOnly: true, selectedMode };
      }
      return apiRequest("PATCH", `/api/transport-legs/${leg.id}/mode`, { selectedMode, shareToken });
    },
    onMutate: (selectedMode) => {
      const prev = currentMode;
      setCurrentMode(selectedMode);
      const modeData = allModes.find((m) => m.mode === selectedMode);
      if (modeData) {
        setDisplayDuration(modeData.durationMinutes);
        setDisplayCost(modeData.costUsd ?? null);
      }
      return { prev };
    },
    onSuccess: (data: any, selectedMode) => {
      if (isExpertMode) {
        onModeChange?.(leg.id, selectedMode, originalMode);
        return;
      }

      if (data?.localOnly) {
        const modeLabel = TRANSPORT_MODE_LABELS[selectedMode] || selectedMode;
        toast({ title: `Switched to ${modeLabel}`, description: "Preference saved for this session" });
        return;
      }

      const updatedLeg = data?.updatedLeg || data?.leg;
      if (updatedLeg?.estimatedDurationMinutes !== undefined) {
        setDisplayDuration(updatedLeg.estimatedDurationMinutes);
      }
      if (updatedLeg?.estimatedCostUsd !== undefined) {
        setDisplayCost(updatedLeg.estimatedCostUsd);
      }

      if (tripId) {
        queryClient.invalidateQueries({ queryKey: ["/api/itinerary", tripId, "transport-hub"] });
      }
      if (shareToken) {
        queryClient.invalidateQueries({ queryKey: ["/api/itinerary-share", shareToken] });
      }

      const impact = data?.downstreamImpact;
      const modeLabel = TRANSPORT_MODE_LABELS[selectedMode] || selectedMode;
      if (impact?.message) {
        toast({ title: `Switched to ${modeLabel}`, description: impact.message });
      } else {
        toast({ title: "Transport updated", description: `Switched to ${modeLabel}` });
      }

      if (onModeChangeSuccess && impact?.nextActivityStartTimeShift !== undefined) {
        onModeChangeSuccess(leg.id, impact.nextActivityStartTimeShift);
      }

      onModeChange?.(leg.id, selectedMode, originalMode);
    },
    onError: (_err, _mode, context: any) => {
      if (context?.prev) {
        setCurrentMode(context.prev);
        const modeData = allModes.find((m) => m.mode === context.prev);
        if (modeData) {
          setDisplayDuration(modeData.durationMinutes);
          setDisplayCost(modeData.costUsd ?? null);
        }
      }
      toast({ title: "Update failed", description: "Could not change transport mode", variant: "destructive" });
    },
  });

  const handleModeSelect = (mode: string) => {
    if (readOnly || updateModeMutation.isPending) return;
    if (mode === currentMode) return;
    updateModeMutation.mutate(mode);
  };

  const handleOpenInMaps = () => {
    if (!leg.fromLat || !leg.fromLng || !leg.toLat || !leg.toLng) return;
    const platform = detectMapsPlatform();
    let url: string;
    if (platform === "apple") {
      url = `maps://?saddr=${leg.fromLat},${leg.fromLng}&daddr=${leg.toLat},${leg.toLng}&dirflg=${getAppleFlag(currentMode)}`;
    } else {
      url = `https://www.google.com/maps/dir/?api=1&origin=${leg.fromLat},${leg.fromLng}&destination=${leg.toLat},${leg.toLng}&travelmode=${getGoogleMode(currentMode)}`;
    }
    openInMaps(url);
  };

  const isCustomized = currentMode !== leg.recommendedMode;
  const modeIcon = TRANSPORT_MODE_ICONS[currentMode] || "🚌";
  const modeLabel = TRANSPORT_MODE_LABELS[currentMode] || currentMode;

  const twelveGoUrl = destination
    ? `https://12go.co/en/travel/${encodeURIComponent(leg.fromName.toLowerCase().replace(/\s+/g, '-'))}/${encodeURIComponent(leg.toName.toLowerCase().replace(/\s+/g, '-'))}?affiliate_id=13805109`
    : null;

  return (
    <Card className={cn("border transition-all", getModeColor(currentMode))} data-testid={`transport-leg-card-${leg.legOrder}`}>
      <CardContent className="p-0">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors rounded-t-xl"
          data-testid={`button-expand-leg-${leg.legOrder}`}
        >
          <div className="text-2xl leading-none">{modeIcon}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {leg.fromName}
              </span>
              <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {leg.toName}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
              <span className="font-medium">{modeLabel}</span>
              <span>·</span>
              <span>{displayDuration} min</span>
              <span>·</span>
              <span className={displayCost === 0 || displayCost === null ? "text-green-600 dark:text-green-400" : ""}>
                {formatCost(displayCost)}
              </span>
              {leg.distanceDisplay && (
                <>
                  <span>·</span>
                  <span>{leg.distanceDisplay}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isCustomized && (
              <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 text-xs">
                Customized
              </Badge>
            )}
            {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </button>

        {isExpanded && (
          <div className="px-4 pb-4 space-y-3 border-t border-gray-200/60 dark:border-gray-700/60 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Select Transport Mode</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {enhancedModes.map((em) => {
                const selected = currentMode === em.mode;
                const Icon = em.icon;
                const modeData = allModes.find(m => m.mode === em.mode);
                const duration = modeData?.durationMinutes || em.durationMinutes;
                const cost = modeData?.costUsd ?? em.costUsd;

                return (
                  <button
                    key={em.mode}
                    onClick={() => em.available ? handleModeSelect(em.mode) : undefined}
                    disabled={!em.available || readOnly || updateModeMutation.isPending}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-left",
                      selected
                        ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                        : em.available
                          ? "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
                          : "border-gray-100 dark:border-gray-800 opacity-50 cursor-not-allowed",
                    )}
                    data-testid={`mode-select-${leg.legOrder}-${em.mode}`}
                  >
                    <div className={cn(
                      "p-1.5 rounded-md",
                      selected ? "bg-primary/20 text-primary" : "bg-gray-100 dark:bg-gray-800 text-gray-500"
                    )}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={cn("text-sm font-medium", selected && "text-primary")}>{em.label}</span>
                        {em.isRecommended && (
                          <Badge variant="secondary" className="text-[10px] h-4 px-1 py-0">Best</Badge>
                        )}
                        {selected && <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />}
                      </div>
                      {em.available && duration > 0 ? (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {duration} min · {formatCost(cost)}
                          {modeData?.reason && !em.isRecommended ? ` · ${modeData.reason}` : ""}
                        </p>
                      ) : !em.available ? (
                        <p className="text-xs text-muted-foreground mt-0.5 italic">{em.description}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-0.5">{em.description}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {isTransitMode(currentMode) && (
              <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-3 space-y-2" data-testid={`transit-details-${leg.legOrder}`}>
                <div className="flex items-center gap-2">
                  <Train className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-800 dark:text-blue-200">Public Transit Details</span>
                </div>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  Route: {leg.fromName} → {leg.toName}
                </p>
                <div className="flex items-center gap-3 text-xs text-blue-600 dark:text-blue-400">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> ~{displayDuration} min
                  </span>
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-3 w-3" /> {formatCost(displayCost)}
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <Info className="h-3 w-3 text-blue-500" />
                  <span className="text-xs text-blue-600 dark:text-blue-400 italic">
                    Real-time schedules available via Google Transit
                  </span>
                </div>
                {(leg.fromLat && leg.toLat) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/30"
                    onClick={handleOpenInMaps}
                    data-testid={`button-transit-maps-${leg.legOrder}`}
                  >
                    <Navigation className="h-3 w-3" />
                    View Transit Route in {detectMapsPlatform() === "apple" ? "Apple Maps" : "Google Maps"}
                  </Button>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1 flex-wrap">
              {(leg.fromLat && leg.toLat) && !isTransitMode(currentMode) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7 gap-1.5"
                  onClick={handleOpenInMaps}
                  data-testid={`button-maps-leg-${leg.legOrder}`}
                >
                  <MapPin className="h-3 w-3" />
                  Open in Maps
                </Button>
              )}

              {["private_driver", "rental_car", "taxi", "rideshare"].includes(currentMode) && twelveGoUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7 gap-1.5 border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-300 dark:hover:bg-green-900/30"
                  onClick={() => window.open(twelveGoUrl, '_blank', 'noopener,noreferrer')}
                  data-testid={`button-12go-${leg.legOrder}`}
                >
                  <ExternalLink className="h-3 w-3" />
                  Book via 12Go
                </Button>
              )}

              {["transit", "train", "bus"].includes(currentMode) && twelveGoUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7 gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/30"
                  onClick={() => window.open(twelveGoUrl, '_blank', 'noopener,noreferrer')}
                  data-testid={`button-12go-transit-${leg.legOrder}`}
                >
                  <ExternalLink className="h-3 w-3" />
                  Book Tickets via 12Go
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
