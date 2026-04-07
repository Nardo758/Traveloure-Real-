import { useState } from "react";
import {
  ArrowLeft, Printer, Download, Clock, CheckCircle2, DollarSign,
  MapPin, Navigation, ExternalLink, Map, Route, Lightbulb,
  Footprints, Car, TrainFront, ChevronDown, ChevronUp,
  Activity as ActivityIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  TRIP, DAYS, DAY_COLORS, TYPE_COLORS, STATUS_STYLES, MODE_COLORS,
  formatDuration, buildMapsUrl, buildAppleMapsUrl,
  type DayData, type Activity, type Transport,
} from "./shared-data";

function ModeIcon({ mode, className = "w-4 h-4" }: { mode: string; className?: string }) {
  if (mode === "walk") return <Footprints className={className} />;
  if (mode === "taxi" || mode === "car") return <Car className={className} />;
  if (mode === "ferry") return <TrainFront className={className} />;
  if (mode === "bus") return <TrainFront className={className} />;
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

function TransportConnector({ transport }: { transport: Transport }) {
  const modeColor = MODE_COLORS[transport.mode] || "#6b7280";

  return (
    <div className="flex items-center gap-2 py-1.5 px-3 ml-6 border-l-2 border-dashed" style={{ borderColor: modeColor + "60" }}>
      <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: modeColor + "20" }}>
        <ModeIcon mode={transport.mode} className="w-3 h-3" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-[11px] text-gray-600 font-medium">
          {transport.from} → {transport.to}
        </span>
      </div>
      <span className="text-[10px] text-gray-500 flex items-center gap-1">
        <Clock className="w-2.5 h-2.5" /> {formatDuration(transport.duration)}
      </span>
      {transport.cost > 0 && (
        <span className="text-[10px] font-semibold text-gray-700">${transport.cost}</span>
      )}
      {transport.status === "suggested" && (
        <Badge className="text-[9px] px-1.5 py-0 bg-indigo-100 text-indigo-800 border-0">Suggested</Badge>
      )}
    </div>
  );
}

function ActivityRow({ activity, index }: { activity: Activity; index: number }) {
  const typeStyle = TYPE_COLORS[activity.type] || { bg: "bg-gray-100", fg: "text-gray-800", dot: "#6b7280" };
  const statusStyle = STATUS_STYLES[activity.status] || STATUS_STYLES.confirmed;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3" data-testid={`activity-row-${activity.id}`}>
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center flex-shrink-0">
          <div className="w-8 h-8 rounded-full bg-gray-50 border-2 border-gray-200 flex items-center justify-center text-[11px] font-bold text-gray-600">
            {index + 1}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-bold text-gray-900">{activity.name}</span>
            <Badge className={`text-[9px] px-1.5 py-0 border-0 ${typeStyle.bg} ${typeStyle.fg}`}>
              {activity.type}
            </Badge>
            <Badge className={`text-[9px] px-1.5 py-0 border-0 ${statusStyle.bg} ${statusStyle.fg}`}>
              {statusStyle.label}
            </Badge>
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-[11px] text-gray-500 flex items-center gap-1">
              <Clock className="w-3 h-3" /> {activity.time}
            </span>
            <span className="text-[11px] text-gray-500 flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {activity.location}
            </span>
            {activity.duration && (
              <span className="text-[11px] text-gray-500">{formatDuration(activity.duration)}</span>
            )}
          </div>
          {activity.cost > 0 && (
            <div className="text-[12px] font-semibold text-emerald-700 mt-1">
              ${activity.cost}
              {TRIP.numberOfTravelers > 1 && (
                <span className="text-gray-400 font-normal ml-1">
                  (${(activity.cost * TRIP.numberOfTravelers).toFixed(0)} total)
                </span>
              )}
            </div>
          )}
          {activity.expertNote && (
            <div className="flex items-start gap-1.5 mt-2 bg-purple-50 rounded-lg px-2.5 py-1.5">
              <Lightbulb className="w-3 h-3 text-purple-500 flex-shrink-0 mt-0.5" />
              <span className="text-[11px] text-purple-700 italic leading-relaxed">"{activity.expertNote}"</span>
            </div>
          )}
        </div>
        <div className="flex-shrink-0">
          <NavigateDropdown location={activity.location} lat={activity.lat} lng={activity.lng} />
        </div>
      </div>
    </div>
  );
}

