import {
  Calendar, ChevronRight, Clock, MapPin, Users, Share2, Download,
  Zap, Star, LayoutList, Map, CheckCircle2, History, Lock, Route,
  MessageSquare, Lightbulb, ChevronDown, ChevronUp, Check, X,
  Footprints, Car, TrainFront, Heart, TrendingDown,
  FileText, Eye, EyeOff, Navigation, ExternalLink, Phone,
} from "lucide-react";
import { useState, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const TRIP = {
  id: "9e435bca-45d9-44b8-8a68-393531cf7ad1",
  title: "California Road Trip",
  destination: "San Francisco, CA",
  startDate: "2026-05-20",
  endDate: "2026-05-27",
  numberOfTravelers: 4,
  budget: 4200,
  status: "active",
};

const DAYS = [
  {
    dayNum: 1, date: "2026-05-20", label: "Arrival Day",
    activities: [
      { id: "a1", name: "Golden Gate Bridge Walk", type: "attraction", status: "confirmed", time: "09:00", location: "Golden Gate Bridge, SF", lat: 37.8199, lng: -122.4783, cost: 0, comments: 2, expertNote: "Best visited early morning for the fog effect — truly magical views." },
      { id: "a2", name: "Fisherman's Wharf Lunch", type: "dining", status: "confirmed", time: "11:30", location: "Pier 39, SF", lat: 37.8087, lng: -122.4098, cost: 45, comments: 0 },
      { id: "a3", name: "Alcatraz Island Tour", type: "attraction", status: "pending", time: "14:00", location: "Alcatraz Island, SF Bay", lat: 37.8267, lng: -122.4230, cost: 42, comments: 1 },
      { id: "a4", name: "Chinatown Dinner", type: "dining", status: "confirmed", time: "18:30", location: "Grant Ave, Chinatown", lat: 37.7941, lng: -122.4078, cost: 55, comments: 0, expertNote: "Ask for the upstairs room — better ambiance and sunset views." },
      { id: "a5", name: "North Beach Gelato", type: "dining", status: "suggested", time: "20:30", location: "Columbus Ave, North Beach", lat: 37.7998, lng: -122.4083, cost: 12, comments: 0 },
    ],
    transports: [
      { id: "t1", mode: "walk", from: "Hotel", to: "Golden Gate", duration: 15, cost: 0, status: "confirmed" },
      { id: "t2", mode: "taxi", from: "Golden Gate", to: "Pier 39", duration: 20, cost: 18, status: "confirmed" },
      { id: "t3", mode: "ferry", from: "Pier 33", to: "Alcatraz", duration: 15, cost: 0, status: "confirmed", line: "Alcatraz Cruises" },
      { id: "t4", mode: "bus", from: "Pier 39", to: "Chinatown", duration: 12, cost: 3, status: "suggested", suggestedBy: "expert" },
    ],
  },
  {
    dayNum: 2, date: "2026-05-21", label: "Coastal Drive",
    activities: [
      { id: "a6", name: "Baker Beach Yoga", type: "attraction", status: "suggested", time: "08:00", location: "Baker Beach, SF", lat: 37.7936, lng: -122.4835, cost: 0, comments: 0, expertNote: "Great way to start the day — bring your own mat." },
      { id: "a7", name: "Highway 1 Drive Start", type: "attraction", status: "confirmed", time: "10:00", location: "Pacifica, CA", lat: 37.6138, lng: -122.4869, cost: 0, comments: 0 },
      { id: "a8", name: "Half Moon Bay Lunch", type: "dining", status: "confirmed", time: "12:30", location: "Half Moon Bay, CA", lat: 37.4636, lng: -122.4286, cost: 35, comments: 0 },
    ],
    transports: [
      { id: "t5", mode: "car", from: "Hotel", to: "Baker Beach", duration: 10, cost: 0, status: "confirmed" },
      { id: "t6", mode: "car", from: "Baker Beach", to: "Pacifica", duration: 25, cost: 0, status: "confirmed" },
    ],
  },
  {
    dayNum: 3, date: "2026-05-22", label: "Big Sur",
    activities: [
      { id: "a9", name: "Bixby Bridge Viewpoint", type: "attraction", status: "confirmed", time: "10:00", location: "Bixby Creek Bridge, Big Sur", lat: 36.3714, lng: -121.9026, cost: 0, comments: 1 },
      { id: "a10", name: "McWay Falls Trail", type: "attraction", status: "confirmed", time: "13:00", location: "Julia Pfeiffer Burns SP", lat: 36.1579, lng: -121.6722, cost: 10, comments: 0 },
    ],
    transports: [
      { id: "t7", mode: "car", from: "Half Moon Bay", to: "Bixby Bridge", duration: 150, cost: 0, status: "confirmed" },
    ],
  },
  { dayNum: 4, date: "2026-05-23", label: "Monterey", activities: [
    { id: "a11", name: "Monterey Bay Aquarium", type: "attraction", status: "confirmed", time: "10:00", location: "886 Cannery Row, Monterey", lat: 36.6185, lng: -121.9018, cost: 50, comments: 0 },
  ], transports: [] },
  { dayNum: 5, date: "2026-05-24", label: "Santa Cruz", activities: [
    { id: "a12", name: "Santa Cruz Boardwalk", type: "attraction", status: "confirmed", time: "11:00", location: "400 Beach St, Santa Cruz", lat: 36.9642, lng: -122.0177, cost: 30, comments: 0 },
  ], transports: [] },
  { dayNum: 6, date: "2026-05-25", label: "Napa Valley", activities: [
    { id: "a13", name: "Wine Tasting Tour", type: "attraction", status: "confirmed", time: "10:00", location: "Napa Valley, CA", lat: 38.5025, lng: -122.2654, cost: 85, comments: 0 },
  ], transports: [] },
  { dayNum: 7, date: "2026-05-26", label: "Wine Country", activities: [
    { id: "a14", name: "Hot Air Balloon Ride", type: "attraction", status: "pending", time: "06:30", location: "Yountville, Napa", lat: 38.4013, lng: -122.3608, cost: 280, comments: 0 },
  ], transports: [] },
  { dayNum: 8, date: "2026-05-27", label: "Departure", activities: [
    { id: "a15", name: "Airport Transfer", type: "attraction", status: "confirmed", time: "14:00", location: "SFO Airport", lat: 37.6213, lng: -122.3790, cost: 0, comments: 0 },
  ], transports: [] },
];

const CHANGELOG = [
  { id: "c1", who: "Sofia Chen", role: "expert", type: "suggest", what: "Replaced Holiday Inn with Hotel Bohème — better location", when: "2h ago" },
  { id: "c2", who: "AI Optimizer", role: "ai", type: "optimize", what: "Optimized Day 1 transit — saved 25 min", when: "5h ago" },
  { id: "c3", who: "You", role: "owner", type: "edit", what: "Added Chinatown dinner reservation", when: "Yesterday" },
];

const EXPERT_CHANGES = [
  {
    id: "ec1", type: "replace",
    title: "Hotel Swap",
    removeLine: "Holiday Inn Express · $189/night · 3★ · 0.8mi",
    addLine: "Hotel Bohème, North Beach · $175/night · 4★ · 0.3mi",
    reason: "Better location, boutique vibe, $14/night savings",
  },
  {
    id: "ec2", type: "time",
    title: "Dinner time — Day 1",
    removeLine: "Chinatown Dinner @ 6:00 PM",
    addLine: "Chinatown Dinner @ 6:30 PM",
    reason: "Better sunset views from the upstairs room",
  },
  {
    id: "ec3", type: "add",
    title: "New activity — Day 2",
    removeLine: null,
    addLine: "Morning yoga at Baker Beach · 08:00 AM · Free · Wellness",
    reason: "Great way to start the day before the coastal drive",
  },
];

const TYPE_COLORS: Record<string, { bg: string; fg: string; dot: string }> = {
  dining: { bg: "bg-amber-100", fg: "text-amber-800", dot: "#f59e0b" },
  attraction: { bg: "bg-blue-100", fg: "text-blue-800", dot: "#3b82f6" },
  shopping: { bg: "bg-pink-100", fg: "text-pink-800", dot: "#ec4899" },
};

const STATUS_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  confirmed: { bg: "bg-green-100", fg: "text-green-800", label: "Confirmed" },
  pending: { bg: "bg-yellow-100", fg: "text-yellow-800", label: "Pending" },
  suggested: { bg: "bg-indigo-100", fg: "text-indigo-800", label: "Suggested" },
};

