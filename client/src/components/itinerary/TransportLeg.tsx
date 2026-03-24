import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { MapPin, ExternalLink, RotateCcw, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  TRANSPORT_MODE_ICONS,
  TRANSPORT_MODE_LABELS,
  openInMaps,
  detectMapsPlatform,
} from "@/lib/maps-platform";
import { cn } from "@/lib/utils";

export interface TransportAlternative {
  mode: string;
  durationMinutes: number;
  costUsd: number | null;
  energyCost: number;
  reason: string;
}

export interface TransportLegData {
  id: string;
  legOrder: number;
  fromName: string;
  toName: string;
  recommendedMode: string;
  userSelectedMode: string | null;
  distanceDisplay: string;
  distanceMeters?: number;
  estimatedDurationMinutes: number;
  estimatedCostUsd: number | null;
  energyCost?: number;
  alternativeModes?: TransportAlternative[];
  linkedProductUrl?: string | null;
  fromLat?: number | null;
  fromLng?: number | null;
  toLat?: number | null;
  toLng?: number | null;
}

interface TransportLegProps {
  leg: TransportLegData;
  readOnly?: boolean;
  shareToken?: string;
  dayNumber?: number;
  className?: string;
  onModeChangeSuccess?: (legId: string, timeDiffMinutes: number) => void;
}

