import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { MapPin, Calendar, UserCheck, Clock, Car, Users, Briefcase, Lightbulb } from "lucide-react";

interface Trip {
  id: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: string;
  title?: string | null;
  experienceType?: string | null;
  eventType?: string | null;
  numberOfTravelers?: number;
}

interface PlanCardData {
  days: DayData[];
  stats: {
    totalActivities: number;
    totalLegs: number;
    totalTransitMinutes: number;
    confirmedActivities?: number;
    pendingExpertChanges?: number;
  };
}

interface DayData {
  activities?: Array<{ status?: string }>;
  transports?: Array<{ duration?: number }>;
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
  userId?: string | null;
  createdAt: string;
  messages: ConversationMessage[];
}

interface Notification {
  id: string | number;
  title?: string;
  message?: string;
  type?: string;
  createdAt?: string;
  tripId?: string | null;
  read?: boolean;
}

interface ExpertAdvisor {
  advisor_id: string;
  status: "pending" | "accepted" | "rejected";
  first_name: string;
  last_name: string;
  profile_image_url: string | null;
}

function daysUntil(dateStr: string): number {
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

function openInMaps(destination: string) {
  const query = encodeURIComponent(destination);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (isIOS) {
    window.open(`maps://maps.apple.com/?q=${query}`, "_blank");
  } else {
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, "_blank");
  }
}

function getStatusGradient(trip: Trip): string {
  const daysTil = daysUntil(trip.startDate);
  if (daysTil > 0 && daysTil <= 90) {
    return "linear-gradient(135deg,#D85A30,#F0997B)";
  }
  return "linear-gradient(135deg,#E85D55,#F4A29C)";
}

