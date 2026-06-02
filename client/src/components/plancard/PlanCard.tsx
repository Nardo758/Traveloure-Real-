import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calendar, ChevronRight, LayoutList, Map as MapIcon, MapPin, X, Lightbulb } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDeleteTrip } from "@/hooks/use-trips";
import { openInMaps } from "@/lib/navigate";
import {
  getTemplateConfig, type PlanCardProps, type PlanCardData, type PlanCardDay, type PlanCardChange,
} from "./plancard-types";
import { HeroSection } from "./HeroSection";
import { StatsRow, OptimizerMetrics } from "./StatsRow";
import { DaySelector } from "./DaySelector";
import { SectionTabs } from "./SectionTabs";
import { ChangeLogPanel } from "./ChangeLogPanel";
import { ActivitiesSection } from "./ActivitiesSection";
import { TransportSection } from "./TransportSection";
import { MapControlCenter } from "./MapControlCenter";

// ── Summary-stage helpers ──────────────────────────────────────────────────

function daysUntilDate(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatMinutes(mins: number): string {
  if (!mins) return "0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function getSummaryStatusLabel(startDate: string, endDate: string, status?: string): string {
  const now = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (now >= start && now <= end) return "Active";
  if (now < start) {
    const days = daysUntilDate(startDate);
    return days <= 7 ? "Soon" : "Upcoming";
  }
  if (status) return status.charAt(0).toUpperCase() + status.slice(1);
  return "Planning";
}

function getSummaryGradient(startDate: string): string {
  const daysTil = daysUntilDate(startDate);
  if (daysTil > 0 && daysTil <= 90) return "linear-gradient(135deg,#D85A30,#F0997B)";
  return "linear-gradient(135deg,#E85D55,#F4A29C)";
}

function getInitials(name: string): string {
  return name.split(" ").filter(Boolean).map(p => p[0]).join("").toUpperCase().slice(0, 2);
}

function findMatchedConvId(
  tripDestination: string,
  tripTitle: string | undefined,
  conversations: Array<{ id: number; title: string }>
): number | null {
  const destKey = tripDestination?.split(",")[0]?.toLowerCase().trim();
  const titleKey = tripTitle?.toLowerCase().trim();
  if (!conversations.length) return null;
  const match = conversations.find(c => {
    const cTitle = c.title.toLowerCase();
    return (destKey && cTitle.includes(destKey)) || (titleKey && cTitle.includes(titleKey));
  });
  return match?.id ?? null;
}

const AVATAR_COLORS = [
  { bg: "#E8B339", text: "#412402" },
  { bg: "#B5D4F4", text: "#0C447C" },
  { bg: "#CECBF6", text: "#3C3489" },
  { bg: "#9FE1CB", text: "#04342C" },
  { bg: "#F4C0D1", text: "#72243E" },
];

// ── Summary stage component ────────────────────────────────────────────────

interface SummaryAdvisor {
  advisor_id: string;
  status: "pending" | "accepted" | "rejected";
  first_name: string;
  last_name: string;
  profile_image_url: string | null;
}

interface SummaryNotification {
  id: string | number;
  title?: string;
  message?: string;
  type?: string;
  createdAt?: string;
  tripId?: string | null;
  read?: boolean;
}

function PlanCardSummary({
  trip,
  index,
  plancardData,
}: {
  trip: NonNullable<PlanCardProps["trip"]>;
  index: number;
  plancardData: PlanCardData | undefined;
}) {
  const [confirming, setConfirming] = useState(false);
  const [, navigate] = useLocation();
  const deleteTrip = useDeleteTrip();

  const days: PlanCardDay[] = plancardData?.days || [];
  const stats = plancardData?.stats || {};

  const totalActivities = stats.totalActivities ?? days.reduce((s, d) => s + (d.activities?.length ?? 0), 0);
  const totalLegs = stats.totalLegs ?? days.reduce((s, d) => s + (d.transports?.length ?? 0), 0);
  const totalMinutes = stats.totalTransitMinutes ?? days.reduce((s, d) => s + (d.transports ?? []).reduce((t, tr) => t + (tr.duration ?? 0), 0), 0);
  const numDays = days.length || Math.max(1, Math.round(
    (new Date(trip.endDate ?? Date.now()).getTime() - new Date(trip.startDate ?? Date.now()).getTime()) / 86400000
  ));

  // Summary-specific queries
  const { data: advisorData } = useQuery<{ advisor: SummaryAdvisor | null }>({
    queryKey: [`/api/trips/${trip.id}/expert-advisor`],
    staleTime: 60000,
  });
  const advisor = advisorData?.advisor ?? null;

  const { data: suggestionsData } = useQuery<{ suggestions: Array<{ id: string; status: string }> }>({
    queryKey: [`/api/trips/${trip.id}/suggestions`],
    enabled: !!advisor,
    staleTime: 60000,
  });
  const pendingSuggestions = suggestionsData?.suggestions?.filter(s => s.status === "pending").length ?? 0;

  const { data: serviceBookings } = useQuery<any[]>({
    queryKey: ['/api/service-bookings'],
    staleTime: 60000,
  });
  const serviceBookingsCount = serviceBookings?.filter((b: any) => b.tripId === trip.id).length ?? 0;

  const { data: notificationsData } = useQuery<SummaryNotification[]>({
    queryKey: ['/api/notifications'],
    staleTime: 60000,
  });
  const actionItems = (notificationsData ?? []).filter(n => n.tripId === trip.id).slice(0, 2);

  const { data: conversations } = useQuery<Array<{ id: number; title: string }>>({
    queryKey: ['/api/conversations'],
    staleTime: 60000,
  });
  const matchedConvId = conversations ? findMatchedConvId(trip.destination, trip.title, conversations) : null;

  const { data: convWithMessages } = useQuery<any>({
    queryKey: [`/api/conversations/${matchedConvId}`],
    enabled: matchedConvId !== null,
    staleTime: 60000,
  });

  const lastAssistantMsg = convWithMessages?.messages
    ? [...convWithMessages.messages]
        .filter((m: any) => m.role === "assistant")
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    : null;
  const expertMsgText = lastAssistantMsg
    ? lastAssistantMsg.content.slice(0, 100) + (lastAssistantMsg.content.length > 100 ? "…" : "")
    : null;

  const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length];
  const daysTil = daysUntilDate(trip.startDate ?? new Date().toISOString());
  const statusLabel = getSummaryStatusLabel(trip.startDate ?? "", trip.endDate ?? "");
  const gradient = getSummaryGradient(trip.startDate ?? "");
  const showCountdown = daysTil > 0;
  const tripTitle = trip.title || trip.destination;

  const formatShortDate = (d: string) =>
    new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
      return;
    }
    deleteTrip.mutate(trip.id);
  };

  return (
    <div
      className="rounded-[14px] overflow-hidden"
      style={{ border: "0.5px solid #E8E8E2", background: "#FFFFFF" }}
      data-testid={`dashboard-plan-card-${trip.id}`}
    >
      {/* Header */}
      <div className="relative text-white" style={{ background: gradient, padding: "13px 15px 11px" }}>
        <div className="flex gap-1.5 mb-[7px]">
          <span
            className="text-[9px] font-semibold px-2.5 py-[3px] rounded-lg uppercase tracking-[0.4px]"
            style={{ background: "rgba(255,255,255,0.25)" }}
            data-testid={`status-pill-${trip.id}`}
          >
            ⚡ {statusLabel}
          </span>
        </div>

        <div className="absolute top-3 right-3.5 flex flex-col items-end gap-1">
          <button
            onClick={handleDelete}
            disabled={deleteTrip.isPending}
            data-testid={`button-delete-plan-${trip.id}`}
            title={confirming ? "Click again to confirm delete" : "Remove this plan"}
            className={`w-6 h-6 flex items-center justify-center rounded-full transition-all ${
              confirming ? "bg-red-500 text-white scale-110" : "bg-white/20 text-white hover:bg-white/35"
            }`}
          >
            {confirming ? "?" : <X className="w-3.5 h-3.5" />}
          </button>
          {showCountdown && (
            <div className="text-right leading-none">
              <div className="text-[22px] font-medium leading-none" data-testid={`text-countdown-${trip.id}`}>{daysTil}</div>
              <div className="text-[9px] opacity-70">days</div>
            </div>
          )}
        </div>

        <div className="text-[15px] font-medium mb-0.5 pr-[50px]" data-testid={`text-plan-title-${trip.id}`}>{tripTitle}</div>
        <div className="text-[11px] opacity-85">
          📍 {trip.destination} · {formatShortDate(trip.startDate ?? "")}–{formatShortDate(trip.endDate ?? "")}
        </div>
      </div>

      {/* Stats */}
      <div style={{ padding: "10px 14px" }}>
        <div className="flex text-center mb-2">
          {([
            { label: "Days", value: numDays },
            { label: "Activities", value: totalActivities },
            { label: "Transit legs", value: totalLegs },
            { label: "Transit time", value: formatMinutes(totalMinutes) },
          ] as const).map((s, i) => (
            <div
              key={i}
              className="flex-1 py-1"
              style={{ borderLeft: i > 0 ? "0.5px solid #E8E8E2" : "none" }}
            >
              <div className="text-[9px]" style={{ color: "#7A7A72", marginBottom: 1 }}>{s.label}</div>
              <div className="text-[14px] font-medium" style={{ color: "#1A1A18" }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Chips */}
        <div className="flex gap-[5px] flex-wrap">
          {serviceBookingsCount > 0 && (
            <button
              type="button"
              onClick={() => navigate(`/trip/${trip.id}?tab=bookings`)}
              className="text-[9px] px-[7px] py-[2px] rounded-[10px] cursor-pointer hover:opacity-80 transition-opacity"
              style={{ background: "#E6F1FB", color: "#0C447C" }}
              data-testid={`pill-services-${trip.id}`}
            >
              💼 {serviceBookingsCount} service{serviceBookingsCount !== 1 ? 's' : ''}
            </button>
          )}
          {totalLegs > 0 && (
            <button
              type="button"
              onClick={() => navigate(`/trip/${trip.id}?tab=itinerary&section=transport`)}
              className="text-[9px] px-[7px] py-[2px] rounded-[10px] cursor-pointer hover:opacity-80 transition-opacity"
              style={{ background: "#E1F5EE", color: "#085041" }}
              data-testid={`pill-transport-${trip.id}`}
            >
              🚗 {totalLegs} leg{totalLegs !== 1 ? 's' : ''}
            </button>
          )}
          {advisor && (
            <button
              type="button"
              onClick={() => navigate(`/trip/${trip.id}?tab=expert`)}
              className="text-[9px] px-[7px] py-[2px] rounded-[10px] cursor-pointer hover:opacity-80 transition-opacity"
              style={{ background: "#EEEDFE", color: "#3C3489" }}
              data-testid={`pill-expert-${trip.id}`}
            >
              👥 Expert
            </button>
          )}
        </div>
      </div>

      {/* Advisor strip */}
      {advisor && (
        <Link href={`/trip/${trip.id}?tab=expert&section=suggestions`}>
          <div
            className="flex items-center gap-2.5 cursor-pointer hover:bg-[#F3F3EE] transition-colors"
            style={{ padding: "9px 14px", borderTop: "0.5px solid #E8E8E2" }}
            data-testid={`advisor-strip-${trip.id}`}
          >
            {advisor.profile_image_url ? (
              <img
                src={advisor.profile_image_url}
                alt={`${advisor.first_name} ${advisor.last_name}`}
                className="w-[26px] h-[26px] rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div
                className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-[9px] font-semibold flex-shrink-0"
                style={{ background: avatarColor.bg, color: avatarColor.text }}
              >
                {getInitials(`${advisor.first_name} ${advisor.last_name}`)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-medium" style={{ color: "#1A1A18" }}>
                {advisor.first_name} {advisor.last_name}
              </div>
              {advisor.status === "accepted" && expertMsgText && (
                <div className="text-[10px] truncate" style={{ color: "#7A7A72" }}>
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
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "#5DCAA5" }} />
              )
            )}
          </div>
        </Link>
      )}

      {/* Action items */}
      {actionItems.length > 0 && (
        <div className="rounded-lg" style={{ margin: "0 14px 10px", background: "#F3F3EE", padding: "7px 10px" }}>
          {actionItems.map((n, i) => (
            <div key={n.id ?? i} className="flex items-start gap-[5px] py-[2px]">
              <div
                className="w-[5px] h-[5px] rounded-full mt-[5px] flex-shrink-0"
                style={{ background: n.type === "urgent" || n.type === "alert" ? "#E24B4A" : "#EF9F27" }}
              />
              <span className="text-[10px] flex-1" style={{ color: "#1A1A18" }}>{n.title || n.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex gap-[7px]" style={{ padding: "0 14px 12px" }}>
        <button
          onClick={() => {
            const query = encodeURIComponent(trip.destination);
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
            if (isIOS) window.open(`maps://maps.apple.com/?q=${query}`, "_blank");
            else window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, "_blank");
          }}
          className="flex-none py-[7px] px-3 rounded-lg text-[11px] font-medium cursor-pointer hover:bg-[#F3F3EE] transition-colors"
          style={{ border: "0.5px solid #E8E8E2", background: "#FFFFFF", color: "#1A1A18" }}
          data-testid={`btn-maps-${trip.id}`}
        >
          📍 Maps
        </button>
        <Link href={`/trip/${trip.id}?tab=itinerary`} className="flex-1">
          <button
            className="w-full py-[7px] px-3 rounded-lg text-[11px] font-medium text-white cursor-pointer transition-colors"
            style={{ background: "#E85D55", border: "none" }}
            data-testid={`btn-itinerary-${trip.id}`}
          >
            📅 View itinerary ›
          </button>
        </Link>
      </div>
    </div>
  );
}

// ── Main PlanCard component ────────────────────────────────────────────────

export function PlanCard({ trip, score, index = 0, role = "owner", stage = "full", days: daysProp }: PlanCardProps) {
  const [selectedDay, setSelectedDay] = useState(0);
  const [section, setSection] = useState<"activities" | "transport">("activities");
  const [showChanges, setShowChanges] = useState(true);
  const [viewMode, setViewMode] = useState<"card" | "map">("card");
  const [confirming, setConfirming] = useState(false);
  const { toast } = useToast();
  const deleteTrip = useDeleteTrip();

  const handleDelete = () => {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
      return;
    }
    deleteTrip.mutate(trip.id);
  };

  const templateConfig = getTemplateConfig(trip.eventType);

  const handleOpenInMaps = () => {
    if (!trip.destination) return;
    openInMaps({ destination: { name: trip.destination } });
    toast({ title: "Opening Maps", description: trip.destination });
  };

  const { data: plancardData } = useQuery<PlanCardData>({
    queryKey: [`/api/trips/${trip.id}/plancard`],
    staleTime: 30000,
    enabled: !daysProp,
  });

  // Render summary stage (compact dashboard card)
  if (stage === "summary") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.06 }}
        data-testid={`card-plan-summary-${trip.id}`}
      >
        <PlanCardSummary trip={trip} index={index} plancardData={plancardData} />
      </motion.div>
    );
  }

  // Full stage – prefer externally-supplied days, then fall back to plancard API
  const days: PlanCardDay[] = daysProp ?? plancardData?.days ?? [];
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

  const isViewer = role === "viewer";
  const isOwner = role === "owner";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      data-testid={`card-plan-${trip.id}`}
      className="relative"
    >
      {isOwner && (
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
      )}

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

            {!isViewer && (
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
            )}

            {!isViewer && (
              <ChangeLogPanel
                tripId={trip.id}
                showChanges={showChanges}
                changeLog={changeLog}
              />
            )}

            {(section === "activities" || isViewer) && (
              <ActivitiesSection
                tripId={trip.id}
                day={day}
                templateConfig={templateConfig}
              />
            )}

            {section === "transport" && !transportLocked && !isViewer && (
              <TransportSection
                tripId={trip.id}
                tripDestination={trip.destination}
                day={day}
                allowActions={isOwner}
              />
            )}

            {isViewer && (
              <TransportSection
                tripId={trip.id}
                tripDestination={trip.destination}
                day={day}
                allowActions={false}
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

        {!isViewer && (
          <div className="px-5 pb-5 pt-2 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-shrink-0"
              onClick={handleOpenInMaps}
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
        )}
      </Card>
    </motion.div>
  );
}
