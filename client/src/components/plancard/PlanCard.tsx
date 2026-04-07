import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useDeleteTrip } from "@/hooks/use-trips";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Calendar, ChevronRight, Clock, MapPin, Users, Share2, Download,
  Zap, Star, LayoutList, Map, CheckCircle2, History,
  Route, MessageSquare, Lightbulb, ChevronDown, ChevronUp,
  Check, X, Footprints, Car, TrainFront, Heart, TrendingDown,
  Navigation, ExternalLink, Ship, Bus, Train, CarTaxiFront,
  KeyRound, Repeat,
} from "lucide-react";
import { differenceInDays, format } from "date-fns";
import type {
  PlanCardProps, PlanCardData, PlanCardDay, PlanCardChange,
  PlanCardTrip, PlanCardTransport, PlanCardActivity,
} from "./plancard-types";
import {
  TYPE_COLORS, STATUS_STYLES, MODE_COLORS, MODE_LABELS,
  DAY_COLORS, CHANGE_DOT_COLORS, formatDuration, ModeIcon,
  getDestinationPhotoUrl,
} from "./plancard-types";

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
  status: "pending" | "approved" | "rejected";
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
  if (!conversations?.length) return null;
  const dest = tripDestination?.toLowerCase().trim();
  const title = tripTitle?.toLowerCase().trim();
  const match = conversations.find(c => {
    const ct = c.title.toLowerCase();
    if (title && ct.includes(title)) return true;
    if (dest && ct.includes(dest)) return true;
    return false;
  });
  return match?.id ?? null;
}

function buildMapsUrl(location: string, lat?: number, lng?: number) {
  if (lat && lng) return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(location)}`;
}

function buildAppleMapsUrl(location: string, lat?: number, lng?: number) {
  if (lat && lng) return `https://maps.apple.com/?daddr=${lat},${lng}`;
  return `https://maps.apple.com/?daddr=${encodeURIComponent(location)}`;
}