function getStatusLabel(trip: Trip): string {
  const now = new Date();
  const start = new Date(trip.startDate);
  const end = new Date(trip.endDate);
  if (now >= start && now <= end) return "Active";
  if (now < start) {
    const days = daysUntil(trip.startDate);
    return days <= 7 ? "Soon" : "Upcoming";
  }
  if (trip.status) return trip.status.charAt(0).toUpperCase() + trip.status.slice(1);
  return "Planning";
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map(p => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const AVATAR_COLORS: Array<{ bg: string; text: string }> = [
  { bg: "#E8B339", text: "#412402" },
  { bg: "#B5D4F4", text: "#0C447C" },
  { bg: "#CECBF6", text: "#3C3489" },
  { bg: "#9FE1CB", text: "#04342C" },
  { bg: "#F4C0D1", text: "#72243E" },
];

function findMatchedConversationId(
  trip: Trip,
  conversations: Array<{ id: number; title: string }>
): number | null {
  const destKey = trip.destination?.split(",")[0]?.toLowerCase().trim();
  const titleKey = trip.title?.toLowerCase().trim();
  if (!conversations.length) return null;

  const match = conversations.find(c => {
    const cTitle = c.title.toLowerCase();
    return (
      (destKey && cTitle.includes(destKey)) ||
      (titleKey && cTitle.includes(titleKey))
    );
  });
  return match?.id ?? null;
}

export function DashboardPlanCard({
  trip,
  index,
  conversations,
  notifications,
}: {
  trip: Trip;
  index: number;
  conversations: Array<{ id: number; title: string }>;
  notifications: Notification[];
}) {
  const { data: plancardData } = useQuery<PlanCardData>({
    queryKey: [`/api/trips/${trip.id}/plancard`],
    staleTime: 30000,
  });

  const { data: advisorData } = useQuery<{ advisor: ExpertAdvisor | null }>({
    queryKey: [`/api/trips/${trip.id}/expert-advisor`],
    staleTime: 60000,
  });
  const advisor = advisorData?.advisor ?? null;

  const { data: serviceBookings } = useQuery<any[]>({
    queryKey: ['/api/service-bookings'],
    staleTime: 60000,
  });

  const { data: suggestionsData } = useQuery<{ suggestions: Array<{ id: string; status: string }> }>({
    queryKey: [`/api/trips/${trip.id}/suggestions`],
    enabled: !!advisor,
    staleTime: 60000,
  });
  const pendingSuggestions = suggestionsData?.suggestions?.filter(s => s.status === "pending").length ?? 0;

  const matchedConvId = findMatchedConversationId(trip, conversations);
  const [, navigate] = useLocation();

  const { data: convWithMessages } = useQuery<ConversationWithMessages>({
    queryKey: [`/api/conversations/${matchedConvId}`],
    enabled: matchedConvId !== null,
    staleTime: 60000,
  });

  const days: DayData[] = plancardData?.days ?? [];
  const totalActivities =
    plancardData?.stats?.totalActivities ??
    days.reduce((s, d) => s + (d.activities?.length ?? 0), 0);
  const totalLegs =
    plancardData?.stats?.totalLegs ??
    days.reduce((s, d) => s + (d.transports?.length ?? 0), 0);
  const totalMinutes =
    plancardData?.stats?.totalTransitMinutes ??
    days.reduce(
      (s, d) =>
        s + (d.transports ?? []).reduce((t, tr) => t + (tr.duration ?? 0), 0),
      0
    );
  const numDays =
    days.length ||
    Math.max(
      1,
      Math.round(
        (new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) /
          86400000
      )
    );

  // Service bookings count
  const tripServiceBookings = serviceBookings?.filter((b: any) => b.tripId === trip.id) ?? [];
  const serviceBookingsCount = tripServiceBookings.length;

  // Transport mode breakdown
  const transportModes = days.flatMap(d => d.transports ?? []);
  const privateTransportCount = transportModes.filter(t => 
    t.mode && (t.mode.includes('car') || t.mode.includes('private') || t.mode.includes('taxi') || t.mode.includes('rideshare'))
  ).length;

  const daysTil = daysUntil(trip.startDate);
  const statusLabel = getStatusLabel(trip);
  const gradient = getStatusGradient(trip);
  const showCountdown = daysTil > 0;

  const tripTitle = trip.title || trip.destination;

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  const lastAssistantMsg = convWithMessages?.messages
    ? [...convWithMessages.messages]
        .filter(m => m.role === "assistant")
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    : null;

  const expertMsgText = lastAssistantMsg
    ? lastAssistantMsg.content.slice(0, 120) + (lastAssistantMsg.content.length > 120 ? "…" : "")
    : null;

  const expertName = convWithMessages
    ? convWithMessages.title
        .replace(/chat with /i, "")
        .replace(/conversation with /i, "")
        .trim()
    : null;

  const initials = expertName ? getInitials(expertName) : null;
  const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length];

  // Click handlers for pills
  const handleServicesClick = () => {
    navigate('/bookings');
  };
  const handleTransportClick = () => {
    navigate(`/trip/${trip.id}`);
  };
  const handleExpertClick = () => {
    if (matchedConvId) {
      navigate(`/chat?conversation=${matchedConvId}`);
    } else {
      navigate('/chat');
    }
  };

  const actionItems = notifications
    .filter(n => n.tripId === trip.id)
    .sort((a, b) =>
      new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
    )
    .slice(0, 2);

  return (
    <div
      className="rounded-[14px] overflow-hidden bg-card border border-border border-[0.5px] hover:shadow-md transition-shadow"
      data-testid={`dashboard-plan-card-${trip.id}`}
    >
      <div className="relative p-3.5 pb-3 text-white" style={{ background: gradient }}>
        <div className="flex items-center justify-between mb-2">
          <span
            className="text-[10px] font-medium px-2.5 py-0.5 rounded-full uppercase tracking-[0.5px] bg-white/25"
            data-testid={`status-pill-${trip.id}`}
          >
            {statusLabel}
          </span>
          <div className="flex gap-2">
            <button className="text-[11px] opacity-85 hover:opacity-100">Share</button>
            <button className="text-[11px] opacity-85 hover:opacity-100">Export</button>
          </div>
        </div>

        {showCountdown && (
          <div className="absolute top-3.5 right-4 text-right">
            <div className="text-[24px] font-medium leading-none">{daysTil}</div>
            <div className="text-[10px] opacity-70">days</div>
          </div>
        )}

        <div className="text-[16px] font-medium mb-0.5 pr-16">{tripTitle}</div>
        <div className="text-[12px] opacity-85 flex items-center gap-1">
          <MapPin className="w-3 h-3" />
          {trip.destination} &middot; {formatDate(trip.startDate)} – {formatDate(trip.endDate)}
        </div>
      </div>

      <div className="px-4 py-3">
        <div className="flex text-center mb-2.5">
          {(
            [
              { label: "Days", value: numDays },
              { label: "Activities", value: totalActivities },
              { label: "Transit legs", value: totalLegs },
              { label: "Transit time", value: formatMinutes(totalMinutes) },
            ] as const
          ).map((s, i) => (
            <div
              key={i}
              className={`flex-1 py-1.5 ${i > 0 ? "border-l border-border" : ""}`}
            >
              <div className="text-[10px] text-muted-foreground mb-0.5">{s.label}</div>
              <div className="text-[15px] font-medium text-foreground">{s.value}</div>
            </div>
          ))}
        </div>
        
        {(serviceBookingsCount > 0 || privateTransportCount > 0 || advisor) && (
          <div className="flex items-center gap-2 mt-2">
            {serviceBookingsCount > 0 && (
              <button
                type="button"
                onClick={handleServicesClick}
                className="flex items-center gap-1 text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full cursor-pointer hover:opacity-80 transition-opacity"
              >
                <Briefcase className="w-3 h-3" />
                {serviceBookingsCount} service{serviceBookingsCount !== 1 ? 's' : ''}
              </button>
            )}
            {privateTransportCount > 0 && (
              <button
                type="button"
                onClick={handleTransportClick}
                className="flex items-center gap-1 text-[10px] bg-green-50 text-green-700 px-2 py-0.5 rounded-full cursor-pointer hover:opacity-80 transition-opacity"
              >
                <Car className="w-3 h-3" />
                Private x{privateTransportCount}
              </button>
            )}
            {advisor && (
              <button
                type="button"
                onClick={handleExpertClick}
                className="flex items-center gap-1 text-[10px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full cursor-pointer hover:opacity-80 transition-opacity"
              >
                <Users className="w-3 h-3" />
                Expert
              </button>
            )}
          </div>
        )}
      </div>

      {advisor && (
        <Link href={`/trip/${trip.id}?tab=expert&section=suggestions`}>
          <div
            className="flex items-center gap-2.5 px-4 py-2.5 border-t border-border border-t-[0.5px] cursor-pointer hover:bg-muted/30 transition-colors"
            data-testid={`advisor-strip-${trip.id}`}
          >
            {advisor.profile_image_url ? (
              <img
                src={advisor.profile_image_url}
                alt={advisor.first_name + ' ' + advisor.last_name}
                className="w-7 h-7 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-medium flex-shrink-0"
                style={{ background: avatarColor.bg, color: avatarColor.text }}
              >
                {getInitials(advisor.first_name + ' ' + advisor.last_name)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-medium text-foreground">
                {advisor.first_name} {advisor.last_name}
              </div>
              <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                {advisor.status === "accepted" ? (
                  <>
                    <UserCheck className="w-2.5 h-2.5 text-[#2E8B8B]" />
                    Expert assigned
                  </>
                ) : (
                  <>
                    <Clock className="w-2.5 h-2.5" />
                    Request pending
                  </>
                )}
              </div>
              {advisor.status === "accepted" && expertMsgText && (
                <div className="text-[10px] text-muted-foreground truncate mt-0.5">{expertMsgText}</div>
              )}
            </div>
            {pendingSuggestions > 0 ? (
              <div
                className="flex items-center gap-1 text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full flex-shrink-0"
                data-testid={`badge-suggestions-${trip.id}`}
              >
                <Lightbulb className="w-2.5 h-2.5" />
                {pendingSuggestions}
              </div>
            ) : (
              <div
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${advisor.status === "accepted" ? "bg-[#2E8B8B]" : "bg-amber-400"}`}
              />
            )}
          </div>
        </Link>
      )}

      {!advisor && expertMsgText && initials && (
        <div
          className="flex items-center gap-2.5 px-4 py-2.5 border-t border-border border-t-[0.5px]"
          data-testid={`expert-msg-${trip.id}`}
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-medium flex-shrink-0"
            style={{ background: avatarColor.bg, color: avatarColor.text }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            {expertName && (
              <div className="text-[11px] font-medium text-foreground">{expertName}</div>
            )}
            <div className="text-[11px] text-muted-foreground truncate">{expertMsgText}</div>
          </div>
          <div className="w-1.5 h-1.5 rounded-full bg-[#2E8B8B] flex-shrink-0" />
        </div>
      )}

      {actionItems.length > 0 && (
        <div className="mx-4 mb-3 rounded-lg bg-muted/50 px-3 py-2 space-y-1.5">
          {actionItems.map((n, i) => (
            <div key={n.id ?? i} className="flex items-start gap-1.5">
              <div
                className={`w-1.5 h-1.5 rounded-full mt-[5px] flex-shrink-0 ${
                  n.type === "urgent" || n.type === "alert" ? "bg-[#E24B4A]" : "bg-[#EF9F27]"
                }`}
              />
              <span className="text-[11px] text-foreground flex-1">{n.title || n.message}</span>
              <span className="text-[10px] text-muted-foreground flex-shrink-0">
                {n.createdAt
                  ? new Date(n.createdAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })
                  : "New"}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 px-4 pb-3 pt-1">
        <button
          onClick={() => openInMaps(trip.destination)}
          className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-[12px] font-medium bg-card text-foreground hover:bg-muted transition-colors border border-border border-[0.5px]"
          data-testid={`btn-maps-${trip.id}`}
        >
          <MapPin className="w-3.5 h-3.5" />
          Maps
        </button>
        <Link href={`/itinerary/${trip.id}`} className="flex-1">
          <button
            className="w-full flex items-center justify-center gap-1 py-2 rounded-lg text-[12px] font-medium text-white transition-colors bg-[#E85D55] hover:bg-[#D85A30] border border-[#E85D55]"
            data-testid={`btn-itinerary-${trip.id}`}
          >
            <Calendar className="w-3.5 h-3.5" />
            View itinerary &rsaquo;
          </button>
        </Link>
      </div>
    </div>
  );
}
