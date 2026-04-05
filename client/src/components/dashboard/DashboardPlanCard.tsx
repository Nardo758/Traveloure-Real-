import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Lightbulb, X } from "lucide-react";
import { useDeleteTrip } from "@/hooks/use-trips";

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
  transports?: Array<{ duration?: number; mode?: string }>;
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
  const [confirming, setConfirming] = useState(false);
  const deleteTrip = useDeleteTrip();

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

  const tripServiceBookings = serviceBookings?.filter((b: any) => b.tripId === trip.id) ?? [];
  const serviceBookingsCount = tripServiceBookings.length;

  const transportModes = days.flatMap(d => d.transports ?? []);
  const transportLegCount = transportModes.length;
  const effectiveTransportCount = transportLegCount || (plancardData?.stats?.totalLegs ?? 0);

  const daysTil = daysUntil(trip.startDate);
  const statusLabel = getStatusLabel(trip);
  const gradient = getStatusGradient(trip);
  const showCountdown = daysTil > 0;

  const tripTitle = trip.title || trip.destination;

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });

  const lastAssistantMsg = convWithMessages?.messages
    ? [...convWithMessages.messages]
        .filter(m => m.role === "assistant")
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    : null;

  const expertMsgText = lastAssistantMsg
    ? lastAssistantMsg.content.slice(0, 100) + (lastAssistantMsg.content.length > 100 ? "…" : "")
    : null;

  const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length];

  const handleServicesClick = () => navigate('/bookings');
  const handleTransportClick = () => navigate(`/trip/${trip.id}`);
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
      className="rounded-[14px] overflow-hidden"
      style={{ border: "0.5px solid #E8E8E2", background: "#FFFFFF" }}
      data-testid={`dashboard-plan-card-${trip.id}`}
    >
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
              confirming
                ? "bg-red-500 text-white scale-110"
                : "bg-white/20 text-white hover:bg-white/35"
            }`}
          >
            {confirming ? "?" : <X className="w-3.5 h-3.5" />}
          </button>
          {showCountdown && (
            <div className="text-right leading-none">
              <div className="text-[22px] font-medium leading-none">{daysTil}</div>
              <div className="text-[9px] opacity-70">days</div>
            </div>
          )}
        </div>

        <div className="text-[15px] font-medium mb-0.5 pr-[50px]">{tripTitle}</div>
        <div className="text-[11px] opacity-85">
          📍 {trip.destination} · {formatDate(trip.startDate)}–{formatDate(trip.endDate)}
        </div>
      </div>

      <div style={{ padding: "10px 14px" }}>
        <div className="flex text-center mb-2">
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
              className="flex-1 py-1"
              style={{ borderLeft: i > 0 ? "0.5px solid #E8E8E2" : "none" }}
            >
              <div className="text-[9px]" style={{ color: "#7A7A72", marginBottom: 1 }}>{s.label}</div>
              <div className="text-[14px] font-medium" style={{ color: "#1A1A18" }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-[5px] flex-wrap">
          {serviceBookingsCount > 0 && (
            <button
              type="button"
              onClick={handleServicesClick}
              className="text-[9px] px-[7px] py-[2px] rounded-[10px] cursor-pointer hover:opacity-80 transition-opacity"
              style={{ background: "#E6F1FB", color: "#0C447C" }}
              data-testid={`pill-services-${trip.id}`}
            >
              💼 {serviceBookingsCount} service{serviceBookingsCount !== 1 ? 's' : ''}
            </button>
          )}
          {effectiveTransportCount > 0 && (
            <button
              type="button"
              onClick={handleTransportClick}
              className="text-[9px] px-[7px] py-[2px] rounded-[10px] cursor-pointer hover:opacity-80 transition-opacity"
              style={{ background: "#E1F5EE", color: "#085041" }}
              data-testid={`pill-transport-${trip.id}`}
            >
              🚗 {effectiveTransportCount} leg{effectiveTransportCount !== 1 ? 's' : ''}
            </button>
          )}
          {advisor && (
            <button
              type="button"
              onClick={handleExpertClick}
              className="text-[9px] px-[7px] py-[2px] rounded-[10px] cursor-pointer hover:opacity-80 transition-opacity"
              style={{ background: "#EEEDFE", color: "#3C3489" }}
            >
              👥 Expert
            </button>
          )}
        </div>
      </div>

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
                alt={advisor.first_name + ' ' + advisor.last_name}
                className="w-[26px] h-[26px] rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div
                className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-[9px] font-semibold flex-shrink-0"
                style={{ background: avatarColor.bg, color: avatarColor.text }}
              >
                {getInitials(advisor.first_name + ' ' + advisor.last_name)}
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

      <div className="flex gap-[7px]" style={{ padding: "0 14px 12px" }}>
        <button
          onClick={() => openInMaps(trip.destination)}
          className="flex-none py-[7px] px-3 rounded-lg text-[11px] font-medium cursor-pointer hover:bg-[#F3F3EE] transition-colors"
          style={{ border: "0.5px solid #E8E8E2", background: "#FFFFFF", color: "#1A1A18" }}
          data-testid={`btn-maps-${trip.id}`}
        >
          📍 Maps
        </button>
        <Link href={`/itinerary/${trip.id}`} className="flex-1">
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
