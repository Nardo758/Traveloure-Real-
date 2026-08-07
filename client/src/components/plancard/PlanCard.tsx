import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calendar, ChevronRight, LayoutList, Map as MapIcon, MapPin, X, Check, Lightbulb, Sparkles, Clock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useDeleteTrip } from "@/hooks/use-trips";
import { openInMaps } from "@/lib/navigate";
import { openMapsDeepLink } from "@/lib/maps";
import { tripCardIsPrimary } from "@shared/trip-primary-surface";
import {
  getTemplateConfig, computeDayCount, type PlanCardProps, type PlanCardData, type PlanCardDay, type PlanCardChange, type PlanCardRole, type PlanCardLegData,
} from "./plancard-types";
import { HeroSection } from "./HeroSection";
import { OptimizerMetrics } from "./StatsRow";
import { DaySelector } from "./DaySelector";
import { SectionTabs } from "./SectionTabs";
import { ActivitiesSection } from "./ActivitiesSection";
import { TransportSection } from "./TransportSection";
import { EscalationCTA } from "./EscalationCTA";
import { PlanCardUpsellSlot } from "./PlanCardUpsellSlot";
import { PlanCardHeader } from "./PlanCardHeader";
import { ConciergeModule } from "./ConciergeModule";
import { MapControlCenter } from "./MapControlCenter";
import { UpNextHero } from "./UpNextHero";
import { CollapsedSections } from "./CollapsedSections";
import { BottomActionBar } from "./BottomActionBar";
import { PlanApprovalBanner } from "./PlanApprovalBanner";
import { ProposalColumn } from "./ProposalColumn";
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
  // Real server shape (shared/schema.ts `notifications.data` jsonb) — there is no
  // top-level `tripId` column; per-trip linkage lives inside `data`.
  data?: { tripId?: string | null } | null;
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

  const optimizationDeltaFromData = plancardData?.optimizationDelta ?? null;
  const lastOptimizedAt = plancardData?.lastOptimizedAt ?? null;
  const numDays = computeDayCount(days, trip.startDate, trip.endDate);

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
  // R-I(3): notifications carry no top-level `tripId` — the real value lives at
  // `data.tripId` (see server createNotification call sites, e.g. booking-actions.ts /
  // trips.routes.ts, which set `data: { tripId, ... }`). The old `n.tripId` filter never
  // matched, so per-trip action items never populated.
  const actionItems = (notificationsData ?? []).filter(n => n.data?.tripId === trip.id).slice(0, 2);

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
        className="rounded-[14px] overflow-hidden cursor-pointer"
        style={{ border: "0.5px solid #E8E8E2", background: "#FFFFFF" }}
        data-testid={`dashboard-plan-card-${trip.id}`}
        onClick={() => navigate(`/trip/${trip.id}?tab=itinerary`)}
      >
        {/* Shared header (summary↔full continuity) — redesign */}
        <PlanCardHeader
          title={tripTitle}
          destination={trip.destination}
          dateRange={`${formatShortDate(trip.startDate ?? "")}–${formatShortDate(trip.endDate ?? "")}`}
          statusLabel={statusLabel}
          metrics={{ days: numDays, activities: totalActivities, legs: totalLegs, transitTime: formatMinutes(totalMinutes) }}
          testId={`plancard-header-${trip.id}`}
          badges={pendingExpertRequest ? (
            <span
              className="inline-flex items-center gap-1 rounded-md bg-white/10 text-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              data-testid={`badge-expert-pending-${trip.id}`}
            >
              <Clock className="w-2.5 h-2.5" /> Expert review pending
            </span>
          ) : undefined}
          topRight={
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={handleDelete}
                disabled={deleteTrip.isPending}
                data-testid={`button-delete-plan-${trip.id}`}
                title={confirming ? "Click again to confirm delete" : "Remove this plan"}
                className={`w-6 h-6 flex items-center justify-center rounded-full transition-all ${
                  confirming ? "bg-red-500 text-white scale-110" : "bg-white/20 text-white hover:bg-white/35"
                }`}
              >
                {confirming ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
              </button>
              {showCountdown && (
                <div className="text-right leading-none">
                  <div className="text-[20px] font-semibold leading-none" data-testid={`text-countdown-${trip.id}`}>{daysTil}</div>
                  <div className="text-[9px] opacity-70">days</div>
                </div>
              )}
            </div>
          }
        />

        {/* Concierge — front and center (redesign) */}
        <div className="px-4 pt-3" onClick={(e) => e.stopPropagation()}>
          <ConciergeModule destination={trip.destination} testId={`concierge-module-summary-${trip.id}`} />
        </div>

        {/* Stats */}
        <div style={{ padding: "10px 14px" }}>
          {/* metric strip moved into PlanCardHeader (redesign) */}

          {/* Chips */}
          <div className="flex gap-[5px] flex-wrap">
            {serviceBookingsCount > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); navigate(`/trip/${trip.id}?tab=bookings`); }}
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
                onClick={(e) => { e.stopPropagation(); navigate(`/trip/${trip.id}?tab=itinerary&section=transport`); }}
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
                onClick={(e) => { e.stopPropagation(); navigate(`/trip/${trip.id}?tab=expert`); }}
                className="text-[9px] px-[7px] py-[2px] rounded-[10px] cursor-pointer hover:opacity-80 transition-opacity"
                style={{ background: "#EEEDFE", color: "#3C3489" }}
                data-testid={`pill-expert-${trip.id}`}
              >
                👥 Expert
              </button>
            )}
            {lastOptimizedAt && (() => {
              const isStale = Date.now() - new Date(lastOptimizedAt).getTime() > 30 * 24 * 60 * 60 * 1000;
              const formattedDate = new Date(lastOptimizedAt).toLocaleDateString(undefined, {
                month: "long",
                day: "numeric",
                year: "numeric",
              });
              const formattedTime = new Date(lastOptimizedAt).toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              });

              return (
                <Tooltip key="pill-ai-optimized">
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); navigate(`/trip/${trip.id}?tab=itinerary`); }}
                      className="flex items-center gap-[3px] text-[9px] px-[7px] py-[2px] rounded-[10px] cursor-pointer hover:opacity-80 transition-opacity"
                      style={
                        isStale
                          ? { background: "#FFFBEB", color: "#92400E", border: "1px solid #F59E0B" }
                          : { background: "#FFF3E8", color: "#8B3A00" }
                      }
                      data-testid={`pill-ai-optimized-${trip.id}`}
                    >
                      <Sparkles className="w-[9px] h-[9px]" style={isStale ? { color: "#D97706" } : undefined} />
                      {isStale ? "Re-optimize?" : "AI Optimized"}
                      {!isStale && optimizationDeltaFromData?.savings != null && (optimizationDeltaFromData.savings as number) > 0 && (
                        <span style={{ color: "#2C7A44", fontWeight: 600 }}>
                          · ${Math.round(optimizationDeltaFromData.savings as number)} saved
                        </span>
                      )}
                      {!isStale && optimizationDeltaFromData?.starRatingDelta != null && (optimizationDeltaFromData.starRatingDelta as number) > 0 && (
                        <span style={{ color: "#B07C00", fontWeight: 600 }}>
                          · +{(optimizationDeltaFromData.starRatingDelta as number).toFixed(1)}★
                        </span>
                      )}
                      <span style={{ color: isStale ? "#B45309" : "#A05A30", fontWeight: 400 }}>
                        · {formatRelativeTime(lastOptimizedAt)}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-[11px]">
                      Optimized on {formattedDate} at {formattedTime}
                      {isStale && (
                        <div className="text-amber-600 font-medium mt-0.5">
                          ⚠️ This optimization is over 30 days old
                        </div>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })()}
          </div>
        </div>

        {/* Advisor strip */}
        {advisor && (
          <Link href={`/trip/${trip.id}?tab=expert&section=suggestions`} onClick={(e) => e.stopPropagation()}>
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
                <div className="text-[10px] truncate" style={{ color: "#7A7A72" }}>
                  {advisor.status === "accepted" && expertMsgText
                    ? `"${expertMsgText}"`
                    : advisor.status === "accepted"
                    ? "Tap to connect with your expert"
                    : "Matching you with a local expert…"}
                </div>
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
            onClick={(e) => { e.stopPropagation(); openMapsDeepLink({ places: [{ name: trip.destination }] }); }}
            className="flex-none py-[7px] px-3 rounded-lg text-[11px] font-medium cursor-pointer hover:bg-[#F3F3EE] transition-colors"
            style={{ border: "0.5px solid #E8E8E2", background: "#FFFFFF", color: "#1A1A18" }}
            data-testid={`btn-maps-${trip.id}`}
          >
            📍 Maps
          </button>
          <Link
            href={`/trip/${trip.id}?tab=itinerary`}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 flex items-center justify-center gap-1.5 py-[7px] px-3 rounded-lg text-[11px] font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: "#E85D55" }}
            data-testid={`btn-itinerary-${trip.id}`}
          >
            <Calendar className="w-3 h-3 flex-shrink-0" />
            View itinerary
            <ChevronRight className="w-3 h-3 flex-shrink-0" />
          </Link>
        </div>

        {/* Expert polish CTA */}
        {showPolishCta && (
          <div style={{ padding: "0 14px 12px", borderTop: "0.5px solid #E8E8E2", paddingTop: 10 }}>
            <button
              onClick={(e) => { e.stopPropagation(); setShowPolishDialog(true); }}
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
        optimizationDelta={optimizationDeltaFromData}
      />
    </>
  );
}

