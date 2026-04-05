import { useState } from "react";
import { useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Heart,
  Share2,
  Download,
  CheckCircle2,
  Loader2,
  UserCheck,
  Headphones,
  CreditCard,
  AlertCircle,
  Eye,
  XCircle,
  ShieldCheck,
  ExternalLink,
  MapPin,
  MessageSquare,
  Sparkles,
  LayoutDashboard,
  CalendarDays,
} from "lucide-react";
import { TransportLeg, type TransportAlternative } from "@/components/itinerary/TransportLeg";
import { TransportHub } from "@/components/itinerary/TransportHub";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useTrip, useGeneratedItinerary } from "@/hooks/use-trips";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, addDays, differenceInDays } from "date-fns";
import type { ActivityDiff, TransportDiff } from "@/components/itinerary/ItineraryCard";
import type { InlineTransportLegData } from "@/components/itinerary/InlineTransportSelector";
import { cn } from "@/lib/utils";
import { getTemplateConfig, type PlanCardDay, type PlanCardActivity, type PlanCardTransport, type PlanCardTrip } from "@/components/plancard/plancard-types";
import { MapControlCenter } from "@/components/plancard/MapControlCenter";
import { HeroSection } from "@/components/plancard/HeroSection";
import { StatsRow, BookedIcon, CostIcon, EfficiencyIcon, type ExtraStat } from "@/components/plancard/StatsRow";
import { DaySelector } from "@/components/plancard/DaySelector";
import { SectionTabs } from "@/components/plancard/SectionTabs";
import { ActivitiesSection } from "@/components/plancard/ActivitiesSection";
import { DayTransportPanel } from "@/components/itinerary/DayTransportPanel";
import { TripLogisticsDashboard } from "@/components/logistics";

type BookingType = 'inApp' | 'partner';
type BookingStatus = 'pending' | 'booked' | 'confirmed';

function getBookingType(actType: string): BookingType {
  const partnerTypes = ['transport', 'event', 'concert', 'show', 'entertainment'];
  if (partnerTypes.includes(actType.toLowerCase())) return 'partner';
  return 'inApp';
}

function getPartnerName(actType: string): string | undefined {
  if (actType.toLowerCase() === 'transport') return '12Go';
  if (['event', 'concert', 'show', 'entertainment'].includes(actType.toLowerCase())) return 'Fever';
  return undefined;
}

function getPartnerUrl(partnerName: string | undefined, destination?: string): string {
  if (partnerName === '12Go') {
    const dest = destination?.split(',')[0]?.toLowerCase().replace(/\s+/g, '-') || 'paris';
    return `https://12go.co/en/travel/${dest}?affiliate_id=13805109`;
  }
  if (partnerName === 'Fever') {
    return 'https://feverup.com/';
  }
  return '#';
}


function synthesizeTransportLegs(activities: any[]): InlineTransportLegData[] {
  if (!activities || activities.length < 2) return [];
  const legs: InlineTransportLegData[] = [];
  for (let i = 0; i < activities.length - 1; i++) {
    const from = activities[i];
    const to = activities[i + 1];
    legs.push({
      id: `synth-leg-${from.id}-${to.id}`,
      legOrder: i + 1,
      fromName: from.location || from.title || from.name || `Stop ${i + 1}`,
      toName: to.location || to.title || to.name || `Stop ${i + 2}`,
      recommendedMode: "walking",
      userSelectedMode: null,
      distanceDisplay: "~1 km",
      estimatedDurationMinutes: 15,
      estimatedCostUsd: null,
      alternativeModes: [
        { mode: "taxi", durationMinutes: 5, costUsd: 8, energyCost: 30, reason: "Fastest option" },
        { mode: "transit", durationMinutes: 10, costUsd: 2, energyCost: 10, reason: "Affordable" },
        { mode: "rideshare", durationMinutes: 7, costUsd: 6, energyCost: 25, reason: "Convenient pickup" },
      ],
      fromLat: from.lat || null,
      fromLng: from.lng || null,
      toLat: to.lat || null,
      toLng: to.lng || null,
    });
  }
  return legs;
}


