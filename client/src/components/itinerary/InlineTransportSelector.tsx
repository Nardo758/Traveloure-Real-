/**
 * InlineTransportSelector Component
 *
 * Shown between activities in the Itinerary tab.
 * Collapsed: single-line pill showing selected mode icon + mode name + duration + cost
 * Expanded: radio button list for all available modes
 *
 * Mode changes are optimistic-updated and synced via PATCH /api/transport-legs/:legId/mode
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronUp, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

export interface InlineTransportLegData {
  id: string;
  legOrder: number;
  fromName: string;
  toName: string;
  recommendedMode: string;
  userSelectedMode: string | null;
  distanceDisplay: string;
  estimatedDurationMinutes: number;
  estimatedCostUsd: number | null;
  alternativeModes?: TransportAlternative[];
  fromLat?: number | null;
  fromLng?: number | null;
  toLat?: number | null;
  toLng?: number | null;
}

interface InlineTransportSelectorProps {
  leg: InlineTransportLegData;
  readOnly?: boolean;
  shareToken?: string;
  tripId?: string;
  className?: string;
  onModeChangeSuccess?: (legId: string, timeDiffMinutes: number) => void;
  onModeChange?: (legId: string, newMode: string, originalMode: string) => void;
  expertChanged?: boolean;
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

function formatCost(cost: number | null): string {
  if (cost === null || cost === undefined) return "Free";
  if (cost === 0) return "Free";
  return `$${cost.toFixed(0)}`;
}

export function InlineTransportSelector({
  leg,
  readOnly = false,
  shareToken,
  tripId,
  className,
  onModeChangeSuccess,
  onModeChange,
  expertChanged = false,
}: InlineTransportSelectorProps) {
  const { toast } = useToast();
  const activeMode = leg.userSelectedMode || leg.recommendedMode;
  const [currentMode, setCurrentMode] = useState(activeMode);
  const [displayDuration, setDisplayDuration] = useState(leg.estimatedDurationMinutes);
  const [displayCost, setDisplayCost] = useState(leg.estimatedCostUsd);
  const [isExpanded, setIsExpanded] = useState(false);

  const isCustomized = currentMode !== leg.recommendedMode;

  const alternatives = leg.alternativeModes || [];

  // All available modes: recommended first, then alternatives
  const allModes = [
    {
      mode: leg.recommendedMode,
      durationMinutes: leg.estimatedDurationMinutes,
      costUsd: leg.estimatedCostUsd,
      reason: "Recommended",
      isRecommended: true,
    },
    ...alternatives.map((a) => ({
      ...a,
      isRecommended: false,
    })),
  ];

  const updateModeMutation = useMutation({
    mutationFn: async (selectedMode: string) => {
      return apiRequest("PATCH", `/api/transport-legs/${leg.id}/mode`, { selectedMode, shareToken });
    },
    onMutate: (selectedMode) => {
      // Optimistic update
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
      const updatedLeg = data?.updatedLeg || data?.leg;
      if (updatedLeg?.estimatedDurationMinutes !== undefined) {
        setDisplayDuration(updatedLeg.estimatedDurationMinutes);
      }
      if (updatedLeg?.estimatedCostUsd !== undefined) {
        setDisplayCost(updatedLeg.estimatedCostUsd);
      }

      setIsExpanded(false);

      // Invalidate transport hub too so both views stay in sync
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

      if (onModeChange) {
        onModeChange(leg.id, selectedMode, activeMode);
      }
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

  const handleModeChange = (mode: string) => {
    if (readOnly || updateModeMutation.isPending) return;
    if (mode === currentMode) {
      setIsExpanded(false);
      return;
    }
    updateModeMutation.mutate(mode);
  };

  const handleOpenLegInMaps = () => {
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

  const modeIcon = TRANSPORT_MODE_ICONS[currentMode] || "🚌";
  const modeLabel = TRANSPORT_MODE_LABELS[currentMode] || currentMode;

  return (
    <div
      className={cn(
        "flex flex-col my-1",
        className
      )}
      data-testid={`inline-transport-selector-${leg.legOrder}`}
    >
      {/* Dashed connector line */}
      <div className="flex items-start gap-2">
        <div className="flex flex-col items-center self-stretch ml-3 mr-2">
          <div className="w-px flex-1 border-l-2 border-dashed border-muted-foreground/30 min-h-[8px]" />
        </div>

        {/* Pill / expanded panel */}
        <div className="flex-1 mb-1">
          {/* Collapsed pill */}
          {!isExpanded ? (
            <div className="flex items-center gap-1">
              <div
                role="button"
                tabIndex={0}
                onClick={() => setIsExpanded(true)}
                onKeyDown={(e) => e.key === "Enter" && setIsExpanded(true)}
                className={cn(
                  "flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border transition-all cursor-pointer",
                  "bg-muted/40 border-muted-foreground/20 text-muted-foreground",
                  "hover:bg-muted/80 hover:border-muted-foreground/40",
                  isCustomized && "border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300"
                )}
                data-testid={`pill-transport-${leg.legOrder}`}
              >
                <span className="text-sm leading-none">{modeIcon}</span>
                <span className="font-medium">{modeLabel}</span>
                <span className="text-muted-foreground/60">·</span>
                <span>{displayDuration} min</span>
                <span className="text-muted-foreground/60">·</span>
                <span className={displayCost === 0 || displayCost === null ? "text-green-600 dark:text-green-400" : ""}>
                  {formatCost(displayCost)}
                </span>
                {isCustomized && (
                  <Badge
                    variant="outline"
                    className="border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-700 text-xs h-4 px-1"
                  >
                    Customized
                  </Badge>
                )}
                {expertChanged && !isCustomized && (
                  <Badge
                    variant="outline"
                    className="border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-700 text-xs h-4 px-1"
                  >
                    Expert edit
                  </Badge>
                )}
                <ChevronDown className="h-3 w-3 ml-1 text-muted-foreground/60" />
              </div>
              {(leg.fromLat && leg.toLat) && (
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); handleOpenLegInMaps(); }}
                  className="text-primary hover:underline flex items-center gap-0.5 text-xs px-1"
                  title={`Open in ${detectMapsPlatform() === "apple" ? "Apple Maps" : "Google Maps"}`}
                  data-testid={`link-maps-${leg.legOrder}`}
                >
                  <MapPin className="h-3 w-3" />
                </a>
              )}
            </div>
          ) : (
            /* Expanded panel */
            <div
              className="rounded-xl border border-muted-foreground/20 bg-card shadow-sm overflow-hidden"
              data-testid={`expanded-transport-${leg.legOrder}`}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-muted-foreground/10">
                <span className="text-xs font-medium text-muted-foreground">
                  {leg.fromName} → {leg.toName}
                </span>
                <button
                  onClick={() => setIsExpanded(false)}
                  className="text-muted-foreground hover:text-foreground"
                  data-testid={`button-collapse-transport-${leg.legOrder}`}
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Mode options */}
              <div className="p-2 space-y-1">
                {allModes.map((option) => {
                  const selected = currentMode === option.mode;
                  const icon = TRANSPORT_MODE_ICONS[option.mode] || "🚌";
                  const label = TRANSPORT_MODE_LABELS[option.mode] || option.mode;
                  return (
                    <label
                      key={option.mode}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors",
                        selected
                          ? "bg-primary/10 border border-primary/30"
                          : "hover:bg-muted/60 border border-transparent",
                        readOnly && "cursor-default opacity-75"
                      )}
                      data-testid={`mode-option-${leg.legOrder}-${option.mode}`}
                    >
                      <input
                        type="radio"
                        name={`transport-leg-${leg.id}`}
                        value={option.mode}
                        checked={selected}
                        onChange={() => handleModeChange(option.mode)}
                        disabled={readOnly || updateModeMutation.isPending}
                        className="accent-primary"
                      />
                      <span className="text-base leading-none">{icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{label}</span>
                          {option.isRecommended && (
                            <Badge
                              variant="secondary"
                              className="text-xs h-4 px-1 py-0"
                            >
                              Recommended
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                          <span>{option.durationMinutes} min</span>
                          <span>·</span>
                          <span className={option.costUsd === 0 || option.costUsd === null ? "text-green-600 dark:text-green-400" : ""}>
                            {formatCost(option.costUsd ?? null)}
                          </span>
                          {!option.isRecommended && option.reason && (
                            <>
                              <span>·</span>
                              <span className="italic truncate">{option.reason}</span>
                            </>
                          )}
                        </div>
                      </div>
                      {selected && (
                        <span className="text-primary text-xs font-medium shrink-0">✓</span>
                      )}
                    </label>
                  );
                })}
              </div>

              {/* Maps link */}
              {(leg.fromLat && leg.toLat) && (
                <div className="px-3 pb-2">
                  <button
                    onClick={handleOpenLegInMaps}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                    data-testid={`button-maps-expanded-${leg.legOrder}`}
                  >
                    <MapPin className="h-3 w-3" />
                    Open in {detectMapsPlatform() === "apple" ? "Apple Maps" : "Google Maps"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Lower dashed connector line */}
      <div className="flex items-start gap-2">
        <div className="flex flex-col items-center self-stretch ml-3 mr-2">
          <div className="w-px flex-1 border-l-2 border-dashed border-muted-foreground/30 min-h-[8px]" />
        </div>
      </div>
    </div>
  );
}