function DaySection({ day, dayIndex }: { day: DayData; dayIndex: number }) {
  const [collapsed, setCollapsed] = useState(false);
  const dayColor = DAY_COLORS[dayIndex % DAY_COLORS.length];
  const dayCost = day.activities.reduce((s, a) => s + a.cost, 0);
  const transitTime = day.transports.reduce((s, t) => s + t.duration, 0);
  const transitCost = day.transports.reduce((s, t) => s + t.cost, 0);
  const confirmedCount = day.activities.filter(a => a.status === "confirmed").length;

  const interleaved: { type: "activity" | "transport"; item: Activity | Transport; index: number }[] = [];
  day.activities.forEach((a, i) => {
    if (i > 0 && day.transports[i - 1]) {
      interleaved.push({ type: "transport", item: day.transports[i - 1], index: i - 1 });
    }
    interleaved.push({ type: "activity", item: a, index: i });
  });

  return (
    <div className="mb-4" data-testid={`day-section-${day.dayNum}`}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors"
        style={{ backgroundColor: dayColor + "12" }}
      >
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-[13px] font-bold" style={{ backgroundColor: dayColor }}>
          D{day.dayNum}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-bold text-gray-900">{day.label}</span>
            <span className="text-[11px] text-gray-500">{day.date}</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-500">
            <span>{day.activities.length} activities</span>
            <span>{confirmedCount} confirmed</span>
            {dayCost > 0 && <span className="text-emerald-700 font-semibold">${dayCost + transitCost}</span>}
            {transitTime > 0 && <span>{formatDuration(transitTime)} transit</span>}
          </div>
        </div>
        {collapsed ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
      </button>

      {!collapsed && (
        <div className="mt-2 space-y-1">
          {interleaved.map((entry, idx) =>
            entry.type === "activity" ? (
              <ActivityRow key={(entry.item as Activity).id} activity={entry.item as Activity} index={entry.index} />
            ) : (
              <TransportConnector key={(entry.item as Transport).id} transport={entry.item as Transport} />
            )
          )}
          {day.transports.length > 0 && day.transports[day.activities.length - 1] && (
            <TransportConnector transport={day.transports[day.activities.length - 1]} />
          )}
        </div>
      )}
    </div>
  );
}

export function FullItineraryPage() {
  const allActivities = DAYS.flatMap(d => d.activities);
  const totalActivities = allActivities.length;
  const confirmedActivities = allActivities.filter(a => a.status === "confirmed").length;
  const totalActivityCost = allActivities.reduce((s, a) => s + a.cost, 0);
  const totalTransitTime = DAYS.flatMap(d => d.transports).reduce((s, t) => s + t.duration, 0);
  const totalTransitCost = DAYS.flatMap(d => d.transports).reduce((s, t) => s + t.cost, 0);

  return (
    <div className="min-h-screen bg-gray-50" data-testid="full-itinerary-page">
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors" data-testid="button-back">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[15px] font-bold text-gray-900 truncate">{TRIP.title}</h1>
          <p className="text-[11px] text-gray-500">Full Itinerary</p>
        </div>
        <div className="flex gap-2">
          <Button size="icon" variant="ghost" data-testid="button-print">
            <Printer className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" data-testid="button-export">
            <Download className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-2 gap-2 mb-5">
          <Card className="p-3 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <ActivityIcon className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <div className="text-[18px] font-bold text-gray-900">{totalActivities}</div>
              <div className="text-[10px] text-gray-500">Activities</div>
            </div>
          </Card>
          <Card className="p-3 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <div className="text-[18px] font-bold text-gray-900">{confirmedActivities}</div>
              <div className="text-[10px] text-gray-500">Confirmed</div>
            </div>
          </Card>
          <Card className="p-3 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <div className="text-[18px] font-bold text-gray-900">${totalActivityCost + totalTransitCost}</div>
              <div className="text-[10px] text-gray-500">Total Cost</div>
            </div>
          </Card>
          <Card className="p-3 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <div className="text-[18px] font-bold text-gray-900">{formatDuration(totalTransitTime)}</div>
              <div className="text-[10px] text-gray-500">Transit Time</div>
            </div>
          </Card>
        </div>

        {DAYS.map((day, i) => (
          <DaySection key={day.dayNum} day={day} dayIndex={i} />
        ))}
      </div>
    </div>
  );
}
