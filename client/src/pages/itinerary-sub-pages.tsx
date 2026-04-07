import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ActivityDiff, TransportDiff } from "@/components/itinerary/ItineraryCard";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import {
  ArrowLeft, Clock, MapPin, Navigation, ExternalLink, Map,
  Route, DollarSign, Hash, CheckCircle2, XCircle, AlertCircle,
  Filter, History, ChevronRight, Footprints, Car, Ship, Bus,
  Train, TrainFront, CarTaxiFront, KeyRound, Sparkles, Building2,
  Ticket, Check, X, Hotel, Compass, Shield, UtensilsCrossed,
  FileText, Copy, Phone, Globe, ChevronDown, ChevronUp,
  BarChart3, Calendar, Activity as ActivityIcon,
  Printer, Download, Send, MessageSquare, Lightbulb, Repeat, Star, ArrowRight,
  Leaf, TrendingUp, Heart, Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// ─────────────────────────────────────────────
// Types (derived from itinerary-view.tsx structure)
// ─────────────────────────────────────────────
interface ApiActivity {
  id: string;
  name: string;
  startTime?: string | null;
  endTime?: string | null;
  lat?: number | null;
  lng?: number | null;
  category?: string | null;
  cost?: number;
  description?: string | null;
  location?: string | null;
  duration?: number | null;
  phone?: string | null;
  website?: string | null;
  imageUrl?: string | null;
}

interface ApiTransportLeg {
  id: string;
  legOrder: number;
  userSelectedMode?: string | null;
  recommendedMode?: string | null;
  estimatedDurationMinutes?: number | null;
  estimatedCostUsd?: number | null;
  fromLabel?: string | null;
  toLabel?: string | null;
  departureTime?: string | null;
  arrivalTime?: string | null;
  distanceKm?: number | null;
  operatorName?: string | null;
  bookingRef?: string | null;
  notes?: string | null;
}

interface ApiDay {
  dayNumber: number;
  date?: string;
  activities: ApiActivity[];
  transportLegs: ApiTransportLeg[];
}

interface ExpertDiff {
  activityDiffs?: Record<string, ActivityDiff>;
  transportDiffs?: Record<string, TransportDiff>;
  submittedAt?: string;
}

interface SharedItineraryResponse {
  variant: {
    id: string;
    name: string;
    description?: string | null;
    destination?: string | null;
    dateRange?: { start?: string | null; end?: string | null };
    totalCost?: string | number | null;
    optimizationScore?: number | null;
    budget?: number | null;
    travelers?: number | null;
    days: ApiDay[];
    transportSummary?: {
      totalLegs: number;
      totalMinutes: number;
      totalCostUsd: number;
    };
  };
  sharedBy?: { name: string; avatarUrl?: string | null; userId?: string };
  permissions?: string;
  shareToken?: string;
  expertStatus?: string;
  expertNotes?: string | null;
  expertDiff?: ExpertDiff | null;
  sharedWithExpert?: boolean;
  isOwner?: boolean;
}

// ─────────────────────────────────────────────
// Shared constants
// ─────────────────────────────────────────────
const DAY_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b",
  "#8b5cf6", "#ec4899", "#06b6d4", "#f97316",
];

const TYPE_COLORS: Record<string, { bg: string; fg: string }> = {
  dining: { bg: "bg-amber-100", fg: "text-amber-800" },
  attraction: { bg: "bg-blue-100", fg: "text-blue-800" },
  shopping: { bg: "bg-pink-100", fg: "text-pink-800" },
  activity: { bg: "bg-green-100", fg: "text-green-800" },
  transport: { bg: "bg-gray-100", fg: "text-gray-800" },
};

const MODE_COLORS: Record<string, string> = {
  walk: "#22c55e", taxi: "#f59e0b", ferry: "#06b6d4", bus: "#8b5cf6",
  car: "#3b82f6", train: "#6366f1", subway: "#a855f7", rideshare: "#f59e0b",
  private_car: "#0ea5e9", rental_car: "#14b8a6", transit: "#6b7280",
};

const MODE_LABELS: Record<string, string> = {
  walk: "Walk", taxi: "Taxi", bus: "Bus", ferry: "Ferry", car: "Car",
  train: "Train", subway: "Subway", rideshare: "Rideshare",
  private_car: "Private Car", rental_car: "Rental Car", transit: "Transit",
};

const TRANSPORT_OPTIONS = [
  { mode: "walk", label: "Walk", icon: <Footprints className="w-4 h-4" />, color: "#22c55e" },
  { mode: "taxi", label: "Taxi", icon: <CarTaxiFront className="w-4 h-4" />, color: "#f59e0b" },
  { mode: "bus", label: "Bus", icon: <Bus className="w-4 h-4" />, color: "#8b5cf6" },
  { mode: "train", label: "Train", icon: <Train className="w-4 h-4" />, color: "#6366f1" },
  { mode: "ferry", label: "Ferry", icon: <Ship className="w-4 h-4" />, color: "#06b6d4" },
  { mode: "car", label: "Car", icon: <Car className="w-4 h-4" />, color: "#3b82f6" },
];

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function formatDuration(mins: number) {
  if (!mins || mins <= 0) return "—";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60 > 0 ? `${mins % 60}m` : ""}`.trim();
}

function formatTime(timeStr?: string | null): string {
  if (!timeStr) return "";
  try {
    return new Date(timeStr).toLocaleTimeString("en-US", {
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
  } catch {
    return timeStr;
  }
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function buildMapsUrl(location: string, lat?: number | null, lng?: number | null) {
  if (lat && lng) return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(location)}`;
}

function buildAppleMapsUrl(location: string, lat?: number | null, lng?: number | null) {
  if (lat && lng) return `https://maps.apple.com/?daddr=${lat},${lng}`;
  return `https://maps.apple.com/?daddr=${encodeURIComponent(location)}`;
}

function buildWazeUrl(lat?: number | null, lng?: number | null) {
  if (lat && lng) return `https://www.waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  return null;
}

function ModeIcon({ mode, className = "w-4 h-4", style }: { mode: string; className?: string; style?: React.CSSProperties }) {
  if (mode === "walk") return <Footprints className={className} style={style} />;
  if (mode === "taxi" || mode === "rideshare") return <CarTaxiFront className={className} style={style} />;
  if (mode === "car" || mode === "private_car") return <Car className={className} style={style} />;
  if (mode === "ferry") return <Ship className={className} style={style} />;
  if (mode === "bus") return <Bus className={className} style={style} />;
  if (mode === "train") return <Train className={className} style={style} />;
  if (mode === "subway") return <TrainFront className={className} style={style} />;
  if (mode === "rental_car") return <KeyRound className={className} style={style} />;
  return <Footprints className={className} style={style} />;
}

function NavigateDropdown({
  location, lat, lng,
}: {
  location: string; lat?: number | null; lng?: number | null;
}) {
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
            <a
              href={buildMapsUrl(location, lat, lng)}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 text-[12px] text-gray-800 font-medium"
            >
              <div className="w-5 h-5 rounded bg-blue-100 flex items-center justify-center">
                <MapPin className="w-3 h-3 text-blue-600" />
              </div>
              Google Maps <ExternalLink className="w-3 h-3 text-gray-400 ml-auto" />
            </a>
            <a
              href={buildAppleMapsUrl(location, lat, lng)}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 text-[12px] text-gray-800 font-medium"
            >
              <div className="w-5 h-5 rounded bg-gray-100 flex items-center justify-center">
                <Map className="w-3 h-3 text-gray-600" />
              </div>
              Apple Maps <ExternalLink className="w-3 h-3 text-gray-400 ml-auto" />
            </a>
            {wazeUrl && (
              <a
                href={wazeUrl}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 text-[12px] text-gray-800 font-medium"
              >
                <div className="w-5 h-5 rounded bg-cyan-100 flex items-center justify-center">
                  <Route className="w-3 h-3 text-cyan-600" />
                </div>
                Waze <ExternalLink className="w-3 h-3 text-gray-400 ml-auto" />
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-gray-50 p-4 space-y-3">
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="text-center">
        <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
        <p className="text-[14px] font-semibold text-gray-800 mb-2">Failed to load itinerary</p>
        <p className="text-[12px] text-gray-500 mb-4">{message}</p>
        <Button size="sm" variant="outline" onClick={() => window.history.back()}>Go Back</Button>
      </div>
    </div>
  );
}

function useItineraryData(token: string) {
  return useQuery<SharedItineraryResponse>({
    queryKey: ["/api/itinerary-share", token],
    queryFn: async () => {
      const res = await fetch(`/api/itinerary-share/${token}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to load" }));
        throw new Error((err as { error?: string }).error || "Failed to load itinerary");
      }
      return res.json() as Promise<SharedItineraryResponse>;
    },
    enabled: !!token,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

