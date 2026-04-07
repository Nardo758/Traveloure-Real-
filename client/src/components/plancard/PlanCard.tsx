import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calendar, ChevronDown, ChevronRight, ChevronUp, Check, LayoutList, Lightbulb, Map as MapIcon, MapPin, MessageSquare, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useDeleteTrip } from "@/hooks/use-trips";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { getTemplateConfig, type PlanCardProps, type PlanCardData, type PlanCardDay, type PlanCardChange, type TransitMode } from "./plancard-types";
import { HeroSection } from "./HeroSection";
import { StatsRow, OptimizerMetrics } from "./StatsRow";
import { DaySelector } from "./DaySelector";
import { SectionTabs } from "./SectionTabs";
import { ChangeLogPanel } from "./ChangeLogPanel";
import { ActivitiesSection } from "./ActivitiesSection";
import { TransportSection } from "./TransportSection";
import { MapControlCenter } from "./MapControlCenter";

interface ExpertAdvisor {
  advisor_id: string;
  status: "pending" | "accepted" | "rejected";
  first_name: string;
  last_name: string;
  profile_image_url: string | null;
}

interface ServiceBooking {
  id: string | number;
  tripId: string;
  status?: string;
}

interface ConversationMessage {
  id: number;
  conversationId: number;
  role: string;
  content: string;
  createdAt: string;
}

interface ConversationWithMessages {
  id: number;
  title: string;
  messages: ConversationMessage[];
}

interface ExpertSuggestion {
  id: string;
  type: string;
  day_number: number | null;
  title: string;
  description: string | null;
  estimated_cost: number | null;
  status: "pending" | "accepted" | "rejected";
  expert_first_name: string;
  expert_last_name: string;
  created_at: string;
}

const AVATAR_COLORS: Array<{ bg: string; text: string }> = [
  { bg: "#E8B339", text: "#412402" },
  { bg: "#B5D4F4", text: "#0C447C" },
  { bg: "#CECBF6", text: "#3C3489" },
  { bg: "#9FE1CB", text: "#04342C" },
  { bg: "#F4C0D1", text: "#72243E" },
];

function getInitials(name: string): string {
  return name.split(" ").filter(Boolean).map(p => p[0]).join("").toUpperCase().slice(0, 2);
}

function findMatchedConversationId(
  tripDestination: string,
  tripTitle: string | undefined,
  conversations: Array<{ id: number; title: string }>,
): number | null {
  if (!conversations.length) return null;
  const destKey = tripDestination?.split(",")[0]?.toLowerCase().trim();
  const titleKey = tripTitle?.toLowerCase().trim();
  const match = conversations.find(c => {
    const cTitle = c.title.toLowerCase();
    return (
      (destKey && cTitle.includes(destKey)) ||
      (titleKey && cTitle.includes(titleKey))
    );
  });
  return match?.id ?? null;
}

