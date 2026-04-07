import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calendar, ChevronRight, LayoutList, Lightbulb, Map as MapIcon, MapPin, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDeleteTrip } from "@/hooks/use-trips";
import { getTemplateConfig, type PlanCardProps, type PlanCardData, type PlanCardDay, type PlanCardChange } from "./plancard-types";
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

  const { data: suggestionsData } = useQuery<{ suggestions: Array<{ id: string; status: string }> }>({
    queryKey: ['/api/trips', trip.id, 'suggestions'],
    enabled: !!advisor,
    staleTime: 60000,
  });
  const pendingSuggestions = suggestionsData?.suggestions?.filter(s => s.status === "pending").length ?? 0;

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
  const expertMsgText = lastAssistantMsg
    ? lastAssistantMsg.content.slice(0, 100) + (lastAssistantMsg.content.length > 100 ? "…" : "")
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

  const optimizationScore = score?.optimizationScore;
  const shareToken = score?.shareToken;

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

        <div className="px-5 pt-3 flex gap-1.5" data-testid={`view-mode-toggle-${trip.id}`}>
          <button
            onClick={() => setViewMode("card")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-all border-0 ${
              viewMode === "card"
                ? "bg-primary text-primary-foreground shadow-md"
                : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
            data-testid={`btn-card-view-${trip.id}`}
          >
            <LayoutList className="w-4 h-4" /> Card View
          </button>
          <button
            onClick={() => setViewMode("map")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-all border-0 ${
              viewMode === "map"
                ? "bg-primary text-primary-foreground shadow-md"
                : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
            data-testid={`btn-map-view-${trip.id}`}
          >
            <MapIcon className="w-4 h-4" /> Map Control Center
          </button>
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

        {/* Footer buttons */}
        <div className="px-5 pb-3 pt-2 flex gap-2">
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