export function TransportLeg({ leg, readOnly = false, shareToken, dayNumber, className, onModeChangeSuccess }: TransportLegProps) {
  const { toast } = useToast();
  const activeMode = leg.userSelectedMode || leg.recommendedMode;
  const [currentMode, setCurrentMode] = useState(activeMode);
  const [displayDuration, setDisplayDuration] = useState(leg.estimatedDurationMinutes);
  const [displayCost, setDisplayCost] = useState(leg.estimatedCostUsd);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const isCustomized = leg.userSelectedMode !== null && leg.userSelectedMode !== leg.recommendedMode;

  const updateModeMutation = useMutation({
    mutationFn: async (selectedMode: string) => {
      return apiRequest("PATCH", `/api/transport-legs/${leg.id}/mode`, { selectedMode, shareToken });
    },
    onSuccess: (data: any, selectedMode) => {
      setCurrentMode(selectedMode);
      const updatedLeg = data?.updatedLeg || data?.leg;
      if (updatedLeg?.estimatedDurationMinutes !== undefined) {
        setDisplayDuration(updatedLeg.estimatedDurationMinutes);
      }
      if (updatedLeg?.estimatedCostUsd !== undefined) {
        setDisplayCost(updatedLeg.estimatedCostUsd);
      }
      setDropdownOpen(false);

      if (shareToken) {
        queryClient.invalidateQueries({ queryKey: ["/api/itinerary-share", shareToken] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/itinerary-share"] });
      }

      // Calculate time difference for downstream cascading
      const originalDuration = leg.estimatedDurationMinutes;
      const newDuration = updatedLeg?.estimatedDurationMinutes || originalDuration;
      const timeDiff = originalDuration - newDuration;

      // Show time impact in toast message
      let message = `Switched to ${TRANSPORT_MODE_LABELS[selectedMode] || selectedMode}`;
      if (timeDiff !== 0) {
        message = `Switched to ${TRANSPORT_MODE_LABELS[selectedMode] || selectedMode} — ${timeDiff > 0 ? 'saves' : 'adds'} ${Math.abs(timeDiff)} min`;
      }
      toast({ title: "Transport updated", description: message });

      // Notify parent of time change for cascading updates
      if (onModeChangeSuccess) {
        onModeChangeSuccess(leg.id, timeDiff);
      }
    },
    onError: () => {
      toast({ title: "Update failed", description: "Could not change transport mode", variant: "destructive" });
    },
  });

  const handleReset = () => {
    updateModeMutation.mutate(leg.recommendedMode);
  };

  const handleOpenLegInMaps = () => {
    if (!leg.fromLat || !leg.fromLng || !leg.toLat || !leg.toLng) return;
    const platform = detectMapsPlatform();
    const mode = currentMode;
    let url: string;
    if (platform === "apple") {
      url = `maps://?saddr=${leg.fromLat},${leg.fromLng}&daddr=${leg.toLat},${leg.toLng}&dirflg=${getAppleFlag(mode)}`;
    } else {
      url = `https://www.google.com/maps/dir/?api=1&origin=${leg.fromLat},${leg.fromLng}&destination=${leg.toLat},${leg.toLng}&travelmode=${getGoogleMode(mode)}`;
    }
    openInMaps(url);
  };

  const handleNavigateViaApi = () => {
    if (!shareToken || !dayNumber) return;
    const platform = detectMapsPlatform();
    window.open(
      `/api/itinerary-share/${shareToken}/navigate/${dayNumber}/${leg.legOrder}?platform=${platform}`,
      "_blank"
    );
  };

  const modeIcon = TRANSPORT_MODE_ICONS[currentMode] || "🚌";
  const modeLabel = TRANSPORT_MODE_LABELS[currentMode] || currentMode;
  const alternatives = leg.alternativeModes || [];

  return (
    <div className={cn("flex gap-3 py-2 px-3", className)} data-testid={`transport-leg-${leg.legOrder}`}>
      <div className="flex flex-col items-center">
        <div className="w-0.5 flex-1 bg-dashed border-l-2 border-dashed border-muted-foreground/30" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base">{modeIcon}</span>
          <span className="text-sm font-medium text-foreground">{modeLabel}</span>
          <span className="text-sm text-muted-foreground">•</span>
          <span className="text-sm text-muted-foreground" data-testid={`leg-duration-${leg.legOrder}`}>{displayDuration} min</span>
          {displayCost !== null && displayCost !== undefined && displayCost > 0 && (
            <>
              <span className="text-sm text-muted-foreground">•</span>
              <span className="text-sm text-muted-foreground" data-testid={`leg-cost-${leg.legOrder}`}>${displayCost.toFixed(2)}</span>
            </>
          )}
          {(displayCost === null || displayCost === 0) && (
            <>
              <span className="text-sm text-muted-foreground">•</span>
              <span className="text-sm text-green-600 dark:text-green-400">Free</span>
            </>
          )}
          <span className="text-sm text-muted-foreground">•</span>
          <span className="text-sm text-muted-foreground">{leg.distanceDisplay}</span>
        </div>

        {!readOnly && alternatives.length > 0 && (
          <div className="flex gap-2 items-center mt-2 flex-wrap">
            <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={updateModeMutation.isPending}
                  className="text-xs h-auto py-1"
                  data-testid="button-transport-mode-selector"
                >
                  <span className="mr-1.5">{TRANSPORT_MODE_ICONS[currentMode] || "🚌"}</span>
                  {TRANSPORT_MODE_LABELS[currentMode] || currentMode}
                  <span className="text-muted-foreground ml-1.5">▼</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                {alternatives.map((alt) => {
                  const isRecommended = alt.mode === leg.recommendedMode;
                  const isSelected = currentMode === alt.mode;
                  return (
                    <DropdownMenuItem
                      key={alt.mode}
                      onClick={() => updateModeMutation.mutate(alt.mode)}
                      disabled={updateModeMutation.isPending}
                      className="flex flex-col gap-1 py-2 cursor-pointer"
                      data-testid={`transport-mode-${alt.mode}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">{TRANSPORT_MODE_ICONS[alt.mode] || "🚌"}</span>
                        <span className="font-medium text-sm">
                          {TRANSPORT_MODE_LABELS[alt.mode] || alt.mode}
                        </span>
                        {isSelected && (
                          <Badge variant="secondary" className="text-xs ml-auto">
                            {isRecommended ? "Recommended" : "Selected"}
                          </Badge>
                        )}
                        {isRecommended && !isSelected && (
                          <Badge variant="outline" className="text-xs ml-auto">
                            Recommended
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-3 text-xs text-muted-foreground ml-6">
                        <span>{alt.durationMinutes} min</span>
                        {alt.costUsd !== null && alt.costUsd !== undefined && (
                          <span>${alt.costUsd.toFixed(2)}</span>
                        )}
                        {(alt.costUsd === null || alt.costUsd === 0) && (
                          <span className="text-green-600 dark:text-green-400">Free</span>
                        )}
                      </div>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            {isCustomized && (
              <>
                <Badge variant="secondary" className="bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                  Customized
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  disabled={updateModeMutation.isPending}
                  className="h-auto py-1 px-2 text-xs"
                  data-testid="button-reset-transport"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Reset
                </Button>
              </>
            )}
          </div>
        )}

        <div className="flex gap-2 mt-1.5 flex-wrap">
          {(leg.fromLat && leg.fromLng && leg.toLat && leg.toLng) && (
            <button
              onClick={handleOpenLegInMaps}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
              data-testid="button-open-leg-maps"
            >
              <MapPin className="h-3 w-3" />
              Open leg in Maps
            </button>
          )}
          {leg.linkedProductUrl && (
            <a
              href={leg.linkedProductUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
              data-testid="link-book-transport"
            >
              <ExternalLink className="h-3 w-3" />
              Book transport
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function getAppleFlag(mode: string): string {
  const flags: Record<string, string> = {
    walk: "w", transit: "r", train: "r", tram: "r", bus: "r",
    taxi: "d", rideshare: "d", private_driver: "d", rental_car: "d",
    bike: "c", ferry: "r", auto_rickshaw: "d", tuk_tuk: "d", cable_car: "w",
  };
  return flags[mode] || "r";
}

function getGoogleMode(mode: string): string {
  const modes: Record<string, string> = {
    walk: "walking", transit: "transit", train: "transit", tram: "transit", bus: "transit",
    taxi: "driving", rideshare: "driving", private_driver: "driving", rental_car: "driving",
    bike: "bicycling", ferry: "transit", auto_rickshaw: "driving", tuk_tuk: "driving", cable_car: "walking",
  };
  return modes[mode] || "transit";
}