export function PlanCard({ trip, score, index = 0, conversations = [], notifications = [] }: PlanCardProps) {
  const [selectedDay, setSelectedDay] = useState(0);
  const [section, setSection] = useState<"activities" | "transport">("activities");
  const [showChanges, setShowChanges] = useState(true);
  const [viewMode, setViewMode] = useState<"card" | "map">("card");
  const [confirming, setConfirming] = useState(false);
  const [tripWideMode, setTripWideMode] = useState<string | null>(null);
  const [selectedModes, setSelectedModes] = useState<Record<string, string>>({});
  const [showExpertNotes, setShowExpertNotes] = useState(true);
  const [reviewFilter, setReviewFilter] = useState<"all" | "pending" | "accepted" | "rejected">("all");
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const { toast } = useToast();
  const deleteTrip = useDeleteTrip();
  const [, navigate] = useLocation();

  const handleDelete = () => {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
      return;
    }
    deleteTrip.mutate(trip.id);
  };

  const templateConfig = getTemplateConfig(trip.eventType);

  const openInMaps = () => {
    if (!trip.destination) return;
    const query = encodeURIComponent(trip.destination);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isIOS) {
      window.open(`maps://maps.apple.com/?q=${query}`, "_blank");
    } else {
      window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, "_blank");
    }
    toast({ title: "Opening Maps", description: trip.destination });
  };

  const { data: plancardData } = useQuery<PlanCardData>({
    queryKey: [`/api/trips/${trip.id}/plancard`],
    staleTime: 30000,
  });

  const { data: advisorData } = useQuery<{ advisor: ExpertAdvisor | null }>({
    queryKey: ['/api/trips', trip.id, 'expert-advisor'],
    staleTime: 60000,
  });
  const advisor = advisorData?.advisor ?? null;

  const { data: serviceBookings } = useQuery<ServiceBooking[]>({
    queryKey: ['/api/service-bookings'],
    staleTime: 60000,
  });
  const tripServiceCount = serviceBookings?.filter(b => b.tripId === trip.id).length ?? 0;

  const { data: suggestionsData } = useQuery<{ suggestions: ExpertSuggestion[] }>({
    queryKey: ['/api/trips', trip.id, 'suggestions'],
    enabled: !!advisor,
    staleTime: 60000,
  });
  const allSuggestions = suggestionsData?.suggestions ?? [];
  const pendingSuggestions = allSuggestions.filter(s => s.status === "pending").length;

  const matchedConvId = findMatchedConversationId(trip.destination, trip.title, conversations);
  const { data: convWithMessages } = useQuery<ConversationWithMessages>({
    queryKey: ['/api/conversations', matchedConvId],
    enabled: matchedConvId !== null,
    staleTime: 60000,
  });
  const lastAssistantMsg = convWithMessages?.messages
    ? [...convWithMessages.messages]
        .filter(m => m.role === "assistant")
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    : null;
  const expertMsgRaw = lastAssistantMsg?.content ?? trip.expertNotes ?? null;
  const expertMsgText = expertMsgRaw
    ? expertMsgRaw.slice(0, 100) + (expertMsgRaw.length > 100 ? "…" : "")
    : null;

  const actionItems = notifications
    .filter(n => n.tripId === trip.id)
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
    .slice(0, 2);

  const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length];

  const days: PlanCardDay[] = plancardData?.days || [];
  const changeLog: PlanCardChange[] = plancardData?.changeLog || [];
  const metrics = plancardData?.metrics || {};
  const stats = plancardData?.stats || {};
  const day = days[selectedDay];

  useEffect(() => {
    if (days.length === 0) return;
    const initial: Record<string, string> = {};
    days.forEach(d => d.transports?.forEach(t => {
      if (t.selectedMode) initial[t.id] = t.selectedMode;
      else initial[t.id] = t.mode;
    }));
    setSelectedModes(initial);
  }, [days]);

  const applyTripWideMode = (mode: string) => {
    setTripWideMode(mode);
    const updated: Record<string, string> = { ...selectedModes };
    days.forEach(d => d.transports?.forEach(t => {
      const hasOption = t.transitOptions?.some(o => o.mode === mode);
      if (hasOption) updated[t.id] = mode;
    }));
    setSelectedModes(updated);
  };

  const resetTransitModes = () => {
    setTripWideMode(null);
    const reset: Record<string, string> = {};
    days.forEach(d => d.transports?.forEach(t => {
      reset[t.id] = t.selectedMode || t.mode;
    }));
    setSelectedModes(reset);
  };

  const handleModeChange = (legId: string, mode: string) => {
    setSelectedModes(prev => ({ ...prev, [legId]: mode }));
  };

  const handleSuggestionResponse = async (suggestionId: string, status: "accepted" | "rejected") => {
    try {
      setRespondingId(suggestionId);
      await apiRequest("PATCH", `/api/trips/${trip.id}/suggestions/${suggestionId}`, { status });
      queryClient.invalidateQueries({ queryKey: ['/api/trips', trip.id, 'suggestions'] });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${trip.id}/plancard`] });
      toast({ title: status === "accepted" ? "Suggestion accepted" : "Suggestion rejected" });
    } catch {
      toast({ title: "Failed to update suggestion", variant: "destructive" });
    } finally {
      setRespondingId(null);
    }
  };

  const handleBulkSuggestions = async (status: "accepted" | "rejected") => {
    const pending = allSuggestions.filter(s => s.status === "pending");
    for (const s of pending) {
      try {
        await apiRequest("PATCH", `/api/trips/${trip.id}/suggestions/${s.id}`, { status });
      } catch { /* continue */ }
    }
    queryClient.invalidateQueries({ queryKey: ['/api/trips', trip.id, 'suggestions'] });
    queryClient.invalidateQueries({ queryKey: [`/api/trips/${trip.id}/plancard`] });
    toast({ title: `${pending.length} suggestion${pending.length !== 1 ? "s" : ""} ${status}` });
  };

  const optimizationScore = score?.optimizationScore;
  const shareToken = trip.shareToken ?? score?.shareToken ?? null;

  const totalActivities = stats.totalActivities || days.reduce((s: number, d) => s + (d.activities?.length || 0), 0);
  const confirmedActivities = stats.confirmedActivities ?? days.reduce((s: number, d) => s + (d.activities?.filter((a) => a.status === "confirmed").length || 0), 0);
  const totalLegs = stats.totalLegs || days.reduce((s: number, d) => s + (d.transports?.length || 0), 0);
  const totalMinutes = stats.totalTransitMinutes || days.reduce((s: number, d) => s + (d.transports || []).reduce((t: number, tr) => t + (tr.duration || 0), 0), 0);
  const expertChanges = stats.pendingExpertChanges || changeLog.filter((c) => c.role === "expert" && c.type === "suggest").length;

  const transportLocked = day?.activities?.some((a) => a.status === "pending") ?? false;

  useEffect(() => {
    if (transportLocked && section === "transport") {
      setSection("activities");
    }
  }, [transportLocked, section]);

  const traveloureScore = metrics.traveloureScore || metrics.optimizationScore || optimizationScore;
  const totalCostNum = metrics.totalCost;
  const savingsNum = metrics.savings;
  const savingsPercentNum = metrics.savingsPercent;
  const wellnessTime = metrics.wellnessMinutes;
  const travelDistance = metrics.travelDistanceMinutes;
  const starDelta = metrics.starRatingDelta;

  const totalCostDisplay = totalCostNum != null ? `$${Number(totalCostNum).toLocaleString()}` : null;
  const savingsDisplay = savingsNum != null ? `$${Number(savingsNum).toLocaleString()}` : null;
  const savingsPercentDisplay = savingsPercentNum != null ? `${savingsPercentNum}%` : null;

  const perPersonFromMetrics = metrics.perPersonCost;
  const budgetDisplay = trip.budget ? `$${Number(trip.budget).toLocaleString()}` : null;
  const perPersonDisplay = perPersonFromMetrics != null
    ? `$${Number(perPersonFromMetrics).toLocaleString()}/person`
    : (trip.budget && trip.numberOfTravelers > 1
      ? `$${Math.round(Number(trip.budget) / trip.numberOfTravelers).toLocaleString()}/person`
      : null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      data-testid={`card-plan-${trip.id}`}
      className="relative"
    >
      <button
        onClick={handleDelete}
        disabled={deleteTrip.isPending}
        data-testid={`button-delete-plan-${trip.id}`}
        title={confirming ? "Click again to confirm delete" : "Remove this plan"}
        className={`absolute -top-2.5 -right-2.5 z-20 w-7 h-7 rounded-full flex items-center justify-center shadow-md border transition-all duration-200 text-xs font-bold
          ${confirming
            ? "bg-red-500 border-red-600 text-white scale-110"
            : "bg-white dark:bg-gray-800 border-border text-muted-foreground hover:bg-red-50 hover:border-red-300 hover:text-red-500 dark:hover:bg-red-950"
          }`}
      >
        {confirming ? "?" : <X className="w-3.5 h-3.5" />}
      </button>

      <Card className="overflow-hidden border border-border hover:shadow-xl transition-all duration-300 group bg-card">
        <HeroSection
          trip={trip}
          traveloureScore={traveloureScore}
          shareToken={shareToken}
          totalCost={totalCostDisplay}
          perPerson={perPersonDisplay}
          budget={budgetDisplay}
        />

        <div className="px-4 pt-3" data-testid={`view-mode-toggle-${trip.id}`}>
          <div className="relative bg-muted rounded-xl p-1 flex gap-0.5">
            <div
              className="absolute top-1 bottom-1 rounded-lg transition-all duration-300 ease-in-out shadow-md"
              style={{
                left: viewMode === "card" ? "4px" : "calc(50% + 1px)",
                width: "calc(50% - 5px)",
                background: "hsl(var(--primary))",
              }}
            />
            <button
              onClick={() => setViewMode("card")}
              className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-colors duration-300 border-0 cursor-pointer ${
                viewMode === "card" ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`btn-card-view-${trip.id}`}
            >
              <LayoutList className="w-4 h-4" /> Dashboard
            </button>
            <button
              onClick={() => setViewMode("map")}
              className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-colors duration-300 border-0 cursor-pointer ${
                viewMode === "map" ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`btn-map-view-${trip.id}`}
            >
              <MapIcon className="w-4 h-4" /> Map Control Center
              {viewMode !== "map" && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              )}
            </button>
          </div>
        </div>

        {viewMode === "card" ? (
          <>
            <StatsRow
              trip={trip}
              days={days}
              totalActivities={totalActivities}
              totalLegs={totalLegs}
              totalMinutes={totalMinutes}
              templateConfig={templateConfig}
            />

            <OptimizerMetrics
              tripId={trip.id}
              traveloureScore={traveloureScore}
              savings={savingsDisplay}
              savingsPercent={savingsPercentDisplay}
              wellnessTime={wellnessTime}
              travelDistance={travelDistance}
              starDelta={starDelta}
              totalCost={totalCostDisplay}
              perPerson={perPersonDisplay}
            />

            <DaySelector
              tripId={trip.id}
              days={days}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
            />

            <SectionTabs
              tripId={trip.id}
              section={section}
              onSetSection={setSection}
              showChanges={showChanges}
              onToggleChanges={() => setShowChanges(!showChanges)}
              templateConfig={templateConfig}
              dayActivityCount={day?.activities?.length || 0}
              dayTransportCount={day?.transports?.length || 0}
              confirmedActivities={confirmedActivities}
              totalActivities={totalActivities}
              transportLocked={transportLocked}
              changeLogCount={changeLog.length}
              expertChanges={expertChanges}
            />

            <ChangeLogPanel
              tripId={trip.id}
              showChanges={showChanges}
              changeLog={changeLog}
            />

            {advisor && expertMsgText && (
              <div className="mx-4 mb-2" data-testid={`expert-notes-panel-${trip.id}`}>
                <button
                  onClick={() => setShowExpertNotes(!showExpertNotes)}
                  className="flex items-center justify-between w-full text-left px-3 py-2 rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-200/50 dark:border-purple-800/30 hover:bg-purple-100 dark:hover:bg-purple-950/30 transition-colors"
                  data-testid={`btn-toggle-expert-notes-${trip.id}`}
                >
                  <span className="flex items-center gap-2 text-xs font-semibold text-purple-800 dark:text-purple-300">
                    <MessageSquare className="w-3.5 h-3.5" />
                    Expert Notes
                  </span>
                  {showExpertNotes ? <ChevronUp className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" /> : <ChevronDown className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />}
                </button>
                {showExpertNotes && (
                  <div className="mt-1.5 px-3 py-2.5 rounded-lg bg-card border border-border text-xs text-muted-foreground" data-testid={`expert-notes-content-${trip.id}`}>
                    <div className="flex items-start gap-2">
                      {advisor.profile_image_url ? (
                        <img src={advisor.profile_image_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0 mt-0.5" />
                      ) : (
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-semibold flex-shrink-0 mt-0.5" style={{ background: avatarColor.bg, color: avatarColor.text }}>
                          {getInitials(`${advisor.first_name} ${advisor.last_name}`)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="font-semibold text-foreground">{advisor.first_name} {advisor.last_name}</span>
                        <p className="mt-0.5 leading-relaxed">"{expertMsgText}"</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {allSuggestions.length > 0 && (
              <div className="mx-4 mb-2" data-testid={`suggestion-review-panel-${trip.id}`}>
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="px-3 py-2 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200/50 dark:border-amber-800/30 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                        <Lightbulb className="w-3.5 h-3.5" />
                        {pendingSuggestions} pending
                      </span>
                      <span className="text-[10px] text-green-700 dark:text-green-400">{allSuggestions.filter(s => s.status === "accepted").length} accepted</span>
                      <span className="text-[10px] text-red-600 dark:text-red-400">{allSuggestions.filter(s => s.status === "rejected").length} rejected</span>
                    </div>
                    {pendingSuggestions > 0 && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleBulkSuggestions("accepted")}
                          className="text-[9px] px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors font-medium"
                          data-testid={`btn-accept-all-${trip.id}`}
                        >
                          Accept All
                        </button>
                        <button
                          onClick={() => handleBulkSuggestions("rejected")}
                          className="text-[9px] px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors font-medium"
                          data-testid={`btn-reject-all-${trip.id}`}
                        >
                          Reject All
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-1 px-2 pt-2 pb-1">
                    {(["all", "pending", "accepted", "rejected"] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setReviewFilter(f)}
                        className={`text-[10px] px-2 py-0.5 rounded-full capitalize transition-colors ${reviewFilter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                        data-testid={`btn-filter-${f}-${trip.id}`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>

                  <div className="max-h-48 overflow-y-auto">
                    {allSuggestions
                      .filter(s => reviewFilter === "all" || s.status === reviewFilter)
                      .map(s => (
                        <div key={s.id} className="px-3 py-2 border-t border-border/50" data-testid={`suggestion-card-${s.id}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="text-xs font-semibold text-foreground">{s.title}</span>
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
                                  {s.type}
                                </Badge>
                                {s.day_number && <span className="text-[9px] text-muted-foreground">Day {s.day_number}</span>}
                              </div>
                              {s.description && <p className="text-[10px] text-muted-foreground leading-relaxed">{s.description}</p>}
                              {s.estimated_cost != null && <span className="text-[10px] text-green-600 dark:text-green-400 font-medium">${s.estimated_cost}</span>}
                            </div>
                            {s.status === "pending" ? (
                              <div className="flex gap-1 flex-shrink-0">
                                <button
                                  onClick={() => handleSuggestionResponse(s.id, "accepted")}
                                  disabled={respondingId === s.id}
                                  className="w-6 h-6 rounded-md bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 flex items-center justify-center transition-colors"
                                  data-testid={`btn-accept-${s.id}`}
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => handleSuggestionResponse(s.id, "rejected")}
                                  disabled={respondingId === s.id}
                                  className="w-6 h-6 rounded-md bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 flex items-center justify-center transition-colors"
                                  data-testid={`btn-reject-${s.id}`}
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <Badge className={`text-[9px] px-1.5 py-0 h-4 ${s.status === "accepted" ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" : "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"}`}>
                                {s.status}
                              </Badge>
                            )}
                          </div>
                          <div className="text-[9px] text-muted-foreground mt-1">{s.expert_first_name} {s.expert_last_name}</div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}

            {section === "activities" && (
              <ActivitiesSection
                tripId={trip.id}
                day={day}
                templateConfig={templateConfig}
              />
            )}

            {section === "transport" && !transportLocked && (
              <TransportSection
                tripId={trip.id}
                tripDestination={trip.destination}
                day={day}
                days={days}
                selectedModes={selectedModes}
                onModeChange={handleModeChange}
                tripWideMode={tripWideMode}
                onApplyTripWideMode={applyTripWideMode}
                onResetModes={resetTransitModes}
              />
            )}
          </>
        ) : (
          <MapControlCenter
            tripId={trip.id}
            tripDestination={trip.destination}
            days={days}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
          />
        )}

        <div className="px-5 pb-3 pt-2 flex gap-2">
          {viewMode === "card" ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="flex-shrink-0"
                onClick={() => setViewMode("map")}
                data-testid={`button-open-map-${trip.id}`}
              >
                <MapIcon className="w-3.5 h-3.5 mr-1" />
                Open Map
              </Button>
              <Link href={`/itinerary/${trip.id}`} className="flex-1">
                <Button
                  size="sm"
                  className="w-full text-xs font-semibold"
                  data-testid={`button-view-itinerary-${trip.id}`}
                >
                  <Calendar className="w-3.5 h-3.5 mr-1" />
                  View Itinerary
                  <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                </Button>
              </Link>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                className="flex-shrink-0"
                onClick={openInMaps}
                data-testid={`button-open-maps-${trip.id}`}
              >
                <MapPin className="w-3.5 h-3.5 mr-1" />
                Maps
              </Button>
              <Button
                size="sm"
                className="flex-1 text-xs font-semibold"
                onClick={() => setViewMode("card")}
                data-testid={`button-dashboard-${trip.id}`}
              >
                <LayoutList className="w-3.5 h-3.5 mr-1" />
                Dashboard
                <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
              </Button>
            </>
          )}
        </div>

        {/* Enrichment pills row — below footer buttons */}
        {(tripServiceCount > 0 || totalLegs > 0 || advisor) && (
          <div className="flex gap-1.5 flex-wrap px-5 pb-2" data-testid={`pills-row-${trip.id}`}>
            {tripServiceCount > 0 && (
              <button
                type="button"
                onClick={() => navigate(`/trip/${trip.id}?tab=bookings`)}
                className="text-[10px] px-2.5 py-1 rounded-full cursor-pointer hover:opacity-80 transition-opacity font-medium"
                style={{ background: "#E6F1FB", color: "#0C447C" }}
                data-testid={`pill-services-${trip.id}`}
              >
                💼 {tripServiceCount} service{tripServiceCount !== 1 ? "s" : ""}
              </button>
            )}
            {totalLegs > 0 && (
              <button
                type="button"
                onClick={() => navigate(`/trip/${trip.id}?tab=itinerary&section=transport`)}
                className="text-[10px] px-2.5 py-1 rounded-full cursor-pointer hover:opacity-80 transition-opacity font-medium"
                style={{ background: "#E1F5EE", color: "#085041" }}
                data-testid={`pill-transport-${trip.id}`}
              >
                🚗 {totalLegs} leg{totalLegs !== 1 ? "s" : ""}
              </button>
            )}
            {advisor && (
              <button
                type="button"
                onClick={() => navigate(`/trip/${trip.id}?tab=expert`)}
                className="text-[10px] px-2.5 py-1 rounded-full cursor-pointer hover:opacity-80 transition-opacity font-medium"
                style={{ background: "#EEEDFE", color: "#3C3489" }}
                data-testid={`pill-expert-${trip.id}`}
              >
                👥 Expert assigned
              </button>
            )}
          </div>
        )}

        {/* Expert advisor strip — below footer buttons */}
        {advisor && (
          <Link href={`/trip/${trip.id}?tab=expert&section=suggestions`}>
            <div
              className="flex items-center gap-2.5 cursor-pointer hover:bg-muted/40 transition-colors mx-5 mb-3 rounded-xl border border-border px-3 py-2"
              data-testid={`advisor-strip-${trip.id}`}
            >
              {advisor.profile_image_url ? (
                <img
                  src={advisor.profile_image_url}
                  alt={`${advisor.first_name} ${advisor.last_name}`}
                  className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-semibold flex-shrink-0"
                  style={{ background: avatarColor.bg, color: avatarColor.text }}
                >
                  {getInitials(`${advisor.first_name} ${advisor.last_name}`)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-semibold text-foreground">
                  {advisor.first_name} {advisor.last_name}
                </div>
                {advisor.status === "accepted" && expertMsgText && (
                  <div className="text-[10px] truncate text-muted-foreground">
                    "{expertMsgText}"
                  </div>
                )}
              </div>
              {pendingSuggestions > 0 ? (
                <div
                  className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: "#FAEEDA", color: "#633806" }}
                  data-testid={`badge-suggestions-${trip.id}`}
                >
                  <Lightbulb className="w-2.5 h-2.5" />
                  {pendingSuggestions}
                </div>
              ) : (
                advisor.status === "accepted" && (
                  <div className="w-2 h-2 rounded-full flex-shrink-0 bg-green-500" />
                )
              )}
            </div>
          </Link>
        )}

        {/* Action items from notifications — below footer buttons */}
        {actionItems.length > 0 && (
          <div className="mx-5 mb-4 rounded-xl bg-muted/40 border border-border px-3 py-2" data-testid={`action-items-${trip.id}`}>
            {actionItems.map((n, i) => (
              <div key={n.id ?? i} className="flex items-start gap-2 py-0.5">
                <div
                  className="w-1.5 h-1.5 rounded-full mt-[5px] flex-shrink-0"
                  style={{ background: n.type === "urgent" || n.type === "alert" ? "#E24B4A" : "#EF9F27" }}
                />
                <span className="text-[11px] flex-1 text-foreground">{n.title || n.message}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </motion.div>
  );
}
