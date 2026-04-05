import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { MapPin, ExternalLink, RotateCcw, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  TRANSPORT_MODE_ICONS,
  TRANSPORT_MODE_LABELS,
} from "@/lib/maps-platform";
import { openInMaps } from "@/lib/navigate";
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
  previewOnly?: boolean;
  onPreviewModeChange?: (legId: string, mode: string) => void;
  shareToken?: string;
  dayNumber?: number;
  className?: string;
  onModeChangeSuccess?: (legId: string, timeDiffMinutes: number) => void;
}


export function TransportLeg({
  leg,
  readOnly = false,
  previewOnly = false,
  onPreviewModeChange,
  shareToken,
  dayNumber,
  className,
  onModeChangeSuccess
}: TransportLegProps) {
  const { toast } = useToast();
  const activeMode = leg.userSelectedMode || leg.recommendedMode;
  const [currentMode, setCurrentMode] = useState(activeMode);
  const [displayDuration, setDisplayDuration] = useState(leg.estimatedDurationMinutes);
  const [displayCost, setDisplayCost] = useState(leg.estimatedCostUsd);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const origDuration = useRef(leg.userSelectedMode ? null : leg.estimatedDurationMinutes);
  const origCost = useRef(leg.userSelectedMode ? null : leg.estimatedCostUsd);

  const isCustomized = currentMode !== leg.recommendedMode;

  const applyMode = (selectedMode: string) => {
    const alt = leg.alternativeModes?.find(a => a.mode === selectedMode);
    setCurrentMode(selectedMode);
    if (alt) {
      setDisplayDuration(alt.durationMinutes);
      setDisplayCost(alt.costUsd ?? null);
    } else if (selectedMode === leg.recommendedMode) {
      setDisplayDuration(leg.estimatedDurationMinutes);
      setDisplayCost(leg.estimatedCostUsd);
    }
    setDropdownOpen(false);
    onPreviewModeChange?.(leg.id, selectedMode);
  };

  const updateModeMutation = useMutation({
    mutationFn: async (selectedMode: string) => {
      return apiRequest("PATCH", `/api/transport-legs/${leg.id}/mode`, { selectedMode, shareToken });
    },
    onSuccess: (data: any, selectedMode) => {
      setCurrentMode(selectedMode);
      const updatedLeg = data?.updatedLeg || data?.leg;
      if (updatedLeg?.estimatedDurationMinutes !== undefined) {
        setDisplayDuration(updatedLeg.estimatedDurationMinutes);
      } else {
        const alt = leg.alternativeModes?.find(a => a.mode === selectedMode);
        if (alt) setDisplayDuration(alt.durationMinutes);
      }
      if (updatedLeg?.estimatedCostUsd !== undefined) {
        setDisplayCost(updatedLeg.estimatedCostUsd);
      } else {
        const alt = leg.alternativeModes?.find(a => a.mode === selectedMode);
        if (alt !== undefined) setDisplayCost(alt?.costUsd ?? null);
      }
      setDropdownOpen(false);

      if (shareToken) {
        queryClient.invalidateQueries({ queryKey: ["/api/itinerary-share", shareToken] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/itinerary-share"] });
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
    },
    onError: () => {
      toast({ title: "Update failed", description: "Could not change transport mode", variant: "destructive" });
    },
  });

  const handleModeSelect = (selectedMode: string) => {
    if (previewOnly) {
      applyMode(selectedMode);
    } else {
      updateModeMutation.mutate(selectedMode);
    }
  };

  const handleReset = () => {
    if (previewOnly) {
      applyMode(leg.recommendedMode);
    } else {
      setCurrentMode(leg.recommendedMode);
      if (origDuration.current !== null) setDisplayDuration(origDuration.current);
      if (origCost.current !== undefined) setDisplayCost(origCost.current);
      updateModeMutation.mutate(leg.recommendedMode);
    }
  };

  const handleOpenLegInMaps = () => {
    if (!leg.fromLat || !leg.fromLng || !leg.toLat || !leg.toLng) return;
    openInMaps({
      origin: { lat: leg.fromLat, lng: leg.fromLng, name: leg.fromName },
      destination: { lat: leg.toLat, lng: leg.toLng, name: leg.toName },
      mode: currentMode,
    });
  };

  const modeIcon = TRANSPORT_MODE_ICONS[currentMode] || "🚌";
  const modeLabel = TRANSPORT_MODE_LABELS[currentMode] || currentMode;
  const alternatives = leg.alternativeModes || [];

  return (
    <div className={cn("flex gap-3 py-2 px-3", className)} data-testid={`transport-leg-${leg.legOrder}`}>
      <div className="flex flex-col items-center pt-1">
        <div className="w-0.5 h-full border-l-2 border-dashed border-muted-foreground/30 min-h-[20px]" />
      </div>
      <div className="flex-1 min-w-0 pb-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base leading-none">{modeIcon}</span>
          <span className="text-sm font-medium">{modeLabel}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-sm text-muted-foreground" data-testid={`leg-duration-${leg.legOrder}`}>
            {displayDuration} min
          </span>
          {displayCost !== null && displayCost !== undefined && displayCost > 0 && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-sm text-muted-foreground" data-testid={`leg-cost-${leg.legOrder}`}>
                ${displayCost.toFixed(0)}
              </span>
            </>
          )}
          {(displayCost === null || displayCost === 0) && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-sm text-green-600 dark:text-green-400">Free</span>
            </>
          )}
          <span className="text-muted-foreground">·</span>
          <span className="text-sm text-muted-foreground">{leg.distanceDisplay}</span>
          {isCustomized && (
            <Badge
              variant="outline"
              className="border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-700 text-xs h-5 px-1.5"
              data-testid={`badge-customized-${leg.legOrder}`}
            >
              Customized
            </Badge>
          )}
        </div>

        {!readOnly && (alternatives.length > 0 || true) && (
          <div className="flex gap-1.5 mt-1.5 flex-wrap items-center">
            {/* Mode Dropdown */}
            <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!previewOnly && updateModeMutation.isPending}
                  className="h-6 px-2 text-xs gap-1"
                  data-testid={`button-transport-mode-dropdown-${leg.legOrder}`}
                >
                  {modeIcon} {modeLabel}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {/* Recommended mode first */}
                <DropdownMenuItem
                  onClick={() => handleModeSelect(leg.recommendedMode)}
                  disabled={!previewOnly && updateModeMutation.isPending}
                  className="cursor-pointer"
                  data-testid={`transport-mode-${leg.recommendedMode}`}
                >
                  <div className="flex items-center justify-between w-full gap-2">
                    <div className="flex items-center gap-2 flex-1">
                      <span>{TRANSPORT_MODE_ICONS[leg.recommendedMode] || "🚌"}</span>
                      <div className="flex-1">
                        <div className="text-sm font-medium">
                          {TRANSPORT_MODE_LABELS[leg.recommendedMode] || leg.recommendedMode}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {leg.estimatedDurationMinutes} min {leg.estimatedCostUsd ? `· $${leg.estimatedCostUsd.toFixed(0)}` : "· Free"}
                        </div>
                      </div>
                    </div>
                    {currentMode === leg.recommendedMode && (
                      <Badge variant="secondary" className="text-xs h-5 px-1.5 shrink-0">
                        Recommended
                      </Badge>
                    )}
                  </div>
                </DropdownMenuItem>

                {/* Alternative modes */}
                {alternatives.map((alt) => (
                  <DropdownMenuItem
                    key={alt.mode}
                    onClick={() => handleModeSelect(alt.mode)}
                    disabled={!previewOnly && updateModeMutation.isPending}
                    className="cursor-pointer"
                    data-testid={`transport-mode-${alt.mode}`}
                  >
                    <div className="flex items-center justify-between w-full gap-2">
                      <div className="flex items-center gap-2 flex-1">
                        <span>{TRANSPORT_MODE_ICONS[alt.mode] || "🚌"}</span>
                        <div className="flex-1">
                          <div className="text-sm font-medium">
                            {TRANSPORT_MODE_LABELS[alt.mode] || alt.mode}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {alt.durationMinutes} min {alt.costUsd ? `· $${alt.costUsd.toFixed(0)}` : "· Free"}
                          </div>
                          {alt.reason && (
                            <div className="text-xs text-muted-foreground italic mt-0.5">
                              {alt.reason}
                            </div>
                          )}
                        </div>
                      </div>
                      {currentMode === alt.mode && (
                        <Badge variant="secondary" className="text-xs h-5 px-1.5 shrink-0">
                          Selected
                        </Badge>
                      )}
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {isCustomized && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                disabled={updateModeMutation.isPending}
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                data-testid={`button-reset-mode-${leg.legOrder}`}
              >
                <RotateCcw className="h-3 w-3" />
                Reset
              </Button>
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
              Open in Maps
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
