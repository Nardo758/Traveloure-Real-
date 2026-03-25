import * as React from "react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { APIProvider, Map, AdvancedMarker, InfoWindow, useMap } from "@vis.gl/react-google-maps";
import { Polyline } from "@/components/ui/map-polyline";
import { Button } from "@/components/ui/button";
import { SiGoogle, SiApple } from "react-icons/si";
import {
  Layers, MapPin, Check, CalendarPlus,
} from "lucide-react";
import { detectMapsPlatform, openInMaps } from "@/lib/maps-platform";
import {
  TYPE_COLORS, MODE_COLORS, ModeIcon,
  type PlanCardDay, type PlanCardActivity, type PlanCardTransport,
} from "./plancard-types";

interface MapControlCenterProps {
  tripId: string;
  tripDestination: string;
  days: PlanCardDay[];
  selectedDay: number;
  onSelectDay: (i: number) => void;
}

interface GeocodedActivity extends PlanCardActivity {
  resolvedLat: number;
  resolvedLng: number;
}

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

function getModePolylineStyle(mode: string) {
  const dash: google.maps.Symbol = {
    path: "M 0,-1 0,1",
    strokeOpacity: 1,
    scale: 4,
  };

  switch (mode) {
    case "walk":
      return {
        strokeColor: "#22C55E",
        strokeOpacity: 0,
        strokeWeight: 3,
        icons: [{ icon: dash, offset: "0", repeat: "16px" }],
      };
    case "train":
      return {
        strokeColor: "#3B82F6",
        strokeOpacity: 0.8,
        strokeWeight: 3,
      };
    case "bus":
    case "shuttle":
      return {
        strokeColor: "#8B5CF6",
        strokeOpacity: 0.8,
        strokeWeight: 3,
      };
    case "taxi":
    case "car":
      return {
        strokeColor: "#F59E0B",
        strokeOpacity: 0.8,
        strokeWeight: 3,
      };
    case "ferry":
      return {
        strokeColor: "#06B6D4",
        strokeOpacity: 0.8,
        strokeWeight: 3,
      };
    default:
      return {
        strokeColor: "#6B7280",
        strokeOpacity: 0.7,
        strokeWeight: 2,
      };
  }
}