// ─────────────────────────────────────────────
// Day section (used in FullItineraryPage)
// ─────────────────────────────────────────────
function DaySection({
  day, dayIndex, token, onNavigateActivity, onNavigateTransport, expertDiff,
}: {
  day: ApiDay;
  dayIndex: number;
  token: string;
  onNavigateActivity: (id: string) => void;
  onNavigateTransport: (id: string) => void;
  expertDiff?: ExpertDiff | null;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const dayColor = DAY_COLORS[dayIndex % DAY_COLORS.length];
  const dayCost = day.activities.reduce((s, a) => s + (a.cost ?? 0), 0);
  const transitTime = day.transportLegs.reduce((s, t) => s + (t.estimatedDurationMinutes ?? 0), 0);
  const transitCost = day.transportLegs.reduce((s, t) => s + (t.estimatedCostUsd ?? 0), 0);
  const dateLabel = day.date ? formatDate(day.date) : `Day ${day.dayNumber}`;
  const confirmedCount = day.activities.filter(a => !expertDiff?.activityDiffs?.[a.id]).length;

  type Entry =
    | { kind: "activity"; item: ApiActivity; seq: number }
    | { kind: "transport"; item: ApiTransportLeg };

  const entries: Entry[] = [];
  day.activities.forEach((a, i) => {
    if (i > 0 && day.transportLegs[i - 1]) {
      entries.push({ kind: "transport", item: day.transportLegs[i - 1] });
    }
    entries.push({ kind: "activity", item: a, seq: i });
  });

  return (
    <div className="mb-4" data-testid={`day-section-${day.dayNumber}`}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors"
        style={{ backgroundColor: `${dayColor}12` }}
        data-testid={`button-collapse-day-${day.dayNumber}`}
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-[13px] font-bold"
          style={{ backgroundColor: dayColor }}
        >
          D{day.dayNumber}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-bold text-gray-900">{dateLabel}</span>
            {day.date && <span className="text-[11px] text-gray-400">{day.date}</span>}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-500">
            <span>{day.activities.length} activities</span>
            <span>{confirmedCount} confirmed</span>
            {(dayCost + transitCost) > 0 && (
              <span className="text-emerald-700 font-semibold">${(dayCost + transitCost).toLocaleString()}</span>
            )}
            {transitTime > 0 && <span>{formatDuration(transitTime)} transit</span>}
          </div>
        </div>
        {collapsed ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
      </button>

      {!collapsed && (
        <div className="mt-2 space-y-1">
          {entries.map((entry, idx) => {
            if (entry.kind === "activity") {
              const a = entry.item;
              const tc = TYPE_COLORS[a.category ?? "activity"] ?? TYPE_COLORS.activity;
              const actDiff = expertDiff?.activityDiffs?.[a.id];
              const hasSuggestion = !!actDiff;
              const durationMins = a.duration ?? (a.startTime && a.endTime
                ? Math.round((new Date(a.endTime).getTime() - new Date(a.startTime).getTime()) / 60000)
                : null);
              return (
                <div
                  key={a.id}
                  className={`bg-white rounded-xl border shadow-sm p-3 ${hasSuggestion ? "border-blue-200" : "border-gray-100"}`}
                  data-testid={`activity-row-${a.id}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-50 border-2 border-gray-200 flex items-center justify-center text-[11px] font-bold text-gray-600 flex-shrink-0">
                      {entry.seq + 1}
                    </div>
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => onNavigateActivity(a.id)}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-bold text-gray-900">{a.name}</span>
                        {a.category && (
                          <Badge className={`text-[9px] px-1.5 py-0 border-0 ${tc.bg} ${tc.fg}`}>
                            {a.category}
                          </Badge>
                        )}
                        {hasSuggestion ? (
                          <Badge className="text-[9px] px-1.5 py-0 border-0 bg-blue-100 text-blue-700">
                            Suggested
                          </Badge>
                        ) : (
                          <Badge className="text-[9px] px-1.5 py-0 border-0 bg-green-100 text-green-700">
                            Confirmed
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {a.startTime && (
                          <span className="text-[11px] text-gray-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {formatTime(a.startTime)}
                            {actDiff?.startTime && actDiff.startTime !== a.startTime && (
                              <span className="text-[10px] text-blue-600 ml-1">→ {formatTime(actDiff.startTime)}</span>
                            )}
                          </span>
                        )}
                        {a.location && (
                          <span className="text-[11px] text-gray-500 flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {a.location}
                          </span>
                        )}
                        {durationMins && durationMins > 0 && (
                          <span className="text-[11px] text-gray-500">{formatDuration(durationMins)}</span>
                        )}
                      </div>
                      {(a.cost ?? 0) > 0 && (
                        <div className="text-[12px] font-semibold text-emerald-700 mt-1">${a.cost}</div>
                      )}
                    </div>
                    <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <NavigateDropdown location={a.location ?? a.name} lat={a.lat} lng={a.lng} />
                    </div>
                  </div>
                  {a.description && (
                    <div className="mt-2 ml-11 flex items-start gap-1.5 bg-purple-50 rounded-lg px-2.5 py-1.5">
                      <Lightbulb className="w-3 h-3 text-purple-500 flex-shrink-0 mt-0.5" />
                      <span className="text-[11px] text-purple-700 italic leading-relaxed">"{a.description}"</span>
                    </div>
                  )}
                </div>
              );
            } else {
              const t = entry.item;
              const mode = t.userSelectedMode ?? t.recommendedMode ?? "transit";
              const modeColor = MODE_COLORS[mode] ?? "#6b7280";
              const isTraveloure = t.operatorName?.toLowerCase().includes("traveloure");
              return (
                <button
                  key={t.id}
                  onClick={() => onNavigateTransport(t.id)}
                  className="flex items-center gap-2 py-2 px-3 ml-6 border-l-2 border-dashed w-full text-left hover:bg-gray-50 transition-colors rounded-r-lg"
                  style={{ borderColor: `${modeColor}60` }}
                  data-testid={`transport-row-${t.id}`}
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${modeColor}20` }}
                  >
                    <ModeIcon mode={mode} className="w-3 h-3" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] text-gray-700 font-semibold">{MODE_LABELS[mode] ?? mode}</span>
                    {t.fromLabel && t.toLabel && (
                      <span className="text-[10px] text-gray-400 ml-1.5">
                        {t.fromLabel} → {t.toLabel}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-[10px] text-gray-500 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" /> {formatDuration(t.estimatedDurationMinutes ?? 0)}
                    </span>
                    {(t.estimatedCostUsd ?? 0) > 0 ? (
                      <span className="text-[10px] font-semibold text-gray-700">${t.estimatedCostUsd}</span>
                    ) : (
                      <span className="text-[10px] font-semibold text-green-600">Free</span>
                    )}
                    {isTraveloure && (
                      <span className="text-[8px] bg-sky-100 text-sky-700 px-1 py-0.5 rounded font-bold">TRAVELOURE</span>
                    )}
                  </div>
                </button>
              );
            }
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 1. FULL ITINERARY PAGE
// Primary route: /itinerary-view/:token
// Redirects experts to /itinerary-view/:token/expert-review
// ─────────────────────────────────────────────
export function FullItineraryPage() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const { data, isLoading, error } = useItineraryData(token);

  // Redirect expert roles after data loads — useEffect avoids render side-effects
  useEffect(() => {
    if (!data) return;
    const isExpert = data.permissions === "suggest" || data.permissions === "edit";
    if (isExpert) {
      navigate(`/itinerary-view/${token}/expert-review`, { replace: true });
    }
  }, [data, token, navigate]);

  if (isLoading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={(error as Error).message} />;
  if (!data) return null;

  // Render nothing for experts while redirect fires (they won't see this for more than one frame)
  if (data.permissions === "suggest" || data.permissions === "edit") {
    return null;
  }

  const { variant } = data;
  const allActivities = variant.days.flatMap(d => d.activities);
  const allTransports = variant.days.flatMap(d => d.transportLegs);
  const totalCost =
    parseFloat(String(variant.totalCost ?? 0)) ||
    allActivities.reduce((s, a) => s + (a.cost ?? 0), 0) +
    allTransports.reduce((s, t) => s + (t.estimatedCostUsd ?? 0), 0);
  const totalTransitTime =
    variant.transportSummary?.totalMinutes ??
    allTransports.reduce((s, t) => s + (t.estimatedDurationMinutes ?? 0), 0);
  const confirmedActivityCount = allActivities.filter(
    a => !data.expertDiff?.activityDiffs?.[a.id]
  ).length;

  const destination = variant.destination ?? variant.name;
  const hasExpertDiff = !!(data.expertDiff?.activityDiffs || data.expertDiff?.transportDiffs);
  // Show the review banner whenever there is any expert diff, regardless of status
  const hasPendingChanges = hasExpertDiff;

  return (
    <div className="min-h-screen bg-gray-50" data-testid="full-itinerary-page">
      {/* Sticky header with back + title + nav icons */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200">
        <div className="px-4 py-2.5 flex items-center gap-2">
          <button
            onClick={() => window.history.back()}
            className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors flex-shrink-0"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4 text-gray-700" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-[14px] font-bold text-gray-900 truncate">{destination}</h1>
            <p className="text-[10px] text-gray-500">{variant.days.length} days · {allActivities.length} activities</p>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => window.print()}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors text-gray-500"
              title="Print"
              data-testid="header-print"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                const content = `${destination}\n\n${variant.days.map(d =>
                  `Day ${d.dayNumber} — ${d.date ?? ""}\n${d.activities.map((a, i) =>
                    `${i + 1}. ${a.name}${a.startTime ? ` (${formatTime(a.startTime)})` : ""}${a.location ? ` — ${a.location}` : ""}`
                  ).join("\n")}`
                ).join("\n\n")}`;
                const blob = new Blob([content], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = `${destination}-itinerary.txt`; a.click();
                URL.revokeObjectURL(url);
              }}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors text-gray-500"
              title="Download"
              data-testid="header-download"
            >
              <Download className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-gray-200 mx-1" />
            <button
              onClick={() => navigate(`/itinerary-view/${token}/map`)}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors text-gray-500"
              title="Map"
              data-testid="header-nav-map"
            >
              <MapPin className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate(`/itinerary-view/${token}/stats`)}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors text-gray-500"
              title="Stats"
              data-testid="header-nav-stats"
            >
              <BarChart3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate(`/itinerary-view/${token}/services`)}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors text-gray-500"
              title="Services"
              data-testid="header-nav-services"
            >
              <FileText className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate(`/itinerary-view/${token}/chat`)}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors text-gray-500"
              title="Expert Chat"
              data-testid="header-nav-chat"
            >
              <MessageSquare className="w-4 h-4" />
            </button>
            {hasExpertDiff && (
              <button
                onClick={() => navigate(`/itinerary-view/${token}/changes`)}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-blue-50 transition-colors text-blue-600"
                title="Review Changes"
                data-testid="header-nav-changes"
              >
                <History className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Pending changes banner */}
      {hasPendingChanges && (
        <div
          className="mx-4 mt-3 p-3 rounded-xl bg-blue-50 border border-blue-200 flex items-center gap-2.5"
          data-testid="pending-changes-banner"
        >
          <History className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <p className="text-[12px] text-blue-800 flex-1">
            Your travel expert suggested changes. <strong>Review them below.</strong>
          </p>
          <button
            onClick={() => navigate(`/itinerary-view/${token}/changes`)}
            className="text-[11px] font-bold text-blue-600 underline flex-shrink-0"
            data-testid="button-view-changes"
          >
            View
          </button>
        </div>
      )}

      {/* Expert notes inline */}
      {data.expertNotes && (
        <div className="mx-4 mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5" data-testid="expert-notes-inline">
          <Lightbulb className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold text-amber-800 mb-0.5">
              Expert Note{data.sharedBy ? ` from ${data.sharedBy.name}` : ""}
            </div>
            <p className="text-[12px] text-amber-900 leading-relaxed italic">"{data.expertNotes}"</p>
          </div>
        </div>
      )}

      <div className="p-4">
        {/* Summary stats */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          <Card className="p-3 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <ActivityIcon className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <div className="text-[18px] font-bold text-gray-900">{allActivities.length}</div>
              <div className="text-[10px] text-gray-500">Activities</div>
            </div>
          </Card>
          <Card className="p-3 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <div className="text-[18px] font-bold text-gray-900">{confirmedActivityCount}</div>
              <div className="text-[10px] text-gray-500">Confirmed</div>
            </div>
          </Card>
          <Card className="p-3 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <div className="text-[18px] font-bold text-gray-900">${totalCost.toLocaleString()}</div>
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

        {variant.days.map((day, i) => (
          <DaySection
            key={day.dayNumber}
            day={day}
            dayIndex={i}
            token={token}
            expertDiff={data.expertDiff}
            onNavigateActivity={(id) => navigate(`/itinerary-view/${token}/activity/${id}`)}
            onNavigateTransport={(id) => navigate(`/itinerary-view/${token}/transport/${id}`)}
          />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 2. ACTIVITY DETAIL PAGE
// ─────────────────────────────────────────────
export function ActivityDetailPage() {
  const { token, activityId } = useParams<{ token: string; activityId: string }>();
  const [, navigate] = useLocation();
  const { data, isLoading, error } = useItineraryData(token);

  if (isLoading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={(error as Error).message} />;
  if (!data) return null;

  let activity: ApiActivity | undefined;
  let dayNumber = 0;
  let dayIndex = 0;
  let activityIndex = 0;
  let prevTransport: ApiTransportLeg | undefined;
  let nextTransport: ApiTransportLeg | undefined;

  for (const day of data.variant.days) {
    const idx = day.activities.findIndex(a => a.id === activityId);
    if (idx !== -1) {
      activity = day.activities[idx];
      dayNumber = day.dayNumber;
      dayIndex = data.variant.days.indexOf(day);
      activityIndex = idx;
      prevTransport = idx > 0 ? day.transportLegs[idx - 1] : undefined;
      nextTransport = day.transportLegs[idx];
      break;
    }
  }

  if (!activity) return <ErrorScreen message="Activity not found." />;

  const tc = TYPE_COLORS[activity.category ?? "activity"] ?? TYPE_COLORS.activity;
  const destination = data.variant.destination ?? data.variant.name;
  const dayColor = DAY_COLORS[dayIndex % DAY_COLORS.length];
  const activityExpertNote = data.expertDiff?.activityDiffs?.[activityId]?.note ?? null;

  const expertName = data.sharedBy?.name ?? "Expert";
  const expertInitials = expertName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="min-h-screen bg-gray-50" data-testid="activity-detail-page">
      {/* Hero */}
      <div className="relative">
        {activity.imageUrl ? (
          <div className="h-52 relative overflow-hidden">
            <img
              src={activity.imageUrl}
              alt={activity.name}
              className="w-full h-full object-cover"
              data-testid="img-activity-hero"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          </div>
        ) : (
          <div
            className="h-52"
            style={{ background: `linear-gradient(135deg, ${dayColor}cc, ${dayColor}66)` }}
          />
        )}
        <div className="absolute top-3 left-3">
          <button
            onClick={() => navigate(`/itinerary-view/${token}`)}
            className="w-8 h-8 rounded-lg bg-white/90 backdrop-blur-sm flex items-center justify-center hover:bg-white transition-colors shadow-sm"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4 text-gray-700" />
          </button>
        </div>
        <div className="absolute bottom-4 left-4 right-4">
          <h1
            className="text-[22px] text-white leading-tight drop-shadow-sm"
            style={{ fontFamily: "'DM Serif Display', serif" }}
          >
            {activity.name}
          </h1>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {activity.category && (
              <Badge className={`text-[10px] px-2 py-0.5 border-0 ${tc.bg} ${tc.fg}`}>
                {activity.category}
              </Badge>
            )}
            {activityExpertNote ? (
              <Badge className="text-[10px] px-2 py-0.5 border-0 bg-blue-400/80 text-white">
                Suggested
              </Badge>
            ) : (
              <Badge className="text-[10px] px-2 py-0.5 border-0 bg-green-400/80 text-white">
                Confirmed
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Quick stats */}
        <Card className="p-4">
          <div className="grid grid-cols-2 gap-3">
            {activity.startTime && (
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <div className="text-[11px] text-gray-500">Time</div>
                  <div className="text-[13px] font-bold text-gray-900">
                    {formatTime(activity.startTime)}
                    {activity.endTime && ` – ${formatTime(activity.endTime)}`}
                  </div>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <div className="text-[11px] text-gray-500">Cost</div>
                <div className="text-[13px] font-bold text-gray-900">
                  {(activity.cost ?? 0) > 0 ? `$${activity.cost}` : "Free"}
                </div>
              </div>
            </div>
            {activity.duration && (
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <div className="text-[11px] text-gray-500">Duration</div>
                  <div className="text-[13px] font-bold text-gray-900">{formatDuration(activity.duration)}</div>
                </div>
              </div>
            )}
            {activity.location && (
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <div className="text-[11px] text-gray-500">Location</div>
                  <div className="text-[12px] font-semibold text-gray-900 truncate max-w-[120px]">
                    {activity.location}
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Description */}
        {activity.description && (
          <Card className="p-4">
            <h3 className="text-[13px] font-bold text-gray-900 mb-2">Description</h3>
            <p className="text-[12px] text-gray-600 leading-relaxed">{activity.description}</p>
          </Card>
        )}

        {/* Expert note — purple card with avatar */}
        {activityExpertNote && (
          <Card className="p-4 border-purple-200/60 bg-purple-50/30" data-testid="activity-expert-note">
            <h3 className="text-[13px] font-bold text-purple-900 mb-2.5 flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-purple-500" />
              Expert Note
            </h3>
            <div className="flex gap-2.5">
              <div className="w-7 h-7 rounded-full bg-purple-200 flex items-center justify-center text-[10px] font-bold text-purple-800 flex-shrink-0">
                {expertInitials}
              </div>
              <div>
                <div className="text-[11px] text-purple-600 font-medium">{expertName}</div>
                <p className="text-[12px] text-purple-800 leading-relaxed mt-0.5 italic">
                  "{activityExpertNote}"
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Navigate */}
        {activity.location && (
          <Card className="p-4" data-testid="navigate-section">
            <h3 className="text-[13px] font-bold text-gray-900 mb-3 flex items-center gap-2">
              <Navigation className="w-4 h-4 text-blue-600" />
              Navigate
            </h3>
            <div className="space-y-2">
              <a
                href={buildMapsUrl(activity.location, activity.lat, activity.lng)}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
                data-testid="link-google-maps"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-blue-600" />
                </div>
                <span className="text-[13px] font-semibold text-gray-800 flex-1">Google Maps</span>
                <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
              </a>
              <a
                href={buildAppleMapsUrl(activity.location, activity.lat, activity.lng)}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
                data-testid="link-apple-maps"
              >
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                  <Map className="w-4 h-4 text-gray-600" />
                </div>
                <span className="text-[13px] font-semibold text-gray-800 flex-1">Apple Maps</span>
                <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
              </a>
              {buildWazeUrl(activity.lat, activity.lng) && (
                <a
                  href={buildWazeUrl(activity.lat, activity.lng)!}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
                  data-testid="link-waze"
                >
                  <div className="w-8 h-8 rounded-lg bg-cyan-100 flex items-center justify-center">
                    <Route className="w-4 h-4 text-cyan-600" />
                  </div>
                  <span className="text-[13px] font-semibold text-gray-800 flex-1">Waze</span>
                  <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
                </a>
              )}
            </div>
          </Card>
        )}

        {/* Contact — only shown when data exists */}
        {(activity.phone || activity.website) && (
          <Card className="p-4">
            <h3 className="text-[13px] font-bold text-gray-900 mb-3">Contact</h3>
            <div className="space-y-2">
              {activity.phone && (
                <a
                  href={`tel:${activity.phone}`}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
                  data-testid="link-phone"
                >
                  <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                    <Phone className="w-4 h-4 text-green-600" />
                  </div>
                  <span className="text-[13px] font-medium text-gray-800">{activity.phone}</span>
                </a>
              )}
              {activity.website && (
                <a
                  href={activity.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
                  data-testid="link-website"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <Globe className="w-4 h-4 text-blue-600" />
                  </div>
                  <span className="text-[13px] font-medium text-gray-800 flex-1 truncate">
                    {activity.website.replace(/^https?:\/\//, "")}
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                </a>
              )}
            </div>
          </Card>
        )}

        {/* Related Transport */}
        {(prevTransport || nextTransport) && (
          <Card className="p-4" data-testid="transport-connections">
            <h3 className="text-[13px] font-bold text-gray-900 mb-3">Related Transport</h3>
            <div className="space-y-2">
              {prevTransport && (() => {
                const mode = prevTransport.userSelectedMode ?? prevTransport.recommendedMode ?? "transit";
                const modeColor = MODE_COLORS[mode] ?? "#6b7280";
                return (
                  <button
                    key={prevTransport.id}
                    onClick={() => navigate(`/itinerary-view/${token}/transport/${prevTransport!.id}`)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                    data-testid={`prev-transport-${prevTransport.id}`}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: modeColor + "20" }}
                    >
                      <ModeIcon mode={mode} className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-gray-800">
                        Arriving from {prevTransport.fromLabel ?? "Previous stop"}
                      </div>
                      <div className="text-[11px] text-gray-500 flex items-center gap-1.5">
                        <span className="capitalize">{MODE_LABELS[mode] ?? mode}</span>
                        {prevTransport.estimatedDurationMinutes && (
                          <span>· {formatDuration(prevTransport.estimatedDurationMinutes)}</span>
                        )}
                        {(prevTransport.estimatedCostUsd ?? 0) > 0 && (
                          <span className="font-semibold">· ${prevTransport.estimatedCostUsd}</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </button>
                );
              })()}
              {nextTransport && (() => {
                const mode = nextTransport.userSelectedMode ?? nextTransport.recommendedMode ?? "transit";
                const modeColor = MODE_COLORS[mode] ?? "#6b7280";
                return (
                  <button
                    key={nextTransport.id}
                    onClick={() => navigate(`/itinerary-view/${token}/transport/${nextTransport!.id}`)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                    data-testid={`next-transport-${nextTransport.id}`}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: modeColor + "20" }}
                    >
                      <ModeIcon mode={mode} className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-gray-800">
                        Departing to {nextTransport.toLabel ?? "Next stop"}
                      </div>
                      <div className="text-[11px] text-gray-500 flex items-center gap-1.5">
                        <span className="capitalize">{MODE_LABELS[mode] ?? mode}</span>
                        {nextTransport.estimatedDurationMinutes && (
                          <span>· {formatDuration(nextTransport.estimatedDurationMinutes)}</span>
                        )}
                        {(nextTransport.estimatedCostUsd ?? 0) > 0 && (
                          <span className="font-semibold">· ${nextTransport.estimatedCostUsd}</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </button>
                );
              })()}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 3. TRANSPORT DETAIL PAGE
// ─────────────────────────────────────────────
function RoutePlaceholder({ from, to, mode }: { from: string; to: string; mode: string }) {
  const modeColor = MODE_COLORS[mode] ?? "#6b7280";
  return (
    <div className="relative w-full h-40 rounded-xl overflow-hidden border border-gray-200 bg-gradient-to-br from-blue-50 via-cyan-50 to-emerald-50">
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {Array.from({ length: 11 }).map((_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 10} x2="100" y2={i * 10} stroke="#e5e7eb" strokeWidth="0.3" />
        ))}
        {Array.from({ length: 11 }).map((_, i) => (
          <line key={`v${i}`} x1={i * 10} y1="0" x2={i * 10} y2="100" stroke="#e5e7eb" strokeWidth="0.3" />
        ))}
        <path d="M 20 70 Q 50 20, 80 50" fill="none" stroke={modeColor} strokeWidth="1.2" strokeDasharray="3,2" opacity="0.7" />
      </svg>
      <div className="absolute" style={{ left: "20%", top: "70%", transform: "translate(-50%, -50%)" }}>
        <div className="w-5 h-5 rounded-full bg-green-500 border-2 border-white shadow flex items-center justify-center">
          <span className="text-white text-[8px] font-bold">A</span>
        </div>
      </div>
      <div className="absolute" style={{ left: "80%", top: "50%", transform: "translate(-50%, -50%)" }}>
        <div className="w-5 h-5 rounded-full bg-red-500 border-2 border-white shadow flex items-center justify-center">
          <span className="text-white text-[8px] font-bold">B</span>
        </div>
      </div>
      <div className="absolute bottom-2 left-2 bg-white/80 backdrop-blur-sm rounded-lg px-2 py-1 text-[10px] text-gray-500 font-medium">
        Route Preview
      </div>
      <div className="absolute top-2 right-2 bg-white/80 backdrop-blur-sm rounded-lg px-2 py-1 flex items-center gap-1">
        <ModeIcon mode={mode} className="w-3 h-3" />
        <span className="text-[10px] text-gray-600 font-medium">{MODE_LABELS[mode] ?? mode}</span>
      </div>
      <div className="absolute bottom-2 right-2 flex flex-col gap-0.5 items-end">
        <div className="bg-white/80 backdrop-blur-sm rounded px-1.5 py-0.5 text-[9px] text-gray-500 truncate max-w-[80px]">{from}</div>
        <div className="bg-white/80 backdrop-blur-sm rounded px-1.5 py-0.5 text-[9px] text-gray-500 truncate max-w-[80px]">{to}</div>
      </div>
    </div>
  );
}

export function TransportDetailPage() {
  const { token, legId } = useParams<{ token: string; legId: string }>();
  const [, navigate] = useLocation();
  const { data, isLoading, error } = useItineraryData(token);
  const [selectedMode, setSelectedMode] = useState<string | null>(null);

  if (isLoading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={(error as Error).message} />;
  if (!data) return null;

  let leg: ApiTransportLeg | undefined;
  let dayNumber = 0;
  let dayDate: string | undefined;
  let fromActivity: ApiActivity | undefined;
  let toActivity: ApiActivity | undefined;

  for (const day of data.variant.days) {
    const idx = day.transportLegs.findIndex(t => t.id === legId);
    if (idx !== -1) {
      leg = day.transportLegs[idx];
      dayNumber = day.dayNumber;
      dayDate = day.date;
      fromActivity = day.activities[idx];
      toActivity = day.activities[idx + 1];
      break;
    }
  }

  if (!leg) return <ErrorScreen message="Transport leg not found." />;

  const baseMode = leg.userSelectedMode ?? leg.recommendedMode ?? "transit";
  const displayMode = selectedMode ?? baseMode;
  const modeColor = MODE_COLORS[displayMode] ?? "#6b7280";
  const fromName = leg.fromLabel ?? fromActivity?.name ?? "—";
  const toName = leg.toLabel ?? toActivity?.name ?? "—";
  const destLocation = toActivity?.location ?? toName;

  // Find expert suggested change for this leg
  const expertTransportDiff = data.expertDiff?.transportDiffs?.[legId ?? ""];

  const daySubtitle = dayDate
    ? `Day ${dayNumber} — ${new Date(dayDate).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}`
    : `Day ${dayNumber}`;

  return (
    <div className="min-h-screen bg-gray-50" data-testid="transport-detail-page">
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(`/itinerary-view/${token}`)}
          className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-[15px] font-bold text-gray-900">Transport Details</h1>
          <p className="text-[11px] text-gray-500">{daySubtitle}</p>
        </div>
      </div>

      <div className="px-4 pt-4 pb-3">
        <Card className="overflow-hidden">
          <div className="p-4">
            {/* Mode header */}
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${modeColor}15` }}
              >
                <ModeIcon mode={displayMode} className="w-6 h-6" style={{ color: modeColor }} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[15px] font-bold text-gray-900">{MODE_LABELS[displayMode] ?? displayMode}</span>
                  {displayMode === baseMode && (
                    <Badge className="bg-blue-100 text-blue-700 border-0 text-[10px]">Current</Badge>
                  )}
                  {selectedMode && selectedMode !== baseMode && (
                    <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px]">Preview</Badge>
                  )}
                </div>
                {leg.operatorName && (
                  <div className="flex items-center gap-1.5 mt-0.5 text-[12px] text-gray-500">
                    <Building2 className="w-3 h-3" /> via {leg.operatorName}
                  </div>
                )}
              </div>
            </div>

            {/* Route */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex flex-col items-center">
                <div className="w-3 h-3 rounded-full bg-green-500 border-2 border-white shadow" />
                <div className="w-0.5 h-10 bg-gray-200" />
                <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow" />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <div className="text-[12px] font-semibold text-gray-900" data-testid="text-from">
                    {fromName}
                  </div>
                  {leg.departureTime && (
                    <div className="text-[11px] text-gray-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Depart {formatTime(leg.departureTime)}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[12px] font-semibold text-gray-900" data-testid="text-to">
                    {toName}
                  </div>
                  {leg.arrivalTime && (
                    <div className="text-[11px] text-gray-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Arrive {formatTime(leg.arrivalTime)}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                <div className="text-[10px] text-gray-500 mb-0.5">Duration</div>
                <div className="text-[14px] font-bold text-gray-900" data-testid="text-duration">
                  {formatDuration(leg.estimatedDurationMinutes ?? 0)}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                <div className="text-[10px] text-gray-500 mb-0.5">Distance</div>
                <div className="text-[14px] font-bold text-gray-900" data-testid="text-distance">
                  {leg.distanceKm ? `${leg.distanceKm.toFixed(1)} km` : "—"}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                <div className="text-[10px] text-gray-500 mb-0.5">Cost</div>
                <div className="text-[14px] font-bold text-gray-900" data-testid="text-cost">
                  {(leg.estimatedCostUsd ?? 0) > 0 ? `$${leg.estimatedCostUsd}` : "Free"}
                </div>
              </div>
            </div>

            {/* Notes */}
            {leg.notes && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-start gap-2">
                <Sparkles className="w-3 h-3 text-amber-600 mt-0.5 flex-shrink-0" />
                {leg.notes}
              </div>
            )}

            {/* Booking ref */}
            {leg.bookingRef && (
              <div className="flex items-center gap-2 mb-3 text-[12px] text-gray-600">
                <Ticket className="w-3.5 h-3.5 text-gray-400" />
                <span className="font-medium">Booking Ref:</span>
                <span
                  className="font-mono text-[11px] bg-gray-100 px-2 py-0.5 rounded"
                  data-testid="text-booking-ref"
                >
                  {leg.bookingRef}
                </span>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Route map */}
      <div className="px-4 pb-3">
        <h3 className="text-[13px] font-bold text-gray-900 mb-2">Route Map</h3>
        <RoutePlaceholder from={fromName} to={toName} mode={displayMode} />
      </div>

      {/* Transit Mode Options */}
      <div className="px-4 pb-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[13px] font-bold text-gray-900 flex items-center gap-1.5">
            <Repeat className="w-3.5 h-3.5 text-gray-500" /> Transit Mode Options
          </h3>
          <span className="text-[11px] text-gray-400">{TRANSPORT_OPTIONS.length} available</span>
        </div>

        {/* Maps & Transit alternatives */}
        <div className="mb-3">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <MapPin className="w-3 h-3" /> Maps &amp; Transit
          </div>
          <div className="space-y-1.5">
            {TRANSPORT_OPTIONS.map(opt => {
              const isSelected = displayMode === opt.mode;
              return (
                <Card
                  key={opt.mode}
                  className={`p-3 cursor-pointer transition-all hover:shadow-md ${isSelected ? "ring-2 ring-blue-500 bg-blue-50/30" : ""}`}
                  onClick={() => setSelectedMode(opt.mode === baseMode ? null : opt.mode)}
                  data-testid={`mode-option-${opt.mode}`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${opt.color}15` }}
                    >
                      <ModeIcon mode={opt.mode} className="w-4 h-4" style={{ color: opt.color }} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-semibold text-gray-900">{opt.label}</span>
                        {opt.mode === baseMode && (
                          <span className="text-[8px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">CURRENT</span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        Tap to preview this mode
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {isSelected && <Check className="w-4 h-4 text-blue-600" />}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Traveloure Services */}
        <div>
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-sky-500" /> Traveloure Services
          </div>
          <div className="space-y-1.5">
            <Card className="p-3 border-sky-100 cursor-pointer hover:shadow-md transition-all" data-testid="platform-option-private-transfer">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-sky-50 flex items-center justify-center flex-shrink-0">
                  <Car className="w-4 h-4 text-sky-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-semibold text-gray-900">Private Transfer</span>
                    <span className="text-[8px] bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded-full font-bold">TRAVELOURE</span>
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">Comfortable door-to-door service</div>
                </div>
                <Badge className="bg-sky-100 text-sky-700 border-0 text-[10px]">Available</Badge>
              </div>
            </Card>
            <Card className="p-3 cursor-pointer hover:shadow-md transition-all" data-testid="platform-option-request-alternative">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <Repeat className="w-4 h-4 text-gray-500" />
                </div>
                <div className="flex-1">
                  <span className="text-[12px] font-semibold text-gray-800">Request Alternative</span>
                  <div className="text-[11px] text-gray-500 mt-0.5">Ask your expert to suggest options</div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Expert Suggested Change */}
      {expertTransportDiff && (
        <div className="px-4 pb-3">
          <h3 className="text-[13px] font-bold text-gray-900 mb-2">Suggested Change</h3>
          <Card className="p-3 border-indigo-200 bg-indigo-50/30">
            <div className="flex items-start gap-2 mb-3">
              <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Star className="w-3.5 h-3.5 text-indigo-600" />
              </div>
              <div className="flex-1">
                <div className="text-[12px] font-semibold text-indigo-800 mb-1">Expert Recommendation</div>
                <div className="flex items-center gap-2 text-[11px] text-gray-600 mb-1">
                  <span className="line-through text-red-500">{MODE_LABELS[expertTransportDiff.originalMode] ?? expertTransportDiff.originalMode}</span>
                  <ArrowRight className="w-3 h-3 text-gray-400" />
                  <span className="text-green-700 font-semibold">{MODE_LABELS[expertTransportDiff.newMode] ?? expertTransportDiff.newMode}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white text-[12px] flex-1 gap-1" data-testid="button-accept-suggestion">
                <Check className="w-3.5 h-3.5" /> Accept
              </Button>
              <Button size="sm" variant="outline" className="text-[12px] flex-1 gap-1" data-testid="button-dismiss-suggestion">
                <X className="w-3.5 h-3.5" /> Dismiss
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Navigate */}
      <div className="px-4 pb-6">
        <Card className="p-4">
          <h3 className="text-[13px] font-bold text-gray-900 mb-3">Navigate to Destination</h3>
          <NavigateDropdown location={destLocation} lat={toActivity?.lat} lng={toActivity?.lng} />
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 4. MAP PAGE
// ─────────────────────────────────────────────
function MapPlaceholder({ activities, dayColor }: { activities: ApiActivity[]; dayColor: string }) {
  const validActs = activities.filter(a => a.lat != null && a.lng != null);
  if (validActs.length === 0) {
    return (
      <div className="w-full h-64 rounded-xl bg-gray-100 flex items-center justify-center">
        <p className="text-[12px] text-gray-500">No location data available</p>
      </div>
    );
  }
  const lats = validActs.map(a => a.lat!);
  const lngs = validActs.map(a => a.lng!);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const padLat = (maxLat - minLat) * 0.15 || 0.01;
  const padLng = (maxLng - minLng) * 0.15 || 0.01;
  const toX = (lng: number) => ((lng - (minLng - padLng)) / ((maxLng + padLng) - (minLng - padLng))) * 100;
  const toY = (lat: number) => (1 - (lat - (minLat - padLat)) / ((maxLat + padLat) - (minLat - padLat))) * 100;

  return (
    <div className="relative w-full h-64 rounded-xl overflow-hidden border border-gray-200 bg-gradient-to-br from-blue-50 via-cyan-50 to-emerald-50">
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {Array.from({ length: 11 }).map((_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 10} x2="100" y2={i * 10} stroke="#e5e7eb" strokeWidth="0.3" />
        ))}
        {Array.from({ length: 11 }).map((_, i) => (
          <line key={`v${i}`} x1={i * 10} y1="0" x2={i * 10} y2="100" stroke="#e5e7eb" strokeWidth="0.3" />
        ))}
        {validActs.length > 1 && (
          <polyline
            points={validActs.map(a => `${toX(a.lng!)},${toY(a.lat!)}`).join(" ")}
            fill="none" stroke={dayColor} strokeWidth="0.8" strokeDasharray="2,1.5" opacity="0.6"
          />
        )}
      </svg>
      {validActs.map((a, i) => (
        <div
          key={a.id}
          className="absolute flex flex-col items-center"
          style={{ left: `${toX(a.lng!)}%`, top: `${toY(a.lat!)}%`, transform: "translate(-50%, -100%)" }}
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
        Map Preview
      </div>
    </div>
  );
}

export function MapFullPage() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const { data, isLoading, error } = useItineraryData(token);
  const [selectedDay, setSelectedDay] = useState<number | null>(0);

  if (isLoading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={(error as Error).message} />;
  if (!data) return null;

  const { variant } = data;
  const isAllDays = selectedDay === null;
  const currentDays = isAllDays ? variant.days : [variant.days[selectedDay!]].filter(Boolean);
  const allActivities = currentDays.flatMap(d => d.activities);
  const allTransports = currentDays.flatMap(d => d.transportLegs);
  const dayColor = isAllDays ? "#3b82f6" : DAY_COLORS[selectedDay! % DAY_COLORS.length];
  const destination = variant.destination ?? variant.name;

  const fullRouteUrl = allActivities.filter(a => a.lat && a.lng).length > 0
    ? `https://www.google.com/maps/dir/${allActivities.filter(a => a.lat && a.lng).map(a => `${a.lat},${a.lng}`).join("/")}`
    : "#";

  const totalTransitTime = allTransports.reduce((s, t) => s + (t.estimatedDurationMinutes ?? 0), 0);
  const totalTransitCost = allTransports.reduce((s, t) => s + (t.estimatedCostUsd ?? 0), 0);

  return (
    <div className="min-h-screen bg-gray-50" data-testid="map-full-page">
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(`/itinerary-view/${token}`)}
          className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-[15px] font-bold text-gray-900">Trip Map</h1>
          <p className="text-[11px] text-gray-500">{destination}</p>
        </div>
        <a
          href={fullRouteUrl}
          target="_blank" rel="noopener noreferrer"
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
          {variant.days.map((d, i) => (
            <button
              key={d.dayNumber}
              onClick={() => setSelectedDay(i)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                selectedDay === i ? "text-white shadow-md" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
              style={selectedDay === i ? { backgroundColor: DAY_COLORS[i % DAY_COLORS.length] } : {}}
              data-testid={`button-day-${d.dayNumber}`}
            >
              D{d.dayNumber}
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
            <div className="text-[16px] font-bold text-gray-900" data-testid="text-total-stops">
              {allActivities.length}
            </div>
          </Card>
          <Card className="p-2.5 text-center">
            <div className="text-[10px] text-gray-500 mb-0.5">Transit</div>
            <div className="text-[14px] font-bold text-gray-900" data-testid="text-transit-time">
              {formatDuration(totalTransitTime)}
            </div>
          </Card>
          <Card className="p-2.5 text-center">
            <div className="text-[10px] text-gray-500 mb-0.5">Cost</div>
            <div className="text-[14px] font-bold text-gray-900" data-testid="text-transit-cost">
              ${totalTransitCost}
            </div>
          </Card>
          <Card className="p-2.5 text-center">
            <div className="text-[10px] text-gray-500 mb-0.5">Days</div>
            <div className="text-[16px] font-bold text-gray-900">{currentDays.length}</div>
          </Card>
        </div>
      </div>

      <div className="px-4 pb-6">
        <h2 className="text-[13px] font-bold text-gray-900 mb-3">
          {isAllDays
            ? "All Stops"
            : currentDays[0]?.date
              ? `Day ${currentDays[0].dayNumber} — ${new Date(currentDays[0].date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}`
              : `Day ${currentDays[0]?.dayNumber}`}
        </h2>
        {currentDays.map((day) => {
          const dc = DAY_COLORS[(day.dayNumber - 1) % DAY_COLORS.length];
          const sortedLegs = Array.from(day.transportLegs).sort((a, b) => a.legOrder - b.legOrder);
          return (
            <div key={day.dayNumber} className="mb-4">
              {isAllDays && (
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
                    style={{ backgroundColor: dc }}
                  >
                    {day.dayNumber}
                  </div>
                  <span className="text-[12px] font-bold text-gray-800">Day {day.dayNumber}</span>
                  {day.date && (
                    <span className="text-[10px] text-gray-400">
                      {new Date(day.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  )}
                </div>
              )}
              <div className="space-y-0">
                {day.activities.map((act, ai) => {
                  const leg = sortedLegs[ai];
                  const mode = leg?.userSelectedMode ?? leg?.recommendedMode ?? null;
                  const hasConnector = ai < day.activities.length - 1;
                  return (
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
                          {hasConnector && <div className="w-0.5 h-6 bg-gray-200 mt-1" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[12px] font-semibold text-gray-900">{act.name}</span>
                            {act.category && (
                              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 capitalize">
                                {act.category}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-500 flex-wrap">
                            {act.startTime && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" /> {formatTime(act.startTime)}
                              </span>
                            )}
                            {act.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" /> {act.location}
                              </span>
                            )}
                          </div>
                        </div>
                        {act.location && (
                          <NavigateDropdown location={act.location} lat={act.lat} lng={act.lng} />
                        )}
                      </div>

                      {hasConnector && mode && (
                        <div className="flex items-center gap-2 pl-10 py-1">
                          <div className="flex items-center gap-1 text-[10px] text-gray-400">
                            <ModeIcon mode={mode} className="w-3 h-3" />
                            <span className="capitalize">{MODE_LABELS[mode] ?? mode}</span>
                            {leg.estimatedDurationMinutes && (
                              <span>· {formatDuration(leg.estimatedDurationMinutes)}</span>
                            )}
                            {leg.estimatedCostUsd != null && leg.estimatedCostUsd > 0 && (
                              <span>· ${leg.estimatedCostUsd}</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <a
          href={fullRouteUrl}
          target="_blank" rel="noopener noreferrer"
          className="w-full flex items-center justify-center gap-2 text-[13px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-xl py-3 hover:bg-blue-100 transition-colors"
          data-testid="button-open-full-route-bottom"
        >
          <Map className="w-4 h-4" /> Open Full Route in Maps <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 5. TRIP STATS PAGE
// ─────────────────────────────────────────────
function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={6} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#3b82f6" strokeWidth={6}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
      <text
        x={size / 2} y={size / 2 + 1}
        textAnchor="middle" dominantBaseline="central"
        className="fill-gray-900 font-bold"
        fontSize={size * 0.28}
        transform={`rotate(90, ${size / 2}, ${size / 2})`}
      >
        {score}
      </text>
    </svg>
  );
}

function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-gray-700 font-medium">{label}</span>
        <span className="text-[12px] text-gray-500 font-semibold">{pct}%</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export function TripStatsPage() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const { data, isLoading, error } = useItineraryData(token);

  if (isLoading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={(error as Error).message} />;
  if (!data) return null;

  const { variant } = data;
  const allActivities = variant.days.flatMap(d => d.activities);
  const allTransports = variant.days.flatMap(d => d.transportLegs);

  // ── Cost calculations ──────────────────────────────
  const totalTransportCost = variant.transportSummary?.totalCostUsd ??
    allTransports.reduce((s, t) => s + (t.estimatedCostUsd ?? 0), 0);
  const totalActivityCost = allActivities.reduce((s, a) => s + (a.cost ?? 0), 0);
  const totalCost = parseFloat(String(variant.totalCost ?? 0)) || (totalActivityCost + totalTransportCost);
  const budget = variant.budget ?? null;
  const travelers = Math.max(variant.travelers ?? 1, 1);
  const perPerson = travelers > 0 ? Math.round(totalCost / travelers) : totalCost;
  const perDay = variant.days.length > 0 ? Math.round(totalCost / variant.days.length) : totalCost;
  const savings = budget ? Math.max(budget - totalCost, 0) : 0;
  const budgetPct = budget && budget > 0 ? Math.min(Math.round((totalCost / budget) * 100), 100) : 100;
  const isUnderBudget = budget != null && totalCost < budget;

  // ── Category breakdown ─────────────────────────────
  const ACCOMMODATION_CATS = ["hotel", "accommodation", "lodge", "hostel", "resort", "airbnb"];
  const DINING_CATS = ["dining", "restaurant", "food", "cafe", "bar", "lunch", "dinner", "breakfast"];
  const activityCatCost = (cats: string[]) =>
    allActivities
      .filter(a => cats.some(c => (a.category ?? "").toLowerCase().includes(c)))
      .reduce((s, a) => s + (a.cost ?? 0), 0);
  const accommodationCost = activityCatCost(ACCOMMODATION_CATS);
  const diningCost = activityCatCost(DINING_CATS);
  const activitiesCost = Math.max(totalActivityCost - accommodationCost - diningCost, 0);
  const budgetCategories = [
    { label: "Accommodation", amount: accommodationCost, color: "#3b82f6" },
    { label: "Activities", amount: activitiesCost, color: "#8b5cf6" },
    { label: "Transport", amount: totalTransportCost, color: "#f59e0b" },
    { label: "Dining", amount: diningCost, color: "#ef4444" },
  ].filter(c => c.amount > 0);
  const budgetCatsTotal = Math.max(budgetCategories.reduce((s, c) => s + c.amount, 0), 1);

  // ── Time calculations ──────────────────────────────
  const totalTransitMins = variant.transportSummary?.totalMinutes ??
    allTransports.reduce((s, t) => s + (t.estimatedDurationMinutes ?? 0), 0);
  const totalActivityMins = allActivities.reduce((s, a) => s + (a.duration ?? 60), 0);
  const freeMins = Math.max(variant.days.length * 14 * 60 - totalActivityMins - totalTransitMins, 0);
  const totalTime = totalActivityMins + totalTransitMins + freeMins;

  // ── Wellness ───────────────────────────────────────
  const NATURE_CATS = ["beach", "park", "nature", "outdoor", "hike", "trail", "garden", "walk", "coast"];
  const REST_CATS = ["wellness", "yoga", "spa", "massage", "meditation", "rest", "relax"];
  const walkingMins = allTransports
    .filter(t => (t.userSelectedMode ?? t.recommendedMode ?? "") === "walk")
    .reduce((s, t) => s + (t.estimatedDurationMinutes ?? 0), 0);
  const natureCount = allActivities.filter(a =>
    NATURE_CATS.some(c => (a.category ?? "").toLowerCase().includes(c) || (a.name ?? "").toLowerCase().includes(c))
  ).length;
  const restCount = allActivities.filter(a =>
    REST_CATS.some(c => (a.category ?? "").toLowerCase().includes(c) || (a.name ?? "").toLowerCase().includes(c))
  ).length;
  const hasWellness = walkingMins > 0 || natureCount > 0 || restCount > 0;

  // ── Score ──────────────────────────────────────────
  const score = variant.optimizationScore ?? 85;
  const destination = variant.destination ?? variant.name;
  const SCORE_CATEGORIES = [
    { label: "Planning", score: Math.min(score + 5, 100), color: "#3b82f6" },
    { label: "Budget", score: Math.max(score - 2, 0), color: "#22c55e" },
    { label: "Timing", score: Math.min(score + 3, 100), color: "#f59e0b" },
    { label: "Wellness", score: Math.max(score - 3, 0), color: "#ec4899" },
  ];

  // ── Day costs ──────────────────────────────────────
  const dayCosts = variant.days.map(d => ({
    day: d.dayNumber,
    date: d.date,
    cost: d.activities.reduce((s, a) => s + (a.cost ?? 0), 0) +
      d.transportLegs.reduce((s, t) => s + (t.estimatedCostUsd ?? 0), 0),
  }));
  const maxDayCost = Math.max(...dayCosts.map(d => d.cost), 1);

  return (
    <div className="min-h-screen bg-gray-50" data-testid="trip-stats-page">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(`/itinerary-view/${token}`)}
          className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div>
          <h1 className="text-[15px] font-bold text-gray-900">Trip Stats & Analytics</h1>
          <p className="text-[11px] text-gray-500">{destination}</p>
        </div>
      </div>

      <div className="p-4 space-y-4">

        {/* ── Overall Trip Score ── */}
        <Card className="p-4">
          <div className="flex items-center gap-4">
            <ScoreRing score={score} />
            <div className="flex-1 space-y-1">
              <div className="text-[13px] font-bold text-gray-900">Overall Trip Score</div>
              <div className="text-[11px] text-gray-500">
                Based on planning completeness, budget efficiency, timing optimization, and wellness balance.
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {SCORE_CATEGORIES.map(cat => (
              <div key={cat.label} className="flex items-center gap-2.5">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-[13px] font-bold text-white"
                  style={{ backgroundColor: cat.color }}
                  data-testid={`score-${cat.label.toLowerCase()}`}
                >
                  {cat.score}
                </div>
                <div>
                  <div className="text-[12px] font-semibold text-gray-800">{cat.label}</div>
                  <div className="h-1.5 w-16 bg-gray-100 rounded-full mt-0.5 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${cat.score}%`, backgroundColor: cat.color }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* ── Budget Analysis ── */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="w-4 h-4 text-green-600" />
            <span className="text-[13px] font-bold text-gray-900">Budget Analysis</span>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-green-50 rounded-lg p-2.5 text-center">
              <div className="text-[16px] font-bold text-green-700" data-testid="text-total-spent">
                ${totalCost.toLocaleString()}
              </div>
              <div className="text-[10px] text-green-600 font-medium">Total Spent</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-2.5 text-center">
              <div className="text-[16px] font-bold text-blue-700" data-testid="text-per-person">
                ${perPerson.toLocaleString()}
              </div>
              <div className="text-[10px] text-blue-600 font-medium">Per Person</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-2.5 text-center">
              <div className="text-[16px] font-bold text-amber-700" data-testid="text-per-day">
                ${perDay.toLocaleString()}
              </div>
              <div className="text-[10px] text-amber-600 font-medium">Per Day</div>
            </div>
          </div>

          {budget != null && budget > 0 && (
            <>
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] text-gray-500">Budget Progress</span>
                  <span className="text-[11px] font-semibold text-gray-700">
                    ${totalCost.toLocaleString()} / ${budget.toLocaleString()}
                  </span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full transition-all"
                    style={{ width: `${budgetPct}%` }}
                    data-testid="budget-progress-bar"
                  />
                </div>
              </div>
              {isUnderBudget && (
                <div className="bg-emerald-50 border border-emerald-200/60 rounded-lg px-3 py-2 flex items-center gap-2 mb-4">
                  <TrendingUp className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span className="text-[12px] font-semibold text-emerald-700">
                    Savings: ${savings.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-emerald-600 ml-auto">Under budget</span>
                </div>
              )}
            </>
          )}

          <div className="text-[11px] font-semibold text-gray-700 mb-2">Category Breakdown</div>
          <div className="space-y-2.5">
            {budgetCategories.map(cat => (
              <div key={cat.label} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] text-gray-700">{cat.label}</span>
                  <span className="text-[12px] font-semibold text-gray-800">${cat.amount.toLocaleString()}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.round((cat.amount / budgetCatsTotal) * 100)}%`, backgroundColor: cat.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* ── Time Allocation ── */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-blue-600" />
            <span className="text-[13px] font-bold text-gray-900">Time Allocation</span>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-blue-50 rounded-lg p-2.5 text-center">
              <div className="text-[14px] font-bold text-blue-700" data-testid="text-activity-time">
                {formatDuration(totalActivityMins)}
              </div>
              <div className="text-[10px] text-blue-600 font-medium">Activities</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-2.5 text-center">
              <div className="text-[14px] font-bold text-amber-700" data-testid="text-transit-time">
                {formatDuration(totalTransitMins)}
              </div>
              <div className="text-[10px] text-amber-600 font-medium">Transit</div>
            </div>
            <div className="bg-green-50 rounded-lg p-2.5 text-center">
              <div className="text-[14px] font-bold text-green-700" data-testid="text-free-time">
                {formatDuration(freeMins)}
              </div>
              <div className="text-[10px] text-green-600 font-medium">Free Time</div>
            </div>
          </div>
          <div className="space-y-2">
            <BarRow label="Activities" value={totalActivityMins} max={totalTime} color="#3b82f6" />
            <BarRow label="Transit" value={totalTransitMins} max={totalTime} color="#f59e0b" />
            <BarRow label="Free Time" value={freeMins} max={totalTime} color="#22c55e" />
          </div>
        </Card>

        {/* ── Wellness Metrics ── */}
        {(hasWellness || true) && (
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Heart className="w-4 h-4 text-pink-600" />
              <span className="text-[13px] font-bold text-gray-900">Wellness Metrics</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-pink-50 rounded-lg p-2.5 text-center">
                <Footprints className="w-5 h-5 text-pink-500 mx-auto mb-1" />
                <div className="text-[14px] font-bold text-pink-700" data-testid="text-walking">
                  {walkingMins > 0 ? `${walkingMins}m` : "—"}
                </div>
                <div className="text-[10px] text-pink-600 font-medium">Walking</div>
              </div>
              <div className="bg-green-50 rounded-lg p-2.5 text-center">
                <Leaf className="w-5 h-5 text-green-500 mx-auto mb-1" />
                <div className="text-[14px] font-bold text-green-700" data-testid="text-nature">
                  {natureCount}
                </div>
                <div className="text-[10px] text-green-600 font-medium">Nature Activities</div>
              </div>
              <div className="bg-indigo-50 rounded-lg p-2.5 text-center">
                <Clock className="w-5 h-5 text-indigo-500 mx-auto mb-1" />
                <div className="text-[14px] font-bold text-indigo-700" data-testid="text-rest">
                  {restCount}
                </div>
                <div className="text-[10px] text-indigo-600 font-medium">Rest Periods</div>
              </div>
            </div>
            <div className="mt-3 bg-pink-50/50 border border-pink-200/40 rounded-lg px-3 py-2">
              <div className="text-[11px] text-pink-700">
                <span className="font-semibold">Wellness tip: </span>
                {walkingMins > 0
                  ? `You have ${walkingMins} minutes of walking planned.`
                  : natureCount > 0
                  ? `${natureCount} nature ${natureCount === 1 ? "activity" : "activities"} planned.`
                  : "Consider adding outdoor activities for better wellness balance."}
                {" "}Balance active sightseeing with rest days to stay energized throughout the trip.
              </div>
            </div>
          </Card>
        )}

        {/* ── Day-by-Day Cost ── */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-indigo-600" />
            <span className="text-[13px] font-bold text-gray-900">Day-by-Day Cost</span>
          </div>
          <div className="space-y-2">
            {dayCosts.map(d => {
              const dayColor = DAY_COLORS[(d.day - 1) % DAY_COLORS.length];
              const dayLabel = d.date
                ? new Date(d.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
                : `Day ${d.day}`;
              return (
                <div key={d.day} className="flex items-center gap-2" data-testid={`day-cost-${d.day}`}>
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: dayColor }}
                  >
                    D{d.day}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[11px] text-gray-600 truncate">{dayLabel}</span>
                      <span className="text-[11px] font-semibold text-gray-800">${d.cost.toFixed(0)}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.round((d.cost / maxDayCost) * 100)}%`,
                          backgroundColor: dayColor,
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 6. SERVICES PAGE
// ─────────────────────────────────────────────
const TYPE_CONFIG_SVC: Record<string, {
  icon: typeof Hotel; label: string; color: string; bg: string;
}> = {
  hotel: { icon: Hotel, label: "Hotels", color: "text-blue-700", bg: "bg-blue-50" },
  tour: { icon: Compass, label: "Tours & Activities", color: "text-purple-700", bg: "bg-purple-50" },
  transport: { icon: Car, label: "Transport", color: "text-amber-700", bg: "bg-amber-50" },
  restaurant: { icon: UtensilsCrossed, label: "Dining", color: "text-red-700", bg: "bg-red-50" },
  insurance: { icon: Shield, label: "Insurance", color: "text-green-700", bg: "bg-green-50" },
};

interface ServiceBooking {
  id: string;
  name: string;
  type: "hotel" | "tour" | "restaurant" | "transport" | "insurance";
  provider: string;
  status: "confirmed" | "pending" | "cancelled";
  confirmationCode?: string;
  date?: string;
  cost: number;
  address?: string;
  notes?: string;
}

function BookingCard({ booking }: { booking: ServiceBooking }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const typeConf = TYPE_CONFIG_SVC[booking.type];
  const Icon = typeConf?.icon ?? FileText;

  const statusStyles = {
    confirmed: { bg: "bg-green-100", fg: "text-green-800", label: "Confirmed" },
    pending: { bg: "bg-yellow-100", fg: "text-yellow-800", label: "Pending" },
    cancelled: { bg: "bg-red-100", fg: "text-red-800", label: "Cancelled" },
  };
  const ss = statusStyles[booking.status];

  const handleCopy = () => {
    if (booking.confirmationCode) {
      navigator.clipboard.writeText(booking.confirmationCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3.5 py-3 flex items-start gap-3 text-left hover:bg-gray-50/50 transition-colors"
        data-testid={`booking-card-${booking.id}`}
      >
        <div className={`w-9 h-9 rounded-lg ${typeConf?.bg ?? "bg-gray-50"} flex items-center justify-center flex-shrink-0 mt-0.5`}>
          <Icon className={`w-4 h-4 ${typeConf?.color ?? "text-gray-600"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-gray-900">{booking.name}</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ss.bg} ${ss.fg}`}>
              {ss.label}
            </span>
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">{booking.provider}</div>
          {booking.confirmationCode && (
            <div className="text-[11px] text-gray-400 mt-0.5 font-mono">{booking.confirmationCode}</div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="text-[14px] font-bold text-gray-900">${booking.cost.toLocaleString()}</span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-3.5 py-3 space-y-2 bg-gray-50/30">
          {booking.date && (
            <div>
              <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Date</div>
              <div className="text-[12px] text-gray-800 font-medium mt-0.5">{booking.date}</div>
            </div>
          )}
          {booking.confirmationCode && (
            <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 px-3 py-2">
              <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span className="text-[12px] text-gray-700 font-mono flex-1">{booking.confirmationCode}</span>
              <button
                onClick={handleCopy}
                className="text-[10px] font-semibold text-blue-600 flex items-center gap-1 hover:text-blue-700"
              >
                {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
              </button>
            </div>
          )}
          {booking.address && (
            <div className="flex items-start gap-2">
              <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
              <span className="text-[12px] text-gray-700">{booking.address}</span>
            </div>
          )}
          {booking.notes && (
            <div className="bg-amber-50/60 border border-amber-200/40 rounded-lg px-3 py-2">
              <div className="text-[11px] text-amber-800">{booking.notes}</div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export function ServicesPage() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const { data, isLoading, error } = useItineraryData(token);

  if (isLoading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={(error as Error).message} />;
  if (!data) return null;

  const destination = data.variant.destination ?? data.variant.name;

  const activityBookings: ServiceBooking[] = data.variant.days.flatMap(day =>
    day.activities.map(a => {
      let type: ServiceBooking["type"] = "tour";
      if (a.category === "dining") type = "restaurant";
      else if (a.category === "shopping") type = "tour";
      else if (a.category === "attraction") type = "tour";
      return {
        id: a.id,
        name: a.name,
        type,
        provider: "Traveloure",
        status: "confirmed" as const,
        cost: a.cost ?? 0,
        date: day.date ? formatDate(day.date) : `Day ${day.dayNumber}`,
        address: a.location ?? undefined,
      };
    })
  );

  const transportBookings: ServiceBooking[] = data.variant.days.flatMap(day =>
    day.transportLegs
      .filter(t => t.bookingRef || (t.estimatedCostUsd ?? 0) > 0)
      .map(t => ({
        id: t.id,
        name: `${MODE_LABELS[t.userSelectedMode ?? t.recommendedMode ?? "transit"] ?? "Transit"}: ${t.fromLabel ?? "From"} → ${t.toLabel ?? "To"}`,
        type: "transport" as const,
        provider: t.operatorName ?? "Transport",
        status: "confirmed" as const,
        cost: t.estimatedCostUsd ?? 0,
        date: day.date ? formatDate(day.date) : `Day ${day.dayNumber}`,
        confirmationCode: t.bookingRef ?? undefined,
        notes: t.notes ?? undefined,
      }))
  );

  const derivedBookings: ServiceBooking[] = [...activityBookings, ...transportBookings];

  const confirmedCount = derivedBookings.filter(b => b.status === "confirmed").length;
  const pendingCount = derivedBookings.filter(b => b.status === "pending").length;
  const totalCost = derivedBookings.reduce((s, b) => s + b.cost, 0);

  return (
    <div className="min-h-screen bg-gray-50" data-testid="services-page">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(`/itinerary-view/${token}`)}
          className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div>
          <h1 className="text-[15px] font-bold text-gray-900">Services & Bookings</h1>
          <p className="text-[11px] text-gray-500">{destination}</p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-[18px] font-bold text-green-700">{confirmedCount}</span>
            </div>
            <div className="text-[10px] text-gray-500 font-medium">Confirmed</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Clock className="w-4 h-4 text-yellow-500" />
              <span className="text-[18px] font-bold text-yellow-700">{pendingCount}</span>
            </div>
            <div className="text-[10px] text-gray-500 font-medium">Pending</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <span className="text-[18px] font-bold text-gray-900">${totalCost.toLocaleString()}</span>
            </div>
            <div className="text-[10px] text-gray-500 font-medium">Total</div>
          </Card>
        </div>

        {derivedBookings.length === 0 ? (
          <Card className="p-8 text-center">
            <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-[13px] text-gray-500">No bookings found for this itinerary.</p>
          </Card>
        ) : (
          <div className="space-y-2.5">
            {derivedBookings.map(b => <BookingCard key={b.id} booking={b} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 7. EXPERT CHAT PAGE
// ─────────────────────────────────────────────
const TAG_COLORS: Record<string, { bg: string; fg: string }> = {
  accommodation: { bg: "bg-purple-100", fg: "text-purple-700" },
  dining: { bg: "bg-rose-100", fg: "text-rose-700" },
  transport: { bg: "bg-cyan-100", fg: "text-cyan-700" },
  activity: { bg: "bg-blue-100", fg: "text-blue-700" },
  attraction: { bg: "bg-blue-100", fg: "text-blue-700" },
  experience: { bg: "bg-indigo-100", fg: "text-indigo-700" },
  logistics: { bg: "bg-amber-100", fg: "text-amber-700" },
};

interface ChatMsg {
  id: string | number;
  message: string;
  isFromMe: boolean;
  createdAt: string | null;
}

function formatMsgTime(ts: string | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString();
}

export function ExpertChatPage() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const { data, isLoading, error } = useItineraryData(token);
  const { user, isAuthenticated } = useAuth();
  const [activeTag, setActiveTag] = useState<string | null>(null);

  if (isLoading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={(error as Error).message} />;
  if (!data) return null;

  const destination = data.variant.destination ?? data.variant.name;
  const sharedBy = data.sharedBy;
  const expertName = sharedBy?.name ?? "Expert";
  const expertInitials = expertName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
  const expertUserId = sharedBy?.userId;
  const conversationId = user && expertUserId ? [user.id, expertUserId].sort().join("_") : null;

  // Derive expert notes from diff + general expertNotes
  interface NoteItem { id: string; activityName: string; category: string; dayNumber: number; note: string; }
  const derivedNotes: NoteItem[] = [];
  if (data.expertDiff?.activityDiffs) {
    for (const [actId, diff] of Object.entries(data.expertDiff.activityDiffs)) {
      if (!diff.note) continue;
      // Find activity info
      let actName = diff.originalName ?? actId;
      let category = "activity";
      let dayNumber = 0;
      for (const day of data.variant.days) {
        const found = day.activities.find(a => a.id === actId);
        if (found) {
          actName = found.name;
          category = found.category ?? "activity";
          dayNumber = day.dayNumber;
          break;
        }
      }
      derivedNotes.push({ id: actId, activityName: actName, category, dayNumber, note: diff.note });
    }
  }

  const allTags = Array.from(new Set(derivedNotes.map(n => n.category)));
  const filteredNotes = activeTag ? derivedNotes.filter(n => n.category === activeTag) : derivedNotes;
  const notesByDay: Record<number, NoteItem[]> = {};
  filteredNotes.forEach(n => {
    if (!notesByDay[n.dayNumber]) notesByDay[n.dayNumber] = [];
    notesByDay[n.dayNumber].push(n);
  });

  return (
    <div className="min-h-screen bg-gray-50" data-testid="expert-chat-page">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(`/itinerary-view/${token}`)}
          className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-[14px] font-bold text-gray-900" data-testid="text-page-title">Expert Chat</h2>
          <p className="text-[11px] text-gray-500 truncate">{destination}{sharedBy ? ` · ${expertName}` : ""}</p>
        </div>
        <div className="w-8 h-8 rounded-full bg-purple-200 flex items-center justify-center text-[10px] font-bold text-purple-800">
          {expertInitials}
        </div>
      </div>

      {/* Expert Profile Card */}
      {sharedBy && (
        <Card className="mx-4 mt-4 mb-3 overflow-hidden">
          <div className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-14 h-14 rounded-full bg-purple-200 flex items-center justify-center text-lg font-bold text-purple-800 flex-shrink-0">
                {expertInitials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-[15px] font-bold text-gray-900" data-testid="text-expert-name">
                    {expertName}
                  </h3>
                </div>
                <p className="text-[12px] text-gray-500 mt-0.5">Travel Expert</p>
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  <span className="text-[11px] text-gray-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Responds quickly
                  </span>
                  <span className="text-[11px] text-gray-500 flex items-center gap-1">
                    <Globe className="w-3 h-3" /> English
                  </span>
                </div>
              </div>
            </div>
            {data.expertNotes && (
              <p className="text-[12px] text-gray-600 mt-3 leading-relaxed">{data.expertNotes}</p>
            )}
          </div>
        </Card>
      )}

      {/* Chat thread */}
      <ExpertChatThread
        token={token!}
        destination={destination}
        expertName={expertName}
        expertInitials={expertInitials}
        expertUserId={expertUserId}
        conversationId={conversationId}
        isAuthenticated={isAuthenticated}
        user={user}
        sharedBy={sharedBy}
        expertNotes={data.expertNotes ?? null}
      />

      {/* Expert Notes from diff */}
      {(derivedNotes.length > 0 || data.expertNotes) && (
        <div className="mx-4 mb-6 mt-2">
          <div className="border-t border-gray-200 mb-4" />
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-4 h-4 text-amber-500" />
            <h4 className="text-[13px] font-bold text-gray-800">Expert Notes</h4>
            {derivedNotes.length > 0 && (
              <span className="text-[11px] text-gray-400">{derivedNotes.length} note{derivedNotes.length !== 1 ? "s" : ""}</span>
            )}
          </div>

          {/* General expert notes */}
          {data.expertNotes && derivedNotes.length === 0 && (
            <Card className="p-3 mb-3">
              <div className="flex gap-2.5">
                <div className="w-7 h-7 rounded-full bg-purple-200 flex items-center justify-center text-[10px] font-bold text-purple-800 flex-shrink-0">
                  {expertInitials}
                </div>
                <div>
                  <div className="text-[11px] text-purple-600 font-medium">{expertName}</div>
                  <p className="text-[12px] text-gray-700 mt-0.5 leading-relaxed italic">"{data.expertNotes}"</p>
                </div>
              </div>
            </Card>
          )}

          {/* Per-activity notes with filter tabs */}
          {derivedNotes.length > 0 && (
            <>
              {allTags.length > 1 && (
                <div className="flex items-center gap-1.5 mb-3 overflow-x-auto pb-1">
                  <button
                    onClick={() => setActiveTag(null)}
                    className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                      activeTag === null ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                    data-testid="button-filter-all"
                  >
                    All
                  </button>
                  {allTags.map(tag => {
                    const colors = TAG_COLORS[tag.toLowerCase()] ?? { bg: "bg-gray-100", fg: "text-gray-600" };
                    return (
                      <button
                        key={tag}
                        onClick={() => setActiveTag(tag === activeTag ? null : tag)}
                        className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold capitalize transition-colors ${
                          activeTag === tag ? `${colors.bg} ${colors.fg}` : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}
                        data-testid={`button-filter-${tag}`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="space-y-3">
                {Object.entries(notesByDay)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([dayNum, notes]) => (
                    <div key={dayNum}>
                      {Number(dayNum) > 0 && (
                        <div className="flex items-center gap-2 mb-2">
                          <div
                            className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                            style={{ backgroundColor: DAY_COLORS[(Number(dayNum) - 1) % DAY_COLORS.length] }}
                          >
                            {dayNum}
                          </div>
                          <span className="text-[11px] font-semibold text-gray-600">Day {dayNum}</span>
                        </div>
                      )}
                      <div className="space-y-2 ml-1">
                        {notes.map(note => {
                          const colors = TAG_COLORS[note.category.toLowerCase()] ?? { bg: "bg-gray-100", fg: "text-gray-600" };
                          return (
                            <Card key={note.id} className="p-3" data-testid={`note-card-${note.id}`}>
                              <div className="flex items-start gap-2.5">
                                <div className="w-7 h-7 rounded-full bg-purple-200 flex items-center justify-center text-[9px] font-bold text-purple-800 flex-shrink-0 mt-0.5">
                                  {expertInitials}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[11px] font-semibold text-gray-800">{expertName}</span>
                                    <span className="text-[10px] text-gray-500 truncate max-w-[120px]">{note.activityName}</span>
                                    <Badge
                                      variant="secondary"
                                      className={`text-[9px] px-1.5 py-0 capitalize border-0 ${colors.bg} ${colors.fg}`}
                                      data-testid={`badge-topic-${note.category}`}
                                    >
                                      {note.category}
                                    </Badge>
                                  </div>
                                  <p className="text-[12px] text-gray-700 mt-1 leading-relaxed">{note.note}</p>
                                </div>
                              </div>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ExpertChatThread({
  token, destination, expertName, expertInitials, expertUserId,
  conversationId, isAuthenticated, user, sharedBy, expertNotes,
}: {
  token: string;
  destination: string;
  expertName: string;
  expertInitials: string;
  expertUserId: string | undefined;
  conversationId: string | null;
  isAuthenticated: boolean;
  user: any;
  sharedBy: any;
  expertNotes: string | null;
}) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: messages = [], isLoading: msgsLoading } = useQuery<ChatMsg[]>({
    queryKey: ["/api/messages/conversation", conversationId],
    queryFn: async () => {
      const res = await fetch(`/api/messages/conversation/${conversationId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!conversationId && isAuthenticated,
    refetchInterval: 10000,
  });

  const sendMutation = useMutation({
    mutationFn: (msg: string) =>
      apiRequest("POST", "/api/messages", { recipientId: expertUserId, message: msg }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversation", conversationId] });
      setMessage("");
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    },
  });

  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // If no expert assigned
  if (!sharedBy) {
    return (
      <div className="mx-4 mb-4">
        <Card className="p-6 text-center">
          <MessageSquare className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-[13px] text-gray-500">No expert assigned to this itinerary yet.</p>
        </Card>
      </div>
    );
  }

  const displayMessages: ChatMsg[] = messages.length > 0 ? messages : (
    expertNotes ? [{
      id: "intro",
      message: expertNotes,
      isFromMe: false,
      createdAt: null,
    }] : [{
      id: "intro",
      message: `Hi! I'm ${expertName}. I've reviewed your ${destination} itinerary and have some suggestions to make it even better.`,
      isFromMe: false,
      createdAt: null,
    }]
  );

  return (
    <div className="mx-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="w-4 h-4 text-gray-500" />
        <h4 className="text-[13px] font-bold text-gray-800">Chat</h4>
        {messages.length > 0 && (
          <span className="text-[11px] text-gray-400">{messages.length} message{messages.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      <div className="space-y-3 mb-3">
        {displayMessages.map(msg => (
          <div
            key={msg.id}
            className={`flex ${msg.isFromMe ? "justify-end" : "justify-start"}`}
            data-testid={`chat-message-${msg.id}`}
          >
            <div className="max-w-[85%]">
              {!msg.isFromMe && (
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-5 h-5 rounded-full bg-purple-200 flex items-center justify-center text-[8px] font-bold text-purple-800">
                    {expertInitials}
                  </div>
                  <span className="text-[10px] font-semibold text-purple-700">{expertName}</span>
                  {msg.createdAt && (
                    <span className="text-[10px] text-gray-400">{formatMsgTime(msg.createdAt)}</span>
                  )}
                </div>
              )}
              <div className={`rounded-2xl px-3.5 py-2.5 text-[12px] leading-relaxed ${
                msg.isFromMe
                  ? "bg-blue-600 text-white rounded-tr-md"
                  : "bg-white border border-gray-200 text-gray-800 rounded-tl-md"
              }`}>
                {msg.message}
              </div>
              {msg.isFromMe && msg.createdAt && (
                <div className="text-right mt-1">
                  <span className="text-[10px] text-gray-400">{formatMsgTime(msg.createdAt)}</span>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {!isAuthenticated ? (
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
          <p className="text-[12px] text-gray-500 flex-1">
            <a href="/api/login" className="text-blue-600 font-semibold hover:underline">Sign in</a>
            {" "}to send messages to the expert.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
          <input
            type="text"
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 bg-transparent text-[13px] text-gray-800 placeholder-gray-400 outline-none"
            data-testid="input-chat-message"
          />
          <Button
            size="icon"
            variant="default"
            className="rounded-full w-8 h-8"
            data-testid="button-send-message"
            onClick={handleSend}
            disabled={sendMutation.isPending || !message.trim()}
          >
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 8. REVIEW CHANGES PAGE
// Only accessible when expertDiff exists
// ─────────────────────────────────────────────
type FilterTab = "all" | "pending" | "accepted" | "rejected";

interface ChangeItem {
  id: string;
  type: "replace" | "time" | "add" | "remove";
  title: string;
  removeLine: string | null;
  addLine: string;
  reason: string;
  dayNum?: number;
}

const CHANGE_TYPE_LABELS: Record<string, { label: string; bg: string; fg: string }> = {
  replace: { label: "Swap", bg: "bg-blue-100", fg: "text-blue-700" },
  time: { label: "Time Change", bg: "bg-amber-100", fg: "text-amber-700" },
  add: { label: "New", bg: "bg-green-100", fg: "text-green-700" },
  remove: { label: "Remove", bg: "bg-red-100", fg: "text-red-700" },
};

function buildChangesFromDiff(diff: ExpertDiff, days: ApiDay[]): ChangeItem[] {
  const changes: ChangeItem[] = [];

  // Build lookup maps for day numbers
  const activityDayMap: Record<string, number> = {};
  const transportDayMap: Record<string, number> = {};
  for (const day of days) {
    for (const a of day.activities) activityDayMap[a.id] = day.dayNumber;
    for (const t of day.transportLegs) transportDayMap[t.id] = day.dayNumber;
  }

  if (diff.activityDiffs) {
    for (const [id, d] of Object.entries(diff.activityDiffs)) {
      const dayNum = activityDayMap[id];
      if (d.name && d.name !== d.originalName) {
        changes.push({
          id: `act-name-${id}`,
          type: "replace",
          title: `${d.originalName ?? "Activity"}`,
          removeLine: d.originalName ?? null,
          addLine: d.name,
          reason: d.note ?? "Updated by expert",
          dayNum,
        });
      }
      if (d.startTime && d.originalStartTime && d.startTime !== d.originalStartTime) {
        changes.push({
          id: `act-time-${id}`,
          type: "time",
          title: `${d.originalName ?? "Activity"}`,
          removeLine: `${d.originalName} @ ${formatTime(d.originalStartTime)}`,
          addLine: `${d.originalName} @ ${formatTime(d.startTime)}`,
          reason: d.note ?? "Time updated by expert",
          dayNum,
        });
      }
      // Note-only diffs (expert annotation without changing name/time)
      if (d.note && !d.name && !d.startTime) {
        const actName = days.flatMap(day => day.activities).find(a => a.id === id)?.name ?? d.originalName ?? id;
        changes.push({
          id: `act-note-${id}`,
          type: "add",
          title: actName,
          removeLine: null,
          addLine: `Note: "${d.note}"`,
          reason: d.note,
          dayNum,
        });
      }
    }
  }

  if (diff.transportDiffs) {
    for (const [id, d] of Object.entries(diff.transportDiffs)) {
      const dayNum = transportDayMap[id];
      const fromLabel = days.flatMap(day => day.transportLegs).find(t => t.id === id)?.fromLabel;
      const toLabel = days.flatMap(day => day.transportLegs).find(t => t.id === id)?.toLabel;
      const legTitle = fromLabel && toLabel ? `${fromLabel} → ${toLabel}` : `Transport Leg ${d.legOrder}`;
      changes.push({
        id: `trans-${id}`,
        type: "replace",
        title: legTitle,
        removeLine: MODE_LABELS[d.originalMode] ?? d.originalMode,
        addLine: MODE_LABELS[d.newMode] ?? d.newMode,
        reason: "Transport mode suggested by expert",
        dayNum,
      });
    }
  }

  return changes;
}

export function ReviewChangesPage() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const { data, isLoading, error } = useItineraryData(token);
  const [decisions, setDecisions] = useState<Record<string, "accepted" | "rejected">>({});
  const [activeTab, setActiveTab] = useState<FilterTab>("all");

  if (isLoading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={(error as Error).message} />;
  if (!data) return null;

  const destination = data.variant.destination ?? data.variant.name;

  if (!data.expertDiff) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center">
          <History className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-[14px] font-semibold text-gray-700 mb-2">No changes to review</p>
          <p className="text-[12px] text-gray-500 mb-4">
            Your travel expert has not submitted any changes yet.
          </p>
          <Button size="sm" variant="outline" onClick={() => navigate(`/itinerary-view/${token}`)}>
            Back to Itinerary
          </Button>
        </div>
      </div>
    );
  }

  const changes = buildChangesFromDiff(data.expertDiff, data.variant.days);

  const getStatus = (c: ChangeItem): "pending" | "accepted" | "rejected" =>
    decisions[c.id] ?? "pending";

  const counts = {
    pending: changes.filter(c => getStatus(c) === "pending").length,
    accepted: changes.filter(c => getStatus(c) === "accepted").length,
    rejected: changes.filter(c => getStatus(c) === "rejected").length,
  };

  const filtered = changes.filter(c => activeTab === "all" || getStatus(c) === activeTab);

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: "all", label: "All", count: changes.length },
    { key: "pending", label: "Pending", count: counts.pending },
    { key: "accepted", label: "Accepted", count: counts.accepted },
    { key: "rejected", label: "Rejected", count: counts.rejected },
  ];

  return (
    <div className="min-h-screen bg-gray-50" data-testid="review-changes-page">
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(`/itinerary-view/${token}`)}
          className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-[14px] font-bold text-gray-900" data-testid="text-page-title">
            Review Changes
          </h2>
          <p className="text-[11px] text-gray-500 truncate">{destination}</p>
        </div>
        <Filter className="w-4 h-4 text-gray-400" />
      </div>

      {data.expertDiff.submittedAt && (
        <div className="mx-4 mt-3 mb-2 text-[11px] text-gray-500 flex items-center gap-1.5">
          <History className="w-3.5 h-3.5" />
          Submitted {formatDate(data.expertDiff.submittedAt)}
        </div>
      )}

      <div className="mx-4 mt-3 mb-3 grid grid-cols-3 gap-2">
        <Card className="p-3 text-center" data-testid="stat-pending">
          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-1.5">
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-[18px] font-bold text-gray-900">{counts.pending}</div>
          <div className="text-[10px] text-gray-500 font-medium">Pending</div>
        </Card>
        <Card className="p-3 text-center" data-testid="stat-accepted">
          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-1.5">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
          </div>
          <div className="text-[18px] font-bold text-gray-900">{counts.accepted}</div>
          <div className="text-[10px] text-gray-500 font-medium">Accepted</div>
        </Card>
        <Card className="p-3 text-center" data-testid="stat-rejected">
          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-1.5">
            <XCircle className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-[18px] font-bold text-gray-900">{counts.rejected}</div>
          <div className="text-[10px] text-gray-500 font-medium">Rejected</div>
        </Card>
      </div>

      <div className="mx-4 mb-3 flex items-center gap-1.5 overflow-x-auto pb-1">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === tab.key
                ? "bg-gray-800 text-white"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
            data-testid={`tab-${tab.key}`}
          >
            {tab.label}
            <span className={`text-[10px] ${activeTab === tab.key ? "text-gray-300" : "text-gray-400"}`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {counts.pending > 0 && (activeTab === "all" || activeTab === "pending") && (
        <div className="mx-4 mb-3 flex gap-2 justify-end">
          <Button
            size="sm"
            variant="default"
            className="bg-green-600 hover:bg-green-700 text-[11px] gap-1"
            onClick={() => {
              const d: Record<string, "accepted"> = {};
              changes.filter(c => !decisions[c.id]).forEach(c => { d[c.id] = "accepted"; });
              setDecisions(prev => ({ ...prev, ...d }));
            }}
            data-testid="button-accept-all"
          >
            <Check className="w-3.5 h-3.5" /> Accept All
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-red-700 border-red-200 text-[11px] gap-1"
            onClick={() => {
              const d: Record<string, "rejected"> = {};
              changes.filter(c => !decisions[c.id]).forEach(c => { d[c.id] = "rejected"; });
              setDecisions(prev => ({ ...prev, ...d }));
            }}
            data-testid="button-reject-all"
          >
            <X className="w-3.5 h-3.5" /> Reject All
          </Button>
        </div>
      )}

      <div className="mx-4 mb-3 space-y-3">
        {filtered.length === 0 ? (
          <Card className="p-6 text-center">
            <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-[13px] text-gray-500">No changes in this category.</p>
          </Card>
        ) : (
          filtered.map(change => {
            const status = getStatus(change);
            const typeInfo = CHANGE_TYPE_LABELS[change.type] ?? CHANGE_TYPE_LABELS.replace;

            const dayBadge = change.dayNum != null ? (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                  style={{ backgroundColor: DAY_COLORS[(change.dayNum - 1) % DAY_COLORS.length] }}
                >
                  {change.dayNum}
                </div>
                <span className="text-[11px] text-gray-500">Day {change.dayNum}</span>
              </div>
            ) : null;

            if (status === "accepted") {
              return (
                <Card key={change.id} className="overflow-hidden opacity-90" data-testid={`change-card-${change.id}`}>
                  <div className="px-4 py-3 bg-green-50 flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-[13px] text-green-800 font-semibold">{change.title}</span>
                      {change.dayNum != null && (
                        <span className="text-[10px] text-green-600 ml-2">Day {change.dayNum}</span>
                      )}
                    </div>
                    <Badge variant="secondary" className="bg-green-100 text-green-700 text-[10px]">
                      Accepted
                    </Badge>
                  </div>
                </Card>
              );
            }

            if (status === "rejected") {
              return (
                <Card key={change.id} className="overflow-hidden opacity-60" data-testid={`change-card-${change.id}`}>
                  <div className="px-4 py-3 bg-red-50 flex items-center gap-3">
                    <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-[13px] text-red-800 font-semibold line-through">{change.title}</span>
                      {change.dayNum != null && (
                        <span className="text-[10px] text-red-500 ml-2">Day {change.dayNum}</span>
                      )}
                    </div>
                    <Badge variant="secondary" className="bg-red-100 text-red-700 text-[10px]">
                      Rejected
                    </Badge>
                  </div>
                </Card>
              );
            }

            return (
              <Card key={change.id} className="overflow-hidden" data-testid={`change-card-${change.id}`}>
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-bold text-gray-800">{change.title}</span>
                    <Badge
                      variant="secondary"
                      className={`${typeInfo.bg} ${typeInfo.fg} text-[10px] border-0`}
                    >
                      {typeInfo.label}
                    </Badge>
                  </div>
                  {dayBadge}
                </div>
                <div className="px-4 py-3 space-y-2">
                  {change.removeLine && (
                    <div className="flex items-start gap-2.5 bg-red-50/60 rounded-lg px-3 py-2">
                      <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                      <span className="text-[12px] text-red-700 line-through">{change.removeLine}</span>
                    </div>
                  )}
                  <div className="flex items-start gap-2.5 bg-green-50/60 rounded-lg px-3 py-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
                    <span className="text-[12px] text-green-700 font-medium">{change.addLine}</span>
                  </div>
                  {change.reason && (
                    <div className="flex items-start gap-2 ml-1 mt-1">
                      <Lightbulb className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                      <span className="text-[11px] text-gray-500 italic">"{change.reason}"</span>
                    </div>
                  )}
                </div>
                <div className="px-4 py-3 border-t border-gray-100 flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    className="bg-green-600 hover:bg-green-700 text-[12px] gap-1"
                    onClick={() => setDecisions(prev => ({ ...prev, [change.id]: "accepted" }))}
                    data-testid={`button-accept-${change.id}`}
                  >
                    <Check className="w-3.5 h-3.5" /> Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-700 border-red-200 text-[12px] gap-1"
                    onClick={() => setDecisions(prev => ({ ...prev, [change.id]: "rejected" }))}
                    data-testid={`button-reject-${change.id}`}
                  >
                    <X className="w-3.5 h-3.5" /> Reject
                  </Button>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Change History Timeline */}
      {(() => {
        const expertName = data.sharedBy?.name ?? "Expert";
        type TimelineEntry = { id: string; role: "expert" | "owner" | "ai"; who: string; type: string; when: string; what: string };
        const timeline: TimelineEntry[] = [];

        if (data.expertDiff.submittedAt) {
          timeline.push({
            id: "submitted",
            role: "expert",
            who: expertName,
            type: "Submitted",
            when: formatDate(data.expertDiff.submittedAt),
            what: `Submitted ${changes.length} change suggestion${changes.length !== 1 ? "s" : ""} for your review`,
          });
        }

        const acceptedNow = Object.values(decisions).filter(v => v === "accepted").length;
        const rejectedNow = Object.values(decisions).filter(v => v === "rejected").length;

        if (acceptedNow > 0 || rejectedNow > 0) {
          const parts: string[] = [];
          if (acceptedNow > 0) parts.push(`accepted ${acceptedNow}`);
          if (rejectedNow > 0) parts.push(`rejected ${rejectedNow}`);
          timeline.push({
            id: "reviewed",
            role: "owner",
            who: "You",
            type: "Reviewed",
            when: "Just now",
            what: `You ${parts.join(" and ")} change${(acceptedNow + rejectedNow) !== 1 ? "s" : ""}`,
          });
        } else if (counts.pending > 0) {
          timeline.push({
            id: "pending",
            role: "owner",
            who: "You",
            type: "Pending",
            when: "Now",
            what: `${counts.pending} change${counts.pending !== 1 ? "s" : ""} awaiting your decision`,
          });
        }

        const CHANGE_DOT: Record<string, string> = {
          expert: "bg-blue-500",
          ai: "bg-green-500",
          owner: "bg-amber-500",
        };

        if (timeline.length === 0) return null;

        return (
          <div className="mx-4 mb-6">
            <div className="mx-0 my-3 border-t border-gray-200" />
            <div className="flex items-center gap-2 mb-3">
              <History className="w-4 h-4 text-gray-500" />
              <h4 className="text-[13px] font-bold text-gray-800">Change History</h4>
            </div>
            <div className="relative ml-2">
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-200" />
              <div className="space-y-3">
                {timeline.map(entry => (
                  <div key={entry.id} className="flex items-start gap-3 relative" data-testid={`changelog-${entry.id}`}>
                    <div className={`w-[15px] h-[15px] rounded-full ${CHANGE_DOT[entry.role] ?? "bg-gray-400"} flex-shrink-0 z-10 border-2 border-white`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[12px] font-semibold text-gray-800">{entry.who}</span>
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                          {entry.type}
                        </Badge>
                        <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">{entry.when}</span>
                      </div>
                      <p className="text-[11px] text-gray-600 mt-0.5">{entry.what}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
