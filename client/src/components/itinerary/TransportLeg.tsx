import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { MapPin, ExternalLink, RotateCcw } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

function formatCost(cost: number | null | undefined): string {
  if (cost === null || cost === undefined || cost === 0) return "Free";
  return `$${cost.toFixed(0)}`;
}

export function TransportLeg({ leg, readOnly = false, shareToken, dayNumber, className }: TransportLegProps) {
  const { toast } = useToast();
  const activeMode = leg.userSelectedMode || leg.recommendedMode;
  const [currentMode, setCurrentMode] = useState(activeMode);
  const [displayDuration, setDisplayDuration] = useState(leg.estimatedDurationMinutes);
  const [displayCost, setDisplayCost] = useState(leg.estimatedCostUsd);

  const origDuration = useRef(leg.userSelectedMode ? null : leg.estimatedDurationMinutes);
  const origCost = useRef(leg.userSelectedMode ? null : leg.estimatedCostUsd);

  const isCustomized = currentMode !== leg.recommendedMode;

  const allOptions: Array<{
    mode: string;
    durationMinutes: number;
    costUsd: number | null;
    isRecommended: boolean;
  }> = [
    {
      mode: leg.recommendedMode,
      durationMinutes: origDuration.current ?? leg.estimatedDurationMinutes,
      costUsd: origCost.current ?? leg.estimatedCostUsd,
      isRecommended: true,
    },
    ...(leg.alternativeModes || [])
      .filter(a => a.mode !== leg.recommendedMode)
      .map(a => ({
        mode: a.mode,
        durationMinutes: a.durationMinutes,
        costUsd: a.costUsd,
        isRecommended: false,
      })),
  ];

  // Ensure the current selected mode (e.g. userSelectedMode) is always in the list
  // so the Select never renders an orphaned value.
  if (!allOptions.find(o => o.mode === currentMode)) {
    allOptions.push({
      mode: currentMode,
      durationMinutes: displayDuration,
      costUsd: displayCost,
      isRecommended: false,
    });
  }

  const updateModeMutation = useMutation({
    mutationFn: async (selectedMode: string) => {
      return apiRequest("PATCH", `/api/transport-legs/${leg.id}/mode`, { selectedMode, shareToken });
    },
    onSuccess: (data: any, selectedMode) => {
      setCurrentMode(selectedMode);
      const updatedLeg = data?.updatedLeg;
      if (updatedLeg?.estimatedDurationMinutes !== undefined) {
        setDisplayDuration(updatedLeg.estimatedDurationMinutes);
      } else {
        const opt = allOptions.find(o => o.mode === selectedMode);
        if (opt) setDisplayDuration(opt.durationMinutes);
      }
      if (updatedLeg?.estimatedCostUsd !== undefined) {
        setDisplayCost(updatedLeg.estimatedCostUsd);
      } else {
        const opt = allOptions.find(o => o.mode === selectedMode);
        if (opt !== undefined) setDisplayCost(opt.costUsd);
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
    },
    onError: () => {
      toast({ title: "Update failed", description: "Could not change transport mode", variant: "destructive" });
    },
  });

  const handleReset = () => {
    const recommended = allOptions.find(o => o.isRecommended);
    if (recommended) {
      setCurrentMode(leg.recommendedMode);
      setDisplayDuration(recommended.durationMinutes);
      setDisplayCost(recommended.costUsd);
    }
    updateModeMutation.mutate(leg.recommendedMode);
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

  return (
    <div className={cn("flex gap-3 py-2 px-3", className)} data-testid={`transport-leg-${leg.legOrder}`}>
      <div className="flex flex-col items-center pt-1">
        <div className="w-0.5 h-full border-l-2 border-dashed border-muted-foreground/30 min-h-[20px]" />
      </div>
      <div className="flex-1 min-w-0 pb-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base leading-none">{modeIcon}</span>
          <span className="text-sm font-medium">
            {TRANSPORT_MODE_LABELS[currentMode] || currentMode}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-sm text-muted-foreground" data-testid={`leg-duration-${leg.legOrder}`}>
            {displayDuration} min
          </span>
          <span className="text-muted-foreground">·</span>
          <span
            className={cn("text-sm", displayCost && displayCost > 0 ? "text-muted-foreground" : "text-green-600 dark:text-green-400")}
            data-testid={`leg-cost-${leg.legOrder}`}
          >
            {formatCost(displayCost)}
          </span>
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

        {!readOnly && allOptions.length > 1 && (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Select
              value={currentMode}
              onValueChange={(mode) => {
                if (mode === currentMode) return;
                updateModeMutation.mutate(mode);
              }}
              disabled={updateModeMutation.isPending}
            >
              <SelectTrigger
                className="h-7 text-xs w-auto min-w-[130px] max-w-[210px]"
                data-testid={`select-transport-mode-${leg.legOrder}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allOptions.map((opt) => {
                  const label = TRANSPORT_MODE_LABELS[opt.mode] || opt.mode;
                  const icon = TRANSPORT_MODE_ICONS[opt.mode] || "🚌";
                  const costStr = formatCost(opt.costUsd);
                  const recommended = opt.isRecommended ? " ★" : "";
                  return (
                    <SelectItem key={opt.mode} value={opt.mode}>
                      {icon} {label} — {opt.durationMinutes}m · {costStr}{recommended}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>

            {isCustomized && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                disabled={updateModeMutation.isPending}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                data-testid={`button-reset-mode-${leg.legOrder}`}
              >
                <RotateCcw className="h-3 w-3" />
                Reset
              </Button>
            )}
          </div>
        )}

        <div className="flex gap-3 mt-1.5 flex-wrap">
          {(leg.fromLat && leg.fromLng && leg.toLat && leg.toLng) && (
            <button
              onClick={handleOpenLegInMaps}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
              data-testid="button-open-leg-maps"
            >
              <MapPin className="h-3 w-3" />
              Open in {detectMapsPlatform() === "apple" ? "Apple Maps" : "Google Maps"}
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
