import { useState } from "react";
import {
  ArrowLeft, MapPin, Navigation, ExternalLink, Route, Map,
  Clock, DollarSign, Footprints, Car, TrainFront, ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  TRIP, DAYS, DAY_COLORS, MODE_COLORS,
  formatDuration, buildMapsUrl, buildAppleMapsUrl,
  type DayData, type Activity,
} from "./shared-data";

function ModeIcon({ mode, className = "w-4 h-4" }: { mode: string; className?: string }) {
  if (mode === "walk") return <Footprints className={className} />;
  if (mode === "taxi" || mode === "car") return <Car className={className} />;
  if (mode === "ferry" || mode === "bus") return <TrainFront className={className} />;
  return <Footprints className={className} />;
}

function buildWazeUrl(lat?: number, lng?: number) {
  if (lat && lng) return `https://www.waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  return null;
}

function NavigateDropdown({ location, lat, lng }: { location: string; lat?: number; lng?: number }) {
  const [open, setOpen] = useState(false);
  const wazeUrl = buildWazeUrl(lat, lng);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-1 rounded-lg hover:bg-blue-100 transition-colors"
        data-testid="navigate-button"
      >
        <Navigation className="w-3 h-3" /> Navigate
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-xl py-1.5 w-44">
            <a href={buildMapsUrl(location, lat, lng)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 text-[12px] text-gray-800 font-medium">
              <div className="w-5 h-5 rounded bg-blue-100 flex items-center justify-center"><MapPin className="w-3 h-3 text-blue-600" /></div>
              Google Maps
              <ExternalLink className="w-3 h-3 text-gray-400 ml-auto" />
            </a>
            <a href={buildAppleMapsUrl(location, lat, lng)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 text-[12px] text-gray-800 font-medium">
              <div className="w-5 h-5 rounded bg-gray-100 flex items-center justify-center"><Map className="w-3 h-3 text-gray-600" /></div>
              Apple Maps
              <ExternalLink className="w-3 h-3 text-gray-400 ml-auto" />
            </a>
            {wazeUrl && (
              <a href={wazeUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 text-[12px] text-gray-800 font-medium">
                <div className="w-5 h-5 rounded bg-cyan-100 flex items-center justify-center"><Route className="w-3 h-3 text-cyan-600" /></div>
                Waze
                <ExternalLink className="w-3 h-3 text-gray-400 ml-auto" />
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MapPlaceholder({ activities, dayColor }: { activities: Activity[]; dayColor: string }) {
  const minLat = Math.min(...activities.map(a => a.lat));
  const maxLat = Math.max(...activities.map(a => a.lat));
  const minLng = Math.min(...activities.map(a => a.lng));
  const maxLng = Math.max(...activities.map(a => a.lng));
  const padLat = (maxLat - minLat) * 0.15 || 0.01;
  const padLng = (maxLng - minLng) * 0.15 || 0.01;

  const toX = (lng: number) => ((lng - (minLng - padLng)) / ((maxLng + padLng) - (minLng - padLng))) * 100;
  const toY = (lat: number) => (1 - (lat - (minLat - padLat)) / ((maxLat + padLat) - (minLat - padLat))) * 100;

  return (
    <div className="relative w-full h-72 rounded-xl overflow-hidden border border-gray-200 bg-gradient-to-br from-blue-50 via-cyan-50 to-emerald-50">
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {Array.from({ length: 11 }).map((_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 10} x2="100" y2={i * 10} stroke="#e5e7eb" strokeWidth="0.3" />
        ))}
        {Array.from({ length: 11 }).map((_, i) => (
          <line key={`v${i}`} x1={i * 10} y1="0" x2={i * 10} y2="100" stroke="#e5e7eb" strokeWidth="0.3" />
        ))}
        {activities.length > 1 && (
          <polyline
            points={activities.map(a => `${toX(a.lng)},${toY(a.lat)}`).join(" ")}
            fill="none"
            stroke={dayColor}
            strokeWidth="0.8"
            strokeDasharray="2,1.5"
            opacity="0.6"
          />
        )}
      </svg>
      {activities.map((a, i) => (
        <div
          key={a.id}
          className="absolute flex flex-col items-center"
          style={{ left: `${toX(a.lng)}%`, top: `${toY(a.lat)}%`, transform: "translate(-50%, -100%)" }}
        >
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-md border-2 border-white"
            style={{ backgroundColor: dayColor }}
          >
            {i + 1}
          </div>
          <div className="w-0.5 h-2" style={{ backgroundColor: dayColor }} />
        </div>
      ))}
      <div className="absolute bottom-2 left-2 bg-white/80 backdrop-blur-sm rounded-lg px-2 py-1 text-[10px] text-gray-500 font-medium">
        Map View
      </div>
    </div>
  );
}

export function MapFullPage() {
  const [selectedDay, setSelectedDay] = useState<number | null>(0);

  const isAllDays = selectedDay === null;
  const currentDays = isAllDays ? DAYS : [DAYS[selectedDay!]];

  const allActivities = currentDays.flatMap(d => d.activities);
  const allTransports = currentDays.flatMap(d => d.transports);
  const totalStops = allActivities.length;
  const totalTransitTime = allTransports.reduce((s, t) => s + t.duration, 0);
  const totalTransitCost = allTransports.reduce((s, t) => s + t.cost, 0);

  const dayColor = isAllDays ? "#3b82f6" : DAY_COLORS[selectedDay! % DAY_COLORS.length];

  const fullRouteUrl = allActivities.length > 0
    ? `https://www.google.com/maps/dir/${allActivities.map(a => `${a.lat},${a.lng}`).join("/")}`
    : "#";

  return (
    <div className="min-h-screen bg-gray-50 font-['Inter',sans-serif]">
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center" data-testid="button-back">
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-[15px] font-bold text-gray-900">Trip Map</h1>
          <p className="text-[11px] text-gray-500">{TRIP.title}</p>
        </div>
        <a
          href={fullRouteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[11px] font-semibold text-white bg-blue-600 px-3 py-1.5 rounded-lg"
          data-testid="button-open-full-route"
        >
          <Route className="w-3.5 h-3.5" /> Open Full Route
        </a>
      </div>

      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedDay(null)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${
              isAllDays ? "text-white shadow-md bg-gray-800" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
            data-testid="button-day-all"
          >
            All Days
          </button>
          {DAYS.map((d, i) => (
            <button
              key={d.dayNum}
              onClick={() => setSelectedDay(i)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                selectedDay === i ? "text-white shadow-md" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
              style={selectedDay === i ? { backgroundColor: DAY_COLORS[i % DAY_COLORS.length] } : {}}
              data-testid={`button-day-${d.dayNum}`}
            >
              D{d.dayNum}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pb-3">
        <MapPlaceholder activities={allActivities} dayColor={dayColor} />
      </div>

      <div className="px-4 pb-3">
        <div className="grid grid-cols-4 gap-2">
          <Card className="p-2.5 text-center">
            <div className="text-[10px] text-gray-500 mb-0.5">Stops</div>
            <div className="text-[16px] font-bold text-gray-900" data-testid="text-total-stops">{totalStops}</div>
          </Card>
          <Card className="p-2.5 text-center">
            <div className="text-[10px] text-gray-500 mb-0.5">Transit</div>
            <div className="text-[14px] font-bold text-gray-900" data-testid="text-transit-time">{formatDuration(totalTransitTime)}</div>
          </Card>
          <Card className="p-2.5 text-center">
            <div className="text-[10px] text-gray-500 mb-0.5">Cost</div>
            <div className="text-[14px] font-bold text-gray-900" data-testid="text-transit-cost">${totalTransitCost}</div>
          </Card>
          <Card className="p-2.5 text-center">
            <div className="text-[10px] text-gray-500 mb-0.5">Days</div>
            <div className="text-[16px] font-bold text-gray-900">{currentDays.length}</div>
          </Card>
        </div>
      </div>

      <div className="px-4 pb-6">
        <h2 className="text-[13px] font-bold text-gray-900 mb-3">
          {isAllDays ? "All Stops" : `Day ${DAYS[selectedDay!].dayNum} — ${DAYS[selectedDay!].label}`}
        </h2>

        {currentDays.map((day) => {
          const dc = DAY_COLORS[(day.dayNum - 1) % DAY_COLORS.length];
          return (
            <div key={day.dayNum} className="mb-4">
              {isAllDays && (
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold" style={{ backgroundColor: dc }}>
                    {day.dayNum}
                  </div>
                  <span className="text-[12px] font-bold text-gray-800">Day {day.dayNum} — {day.label}</span>
                  <span className="text-[10px] text-gray-400">{day.date}</span>
                </div>
              )}

              <div className="space-y-0">
                {day.activities.map((act, ai) => (
                  <div key={act.id}>
                    <div className="flex items-start gap-3 py-2.5">
                      <div className="flex flex-col items-center flex-shrink-0">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold border-2 border-white shadow-sm"
                          style={{ backgroundColor: dc }}
                          data-testid={`pin-${act.id}`}
                        >
                          {ai + 1}
                        </div>
                        {ai < day.activities.length - 1 && (
                          <div className="w-0.5 h-6 bg-gray-200 mt-1" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[12px] font-semibold text-gray-900">{act.name}</span>
                          <Badge variant="secondary" className="text-[9px] px-1.5 py-0">{act.type}</Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-500 flex-wrap">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{act.time}</span>
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{act.location}</span>
                        </div>
                      </div>
                      <NavigateDropdown location={act.location} lat={act.lat} lng={act.lng} />
                    </div>

                    {ai < day.activities.length - 1 && day.transports[ai] && (
                      <div className="flex items-center gap-2 pl-10 py-1">
                        <div className="flex items-center gap-1 text-[10px] text-gray-400">
                          <ModeIcon mode={day.transports[ai].mode} className="w-3 h-3" />
                          <span>{day.transports[ai].mode}</span>
                          <span>· {formatDuration(day.transports[ai].duration)}</span>
                          {day.transports[ai].cost > 0 && <span>· ${day.transports[ai].cost}</span>}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <div className="mt-4">
          <a
            href={fullRouteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 text-[13px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-xl py-3 hover:bg-blue-100 transition-colors"
            data-testid="button-open-full-route-bottom"
          >
            <Map className="w-4 h-4" /> Open Full Route in Maps
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