export default function ItineraryPage() {
  const [, params] = useRoute("/itinerary/:id");
  const tripId = params?.id || "1";
  const { data: tripData, isLoading: tripLoading } = useTrip(tripId);
  const { data: generatedItinerary, isLoading: itineraryLoading } = useGeneratedItinerary(tripId);
  const queryClient = useQueryClient();
  const [mainTab, setMainTab] = useState<"itinerary" | "logistics">("itinerary");
  const [selectedDay, setSelectedDay] = useState(1);
  const [section, setSection] = useState<"activities" | "transport">("activities");
  const [isSaved, setIsSaved] = useState(false);
  const [showExpertDialog, setShowExpertDialog] = useState(false);
  const [showDiffReview, setShowDiffReview] = useState(false);
  const [rejectedDiffIds, setRejectedDiffIds] = useState<Set<string>>(new Set());
  const [expertNotes, setExpertNotes] = useState("");
  const [isRequestingExpert, setIsRequestingExpert] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [synthLocalModes, setSynthLocalModes] = useState<Record<string, string>>({});
  const { toast } = useToast();

  interface TripTransportLeg {
    id: string;
    variantId: string;
    dayNumber: number;
    legOrder: number;
    fromName: string;
    fromLat: number;
    fromLng: number;
    toName: string;
    toLat: number;
    toLng: number;
    distanceMeters: number;
    distanceDisplay: string;
    recommendedMode: string;
    userSelectedMode: string | null;
    estimatedDurationMinutes: number;
    estimatedCostUsd: number | null;
    alternativeModes: TransportAlternative[] | null;
  }

  interface TripTransportLegsResponse {
    legs: TripTransportLeg[];
    variantId: string | null;
  }

  const { data: legsData, isLoading: legsLoading } = useQuery<TripTransportLegsResponse>({
    queryKey: ["/api/trips", tripId, "transport-legs"],
    queryFn: async () => {
      const res = await fetch(`/api/trips/${tripId}/transport-legs`);
      if (!res.ok) throw new Error("Failed to load transport legs");
      return res.json();
    },
  });

  const realLegsMap: Record<number, TripTransportLeg[]> = {};
  if (legsData?.legs) {
    legsData.legs.forEach((leg) => {
      const dayNum = (leg as any).dayNumber ?? 0;
      if (!realLegsMap[dayNum]) realLegsMap[dayNum] = [];
      realLegsMap[dayNum].push(leg);
    });
  }

  const { data: shareData } = useQuery<{
    shareToken?: string;
    variantId?: string;
    expertStatus?: string;
    expertNotes?: string;
    expertDiff?: { activityDiffs?: Record<string, ActivityDiff>; transportDiffs?: Record<string, TransportDiff>; submittedAt?: string };
  }>({
    queryKey: ["/api/trips", tripId, "share-info"],
    queryFn: async () => {
      const res = await fetch(`/api/trips/${tripId}/share-info`, { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
  });

  const acknowledgeMutation = {
    isPending: false,
    mutate: async ({ action, rejectedIds }: { action: "accept" | "reject"; rejectedIds: string[] }) => {
      if (!shareData?.shareToken) return;
      try {
        const res = await fetch(`/api/itinerary-share/${shareData.shareToken}/acknowledge`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action, rejectedIds }),
        });
        if (res.ok) {
          queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId, "share-info"] });
        }
      } catch {}
    },
  };

  const reviewActivityDiffs: Record<string, ActivityDiff> = shareData?.expertDiff?.activityDiffs || {};
  const reviewTransportDiffs: Record<string, TransportDiff> = shareData?.expertDiff?.transportDiffs || {};

  const isLoading = tripLoading || itineraryLoading;

  const handleExpertBookingRequest = async () => {
    setIsRequestingExpert(true);
    try {
      const response = await fetch('/api/expert-booking-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tripId, notes: expertNotes }),
      });
      if (!response.ok) throw new Error('Failed to submit request');
      setShowExpertDialog(false);
      setExpertNotes("");
      toast({
        title: "Request Sent",
        description: "An expert will review your itinerary and handle all bookings. You'll be notified when complete.",
      });
    } catch (error) {
      toast({
        title: "Request Failed",
        description: "Unable to submit your request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRequestingExpert(false);
    }
  };

  const transformGeneratedDays = (itineraryDataRaw: any) => {
    const daysData = itineraryDataRaw?.days || itineraryDataRaw?.dailyItinerary;
    if (!daysData) return null;
    return daysData.map((day: any, index: number) => ({
      day: day.day || day.dayNumber || index + 1,
      date: tripData ? addDays(new Date(tripData.startDate), index) : addDays(new Date(), index),
      title: day.title || day.theme || `Day ${index + 1}`,
      transportLegs: day.transportLegs || [],
      activities: (day.activities || []).map((act: any, actIdx: number) => {
        const actType = act.type || "activity";
        return {
          id: act.id || `a${index}-${actIdx}`,
          time: act.time || act.startTime || "09:00",
          title: act.name || act.title || "Activity",
          type: actType,
          location: act.location || act.venue || "",
          lat: act.lat ?? null,
          lng: act.lng ?? null,
          duration: act.duration || "1h",
          notes: act.description || act.notes || "",
          booked: act.bookingRequired === false || act.booked || false,
          bookingType: act.bookingType || getBookingType(actType),
          bookingStatus: act.bookingStatus || (act.booked ? 'confirmed' : 'pending') as BookingStatus,
          partnerName: act.partnerName || getPartnerName(actType),
          price: act.estimatedCost || act.cost || act.price || 0,
        };
      }),
    }));
  };

  const generatedDays = generatedItinerary?.itineraryData
    ? transformGeneratedDays(generatedItinerary.itineraryData)
    : null;

  const defaultDays = tripData ? Array.from({ length: Math.max(1, differenceInDays(new Date(tripData.endDate), new Date(tripData.startDate)) + 1) }, (_, i) => ({
    day: i + 1,
    date: addDays(new Date(tripData.startDate), i),
    title: `Day ${i + 1}`,
    activities: [] as any[],
  })) : [];

  const itinerary = tripData ? {
    id: tripData.id,
    title: tripData.title || "Untitled Trip",
    destination: tripData.destination || "",
    startDate: new Date(tripData.startDate),
    endDate: new Date(tripData.endDate),
    travelers: tripData.numberOfTravelers || 1,
    budget: Number(tripData.budget) || 0,
    status: tripData.status || "draft",
    coverImage: "",
    days: generatedDays || defaultDays,
  } : null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" data-testid="loading-spinner">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!itinerary) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4" data-testid="empty-state">
        <AlertCircle className="w-12 h-12 text-muted-foreground" />
        <h2 className="text-lg font-semibold text-foreground">Trip not found</h2>
        <p className="text-sm text-muted-foreground">The itinerary you're looking for doesn't exist or has been removed.</p>
        <Link href="/dashboard">
          <Button data-testid="button-back-to-dashboard">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  const totalBooked = itinerary.days.flatMap((d: any) => d.activities).filter((a: any) => a.booked).length;
  const totalActivities = itinerary.days.flatMap((d: any) => d.activities).length;
  const totalCost = itinerary.days.flatMap((d: any) => d.activities).reduce((sum: number, a: any) => sum + a.price, 0);


  const allTransportLegs = itinerary.days.reduce((total: number, d: any) => {
    const dayNum = d.day;
    const real = realLegsMap[dayNum];
    if (real?.length) return total + real.length;
    const existing = d.transportLegs || [];
    if (existing.length > 0) return total + existing.length;
    return total + Math.max(0, (d.activities?.length || 0) - 1);
  }, 0);

  const allTransportMinutes = itinerary.days.reduce((total: number, d: any) => {
    const dayNum = d.day;
    const real = realLegsMap[dayNum];
    const legs = real?.length ? real : d.transportLegs || synthesizeTransportLegs(d.activities || []);
    return total + legs.reduce((s: number, l: any) => s + (l.estimatedDurationMinutes || l.duration || 0), 0);
  }, 0);

  const allTransportCost = itinerary.days.reduce((total: number, d: any) => {
    const dayNum = d.day;
    const real = realLegsMap[dayNum];
    const legs = real?.length ? real : d.transportLegs || synthesizeTransportLegs(d.activities || []);
    return total + legs.reduce((s: number, l: any) => s + (l.estimatedCostUsd || l.cost || 0), 0);
  }, 0);

  const efficiencyScore = totalActivities > 0
    ? Math.round((totalBooked / totalActivities) * 100)
    : 0;

  const grandTotal = totalCost + allTransportCost;

  const activityTypes = itinerary.days
    .flatMap((d: any) => d.activities || [])
    .reduce((acc: Record<string, number>, a: any) => {
      const t = a.type || "activity";
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  const categoryPills = Object.entries(activityTypes).map(([type, count]) => ({
    type,
    count: count as number,
  }));

  const transportModeSummary = itinerary.days.reduce((acc: Record<string, number>, d: any) => {
    const dayNum = d.day;
    const real = realLegsMap[dayNum];
    const legs = real?.length ? real : d.transportLegs || synthesizeTransportLegs(d.activities || []);
    legs.forEach((l: any) => {
      const mode = l.mode || l.type || "transit";
      acc[mode] = (acc[mode] || 0) + 1;
    });
    return acc;
  }, {} as Record<string, number>);

  const transportModeEntries = Object.entries(transportModeSummary);
  const transportModeColors: Record<string, string> = {
    walking: "bg-green-500", walk: "bg-green-500",
    taxi: "bg-yellow-500", rideshare: "bg-yellow-500", uber: "bg-yellow-500",
    transit: "bg-blue-500", bus: "bg-blue-500", metro: "bg-blue-500", subway: "bg-blue-500",
    train: "bg-purple-500", rail: "bg-purple-500",
    flight: "bg-red-500", plane: "bg-red-500",
    car: "bg-orange-500", drive: "bg-orange-500", rental: "bg-orange-500",
    ferry: "bg-cyan-500", boat: "bg-cyan-500",
  };

  const extraStats: ExtraStat[] = [
    { label: "Booked", value: `${totalBooked}/${totalActivities}`, icon: BookedIcon },
    { label: "Total Cost", value: `$${grandTotal.toLocaleString()}`, icon: CostIcon },
    { label: "Efficiency", value: `${efficiencyScore}%`, icon: EfficiencyIcon },
  ];

  const templateConfig = getTemplateConfig(tripData?.eventType);

  const planCardTrip: PlanCardTrip = {
    id: String(itinerary.id),
    destination: itinerary.destination,
    title: itinerary.title,
    startDate: format(itinerary.startDate, "yyyy-MM-dd"),
    endDate: format(itinerary.endDate, "yyyy-MM-dd"),
    numberOfTravelers: itinerary.travelers,
    budget: itinerary.budget,
  };

  const planCardDays: PlanCardDay[] = itinerary.days.map((d: any) => ({
    dayNum: d.day,
    date: format(d.date instanceof Date ? d.date : new Date(d.date), "yyyy-MM-dd"),
    label: (() => {
      const parsed = d.date instanceof Date ? d.date : new Date(d.date);
      return !isNaN(parsed.getTime()) ? format(parsed, "EEE, MMM d") : (d.title || `Day ${d.day}`);
    })(),
    activities: (d.activities || []).map((a: any): PlanCardActivity => ({
      id: a.id,
      name: a.title || a.name || "Activity",
      time: a.time || "09:00",
      type: a.type || "activity",
      location: a.location || "",
      lat: a.lat ?? undefined,
      lng: a.lng ?? undefined,
      status: a.booked ? "confirmed" : "pending",
      cost: a.price || 0,
      comments: 0,
    })),
    transports: (() => {
      const dayNum = d.day;
      const real = realLegsMap[dayNum];
      const legs = real?.length ? real : d.transportLegs || synthesizeTransportLegs(d.activities || []);
      return legs.map((l: any): PlanCardTransport => ({
        id: l.id,
        from: l.fromName || l.from || "",
        to: l.toName || l.to || "",
        mode: l.userSelectedMode || l.recommendedMode || l.mode || "walk",
        duration: l.estimatedDurationMinutes || l.duration || 0,
        cost: l.estimatedCostUsd || l.cost || 0,
        status: "active",
      }));
    })(),
  }));

  const currentPlanCardDay = planCardDays[selectedDay - 1];

  const currentItineraryDay = itinerary.days[selectedDay - 1];
  const currentDayLegs: InlineTransportLegData[] = (() => {
    if (!currentItineraryDay) return [];
    const dayNum = currentItineraryDay.day;
    const real = realLegsMap[dayNum];
    return real?.length ? real : currentItineraryDay.transportLegs || synthesizeTransportLegs(currentItineraryDay.activities || []);
  })();

  const perPerson = itinerary.travelers > 1 ? `$${Math.round(totalCost / itinerary.travelers).toLocaleString()}/person` : null;

  return (
    <div className="min-h-screen bg-muted/30" data-testid="itinerary-page">
      <div className="max-w-[1100px] mx-auto px-4 md:px-6 pt-4">
        <div className="flex items-center justify-between mb-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Button>
          </Link>
          <div className="flex gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsSaved(!isSaved)}
              data-testid="button-save"
            >
              <Heart className={cn("w-4 h-4", isSaved && "fill-primary text-primary")} />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-share">
              <Share2 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-download">
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Main tab bar */}
        <div className="flex border-b border-border mb-5" data-testid="tabs-itinerary-main">
          <button
            onClick={() => setMainTab("itinerary")}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-all ${
              mainTab === "itinerary"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-main-itinerary"
          >
            <CalendarDays className="w-4 h-4" />
            Itinerary
          </button>
          <button
            onClick={() => setMainTab("logistics")}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-all ${
              mainTab === "logistics"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-main-logistics"
          >
            <LayoutDashboard className="w-4 h-4" />
            Logistics
          </button>
        </div>

        {mainTab === "logistics" && (
          <div className="pb-12">
            <TripLogisticsDashboard
              tripId={tripId}
              tripName={tripData?.title || tripData?.destination || "Trip"}
              budget={parseFloat(String(tripData?.budget || 0))}
              destination={tripData?.destination || "destination"}
            />
          </div>
        )}

        {mainTab === "itinerary" && <>
        <div className="flex flex-col lg:flex-row gap-5 pb-12">
          <div className="flex-1 min-w-0 space-y-4">
            {shareData?.expertStatus === "review_sent" && (
              <div className="p-4 rounded-xl bg-accent/50 border border-border" data-testid="expert-review-banner">
                <div className="flex items-start gap-3">
                  <Eye className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-sm text-foreground">Expert has sent edits for review</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {shareData.expertDiff?.submittedAt && `Sent ${new Date(shareData.expertDiff.submittedAt).toLocaleDateString()}.`}
                      {(() => {
                        const total = Object.keys(shareData.expertDiff?.activityDiffs || {}).length + Object.keys(shareData.expertDiff?.transportDiffs || {}).length;
                        return total > 0 ? ` ${total} suggestion${total !== 1 ? "s" : ""} awaiting your review.` : "";
                      })()}
                    </p>
                    {shareData.expertNotes && (
                      <p className="text-sm text-foreground mt-2 italic">"{shareData.expertNotes}"</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <Button size="sm" onClick={() => setShowDiffReview(true)} className="gap-2" data-testid="button-review-expert-edits">
                      <Eye className="h-4 w-4" /> Review Edits
                    </Button>
                    <Button size="sm" onClick={() => acknowledgeMutation.mutate({ action: "accept", rejectedIds: [] })} disabled={acknowledgeMutation.isPending} className="gap-2" variant="default" data-testid="button-accept-expert-edits">
                      <CheckCircle2 className="h-4 w-4" /> Accept All
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => acknowledgeMutation.mutate({ action: "reject", rejectedIds: [] })} disabled={acknowledgeMutation.isPending} className="gap-2" data-testid="button-reject-expert-edits">
                      <XCircle className="h-4 w-4" /> Reject All
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {shareData?.expertStatus === "acknowledged" && (
              <div className="p-3 rounded-xl bg-accent/50 border border-border" data-testid="expert-accepted-banner">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <p className="text-sm text-foreground">Expert edits accepted.</p>
                </div>
              </div>
            )}

            <Card className="overflow-hidden border-border bg-card" data-testid="itinerary-plancard">
              <HeroSection
                trip={planCardTrip}
                traveloureScore={null}
                shareToken={shareData?.shareToken}
                totalCost={`$${totalCost.toLocaleString()}`}
                perPerson={perPerson}
                budget={itinerary.budget ? `$${itinerary.budget.toLocaleString()}` : null}
              />
              <StatsRow
                trip={planCardTrip}
                days={planCardDays}
                totalActivities={totalActivities}
                totalLegs={allTransportLegs}
                totalMinutes={allTransportMinutes}
                templateConfig={templateConfig}
                extraStats={extraStats}
              />

              {categoryPills.length > 0 && (
                <div className="flex flex-wrap gap-2 px-4 py-2.5 border-b border-border" data-testid="category-filter-pills">
                  {categoryPills.map(({ type, count }) => (
                    <Badge
                      key={type}
                      variant="secondary"
                      className="text-[11px] capitalize bg-muted text-muted-foreground"
                      data-testid={`badge-category-${type}`}
                    >
                      {type} ({count})
                    </Badge>
                  ))}
                </div>
              )}

              <DaySelector
                tripId={String(itinerary.id)}
                days={planCardDays}
                selectedDay={selectedDay - 1}
                onSelectDay={(i) => setSelectedDay(i + 1)}
                showActivityCounts
              />

              <SectionTabs
                tripId={String(itinerary.id)}
                section={section}
                onSetSection={setSection}
                showChanges={showChanges}
                onToggleChanges={() => setShowChanges(!showChanges)}
                templateConfig={templateConfig}
                dayActivityCount={currentPlanCardDay?.activities?.length || 0}
                dayTransportCount={currentPlanCardDay?.transports?.length || 0}
                confirmedActivities={totalBooked}
                totalActivities={totalActivities}
                transportLocked={false}
                changeLogCount={0}
                expertChanges={0}
              />

              {section === "activities" && (
                <ActivitiesSection
                  tripId={String(itinerary.id)}
                  day={currentPlanCardDay}
                  templateConfig={templateConfig}
                />
              )}

              {section === "transport" && (
                <div className="p-5">
                  <DayTransportPanel
                    dayNumber={selectedDay}
                    legs={currentDayLegs}
                    readOnly={false}
                    tripId={String(itinerary.id)}
                    destination={itinerary.destination}
                  />
                </div>
              )}
            </Card>

            <div className="flex items-center justify-end">
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

            {showMap && (
              <MapControlCenter
                tripId={String(itinerary.id)}
                tripDestination={itinerary.destination}
                days={planCardDays}
                selectedDay={selectedDay - 1}
                onSelectDay={(i) => setSelectedDay(i + 1)}
              />
            )}
          </div>

          <div className="lg:w-72 flex-shrink-0">
            <div className="lg:sticky lg:top-16 space-y-4">
              <Card className="bg-gradient-to-b from-primary/5 to-primary/10 border-primary/20" data-testid="expert-booking-card">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-primary/10 flex-shrink-0">
                      <UserCheck className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground text-sm flex items-center gap-1.5 flex-wrap">
                        Let an Expert Book Everything
                        <Badge className="bg-primary/10 text-primary text-xs" data-testid="badge-recommended">Recommended</Badge>
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Our travel experts handle all bookings — on-site and partner.
                      </p>
                    </div>
                  </div>
                  <Button
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                    onClick={() => setShowExpertDialog(true)}
                    data-testid="button-expert-booking"
                  >
                    <Headphones className="w-4 h-4 mr-2" />
                    Request Expert Booking
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-card border-border" data-testid="booking-summary-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-primary" />
                    Booking Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {(() => {
                    const allActivities = itinerary.days.flatMap((d: any) => d.activities);
                    const inAppBookings = allActivities.filter((a: any) => (a.bookingType || getBookingType(a.type)) === 'inApp' && !a.booked);
                    const partnerBookings = allActivities.filter((a: any) => (a.bookingType || getBookingType(a.type)) === 'partner' && !a.booked);
                    const inAppTotal = inAppBookings.reduce((sum: number, a: any) => sum + (a.price || 0), 0);
                    const partnerTotal = partnerBookings.reduce((sum: number, a: any) => sum + (a.price || 0), 0);
                    return (
                      <>
                        <div className="flex items-center justify-between p-2.5 bg-primary/5 rounded-lg">
                          <div className="flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                            <span className="text-xs font-medium">Book on Traveloure</span>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground" data-testid="text-inapp-count">{inAppBookings.length} items</p>
                            <p className="text-sm font-semibold text-primary" data-testid="text-inapp-total">${inAppTotal}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between p-2.5 bg-muted/50 rounded-lg">
                          <div className="flex items-center gap-1.5">
                            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="text-xs font-medium">Book via Partners</span>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground" data-testid="text-partner-count">{partnerBookings.length} items</p>
                            <p className="text-sm font-semibold text-foreground" data-testid="text-partner-total">${partnerTotal}</p>
                          </div>
                        </div>
                        <div className="border-t pt-2 mt-1 flex items-center justify-between">
                          <span className="text-sm font-semibold text-foreground">Total Pending</span>
                          <span className="text-base font-bold text-primary" data-testid="text-total-pending">${inAppTotal + partnerTotal}</span>
                        </div>
                      </>
                    );
                  })()}
                </CardContent>
              </Card>

            <Card className="bg-white dark:bg-gray-800">
              <CardContent className="p-4">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-full bg-[#FFE3E8] dark:bg-[#FF385C]/20">
                      <MessageSquare className="w-5 h-5 text-[#FF385C]" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm text-[#111827] dark:text-white">Need help?</h4>
                      <p className="text-xs text-[#6B7280]">AI or expert support</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button variant="outline" size="sm" className="w-full" data-testid="button-ai-help">
                      <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                      AI Assistant
                    </Button>
                    <Button size="sm" className="w-full bg-[#FF385C] hover:bg-[#E23350]" data-testid="button-expert-help">
                      Talk to Expert
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          </div>
        </div>

        {/* ===== TRANSPORT SECTION ===== */}
        <div className="pb-12 space-y-8">
            {/* Editable legs section */}
            {legsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : (() => {
              // DB-backed legs (real, saveable)
              const hasRealLegs = (legsData?.legs?.length ?? 0) > 0;

              // Synthesized legs from itinerary data (preview only)
              const synthLegsByDay: { dayNum: number; legs: ReturnType<typeof synthesizeTransportLegs> }[] = [];
              if (!hasRealLegs && itinerary?.days?.length) {
                itinerary.days.forEach((day: any, idx: number) => {
                  const dayLegs = synthesizeTransportLegs(day.activities || []);
                  if (dayLegs.length > 0) synthLegsByDay.push({ dayNum: idx + 1, legs: dayLegs });
                });
              }

              const hasSynthLegs = synthLegsByDay.length > 0;

              if (!hasRealLegs && !hasSynthLegs) return null;

              if (hasRealLegs) {
                const byDay: Record<number, typeof legsData.legs> = {};
                legsData!.legs.forEach(leg => {
                  const day = (leg as any).dayNumber ?? 0;
                  if (!byDay[day]) byDay[day] = [];
                  byDay[day].push(leg);
                });
                return (
                  <div>
                    <div className="flex items-center gap-3 mb-5">
                      <h3 className="text-lg font-semibold text-[#111827] dark:text-white">Transport Legs</h3>
                      <Badge variant="secondary">{legsData!.legs.length} leg{legsData!.legs.length !== 1 ? "s" : ""}</Badge>
                    </div>

                    {/* Summary row */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                      {[
                        { label: "Legs", value: legsData!.legs.length },
                        { label: "Travel Time", value: `${Math.round(legsData!.legs.reduce((s, l) => s + (l.estimatedDurationMinutes || 0), 0) / 60)}h` },
                        { label: "Est. Cost", value: `$${legsData!.legs.reduce((s, l) => s + (l.estimatedCostUsd || 0), 0).toFixed(0)}` },
                        { label: "Distance", value: `${Math.round(legsData!.legs.reduce((s, l) => s + (l.distanceMeters || 0), 0) / 1000)} km` },
                      ].map(stat => (
                        <Card key={stat.label} className="bg-white dark:bg-gray-800">
                          <CardContent className="p-3 flex flex-col items-center">
                            <span className="text-xl font-bold text-[#FF385C]">{stat.value}</span>
                            <span className="text-xs text-gray-500 mt-0.5">{stat.label}</span>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    {/* Legs grouped by day */}
                    {Object.keys(byDay).map(Number).sort((a, b) => a - b).map(dayNum => (
                      <div key={dayNum} className="mb-6">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-[#FF385C] text-white text-xs font-bold flex-shrink-0">
                            {dayNum === 0 ? "?" : dayNum}
                          </div>
                          <span className="text-sm font-semibold text-[#111827] dark:text-white">
                            {dayNum === 0 ? "Unassigned" : `Day ${dayNum}`}
                            {itinerary?.days?.[dayNum - 1]?.title ? ` — ${itinerary.days[dayNum - 1].title}` : ""}
                          </span>
                          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                          <Badge variant="outline" className="text-xs">{byDay[dayNum].length} leg{byDay[dayNum].length !== 1 ? "s" : ""}</Badge>
                        </div>
                        <div className="space-y-3">
                          {byDay[dayNum].map(leg => (
                            <TransportLeg
                              key={leg.id}
                              leg={{
                                id: leg.id,
                                legOrder: leg.legOrder,
                                fromName: leg.fromName,
                                fromLat: leg.fromLat,
                                fromLng: leg.fromLng,
                                toName: leg.toName,
                                toLat: leg.toLat,
                                toLng: leg.toLng,
                                distanceMeters: leg.distanceMeters,
                                distanceDisplay: leg.distanceDisplay,
                                recommendedMode: leg.recommendedMode,
                                userSelectedMode: leg.userSelectedMode,
                                estimatedDurationMinutes: leg.estimatedDurationMinutes,
                                estimatedCostUsd: leg.estimatedCostUsd,
                                alternativeModes: leg.alternativeModes ?? [],
                              }}
                              readOnly={false}
                              onModeChangeSuccess={() => {}}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              }

              // Synthesized preview legs
              return (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <h3 className="text-lg font-semibold text-[#111827] dark:text-white">Transport Legs</h3>
                    <Badge variant="outline" className="text-xs border-amber-400 text-amber-700 dark:text-amber-400">Preview</Badge>
                  </div>

                  <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-4 py-3 mb-5 text-sm text-amber-800 dark:text-amber-300">
                    <span className="mt-0.5 text-base leading-none">🔍</span>
                    <span>These are estimated legs based on your activities. Mode changes are saved locally for this session — generate a full transport plan to save preferences permanently.</span>
                  </div>

                  {synthLegsByDay.map(({ dayNum, legs }) => (
                    <div key={dayNum} className="mb-6">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-[#FF385C] text-white text-xs font-bold flex-shrink-0">
                          {dayNum}
                        </div>
                        <span className="text-sm font-semibold text-[#111827] dark:text-white">
                          Day {dayNum}
                          {itinerary?.days?.[dayNum - 1]?.title ? ` — ${itinerary.days[dayNum - 1].title}` : ""}
                        </span>
                        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                        <Badge variant="outline" className="text-xs">{legs.length} leg{legs.length !== 1 ? "s" : ""}</Badge>
                      </div>
                      <div className="space-y-3">
                        {legs.map(leg => (
                          <TransportLeg
                            key={leg.id}
                            leg={{
                              ...leg,
                              userSelectedMode: synthLocalModes[leg.id] ?? leg.userSelectedMode,
                            }}
                            previewOnly={true}
                            onPreviewModeChange={(legId, mode) =>
                              setSynthLocalModes(prev => ({ ...prev, [legId]: mode }))
                            }
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Transport Hub — booking options (always visible, handles its own empty/loading state) */}
            <div>
              {legsData?.legs?.length ? (
                <div className="flex items-center gap-3 mb-5">
                  <h3 className="text-lg font-semibold text-[#111827] dark:text-white">Book Transport</h3>
                </div>
              ) : null}
              <TransportHub tripId={tripId} destination={itinerary?.destination} />
            </div>
        </div>
        </>}
      </div>

      <Dialog open={showExpertDialog} onOpenChange={setShowExpertDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-primary" />
              Request Expert Booking Assistance
            </DialogTitle>
            <DialogDescription>
              Let our travel experts handle all bookings for your itinerary. They'll coordinate both on-site and partner bookings, ensuring everything is confirmed before your trip.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-accent/50 p-4 rounded-lg">
              <h4 className="font-medium text-foreground mb-2">What's included:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                {["All hotel and accommodation bookings", "Tour and activity reservations", "Ground transportation (trains, buses, ferries)", "Event and show tickets", "Restaurant reservations"].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary" /> {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Special requests or notes (optional)</label>
              <Textarea
                placeholder="Any preferences, dietary requirements, accessibility needs, or special occasions..."
                value={expertNotes}
                onChange={(e) => setExpertNotes(e.target.value)}
                className="min-h-[100px]"
                data-testid="input-expert-notes"
              />
            </div>
            <div className="flex items-start gap-2 p-3 bg-muted rounded-lg">
              <AlertCircle className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">
                An expert will contact you within 24 hours to confirm your itinerary and payment details. You'll only be charged once all bookings are confirmed.
              </p>
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowExpertDialog(false)} data-testid="button-cancel-expert-dialog">Cancel</Button>
            <Button
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={handleExpertBookingRequest}
              disabled={isRequestingExpert}
              data-testid="button-confirm-expert-booking"
            >
              {isRequestingExpert ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...</>
              ) : (
                <><Headphones className="w-4 h-4 mr-2" /> Submit Request</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDiffReview} onOpenChange={(open) => { setShowDiffReview(open); if (!open) setRejectedDiffIds(new Set()); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Expert Suggestions</DialogTitle>
            <DialogDescription>
              Review the changes your expert proposed. Accept all to apply them, or reject to dismiss.
            </DialogDescription>
          </DialogHeader>

          {shareData?.expertNotes && (
            <div className="p-3 rounded-lg bg-muted border mb-2">
              <p className="text-xs font-medium text-muted-foreground mb-1">Expert notes:</p>
              <p className="text-sm italic">"{shareData.expertNotes}"</p>
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
                        ? "opacity-50 bg-destructive/10 border-destructive/30"
                        : "bg-accent/50"
                    )} data-testid={`diff-activity-${id}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 space-y-1">
                          {diff.name && diff.name !== diff.originalName && (
                            <div className="text-xs">
                              <span className="font-medium">Name:</span>{" "}
                              <span className="line-through text-muted-foreground">{diff.originalName}</span>
                              {" → "}
                              <span className="font-medium text-primary">{diff.name}</span>
                            </div>
                          )}
                          {diff.startTime && diff.originalStartTime && diff.startTime !== diff.originalStartTime && (
                            <div className="text-xs">
                              <span className="font-medium">Time:</span>{" "}
                              <span className="line-through text-muted-foreground">{diff.originalStartTime}</span>
                              {" → "}
                              <span className="font-medium text-primary">{diff.startTime}</span>
                            </div>
                          )}
                          {diff.note && (
                            <div className="text-xs italic text-muted-foreground">Note: "{diff.note}"</div>
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
                              ? "bg-destructive/10 border-destructive/30 text-destructive hover:bg-destructive/20"
                              : "border-muted text-muted-foreground hover:border-destructive/30 hover:text-destructive"
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
                        ? "opacity-50 bg-destructive/10 border-destructive/30"
                        : "bg-accent/50"
                    )} data-testid={`diff-transport-${id}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs">
                          <span className="font-medium">Leg {diff.legOrder}:</span>{" "}
                          <span className="line-through text-muted-foreground">{diff.originalMode}</span>
                          {" → "}
                          <span className="font-medium text-primary">{diff.newMode}</span>
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
                              ? "bg-destructive/10 border-destructive/30 text-destructive hover:bg-destructive/20"
                              : "border-muted text-muted-foreground hover:border-destructive/30 hover:text-destructive"
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

          {Object.keys(reviewActivityDiffs).length === 0 && Object.keys(reviewTransportDiffs).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No detailed diff available.</p>
          )}

          {rejectedDiffIds.size > 0 && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              {rejectedDiffIds.size} change{rejectedDiffIds.size !== 1 ? "s" : ""} will be rejected. The rest will be accepted.
            </p>
          )}

          <DialogFooter className="mt-4 flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => acknowledgeMutation.mutate({ action: "reject", rejectedIds: [] })}
              disabled={acknowledgeMutation.isPending}
              data-testid="button-dialog-reject-edits"
            >
              <XCircle className="w-4 h-4 mr-2" /> Reject All
            </Button>
            <Button
              onClick={() => acknowledgeMutation.mutate({ action: "accept", rejectedIds: Array.from(rejectedDiffIds) })}
              disabled={acknowledgeMutation.isPending}
              data-testid="button-dialog-accept-edits"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {rejectedDiffIds.size > 0 ? `Accept ${Object.keys(reviewActivityDiffs).length + Object.keys(reviewTransportDiffs).length - rejectedDiffIds.size} Changes` : "Accept All"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
