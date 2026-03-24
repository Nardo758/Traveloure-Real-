import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { MapPin, ExternalLink } from "lucide-react";
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

export function TransportLeg({ leg, readOnly = false, shareToken, dayNumber, className }: TransportLegProps) {
  const { toast } = useToast();
  const activeMode = leg.userSelectedMode || leg.recommendedMode;
  const [currentMode, setCurrentMode] = useState(activeMode);

  const updateModeMutation = useMutation({
    mutationFn: async (selectedMode: string) => {
      return apiRequest("PATCH", `/api/transport-legs/${leg.id}/mode`, { selectedMode, shareToken });
    },
    onSuccess: (data, selectedMode) => {
      setCurrentMode(selectedMode);
      queryClient.invalidateQueries({ queryKey: ["/api/itinerary-share"] });
      toast({ title: "Transport updated", description: `Switched to ${TRANSPORT_MODE_LABELS[selectedMode] || selectedMode}` });
    },
    onError: () => {
      toast({ title: "Update failed", description: "Could not change transport mode", variant: "destructive" });
    },
  });

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
          <span className="text-sm text-muted-foreground">{leg.estimatedDurationMinutes} min</span>
          {leg.estimatedCostUsd !== null && leg.estimatedCostUsd !== undefined && leg.estimatedCostUsd > 0 && (
            <>
              <span className="text-sm text-muted-foreground">•</span>
              <span className="text-sm text-muted-foreground">${leg.estimatedCostUsd.toFixed(2)}</span>
            </>
          )}
          {leg.estimatedCostUsd === null || leg.estimatedCostUsd === 0 ? (
            <>
              <span className="text-sm text-muted-foreground">•</span>
              <span className="text-sm text-green-600 dark:text-green-400">Free</span>
            </>
          ) : null}
          <span className="text-sm text-muted-foreground">•</span>
          <span className="text-sm text-muted-foreground">{leg.distanceDisplay}</span>
        </div>

        {!readOnly && alternatives.length > 0 && (
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            {alternatives.slice(0, 3).map((alt) => (
              <button
                key={alt.mode}
                onClick={() => updateModeMutation.mutate(alt.mode)}
                disabled={updateModeMutation.isPending}
                className={cn(
                  "px-2 py-0.5 rounded-full text-xs border transition-colors",
                  currentMode === alt.mode
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary hover:text-primary"
                )}
                title={alt.reason}
                data-testid={`transport-alt-${alt.mode}`}
              >
                {TRANSPORT_MODE_ICONS[alt.mode] || "🚌"} {TRANSPORT_MODE_LABELS[alt.mode] || alt.mode}
              </button>
            ))}
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