function buildWazeUrl(lat?: number, lng?: number) {
  if (lat && lng) return `https://www.waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  return null;
}

function NavigateDropdown({ location, lat, lng }: { location: string; lat?: number; lng?: number }) {
  const [open, setOpen] = useState(false);
  const wazeUrl = buildWazeUrl(lat, lng);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-2 py-1 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors"
        data-testid="navigate-button"
      >
        <Navigation className="w-3 h-3" /> Navigate
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-card border border-border rounded-xl shadow-xl py-1.5 w-44">
            <a href={buildMapsUrl(location, lat, lng)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted text-[12px] text-foreground font-medium">
              <div className="w-5 h-5 rounded bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center"><MapPin className="w-3 h-3 text-blue-600" /></div>
              Google Maps
              <ExternalLink className="w-3 h-3 text-muted-foreground ml-auto" />
            </a>
            <a href={buildAppleMapsUrl(location, lat, lng)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted text-[12px] text-foreground font-medium">
              <div className="w-5 h-5 rounded bg-muted flex items-center justify-center"><Map className="w-3 h-3 text-muted-foreground" /></div>
              Apple Maps
              <ExternalLink className="w-3 h-3 text-muted-foreground ml-auto" />
            </a>
            {wazeUrl && (
              <a href={wazeUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted text-[12px] text-foreground font-medium">
                <div className="w-5 h-5 rounded bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center"><Route className="w-3 h-3 text-cyan-600" /></div>
                Waze
                <ExternalLink className="w-3 h-3 text-muted-foreground ml-auto" />
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function HeroSection({ trip, traveloureScore, shareToken, totalCost, perPerson, budget }: {
  trip: PlanCardTrip;
  traveloureScore: number | null | undefined;
  shareToken: string | null | undefined;
  totalCost: string | null | undefined;
  perPerson: string | null;
  budget: string | null;
}) {
  const { toast } = useToast();
  const photoUrl = getDestinationPhotoUrl(trip.destination);
  const now = new Date();
  const daysUntilStart = differenceInDays(new Date(trip.startDate ?? Date.now()), now);
  const daysUntilEnd = trip.endDate ? differenceInDays(new Date(trip.endDate), now) : daysUntilStart;

  const tripStatus = trip.status;
  const statusLabel = tripStatus === "completed" || tripStatus === "cancelled"
    ? tripStatus.charAt(0).toUpperCase() + tripStatus.slice(1)
    : tripStatus === "draft"
    ? "Draft"
    : daysUntilEnd < 0
    ? "Completed"
    : daysUntilStart > 0
    ? `${daysUntilStart}d away`
    : daysUntilStart === 0
    ? "Today"
    : "Active";

  const urgencyGradient = daysUntilEnd < 0
    ? "from-gray-400/30 via-gray-500/20 to-gray-400/30"
    : daysUntilStart <= 0
    ? "from-red-500/30 via-orange-500/20 to-yellow-500/30"
    : daysUntilStart <= 3
    ? "from-orange-500/30 via-amber-500/20 to-yellow-500/30"
    : daysUntilStart <= 7
    ? "from-amber-400/30 via-yellow-400/20 to-orange-400/30"
    : daysUntilStart <= 14
    ? "from-primary/30 via-orange-500/20 to-purple-500/30"
    : "from-blue-400/30 via-indigo-400/20 to-purple-400/30";

  const destinationParts = trip.destination?.split(",") || [trip.destination];
  const city = destinationParts[0]?.trim() || trip.destination;
  const country = destinationParts.slice(1).join(",").trim() || "";
  const displayCost = totalCost || budget;

  function handleShare() {
    const shareUrl = shareToken
      ? `${window.location.origin}/itinerary-view/${shareToken}`
      : `${window.location.origin}/itinerary/${trip.id}`;
    navigator.clipboard?.writeText(shareUrl).catch(() => {});
    toast({ title: "Link copied!", description: "Share link copied to clipboard." });
    if (navigator.share) {
      navigator.share({ title: `${trip.title} - Traveloure`, url: shareUrl }).catch(() => {});
    }
  }

  return (
    <div className={`relative h-52 overflow-hidden bg-gradient-to-br ${urgencyGradient}`}>
      <img
        src={photoUrl}
        alt={trip.destination}
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        data-testid={`img-hero-${trip.id}`}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
      <div className="absolute top-2.5 left-2.5 flex gap-1.5 items-center">
        <Badge className="bg-primary text-primary-foreground border-0 text-[10px] font-bold gap-1 px-2 py-0.5 uppercase tracking-wide" data-testid={`badge-status-${trip.id}`}>
          <Zap className="w-2.5 h-2.5" />
          {statusLabel}
        </Badge>
        {trip.numberOfTravelers && trip.numberOfTravelers > 1 && (
          <Badge className="bg-white/20 text-white border-0 text-[10px] backdrop-blur-sm gap-1 px-2 py-0.5" data-testid={`badge-travelers-${trip.id}`}>
            <Users className="w-2.5 h-2.5" />
            {trip.numberOfTravelers}
          </Badge>
        )}
      </div>
      <div className="absolute top-2.5 right-2.5 flex gap-1.5">
        {traveloureScore != null && (
          <div className="w-8 h-8 rounded-lg bg-card flex items-center justify-center shadow-lg" data-testid={`badge-score-${trip.id}`}>
            <span className="text-xs font-bold text-foreground">{traveloureScore}</span>
          </div>
        )}
        <button
          onClick={handleShare}
          className="bg-white/20 backdrop-blur-sm text-white px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 hover:bg-white/30 transition-colors"
          data-testid={`button-share-${trip.id}`}
        >
          <Share2 className="w-3 h-3" /> Share
        </button>
        <Link href={`/itinerary/${trip.id}`}>
          <button
            className="bg-white/20 backdrop-blur-sm text-white px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 hover:bg-white/30 transition-colors"
            data-testid={`button-export-${trip.id}`}
          >
            <Download className="w-3 h-3" /> Export
          </button>
        </Link>
      </div>
      <Link href={`/trip/${trip.id}`} className="absolute bottom-3 left-3 right-3 block group/title">
        <h3 className="font-['DM_Serif_Display',serif] text-[18px] text-white leading-tight drop-shadow-sm truncate group-hover/title:underline decoration-white/60" data-testid={`text-plan-title-${trip.id}`}>
          {trip.title}
        </h3>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
          <span className="text-[11px] text-white/85 flex items-center gap-1" data-testid={`text-destination-${trip.id}`}>
            <MapPin className="w-3 h-3" /> {city}{country && `, ${country}`}
          </span>
          <span className="text-[11px] text-white/85 flex items-center gap-1" data-testid={`text-dates-${trip.id}`}>
            <Calendar className="w-3 h-3" />
            {format(new Date(trip.startDate ?? Date.now()), "MMM d")} – {format(new Date(trip.endDate ?? Date.now()), "MMM d, yyyy")}
          </span>
          {displayCost && (
            <span className="text-[11px] text-emerald-300 font-semibold" data-testid={`text-budget-${trip.id}`}>
              {displayCost}
              {perPerson && <span className="text-white/60 font-normal ml-1">– {perPerson}</span>}
            </span>
          )}
        </div>
      </Link>
    </div>
  );
}

function ExpertNotesPanel({ advisor, expertMsgText, avatarColor, pendingSuggestions }: {
  advisor: ExpertAdvisor | null;
  expertMsgText: string | null;
  avatarColor: { bg: string; text: string };
  pendingSuggestions: number;
}) {
  const [open, setOpen] = useState(false);
  if (!expertMsgText) return null;

  return (
    <div className="mx-3 mb-3">
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-2 px-2.5 py-2 ${open ? "rounded-t-xl" : "rounded-xl"} border border-purple-200/60 dark:border-purple-800/40 bg-card hover:bg-purple-50/50 dark:hover:bg-purple-950/20 transition-colors text-left`}
        data-testid="btn-toggle-expert-notes"
      >
        {advisor ? (
          advisor.profile_image_url ? (
            <img src={advisor.profile_image_url} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0" style={{ background: avatarColor.bg, color: avatarColor.text }}>
              {getInitials(`${advisor.first_name} ${advisor.last_name}`)}
            </div>
          )
        ) : (
          <div className="w-7 h-7 rounded-full bg-purple-200 dark:bg-purple-800 flex items-center justify-center flex-shrink-0">
            <MessageSquare className="w-3.5 h-3.5 text-purple-700 dark:text-purple-300" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-foreground">Expert Notes</span>
            {advisor && <span className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">{advisor.first_name} {advisor.last_name}</span>}
          </div>
          <div className="text-[10px] text-muted-foreground truncate">"{expertMsgText}"</div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {pendingSuggestions > 0 && (
            <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: "#FAEEDA", color: "#633806" }}>
              <Lightbulb className="w-2.5 h-2.5" /> {pendingSuggestions}
            </span>
          )}
          {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      </button>
      {open && (
        <div className="border border-t-0 border-purple-200/60 dark:border-purple-800/40 rounded-b-xl bg-purple-50/30 dark:bg-purple-950/10 px-3 py-2.5">
          <div className="flex gap-2.5">
            {advisor ? (
              advisor.profile_image_url ? (
                <img src={advisor.profile_image_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0 mt-0.5" />
              ) : (
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 mt-0.5" style={{ background: avatarColor.bg, color: avatarColor.text }}>
                  {getInitials(`${advisor.first_name} ${advisor.last_name}`)}
                </div>
              )
            ) : (
              <div className="w-6 h-6 rounded-full bg-purple-200 dark:bg-purple-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                <MessageSquare className="w-3 h-3 text-purple-700 dark:text-purple-300" />
              </div>
            )}
            <div>
              {advisor && <div className="text-[11px] text-purple-700 dark:text-purple-400"><span className="font-semibold">{advisor.first_name} {advisor.last_name}</span></div>}
              <div className="text-[12px] text-foreground mt-0.5 leading-relaxed">"{expertMsgText}"</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getDiffTypeLabel(type: string): string {
  if (type === "activity" || type === "replace") return "Swap";
  if (type === "time" || type === "schedule") return "Time change";
  if (type === "transport") return "Transport";
  if (type === "accommodation") return "Hotel";
  return "New";
}

function buildDiffLines(s: ExpertSuggestion): { removeLine: string | null; addLine: string } {
  const costStr = s.estimated_cost != null && s.estimated_cost > 0 ? ` · $${s.estimated_cost}` : "";
  const dayStr = s.day_number ? ` · Day ${s.day_number}` : "";
  if (s.type === "replace" || s.type === "activity" || s.type === "accommodation") {
    return {
      removeLine: s.description ? s.description.split("→")[0]?.trim() || `Previous ${s.type}` : `Previous ${s.type}`,
      addLine: `${s.title}${costStr}${dayStr}`,
    };
  }
  if (s.type === "time" || s.type === "schedule") {
    return {
      removeLine: s.description ? s.description.split("→")[0]?.trim() || "Previous time" : "Previous time",
      addLine: `${s.title}${dayStr}`,
    };
  }
  return {
    removeLine: null,
    addLine: `${s.title}${costStr}${dayStr}`,
  };
}

function ReviewChangesBanner({ tripId, suggestions, onRespond, onBulk, respondingId }: {
  tripId: string;
  suggestions: ExpertSuggestion[];
  onRespond: (id: string, status: "approved" | "rejected") => void;
  onBulk: (status: "approved" | "rejected") => void;
  respondingId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const pending = suggestions.filter(s => s.status === "pending");
  if (suggestions.length === 0) return null;

  return (
    <div className="mx-3 mb-3">
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-2 px-2.5 py-2 ${open ? "rounded-t-xl" : "rounded-xl"} border border-blue-200/60 dark:border-blue-800/40 bg-card hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors text-left`}
        data-testid={`btn-review-changes-${tripId}`}
      >
        <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
          <MessageSquare className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-foreground">Review Changes</span>
            {pending.length > 0 && <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />}
          </div>
          <div className="text-[10px] text-muted-foreground truncate">
            {pending.length > 0 ? `${pending.length} change${pending.length > 1 ? "s" : ""} waiting for your review` : "All changes reviewed ✓"}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {pending.length > 0 && (
            <span className="bg-blue-600 text-white w-5 h-5 rounded-full text-[10px] font-extrabold flex items-center justify-center">
              {pending.length}
            </span>
          )}
          {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="border border-t-0 border-blue-200/60 dark:border-blue-800/40 rounded-b-xl bg-blue-50/30 dark:bg-blue-950/10 p-3 space-y-3">
          {pending.length > 0 && (
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => onBulk("approved")}
                className="text-[11px] font-semibold text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-3 py-1 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors flex items-center gap-1"
                data-testid={`btn-accept-all-${tripId}`}
              >
                <Check className="w-3 h-3" /> Accept All
              </button>
              <button
                onClick={() => onBulk("rejected")}
                className="text-[11px] font-semibold text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-3 py-1 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors flex items-center gap-1"
                data-testid={`btn-reject-all-${tripId}`}
              >
                <X className="w-3 h-3" /> Reject All
              </button>
            </div>
          )}

          {suggestions.map(s => {
            const diff = buildDiffLines(s);
            if (s.status === "approved") {
              return (
                <div key={s.id} className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200/60 dark:border-green-800/40 px-3 py-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                  <span className="text-[12px] text-green-800 dark:text-green-300 font-medium flex-1">{s.title}</span>
                  <span className="text-[10px] text-green-600 dark:text-green-400 font-medium">Accepted</span>
                </div>
              );
            }
            if (s.status === "rejected") {
              return (
                <div key={s.id} className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200/60 dark:border-red-800/40 px-3 py-2 flex items-center gap-2 opacity-60">
                  <X className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <span className="text-[12px] text-red-800 dark:text-red-300 font-medium flex-1 line-through">{s.title}</span>
                  <span className="text-[10px] text-red-600 dark:text-red-400 font-medium">Rejected</span>
                </div>
              );
            }
            return (
              <div key={s.id} className="rounded-xl bg-card border border-border shadow-sm overflow-hidden">
                <div className="px-3 py-2 bg-muted/50 border-b border-border flex items-center justify-between">
                  <span className="text-[12px] font-bold text-foreground">{s.title}</span>
                  <span className="text-[10px] text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded-full font-medium">
                    {getDiffTypeLabel(s.type)}
                  </span>
                </div>
                <div className="px-3 py-2.5 space-y-1.5">
                  {diff.removeLine && (
                    <div className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                      <span className="text-[12px] text-red-700 dark:text-red-400 line-through">{diff.removeLine}</span>
                    </div>
                  )}
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
                    <span className="text-[12px] text-green-700 dark:text-green-400 font-medium">{diff.addLine}</span>
                  </div>
                  {s.description && (
                    <div className="text-[11px] text-muted-foreground italic ml-3.5 mt-1">"{s.description}"</div>
                  )}
                  <div className="text-[10px] text-muted-foreground ml-3.5">
                    by {s.expert_first_name} {s.expert_last_name}
                    {s.day_number != null && ` · Day ${s.day_number}`}
                  </div>
                </div>
                <div className="px-3 py-2 border-t border-border bg-muted/30 flex gap-2 justify-end">
                  <button
                    onClick={() => onRespond(s.id, "approved")}
                    disabled={respondingId === s.id}
                    className="text-[11px] font-semibold text-white bg-green-600 px-3 py-1 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1"
                    data-testid={`btn-accept-${s.id}`}
                  >
                    <Check className="w-3 h-3" /> Accept
                  </button>
                  <button
                    onClick={() => onRespond(s.id, "rejected")}
                    disabled={respondingId === s.id}
                    className="text-[11px] font-semibold text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 px-3 py-1 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors flex items-center gap-1"
                    data-testid={`btn-reject-${s.id}`}
                  >
                    <X className="w-3 h-3" /> Reject
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MapControlCenter({ tripId, days, selectedDay, onSelectDay }: {
  tripId: string;
  days: PlanCardDay[];
  selectedDay: number;
  onSelectDay: (d: number) => void;
}) {
  const day = days[selectedDay];
  const dayColor = DAY_COLORS[selectedDay % DAY_COLORS.length];
  const allStops = day?.activities || [];

  const fullRouteUrl = allStops.length > 0
    ? `https://www.google.com/maps/dir/${allStops.map(a => a.lat && a.lng ? `${a.lat},${a.lng}` : encodeURIComponent(a.location)).join("/")}`
    : "#";

  return (
    <div className="px-3 pb-3">
      <div className="flex items-center gap-1 mb-3 overflow-x-auto pb-1">
        {days.map((d, i) => (
          <button
            key={d.dayNum}
            onClick={() => onSelectDay(i)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${
              i === selectedDay ? "text-white shadow-md" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
            style={i === selectedDay ? { backgroundColor: dayColor } : {}}
          >
            D{d.dayNum}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border overflow-hidden bg-muted/30">
        <div className="relative h-48 bg-gradient-to-br from-blue-50 via-blue-100/50 to-indigo-50 dark:from-blue-950/30 dark:via-blue-900/20 dark:to-indigo-950/30 flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#94a3b8" strokeWidth="0.5" />
              </pattern>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          </div>
          {allStops.length > 1 && (
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 480 192">
              <polyline
                fill="none"
                stroke={dayColor}
                strokeWidth="2"
                strokeDasharray="6 4"
                opacity="0.5"
                points={allStops.map((a, i) => {
                  const x = 60 + (i * (360 / Math.max(allStops.length - 1, 1)));
                  const y = 60 + Math.sin(i * 1.2) * 35;
                  return `${x},${y}`;
                }).join(" ")}
              />
            </svg>
          )}
          {allStops.map((a, i) => {
            const x = allStops.length === 1 ? 240 : 60 + (i * (360 / Math.max(allStops.length - 1, 1)));
            const y = 60 + Math.sin(i * 1.2) * 35;
            return (
              <div key={a.id} className="absolute flex flex-col items-center" style={{ left: x, top: y, transform: "translate(-50%, -50%)" }}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shadow-lg border-2 border-white" style={{ backgroundColor: dayColor }}>
                  {i + 1}
                </div>
                <div className="mt-1 px-1.5 py-0.5 bg-card/90 rounded text-[9px] font-medium text-foreground max-w-[80px] text-center truncate shadow-sm">
                  {a.name.length > 14 ? a.name.slice(0, 12) + "…" : a.name}
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-3 border-t border-border bg-card">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[13px] font-bold text-foreground">Day {day?.dayNum ?? 1} — {day?.label ?? ""}</div>
              <div className="text-[11px] text-muted-foreground">{allStops.length} stop{allStops.length !== 1 ? "s" : ""} · {day?.date ?? ""}</div>
            </div>
            <a
              href={fullRouteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[11px] font-bold text-white px-3 py-1.5 rounded-lg shadow-sm hover:opacity-90 transition-opacity"
              style={{ backgroundColor: dayColor }}
              data-testid="open-full-route"
            >
              <Route className="w-3.5 h-3.5" /> Open Full Route
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="space-y-1.5">
            {allStops.map((a, i) => (
              <div key={a.id} className="flex items-center gap-2.5 py-2 px-2.5 rounded-lg hover:bg-muted transition-colors group">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ backgroundColor: dayColor }}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-foreground truncate">{a.name}</div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1 truncate">
                    <Clock className="w-2.5 h-2.5 flex-shrink-0" /> {a.time} · {a.location}
                  </div>
                </div>
                <NavigateDropdown location={a.location} lat={a.lat} lng={a.lng} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <a href={fullRouteUrl} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1 p-2.5 rounded-xl border border-border hover:bg-blue-50 dark:hover:bg-blue-950/20 hover:border-blue-200 dark:hover:border-blue-800 transition-colors text-center">
          <MapPin className="w-5 h-5 text-blue-600" />
          <span className="text-[10px] font-semibold text-foreground">Google Maps</span>
        </a>
        <a href={allStops.length > 0 ? buildAppleMapsUrl(allStops[0].location, allStops[0].lat, allStops[0].lng) : "#"} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1 p-2.5 rounded-xl border border-border hover:bg-muted hover:border-border transition-colors text-center">
          <Map className="w-5 h-5 text-muted-foreground" />
          <span className="text-[10px] font-semibold text-foreground">Apple Maps</span>
        </a>
        <a href={allStops.length > 0 && allStops[0].lat ? `https://www.waze.com/ul?ll=${allStops[0].lat},${allStops[0].lng}&navigate=yes` : "#"} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1 p-2.5 rounded-xl border border-border hover:bg-cyan-50 dark:hover:bg-cyan-950/20 hover:border-cyan-200 dark:hover:border-cyan-800 transition-colors text-center">
          <Route className="w-5 h-5 text-cyan-600" />
          <span className="text-[10px] font-semibold text-foreground">Waze</span>
        </a>
      </div>
    </div>
  );
}

export function PlanCard({ trip, score, index = 0, conversations = [], notifications = [] }: PlanCardProps) {
  const [selectedDay, setSelectedDay] = useState(0);
  const [section, setSection] = useState<"activities" | "transport">("activities");
  const [showChanges, setShowChanges] = useState(false);
  const [viewMode, setViewMode] = useState<"card" | "map">("card");
  const [confirming, setConfirming] = useState(false);
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set([0]));
  const [itineraryOpen, setItineraryOpen] = useState(false);
  const [transitPickerOpen, setTransitPickerOpen] = useState<string | null>(null);
  const [tripWideMode, setTripWideMode] = useState<string | null>(null);
  const [selectedModes, setSelectedModes] = useState<Record<string, string>>({});
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
    ? expertMsgRaw.slice(0, 120) + (expertMsgRaw.length > 120 ? "…" : "")
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

  const handleSuggestionResponse = async (suggestionId: string, status: "approved" | "rejected") => {
    try {
      setRespondingId(suggestionId);
      await apiRequest("PATCH", `/api/trips/${trip.id}/suggestions/${suggestionId}`, { status });
      queryClient.invalidateQueries({ queryKey: ['/api/trips', trip.id, 'suggestions'] });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${trip.id}/plancard`] });
      toast({ title: status === "approved" ? "Suggestion approved" : "Suggestion rejected" });
    } catch {
      toast({ title: "Failed to update suggestion", variant: "destructive" });
    } finally {
      setRespondingId(null);
    }
  };

  const handleBulkSuggestions = async (status: "approved" | "rejected") => {
    const pending = allSuggestions.filter(s => s.status === "pending");
    for (const s of pending) {
      try {
        await apiRequest("PATCH", `/api/trips/${trip.id}/suggestions/${s.id}`, { status });
      } catch {}
    }
    queryClient.invalidateQueries({ queryKey: ['/api/trips', trip.id, 'suggestions'] });
    queryClient.invalidateQueries({ queryKey: [`/api/trips/${trip.id}/plancard`] });
    toast({ title: `${pending.length} suggestion${pending.length !== 1 ? "s" : ""} ${status}` });
  };

  const optimizationScore = score?.optimizationScore;
  const shareToken = trip.shareToken ?? score?.shareToken ?? null;

  const totalActivities = stats.totalActivities || days.reduce((s, d) => s + (d.activities?.length || 0), 0);
  const confirmedActivities = stats.confirmedActivities ?? days.reduce((s, d) => s + (d.activities?.filter(a => a.status === "confirmed").length || 0), 0);
  const totalLegs = stats.totalLegs || days.reduce((s, d) => s + (d.transports?.length || 0), 0);
  const totalMinutes = stats.totalTransitMinutes || days.reduce((s, d) => s + (d.transports || []).reduce((t, tr) => t + (tr.duration || 0), 0), 0);

  const traveloureScore = metrics.traveloureScore || metrics.optimizationScore || optimizationScore;
  const totalCostNum = metrics.totalCost;
  const savingsNum = metrics.savings;
  const wellnessTime = metrics.wellnessMinutes;

  const totalCostDisplay = totalCostNum != null ? `$${Number(totalCostNum).toLocaleString()}` : null;
  const savingsDisplay = savingsNum != null ? `$${Number(savingsNum).toLocaleString()}` : null;
  const budgetDisplay = trip.budget ? `$${Number(trip.budget).toLocaleString()}` : null;
  const perPersonDisplay = metrics.perPersonCost != null
    ? `$${Number(metrics.perPersonCost).toLocaleString()}/person`
    : (trip.budget && trip.numberOfTravelers > 1
      ? `$${Math.round(Number(trip.budget) / trip.numberOfTravelers).toLocaleString()}/person`
      : null);

  const toggleDay = (idx: number) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

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
            : "bg-card border-border text-muted-foreground hover:bg-red-50 hover:border-red-300 hover:text-red-500 dark:hover:bg-red-950"
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

        <div className="px-3 pt-2.5" data-testid={`view-mode-toggle-${trip.id}`}>
          <div className="relative bg-muted rounded-xl p-1 flex gap-0.5">
            <div
              className="absolute top-1 bottom-1 rounded-lg transition-all duration-300 ease-in-out shadow-md"
              style={{
                left: viewMode === "card" ? "4px" : "calc(50% + 1px)",
                width: "calc(50% - 5px)",
                background: viewMode === "card" ? "hsl(var(--foreground))" : "hsl(var(--primary))",
              }}
            />
            <button
              onClick={() => setViewMode("card")}
              className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold transition-colors duration-300 ${
                viewMode === "card" ? "text-background" : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`view-card-${trip.id}`}
            >
              <LayoutList className="w-3.5 h-3.5" /> Dashboard
            </button>
            <button
              onClick={() => setViewMode("map")}
              className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold transition-colors duration-300 ${
                viewMode === "map" ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`view-map-${trip.id}`}
            >
              <Map className="w-3.5 h-3.5" /> Map Center
              {viewMode !== "map" && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 border-b border-border mt-3">
          {[
            { label: "Days", value: `${days.length || "–"}`, icon: Calendar },
            { label: "Activities", value: `${totalActivities}`, icon: Star },
            { label: "Transit", value: `${totalLegs}`, icon: TrainFront },
            { label: "Time", value: totalMinutes > 0 ? formatDuration(totalMinutes) : "–", icon: Clock },
          ].map((s, i) => (
            <div key={i} className={`py-2.5 px-1.5 text-center ${i < 3 ? "border-r border-border" : ""}`}>
              <div className="text-[9px] text-muted-foreground mb-0.5 flex items-center justify-center gap-0.5">
                <s.icon className="w-2.5 h-2.5" /> {s.label}
              </div>
              <div className="text-base font-bold text-foreground">{s.value}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-border bg-muted/30">
          {traveloureScore != null && (
            <Badge className="text-[10px] gap-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-0">
              <Star className="w-3 h-3" /> {traveloureScore} Score
            </Badge>
          )}
          {(totalCostDisplay || budgetDisplay) && (
            <Badge className="text-[10px] gap-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-0">
              {totalCostDisplay || budgetDisplay}{perPersonDisplay && ` (${perPersonDisplay.replace("/person", "/pp")})`}
            </Badge>
          )}
          {savingsDisplay && (
            <Badge className="text-[10px] gap-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-0">
              <TrendingDown className="w-3 h-3" /> Saves {savingsDisplay}
            </Badge>
          )}
          {wellnessTime != null && wellnessTime > 0 && (
            <Badge className="text-[10px] gap-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-0">
              <Heart className="w-3 h-3" /> {wellnessTime}m wellness
            </Badge>
          )}
          {tripServiceCount > 0 && (
            <Badge className="text-[10px] gap-1 border-0" style={{ background: "#E6F1FB", color: "#0C447C" }}>
              {tripServiceCount} service{tripServiceCount !== 1 ? "s" : ""}
            </Badge>
          )}
          {totalLegs > 0 && (
            <Badge className="text-[10px] gap-1 border-0" style={{ background: "#E1F5EE", color: "#085041" }}>
              <Route className="w-3 h-3" /> {totalLegs} legs
            </Badge>
          )}
          {advisor && (
            <Badge className="text-[10px] gap-1 border-0" style={{ background: "#EEEDFE", color: "#3C3489" }}>
              <Users className="w-3 h-3" /> Expert assigned
            </Badge>
          )}
        </div>

        <ExpertNotesPanel
          advisor={advisor}
          expertMsgText={expertMsgText}
          avatarColor={avatarColor}
          pendingSuggestions={pendingSuggestions}
        />

        <ReviewChangesBanner
          tripId={trip.id}
          suggestions={allSuggestions}
          onRespond={handleSuggestionResponse}
          onBulk={handleBulkSuggestions}
          respondingId={respondingId}
        />

        {viewMode === "map" ? (
          <div className="pt-3">
            <MapControlCenter
              tripId={trip.id}
              days={days}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
            />
          </div>
        ) : (
          <>
            <div className="mx-3 mb-3">
              <button
                onClick={() => setItineraryOpen(!itineraryOpen)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 ${itineraryOpen ? "rounded-t-xl" : "rounded-xl"} border border-border bg-card hover:bg-muted/50 transition-colors text-left`}
                data-testid={`btn-itinerary-toggle-${trip.id}`}
              >
                <div className="w-7 h-7 rounded-full bg-foreground flex items-center justify-center flex-shrink-0">
                  <LayoutList className="w-3.5 h-3.5 text-background" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-foreground">Itinerary</div>
                  <div className="text-[10px] text-muted-foreground">{totalActivities} activities · {totalLegs} transport legs · {confirmedActivities} confirmed</div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-[10px] text-green-600 dark:text-green-400 font-semibold flex items-center gap-0.5">
                    <CheckCircle2 className="w-3 h-3" /> {confirmedActivities}/{totalActivities}
                  </span>
                  {itineraryOpen ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                </div>
              </button>

              {itineraryOpen && (
                <div className="border border-t-0 border-border rounded-b-xl overflow-hidden bg-card">
                  <div className="flex border-b border-border px-3">
                    <button
                      onClick={() => setSection("activities")}
                      className={`py-2.5 px-3 border-b-2 transition-all text-[12px] font-medium flex items-center gap-1.5 ${
                        section === "activities" ? "border-foreground text-foreground font-bold" : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                      data-testid={`tab-activities-${trip.id}`}
                    >
                      Activities
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                        section === "activities" ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                      }`}>{totalActivities}</span>
                    </button>
                    <button
                      onClick={() => setSection("transport")}
                      className={`py-2.5 px-3 border-b-2 transition-all text-[12px] font-medium flex items-center gap-1.5 ${
                        section === "transport" ? "border-foreground text-foreground font-bold" : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                      data-testid={`tab-transport-${trip.id}`}
                    >
                      Transport
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                        section === "transport" ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                      }`}>{totalLegs}</span>
                    </button>
                    {changeLog.length > 0 && (
                      <button
                        onClick={() => setShowChanges(!showChanges)}
                        className={`ml-auto py-2.5 px-2 text-[11px] font-semibold flex items-center gap-1 ${
                          showChanges ? "text-amber-500" : "text-muted-foreground hover:text-foreground"
                        }`}
                        data-testid={`toggle-changes-${trip.id}`}
                      >
                        <History className="w-3 h-3" /> Changes
                        <span className="bg-amber-500 text-white w-4 h-4 rounded-full text-[9px] font-extrabold flex items-center justify-center">{changeLog.length}</span>
                      </button>
                    )}
                  </div>

                  {showChanges && changeLog.length > 0 && (
                    <div className="bg-amber-50/50 dark:bg-amber-950/10 border-b border-amber-200/30 dark:border-amber-800/30 px-3 py-2.5">
                      <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400 mb-2 uppercase tracking-wider">Change History</div>
                      {changeLog.map((c, i) => (
                        <div key={c.id} className={`flex items-start gap-2 py-1.5 ${i < changeLog.length - 1 ? "border-b border-border/30" : ""}`}>
                          <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${CHANGE_DOT_COLORS[c.role] || "bg-gray-400"}`} />
                          <div>
                            <span className="text-foreground text-[12px] font-semibold">{c.who}</span>
                            <span className="text-muted-foreground text-[12px]"> – {c.what}</span>
                            <div className="text-muted-foreground text-[10px] mt-0.5">{c.when}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {section === "activities" && (
                    <div className="px-3 pb-3">
                      {days.map((d, dayIdx) => {
                        const isExpanded = expandedDays.has(dayIdx);
                        const dayColor = DAY_COLORS[dayIdx % DAY_COLORS.length];
                        const dayConfirmed = d.activities?.filter(a => a.status === "confirmed").length ?? 0;
                        return (
                          <div key={d.dayNum} className="mb-1.5">
                            <button
                              onClick={() => toggleDay(dayIdx)}
                              className="w-full flex items-center gap-2 py-2 px-2.5 rounded-lg hover:bg-muted transition-colors text-left"
                              data-testid={`day-header-${d.dayNum}`}
                            >
                              <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0" style={{ backgroundColor: dayColor }}>
                                {d.dayNum}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-[12px] font-bold text-foreground">{d.label}</div>
                                <div className="text-[10px] text-muted-foreground">{d.date} · {d.activities?.length ?? 0} activities · {dayConfirmed} confirmed</div>
                              </div>
                              {(d.activities?.length ?? 0) > 0 && (
                                <div className="flex items-center gap-1.5">
                                  {d.activities?.some(a => a.expertNote) && <Lightbulb className="w-3 h-3 text-amber-500" />}
                                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                                </div>
                              )}
                            </button>
                            {isExpanded && (d.activities?.length ?? 0) > 0 && (
                              <div className="ml-[14px] pl-3 border-l-2 mt-1 mb-1.5" style={{ borderColor: `${dayColor}30` }}>
                                {d.activities.map((a, i) => {
                                  const tc = TYPE_COLORS[a.type] || TYPE_COLORS.attraction;
                                  const ss = STATUS_STYLES[a.status] || STATUS_STYLES.pending;
                                  return (
                                    <div key={a.id}>
                                      <div className={`flex gap-2.5 py-2.5 ${i < d.activities.length - 1 ? "border-b border-border/50" : ""}`}>
                                        <div className="flex flex-col items-center w-10 flex-shrink-0">
                                          <div className="text-[11px] font-bold text-foreground">{a.time}</div>
                                          <div className="w-2 h-2 rounded-full mt-1 border-2 border-card" style={{ backgroundColor: tc.dot, boxShadow: `0 0 6px ${tc.dot}40` }} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="text-[12px] font-semibold text-foreground leading-tight">{a.name}</div>
                                          <div className="flex flex-wrap gap-1 mt-1 items-center">
                                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${tc.bg} ${tc.fg}`}>{a.type}</span>
                                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${ss.bg} ${ss.fg}`}>{ss.label}</span>
                                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" /> {a.location}</span>
                                          </div>
                                          {a.cost > 0 && <div className="text-[11px] text-green-600 dark:text-green-400 font-semibold mt-0.5">${a.cost}</div>}
                                        </div>
                                        <NavigateDropdown location={a.location} lat={a.lat} lng={a.lng} />
                                      </div>
                                      {a.expertNote && (
                                        <div className="ml-10 mb-2 px-2.5 py-1.5 bg-amber-50/50 dark:bg-amber-950/10 border border-amber-200/40 dark:border-amber-800/30 rounded-lg flex items-start gap-1.5">
                                          <Lightbulb className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
                                          <span className="text-[11px] text-amber-800 dark:text-amber-300 italic">"{a.expertNote}"</span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {section === "transport" && (
                    <div className="px-3 pb-3">
                      <div className="px-2.5 py-3 border-b border-border mb-2">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-bold text-foreground uppercase tracking-wider">Trip-wide transit mode</span>
                          {tripWideMode && (
                            <button
                              onClick={resetTransitModes}
                              className="text-[9px] text-muted-foreground hover:text-foreground underline"
                              data-testid="reset-trip-mode"
                            >
                              Reset to defaults
                            </button>
                          )}
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          {([
                            { mode: "private_car", label: "Private Car", tag: "TRAVELOURE" },
                            { mode: "rental_car", label: "Rental Car", tag: "TRAVELOURE" },
                            { mode: "rideshare", label: "Rideshare", tag: null },
                            { mode: "bus", label: "Public Transit", tag: null },
                            { mode: "walk", label: "Walk", tag: null },
                          ] as const).map(opt => {
                            const isActive = tripWideMode === opt.mode;
                            const legCount = days.reduce((s, d) => s + (d.transports?.filter(t => t.transitOptions?.some(o => o.mode === opt.mode)).length ?? 0), 0);
                            return (
                              <button
                                key={opt.mode}
                                onClick={() => applyTripWideMode(opt.mode)}
                                className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold transition-all border ${
                                  isActive
                                    ? "border-foreground bg-foreground text-background shadow-md"
                                    : "border-border bg-card text-foreground hover:border-muted-foreground hover:shadow-sm"
                                }`}
                                data-testid={`trip-mode-${opt.mode}`}
                              >
                                <ModeIcon mode={opt.mode} className="w-3 h-3" />
                                <span>{opt.label}</span>
                                {opt.tag && !isActive && (
                                  <span className="text-[7px] bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 px-1 rounded font-bold ml-0.5">{opt.tag}</span>
                                )}
                                {isActive && (
                                  <span className="text-[8px] bg-background/20 px-1 rounded">{legCount} legs</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                        {tripWideMode && (
                          <div className="mt-2 text-[10px] text-muted-foreground flex items-center gap-1">
                            <Check className="w-3 h-3 text-green-600" />
                            Applied <span className="font-semibold text-foreground">{MODE_LABELS[tripWideMode] || tripWideMode}</span> to all compatible legs.
                          </div>
                        )}
                      </div>

                      {days.map((d, dayIdx) => {
                        if (!d.transports || d.transports.length === 0) return null;
                        const dayColor = DAY_COLORS[dayIdx % DAY_COLORS.length];
                        const isExpanded = expandedDays.has(dayIdx);
                        return (
                          <div key={d.dayNum} className="mb-1.5">
                            <button
                              onClick={() => toggleDay(dayIdx)}
                              className="w-full flex items-center gap-2 py-2 px-2.5 rounded-lg hover:bg-muted transition-colors text-left"
                            >
                              <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0" style={{ backgroundColor: dayColor }}>
                                {d.dayNum}
                              </div>
                              <div className="flex-1">
                                <div className="text-[12px] font-bold text-foreground">{d.label}</div>
                                <div className="text-[10px] text-muted-foreground">
                                  {d.transports.length} leg{d.transports.length !== 1 ? "s" : ""} · {formatDuration(d.transports.reduce((s, t) => s + t.duration, 0))} · ${d.transports.reduce((s, t) => s + t.cost, 0)}
                                </div>
                              </div>
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                            </button>
                            {isExpanded && (
                              <div className="ml-[14px] pl-3 border-l-2 mt-1 mb-1.5" style={{ borderColor: `${dayColor}30` }}>
                                {d.transports.map((tr, i) => {
                                  const ss = STATUS_STYLES[tr.status] || STATUS_STYLES.pending;
                                  const curMode = selectedModes[tr.id] || tr.mode;
                                  const curOption = tr.transitOptions?.find(o => o.mode === curMode);
                                  const modeColor = MODE_COLORS[curMode] || "#94a3b8";
                                  const isPickerOpen = transitPickerOpen === `tab-${tr.id}`;
                                  const displayDuration = curOption?.duration ?? tr.duration;
                                  const displayCost = curOption?.cost ?? tr.cost;
                                  return (
                                    <div key={tr.id} className={`py-2.5 ${i < d.transports.length - 1 ? "border-b border-border/50" : ""}`}>
                                      <div className="flex gap-2.5">
                                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${modeColor}15`, color: modeColor }}>
                                          <ModeIcon mode={curMode} className="w-3.5 h-3.5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-1.5 text-[11px]">
                                            <span className="text-muted-foreground truncate">{tr.fromName || tr.from}</span>
                                            <span className="text-muted-foreground/50">→</span>
                                            <span className="text-foreground font-semibold truncate">{tr.toName || tr.to}</span>
                                          </div>
                                          <div className="flex flex-wrap gap-1.5 mt-1 items-center">
                                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ backgroundColor: `${modeColor}20`, color: modeColor }}>{MODE_LABELS[curMode] || curMode}</span>
                                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" /> {formatDuration(displayDuration)}</span>
                                            {displayCost > 0 ? <span className="text-[10px] text-green-600 dark:text-green-400 font-semibold">${displayCost}</span> : <span className="text-[10px] text-green-600 dark:text-green-400 font-semibold">Free</span>}
                                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${ss.bg} ${ss.fg}`}>{ss.label}</span>
                                            {curOption?.source === "platform" && <span className="px-1 py-0.5 rounded text-[8px] font-bold bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300">TRAVELOURE</span>}
                                          </div>
                                        </div>
                                        <div className="flex flex-col gap-1 flex-shrink-0 items-end">
                                          {tr.transitOptions && tr.transitOptions.length > 1 && (
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              className="text-[9px] h-5 px-2"
                                              onClick={() => setTransitPickerOpen(isPickerOpen ? null : `tab-${tr.id}`)}
                                              data-testid={`transit-tab-toggle-${tr.id}`}
                                            >
                                              <Repeat className="w-2.5 h-2.5 mr-0.5" /> Mode
                                            </Button>
                                          )}
                                          {tr.status === "suggested" && (
                                            <Button size="sm" className="text-[9px] h-5 px-2 bg-foreground text-background hover:bg-foreground/90">Accept</Button>
                                          )}
                                        </div>
                                      </div>
                                      {isPickerOpen && tr.transitOptions && (
                                        <div className="mt-2 ml-10 bg-card border border-border rounded-lg shadow-lg overflow-hidden" data-testid={`transit-tab-picker-${tr.id}`}>
                                          <div className="px-2.5 py-1.5 bg-muted border-b border-border flex items-center justify-between">
                                            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Choose transit mode</span>
                                            <span className="text-[9px] text-muted-foreground">{tr.transitOptions.length} options</span>
                                          </div>
                                          {tr.transitOptions.map(opt => {
                                            const optColor = MODE_COLORS[opt.mode] || "#94a3b8";
                                            const isSelected = curMode === opt.mode;
                                            return (
                                              <button
                                                key={opt.mode}
                                                onClick={() => {
                                                  setSelectedModes(prev => ({ ...prev, [tr.id]: opt.mode }));
                                                  setTransitPickerOpen(null);
                                                }}
                                                className={`w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-muted transition-colors border-b border-border/50 last:border-b-0 ${isSelected ? "bg-blue-50 dark:bg-blue-950/20" : ""}`}
                                                data-testid={`transit-tab-option-${tr.id}-${opt.mode}`}
                                              >
                                                <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${optColor}15`, color: optColor }}>
                                                  <ModeIcon mode={opt.mode} className="w-3.5 h-3.5" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                  <div className="flex items-center gap-1">
                                                    <span className="text-[11px] font-semibold text-foreground">{opt.label || MODE_LABELS[opt.mode]}</span>
                                                    {opt.recommended && <span className="text-[8px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-1 rounded font-bold">REC</span>}
                                                    {opt.source === "platform" && <span className="text-[8px] bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 px-1 rounded font-bold">TRAVELOURE</span>}
                                                  </div>
                                                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                                    <span>{formatDuration(opt.duration)}</span>
                                                    <span>{opt.cost === 0 ? "Free" : `$${opt.cost}`}</span>
                                                    {opt.provider && <span className="text-muted-foreground/60">via {opt.provider}</span>}
                                                  </div>
                                                  {opt.notes && <div className="text-[9px] text-muted-foreground/60 mt-0.5">{opt.notes}</div>}
                                                </div>
                                                {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        <div className="px-3 pb-3 pt-2 flex gap-2">
          {viewMode === "card" ? (
            <Button
              variant="outline"
              size="sm"
              className="flex-shrink-0 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/20"
              onClick={() => setViewMode("map")}
              data-testid={`footer-maps-${trip.id}`}
            >
              <Map className="w-3.5 h-3.5 mr-1" /> Open Map
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse ml-1" />
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="flex-shrink-0"
              onClick={() => setViewMode("card")}
              data-testid={`footer-dashboard-${trip.id}`}
            >
              <LayoutList className="w-3.5 h-3.5 mr-1" /> Dashboard
            </Button>
          )}
          <Link href={shareToken ? `/itinerary-view/${shareToken}` : `/trip/${trip.id}`} className="flex-1">
            <Button size="sm" className="w-full text-xs font-semibold" data-testid={`footer-itinerary-${trip.id}`}>
              <Calendar className="w-3.5 h-3.5 mr-1" /> View Itinerary
              <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
            </Button>
          </Link>
        </div>

        {actionItems.length > 0 && (
          <div className="mx-3 mb-4 rounded-xl bg-muted/40 border border-border px-3 py-2" data-testid={`action-items-${trip.id}`}>
            {actionItems.map((n, i) => (
              <div key={n.id ?? i} className="flex items-start gap-2 py-0.5">
                <div
                  className="w-1.5 h-1.5 rounded-full mt-[5px] flex-shrink-0"
                  style={{ background: n.type === "urgent" || n.type === "alert" ? "#E24B4A" : "#EF9F27" }}
                />
                <span className="text-[11px] text-foreground">{n.title || n.message}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </motion.div>
  );
}
