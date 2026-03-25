import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Navigation, Loader2 } from "lucide-react";
import { TRANSPORT_MODE_ICONS, TRANSPORT_MODE_LABELS } from "@/lib/maps-platform";
import type { InlineTransportLegData } from "./InlineTransportSelector";

interface NavigateNextButtonProps {
  leg: InlineTransportLegData;
  shareToken?: string;
  dayNumber?: number;
  toActivityName: string;
  className?: string;
}

export function NavigateNextButton({ leg, shareToken, dayNumber, toActivityName, className }: NavigateNextButtonProps) {
  const [loading, setLoading] = useState(false);
  const activeMode = leg.userSelectedMode || leg.recommendedMode;
  const modeIcon = TRANSPORT_MODE_ICONS[activeMode] || "🚌";
  const modeLabel = TRANSPORT_MODE_LABELS[activeMode] || activeMode;

  const handleNavigate = async () => {
    setLoading(true);
    try {
      let fromLat = leg.fromLat;
      let fromLng = leg.fromLng;

      if (navigator.geolocation) {
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              fromLat = pos.coords.latitude;
              fromLng = pos.coords.longitude;
              resolve();
            },
            () => resolve(),
            { timeout: 3000 }
          );
        });
      }

      let url: string;
      if (shareToken && dayNumber) {
        const params = new URLSearchParams();
        const ua = navigator.userAgent;
        params.set("platform", /iPad|iPhone|iPod|Macintosh/.test(ua) && !ua.includes("Android") ? "apple" : "google");
        if (fromLat && fromLng) {
          params.set("currentLat", String(fromLat));
          params.set("currentLng", String(fromLng));
        }
        url = `/api/itinerary-share/${shareToken}/navigate/${dayNumber}/${leg.legOrder}?${params.toString()}`;
      } else if (leg.toLat && leg.toLng) {
        const ua = navigator.userAgent;
        const isApple = /iPad|iPhone|iPod|Macintosh/.test(ua) && !ua.includes("Android");
        if (isApple) {
          url = `maps://?saddr=${fromLat || ""},${fromLng || ""}&daddr=${leg.toLat},${leg.toLng}`;
        } else {
          url = `https://www.google.com/maps/dir/?api=1${fromLat ? `&origin=${fromLat},${fromLng}` : ""}&destination=${leg.toLat},${leg.toLng}&travelmode=transit`;
        }
      } else {
        return;
      }

      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={className} data-testid="navigate-next-button">
      <div className="flex flex-col gap-1">
        <div className="text-sm font-medium text-foreground">
          Navigate to {toActivityName}
        </div>
        <div className="text-xs text-muted-foreground">
          {modeIcon} {modeLabel} • {leg.estimatedDurationMinutes} min
        </div>
        <Button
          size="sm"
          onClick={handleNavigate}
          disabled={loading || (!leg.toLat && !shareToken)}
          className="mt-1 gap-2 w-fit"
          data-testid="button-start-navigation"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Navigation className="h-4 w-4" />
          )}
          Start Navigation
        </Button>
      </div>
    </div>
  );
}
