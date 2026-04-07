import {
  Calendar, ChevronRight, Clock, MapPin, Users, Share2, Download,
  Zap, Star, LayoutList, Map, CheckCircle2, History, Lock, Route,
  MessageSquare, Lightbulb, ChevronDown, ChevronUp, Check, X,
  Footprints, Car, TrainFront, Heart, TrendingDown,
  FileText, Eye, EyeOff,
} from "lucide-react";
import { useState } from "react";
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
      { id: "a1", name: "Golden Gate Bridge Walk", type: "attraction", status: "confirmed", time: "09:00", location: "Golden Gate Bridge, SF", cost: 0, comments: 2, expertNote: "Best visited early morning for the fog effect — truly magical views." },
      { id: "a2", name: "Fisherman's Wharf Lunch", type: "dining", status: "confirmed", time: "11:30", location: "Pier 39, SF", cost: 45, comments: 0 },
      { id: "a3", name: "Alcatraz Island Tour", type: "attraction", status: "pending", time: "14:00", location: "Alcatraz Island, SF Bay", cost: 42, comments: 1 },
      { id: "a4", name: "Chinatown Dinner", type: "dining", status: "confirmed", time: "18:30", location: "Grant Ave, Chinatown", cost: 55, comments: 0, expertNote: "Ask for the upstairs room — better ambiance and sunset views." },
      { id: "a5", name: "North Beach Gelato", type: "dining", status: "suggested", time: "20:30", location: "Columbus Ave, North Beach", cost: 12, comments: 0 },
    ],
    transports: [
      { id: "t1", mode: "walk", from: "Hotel", to: "Golden Gate", duration: 15, cost: 0, status: "confirmed" },
      { id: "t2", mode: "taxi", from: "Golden Gate", to: "Pier 39", duration: 20, cost: 18, status: "confirmed" },
      { id: "t3", mode: "ferry", from: "Pier 33", to: "Alcatraz", duration: 15, cost: 0, status: "confirmed", line: "Alcatraz Cruises" },
      { id: "t4", mode: "bus", from: "Pier 39", to: "Chinatown", duration: 12, cost: 3, status: "suggested", suggestedBy: "expert" },
    ],
  },
  { dayNum: 2, date: "2026-05-21", label: "Coastal Drive", activities: [], transports: [] },
  { dayNum: 3, date: "2026-05-22", label: "Big Sur", activities: [], transports: [] },
  { dayNum: 4, date: "2026-05-23", label: "Monterey", activities: [], transports: [] },
  { dayNum: 5, date: "2026-05-24", label: "Santa Cruz", activities: [], transports: [] },
  { dayNum: 6, date: "2026-05-25", label: "Napa Valley", activities: [], transports: [] },
  { dayNum: 7, date: "2026-05-26", label: "Wine Country", activities: [], transports: [] },
  { dayNum: 8, date: "2026-05-27", label: "Departure", activities: [], transports: [] },
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
  walk: "#22c55e", taxi: "#f59e0b", ferry: "#06b6d4", bus: "#8b5cf6",
};

