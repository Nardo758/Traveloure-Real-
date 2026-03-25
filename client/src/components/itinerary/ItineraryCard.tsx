import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Share2,
  User,
  MapPin,
  Clock,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Star,
  Car,
  Bus,
  Train,
  FootprintsIcon,
  Bike,
  Ship,
  UserCheck,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { InlineTransportSelector, type InlineTransportLegData } from "./InlineTransportSelector";
import { DayMapsButton } from "./DayMapsButton";
import { TripExportButton } from "./TripExportButton";
import { NavigateNextButton } from "./NavigateNextButton";
import { cn } from "@/lib/utils";

export interface ItineraryActivity {
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
}

export interface ItineraryDay {
  dayNumber: number;
  date?: string;
  title?: string;
  activities: ItineraryActivity[];
  transportLegs: InlineTransportLegData[];
}

export interface ItineraryCardData {
  id: string;
  name: string;
  description?: string | null;
  destination?: string | null;
  dateRange?: { start?: string | null; end?: string | null };
  totalCost?: string | number | null;
  optimizationScore?: number | null;
  days: ItineraryDay[];
  transportSummary?: {
    totalLegs: number;
    totalMinutes: number;
    totalCostUsd: number;
  };
}

export interface ActivityDiff {
  name?: string;
  startTime?: string;
  note?: string;
  originalName: string;
  originalStartTime?: string;
}

export interface TransportDiff {
  originalMode: string;
  newMode: string;
  legOrder: number;
}

interface ItineraryCardProps {
  data: ItineraryCardData;
  mapsLinks?: {
    googleMapsPerDay?: Record<number, string>;
    appleMapsPerDay?: Record<number, string>;
    appleMapsWebPerDay?: Record<number, string>;
    kmlDownloadUrl?: string;
    gpxDownloadUrl?: string;
  };
  sharedBy?: { name: string; avatarUrl?: string | null };
  shareToken?: string;
  permissions?: string;
  readOnly?: boolean;
  isOwner?: boolean;
  variantId?: string;
  showShareButton?: boolean;
  onShareSuccess?: (token: string, url: string) => void;
  onSendToExpert?: () => void;
  liveMode?: boolean;
  expertDiff?: {
    activityDiffs?: Record<string, ActivityDiff>;
    transportDiffs?: Record<string, TransportDiff>;
    submittedAt?: string;
  } | null;
  onActivityDiffsChange?: (diffs: Record<string, ActivityDiff>) => void;
  onTransportDiffsChange?: (diffs: Record<string, TransportDiff>) => void;
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function formatDayDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  } catch {
    return dateStr;
  }
}

function formatTime(timeStr?: string | null): string {
  if (!timeStr) return "";
  try {
    return new Date(timeStr).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return timeStr;
  }
}

function getModeIcon(mode: string) {
  const m = mode?.toLowerCase() || "";
  if (m.includes("walk") || m.includes("foot")) return FootprintsIcon;
  if (m.includes("train") || m.includes("rail") || m.includes("metro") || m.includes("subway")) return Train;
  if (m.includes("bus") || m.includes("transit")) return Bus;
  if (m.includes("bike") || m.includes("cycling")) return Bike;
  if (m.includes("boat") || m.includes("ferry") || m.includes("ship")) return Ship;
  return Car;
}

function getModeColor(mode: string): string {
  const m = mode?.toLowerCase() || "";
  if (m.includes("walk") || m.includes("foot")) return "bg-green-500";
  if (m.includes("train") || m.includes("rail") || m.includes("metro")) return "bg-blue-500";
  if (m.includes("bus") || m.includes("transit")) return "bg-purple-500";
  if (m.includes("bike") || m.includes("cycling")) return "bg-teal-500";
  if (m.includes("boat") || m.includes("ferry")) return "bg-cyan-500";
  return "bg-orange-500";
}