// ── Main PlanCard component ────────────────────────────────────────────────

export function PlanCard({ trip, score, index = 0, role = "owner", stage = "full", days: daysProp, embedded = false, initialSelectedDay, proposal }: PlanCardProps) {
  // Mobile-lens audit #1: seed from the page's already-computed "today" index (when given)
  // so a mid-flight trip opens on today's day, not always Day 1 — the temporal engine
  // (Up Next / now-line / Live today) is already correct once the right day is showing.
  const [selectedDay, setSelectedDay] = useState(
    initialSelectedDay != null && initialSelectedDay >= 0 ? initialSelectedDay : 0
  );
  const [section, setSection] = useState<"activities" | "transport">("activities");
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
    // stage="proposal" renders entirely from the `proposal` prop (the page owns the canonical
    // reads) — a variant column must never fire a plancard fetch keyed on a non-trip id.
    enabled: !daysProp && stage !== "proposal",
  });

  // CLAUDE.md §18, item 3: the bottom action bar's "Message [expert]" slot needs to know
  // whether an ACCEPTED advisor exists (most trips today don't — audit §3). Same query key
  // trip-details.tsx already fetches, so React Query dedups this into one network call.
  const { data: advisorData } = useQuery<{ advisor: { status: "pending" | "accepted" | "rejected"; first_name?: string | null } | null }>({
    queryKey: [`/api/trips/${trip.id}/expert-advisor`],
    enabled: stage === "full" && !embedded,
    staleTime: 60000,
  });
  const advisor = advisorData?.advisor ?? null;

  // Spec C (SLIP_EXPERIENCE_DISPATCH §4): the variant-comparison column. Pure presentational
  // derivation of the `proposal` prop — no query of its own, no routing actions, apply-only.
  if (stage === "proposal") {
    return proposal ? <ProposalColumn proposal={proposal} /> : null;
  }

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

  // Map the day's transports into the leg shape the activities-view picker reads.
  // Ordered by legOrder so legs[i] is the connector after activity i.
  // Typed as PlanCardLegData (superset of InlineTransportLegData) so the mode-aware
  // primary action's forward-compat booking fields (§18 item 5) survive this mapping
  // instead of being silently dropped — presence-guarded, currently always undefined
  // (known gap, see plancard-mobile-lens-jul30.md §2 / primary-action.ts).
  const dayLegs: PlanCardLegData[] = (day?.transports ?? [])
    .map((tr, i) => ({
      id: tr.id,
      legOrder: tr.legOrder ?? i,
      fromName: tr.fromName ?? tr.from,
      toName: tr.toName ?? tr.to,
      recommendedMode: tr.recommendedMode ?? tr.mode,
      userSelectedMode: tr.userSelectedMode ?? null,
      distanceDisplay: tr.distanceDisplay ?? "",
      estimatedDurationMinutes: tr.estimatedDurationMinutes ?? tr.duration ?? 0,
      estimatedCostUsd: tr.estimatedCostUsd ?? tr.cost ?? null,
      // Pre-existing type gap (present before this change too, not introduced here):
      // PlanCardTransport.alternativeModes' energyCost/reason are optional, but
      // TransportAlternative declares them required — default them so the object
      // literal actually satisfies the target type instead of merely widening past it.
      alternativeModes: tr.alternativeModes?.map((m) => ({
        mode: m.mode,
        durationMinutes: m.durationMinutes,
        costUsd: m.costUsd,
        energyCost: m.energyCost ?? 0,
        reason: m.reason ?? "",
      })),
      fromLat: tr.fromLat ?? null,
      fromLng: tr.fromLng ?? null,
      toLat: tr.toLat ?? null,
      toLng: tr.toLng ?? null,
      mapsUrl: tr.mapsUrl ?? null,
      mode: tr.mode,
      pickupPoint: tr.pickupPoint ?? null,
      pickupTime: tr.pickupTime ?? null,
      driverPhone: tr.driverPhone ?? null,
      rideDetails: tr.rideDetails ?? null,
      // §16 closure: never forward a raw URL from stored itineraryData — the CTA is gated
      // on a server-minted vault token only (not populated today; KNOWN GAP unchanged).
      bookingToken: (tr as any).bookingToken ?? null,
    }))
    .sort((a, b) => a.legOrder - b.legOrder);

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

  const effectiveRole: PlanCardRole = plancardData?.tripRole ?? role ?? "viewer";
  const isViewer = effectiveRole === "viewer" || effectiveRole === "friend";
  const isOwner = effectiveRole === "owner";
  // W7 expert-return edge (routing.routes.ts): the trip's assigned expert gets the ONE
  // with_expert → in_planning write; ActivitiesSection/RoutingActions enforce the rest.
  const isExpertViewer = effectiveRole === "expert";

  // QA_PUNCH_LIST item 13 (ratified Aug 1 "ok sounds good") — the dress flip. The mode-flip
  // (expert direct-edit → suggest-mode) is already enforced server-side
  // (server/utils/plan-approval.ts::isPlanApprovedForExpert, migration 164); this is its visual
  // counterpart: once the customer has approved the delivered plan, the card should read as the
  // polished final Trip Card rather than the in-progress planning object. Also fires once R-F's
  // finalized-primacy rule fires (shared/trip-primary-surface.ts — finalizedAt ∨ T-48h window ∨
  // underway), the SAME rule SlipView's "Your Trip Card is ready" banner uses, so a trip that
  // reaches primary-surface status without ever routing through an expert (no advisor, so no
  // planApproval row) still gets the finished treatment once it's for-real live. `plancardData`
  // is this component's own DTO fetch (not the page-supplied `trip` prop), so this degrades to
  // false — the unchanged "in planning" look — whenever planApproval/finalizedAt are absent
  // (loading, no advisor, still drafting). Gated on `!!plancardData` (not just on the two derived
  // fields being falsy) so the shared/public itinerary-view.tsx render — which supplies its own
  // static `days` prop and therefore, by this component's existing `enabled: !daysProp &&
  // stage !== "proposal"` query guard, NEVER fetches this DTO — can never flip finalDress from
  // trip.startDate/endDate alone (tripCardIsPrimary's T-48h/underway arms are otherwise date-only
  // and would fire on a share link with no live approval data behind it at all). Suppressed in
  // the Workstation embed — that's the expert's own working view of the build, not the
  // customer's finished surface.
  const planApproval = plancardData?.meta?.planApproval;
  const planApproved = planApproval?.status === "approved";
  const finalizedPrimary = tripCardIsPrimary({
    finalizedAt: plancardData?.trip?.finalizedAt,
    startDate: trip.startDate,
    endDate: trip.endDate,
  });
  const finalDress = !embedded && !!plancardData && (planApproved || finalizedPrimary);

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
          {confirming ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
        </button>
      )}

      {/* CLAUDE.md §18 item 1: overflow-clip (not overflow-hidden) — clips rounded corners
          identically but does NOT establish a scroll container for sticky-positioning
          purposes, so the sticky day switcher below sticks relative to the page's real
          scrolling ancestor (DashboardLayout's <main>) instead of silently no-opping. */}
      <Card
        className={`overflow-clip transition-all duration-300 group bg-card ${
          finalDress
            ? "border-2 border-[#2C7A44]/30 shadow-sm"
            : "border border-border hover:shadow-xl"
        }`}
        data-testid={finalDress ? "plancard-final-dress" : undefined}
      >
        <HeroSection
          trip={trip}
          traveloureScore={traveloureScore}
          shareToken={shareToken}
          totalCost={totalCostDisplay}
          perPerson={perPersonDisplay}
          budget={budgetDisplay}
          days={days}
          totalActivities={totalActivities}
          totalLegs={totalLegs}
          totalMinutes={totalMinutes}
          statsLabels={templateConfig.statsLabels}
          finalDress={finalDress}
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

        {/* Plan-approval delivery handshake (migration 164, CLAUDE.md §18 / QA_PUNCH_LIST W2-A
            items 11+13) — owner-only, suppressed in the Workstation embed (that's the expert's
            OWN view of their build, not the customer's sign-off surface). */}
        {!embedded && isOwner && (
          <PlanApprovalBanner tripId={trip.id} planApproval={plancardData?.meta?.planApproval} />
        )}

        {/* Concierge — front and center for TRAVELERS; suppressed in the Workstation embed
            (a hire-an-expert module shown to the expert is duplicate/contradictory chrome). */}
        {!embedded && (
          <div className="px-3 sm:px-5 pt-2.5">
            <ConciergeModule destination={trip.destination} testId={`concierge-module-full-${trip.id}`} />
          </div>
        )}

        {/* View toggle suppressed in the Workstation embed — the builder has its own Map tab
            (same MapControlCenter), so the card stays in card view there. */}
        {!embedded && (
        <div className="px-3 sm:px-5 pt-2 flex gap-1.5" data-testid={`view-mode-toggle-${trip.id}`}>
          <Button
            onClick={() => setViewMode("card")}
            variant={viewMode === "card" ? "default" : "secondary"}
            size="sm"
            className="flex-1 text-xs min-h-11"
            data-testid={`btn-card-view-${trip.id}`}
          >
            <LayoutList className="w-3.5 h-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">Card View</span>
          </Button>
          <Button
            onClick={() => setViewMode("map")}
            variant={viewMode === "map" ? "default" : "secondary"}
            size="sm"
            className="flex-1 text-xs min-h-11"
            data-testid={`btn-map-view-${trip.id}`}
          >
            <MapIcon className="w-3.5 h-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">Map View</span>
          </Button>
        </div>
        )}

        {(embedded || viewMode === "card") ? (
          <>
            {/* metric strip moved onto the photo hero (redesign Phase 2, option C) */}

            {!embedded && (
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
            )}

            {/* CLAUDE.md §18 item 1 — sticky day switcher: "day chips pinned while the
                day's list scrolls." The page's real scrolling ancestor at mobile widths
                turns out to be the DashboardLayout <main> (outside this component's
                scope) — but per the CSS spec ANY ancestor whose `overflow` isn't
                `visible` becomes the sticky reference frame, and `main` never actually
                develops internal scrollable overflow (its flex parent uses
                `min-h-screen`, not `h-screen`, so `main` just grows with content instead
                of clipping it) — so a plain `position: sticky` there silently never
                "sticks" against real window scroll. Fix, entirely within this component:
                give the day list ITS OWN bounded, genuinely-scrolling box at mobile
                (`overflow-y-auto` + `max-h`) so the sticky header has a real local
                scroll container to pin against, sidestepping the ancestor issue without
                touching dashboard-layout.tsx (out of scope). At sm+ this wrapper is
                `display: contents` — it disappears from the box model entirely, so
                desktop's existing DOM/layout (non-sticky DaySelector + the separate
                360px activities box below) is pixel-identical to before. */}
            <div
              className="flex flex-col overflow-y-auto max-h-[64vh] sm:contents"
              data-testid={`mobile-day-scroll-${trip.id}`}
            >
              <div className="sticky top-0 z-20 bg-card sm:static sm:z-auto sm:bg-transparent">
                <DaySelector
                  tripId={trip.id}
                  days={days}
                  selectedDay={selectedDay}
                  onSelectDay={setSelectedDay}
                />
              </div>

              {/* CLAUDE.md §18 item 2 — "Up Next" hero, mobile-only (component self-hides
                  at sm+ and also renders nothing when the selected day isn't
                  live/upcoming — §13). */}
              {!embedded && <UpNextHero tripId={trip.id} day={day} legs={dayLegs} />}

              <SectionTabs
                tripId={trip.id}
                section={section}
                onSetSection={setSection}
                templateConfig={templateConfig}
                dayActivityCount={day?.activities?.length || 0}
                dayTransportCount={day?.transports?.length || 0}
                confirmedActivities={confirmedActivities}
                totalActivities={totalActivities}
                transportLocked={transportLocked}
              />

              {/* CLAUDE.md §18 item 1 (cont.): capped/scrollable box only at sm+ (desktop's
                  existing compact card view, unchanged); at mobile this div is plain flow
                  — the OUTER wrapper above is what scrolls now. */}
              <div className="overflow-visible sm:max-h-[360px] sm:overflow-y-auto scrollbar-hide">
                {section === "activities" && (
                  <ActivitiesSection
                    tripId={trip.id}
                    day={day}
                    templateConfig={templateConfig}
                    legs={dayLegs}
                    isOwner={isOwner}
                    isExpertViewer={isExpertViewer}
                  />
                )}

                {section === "transport" && !transportLocked && (
                  <TransportSection
                    tripId={trip.id}
                    tripDestination={trip.destination}
                    day={day}
                    allowActions={!isViewer}
                  />
                )}
              </div>
            </div>

            {/* CLAUDE.md §18 item 4 — Map preview / Transport / Budget / Change history /
                trip-level expert note, collapsed-by-default, below the day list. */}
            <CollapsedSections
              tripId={trip.id}
              tripDestination={trip.destination}
              day={day}
              changeLog={changeLog}
              isViewer={isViewer}
              allowTransportActions={!isViewer}
              totalCostNum={metrics.totalCost}
              budgetNum={trip.budget != null ? Number(trip.budget) : null}
              perPersonDisplay={perPersonDisplay}
              days={days}
              bookings={plancardData?.bookings}
            />

            {/* Upsell ontrip slot — live "near you" nudge, after content per mockup v3. Self-guards to in-trip window.
                Suppressed in the Workstation embed — traveler upsells don't belong in the builder. */}
            {!isViewer && !embedded && stage === "full" && (
              <PlanCardUpsellSlot
                tripId={trip.id}
                eventType={(trip as any).eventType}
                startDate={trip.startDate}
                endDate={trip.endDate}
                surface="plancard_ontrip"
              />
            )}

            {/* Upsell pretrip slot — "what's missing" gap-fill, after content per mockup v3.
                Self-guards to the pre-trip window; renders nothing otherwise/when empty. */}
            {!isViewer && !embedded && stage === "full" && (
              <PlanCardUpsellSlot
                tripId={trip.id}
                eventType={(trip as any).eventType}
                startDate={trip.startDate}
                endDate={trip.endDate}
                surface="plancard_pretrip"
              />
            )}

            {/* CON-A.P7 / N3: expert-escalation CTA — after content, before bottom bar (mockup v3).
                Suppressed in the Workstation embed — the expert IS the expert. */}
            {!isViewer && !embedded && stage === "full" && (
              <div className="px-3 sm:px-5 pt-2">
                <EscalationCTA
                  tripId={trip.id}
                  destination={trip.destination}
                  eventType={(trip as any).eventType}
                  planSnapshot={{
                    days: days.map(d => ({
                      day: d.dayNum,
                      date: d.date,
                      activityCount: d.activities?.length ?? 0,
                    })),
                    totalActivities,
                    totalCost: totalCostDisplay,
                  }}
                />
              </div>
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
          // Desktop-only now — CLAUDE.md §18 item 3's BottomActionBar below covers the
          // same Maps action (plus Message/Get-help + Share) at mobile widths.
          <div className="hidden sm:flex px-3 sm:px-5 pb-4 pt-2 gap-2">
            {/* Mobile-lens audit #9: the "View Itinerary" button that used to sit here linked to
                /itinerary/:id, which redirects straight back to this same /trip/:id?tab=itinerary
                page — a no-op button. Removed rather than repointed: this full-stage card IS the
                itinerary view, so there's nothing additive to send the traveler to from here. */}
            <Button
              variant="outline"
              size="sm"
              className="flex-shrink-0 min-h-11"
              onClick={handleOpenInMaps}
              data-testid={`button-open-maps-${trip.id}`}
            >
              <MapPin className="w-3.5 h-3.5 mr-1" />
              Maps
            </Button>
            {/* Concierge promoted to the front-and-center ConciergeModule above (redesign Phase 2) */}
          </div>
        )}

        {/* Fixed-position spacer: BottomActionBar below is `position: fixed`, so it
            overlays whatever's at the bottom of the viewport — this keeps the card's own
            last section (upsells/escalation CTA) from being hidden under it. */}
        {!embedded && <div className="sm:hidden h-16" aria-hidden="true" />}

        {/* CLAUDE.md §18 item 3 — sticky bottom action bar, mobile viewports only. */}
        {!embedded && (
          <BottomActionBar
            tripId={trip.id}
            destination={trip.destination}
            shareToken={shareToken}
            advisor={advisor}
          />
        )}
      </Card>
    </motion.div>
  );
}