function MapContent({
  activities,
  transports,
  destination,
  layers,
  selectedPinId,
  onSelectPin,
  tripId,
}: {
  activities: PlanCardActivity[];
  transports: PlanCardTransport[];
  destination: string;
  layers: { activities: boolean; transport: boolean };
  selectedPinId: string | null;
  onSelectPin: (id: string | null) => void;
  tripId: string;
}) {
  const map = useMap();
  const [geocodedActivities, setGeocodedActivities] = useState<GeocodedActivity[]>([]);

  useEffect(() => {
    if (!activities || activities.length === 0) {
      setGeocodedActivities([]);
      return;
    }

    const hasCoords = activities.every((a) => a.lat != null && a.lng != null);
    if (hasCoords) {
      setGeocodedActivities(
        activities.map((a) => ({ ...a, resolvedLat: a.lat!, resolvedLng: a.lng! }))
      );
      return;
    }

    if (!map || typeof google === "undefined" || !google.maps) {
      return;
    }

    let cancelled = false;
    const geocoder = new google.maps.Geocoder();

    async function run() {
      try {
        const destResult = await geocoder.geocode({ address: destination });
        const destLat = destResult.results[0]?.geometry.location.lat() || 0;
        const destLng = destResult.results[0]?.geometry.location.lng() || 0;

        const results: GeocodedActivity[] = [];

        for (let i = 0; i < activities.length; i++) {
          if (cancelled) return;
          const activity = activities[i];
          if (activity.lat != null && activity.lng != null) {
            results.push({ ...activity, resolvedLat: activity.lat, resolvedLng: activity.lng });
            continue;
          }

          try {
            const searchQuery = `${activity.location}, ${destination}`;
            const res = await geocoder.geocode({ address: searchQuery });
            if (res.results[0]) {
              results.push({
                ...activity,
                resolvedLat: res.results[0].geometry.location.lat(),
                resolvedLng: res.results[0].geometry.location.lng(),
              });
            } else {
              const offset = (i + 1) * 0.003;
              results.push({
                ...activity,
                resolvedLat: destLat + offset * Math.cos(i * 1.2),
                resolvedLng: destLng + offset * Math.sin(i * 1.2),
              });
            }
          } catch {
            const offset = (i + 1) * 0.003;
            results.push({
              ...activity,
              resolvedLat: destLat + offset * Math.cos(i * 1.2),
              resolvedLng: destLng + offset * Math.sin(i * 1.2),
            });
          }
        }

        if (!cancelled) {
          setGeocodedActivities(results);
        }
      } catch {
        if (!cancelled) {
          setGeocodedActivities([]);
        }
      }
    }

    run();
    return () => { cancelled = true; };
  }, [map, activities, destination]);

  useEffect(() => {
    if (!map || geocodedActivities.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    geocodedActivities.forEach((a) => {
      bounds.extend({ lat: a.resolvedLat, lng: a.resolvedLng });
    });
    map.fitBounds(bounds, 60);
  }, [map, geocodedActivities]);

  return (
    <>
      {layers.transport && geocodedActivities.length > 1 && transports.map((tr, i) => {
        const fromActivity = geocodedActivities.find((a) => a.location === tr.from || a.name === tr.fromName) || geocodedActivities[i];
        const toActivity = geocodedActivities.find((a) => a.location === tr.to || a.name === tr.toName) || geocodedActivities[i + 1];
        if (!fromActivity || !toActivity) return null;
        const style = getModePolylineStyle(tr.mode);
        const midLat = (fromActivity.resolvedLat + toActivity.resolvedLat) / 2;
        const midLng = (fromActivity.resolvedLng + toActivity.resolvedLng) / 2;
        return (
          <React.Fragment key={`route-${tr.id}`}>
            <Polyline
              path={[
                { lat: fromActivity.resolvedLat, lng: fromActivity.resolvedLng },
                { lat: toActivity.resolvedLat, lng: toActivity.resolvedLng },
              ]}
              strokeColor={style.strokeColor}
              strokeOpacity={style.strokeOpacity}
              strokeWeight={style.strokeWeight}
              icons={style.icons}
            />
            {tr.duration && (
              <AdvancedMarker position={{ lat: midLat, lng: midLng }}>
                <div
                  className="px-1.5 py-0.5 rounded-full text-[9px] font-bold whitespace-nowrap shadow-md border"
                  style={{
                    backgroundColor: "hsl(var(--card))",
                    borderColor: style.strokeColor,
                    color: style.strokeColor,
                  }}
                  data-testid={`map-route-duration-${tr.id}`}
                >
                  {tr.duration}m
                </div>
              </AdvancedMarker>
            )}
          </React.Fragment>
        );
      })}

      {layers.activities && geocodedActivities.map((activity) => {
        const tc = TYPE_COLORS[activity.type] || TYPE_COLORS.attraction;
        return (
          <AdvancedMarker
            key={activity.id}
            position={{ lat: activity.resolvedLat, lng: activity.resolvedLng }}
            onClick={() => onSelectPin(activity.id)}
          >
            <div className="flex flex-col items-center" data-testid={`map-pin-${activity.id}`}>
              <div
                className="rounded-lg px-2.5 py-1.5 shadow-lg border-2 whitespace-nowrap"
                style={{
                  backgroundColor: "hsl(var(--card))",
                  borderColor: tc.dot,
                  boxShadow: `0 4px 20px ${tc.dot}30`,
                }}
              >
                <div className="text-[11px] font-bold text-foreground" data-testid={`map-pin-name-${activity.id}`}>{activity.name}</div>
                <div className="text-[10px] text-muted-foreground" data-testid={`map-pin-time-${activity.id}`}>{activity.time}</div>
              </div>
              <div
                className="w-3.5 h-3.5 rounded-full -mt-0.5 border-2"
                style={{
                  backgroundColor: tc.dot,
                  borderColor: "hsl(var(--card))",
                  boxShadow: `0 0 12px ${tc.dot}50`,
                }}
              />
            </div>
          </AdvancedMarker>
        );
      })}

      {selectedPinId && (() => {
        const pin = geocodedActivities.find((a) => a.id === selectedPinId);
        if (!pin) return null;
        const tc = TYPE_COLORS[pin.type] || TYPE_COLORS.attraction;
        return (
          <InfoWindow
            position={{ lat: pin.resolvedLat, lng: pin.resolvedLng }}
            onCloseClick={() => onSelectPin(null)}
          >
            <div className="p-1 min-w-[140px]" data-testid={`map-info-window-${pin.id}-${tripId}`}>
              <div className="font-bold text-sm" data-testid={`map-info-name-${pin.id}`}>{pin.name}</div>
              <div className="text-xs mt-0.5 flex items-center gap-1" style={{ color: "#6B7280" }} data-testid={`map-info-location-${pin.id}`}>
                <MapPin className="w-3 h-3" /> {pin.location}
              </div>
              <div className="flex gap-2 mt-1 items-center">
                <span className="text-xs" data-testid={`map-info-time-${pin.id}`}>{pin.time}</span>
                <span
                  className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
                  style={{ backgroundColor: `${tc.dot}20`, color: tc.dot }}
                  data-testid={`map-info-type-${pin.id}`}
                >
                  {pin.type}
                </span>
                {pin.cost > 0 && (
                  <span className="text-xs font-semibold" style={{ color: "#16a34a" }} data-testid={`map-info-cost-${pin.id}`}>${pin.cost}</span>
                )}
              </div>
            </div>
          </InfoWindow>
        );
      })()}
    </>
  );
}

class MapErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback: React.ReactNode }) {
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

export function MapControlCenter({
  tripId,
  tripDestination,
  days,
  selectedDay,
  onSelectDay,
}: MapControlCenterProps) {
  const [layers, setLayers] = useState({ activities: true, transport: true });
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);