const CHANGE_DOT: Record<string, string> = {
  expert: "bg-blue-500", ai: "bg-green-500", owner: "bg-amber-500",
};

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
  const [open, setOpen] = useState(true);

  return (
    <div className="mx-4 mb-3">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-t-xl bg-purple-50 border border-purple-200/60 text-left"
      >
        <span className="flex items-center gap-2 text-[12px] font-bold text-purple-700 uppercase tracking-wider">
          <FileText className="w-3.5 h-3.5" /> Expert Notes
          <span className="bg-purple-200 text-purple-800 text-[10px] px-1.5 py-0.5 rounded-full font-bold">2</span>
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-purple-500" /> : <ChevronDown className="w-3.5 h-3.5 text-purple-500" />}
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
  const [open, setOpen] = useState(true);
  const [decisions, setDecisions] = useState<Record<string, "accepted" | "rejected">>({});

  const pending = EXPERT_CHANGES.filter(c => !decisions[c.id]);

  return (
    <div className="mx-4 mb-3">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-t-xl bg-blue-50 border border-blue-200/60 text-left"
      >
        <span className="flex items-center gap-2 text-[12px] font-bold text-blue-700">
          <MessageSquare className="w-3.5 h-3.5" />
          {pending.length > 0 ? `${pending.length} expert change${pending.length > 1 ? "s" : ""} to review` : "All changes reviewed"}
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-blue-500" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-500" />}
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
                  <span className="text-[10px] text-green-600 font-medium">Accepted · Applied</span>
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

export function PlanCardFinal() {
  const [selectedDay, setSelectedDay] = useState(0);
  const [section, setSection] = useState<"activities" | "transport">("activities");
  const [showChanges, setShowChanges] = useState(false);
  const [viewMode, setViewMode] = useState<"card" | "map">("card");

  const day = DAYS[selectedDay];
  const totalActivities = 23;
  const confirmedActivities = 18;
  const totalLegs = 22;
  const totalMinutes = 225;

  return (
    <div className="bg-gray-100 p-6 flex justify-center">
      <div className="w-[480px]">
        <Card className="overflow-hidden border border-gray-200 shadow-xl bg-white">
          <HeroSection />

          <div className="px-5 pt-3 flex gap-1.5">
            <button
              onClick={() => setViewMode("card")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all border-0 ${
                viewMode === "card" ? "bg-gray-900 text-white shadow-md" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              <LayoutList className="w-4 h-4" /> Card View
            </button>
            <button
              onClick={() => setViewMode("map")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all border-0 ${
                viewMode === "map" ? "bg-gray-900 text-white shadow-md" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              <Map className="w-4 h-4" /> Map Control Center
            </button>
          </div>

          <div className="grid grid-cols-4 border-b border-gray-200 mt-3">
            {[
              { label: "Days", value: "8", icon: Calendar },
              { label: "Activities", value: "23", icon: Star },
              { label: "Transit Legs", value: "22", icon: TrainFront },
              { label: "Transit Time", value: formatDuration(totalMinutes), icon: Clock },
            ].map((s, i) => (
              <div key={i} className={`py-3 px-3 text-center ${i < 3 ? "border-r border-gray-200" : ""}`}>
                <div className="text-[11px] text-gray-400 mb-1 flex items-center justify-center gap-1">
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
              $4,200 ($1,050/person)
            </Badge>
            <Badge className="text-[11px] gap-1 bg-green-100 text-green-700 border-0">
              <TrendingDown className="w-3 h-3" /> Saves $380 (8%)
            </Badge>
            <Badge className="text-[11px] gap-1 bg-purple-100 text-purple-700 border-0">
              <Heart className="w-3 h-3" /> 45m wellness
            </Badge>
          </div>

          <div className="flex items-center gap-1 px-4 py-3 overflow-x-auto">
            {DAYS.map((d, i) => (
              <button
                key={d.dayNum}
                onClick={() => setSelectedDay(i)}
                className={`flex-shrink-0 w-9 h-9 rounded-full text-xs font-bold flex items-center justify-center transition-all ${
                  i === selectedDay ? "bg-gray-900 text-white shadow-md" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {d.dayNum}
              </button>
            ))}
          </div>

          <div className="flex border-b border-gray-200 px-4">
            <button
              onClick={() => setSection("activities")}
              className={`py-3 px-4 border-b-2 transition-all text-sm font-medium flex items-center gap-2 ${
                section === "activities" ? "border-gray-900 text-gray-900 font-bold" : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              Activities
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                section === "activities" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"
              }`}>{day.activities.length}</span>
              <span className="text-[11px] text-gray-400 font-normal flex items-center gap-0.5">
                <CheckCircle2 className="w-3 h-3" /> {confirmedActivities}/{totalActivities}
              </span>
            </button>
            <button
              onClick={() => setSection("transport")}
              className={`py-3 px-4 border-b-2 transition-all text-sm font-medium flex items-center gap-2 ${
                section === "transport" ? "border-gray-900 text-gray-900 font-bold" : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              Transport
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                section === "transport" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"
              }`}>{day.transports.length}</span>
            </button>
            <button
              onClick={() => setShowChanges(!showChanges)}
              className={`ml-auto py-3 px-3 text-xs font-semibold flex items-center gap-1.5 ${
                showChanges ? "text-amber-500" : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <History className="w-3.5 h-3.5" /> Changes
              <span className="bg-amber-500 text-white w-5 h-5 rounded-full text-[10px] font-extrabold flex items-center justify-center">3</span>
              <span className="text-[10px] text-blue-500 font-medium">1 expert</span>
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
            <div className="px-5 pt-1 pb-4">
              <div className="text-[13px] text-gray-500 mb-3">
                {day.date} — <span className="text-gray-900 font-semibold">{day.label}</span>
              </div>
              {day.activities.map((a, i) => {
                const tc = TYPE_COLORS[a.type] || TYPE_COLORS.attraction;
                const ss = STATUS_STYLES[a.status] || STATUS_STYLES.pending;
                return (
                  <div key={a.id}>
                    <div className={`flex gap-3.5 py-3.5 ${i < day.activities.length - 1 ? "border-b border-gray-100" : ""}`}>
                      <div className="flex flex-col items-center w-12 flex-shrink-0">
                        <div className="text-[13px] font-bold text-gray-900">{a.time}</div>
                        <div className="w-2.5 h-2.5 rounded-full mt-1.5 border-2 border-white" style={{ backgroundColor: tc.dot, boxShadow: `0 0 8px ${tc.dot}40` }} />
                        {i < day.activities.length - 1 && (
                          <div className="w-0.5 flex-1 mt-1" style={{ background: `linear-gradient(to bottom, ${tc.dot}40, transparent)` }} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2 flex-wrap">
                          <span className="text-[15px] font-semibold text-gray-900 flex-1 min-w-0">{a.name}</span>
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${tc.bg} ${tc.fg}`}>
                            {a.type}
                          </span>
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${ss.bg} ${ss.fg}`}>
                            {ss.label}
                          </span>
                        </div>
                        <div className="text-[12px] text-gray-500 mt-1 flex items-center gap-1">
                          <MapPin className="w-3 h-3 flex-shrink-0" /> {a.location}
                          {a.cost > 0 && <span className="ml-2 text-green-600 font-semibold">${a.cost}</span>}
                        </div>
                        {a.expertNote && (
                          <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 italic">
                            💡 {a.expertNote}
                          </div>
                        )}
                        {a.comments > 0 && (
                          <div className="flex gap-2.5 mt-2">
                            <span className="text-[11px] text-blue-600 flex items-center gap-1">
                              <MessageSquare className="w-3 h-3" /> {a.comments} comment{a.comments > 1 ? "s" : ""}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    {i < day.activities.length - 1 && day.transports[i] && (
                      <div className="flex gap-3.5 py-1">
                        <div className="flex flex-col items-center w-12 flex-shrink-0">
                          <div className="w-px h-full bg-gray-200" style={{ minHeight: 16 }} />
                        </div>
                        <div className="flex items-center gap-2 text-[12px] text-gray-400 py-1">
                          <span style={{ color: MODE_COLORS[day.transports[i].mode] || "#94a3b8" }}>
                            <ModeIcon mode={day.transports[i].mode} className="w-3.5 h-3.5" />
                          </span>
                          <span className="font-medium text-gray-500 capitalize">{day.transports[i].mode}</span>
                          <span>{formatDuration(day.transports[i].duration)}</span>
                          {day.transports[i].cost > 0 && (
                            <span className="text-green-600">${day.transports[i].cost}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {section === "transport" && (
            <div className="p-5">
              {day.transports.length > 0 && (
                <div className="bg-blue-50 border border-blue-200/50 rounded-xl p-3.5 flex flex-wrap justify-between items-center mb-5 gap-3">
                  <div className="flex gap-6">
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider">Legs</div>
                      <div className="text-lg font-bold text-blue-600">{day.transports.length}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider">Total Time</div>
                      <div className="text-lg font-bold text-blue-600">{formatDuration(day.transports.reduce((s, t) => s + t.duration, 0))}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider">Est. Cost</div>
                      <div className="text-lg font-bold text-green-600">${day.transports.reduce((s, t) => s + t.cost, 0)}</div>
                    </div>
                  </div>
                </div>
              )}
              {day.transports.map((tr, i) => {
                const ss = STATUS_STYLES[tr.status] || STATUS_STYLES.pending;
                const modeColor = MODE_COLORS[tr.mode] || "#94a3b8";
                return (
                  <div key={tr.id} className={`flex gap-3.5 py-4 ${i < day.transports.length - 1 ? "border-b border-gray-100" : ""}`}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${modeColor}15`, color: modeColor }}>
                      <ModeIcon mode={tr.mode} className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-[13px]">
                        <span className="text-gray-500 truncate">{tr.from}</span>
                        <span className="text-gray-300">→</span>
                        <span className="text-gray-900 font-semibold truncate">{tr.to}</span>
                      </div>
                      <div className="flex flex-wrap gap-2.5 mt-1.5 items-center">
                        <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold capitalize" style={{ backgroundColor: `${modeColor}20`, color: modeColor }}>{tr.mode}</span>
                        <span className="text-[12px] text-gray-500 flex items-center gap-1"><Clock className="w-3 h-3" /> {formatDuration(tr.duration)}</span>
                        {tr.cost > 0 && <span className="text-[12px] text-green-600 font-semibold">${tr.cost}</span>}
                        {tr.line && <span className="text-[11px] text-gray-400 italic">{tr.line}</span>}
                      </div>
                      <div className="flex gap-2 mt-2 items-center">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${ss.bg} ${ss.fg}`}>{ss.label}</span>
                        {tr.suggestedBy && (
                          <span className="text-[11px] text-purple-600 flex items-center gap-1">Expert suggested</span>
                        )}
                      </div>
                    </div>
                    {tr.status === "suggested" && (
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        <Button size="sm" className="text-[11px] h-7 px-3 bg-gray-900 text-white hover:bg-gray-800">Accept</Button>
                        <Button size="sm" variant="outline" className="text-[11px] h-7 px-3">Change</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="px-5 pb-3 pt-2 flex gap-2">
            <Button variant="outline" size="sm" className="flex-shrink-0">
              <MapPin className="w-3.5 h-3.5 mr-1" /> Maps
            </Button>
            <Button size="sm" className="flex-1 text-xs font-semibold bg-gray-900 text-white hover:bg-gray-800">
              <Calendar className="w-3.5 h-3.5 mr-1" /> View Itinerary
              <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
            </Button>
          </div>

          <div className="flex gap-1.5 flex-wrap px-5 pb-2">
            <span className="text-[10px] px-2.5 py-1 rounded-full font-medium" style={{ background: "#E6F1FB", color: "#0C447C" }}>💼 3 services</span>
            <span className="text-[10px] px-2.5 py-1 rounded-full font-medium" style={{ background: "#E1F5EE", color: "#085041" }}>🚗 22 legs</span>
            <span className="text-[10px] px-2.5 py-1 rounded-full font-medium" style={{ background: "#EEEDFE", color: "#3C3489" }}>👥 Expert assigned</span>
          </div>

          <div className="flex items-center gap-2.5 mx-5 mb-3 rounded-xl border border-gray-200 px-3 py-2 hover:bg-gray-50 transition-colors cursor-pointer">
            <div className="w-7 h-7 rounded-full bg-purple-200 flex items-center justify-center text-[9px] font-semibold text-purple-800 flex-shrink-0">SC</div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-semibold text-gray-900">Sofia Chen</div>
              <div className="text-[10px] truncate text-gray-500">"I recommend switching to the boutique h…"</div>
            </div>
            <div className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: "#FAEEDA", color: "#633806" }}>
              <Lightbulb className="w-2.5 h-2.5" /> 2
            </div>
          </div>

          <div className="mx-5 mb-4 rounded-xl bg-gray-50 border border-gray-200 px-3 py-2">
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
