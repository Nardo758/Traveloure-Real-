import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calendar, ChevronRight, LayoutList, Map as MapIcon, MapPin, X, Lightbulb, Sparkles, Clock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useDeleteTrip } from "@/hooks/use-trips";
import { openInMaps } from "@/lib/navigate";
import { openMapsDeepLink } from "@/lib/maps";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";

// ── Summary-stage helpers ──────────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const then = new Date(dateStr);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks === 1) return "1 week ago";
  if (diffWeeks < 5) return `${diffWeeks} weeks ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return "1 month ago";
  return `${diffMonths} months ago`;
}

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

// ── Expert Polish Dialog ────────────────────────────────────────────────────

interface ExpertPolishDialogProps {
  open: boolean;
  onClose: () => void;
  trip: {
    id: string;
    destination: string;
    startDate?: string;
    endDate?: string;
    title?: string;
  };
  optimizationScore?: number | string;
  optimizationDelta?: {
    savings?: string | null;
    savingsPercent?: string | null;
    starDelta?: number | null;
  };
}

function buildDeltaSummary(
  score?: number | string,
  delta?: ExpertPolishDialogProps["optimizationDelta"]
): string {
  const parts: string[] = [];
  if (score != null) parts.push(`Optimization score: ${score}`);
  if (delta?.savings) parts.push(`Estimated savings: ${delta.savings}`);
  if (delta?.savingsPercent) parts.push(`Cost reduction: ${delta.savingsPercent}`);
  if (delta?.starDelta != null && delta.starDelta !== 0) {
    parts.push(`Star-rating delta: ${delta.starDelta > 0 ? "+" : ""}${delta.starDelta}`);
  }
  return parts.join(" · ");
}

function ExpertPolishDialog({ open, onClose, trip, optimizationScore, optimizationDelta }: ExpertPolishDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const deltaSummary = buildDeltaSummary(optimizationScore, optimizationDelta);
  const [note, setNote] = useState(deltaSummary);

  // Sync prefill when dialog opens
  useEffect(() => {
    if (open) setNote(buildDeltaSummary(optimizationScore, optimizationDelta));
  }, [open, optimizationScore, optimizationDelta]);

  const formatDate = (d?: string) =>
    d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "–";

  const mutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/expert-requests", {
        tripId: trip.id,
        destination: trip.destination,
        requestType: "polish",
        notes: note.trim() || null,
        optimizationContext: {
          destination: trip.destination,
          startDate: trip.startDate,
          endDate: trip.endDate,
          score: optimizationScore ?? null,
          delta: optimizationDelta ?? null,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/expert-requests`, trip.id] });
      toast({
        title: "Expert requested!",
        description: "We'll match you with a local expert shortly.",
      });
      onClose();
    },
    onError: (err: any) => {
      const msg = err?.message || "Failed to submit request";
      if (msg.includes("already exists")) {
        toast({
          title: "Already submitted",
          description: "A request is already pending for this trip.",
        });
        onClose();
      } else {
        toast({ title: "Something went wrong", description: msg, variant: "destructive" });
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md" data-testid="expert-polish-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            Have an expert polish this
          </DialogTitle>
          <DialogDescription>
            A local expert will review and refine your itinerary based on their on-the-ground knowledge.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-1">
          {/* Trip summary */}
          <div
            className="rounded-xl p-3 space-y-1 text-[13px]"
            style={{ background: "#F3F3EE" }}
          >
            <div className="font-medium" style={{ color: "#1A1A18" }}>
              {trip.title || trip.destination}
            </div>
            <div style={{ color: "#7A7A72" }}>
              📍 {trip.destination}
            </div>
            <div style={{ color: "#7A7A72" }}>
              🗓 {formatDate(trip.startDate)} – {formatDate(trip.endDate)}
            </div>
            {optimizationScore != null && (
              <div style={{ color: "#7A7A72" }}>
                ⭐ Optimization score: {optimizationScore}
              </div>
            )}
          </div>

          {/* Special requests */}
          <div className="space-y-1.5">
            <Label htmlFor="expert-polish-note" className="text-[13px]">
              Special requests (optional)
            </Label>
            <Textarea
              id="expert-polish-note"
              data-testid="input-expert-polish-note"
              placeholder="e.g. We prefer quiet neighbourhoods, avoid tourist traps, vegetarian dining…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="text-[13px] resize-none"
              rows={3}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1 text-[13px]"
              onClick={onClose}
              disabled={mutation.isPending}
              data-testid="btn-expert-polish-cancel"
            >
              Cancel
            </Button>
            <Button
              className="flex-1 text-[13px] text-white"
              style={{ background: "#E85D55" }}
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              data-testid="btn-expert-polish-confirm"
            >
              {mutation.isPending ? "Submitting…" : "Request an expert"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

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

interface ExpertRequest {
  id: string;
  status: string;
  trip_id?: string;
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
  const [showPolishDialog, setShowPolishDialog] = useState(false);
  const [, navigate] = useLocation();
  const deleteTrip = useDeleteTrip();

  const days: PlanCardDay[] = plancardData?.days || [];
  const stats = plancardData?.stats || {};
  const metrics = plancardData?.metrics || {};

  const totalActivities = stats.totalActivities ?? days.reduce((s, d) => s + (d.activities?.length ?? 0), 0);
  const totalLegs = stats.totalLegs ?? days.reduce((s, d) => s + (d.transports?.length ?? 0), 0);
  const totalMinutes = stats.totalTransitMinutes ?? days.reduce((s, d) => s + (d.transports ?? []).reduce((t, tr) => t + (tr.duration ?? 0), 0), 0);

  const optimizationDelta = plancardData?.optimizationDelta ?? null;
  const lastOptimizedAt = plancardData?.lastOptimizedAt ?? null;
  const numDays = days.length || Math.max(1, Math.round(
    (new Date(trip.endDate ?? Date.now()).getTime() - new Date(trip.startDate ?? Date.now()).getTime()) / 86400000
  ));

  const optimizationScore = metrics.traveloureScore || metrics.optimizationScore;
  const hasActivities = totalActivities > 0;

  // Summary-specific queries
  const { data: advisorData } = useQuery<{ advisor: SummaryAdvisor | null }>({
    queryKey: [`/api/trips/${trip.id}/expert-advisor`],
    staleTime: 60000,
  });
  const advisor = advisorData?.advisor ?? null;

  const { data: expertRequestsData } = useQuery<{ requests: ExpertRequest[] }>({
    queryKey: [`/api/expert-requests`, trip.id],
    queryFn: async () => {
      const res = await fetch(`/api/expert-requests?tripId=${trip.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch expert requests");
      return res.json();
    },
    staleTime: 60000,
    enabled: !advisor,
  });

  // Only treat admin-confirm states (queued / pending) as "pending review".
  // "assigned" means the expert is already working → let advisor strip take over.
  const pendingExpertRequest = expertRequestsData?.requests?.find(
    (r) => r.status === "queued" || r.status === "pending"
  ) ?? null;

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

  // Show "polish" CTA only when:
  // - user owns trip and has activities
  // - no expert already assigned
  // - no pending request already in flight
  const showPolishCta = hasActivities && !advisor && !pendingExpertRequest;

  return (
    <>
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
            {pendingExpertRequest && (
              <span
                className="text-[9px] font-semibold px-2.5 py-[3px] rounded-lg uppercase tracking-[0.4px] flex items-center gap-1"
                style={{ background: "rgba(255,255,255,0.25)" }}
                data-testid={`badge-expert-pending-${trip.id}`}
              >
                <Clock className="w-2.5 h-2.5" />
                Expert review pending
              </span>
            )}
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
            {lastOptimizedAt && (
              <button
                type="button"
                onClick={() => navigate(`/trip/${trip.id}?tab=itinerary`)}
                className="flex items-center gap-[3px] text-[9px] px-[7px] py-[2px] rounded-[10px] cursor-pointer hover:opacity-80 transition-opacity"
                style={{ background: "#FFF3E8", color: "#8B3A00" }}
                data-testid={`pill-ai-optimized-${trip.id}`}
                title="This itinerary was AI-optimized"
              >
                <Sparkles className="w-[9px] h-[9px]" />
                AI Optimized
                {optimizationDelta?.savings != null && (optimizationDelta.savings as number) > 0 && (
                  <span style={{ color: "#2C7A44", fontWeight: 600 }}>
                    · ${Math.round(optimizationDelta.savings as number)} saved
                  </span>
                )}
                {optimizationDelta?.starRatingDelta != null && (optimizationDelta.starRatingDelta as number) > 0 && (
                  <span style={{ color: "#B07C00", fontWeight: 600 }}>
                    · +{(optimizationDelta.starRatingDelta as number).toFixed(1)}★
                  </span>
                )}
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
              openMapsDeepLink({ places: [{ name: trip.destination }] });
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

        {/* Expert polish CTA */}
        {showPolishCta && (
          <div style={{ padding: "0 14px 12px", borderTop: "0.5px solid #E8E8E2", paddingTop: 10 }}>
            <button
              onClick={() => setShowPolishDialog(true)}
              className="w-full flex items-center justify-center gap-1.5 py-[7px] px-3 rounded-lg text-[11px] font-medium cursor-pointer hover:opacity-90 transition-opacity"
              style={{ background: "#FAEEDA", color: "#633806", border: "0.5px solid #F5D08A" }}
              data-testid={`btn-expert-polish-${trip.id}`}
            >
              <Sparkles className="w-3 h-3" />
              Have an expert polish this
            </button>
          </div>
        )}
      </div>

      <ExpertPolishDialog
        open={showPolishDialog}
        onClose={() => setShowPolishDialog(false)}
        trip={trip}
        optimizationScore={optimizationScore}
        optimizationDelta={optimizationDelta}
      />
    </>
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
  const optimizationDelta = plancardData?.optimizationDelta ?? null;
  const lastOptimizedAt = plancardData?.lastOptimizedAt ?? null;

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

        {lastOptimizedAt && (
          <div
            className="flex items-center gap-2 px-4 py-2 border-b border-border"
            style={{ background: "linear-gradient(90deg,#FFF8F0,#FFFBF5)" }}
            data-testid={`banner-ai-optimized-${trip.id}`}
          >
            <Sparkles className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#C05C00" }} />
            <span className="text-[11px] font-semibold" style={{ color: "#8B3A00" }}>
              AI Optimized
            </span>
            {optimizationDelta?.savings != null && optimizationDelta.savings > 0 && (
              <span
                className="text-[11px] font-semibold"
                style={{ color: "#2C7A44" }}
                data-testid={`text-ai-savings-${trip.id}`}
              >
                · ${Math.round(optimizationDelta.savings)} saved
              </span>
            )}
            {optimizationDelta?.starRatingDelta != null && optimizationDelta.starRatingDelta > 0 && (
              <span
                className="text-[11px] font-semibold"
                style={{ color: "#B07C00" }}
                data-testid={`text-ai-star-delta-${trip.id}`}
              >
                · +{optimizationDelta.starRatingDelta.toFixed(1)}★
              </span>
            )}
            <span className="ml-auto text-[10px]" style={{ color: "#B07C00" }}>
              {new Date(lastOptimizedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </span>
          </div>
        )}

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
                allowActions={role !== "viewer"}
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
