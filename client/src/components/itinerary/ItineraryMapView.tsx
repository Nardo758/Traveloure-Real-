import { useState, useCallback, Component, ReactNode } from "react";
import { APIProvider, Map, AdvancedMarker, InfoWindow, useMap } from "@vis.gl/react-google-maps";
import { Polyline } from "@/components/ui/map-polyline";
import { cn } from "@/lib/utils";
import { MapPin } from "lucide-react";
import type { ItineraryActivity, ItineraryDay, ActivityDiff, TransportDiff } from "./ItineraryCard";
import type { InlineTransportLegData } from "./InlineTransportSelector";

const CATEGORY_COLORS: Record<string, string> = {
  food: "#F97316",
  restaurant: "#F97316",
  dining: "#F97316",
  culture: "#3B82F6",
  museum: "#3B82F6",
  temple: "#8B5CF6",
  religious: "#8B5CF6",
  park: "#22C55E",
  nature: "#22C55E",
  shopping: "#EC4899",
  entertainment: "#EAB308",
  nightlife: "#A855F7",
  hotel: "#6B7280",
  accommodation: "#6B7280",
};

function getCategoryColor(category?: string | null): string {
  if (!category) return "#FF385C";
  const lower = category.toLowerCase();
  for (const [key, color] of Object.entries(CATEGORY_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return "#FF385C";
}

type TransportMode = string;

interface PolylineStyle {
  strokeColor: string;
  strokeOpacity: number;
  strokeWeight: number;
  icons?: google.maps.IconSequence[];
}

function getModePolylineStyle(mode: TransportMode): PolylineStyle {
  const dash: google.maps.Symbol = {
    path: "M 0,-1 0,1",
    strokeOpacity: 1,
    scale: 4,
  };
  const dot: google.maps.Symbol = {
    path: google.maps.SymbolPath.CIRCLE,
    strokeOpacity: 1,
    scale: 2,
  };

  switch (mode) {
    case "walk":
      return {
        strokeColor: "#22C55E",
        strokeOpacity: 0,
        strokeWeight: 2,
        icons: [{ icon: dash, offset: "0", repeat: "16px" }],
      };
    case "transit":
    case "train":
    case "bus":
    case "tram":
      return {
        strokeColor: "#3B82F6",
        strokeOpacity: 0,
        strokeWeight: 2,
        icons: [{ icon: dot, offset: "0", repeat: "10px" }],
      };
    case "bike":
      return {
        strokeColor: "#84CC16",
        strokeOpacity: 0,
        strokeWeight: 2,
        icons: [{ icon: dash, offset: "0", repeat: "12px" }],
      };
    case "ferry":
      return {
        strokeColor: "#0EA5E9",
        strokeOpacity: 0.8,
        strokeWeight: 3,
        icons: [{ icon: dot, offset: "0", repeat: "12px" }],
      };
    default:
      return {
        strokeColor: "#6B7280",
        strokeOpacity: 0.7,
        strokeWeight: 2,
      };
  }
}

interface PinActivity extends ItineraryActivity {
  pinIndex: number;
  isGhost?: boolean;
  originalPosition?: { lat: number; lng: number };
  isExpertMoved?: boolean;
}

interface ItineraryMapContentProps {
  activities: PinActivity[];
  legs: InlineTransportLegData[];
  transportDiffs: Record<string, TransportDiff>;
  isExpertMode: boolean;
  onReorder?: (fromIndex: number, toIndex: number) => void;
  showGhostPins: boolean;
}

function ItineraryMapContent({
  activities,
  legs,
  transportDiffs,
  isExpertMode,
  onReorder,
  showGhostPins,
}: ItineraryMapContentProps) {
  const map = useMap();
  const [selectedPin, setSelectedPin] = useState<string | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  const validActivities = activities.filter(a => a.lat != null && a.lng != null);

  const handleMarkerDragEnd = useCallback(
    (activity: PinActivity, e: google.maps.MapMouseEvent) => {
      if (!isExpertMode || !onReorder || !e.latLng) return;
      const droppedLat = e.latLng.lat();
      const droppedLng = e.latLng.lng();

      let closestIdx = -1;
      let minDist = Infinity;
      validActivities.forEach((a, idx) => {
        if (a.id === activity.id || a.isGhost) return;
        const d = Math.sqrt((a.lat! - droppedLat) ** 2 + (a.lng! - droppedLng) ** 2);
        if (d < minDist) { minDist = d; closestIdx = idx; }
      });

      const fromIdx = validActivities.findIndex(a => a.id === activity.id);
      if (closestIdx !== -1 && closestIdx !== fromIdx) {
        onReorder(fromIdx, closestIdx);
      }
      setDraggingIdx(null);
    },
    [isExpertMode, onReorder, validActivities]
  );

  const getActiveLegMode = (leg: InlineTransportLegData): string => {
    const diff = transportDiffs[leg.id];
    return diff?.newMode ?? leg.userSelectedMode ?? leg.recommendedMode ?? "drive";
  };

  return (
    <>
      {validActivities
        .filter(a => !a.isGhost)
        .map((activity, seqIdx) => {
          const nextActivity = validActivities.filter(a => !a.isGhost)[seqIdx + 1];
          const leg = legs[seqIdx];
          const mode = leg ? getActiveLegMode(leg) : "drive";
          const style = getModePolylineStyle(mode);

          return nextActivity ? (
            <Polyline
              key={`leg-${activity.id}-${nextActivity.id}-${mode}`}
              path={[
                { lat: activity.lat!, lng: activity.lng! },
                { lat: nextActivity.lat!, lng: nextActivity.lng! },
              ]}
              strokeColor={style.strokeColor}
              strokeOpacity={style.strokeOpacity}
              strokeWeight={style.strokeWeight}
              icons={style.icons}
            />
          ) : null;
        })}

      {showGhostPins && validActivities.filter(a => a.isGhost).map(ghost => (
        <AdvancedMarker
          key={`ghost-${ghost.id}`}
          position={{ lat: ghost.lat!, lng: ghost.lng! }}
        >
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            backgroundColor: "#9CA3AF", opacity: 0.4,
            border: "2px solid #6B7280",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "white", fontSize: 11, fontWeight: 700,
          }}>
            {ghost.pinIndex}
          </div>
        </AdvancedMarker>
      ))}

      {validActivities
        .filter(a => !a.isGhost)
        .map((activity) => {
          const color = getCategoryColor(activity.category);
          const isSelected = selectedPin === activity.id;
          const isExpertMoved = activity.isExpertMoved;

          return (
            <AdvancedMarker
              key={activity.id}
              position={{ lat: activity.lat!, lng: activity.lng! }}
              draggable={isExpertMode}
              onDragStart={() => setDraggingIdx(activity.pinIndex)}
              onDragEnd={(e) => handleMarkerDragEnd(activity, e)}
              onClick={() => setSelectedPin(isSelected ? null : activity.id)}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  backgroundColor: isExpertMoved ? "#F59E0B" : color,
                  border: `3px solid ${isExpertMoved ? "#D97706" : "white"}`,
                  boxShadow: isSelected ? "0 0 0 3px rgba(0,0,0,0.3)" : "0 2px 6px rgba(0,0,0,0.3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: isExpertMode ? "grab" : "pointer",
                  transition: "transform 0.1s",
                  transform: isSelected ? "scale(1.15)" : "scale(1)",
                }}
                data-testid={`map-pin-${activity.id}`}
              >
                {activity.pinIndex}
              </div>
            </AdvancedMarker>
          );
        })}

      {selectedPin && validActivities.find(a => a.id === selectedPin) && (() => {
        const act = validActivities.find(a => a.id === selectedPin)!;
        return (
          <InfoWindow
            position={{ lat: act.lat!, lng: act.lng! }}
            onCloseClick={() => setSelectedPin(null)}
          >
            <div className="p-1 min-w-[160px] max-w-[220px]">
              <p className="font-semibold text-sm leading-snug">{act.name}</p>
              {act.location && (
                <p className="text-xs text-gray-500 mt-0.5">{act.location}</p>
              )}
              {act.startTime && (
                <p className="text-xs text-gray-600 mt-1">
                  🕐 {act.startTime.includes("T")
                    ? new Date(act.startTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
                    : act.startTime}
                  {act.endTime && ` – ${act.endTime.includes("T")
                    ? new Date(act.endTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
                    : act.endTime}`}
                </p>
              )}
              {act.cost != null && act.cost > 0 && (
                <p className="text-xs text-green-600 mt-0.5 font-medium">
                  ${act.cost.toFixed(0)}
                </p>
              )}
              {act.isExpertMoved && (
                <p className="text-xs text-amber-600 mt-1 font-medium">⚡ Reordered by expert</p>
              )}
            </div>
          </InfoWindow>
        );
      })()}
    </>
  );
}

class MapErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

export interface ItineraryMapViewProps {
  day: ItineraryDay;
  isExpertMode?: boolean;
  transportDiffs?: Record<string, TransportDiff>;
  activityDiffs?: Record<string, ActivityDiff>;
  showGhostPins?: boolean;
  onActivityReorder?: (dayNumber: number, fromIndex: number, toIndex: number) => void;
  className?: string;
  height?: string;
}

export function ItineraryMapView({
  day,
  isExpertMode = false,
  transportDiffs = {},
  activityDiffs = {},
  showGhostPins = false,
  onActivityReorder,
  className,
  height = "320px",
}: ItineraryMapViewProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed",
          className
        )}
        style={{ height }}
      >
        <div className="text-center p-4">
          <MapPin className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Map view unavailable</p>
          <p className="text-xs text-muted-foreground mt-1">Configure Google Maps to enable</p>
        </div>
      </div>
    );
  }

  const validActivities = day.activities.filter(
    a => a.lat != null && a.lng != null
  );

  if (validActivities.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed",
          className
        )}
        style={{ height }}
      >
        <div className="text-center p-4">
          <MapPin className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No location data for this day</p>
          <p className="text-xs text-muted-foreground mt-1">Activities need coordinates to show on map</p>
        </div>
      </div>
    );
  }

  const centerLat = validActivities.reduce((s, a) => s + a.lat!, 0) / validActivities.length;
  const centerLng = validActivities.reduce((s, a) => s + a.lng!, 0) / validActivities.length;

  const movedActivityIds = new Set(
    Object.entries(activityDiffs)
      .filter(([, diff]) => (diff as ActivityDiff & { reorderIndex?: number }).reorderIndex !== undefined)
      .map(([id]) => id)
  );

  const pinActivities: PinActivity[] = validActivities.map((a, i) => ({
    ...a,
    pinIndex: i + 1,
    isExpertMoved: movedActivityIds.has(a.id),
  }));

  const ghostPins: PinActivity[] = showGhostPins
    ? validActivities
        .filter(a => movedActivityIds.has(a.id))
        .map((a, i) => ({
          ...a,
          id: `ghost-${a.id}`,
          pinIndex: i + 1,
          isGhost: true,
        }))
    : [];

  const allPins = [...pinActivities, ...ghostPins];

  const handleReorder = (fromIdx: number, toIdx: number) => {
    onActivityReorder?.(day.dayNumber, fromIdx, toIdx);
  };

  const mapFallback = (
    <div className="flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg w-full h-full">
      <div className="text-center p-4">
        <MapPin className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Map failed to load</p>
      </div>
    </div>
  );

  return (
    <div
      className={cn("relative rounded-lg overflow-hidden", className)}
      style={{ height }}
      data-testid={`itinerary-map-day-${day.dayNumber}`}
    >
      <MapErrorBoundary fallback={mapFallback}>
        <APIProvider apiKey={apiKey}>
          <Map
            defaultCenter={{ lat: centerLat, lng: centerLng }}
            defaultZoom={13}
            mapId="itinerary-map"
            gestureHandling="cooperative"
            disableDefaultUI={false}
            style={{ width: "100%", height: "100%" }}
          >
            <ItineraryMapContent
              activities={allPins}
              legs={day.transportLegs}
              transportDiffs={transportDiffs}
              isExpertMode={isExpertMode}
              onReorder={handleReorder}
              showGhostPins={showGhostPins}
            />
          </Map>
        </APIProvider>
      </MapErrorBoundary>

      <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1.5 pointer-events-none">
        <div className="bg-white/90 dark:bg-gray-900/90 rounded-md px-2 py-1 text-xs flex items-center gap-1.5 shadow">
          <span className="inline-block w-6 h-0.5 bg-[#6B7280]" />
          <span>Drive</span>
        </div>
        <div className="bg-white/90 dark:bg-gray-900/90 rounded-md px-2 py-1 text-xs flex items-center gap-1.5 shadow">
          <span className="inline-block w-6 border-t-2 border-dashed border-[#22C55E]" />
          <span>Walk</span>
        </div>
        <div className="bg-white/90 dark:bg-gray-900/90 rounded-md px-2 py-1 text-xs flex items-center gap-1.5 shadow">
          <span className="inline-block w-6 border-t-2 border-dotted border-[#3B82F6]" />
          <span>Transit</span>
        </div>
      </div>
    </div>
  );
}