function TransportModeBar({ legs }: { legs: InlineTransportLegData[] }) {
  if (!legs || legs.length === 0) return null;

  const totalMinutes = legs.reduce((s, l) => s + (l.estimatedDurationMinutes || 0), 0);
  if (totalMinutes === 0) return null;

  const modeTotals: Record<string, number> = {};
  for (const leg of legs) {
    const mode = leg.userSelectedMode || leg.recommendedMode || "other";
    modeTotals[mode] = (modeTotals[mode] || 0) + (leg.estimatedDurationMinutes || 0);
  }

  return (
    <div className="mt-2" data-testid="transport-mode-bar">
      <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
        {Object.entries(modeTotals).map(([mode, mins]) => {
          const pct = (mins / totalMinutes) * 100;
          return (
            <div
              key={mode}
              className={cn("h-full rounded-sm", getModeColor(mode))}
              style={{ width: `${pct}%` }}
              title={`${mode}: ${mins} min`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 mt-1">
        {Object.entries(modeTotals).map(([mode, mins]) => {
          const Icon = getModeIcon(mode);
          return (
            <span key={mode} className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className={cn("h-2 w-2 rounded-full inline-block", getModeColor(mode))} />
              <Icon className="h-3 w-3" />
              {mode} ({mins}m)
            </span>
          );
        })}
      </div>
    </div>
  );
}

function VibeTagsBar({ days }: { days: ItineraryDay[] }) {
  const categoryCounts: Record<string, number> = {};
  for (const day of days) {
    for (const act of day.activities) {
      const cat = act.category;
      if (cat) categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }
  }
  const topCats = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cat]) => cat);

  if (topCats.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mb-4" data-testid="vibe-tags">
      {topCats.map(cat => (
        <Badge key={cat} variant="outline" className="text-xs px-2 py-0.5 capitalize">
          {cat}
        </Badge>
      ))}
    </div>
  );
}

export function ItineraryCard({
  data,
  mapsLinks,
  sharedBy,
  shareToken,
  permissions,
  readOnly = false,
  isOwner = false,
  variantId,
  showShareButton = false,
  onShareSuccess,
  onSendToExpert,
  liveMode = false,
  expertDiff,
  onActivityDiffsChange,
  onTransportDiffsChange,
}: ItineraryCardProps) {
  const { toast } = useToast();
  const [copiedUrl, setCopiedUrl] = useState("");
  const [expandedDays, setExpandedDays] = useState<Record<number, boolean>>(() => {
    const init: Record<number, boolean> = {};
    data.days.forEach((d, i) => { init[d.dayNumber] = i === 0; });
    return init;
  });

  const isExpertMode = permissions === "suggest";

  const [activityDiffs, setActivityDiffs] = useState<Record<string, ActivityDiff>>({});
  const [transportDiffs, setTransportDiffs] = useState<Record<string, TransportDiff>>({});
  const [editingActivity, setEditingActivity] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ name: string; startTime: string; note: string }>({ name: "", startTime: "", note: "" });

  const [activityTimingOverrides, setActivityTimingOverrides] = useState<Record<string, string>>({});

  const handleLegModeChange = (legId: string, timeDiffMinutes: number) => {
    let targetDayNum: number | null = null;
    let legOrder: number | null = null;

    for (const day of data.days) {
      const leg = day.transportLegs.find(l => l.id === legId);
      if (leg) {
        targetDayNum = day.dayNumber;
        legOrder = leg.legOrder;
        break;
      }
    }

    if (targetDayNum === null || legOrder === null) return;

    const targetDay = data.days.find(d => d.dayNumber === targetDayNum);
    if (!targetDay) return;

    const nextActivityIdx = legOrder;
    if (nextActivityIdx >= targetDay.activities.length) return;

    const nextActivity = targetDay.activities[nextActivityIdx];
    if (!nextActivity.startTime) return;

    try {
      const currentTime = new Date(nextActivity.startTime);
      const newTime = new Date(currentTime.getTime() + timeDiffMinutes * 60 * 1000);
      setActivityTimingOverrides(prev => ({ ...prev, [nextActivity.id]: newTime.toISOString() }));
    } catch (e) {
      console.error("Failed to parse activity time:", e);
    }
  };

  const handleTransportModeChange = (legId: string, newMode: string, originalMode: string) => {
    if (!isExpertMode) return;
    let legOrder = 0;
    for (const day of data.days) {
      const leg = day.transportLegs.find(l => l.id === legId);
      if (leg) { legOrder = leg.legOrder; break; }
    }
    const newDiffs = {
      ...transportDiffs,
      [legId]: { originalMode, newMode, legOrder },
    };
    setTransportDiffs(newDiffs);
    onTransportDiffsChange?.(newDiffs);
  };

  const startEditActivity = (activity: ItineraryActivity) => {
    setEditingActivity(activity.id);
    const existing = activityDiffs[activity.id];
    setEditValues({
      name: existing?.name ?? activity.name,
      startTime: existing?.startTime ?? (activity.startTime ? formatTime(activity.startTime) : ""),
      note: existing?.note ?? "",
    });
  };

  const confirmEditActivity = (activity: ItineraryActivity) => {
    const nameChanged = editValues.name !== activity.name;
    const timeChanged = editValues.startTime !== (activity.startTime ? formatTime(activity.startTime) : "");
    const noteAdded = editValues.note.trim() !== "";
    const hasChange = nameChanged || timeChanged || noteAdded;

    if (hasChange) {
      const newDiffs = {
        ...activityDiffs,
        [activity.id]: {
          ...(nameChanged ? { name: editValues.name } : {}),
          ...(timeChanged ? { startTime: editValues.startTime } : {}),
          ...(noteAdded ? { note: editValues.note } : {}),
          originalName: activity.name,
          originalStartTime: activity.startTime ? formatTime(activity.startTime) : undefined,
        },
      };
      setActivityDiffs(newDiffs);
      onActivityDiffsChange?.(newDiffs);
    } else {
      const newDiffs = { ...activityDiffs };
      delete newDiffs[activity.id];
      setActivityDiffs(newDiffs);
      onActivityDiffsChange?.(newDiffs);
    }
    setEditingActivity(null);
  };

  const cancelEditActivity = () => {
    setEditingActivity(null);
  };

  const clearActivityDiff = (activityId: string) => {
    const newDiffs = { ...activityDiffs };
    delete newDiffs[activityId];
    setActivityDiffs(newDiffs);
    onActivityDiffsChange?.(newDiffs);
  };

  const shareMutation = useMutation({
    mutationFn: async () => {
      if (!variantId) throw new Error("No variant ID");
      return apiRequest("POST", `/api/itinerary-variants/${variantId}/share`, { permissions: "view" });
    },
    onSuccess: (data: any) => {
      setCopiedUrl(data.shareUrl);
      navigator.clipboard?.writeText(data.shareUrl).catch(() => {});
      toast({ title: "Share link created!", description: "Link copied to clipboard." });
      onShareSuccess?.(data.shareToken, data.shareUrl);
    },
    onError: () => {
      toast({ title: "Failed to create share link", variant: "destructive" });
    },
  });

  const totalDays = data.days.length;
  const totalCost = data.totalCost ? parseFloat(String(data.totalCost)) : null;

  const toggleDay = (dayNum: number) => {
    setExpandedDays(prev => ({ ...prev, [dayNum]: !prev[dayNum] }));
  };

  const calculateTransportSummary = () => {
    let totalLegs = 0;
    let totalMinutes = 0;
    let totalCostUsd = 0;
    const modeTotals: Record<string, number> = {};

    for (const day of data.days) {
      for (const leg of day.transportLegs) {
        totalLegs++;
        const currentDuration = leg.estimatedDurationMinutes || 0;
        totalMinutes += currentDuration;
        totalCostUsd += leg.estimatedCostUsd || 0;

        const mode = leg.userSelectedMode || leg.recommendedMode || "other";
        modeTotals[mode] = (modeTotals[mode] || 0) + (currentDuration || 0);
      }
    }

    return { totalLegs, totalMinutes, totalCostUsd, modeTotals };
  };

  const transportSummary = calculateTransportSummary();
  const totalChanges = Object.keys(activityDiffs).length + Object.keys(transportDiffs).length;

  return (
    <div className="space-y-0" data-testid="itinerary-card">
      <div className="relative overflow-hidden rounded-xl mb-5">
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-transparent z-10" />
        <img
          src={`https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1200&q=80`}
          alt={data.destination || "Destination"}
          className="w-full h-48 object-cover"
        />
        <div className="absolute inset-0 z-20 flex flex-col justify-end p-5">
          <div className="text-white">
            <h2 className="text-2xl font-bold uppercase tracking-wide">
              {data.destination || data.name}
            </h2>
            {data.dateRange?.start && (
              <p className="text-sm text-white/80 mt-0.5">
                {formatDate(data.dateRange.start)} — {formatDate(data.dateRange.end)}
              </p>
            )}
            <div className="flex flex-wrap gap-2 mt-2">
              {data.optimizationScore && (
                <Badge className="bg-amber-500 text-white text-xs">
                  <Star className="h-3 w-3 mr-1" />
                  Score {data.optimizationScore}
                </Badge>
              )}
              {totalCost && (
                <Badge className="bg-white/20 text-white text-xs backdrop-blur-sm">
                  <DollarSign className="h-3 w-3 mr-1" />${totalCost.toFixed(0)} total
                </Badge>
              )}
              {totalDays > 0 && (
                <Badge className="bg-white/20 text-white text-xs backdrop-blur-sm">
                  <Clock className="h-3 w-3 mr-1" />{totalDays} day{totalDays !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {sharedBy && (
        <div className="flex items-center gap-2 mb-4 px-1">
          <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center overflow-hidden">
            {sharedBy.avatarUrl ? (
              <img src={sharedBy.avatarUrl} alt={sharedBy.name} className="h-full w-full object-cover" />
            ) : (
              <User className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <p className="text-sm text-muted-foreground">Shared by <strong>{sharedBy.name}</strong></p>
        </div>
      )}

      <VibeTagsBar days={data.days} />

      <div className="flex flex-wrap gap-2 mb-5">
        {showShareButton && variantId && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => shareMutation.mutate()}
            disabled={shareMutation.isPending}
            className="gap-2"
            data-testid="button-share-itinerary"
          >
            <Share2 className="h-4 w-4" />
            {copiedUrl ? "Link Copied!" : "Share"}
          </Button>
        )}
        {onSendToExpert && (
          <Button
            variant="outline"
            size="sm"
            onClick={onSendToExpert}
            className="gap-2"
            data-testid="button-send-to-expert"
          >
            <UserCheck className="h-4 w-4" />
            Send to Expert
          </Button>
        )}
        {shareToken && (
          <TripExportButton shareToken={shareToken} />
        )}
      </div>

      {isExpertMode && totalChanges > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800" data-testid="expert-changes-summary">
          <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
            {totalChanges} pending change{totalChanges !== 1 ? "s" : ""} tracked
          </p>
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
            {Object.keys(activityDiffs).length > 0 && `${Object.keys(activityDiffs).length} activity edit${Object.keys(activityDiffs).length !== 1 ? "s" : ""}`}
            {Object.keys(activityDiffs).length > 0 && Object.keys(transportDiffs).length > 0 && ", "}
            {Object.keys(transportDiffs).length > 0 && `${Object.keys(transportDiffs).length} transport change${Object.keys(transportDiffs).length !== 1 ? "s" : ""}`}
            {' — use "Send Edits" above when ready.'}
          </p>
        </div>
      )}

      {transportSummary.totalLegs > 0 && (
        <Card className="mb-5" data-testid="transport-summary">
          <CardContent className="p-4">
            <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Car className="h-4 w-4 text-primary" />
              Trip Transport
            </h4>
            <div className="grid grid-cols-3 gap-3 text-center mb-3">
              <div>
                <p className="text-lg font-bold">{transportSummary.totalLegs}</p>
                <p className="text-xs text-muted-foreground">Legs</p>
              </div>
              <div>
                <p className="text-lg font-bold">
                  {Math.floor(transportSummary.totalMinutes / 60)}h {transportSummary.totalMinutes % 60}m
                </p>
                <p className="text-xs text-muted-foreground">Transit time</p>
              </div>
              <div>
                <p className="text-lg font-bold">${transportSummary.totalCostUsd.toFixed(0)}</p>
                <p className="text-xs text-muted-foreground">Est. cost</p>
              </div>
            </div>
            <TransportModeBar legs={data.days.flatMap(d => d.transportLegs)} />
          </CardContent>
        </Card>
      )}

      {data.days.map((day) => {
        const googleUrl = mapsLinks?.googleMapsPerDay?.[day.dayNumber] || "";
        const appleUrl = mapsLinks?.appleMapsPerDay?.[day.dayNumber] || "";
        const appleWebUrl = mapsLinks?.appleMapsWebPerDay?.[day.dayNumber] || "";
        const isOpen = expandedDays[day.dayNumber] ?? true;

        const totalDayTransportMin = day.transportLegs.reduce((s, l) => s + (l.estimatedDurationMinutes || 0), 0);

        return (
          <Collapsible key={day.dayNumber} open={isOpen} onOpenChange={() => toggleDay(day.dayNumber)}>
            <div className="mb-2" data-testid={`day-section-${day.dayNumber}`}>
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between mb-1 cursor-pointer rounded-lg px-2 py-2 hover:bg-muted/50 group">
                  <div>
                    <h3 className="text-base font-semibold">
                      Day {day.dayNumber}
                      {day.date ? ` — ${formatDayDate(day.date)}` : ""}
                    </h3>
                    {day.title && <p className="text-sm text-muted-foreground">{day.title}</p>}
                    {!isOpen && (
                      <p className="text-xs text-muted-foreground">
                        {day.activities.length} activities
                        {totalDayTransportMin > 0 && ` • ${totalDayTransportMin}m transit`}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {(googleUrl || appleUrl || appleWebUrl) && isOpen && (
                      <DayMapsButton
                        dayNumber={day.dayNumber}
                        googleUrl={googleUrl}
                        appleUrl={appleUrl}
                        appleWebUrl={appleWebUrl}
                      />
                    )}
                    <span className="text-muted-foreground group-hover:text-foreground">
                      {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </span>
                  </div>
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="space-y-0 pl-1">
                  {day.activities.map((activity, actIdx) => {
                    const legAfter = day.transportLegs.find(l => l.legOrder === actIdx + 1);
                    const isCurrentOrNext = liveMode && actIdx === 0;
                    const diff = activityDiffs[activity.id];
                    const hasDiff = !!diff;
                    const isEditing = editingActivity === activity.id;
                    const displayedTime = activityTimingOverrides[activity.id] || activity.startTime;
                    const displayedName = diff?.name ?? activity.name;
                    const displayedStartTime = diff?.startTime ?? (displayedTime ? formatTime(displayedTime) : "");
                    const reviewedDiff = expertDiff?.activityDiffs?.[activity.id];

                    return (
                      <div key={activity.id}>
                        <Card className={cn(
                          "border",
                          isCurrentOrNext && "border-primary/50 bg-primary/5",
                          hasDiff && "border-blue-300 dark:border-blue-700",
                          reviewedDiff && !isExpertMode && "border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20"
                        )}>
                          <CardContent className="p-4">
                            {isEditing ? (
                              <div className="space-y-2" data-testid={`edit-activity-${activity.id}`}>
                                <div className="flex items-center gap-2">
                                  <Input
                                    value={editValues.name}
                                    onChange={e => setEditValues(v => ({ ...v, name: e.target.value }))}
                                    className="text-sm font-medium h-8"
                                    placeholder="Activity name"
                                    data-testid={`input-activity-name-${activity.id}`}
                                  />
                                </div>
                                <div className="flex items-center gap-2">
                                  <Input
                                    value={editValues.startTime}
                                    onChange={e => setEditValues(v => ({ ...v, startTime: e.target.value }))}
                                    className="text-xs h-7 w-24 font-mono"
                                    placeholder="HH:MM"
                                    data-testid={`input-activity-time-${activity.id}`}
                                  />
                                  <span className="text-xs text-muted-foreground">start time</span>
                                </div>
                                <Textarea
                                  value={editValues.note}
                                  onChange={e => setEditValues(v => ({ ...v, note: e.target.value }))}
                                  className="text-xs min-h-[56px]"
                                  placeholder="Expert note (optional)…"
                                  rows={2}
                                  data-testid={`textarea-activity-note-${activity.id}`}
                                />
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    className="h-7 text-xs gap-1"
                                    onClick={() => confirmEditActivity(activity)}
                                    data-testid={`button-confirm-edit-${activity.id}`}
                                  >
                                    <Check className="h-3 w-3" /> Save
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs gap-1"
                                    onClick={cancelEditActivity}
                                    data-testid={`button-cancel-edit-${activity.id}`}
                                  >
                                    <X className="h-3 w-3" /> Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                    {displayedStartTime && (
                                      <p className="text-xs font-mono text-muted-foreground">
                                        {displayedStartTime}
                                        {diff?.startTime && diff.originalStartTime && diff.startTime !== diff.originalStartTime && (
                                          <span className="ml-1 line-through text-muted-foreground/50">{diff.originalStartTime}</span>
                                        )}
                                      </p>
                                    )}
                                    {hasDiff && (
                                      <Badge className="text-xs h-4 px-1 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 border border-blue-300">
                                        Changed
                                      </Badge>
                                    )}
                                    {reviewedDiff && !isExpertMode && (
                                      <Badge className="text-xs h-4 px-1 bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 border border-amber-300">
                                        Expert edit
                                      </Badge>
                                    )}
                                  </div>
                                  <h4 className="font-medium text-sm leading-tight">
                                    {displayedName}
                                    {diff?.name && diff.name !== activity.name && (
                                      <span className="ml-2 text-xs line-through text-muted-foreground/50">{activity.name}</span>
                                    )}
                                  </h4>
                                  {reviewedDiff?.name && !isExpertMode && (
                                    <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                                      Expert suggests: <strong>{reviewedDiff.name}</strong>
                                      {activity.name !== reviewedDiff.name && (
                                        <span className="ml-1 text-muted-foreground">(was: {activity.name})</span>
                                      )}
                                    </p>
                                  )}
                                  {reviewedDiff?.note && !isExpertMode && (
                                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 italic">
                                      Expert note: "{reviewedDiff.note}"
                                    </p>
                                  )}
                                  {diff?.note && isExpertMode && (
                                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5 italic">Note: {diff.note}</p>
                                  )}
                                  <div className="flex flex-wrap gap-2 mt-1">
                                    {activity.category && (
                                      <Badge variant="secondary" className="text-xs capitalize">{activity.category}</Badge>
                                    )}
                                    {activity.duration && (
                                      <span className="text-xs text-muted-foreground">{activity.duration} min</span>
                                    )}
                                    {activity.cost !== undefined && activity.cost !== null && (
                                      <span className="text-xs text-muted-foreground">
                                        {activity.cost === 0 ? "Free" : `$${activity.cost}`}
                                      </span>
                                    )}
                                  </div>
                                  {activity.location && (
                                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{activity.location}</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {isExpertMode && (
                                    <button
                                      onClick={() => startEditActivity(activity)}
                                      className={cn(
                                        "p-1.5 rounded-md transition-colors",
                                        hasDiff
                                          ? "text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900"
                                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                      )}
                                      title="Edit activity"
                                      data-testid={`button-edit-activity-${activity.id}`}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  {isExpertMode && hasDiff && (
                                    <button
                                      onClick={() => clearActivityDiff(activity.id)}
                                      className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                      title="Remove edit"
                                      data-testid={`button-clear-edit-${activity.id}`}
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  {activity.lat && activity.lng && (
                                    <a
                                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activity.name)}&center=${activity.lat},${activity.lng}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="shrink-0 text-primary hover:text-primary/80 p-1"
                                      title="Open in Maps"
                                      data-testid={`link-activity-maps-${activity.id}`}
                                    >
                                      <MapPin className="h-4 w-4" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            )}

                            {liveMode && legAfter && (
                              <div className="mt-3 pt-3 border-t">
                                <NavigateNextButton
                                  leg={legAfter}
                                  shareToken={shareToken}
                                  dayNumber={day.dayNumber}
                                  toActivityName={day.activities[actIdx + 1]?.name || "Next stop"}
                                />
                              </div>
                            )}
                          </CardContent>
                        </Card>

                        {legAfter && (
                          <InlineTransportSelector
                            leg={legAfter}
                            readOnly={readOnly && !isExpertMode}
                            shareToken={shareToken}
                            className="my-1"
                            onModeChangeSuccess={handleLegModeChange}
                            onModeChange={isExpertMode ? handleTransportModeChange : undefined}
                            expertChanged={!!transportDiffs[legAfter.id] || !!expertDiff?.transportDiffs?.[legAfter.id]}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                {day.transportLegs.length > 0 && (
                  <div className="mt-3 px-2">
                    <TransportModeBar legs={day.transportLegs} />
                  </div>
                )}
              </CollapsibleContent>
            </div>
          </Collapsible>
        );
      })}
    </div>
  );
}
