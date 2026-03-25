import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertCircle, Share2, MessageCircle, User, ExternalLink,
  CheckCircle, XCircle, Eye, MapPin, Pencil, Check, X, Clock,
} from "lucide-react";
import type { ActivityDiff, TransportDiff } from "@/components/itinerary/ItineraryCard";
import type { InlineTransportLegData } from "@/components/itinerary/InlineTransportSelector";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  getTemplateConfig,
  TYPE_COLORS, MODE_COLORS, ModeIcon,
  type PlanCardDay, type PlanCardTrip,
} from "@/components/plancard/plancard-types";
import { HeroSection } from "@/components/plancard/HeroSection";
import { StatsRow, CostIcon, type ExtraStat } from "@/components/plancard/StatsRow";
import { DaySelector } from "@/components/plancard/DaySelector";
import { SectionTabs } from "@/components/plancard/SectionTabs";
import { ActivitiesSection } from "@/components/plancard/ActivitiesSection";
import { TransportSection } from "@/components/plancard/TransportSection";
import { MapControlCenter } from "@/components/plancard/MapControlCenter";

interface SharedItineraryResponse {
  variant: {
    id: string;
    name: string;
    description?: string | null;
    destination?: string | null;
    dateRange?: { start?: string | null; end?: string | null };
    totalCost?: string | number | null;
    optimizationScore?: number | null;
    days: Array<{
      dayNumber: number;
      date?: string;
      activities: Array<{
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
      }>;
      transportLegs: InlineTransportLegData[];
    }>;
    transportSummary?: {
      totalLegs: number;
      totalMinutes: number;
      totalCostUsd: number;
    };
  };
  mapsLinks?: {
    googleMapsPerDay?: Record<number, string>;
    appleMapsPerDay?: Record<number, string>;
    appleMapsWebPerDay?: Record<number, string>;
    kmlDownloadUrl?: string;
    gpxDownloadUrl?: string;
  };
  sharedBy?: { name: string; avatarUrl?: string | null; userId?: string };
  permissions?: string;
  shareToken?: string;
  expertStatus?: string;
  expertNotes?: string | null;
  expertDiff?: {
    activityDiffs?: Record<string, ActivityDiff>;
    transportDiffs?: Record<string, TransportDiff>;
    submittedAt?: string;
  } | null;
  sharedWithExpert?: boolean;
  isOwner?: boolean;
}

function formatTime(timeStr?: string | null): string {
  if (!timeStr) return "";
  try {
    return new Date(timeStr).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return timeStr;
  }
}