const MODE_COLORS: Record<string, string> = {
  walk: "#22c55e", taxi: "#f59e0b", ferry: "#06b6d4", bus: "#8b5cf6", car: "#3b82f6",
};

const CHANGE_DOT: Record<string, string> = {
  expert: "bg-blue-500", ai: "bg-green-500", owner: "bg-amber-500",
};

const DAY_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316",
];

function ModeIcon({ mode, className = "w-4 h-4" }: { mode: string; className?: string }) {
  if (mode === "walk") return <Footprints className={className} />;
  if (mode === "taxi" || mode === "car") return <Car className={className} />;
  if (mode === "ferry") return <TrainFront className={className} />;
  if (mode === "bus") return <TrainFront className={className} />;
  return <Footprints className={className} />;
}

function formatDuration(mins: number) {
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function buildMapsUrl(location: string, lat?: number, lng?: number) {
  if (lat && lng) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(location)}`;
}

function buildAppleMapsUrl(location: string, lat?: number, lng?: number) {
  if (lat && lng) {
    return `https://maps.apple.com/?daddr=${lat},${lng}`;
  }
  return `https://maps.apple.com/?daddr=${encodeURIComponent(location)}`;
}

function buildWazeUrl(lat?: number, lng?: number) {
  if (lat && lng) {
    return `https://www.waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  }
  return null;
}

function HeroSection() {
  const daysUntil = 43;
  const gradient = "from-blue-600/40 via-indigo-500/25 to-purple-600/35";

  return (
    <div className={`relative h-52 overflow-hidden bg-gradient-to-br ${gradient}`}>
      <img
        src="https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=800&h=400&fit=crop"
        alt="San Francisco"
        className="w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
      <div className="absolute top-3 left-3 flex gap-2 items-center">
        <Badge className="bg-blue-600 text-white border-0 text-[11px] font-bold gap-1 px-2.5 py-1 uppercase tracking-wide">
          <Zap className="w-3 h-3" />
          {daysUntil}d away
        </Badge>
        <Badge className="bg-white/20 text-white border-0 text-[11px] backdrop-blur-sm gap-1 px-2.5 py-1">
          <Users className="w-3 h-3" />
          {TRIP.numberOfTravelers}
        </Badge>
      </div>
      <div className="absolute top-3 right-3 flex gap-2">
        <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-lg">
          <span className="text-sm font-bold text-gray-900">87</span>
        </div>
        <button className="bg-white/20 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-white/30 transition-colors">
          <Share2 className="w-3.5 h-3.5" /> Share
        </button>
        <button className="bg-white/20 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-white/30 transition-colors">
          <Download className="w-3.5 h-3.5" /> Export
        </button>
      </div>
      <div className="absolute bottom-4 left-5 right-5">
        <h3 className="font-['DM_Serif_Display',serif] text-[22px] text-white leading-tight drop-shadow-sm">
          {TRIP.title}
        </h3>
        <div className="flex flex-wrap gap-4 mt-2">
          <span className="text-[13px] text-white/85 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" /> {TRIP.destination}
          </span>
          <span className="text-[13px] text-white/85 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" /> May 20 – May 27, 2026
          </span>
          <span className="text-[13px] text-emerald-300 font-semibold">
            $4,200
            <span className="text-white/60 font-normal ml-1">– $1,050/person</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function ExpertNotesPanel() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mx-4 mb-3">
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-3 py-2 ${open ? "rounded-t-xl" : "rounded-xl"} bg-purple-50 border border-purple-200/60 text-left`}
      >
        <span className="flex items-center gap-2 text-[12px] font-bold text-purple-700 uppercase tracking-wider">
          <FileText className="w-3.5 h-3.5" /> Expert Notes
          <span className="bg-purple-200 text-purple-800 text-[10px] px-1.5 py-0.5 rounded-full font-bold">2</span>
        </span>
        <div className="flex items-center gap-2">
          {!open && <span className="text-[10px] text-purple-500 font-medium">Sofia Chen</span>}
          {open ? <ChevronUp className="w-3.5 h-3.5 text-purple-500" /> : <ChevronDown className="w-3.5 h-3.5 text-purple-500" />}
        </div>
      </button>
      {open && (
        <div className="border border-t-0 border-purple-200/60 rounded-b-xl bg-purple-50/50 px-3 py-2.5 space-y-2.5">
          <div className="flex gap-2.5">
            <div className="w-6 h-6 rounded-full bg-purple-200 flex items-center justify-center text-[9px] font-bold text-purple-800 flex-shrink-0 mt-0.5">SC</div>
            <div>
              <div className="text-[11px] text-purple-700"><span className="font-semibold">Sofia Chen</span> · 2h ago</div>
              <div className="text-[12px] text-gray-700 mt-0.5 leading-relaxed">
                "I'd recommend the boutique hotel on Lombard St instead — better location, same price range. Also moved dinner to 6:30 PM for sunset views from the upstairs room."
              </div>
            </div>
          </div>
          <div className="border-t border-purple-200/40 pt-2.5 flex gap-2.5">
            <div className="w-6 h-6 rounded-full bg-purple-200 flex items-center justify-center text-[9px] font-bold text-purple-800 flex-shrink-0 mt-0.5">SC</div>
            <div>
              <div className="text-[11px] text-purple-700"><span className="font-semibold">Sofia Chen</span> · Yesterday</div>
              <div className="text-[12px] text-gray-700 mt-0.5 leading-relaxed">
                "Added the Golden Gate walk — it's a must-do. Best in the early morning when the fog rolls in."
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewChangesBanner() {
  const [open, setOpen] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, "accepted" | "rejected">>({});

  const pending = EXPERT_CHANGES.filter(c => !decisions[c.id]);

  return (
    <div className="mx-4 mb-3">
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-3 py-2.5 ${open ? "rounded-t-xl" : "rounded-xl"} bg-blue-50 border border-blue-200/60 text-left`}
      >
        <span className="flex items-center gap-2 text-[12px] font-bold text-blue-700">
          <MessageSquare className="w-3.5 h-3.5" />
          {pending.length > 0 ? `${pending.length} expert change${pending.length > 1 ? "s" : ""} to review` : "All changes reviewed"}
        </span>
        <div className="flex items-center gap-2">
          {!open && pending.length > 0 && <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />}
          {open ? <ChevronUp className="w-3.5 h-3.5 text-blue-500" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-500" />}
        </div>
      </button>

      {open && (
        <div className="border border-t-0 border-blue-200/60 rounded-b-xl bg-blue-50/30 p-3 space-y-3">
          {pending.length > 0 && (
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { const d: Record<string, "accepted"> = {}; EXPERT_CHANGES.forEach(c => d[c.id] = "accepted"); setDecisions(d); }}
                className="text-[11px] font-semibold text-green-700 bg-green-100 px-3 py-1 rounded-lg hover:bg-green-200 transition-colors flex items-center gap-1"
              >
                <Check className="w-3 h-3" /> Accept All
              </button>
              <button
                onClick={() => { const d: Record<string, "rejected"> = {}; EXPERT_CHANGES.forEach(c => d[c.id] = "rejected"); setDecisions(d); }}
                className="text-[11px] font-semibold text-red-700 bg-red-100 px-3 py-1 rounded-lg hover:bg-red-200 transition-colors flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Reject All
              </button>
            </div>
          )}

          {EXPERT_CHANGES.map(change => {
            const decision = decisions[change.id];
            if (decision === "accepted") {
              return (
                <div key={change.id} className="rounded-lg bg-green-50 border border-green-200/60 px-3 py-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                  <span className="text-[12px] text-green-800 font-medium flex-1">{change.title}</span>
                  <span className="text-[10px] text-green-600 font-medium">Accepted</span>
                </div>
              );
            }
            if (decision === "rejected") {
              return (
                <div key={change.id} className="rounded-lg bg-red-50 border border-red-200/60 px-3 py-2 flex items-center gap-2 opacity-60">
                  <X className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <span className="text-[12px] text-red-800 font-medium flex-1 line-through">{change.title}</span>
                  <span className="text-[10px] text-red-600 font-medium">Rejected</span>
                </div>
              );
            }
            return (
              <div key={change.id} className="rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-[12px] font-bold text-gray-800">{change.title}</span>
                  <span className="text-[10px] text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full font-medium">
                    {change.type === "replace" ? "Swap" : change.type === "time" ? "Time change" : "New"}
                  </span>
                </div>
                <div className="px-3 py-2.5 space-y-1.5">
                  {change.removeLine && (
                    <div className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                      <span className="text-[12px] text-red-700 line-through">{change.removeLine}</span>
                    </div>
                  )}
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
                    <span className="text-[12px] text-green-700 font-medium">{change.addLine}</span>
                  </div>
                  {change.reason && (
                    <div className="text-[11px] text-gray-500 italic ml-3.5 mt-1">"{change.reason}"</div>
                  )}
                </div>
                <div className="px-3 py-2 border-t border-gray-100 flex justify-end gap-2">
                  <button
                    onClick={() => setDecisions(prev => ({ ...prev, [change.id]: "accepted" }))}
                    className="text-[11px] font-semibold text-white bg-green-600 px-3 py-1 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1"
                  >
                    <Check className="w-3 h-3" /> Accept
                  </button>
                  <button
                    onClick={() => setDecisions(prev => ({ ...prev, [change.id]: "rejected" }))}
                    className="text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 px-3 py-1 rounded-lg hover:bg-red-100 transition-colors flex items-center gap-1"
                  >
                    <X className="w-3 h-3" /> Reject
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
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

function MapControlCenter({ selectedDay, onSelectDay }: { selectedDay: number; onSelectDay: (d: number) => void }) {
  const day = DAYS[selectedDay];
  const dayColor = DAY_COLORS[selectedDay % DAY_COLORS.length];
  const allStops = day.activities;

  const fullRouteUrl = allStops.length > 0
    ? `https://www.google.com/maps/dir/${allStops.map(a => a.lat && a.lng ? `${a.lat},${a.lng}` : encodeURIComponent(a.location)).join("/")}`
    : "#";

  return (
    <div className="px-4 pb-4">
      <div className="flex items-center gap-1.5 mb-3 overflow-x-auto pb-1">
        {DAYS.map((d, i) => (
          <button
            key={d.dayNum}
            onClick={() => onSelectDay(i)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${
              i === selectedDay
                ? "text-white shadow-md"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
            style={i === selectedDay ? { backgroundColor: dayColor } : {}}
          >
            D{d.dayNum}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
        <div className="relative h-48 bg-gradient-to-br from-blue-50 via-blue-100/50 to-indigo-50 flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#94a3b8" strokeWidth="0.5" />
              </pattern>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          </div>

          {allStops.length > 1 && (
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 480 192">
              <polyline
                fill="none"
                stroke={dayColor}
                strokeWidth="2"
                strokeDasharray="6 4"
                opacity="0.5"
                points={allStops.map((a, i) => {
                  const x = 60 + (i * (360 / Math.max(allStops.length - 1, 1)));
                  const y = 60 + Math.sin(i * 1.2) * 35;
                  return `${x},${y}`;
                }).join(" ")}
              />
            </svg>
          )}

          {allStops.map((a, i) => {
            const x = allStops.length === 1 ? 240 : 60 + (i * (360 / Math.max(allStops.length - 1, 1)));
            const y = 60 + Math.sin(i * 1.2) * 35;
            return (
              <div
                key={a.id}
                className="absolute flex flex-col items-center"
                style={{ left: x, top: y, transform: "translate(-50%, -50%)" }}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shadow-lg border-2 border-white"
                  style={{ backgroundColor: dayColor }}
                >
                  {i + 1}
                </div>
                <div className="mt-1 px-1.5 py-0.5 bg-white/90 rounded text-[9px] font-medium text-gray-700 max-w-[80px] text-center truncate shadow-sm">
                  {a.name.length > 14 ? a.name.slice(0, 12) + "…" : a.name}
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-3 border-t border-gray-200 bg-white">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[13px] font-bold text-gray-900">Day {day.dayNum} — {day.label}</div>
              <div className="text-[11px] text-gray-500">{allStops.length} stop{allStops.length !== 1 ? "s" : ""} · {day.date}</div>
            </div>
            <a
              href={fullRouteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[11px] font-bold text-white px-3 py-1.5 rounded-lg shadow-sm hover:opacity-90 transition-opacity"
              style={{ backgroundColor: dayColor }}
              data-testid="open-full-route"
            >
              <Route className="w-3.5 h-3.5" /> Open Full Route
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="space-y-1.5">
            {allStops.map((a, i) => (
              <div key={a.id} className="flex items-center gap-2.5 py-2 px-2.5 rounded-lg hover:bg-gray-50 transition-colors group">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                  style={{ backgroundColor: dayColor }}
                >
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-gray-900 truncate">{a.name}</div>
                  <div className="text-[10px] text-gray-500 flex items-center gap-1 truncate">
                    <Clock className="w-2.5 h-2.5 flex-shrink-0" /> {a.time} · {a.location}
                  </div>
                </div>
                <NavigateDropdown location={a.location} lat={a.lat} lng={a.lng} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <a
          href={fullRouteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center gap-1 p-2.5 rounded-xl border border-gray-200 hover:bg-blue-50 hover:border-blue-200 transition-colors text-center"
        >
          <MapPin className="w-5 h-5 text-blue-600" />
          <span className="text-[10px] font-semibold text-gray-700">Google Maps</span>
        </a>
        <a
          href={allStops.length > 0 ? buildAppleMapsUrl(allStops[0].location, allStops[0].lat, allStops[0].lng) : "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center gap-1 p-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-colors text-center"
        >
          <Map className="w-5 h-5 text-gray-600" />
          <span className="text-[10px] font-semibold text-gray-700">Apple Maps</span>
        </a>
        <a
          href={allStops.length > 0 && allStops[0].lat ? `https://www.waze.com/ul?ll=${allStops[0].lat},${allStops[0].lng}&navigate=yes` : "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center gap-1 p-2.5 rounded-xl border border-gray-200 hover:bg-cyan-50 hover:border-cyan-200 transition-colors text-center"
        >
          <Route className="w-5 h-5 text-cyan-600" />
          <span className="text-[10px] font-semibold text-gray-700">Waze</span>
        </a>
      </div>
    </div>
  );
}

export function PlanCardFinal() {
  const [selectedDay, setSelectedDay] = useState(0);
  const [section, setSection] = useState<"activities" | "transport">("activities");
  const [showChanges, setShowChanges] = useState(false);
  const [viewMode, setViewMode] = useState<"card" | "map">("card");
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set([0]));

  const day = DAYS[selectedDay];
  const totalActivities = DAYS.reduce((s, d) => s + d.activities.length, 0);
  const confirmedActivities = DAYS.reduce((s, d) => s + d.activities.filter(a => a.status === "confirmed").length, 0);
  const totalLegs = DAYS.reduce((s, d) => s + d.transports.length, 0);
  const totalMinutes = DAYS.reduce((s, d) => s + d.transports.reduce((ts, t) => ts + t.duration, 0), 0);

  const toggleDay = (idx: number) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="bg-gray-100 p-4 flex justify-center">
      <div className="w-full max-w-[480px]">
        <Card className="overflow-hidden border border-gray-200 shadow-xl bg-white">
          <HeroSection />

          <div className="px-4 pt-3 flex gap-1.5">
            <button
              onClick={() => setViewMode("card")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all border-0 ${
                viewMode === "card" ? "bg-gray-900 text-white shadow-md" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
              data-testid="view-card"
            >
              <LayoutList className="w-4 h-4" /> Card View
            </button>
            <button
              onClick={() => setViewMode("map")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all border-0 ${
                viewMode === "map" ? "bg-blue-600 text-white shadow-md" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
              data-testid="view-map"
            >
              <Map className="w-4 h-4" /> Map Control Center
            </button>
          </div>

          <div className="grid grid-cols-4 border-b border-gray-200 mt-3">
            {[
              { label: "Days", value: `${DAYS.length}`, icon: Calendar },
              { label: "Activities", value: `${totalActivities}`, icon: Star },
              { label: "Transit", value: `${totalLegs}`, icon: TrainFront },
              { label: "Transit Time", value: formatDuration(totalMinutes), icon: Clock },
            ].map((s, i) => (
              <div key={i} className={`py-3 px-2 text-center ${i < 3 ? "border-r border-gray-200" : ""}`}>
                <div className="text-[10px] text-gray-400 mb-1 flex items-center justify-center gap-1">
                  <s.icon className="w-3 h-3" /> {s.label}
                </div>
                <div className="text-lg font-bold text-gray-900">{s.value}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 px-4 py-2.5 border-b border-gray-200 bg-gray-50/50">
            <Badge className="text-[11px] gap-1 bg-blue-100 text-blue-700 border-0">
              <Star className="w-3 h-3" /> 87 Score
            </Badge>
            <Badge className="text-[11px] gap-1 bg-green-100 text-green-700 border-0">
              $4,200 ($1,050/pp)
            </Badge>
            <Badge className="text-[11px] gap-1 bg-green-100 text-green-700 border-0">
              <TrendingDown className="w-3 h-3" /> Saves $380
            </Badge>
            <Badge className="text-[11px] gap-1 bg-purple-100 text-purple-700 border-0">
              <Heart className="w-3 h-3" /> 45m wellness
            </Badge>
          </div>

          {viewMode === "map" ? (
            <div className="pt-3">
              <MapControlCenter selectedDay={selectedDay} onSelectDay={setSelectedDay} />
            </div>
          ) : (
            <>
              <div className="flex border-b border-gray-200 px-4">
                <button
                  onClick={() => setSection("activities")}
                  className={`py-3 px-4 border-b-2 transition-all text-sm font-medium flex items-center gap-2 ${
                    section === "activities" ? "border-gray-900 text-gray-900 font-bold" : "border-transparent text-gray-400 hover:text-gray-600"
                  }`}
                  data-testid="tab-activities"
                >
                  Activities
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    section === "activities" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"
                  }`}>{totalActivities}</span>
                  <span className="text-[11px] text-gray-400 font-normal flex items-center gap-0.5">
                    <CheckCircle2 className="w-3 h-3" /> {confirmedActivities}/{totalActivities}
                  </span>
                </button>
                <button
                  onClick={() => setSection("transport")}
                  className={`py-3 px-4 border-b-2 transition-all text-sm font-medium flex items-center gap-2 ${
                    section === "transport" ? "border-gray-900 text-gray-900 font-bold" : "border-transparent text-gray-400 hover:text-gray-600"
                  }`}
                  data-testid="tab-transport"
                >
                  Transport
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    section === "transport" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"
                  }`}>{totalLegs}</span>
                </button>
                <button
                  onClick={() => setShowChanges(!showChanges)}
                  className={`ml-auto py-3 px-3 text-xs font-semibold flex items-center gap-1.5 ${
                    showChanges ? "text-amber-500" : "text-gray-400 hover:text-gray-600"
                  }`}
                  data-testid="toggle-changes"
                >
                  <History className="w-3.5 h-3.5" /> Changes
                  <span className="bg-amber-500 text-white w-5 h-5 rounded-full text-[10px] font-extrabold flex items-center justify-center">3</span>
                </button>
              </div>

              {showChanges && (
                <div className="bg-amber-50/50 border-b border-amber-200/30 px-5 py-4">
                  <div className="text-[11px] font-bold text-amber-600 mb-3 uppercase tracking-wider">Change History</div>
                  {CHANGELOG.map((c, i) => (
                    <div key={c.id} className={`flex items-start gap-2.5 py-2 ${i < CHANGELOG.length - 1 ? "border-b border-gray-200/30" : ""}`}>
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${CHANGE_DOT[c.role]}`} />
                      <div>
                        <span className="text-gray-900 text-[13px] font-semibold">{c.who}</span>
                        <span className="text-gray-500 text-[13px]"> – {c.what}</span>
                        <div className="text-gray-400 text-[11px] mt-0.5">{c.when}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <ExpertNotesPanel />
              <ReviewChangesBanner />

              {section === "activities" && (
                <div className="px-4 pb-4">
                  {DAYS.map((d, dayIdx) => {
                    const isExpanded = expandedDays.has(dayIdx);
                    const dayColor = DAY_COLORS[dayIdx % DAY_COLORS.length];
                    const dayConfirmed = d.activities.filter(a => a.status === "confirmed").length;

                    return (
                      <div key={d.dayNum} className="mb-2">
                        <button
                          onClick={() => toggleDay(dayIdx)}
                          className="w-full flex items-center gap-2.5 py-2.5 px-3 rounded-xl hover:bg-gray-50 transition-colors text-left group"
                          data-testid={`day-header-${d.dayNum}`}
                        >
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0"
                            style={{ backgroundColor: dayColor }}
                          >
                            {d.dayNum}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-bold text-gray-900">{d.label}</div>
                            <div className="text-[11px] text-gray-500">{d.date} · {d.activities.length} activities · {dayConfirmed} confirmed</div>
                          </div>
                          {d.activities.length > 0 && (
                            <div className="flex items-center gap-1.5">
                              {d.activities.some(a => a.expertNote) && (
                                <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                              )}
                              {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                            </div>
                          )}
                        </button>

                        {isExpanded && d.activities.length > 0 && (
                          <div className="ml-[18px] pl-4 border-l-2 mt-1 mb-2" style={{ borderColor: `${dayColor}30` }}>
                            {d.activities.map((a, i) => {
                              const tc = TYPE_COLORS[a.type] || TYPE_COLORS.attraction;
                              const ss = STATUS_STYLES[a.status] || STATUS_STYLES.pending;
                              return (
                                <div key={a.id}>
                                  <div className={`flex gap-3 py-3 ${i < d.activities.length - 1 ? "border-b border-gray-100" : ""}`}>
                                    <div className="flex flex-col items-center w-11 flex-shrink-0">
                                      <div className="text-[12px] font-bold text-gray-900">{a.time}</div>
                                      <div className="w-2.5 h-2.5 rounded-full mt-1.5 border-2 border-white" style={{ backgroundColor: tc.dot, boxShadow: `0 0 8px ${tc.dot}40` }} />
                                      {i < d.activities.length - 1 && (
                                        <div className="w-0.5 flex-1 mt-1" style={{ background: `linear-gradient(to bottom, ${tc.dot}40, transparent)` }} />
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-start gap-1.5 flex-wrap">
                                        <span className="text-[14px] font-semibold text-gray-900 flex-1 min-w-0">{a.name}</span>
                                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${tc.bg} ${tc.fg}`}>
                                          {a.type}
                                        </span>
                                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${ss.bg} ${ss.fg}`}>
                                          {ss.label}
                                        </span>
                                      </div>
                                      <div className="text-[11px] text-gray-500 mt-1 flex items-center gap-1">
                                        <MapPin className="w-3 h-3 flex-shrink-0" /> {a.location}
                                        {a.cost > 0 && <span className="ml-2 text-green-600 font-semibold">${a.cost}</span>}
                                      </div>
                                      <div className="flex items-center gap-2 mt-2">
                                        <NavigateDropdown location={a.location} lat={a.lat} lng={a.lng} />
                                        {a.comments > 0 && (
                                          <span className="text-[11px] text-blue-600 flex items-center gap-1">
                                            <MessageSquare className="w-3 h-3" /> {a.comments}
                                          </span>
                                        )}
                                      </div>
                                      {a.expertNote && (
                                        <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 italic flex items-start gap-1.5">
                                          <Lightbulb className="w-3 h-3 flex-shrink-0 mt-0.5 text-amber-600" />
                                          {a.expertNote}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  {i < d.activities.length - 1 && d.transports[i] && (
                                    <div className="flex gap-3 py-1 ml-11">
                                      <div className="flex items-center gap-2 text-[11px] text-gray-400 py-1 px-2 rounded-lg bg-gray-50">
                                        <span style={{ color: MODE_COLORS[d.transports[i].mode] || "#94a3b8" }}>
                                          <ModeIcon mode={d.transports[i].mode} className="w-3 h-3" />
                                        </span>
                                        <span className="font-medium text-gray-500 capitalize">{d.transports[i].mode}</span>
                                        <span>{formatDuration(d.transports[i].duration)}</span>
                                        {d.transports[i].cost > 0 && (
                                          <span className="text-green-600">${d.transports[i].cost}</span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {section === "transport" && (
                <div className="px-4 pb-4">
                  {DAYS.map((d, dayIdx) => {
                    if (d.transports.length === 0) return null;
                    const dayColor = DAY_COLORS[dayIdx % DAY_COLORS.length];
                    const isExpanded = expandedDays.has(dayIdx);

                    return (
                      <div key={d.dayNum} className="mb-2">
                        <button
                          onClick={() => toggleDay(dayIdx)}
                          className="w-full flex items-center gap-2.5 py-2.5 px-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
                        >
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0"
                            style={{ backgroundColor: dayColor }}
                          >
                            {d.dayNum}
                          </div>
                          <div className="flex-1">
                            <div className="text-[13px] font-bold text-gray-900">{d.label}</div>
                            <div className="text-[11px] text-gray-500">
                              {d.transports.length} leg{d.transports.length !== 1 ? "s" : ""} · {formatDuration(d.transports.reduce((s, t) => s + t.duration, 0))} · ${d.transports.reduce((s, t) => s + t.cost, 0)}
                            </div>
                          </div>
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                        </button>

                        {isExpanded && (
                          <div className="ml-[18px] pl-4 border-l-2 mt-1 mb-2" style={{ borderColor: `${dayColor}30` }}>
                            {d.transports.map((tr, i) => {
                              const ss = STATUS_STYLES[tr.status] || STATUS_STYLES.pending;
                              const modeColor = MODE_COLORS[tr.mode] || "#94a3b8";
                              return (
                                <div key={tr.id} className={`flex gap-3 py-3 ${i < d.transports.length - 1 ? "border-b border-gray-100" : ""}`}>
                                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${modeColor}15`, color: modeColor }}>
                                    <ModeIcon mode={tr.mode} className="w-4 h-4" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 text-[12px]">
                                      <span className="text-gray-500 truncate">{tr.from}</span>
                                      <span className="text-gray-300">→</span>
                                      <span className="text-gray-900 font-semibold truncate">{tr.to}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2 mt-1.5 items-center">
                                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold capitalize" style={{ backgroundColor: `${modeColor}20`, color: modeColor }}>{tr.mode}</span>
                                      <span className="text-[11px] text-gray-500 flex items-center gap-1"><Clock className="w-3 h-3" /> {formatDuration(tr.duration)}</span>
                                      {tr.cost > 0 && <span className="text-[11px] text-green-600 font-semibold">${tr.cost}</span>}
                                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${ss.bg} ${ss.fg}`}>{ss.label}</span>
                                    </div>
                                  </div>
                                  {tr.status === "suggested" && (
                                    <div className="flex flex-col gap-1 flex-shrink-0">
                                      <Button size="sm" className="text-[10px] h-6 px-2 bg-gray-900 text-white hover:bg-gray-800">Accept</Button>
                                      <Button size="sm" variant="outline" className="text-[10px] h-6 px-2">Change</Button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          <div className="px-4 pb-3 pt-2 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-shrink-0"
              onClick={() => setViewMode("map")}
              data-testid="footer-maps"
            >
              <MapPin className="w-3.5 h-3.5 mr-1" /> Maps
            </Button>
            <Button size="sm" className="flex-1 text-xs font-semibold bg-gray-900 text-white hover:bg-gray-800" data-testid="footer-itinerary">
              <Calendar className="w-3.5 h-3.5 mr-1" /> View Itinerary
              <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
            </Button>
          </div>

          <div className="flex gap-1.5 flex-wrap px-4 pb-2">
            <span className="text-[10px] px-2.5 py-1 rounded-full font-medium" style={{ background: "#E6F1FB", color: "#0C447C" }}>3 services</span>
            <span className="text-[10px] px-2.5 py-1 rounded-full font-medium" style={{ background: "#E1F5EE", color: "#085041" }}>{totalLegs} legs</span>
            <span className="text-[10px] px-2.5 py-1 rounded-full font-medium" style={{ background: "#EEEDFE", color: "#3C3489" }}>Expert assigned</span>
          </div>

          <div className="flex items-center gap-2.5 mx-4 mb-3 rounded-xl border border-gray-200 px-3 py-2 hover:bg-gray-50 transition-colors cursor-pointer">
            <div className="w-7 h-7 rounded-full bg-purple-200 flex items-center justify-center text-[9px] font-semibold text-purple-800 flex-shrink-0">SC</div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-semibold text-gray-900">Sofia Chen</div>
              <div className="text-[10px] truncate text-gray-500">"I recommend switching to the boutique h…"</div>
            </div>
            <div className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: "#FAEEDA", color: "#633806" }}>
              <Lightbulb className="w-2.5 h-2.5" /> 2
            </div>
          </div>

          <div className="mx-4 mb-4 rounded-xl bg-gray-50 border border-gray-200 px-3 py-2">
            <div className="flex items-start gap-2 py-0.5">
              <div className="w-1.5 h-1.5 rounded-full mt-[5px] flex-shrink-0 bg-red-500" />
              <span className="text-[11px] text-gray-900">Booking confirmation needed for Day 3 hotel</span>
            </div>
            <div className="flex items-start gap-2 py-0.5">
              <div className="w-1.5 h-1.5 rounded-full mt-[5px] flex-shrink-0 bg-amber-500" />
              <span className="text-[11px] text-gray-900">Expert suggested 2 new activities</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