  const day = days[selectedDay];

  const toggleLayer = useCallback((key: "activities" | "transport") => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  function getActivityLoc(a: PlanCardActivity): string {
    if (a.lat != null && a.lng != null) return `${a.lat},${a.lng}`;
    return a.location || a.name || tripDestination;
  }

  function getDominantMode(transports: PlanCardTransport[] | undefined): { google: string; apple: string } {
    if (!transports || transports.length === 0) return { google: "walking", apple: "w" };
    const counts: Record<string, number> = {};
    transports.forEach(t => { counts[t.mode] = (counts[t.mode] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    const gMap: Record<string, string> = { walk: "walking", taxi: "driving", car: "driving", shuttle: "driving", bus: "transit", train: "transit", ferry: "transit", bicycle: "bicycling" };
    const aMap: Record<string, string> = { walk: "w", taxi: "d", car: "d", shuttle: "d", bus: "r", train: "r", ferry: "r", bicycle: "w" };
    return { google: gMap[top] || "walking", apple: aMap[top] || "w" };
  }

  function handleGoogleMaps() {
    const acts = (day?.activities || []).filter(a => a.location || a.name || (a.lat != null && a.lng != null));
    if (acts.length === 0) {
      openInMaps(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tripDestination)}`);
      return;
    }
    if (acts.length === 1) {
      openInMaps(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(getActivityLoc(acts[0]))}`);
      return;
    }
    const mode = getDominantMode(day?.transports);
    const origin = encodeURIComponent(getActivityLoc(acts[0]));
    const destination = encodeURIComponent(getActivityLoc(acts[acts.length - 1]));
    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=${mode.google}`;
    if (acts.length > 2) {
      const waypoints = acts.slice(1, -1).map(a => encodeURIComponent(getActivityLoc(a))).join("%7C");
      url += `&waypoints=${waypoints}`;
    }
    openInMaps(url);
  }

  function handleAppleMaps() {
    const acts = (day?.activities || []).filter(a => a.location || a.name || (a.lat != null && a.lng != null));
    const platform = detectMapsPlatform();
    if (acts.length === 0) {
      const q = encodeURIComponent(tripDestination);
      openInMaps(platform === "apple" ? `maps://?q=${q}` : `https://maps.apple.com/?q=${q}`);
      return;
    }
    if (acts.length === 1) {
      const q = encodeURIComponent(getActivityLoc(acts[0]));
      openInMaps(platform === "apple" ? `maps://?q=${q}` : `https://maps.apple.com/?q=${q}`);
      return;
    }
    const mode = getDominantMode(day?.transports);
    const saddr = encodeURIComponent(getActivityLoc(acts[0]));
    const daddrParts = acts.slice(1).map(a => encodeURIComponent(getActivityLoc(a)));
    const daddr = daddrParts.join("+to:");
    const base = platform === "apple" ? "maps://" : "https://maps.apple.com/";
    openInMaps(`${base}?saddr=${saddr}&daddr=${daddr}&dirflg=${mode.apple}`);
  }

  function handleAddToCalendar() {
    if (!day) return;
    const activities = day.activities || [];
    if (activities.length === 0) return;

    const dateStr = day.date?.replace(/-/g, "") || new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Traveloure//PlanCard//EN",
    ];

    activities.forEach((act) => {
      const timeMatch = act.time?.match(/(\d{1,2}):(\d{2})/);
      const startHour = timeMatch ? timeMatch[1].padStart(2, "0") : "09";
      const startMin = timeMatch ? timeMatch[2] : "00";
      const startTime = `${dateStr}T${startHour}${startMin}00`;
      const endHourNum = Math.min(23, parseInt(startHour) + 1);
      const endTime = `${dateStr}T${endHourNum.toString().padStart(2, "0")}${startMin}00`;

      lines.push(
        "BEGIN:VEVENT",
        `DTSTART:${startTime}`,
        `DTEND:${endTime}`,
        `SUMMARY:${act.name}`,
        `LOCATION:${act.location}`,
        `DESCRIPTION:${act.type} - ${tripDestination}`,
        "END:VEVENT"
      );
    });

    lines.push("END:VCALENDAR");

    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `traveloure-day${day.dayNum}-${tripDestination.toLowerCase().replace(/\s+/g, "-")}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const routeSummary = useMemo(() => {
    if (!day?.transports || !day?.activities) return [];
    return day.transports.map((tr, i) => {
      const fromAct = day.activities.find((a) => a.id === tr.from) || day.activities[i];
      const toAct = day.activities.find((a) => a.id === tr.to) || day.activities[i + 1];
      return { transport: tr, fromName: fromAct?.name || tr.fromName || tr.from, toName: toAct?.name || tr.toName || tr.to };
    });
  }, [day]);

  if (!day) return null;

  const activitiesCount = day.activities?.length || 0;
  const transportsCount = day.transports?.length || 0;
  const hasApiKey = MAPS_API_KEY.length > 0;

  return (
    <div data-testid={`map-control-center-${tripId}`}>
      {hasApiKey ? (
        <div className="relative h-[420px] overflow-hidden" data-testid={`map-area-${tripId}`}>
          <MapErrorBoundary
            fallback={
              <div className="h-[420px] bg-muted flex items-center justify-center">
                <p className="text-muted-foreground text-sm">Map unavailable</p>
              </div>
            }
          >
            <APIProvider apiKey={MAPS_API_KEY}>
              <Map
                mapId="plancard-map"
                style={{ width: "100%", height: "100%" }}
                defaultZoom={13}
                defaultCenter={{ lat: 0, lng: 0 }}
                gestureHandling="greedy"
                disableDefaultUI={false}
                zoomControl={true}
                mapTypeControl={false}
                streetViewControl={false}
                fullscreenControl={false}
              >
                <MapContent
                  activities={day.activities || []}
                  transports={day.transports || []}
                  destination={tripDestination}
                  layers={layers}
                  selectedPinId={selectedPinId}
                  onSelectPin={setSelectedPinId}
                  tripId={tripId}
                />
              </Map>
            </APIProvider>
          </MapErrorBoundary>

          <div className="absolute top-4 left-4 flex gap-1 z-10" data-testid={`map-day-selector-${tripId}`}>
            {days.map((d, i) => (
              <button
                key={i}
                onClick={() => onSelectDay(i)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold backdrop-blur-sm transition-all border-0 cursor-pointer ${
                  selectedDay === i
                    ? "bg-primary text-primary-foreground shadow-lg"
                    : "bg-card/90 text-muted-foreground hover:text-foreground hover:bg-card"
                }`}
                data-testid={`map-day-btn-${d.dayNum}-${tripId}`}
              >
                Day {d.dayNum}
              </button>
            ))}
          </div>

          <div className="absolute top-4 right-4 bg-card/90 backdrop-blur-sm rounded-xl px-4 py-2.5 z-10 shadow-lg" data-testid={`map-day-info-${tripId}`}>
            <div className="text-sm font-bold text-foreground" data-testid={`map-day-date-${tripId}`}>{day.date}</div>
            <div className="text-xs text-muted-foreground" data-testid={`map-day-label-${tripId}`}>{day.label}</div>
          </div>
        </div>
      ) : (
        <div className="h-[420px] bg-muted/50 flex flex-col items-center justify-center gap-3" data-testid={`map-placeholder-${tripId}`}>
          <MapPin className="w-12 h-12 text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm">Google Maps API key required</p>
          <div className="flex gap-1 z-10">
            {days.map((d, i) => (
              <button
                key={i}
                onClick={() => onSelectDay(i)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-0 cursor-pointer transition-all ${
                  selectedDay === i
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`map-day-btn-${d.dayNum}-${tripId}`}
              >
                Day {d.dayNum}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-muted/30 px-5 py-4 border-t border-border" data-testid={`layer-controls-${tripId}`}>
        <div className="flex justify-between items-center mb-3.5 flex-wrap gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground uppercase tracking-wider">
            <Layers className="w-4 h-4" /> Map Layers
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant="default"
              onClick={handleGoogleMaps}
              className="text-[11px] gap-1.5 h-7"
              data-testid={`map-btn-google-${tripId}`}
            >
              <SiGoogle className="w-3 h-3" /> Google Maps
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleAppleMaps}
              className="text-[11px] gap-1.5 h-7"
              data-testid={`map-btn-apple-${tripId}`}
            >
              <SiApple className="w-3 h-3" /> Apple Maps
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleAddToCalendar}
              className="text-[11px] gap-1.5 h-7"
              data-testid={`map-btn-calendar-${tripId}`}
            >
              <CalendarPlus className="w-3 h-3" /> Add to Calendar
            </Button>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => toggleLayer("activities")}
            className={`flex-1 p-3 rounded-xl cursor-pointer transition-all flex items-center gap-3 border-2 ${
              layers.activities
                ? "border-blue-500 bg-blue-500/10 dark:bg-blue-500/15"
                : "border-border bg-muted/20 hover:bg-muted/40"
            }`}
            data-testid={`toggle-activities-layer-${tripId}`}
          >
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center text-primary-foreground ${
                layers.activities ? "bg-blue-500" : "bg-muted-foreground/30"
              }`}
            >
              {layers.activities ? <Check className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}
            </div>
            <div className="text-left">
              <div className={`text-[13px] font-bold ${layers.activities ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`} data-testid={`text-activities-layer-${tripId}`}>
                Activities Layer
              </div>
              <div className="text-[11px] text-muted-foreground" data-testid={`text-activities-count-${tripId}`}>
                {activitiesCount} stop{activitiesCount !== 1 ? "s" : ""} - pins & details
              </div>
            </div>
          </button>

          <button
            onClick={() => toggleLayer("transport")}
            className={`flex-1 p-3 rounded-xl cursor-pointer transition-all flex items-center gap-3 border-2 ${
              layers.transport
                ? "border-green-500 bg-green-500/10 dark:bg-green-500/15"
                : "border-border bg-muted/20 hover:bg-muted/40"
            }`}
            data-testid={`toggle-transport-layer-${tripId}`}
          >
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center text-primary-foreground ${
                layers.transport ? "bg-green-500" : "bg-muted-foreground/30"
              }`}
            >
              {layers.transport ? <Check className="w-4 h-4" /> : <ModeIcon mode="train" className="w-4 h-4" />}
            </div>
            <div className="text-left">
              <div className={`text-[13px] font-bold ${layers.transport ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`} data-testid={`text-transport-layer-${tripId}`}>
                Transport Layer
              </div>
              <div className="text-[11px] text-muted-foreground" data-testid={`text-transport-count-${tripId}`}>
                {transportsCount} leg{transportsCount !== 1 ? "s" : ""} - routes & modes
              </div>
            </div>
          </button>
        </div>

        {layers.transport && routeSummary.length > 0 && (
          <div className="mt-3.5 p-3 rounded-xl bg-muted/30 border border-border/50" data-testid={`route-summary-${tripId}`}>
            <div className="flex gap-1.5 flex-wrap items-center">
              {routeSummary.map((rs, i) => (
                <div key={rs.transport.id} className="flex items-center gap-1.5">
                  {i === 0 && (
                    <span className="text-[11px] text-muted-foreground font-medium truncate max-w-[100px]" data-testid={`route-from-${rs.transport.id}-${tripId}`}>{rs.fromName}</span>
                  )}
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold"
                    style={{
                      backgroundColor: `${MODE_COLORS[rs.transport.mode] || "#6B7280"}20`,
                      color: MODE_COLORS[rs.transport.mode] || "#6B7280",
                    }}
                    data-testid={`route-leg-${rs.transport.id}-${tripId}`}
                  >
                    <ModeIcon mode={rs.transport.mode} className="w-3 h-3" /> {rs.transport.duration}m
                  </span>
                  <span className="text-[11px] text-muted-foreground font-medium truncate max-w-[100px]" data-testid={`route-to-${rs.transport.id}-${tripId}`}>{rs.toName}</span>
                  {i < routeSummary.length - 1 && (
                    <span className="text-muted-foreground/30 mx-0.5">-</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