export default function ItineraryViewPage() {
  const { token } = useParams<{ token: string }>();
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showSuggestDialog, setShowSuggestDialog] = useState(false);
  const [expertNotes, setExpertNotes] = useState("");
  const [activityDiffs, setActivityDiffs] = useState<Record<string, ActivityDiff>>({});
  const [transportDiffs, setTransportDiffs] = useState<Record<string, TransportDiff>>({});
  const [showDiffReview, setShowDiffReview] = useState(false);
  const [rejectedDiffIds, setRejectedDiffIds] = useState<Set<string>>(new Set());
  const [selectedDay, setSelectedDay] = useState(0);
  const [section, setSection] = useState<"activities" | "transport">("activities");
  const [showChanges, setShowChanges] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [editingActivity, setEditingActivity] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ name: string; startTime: string; note: string }>({ name: "", startTime: "", note: "" });

  const { data, isLoading, error } = useQuery<SharedItineraryResponse>({
    queryKey: ["/api/itinerary-share", token],
    queryFn: async () => {
      const res = await fetch(`/api/itinerary-share/${token}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to load" }));
        throw new Error(err.error || "Failed to load itinerary");
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  const suggestModMutation = useMutation({
    mutationFn: async () => {
      if (!expertNotes.trim()) throw new Error("Please add a note in the Expert Notes panel before sending.");
      const res = await fetch(`/api/expert-review/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: expertNotes,
          activityDiffs,
          transportDiffs,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error || "Failed to send suggestion");
      }
      return res.json();
    },
    onSuccess: () => {
      setShowSuggestDialog(false);
      toast({ title: "Edits sent!", description: "The traveler has been notified of your suggestions." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to send edits", description: err.message, variant: "destructive" });
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async ({ action, rejectedIds }: { action: "accept" | "reject"; rejectedIds?: string[] }) => {
      const res = await fetch(`/api/expert-review/${token}/acknowledge`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, rejectedDiffIds: rejectedIds }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error || "Failed to acknowledge");
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/itinerary-share", token] });
      setShowDiffReview(false);
      setRejectedDiffIds(new Set());
      toast({
        title: variables.action === "accept" ? "Edits accepted" : "Edits rejected",
        description: variables.action === "accept"
          ? "The expert's suggestions have been accepted."
          : "The expert's suggestions have been dismissed.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!data?.variant) return;

    const destination = data.variant.destination || data.variant.name;
    const cost = data.variant.totalCost ? `$${data.variant.totalCost}` : "";
    const days = data.variant.days?.length || 0;
    const dayText = days > 0 ? `${days} day${days !== 1 ? "s" : ""}` : "";

    const categorySet = new Set<string>();
    data.variant.days?.forEach((day) => {
      day.activities?.forEach((act) => {
        if (act.category) categorySet.add(act.category);
      });
    });
    const vibeTags = Array.from(categorySet).slice(0, 3).join(", ");

    const descriptionParts = [vibeTags, dayText, cost].filter(Boolean);
    const description = `${destination} itinerary: ${descriptionParts.join(" • ")}`;

    document.title = `${destination} Itinerary • Traveloure`;

    const setMetaTag = (property: string, content: string) => {
      let tag = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute("property", property);
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", content);
    };

    const setMetaName = (name: string, content: string) => {
      let tag = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute("name", name);
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", content);
    };

    setMetaTag("og:title", `${destination} Itinerary • Traveloure`);
    setMetaTag("og:description", description);
    setMetaName("description", description);

    const coverImageUrl = "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1200&h=630&q=80";
    setMetaTag("og:image", coverImageUrl);
    setMetaTag("og:type", "website");

    return () => {
      document.title = "Traveloure";
    };
  }, [data?.variant]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-2xl mx-auto p-6 space-y-4">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
          <div className="space-y-3 mt-6">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    const errMsg = (error as Error).message;
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
          <h2 className="text-xl font-semibold mb-2">
            {errMsg.includes("expired") ? "Link Expired" : "Itinerary Not Found"}
          </h2>
          <p className="text-muted-foreground mb-4">
            {errMsg.includes("expired")
              ? "This share link has expired. Ask the owner to share a new link."
              : "This itinerary could not be found. The link may be invalid."}
          </p>
          <Button variant="outline" onClick={() => window.location.href = "/"}>
            Go to Homepage
          </Button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const isExpertView = data.permissions === "suggest" || data.permissions === "edit" || data.sharedWithExpert;
  const isOwnerView = !!data.isOwner;
  const expertStatus = data.expertStatus;
  const hasPendingReview = isOwnerView && expertStatus === "review_sent";

  const totalDiffs = Object.keys(activityDiffs).length + Object.keys(transportDiffs).length;
  const reviewActivityDiffs = data.expertDiff?.activityDiffs || {};
  const reviewTransportDiffs = data.expertDiff?.transportDiffs || {};
  const totalReviewDiffs = Object.keys(reviewActivityDiffs).length + Object.keys(reviewTransportDiffs).length;

  const diffActivityIds = new Set(Object.keys(reviewActivityDiffs));
  const daysWithActivityDiffs = data.variant.days
    .filter(d => d.activities.some(a => diffActivityIds.has(a.id)))
    .map(d => d.dayNumber);
  const hasDiffMapData = data.variant.days.some(d =>
    d.activities.some(a => diffActivityIds.has(a.id) && (a as any).lat != null)
  );

  const destination = data.variant.destination || data.variant.name;
  const templateConfig = getTemplateConfig(null);
  const GOOGLE_MAPS_AVAILABLE = !!(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);

  const planCardTrip: PlanCardTrip = {
    id: data.variant.id,
    destination: destination,
    title: data.variant.name,
    startDate: data.variant.dateRange?.start || new Date().toISOString().slice(0, 10),
    endDate: data.variant.dateRange?.end || new Date().toISOString().slice(0, 10),
    numberOfTravelers: 1,
  };

  const planCardDays: PlanCardDay[] = data.variant.days.map(d => {
    let dateLabel = `Day ${d.dayNumber}`;
    if (d.date) {
      try {
        const parsed = new Date(d.date);
        if (!isNaN(parsed.getTime())) {
          dateLabel = parsed.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
        }
      } catch {}
    }
    return {
    dayNum: d.dayNumber,
    date: d.date || `Day ${d.dayNumber}`,
    label: dateLabel,
    activities: d.activities.map(a => ({
      id: a.id,
      name: activityDiffs[a.id]?.name || a.name,
      type: a.category || "activity",
      status: "pending" as string,
      time: activityDiffs[a.id]?.startTime || formatTime(a.startTime) || "",
      location: a.location || "",
      lat: a.lat ?? undefined,
      lng: a.lng ?? undefined,
      cost: a.cost || 0,
      comments: 0,
    })),
    transports: d.transportLegs.map((l, li) => {
      const tDiff = transportDiffs[l.id];
      return {
        id: l.id,
        mode: tDiff?.newMode || l.userSelectedMode || l.recommendedMode || "transit",
        from: d.activities[li]?.id || "",
        to: d.activities[li + 1]?.id || "",
        fromName: d.activities[li]?.name || "",
        toName: d.activities[li + 1]?.name || "",
        duration: l.estimatedDurationMinutes || 0,
        cost: l.estimatedCostUsd || 0,
        status: "confirmed" as string,
      };
    }),
  };
  });

  const currentDay = planCardDays[selectedDay];
  const allActivities = planCardDays.flatMap(d => d.activities);
  const totalActivities = allActivities.length;
  const totalBooked = 0;
  const totalLegs = data.variant.transportSummary?.totalLegs || planCardDays.reduce((s, d) => s + (d.transports?.length || 0), 0);
  const totalMinutes = data.variant.transportSummary?.totalMinutes || planCardDays.reduce((s, d) => s + (d.transports || []).reduce((t, tr) => t + (tr.duration || 0), 0), 0);
  const totalCostNum = data.variant.totalCost ? parseFloat(String(data.variant.totalCost)) : allActivities.reduce((s, a) => s + a.cost, 0);
  const transportCost = data.variant.transportSummary?.totalCostUsd || planCardDays.reduce((s, d) => s + (d.transports || []).reduce((t, tr) => t + (tr.cost || 0), 0), 0);
  const grandTotal = totalCostNum + transportCost;

  const extraStats: ExtraStat[] = [
    { label: "Total Cost", value: `$${grandTotal.toLocaleString()}`, icon: CostIcon },
  ];

  const startEditActivity = (activityId: string, name: string, startTime?: string | null) => {
    setEditingActivity(activityId);
    const existing = activityDiffs[activityId];
    setEditValues({
      name: existing?.name ?? name,
      startTime: existing?.startTime ?? (formatTime(startTime) || ""),
      note: existing?.note ?? "",
    });
  };

  const confirmEditActivity = (activityId: string, originalName: string, originalStartTime?: string | null) => {
    const nameChanged = editValues.name !== originalName;
    const timeChanged = editValues.startTime !== (formatTime(originalStartTime) || "");
    const noteAdded = editValues.note.trim() !== "";
    const hasChange = nameChanged || timeChanged || noteAdded;

    if (hasChange) {
      const newDiffs = {
        ...activityDiffs,
        [activityId]: {
          ...(nameChanged ? { name: editValues.name } : {}),
          ...(timeChanged ? { startTime: editValues.startTime } : {}),
          ...(noteAdded ? { note: editValues.note } : {}),
          originalName,
          originalStartTime: formatTime(originalStartTime) || undefined,
        },
      };
      setActivityDiffs(newDiffs);
    } else {
      const newDiffs = { ...activityDiffs };
      delete newDiffs[activityId];
      setActivityDiffs(newDiffs);
    }
    setEditingActivity(null);
  };

  const handleTransportModeChange = (legId: string, newMode: string, originalMode: string) => {
    if (!isExpertView) return;
    const newDiffs = { ...transportDiffs };
    if (newMode === originalMode) {
      delete newDiffs[legId];
    } else {
      let legOrder = 0;
      for (const day of data.variant.days) {
        const leg = day.transportLegs.find(l => l.id === legId);
        if (leg) { legOrder = leg.legOrder; break; }
      }
      newDiffs[legId] = { originalMode, newMode, legOrder };
    }
    setTransportDiffs(newDiffs);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-4 pb-12">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-primary" data-testid="text-brand-logo">Traveloure</span>
            <Badge variant="secondary" className="text-xs" data-testid="badge-view-mode">
              {isExpertView ? "Expert Review" : "Shared Itinerary"}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (navigator.share) {
                const shareTitle = `${destination} Itinerary • Traveloure`;
                navigator.share({ title: shareTitle, url: window.location.href }).catch(() => {});
              } else {
                navigator.clipboard?.writeText(window.location.href).catch(() => {});
                toast({ title: "Link copied!" });
              }
            }}
            data-testid="button-share-page"
            className="gap-2"
          >
            <Share2 className="h-4 w-4" />
            Share
          </Button>
        </div>

        {isExpertView && (
          <div className="mb-4 p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800" data-testid="expert-edit-banner">
            <div className="flex items-start gap-3">
              <User className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-sm text-amber-800 dark:text-amber-200">Expert Edit Mode</p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                  Edit activity names, times, and notes directly on the cards below. You can also swap transport modes.
                  {totalDiffs > 0 && ` (${totalDiffs} pending change${totalDiffs !== 1 ? "s" : ""})`}
                  {data.sharedBy?.name && ` Shared by ${data.sharedBy.name}.`}
                </p>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <Button
                  size="sm"
                  onClick={() => setShowSuggestDialog(true)}
                  className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
                  data-testid="button-send-edits"
                >
                  <MessageCircle className="h-4 w-4" />
                  Send Edits
                </Button>
                {data.sharedBy?.userId && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/expert-chat/${data.sharedBy!.userId}`)}
                    className="gap-2 border-amber-300"
                    data-testid="button-open-expert-chat"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open Chat
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {hasPendingReview && (
          <div className="mb-4 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800" data-testid="expert-review-banner">
            <div className="flex items-start gap-3">
              <Eye className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-sm text-blue-800 dark:text-blue-200">Expert has sent edits for review</p>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
                  {data.expertDiff?.submittedAt && `Sent ${new Date(data.expertDiff.submittedAt).toLocaleDateString()}.`}
                  {totalReviewDiffs > 0 && ` ${totalReviewDiffs} suggestion${totalReviewDiffs !== 1 ? "s" : ""} awaiting your review.`}
                </p>
                {data.expertNotes && (
                  <p className="text-sm text-blue-800 dark:text-blue-200 mt-2 italic">
                    "{data.expertNotes}"
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                {totalReviewDiffs > 0 && (
                  <Button
                    size="sm"
                    onClick={() => setShowDiffReview(true)}
                    className="gap-2"
                    variant="outline"
                    data-testid="button-review-diffs"
                  >
                    <Eye className="h-4 w-4" />
                    Review Changes
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => acknowledgeMutation.mutate({ action: "accept" })}
                  disabled={acknowledgeMutation.isPending}
                  className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                  data-testid="button-accept-all"
                >
                  <CheckCircle className="h-4 w-4" />
                  Accept All
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => acknowledgeMutation.mutate({ action: "reject" })}
                  disabled={acknowledgeMutation.isPending}
                  className="gap-2 border-red-300 text-red-700 hover:bg-red-50"
                  data-testid="button-reject-all"
                >
                  <XCircle className="h-4 w-4" />
                  Reject All
                </Button>
              </div>
            </div>
          </div>
        )}

        {expertStatus === "acknowledged" && isOwnerView && (
          <div className="mb-4 p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800" data-testid="expert-accepted-banner">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <p className="text-sm text-green-800 dark:text-green-200">Expert edits accepted.</p>
            </div>
          </div>
        )}

        <Card className="overflow-hidden border-border bg-card" data-testid="shared-itinerary-card">
          <HeroSection
            trip={planCardTrip}
            traveloureScore={data.variant.optimizationScore}
            shareToken={token}
            totalCost={grandTotal > 0 ? `$${grandTotal.toLocaleString()}` : null}
            perPerson={null}
            budget={null}
          />

          <StatsRow
            trip={planCardTrip}
            days={planCardDays}
            totalActivities={totalActivities}
            totalLegs={totalLegs}
            totalMinutes={totalMinutes}
            templateConfig={templateConfig}
            extraStats={extraStats}
          />

          <DaySelector
            tripId={data.variant.id}
            days={planCardDays}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            showActivityCounts
          />

          <SectionTabs
            tripId={data.variant.id}
            section={section}
            onSetSection={setSection}
            showChanges={showChanges}
            onToggleChanges={() => setShowChanges(!showChanges)}
            templateConfig={templateConfig}
            dayActivityCount={currentDay?.activities?.length || 0}
            dayTransportCount={currentDay?.transports?.length || 0}
            confirmedActivities={totalBooked}
            totalActivities={totalActivities}
            transportLocked={false}
            changeLogCount={totalDiffs}
            expertChanges={totalReviewDiffs}
          />

          {section === "activities" && !isExpertView && (
            <ActivitiesSection
              tripId={data.variant.id}
              day={currentDay}
              templateConfig={templateConfig}
            />
          )}

          {section === "activities" && isExpertView && currentDay && (
            <ExpertActivitiesSection
              tripId={data.variant.id}
              day={currentDay}
              rawActivities={data.variant.days[selectedDay]?.activities || []}
              templateConfig={templateConfig}
              activityDiffs={activityDiffs}
              editingActivity={editingActivity}
              editValues={editValues}
              onStartEdit={startEditActivity}
              onConfirmEdit={confirmEditActivity}
              onCancelEdit={() => setEditingActivity(null)}
              onEditValuesChange={setEditValues}
              onClearDiff={(id) => {
                const newDiffs = { ...activityDiffs };
                delete newDiffs[id];
                setActivityDiffs(newDiffs);
              }}
            />
          )}

          {section === "transport" && !isExpertView && (
            <TransportSection
              tripId={data.variant.id}
              tripDestination={destination}
              day={currentDay}
            />
          )}

          {section === "transport" && isExpertView && currentDay && (
            <ExpertTransportSection
              tripId={data.variant.id}
              tripDestination={destination}
              day={currentDay}
              rawTransportLegs={data.variant.days[selectedDay]?.transportLegs || []}
              transportDiffs={transportDiffs}
              onModeChange={handleTransportModeChange}
            />
          )}
        </Card>

        {GOOGLE_MAPS_AVAILABLE && (
          <div className="flex items-center justify-end mt-4">
            <Button
              variant={showMap ? "default" : "outline"}
              size="sm"
              className="gap-2 text-xs"
              onClick={() => setShowMap(!showMap)}
              data-testid="button-toggle-map"
            >
              <MapPin className="w-3.5 h-3.5" />
              {showMap ? "Hide Map" : "Show Map"}
            </Button>
          </div>
        )}

        {GOOGLE_MAPS_AVAILABLE && showMap && (
          <MapControlCenter
            tripId={data.variant.id}
            tripDestination={destination}
            days={planCardDays}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
          />
        )}

        {isExpertView && (
          <Card className="mt-4 p-4 border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/10" data-testid="expert-notes-panel">
            <div className="flex items-center gap-2 mb-2">
              <MessageCircle className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-800 dark:text-amber-200">Expert Notes</span>
            </div>
            <Textarea
              placeholder="Add notes about your suggestions for the traveler..."
              value={expertNotes}
              onChange={e => setExpertNotes(e.target.value)}
              rows={3}
              className="text-sm"
              data-testid="textarea-expert-notes-panel"
            />
            {totalDiffs > 0 && (
              <p className="text-xs text-amber-600 mt-2" data-testid="text-pending-changes-count">
                {totalDiffs} tracked change{totalDiffs !== 1 ? "s" : ""} ready to send
              </p>
            )}
          </Card>
        )}

        {!isExpertView && (
          <div className="mt-8 pt-6 border-t text-center">
            <p className="text-sm text-muted-foreground mb-3">
              Plan your own trip with Traveloure
            </p>
            <Button onClick={() => window.location.href = "/"} data-testid="button-plan-trip">
              Plan My Trip
            </Button>
          </div>
        )}
      </div>

      <Dialog open={showSuggestDialog} onOpenChange={setShowSuggestDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send Edits to Traveler</DialogTitle>
            <DialogDescription>
              Add your overall notes below. Your activity and transport edits will be included automatically.
            </DialogDescription>
          </DialogHeader>

          {totalDiffs > 0 && (
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
              <p className="text-xs font-medium text-blue-800 dark:text-blue-200">
                {totalDiffs} tracked change{totalDiffs !== 1 ? "s" : ""} will be included:
              </p>
              <ul className="mt-1 text-xs text-blue-700 dark:text-blue-300 space-y-0.5">
                {Object.entries(activityDiffs).map(([id, diff]) => (
                  <li key={id}>• Activity: {diff.name || diff.originalName} {diff.name !== diff.originalName ? `(renamed from "${diff.originalName}")` : ""}</li>
                ))}
                {Object.entries(transportDiffs).map(([id, diff]) => (
                  <li key={id}>• Transport leg {diff.legOrder}: {diff.originalMode} → {diff.newMode}</li>
                ))}
              </ul>
            </div>
          )}

          {expertNotes.trim() ? (
            <div className="p-3 rounded-lg bg-muted border mt-2">
              <p className="text-xs font-medium text-muted-foreground mb-1">Your note (from Expert Notes panel):</p>
              <p className="text-sm italic">"{expertNotes}"</p>
            </div>
          ) : (
            <div className="mt-2">
              <p className="text-xs text-muted-foreground mb-1">
                Add a note via the Expert Notes panel at the bottom of the itinerary, or type one here:
              </p>
              <Textarea
                placeholder="E.g. 'Day 2 is too packed — consider splitting the temple visit to Day 3...'"
                value={expertNotes}
                onChange={e => setExpertNotes(e.target.value)}
                rows={4}
                data-testid="textarea-expert-notes"
              />
            </div>
          )}
          {totalDiffs === 0 && !expertNotes.trim() && (
            <p className="text-xs text-muted-foreground">
              You can edit activities directly in the itinerary — changes are tracked and sent with your notes.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSuggestDialog(false)}>Cancel</Button>
            <Button
              onClick={() => suggestModMutation.mutate()}
              disabled={!expertNotes.trim() || suggestModMutation.isPending}
              data-testid="button-send-suggestions"
            >
              {suggestModMutation.isPending ? "Sending..." : "Send to Traveler"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDiffReview} onOpenChange={setShowDiffReview}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Expert Suggestions</DialogTitle>
            <DialogDescription>
              Review the changes your expert proposed. Accept all to apply them, or reject to dismiss.
            </DialogDescription>
          </DialogHeader>

          {data.expertNotes && (
            <div className="p-3 rounded-lg bg-muted border mb-2">
              <p className="text-xs font-medium text-muted-foreground mb-1">Expert notes:</p>
              <p className="text-sm italic">"{data.expertNotes}"</p>
            </div>
          )}

          {Object.keys(reviewActivityDiffs).length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Activity Changes</h4>
              <div className="space-y-2">
                {Object.entries(reviewActivityDiffs).map(([id, diff]) => {
                  const isRejected = rejectedDiffIds.has(id);
                  return (
                    <div key={id} className={cn(
                      "p-3 rounded-lg border transition-opacity",
                      isRejected
                        ? "opacity-50 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
                        : "bg-amber-50 dark:bg-amber-950/20"
                    )} data-testid={`diff-activity-${id}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 space-y-1">
                          {diff.name && diff.name !== diff.originalName && (
                            <div className="text-xs">
                              <span className="font-medium">Name:</span>{" "}
                              <span className="line-through text-muted-foreground">{diff.originalName}</span>
                              {" → "}
                              <span className="font-medium text-green-700 dark:text-green-400">{diff.name}</span>
                            </div>
                          )}
                          {diff.startTime && diff.originalStartTime && diff.startTime !== diff.originalStartTime && (
                            <div className="text-xs">
                              <span className="font-medium">Time:</span>{" "}
                              <span className="line-through text-muted-foreground">{diff.originalStartTime}</span>
                              {" → "}
                              <span className="font-medium text-green-700 dark:text-green-400">{diff.startTime}</span>
                            </div>
                          )}
                          {diff.note && (
                            <div className="text-xs italic text-amber-700 dark:text-amber-300">
                              Note: "{diff.note}"
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => setRejectedDiffIds(prev => {
                            const next = new Set(prev);
                            if (next.has(id)) next.delete(id); else next.add(id);
                            return next;
                          })}
                          className={cn(
                            "shrink-0 text-xs px-2 py-0.5 rounded border transition-colors cursor-pointer",
                            isRejected
                              ? "bg-red-100 border-red-300 text-red-700 hover:bg-red-200"
                              : "border-muted text-muted-foreground hover:border-red-300 hover:text-red-600"
                          )}
                          data-testid={`button-toggle-reject-activity-${id}`}
                        >
                          {isRejected ? "Undo reject" : "Reject"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {Object.keys(reviewTransportDiffs).length > 0 && (
            <div className="mt-3">
              <h4 className="text-sm font-medium mb-2">Transport Changes</h4>
              <div className="space-y-2">
                {Object.entries(reviewTransportDiffs).map(([id, diff]) => {
                  const isRejected = rejectedDiffIds.has(id);
                  return (
                    <div key={id} className={cn(
                      "p-3 rounded-lg border transition-opacity",
                      isRejected
                        ? "opacity-50 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
                        : "bg-blue-50 dark:bg-blue-950/20"
                    )} data-testid={`diff-transport-${id}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs">
                          <span className="font-medium">Leg {diff.legOrder}:</span>{" "}
                          <span className="line-through text-muted-foreground">{diff.originalMode}</span>
                          {" → "}
                          <span className="font-medium text-green-700 dark:text-green-400">{diff.newMode}</span>
                        </div>
                        <button
                          onClick={() => setRejectedDiffIds(prev => {
                            const next = new Set(prev);
                            if (next.has(id)) next.delete(id); else next.add(id);
                            return next;
                          })}
                          className={cn(
                            "shrink-0 text-xs px-2 py-0.5 rounded border transition-colors cursor-pointer",
                            isRejected
                              ? "bg-red-100 border-red-300 text-red-700 hover:bg-red-200"
                              : "border-muted text-muted-foreground hover:border-red-300 hover:text-red-600"
                          )}
                          data-testid={`button-toggle-reject-transport-${id}`}
                        >
                          {isRejected ? "Undo reject" : "Reject"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {rejectedDiffIds.size > 0 && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              {rejectedDiffIds.size} change{rejectedDiffIds.size !== 1 ? "s" : ""} will be rejected. The rest will be accepted.
            </p>
          )}

          <DialogFooter className="mt-4 flex-wrap gap-2">
            {GOOGLE_MAPS_AVAILABLE && hasDiffMapData && daysWithActivityDiffs.length > 0 && (
              <Button
                variant="outline"
                onClick={() => {
                  setShowDiffReview(false);
                  setShowMap(true);
                }}
                className="gap-2 mr-auto"
                data-testid="button-show-on-map"
              >
                <MapPin className="h-4 w-4" />
                Show on Map
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => acknowledgeMutation.mutate({ action: "reject" })}
              disabled={acknowledgeMutation.isPending}
              className="gap-2 border-red-300 text-red-700 hover:bg-red-50"
              data-testid="button-reject-diffs"
            >
              <XCircle className="h-4 w-4" />
              Reject All
            </Button>
            <Button
              onClick={() => acknowledgeMutation.mutate({ action: "accept", rejectedIds: Array.from(rejectedDiffIds) })}
              disabled={acknowledgeMutation.isPending}
              className="gap-2 bg-green-600 hover:bg-green-700 text-white"
              data-testid="button-accept-diffs"
            >
              <CheckCircle className="h-4 w-4" />
              {rejectedDiffIds.size > 0 ? "Accept Selected" : "Accept All"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface ExpertActivitiesSectionProps {
  tripId: string;
  day: PlanCardDay;
  rawActivities: Array<{
    id: string;
    name: string;
    startTime?: string | null;
    category?: string | null;
    location?: string | null;
    cost?: number;
  }>;
  templateConfig: ReturnType<typeof getTemplateConfig>;
  activityDiffs: Record<string, ActivityDiff>;
  editingActivity: string | null;
  editValues: { name: string; startTime: string; note: string };
  onStartEdit: (activityId: string, name: string, startTime?: string | null) => void;
  onConfirmEdit: (activityId: string, originalName: string, originalStartTime?: string | null) => void;
  onCancelEdit: () => void;
  onEditValuesChange: (v: { name: string; startTime: string; note: string }) => void;
  onClearDiff: (id: string) => void;
}

function ExpertActivitiesSection({
  tripId, day, rawActivities, templateConfig, activityDiffs,
  editingActivity, editValues, onStartEdit, onConfirmEdit, onCancelEdit,
  onEditValuesChange, onClearDiff,
}: ExpertActivitiesSectionProps) {
  return (
    <div className="p-5" data-testid={`expert-activities-section-${tripId}`}>
      <div className="flex justify-between mb-4">
        <div className="text-[13px] text-muted-foreground">
          {day.date} - <span className="text-foreground font-semibold">{day.label}</span>
        </div>
      </div>

      {day.activities.map((a, i) => {
        const rawAct = rawActivities.find(r => r.id === a.id);
        const tc = TYPE_COLORS[a.type] || TYPE_COLORS.attraction || { bg: "bg-muted", fg: "text-muted-foreground", dot: "#94a3b8" };
        const hasDiff = !!activityDiffs[a.id];
        const isEditing = editingActivity === a.id;
        const typeLabel = templateConfig.activityTypes[a.type] || a.type;

        return (
          <div
            key={a.id}
            className={cn(
              "flex gap-3.5 py-3.5",
              i < day.activities.length - 1 ? "border-b border-border/30" : "",
              hasDiff ? "bg-amber-50/50 dark:bg-amber-950/10 -mx-2 px-2 rounded-lg" : ""
            )}
            data-testid={`expert-activity-row-${a.id}`}
          >
            <div className="flex flex-col items-center w-12 flex-shrink-0">
              <div className="text-[13px] font-bold text-foreground">{a.time}</div>
              <div
                className="w-2.5 h-2.5 rounded-full mt-1.5 border-2 border-card"
                style={{ backgroundColor: tc.dot, boxShadow: `0 0 8px ${tc.dot}40` }}
              />
              {i < day.activities.length - 1 && (
                <div
                  className="w-0.5 flex-1 mt-1"
                  style={{ background: `linear-gradient(to bottom, ${tc.dot}40, transparent)` }}
                />
              )}
            </div>

            <div className="flex-1 min-w-0">
              {isEditing ? (
                <div className="space-y-2">
                  <Input
                    value={editValues.name}
                    onChange={e => onEditValuesChange({ ...editValues, name: e.target.value })}
                    className="h-8 text-sm"
                    data-testid={`input-edit-name-${a.id}`}
                  />
                  <Input
                    value={editValues.startTime}
                    onChange={e => onEditValuesChange({ ...editValues, startTime: e.target.value })}
                    placeholder="HH:MM"
                    className="h-8 text-sm w-24"
                    data-testid={`input-edit-time-${a.id}`}
                  />
                  <Textarea
                    value={editValues.note}
                    onChange={e => onEditValuesChange({ ...editValues, note: e.target.value })}
                    placeholder="Add a note..."
                    rows={2}
                    className="text-sm"
                    data-testid={`textarea-edit-note-${a.id}`}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => onConfirmEdit(a.id, rawAct?.name || a.name, rawAct?.startTime)}
                      className="h-7 text-xs gap-1"
                      data-testid={`button-confirm-edit-${a.id}`}
                    >
                      <Check className="w-3 h-3" /> Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={onCancelEdit}
                      className="h-7 text-xs gap-1"
                      data-testid={`button-cancel-edit-${a.id}`}
                    >
                      <X className="w-3 h-3" /> Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[15px] font-semibold text-foreground" data-testid={`text-activity-name-${a.id}`}>{a.name}</span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${tc.bg} ${tc.fg}`}>
                      {typeLabel}
                    </span>
                    {hasDiff && (
                      <Badge className="text-[9px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-0 gap-0.5" data-testid={`badge-diff-${a.id}`}>
                        <Pencil className="w-2.5 h-2.5" /> edited
                      </Badge>
                    )}
                    <button
                      onClick={() => onStartEdit(a.id, rawAct?.name || a.name, rawAct?.startTime)}
                      className="ml-auto text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                      data-testid={`button-edit-activity-${a.id}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="text-[12px] text-muted-foreground mt-1 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    <span>{a.location}</span>
                    {a.cost > 0 && <span className="ml-2 text-green-600 dark:text-green-400 font-semibold">${a.cost}</span>}
                  </div>
                  {hasDiff && (
                    <div className="flex items-center gap-2 mt-1.5">
                      {activityDiffs[a.id]?.note && (
                        <span className="text-[11px] text-amber-600 italic">Note: "{activityDiffs[a.id].note}"</span>
                      )}
                      <button
                        onClick={() => onClearDiff(a.id)}
                        className="text-[10px] text-red-500 hover:text-red-700 cursor-pointer underline"
                        data-testid={`button-clear-diff-${a.id}`}
                      >
                        undo
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const AVAILABLE_MODES = ["walk", "train", "taxi", "car", "bus", "shuttle", "ferry", "bicycle"];

interface ExpertTransportSectionProps {
  tripId: string;
  tripDestination: string;
  day: PlanCardDay;
  rawTransportLegs: InlineTransportLegData[];
  transportDiffs: Record<string, TransportDiff>;
  onModeChange: (legId: string, newMode: string, originalMode: string) => void;
}

function ExpertTransportSection({
  tripId, tripDestination, day, rawTransportLegs, transportDiffs, onModeChange,
}: ExpertTransportSectionProps) {
  return (
    <div className="p-5" data-testid={`expert-transport-section-${tripId}`}>
      {day.transports?.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/30 rounded-xl p-3.5 flex flex-wrap justify-between items-center mb-5 gap-3">
          <div className="flex gap-6">
            {[
              { l: "Legs", v: day.transports.length },
              { l: "Total Time", v: `${day.transports.reduce((s: number, t) => s + (t.duration || 0), 0)}m` },
              { l: "Est. Cost", v: `$${day.transports.reduce((s: number, t) => s + (t.cost || 0), 0).toLocaleString()}` },
            ].map((s, si) => (
              <div key={si}>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.l}</div>
                <div className={`text-lg font-bold ${si === 2 ? "text-green-600 dark:text-green-400" : "text-blue-600 dark:text-blue-400"}`}>{s.v}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(day.transports || []).map((tr, i) => {
        const rawLeg = rawTransportLegs.find(l => l.id === tr.id);
        const originalMode = rawLeg?.userSelectedMode || rawLeg?.recommendedMode || "transit";
        const hasDiff = !!transportDiffs[tr.id];
        const modeColor = MODE_COLORS[tr.mode] || "#94a3b8";

        return (
          <div
            key={tr.id}
            className={cn(
              "flex gap-3.5 py-4",
              i < day.transports.length - 1 ? "border-b border-border/30" : "",
              hasDiff ? "bg-blue-50/50 dark:bg-blue-950/10 -mx-2 px-2 rounded-lg" : ""
            )}
            data-testid={`expert-transport-leg-${tr.id}`}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${modeColor}15`, color: modeColor }}
            >
              <ModeIcon mode={tr.mode} className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-[13px]">
                <span className="text-muted-foreground truncate">{tr.fromName || tr.from}</span>
                <span className="text-muted-foreground/50">-&gt;</span>
                <span className="text-foreground font-semibold truncate">{tr.toName || tr.to}</span>
                {hasDiff && (
                  <Badge className="text-[9px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-0 gap-0.5" data-testid={`badge-transport-diff-${tr.id}`}>
                    <Pencil className="w-2.5 h-2.5" /> changed
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-2.5 mt-1.5 items-center">
                <span className="text-[12px] text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {tr.duration} min
                </span>
                {tr.cost > 0 && (
                  <span className="text-[12px] text-green-600 dark:text-green-400 font-semibold">${tr.cost}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2" data-testid={`mode-selector-${tr.id}`}>
                {AVAILABLE_MODES.map(mode => {
                  const mc = MODE_COLORS[mode] || "#94a3b8";
                  const isSelected = tr.mode === mode;
                  return (
                    <button
                      key={mode}
                      onClick={() => onModeChange(tr.id, mode, originalMode)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-all border",
                        isSelected
                          ? "border-current shadow-sm"
                          : "border-transparent opacity-60 hover:opacity-100"
                      )}
                      style={{
                        backgroundColor: `${mc}${isSelected ? "25" : "10"}`,
                        color: mc,
                      }}
                      data-testid={`button-mode-${mode}-${tr.id}`}
                    >
                      <ModeIcon mode={mode} className="w-3.5 h-3.5" />
                      {mode}
                    </button>
                  );
                })}
              </div>
              {hasDiff && (
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[11px] text-blue-600 dark:text-blue-400">
                    Changed from <span className="line-through">{originalMode}</span> to <span className="font-semibold">{tr.mode}</span>
                  </span>
                  <button
                    onClick={() => onModeChange(tr.id, originalMode, originalMode)}
                    className="text-[10px] text-red-500 hover:text-red-700 cursor-pointer underline"
                    data-testid={`button-undo-transport-${tr.id}`}
                  >
                    undo
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {(!day.transports || day.transports.length === 0) && (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">No transport legs for this day</p>
        </div>
      )}
    </div>
  );
}
