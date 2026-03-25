import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { detectMapsPlatform, openInMaps } from "@/lib/maps-platform";
import { differenceInDays, format } from "date-fns";
import {
  Users, Share2, Download, MapPin, Calendar, Clock, Zap, Lock,
  History, MessageSquare, ChevronRight, Star, TrendingDown,
  Heart, Activity, Route, Footprints, TrainFront, Car, Bus,
  Ship, Bike,
} from "lucide-react";
import { SiGoogle, SiApple } from "react-icons/si";

const TYPE_COLORS: Record<string, { bg: string; fg: string; dot: string }> = {
  dining:      { bg: "bg-amber-100 dark:bg-amber-900/30",  fg: "text-amber-800 dark:text-amber-300",  dot: "#f59e0b" },
  attraction:  { bg: "bg-blue-100 dark:bg-blue-900/30",    fg: "text-blue-800 dark:text-blue-300",    dot: "#3b82f6" },
  shopping:    { bg: "bg-pink-100 dark:bg-pink-900/30",     fg: "text-pink-800 dark:text-pink-300",    dot: "#ec4899" },
  transport:   { bg: "bg-green-100 dark:bg-green-900/30",   fg: "text-green-800 dark:text-green-300",  dot: "#22c55e" },
  accommodation:{ bg: "bg-purple-100 dark:bg-purple-900/30",fg: "text-purple-800 dark:text-purple-300",dot: "#8b5cf6" },
};

const STATUS_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  confirmed: { bg: "bg-green-100 dark:bg-green-900/30", fg: "text-green-800 dark:text-green-300", label: "Confirmed" },
  pending:   { bg: "bg-yellow-100 dark:bg-yellow-900/30", fg: "text-yellow-800 dark:text-yellow-300", label: "Pending" },
  suggested: { bg: "bg-indigo-100 dark:bg-indigo-900/30", fg: "text-indigo-800 dark:text-indigo-300", label: "Suggested" },
};

const MODE_COLORS: Record<string, string> = {
  walk: "#22c55e", train: "#3b82f6", taxi: "#f59e0b", car: "#f59e0b",
  bus: "#8b5cf6", shuttle: "#ec4899", ferry: "#06b6d4", bicycle: "#84cc16",
};

const CHANGE_DOT_COLORS: Record<string, string> = {
  expert: "bg-blue-500", friend: "bg-purple-500", ai: "bg-green-500", owner: "bg-amber-500",
};

const ENERGY_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  relaxed:  { bg: "bg-green-100 dark:bg-green-900/30", fg: "text-green-700 dark:text-green-400", label: "Relaxed" },
  balanced: { bg: "bg-yellow-100 dark:bg-yellow-900/30", fg: "text-yellow-700 dark:text-yellow-400", label: "Balanced" },
  intense:  { bg: "bg-red-100 dark:bg-red-900/30", fg: "text-red-700 dark:text-red-400", label: "Intense" },
};

const STATS_ICONS = [Calendar, Star, TrainFront, Clock] as const;

interface TemplateConfig {
  activityLabel: string;
  transportLabel: string;
  statsLabels: [string, string, string, string];
  activityTypes: Record<string, string>;
}

const TEMPLATES: Record<string, TemplateConfig> = {
  travel: {
    activityLabel: "Activities",
    transportLabel: "Transport",
    statsLabels: ["Days", "Activities", "Transit Legs", "Transit Time"],
    activityTypes: { dining: "Dining", attraction: "Attraction", shopping: "Shopping", transport: "Transport" },
  },
  wedding: {
    activityLabel: "Events & Vendors",
    transportLabel: "Transport",
    statsLabels: ["Days", "Events", "Transfers", "Travel Time"],
    activityTypes: { dining: "Catering", attraction: "Venue", shopping: "Vendor", transport: "Transfer" },
  },
  corporate: {
    activityLabel: "Agenda",
    transportLabel: "Logistics",
    statsLabels: ["Days", "Sessions", "Transfers", "Travel Time"],
    activityTypes: { dining: "Meal", attraction: "Session", shopping: "Site Visit", transport: "Transfer" },
  },
};

function getTemplateConfig(eventType: string | null | undefined): TemplateConfig {
  if (eventType === "wedding" || eventType === "honeymoon" || eventType === "proposal") return TEMPLATES.wedding;
  if (eventType === "corporate") return TEMPLATES.corporate;
  return TEMPLATES.travel;
}

function getDestinationPhotoUrl(destination: string): string {
  return `https://source.unsplash.com/800x400/?${encodeURIComponent(destination)},travel,landmark`;
}

function getEnergyProfile(activities: any[]): string {
  if (!activities || activities.length === 0) return "relaxed";
  if (activities.length >= 5) return "intense";
  if (activities.length >= 3) return "balanced";
  return "relaxed";
}

const MODE_ICON_MAP: Record<string, typeof Footprints> = {
  walk: Footprints, train: TrainFront, taxi: Car, car: Car,
  bus: Bus, shuttle: Bus, ferry: Ship, bicycle: Bike,
};

function ModeIcon({ mode, className }: { mode: string; className?: string }) {
  const Icon = MODE_ICON_MAP[mode] || Footprints;
  return <Icon className={className || "w-4 h-4"} />;
}

interface PlanCardProps {
  trip: any;
  score?: { tripId: string; optimizationScore: number | null; shareToken: string | null };
  index?: number;
}

export function PlanCard({ trip, score, index = 0 }: PlanCardProps) {
  const { toast } = useToast();
  const [selectedDay, setSelectedDay] = useState(0);
  const [section, setSection] = useState<"activities" | "transport">("activities");
  const [showChanges, setShowChanges] = useState(false);

  const templateConfig = getTemplateConfig(trip.eventType);

  const { data: plancardData } = useQuery<any>({
    queryKey: [`/api/trips/${trip.id}/plancard`],
    staleTime: 30000,
  });

  const days = plancardData?.days || [];
  const changeLog = plancardData?.changeLog || [];
  const metrics = plancardData?.metrics || {};
  const stats = plancardData?.stats || {};
  const day = days[selectedDay];

  const photoUrl = getDestinationPhotoUrl(trip.destination);
  const optimizationScore = score?.optimizationScore;
  const shareToken = score?.shareToken;

  const daysUntil = differenceInDays(new Date(trip.startDate), new Date());
  const statusLabel = daysUntil > 0
    ? (daysUntil <= 30 ? `${daysUntil}d away` : "Upcoming")
    : "Planning";

  const destinationParts = trip.destination?.split(",") || [trip.destination];
  const city = destinationParts[0]?.trim() || trip.destination;
  const country = destinationParts.slice(1).join(",").trim() || "";

  const totalActivities = stats.totalActivities || days.reduce((s: number, d: any) => s + (d.activities?.length || 0), 0);
  const confirmedActivities = stats.confirmedActivities || 0;
  const totalLegs = stats.totalLegs || days.reduce((s: number, d: any) => s + (d.transports?.length || 0), 0);
  const totalMinutes = stats.totalTransitMinutes || days.reduce((s: number, d: any) => s + (d.transports || []).reduce((t: number, tr: any) => t + (tr.duration || 0), 0), 0);
  const expertChanges = stats.pendingExpertChanges || changeLog.filter((c: any) => c.role === "expert" && c.type === "suggest").length;

  const transportLocked = day?.activities?.some((a: any) => a.status === "pending") ?? false;

  const traveloureScore = metrics.traveloureScore || metrics.optimizationScore || optimizationScore;
  const totalCost = metrics.totalCost;
  const savings = metrics.savings;
  const savingsPercent = metrics.savingsPercent;
  const wellnessTime = metrics.wellnessMinutes;
  const travelDistance = metrics.travelDistanceMinutes;
  const starDelta = metrics.starRatingDelta;

  const budget = trip.budget ? `$${Number(trip.budget).toLocaleString()}` : null;
  const perPerson = trip.budget && trip.numberOfTravelers > 1
    ? `$${Math.round(Number(trip.budget) / trip.numberOfTravelers).toLocaleString()}/person`
    : null;

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

  function handleGoogleMaps() {
    const dest = day?.activities?.[0]?.location || trip.destination;
    openInMaps(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dest)}`);
  }

  function handleAppleMaps() {
    const dest = day?.activities?.[0]?.location || trip.destination;
    const platform = detectMapsPlatform();
    const query = encodeURIComponent(dest);
    openInMaps(platform === "apple" ? `maps://?q=${query}` : `https://maps.apple.com/?q=${query}`);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      data-testid={`card-plan-${trip.id}`}
    >
      <Card className="overflow-hidden border border-border hover:shadow-xl transition-all duration-300 group bg-card">
        <div className="relative h-52 overflow-hidden bg-gradient-to-br from-primary/30 via-orange-500/20 to-purple-500/30">
          <img
            src={photoUrl}
            alt={trip.destination}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            data-testid={`img-hero-${trip.id}`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

          <div className="absolute top-3 left-3 flex gap-2 items-center">
            <Badge className="bg-primary text-primary-foreground border-0 text-[11px] font-bold gap-1 px-2.5 py-1 uppercase tracking-wide" data-testid={`badge-status-${trip.id}`}>
              <Zap className="w-3 h-3" />
              {statusLabel}
            </Badge>
            {trip.numberOfTravelers && trip.numberOfTravelers > 1 && (
              <Badge className="bg-background/50 text-foreground border-0 text-[11px] backdrop-blur-sm gap-1 px-2.5 py-1" data-testid={`badge-travelers-${trip.id}`}>
                <Users className="w-3 h-3" />
                {trip.numberOfTravelers}
              </Badge>
            )}
          </div>

          <div className="absolute top-3 right-3 flex gap-2">
            {traveloureScore != null && (
              <div className="w-10 h-10 rounded-xl bg-card flex items-center justify-center shadow-lg" data-testid={`badge-score-${trip.id}`}>
                <span className="text-sm font-bold text-foreground" data-testid={`text-score-value-${trip.id}`}>{traveloureScore}</span>
              </div>
            )}
            <button
              onClick={handleShare}
              className="bg-background/50 backdrop-blur-sm border-0 text-foreground px-3 py-1.5 rounded-lg cursor-pointer text-xs font-semibold flex items-center gap-1.5 hover:bg-background/70 transition-colors"
              data-testid={`button-share-${trip.id}`}
            >
              <Share2 className="w-3.5 h-3.5" /> Share
            </button>
            <Link href={`/itinerary/${trip.id}`}>
              <button
                className="bg-background/50 backdrop-blur-sm border-0 text-foreground px-3 py-1.5 rounded-lg cursor-pointer text-xs font-semibold flex items-center gap-1.5 hover:bg-background/70 transition-colors"
                data-testid={`button-export-${trip.id}`}
              >
                <Download className="w-3.5 h-3.5" /> Export
              </button>
            </Link>
          </div>

          <div className="absolute bottom-4 left-5 right-5">
            <h3 className="font-['DM_Serif_Display',serif] text-[22px] text-white leading-tight drop-shadow-sm" data-testid={`text-plan-title-${trip.id}`}>
              {trip.title}
            </h3>
            <div className="flex flex-wrap gap-4 mt-2">
              <span className="text-[13px] text-white/85 flex items-center gap-1" data-testid={`text-destination-${trip.id}`}>
                <MapPin className="w-3.5 h-3.5" /> {city}{country && `, ${country}`}
              </span>
              <span className="text-[13px] text-white/85 flex items-center gap-1" data-testid={`text-dates-${trip.id}`}>
                <Calendar className="w-3.5 h-3.5" />
                {format(new Date(trip.startDate), "MMM d")} - {format(new Date(trip.endDate), "MMM d, yyyy")}
              </span>
              {budget && (
                <span className="text-[13px] text-emerald-300 font-semibold" data-testid={`text-budget-${trip.id}`}>
                  {totalCost || budget}
                  {perPerson && <span className="text-white/60 font-normal ml-1">- {perPerson}</span>}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 border-b border-border" data-testid={`stats-row-${trip.id}`}>
          {[
            { label: templateConfig.statsLabels[0], value: days.length || differenceInDays(new Date(trip.endDate), new Date(trip.startDate)) + 1 },
            { label: templateConfig.statsLabels[1], value: totalActivities },
            { label: templateConfig.statsLabels[2], value: totalLegs },
            { label: templateConfig.statsLabels[3], value: totalMinutes > 0 ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m` : "-" },
          ].map((s, i) => {
            const Icon = STATS_ICONS[i];
            return (
              <div key={i} className={`py-3 px-3 text-center ${i < 3 ? "border-r border-border" : ""}`}>
                <div className="text-[11px] text-muted-foreground mb-1 flex items-center justify-center gap-1">
                  <Icon className="w-3 h-3" /> {s.label}
                </div>
                <div className="text-lg font-bold text-foreground" data-testid={`text-stat-${s.label.toLowerCase().replace(/\s+/g, '-')}-${trip.id}`}>{s.value}</div>
              </div>
            );
          })}
        </div>

        {(savings || wellnessTime || travelDistance || starDelta) && (
          <div className="flex flex-wrap gap-2 px-4 py-2.5 border-b border-border bg-muted/30" data-testid={`optimizer-metrics-${trip.id}`}>
            {traveloureScore != null && (
              <Badge variant="secondary" className="text-[11px] gap-1 bg-primary/10 text-primary border-0" data-testid={`badge-traveloure-score-${trip.id}`}>
                <Star className="w-3 h-3" /> {traveloureScore} Score
              </Badge>
            )}
            {savings && (
              <Badge variant="secondary" className="text-[11px] gap-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-0" data-testid={`badge-savings-${trip.id}`}>
                <TrendingDown className="w-3 h-3" /> Saves {savings}{savingsPercent && ` (${savingsPercent})`}
              </Badge>
            )}
            {wellnessTime && (
              <Badge variant="secondary" className="text-[11px] gap-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-0" data-testid={`badge-wellness-${trip.id}`}>
                <Heart className="w-3 h-3" /> {wellnessTime}m wellness
              </Badge>
            )}
            {travelDistance && (
              <Badge variant="secondary" className="text-[11px] gap-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-0" data-testid={`badge-travel-distance-${trip.id}`}>
                <Route className="w-3 h-3" /> {travelDistance}m travel
              </Badge>
            )}
            {starDelta && (
              <Badge variant="secondary" className="text-[11px] gap-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-0" data-testid={`badge-star-delta-${trip.id}`}>
                <Star className="w-3 h-3" /> {starDelta} stars
              </Badge>
            )}
          </div>
        )}

        {days.length > 0 && (
          <div className="flex gap-1 px-4 pt-3 overflow-x-auto" data-testid={`day-selector-${trip.id}`}>
            {days.map((d: any, i: number) => {
              const energy = getEnergyProfile(d.activities);
              const ec = ENERGY_COLORS[energy];
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDay(i)}
                  className={`px-4 py-2.5 rounded-t-xl border-b-2 cursor-pointer whitespace-nowrap transition-all text-sm font-medium flex flex-col items-center gap-0.5 ${
                    selectedDay === i
                      ? "bg-primary/10 border-primary text-primary font-bold"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                  data-testid={`button-day-${d.dayNum}-${trip.id}`}
                >
                  <span data-testid={`text-day-num-${d.dayNum}-${trip.id}`}>Day {d.dayNum}</span>
                  <span className="text-[10px] opacity-70" data-testid={`text-day-label-${d.dayNum}-${trip.id}`}>{d.label}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full mt-0.5 font-semibold ${ec.bg} ${ec.fg}`} data-testid={`badge-energy-${d.dayNum}-${trip.id}`}>
                    {ec.label}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex border-b border-border px-4" data-testid={`section-tabs-${trip.id}`}>
          <button
            onClick={() => setSection("activities")}
            className={`py-3 px-5 border-b-2 cursor-pointer transition-all text-sm font-medium flex items-center gap-2 ${
              section === "activities"
                ? "border-primary text-primary font-bold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`tab-activities-${trip.id}`}
          >
            {templateConfig.activityLabel}
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
              section === "activities" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`} data-testid={`badge-activity-count-${trip.id}`}>
              {day?.activities?.length || 0}
            </span>
            <span className="text-[11px] text-muted-foreground font-normal" data-testid={`text-confirmation-progress-${trip.id}`}>
              {confirmedActivities}/{totalActivities}
            </span>
          </button>

          <button
            onClick={() => !transportLocked && setSection("transport")}
            className={`py-3 px-5 border-b-2 cursor-pointer transition-all text-sm font-medium flex items-center gap-2 ${
              transportLocked ? "opacity-50 cursor-not-allowed" : ""
            } ${
              section === "transport" && !transportLocked
                ? "border-primary text-primary font-bold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`tab-transport-${trip.id}`}
          >
            {templateConfig.transportLabel}
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
              section === "transport" && !transportLocked ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`} data-testid={`badge-transport-count-${trip.id}`}>
              {day?.transports?.length || 0}
            </span>
            {transportLocked && <Lock className="w-3 h-3" />}
            {transportLocked && <span className="text-[10px] text-muted-foreground italic">finalize activities first</span>}
          </button>

          <button
            onClick={() => setShowChanges(!showChanges)}
            className={`ml-auto py-3 px-4 cursor-pointer transition-all text-xs font-semibold flex items-center gap-1.5 ${
              showChanges ? "text-amber-500 dark:text-amber-400" : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`button-changes-${trip.id}`}
          >
            <History className="w-3.5 h-3.5" /> Changes
            {changeLog.length > 0 && (
              <span className="bg-amber-500 text-amber-950 w-5 h-5 rounded-full text-[10px] font-extrabold flex items-center justify-center" data-testid={`badge-changes-count-${trip.id}`}>
                {changeLog.length}
              </span>
            )}
            {expertChanges > 0 && (
              <span className="text-[10px] text-blue-500 dark:text-blue-400 font-medium" data-testid={`badge-expert-changes-${trip.id}`}>{expertChanges} expert</span>
            )}
          </button>
        </div>

        <AnimatePresence>
          {showChanges && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
              data-testid={`changelog-panel-${trip.id}`}
            >
              <div className="bg-amber-50/50 dark:bg-amber-950/10 border-b border-amber-200/30 dark:border-amber-800/20 px-5 py-4">
                <div className="text-[11px] font-bold text-amber-600 dark:text-amber-400 mb-3 uppercase tracking-wider">Change History</div>
                {changeLog.length > 0 ? changeLog.map((c: any, i: number) => (
                  <div
                    key={c.id || i}
                    className={`flex items-start gap-2.5 py-2 ${i < changeLog.length - 1 ? "border-b border-border/30" : ""}`}
                    data-testid={`change-entry-${c.id || i}-${trip.id}`}
                  >
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${CHANGE_DOT_COLORS[c.role] || "bg-muted-foreground"}`} />
                    <div>
                      <span className="text-foreground text-[13px] font-semibold" data-testid={`text-change-who-${c.id || i}-${trip.id}`}>{c.who}</span>
                      <span className="text-muted-foreground text-[13px]"> - {c.action}</span>
                      <div className="text-muted-foreground/60 text-[11px] mt-0.5">{c.when}</div>
                    </div>
                  </div>
                )) : (
                  <p className="text-muted-foreground text-sm">No changes yet</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {section === "activities" && day && (
          <div className="p-5" data-testid={`activities-section-${trip.id}`}>
            <div className="flex justify-between mb-4">
              <div className="text-[13px] text-muted-foreground" data-testid={`text-day-info-${trip.id}`}>
                {day.date} - <span className="text-foreground font-semibold">{day.label}</span>
              </div>
            </div>

            {(day.activities || []).map((a: any, i: number) => {
              const tc = TYPE_COLORS[a.type] || TYPE_COLORS.attraction;
              const ss = STATUS_STYLES[a.status] || STATUS_STYLES.pending;
              const typeLabel = templateConfig.activityTypes[a.type] || a.type;

              return (
                <div
                  key={a.id}
                  className={`flex gap-3.5 py-3.5 ${i < day.activities.length - 1 ? "border-b border-border/30" : ""}`}
                  data-testid={`activity-row-${a.id}`}
                >
                  <div className="flex flex-col items-center w-12 flex-shrink-0">
                    <div className="text-[13px] font-bold text-foreground" data-testid={`text-activity-time-${a.id}`}>{a.time}</div>
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[15px] font-semibold text-foreground" data-testid={`text-activity-name-${a.id}`}>{a.name}</span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${tc.bg} ${tc.fg}`} data-testid={`badge-activity-type-${a.id}`}>
                        {typeLabel}
                      </span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${ss.bg} ${ss.fg}`} data-testid={`badge-activity-status-${a.id}`}>
                        {ss.label}
                      </span>
                    </div>
                    <div className="text-[12px] text-muted-foreground mt-1 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      <span data-testid={`text-activity-location-${a.id}`}>{a.location}</span>
                      {a.cost > 0 && <span className="ml-2 text-green-600 dark:text-green-400 font-semibold" data-testid={`text-activity-cost-${a.id}`}>${a.cost}</span>}
                    </div>
                    <div className="flex gap-2.5 mt-2">
                      {a.comments > 0 && (
                        <span className="text-[11px] text-blue-600 dark:text-blue-400 flex items-center gap-1 cursor-pointer hover:underline" data-testid={`link-comments-${a.id}`}>
                          <MessageSquare className="w-3 h-3" /> {a.comments} comment{a.comments > 1 ? "s" : ""}
                        </span>
                      )}
                      {a.changes?.length > 0 && (
                        <span className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1" data-testid={`text-activity-change-${a.id}`}>
                          <History className="w-3 h-3" /> {a.changes[0].who}: {a.changes[0].what}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {(!day.activities || day.activities.length === 0) && (
              <div className="text-center py-8 text-muted-foreground" data-testid={`text-no-activities-${trip.id}`}>
                <Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No activities planned for this day</p>
              </div>
            )}
          </div>
        )}

        {section === "transport" && day && !transportLocked && (
          <div className="p-5" data-testid={`transport-section-${trip.id}`}>
            {day.transports?.length > 0 && (
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/30 rounded-xl p-3.5 flex flex-wrap justify-between items-center mb-5 gap-3" data-testid={`transport-summary-${trip.id}`}>
                <div className="flex gap-6">
                  {[
                    { l: "Legs", v: day.transports.length },
                    { l: "Total Time", v: `${day.transports.reduce((s: number, t: any) => s + (t.duration || 0), 0)}m` },
                    { l: "Est. Cost", v: `$${day.transports.reduce((s: number, t: any) => s + (t.cost || 0), 0).toLocaleString()}` },
                  ].map((s, si) => (
                    <div key={si}>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.l}</div>
                      <div className={`text-lg font-bold ${si === 2 ? "text-green-600 dark:text-green-400" : "text-blue-600 dark:text-blue-400"}`} data-testid={`text-transport-stat-${s.l.toLowerCase().replace(/\s+/g, '-')}-${trip.id}`}>{s.v}</div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {[...new Set(day.transports.map((t: any) => t.mode))].map((mode: string) => {
                    const mins = day.transports.filter((t: any) => t.mode === mode).reduce((s: number, t: any) => s + (t.duration || 0), 0);
                    return (
                      <span
                        key={mode}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                        style={{ backgroundColor: `${MODE_COLORS[mode] || "#94a3b8"}15`, color: MODE_COLORS[mode] || "#94a3b8" }}
                        data-testid={`badge-mode-summary-${mode}-${trip.id}`}
                      >
                        <ModeIcon mode={mode} className="w-3.5 h-3.5" /> {mins}m
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {(day.transports || []).map((tr: any, i: number) => {
              const ss = STATUS_STYLES[tr.status] || STATUS_STYLES.pending;
              const modeColor = MODE_COLORS[tr.mode] || "#94a3b8";

              return (
                <div
                  key={tr.id}
                  className={`flex gap-3.5 py-4 ${i < day.transports.length - 1 ? "border-b border-border/30" : ""}`}
                  data-testid={`transport-leg-${tr.id}`}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${modeColor}15`, color: modeColor }}
                  >
                    <ModeIcon mode={tr.mode} className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-[13px]">
                      <span className="text-muted-foreground truncate" data-testid={`text-transport-from-${tr.id}`}>{tr.fromName || tr.from}</span>
                      <span className="text-muted-foreground/50">-&gt;</span>
                      <span className="text-foreground font-semibold truncate" data-testid={`text-transport-to-${tr.id}`}>{tr.toName || tr.to}</span>
                    </div>
                    <div className="flex flex-wrap gap-2.5 mt-1.5 items-center">
                      <span
                        className="px-2.5 py-0.5 rounded-md text-[11px] font-bold capitalize"
                        style={{ backgroundColor: `${modeColor}20`, color: modeColor }}
                        data-testid={`badge-transport-mode-${tr.id}`}
                      >
                        {tr.mode}
                      </span>
                      <span className="text-[12px] text-muted-foreground flex items-center gap-1" data-testid={`text-transport-duration-${tr.id}`}>
                        <Clock className="w-3 h-3" /> {tr.duration} min
                      </span>
                      {tr.cost > 0 && (
                        <span className="text-[12px] text-green-600 dark:text-green-400 font-semibold" data-testid={`text-transport-cost-${tr.id}`}>${tr.cost}</span>
                      )}
                      {tr.line && (
                        <span className="text-[11px] text-muted-foreground italic" data-testid={`text-transport-line-${tr.id}`}>{tr.line}</span>
                      )}
                    </div>
                    <div className="flex gap-2 mt-2 items-center">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${ss.bg} ${ss.fg}`} data-testid={`badge-transport-status-${tr.id}`}>{ss.label}</span>
                      {tr.suggestedBy && (
                        <span className={`text-[11px] flex items-center gap-1 ${tr.suggestedBy === "ai" ? "text-green-600 dark:text-green-400" : "text-purple-600 dark:text-purple-400"}`} data-testid={`text-transport-suggested-${tr.id}`}>
                          {tr.suggestedBy === "ai" ? "AI suggested" : "Expert suggested"}
                        </span>
                      )}
                    </div>
                  </div>
                  {tr.status === "suggested" && (
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <Button size="sm" variant="default" className="text-[11px] h-7 px-3" data-testid={`button-accept-${tr.id}`}>
                        Accept
                      </Button>
                      <Button size="sm" variant="outline" className="text-[11px] h-7 px-3" data-testid={`button-change-${tr.id}`}>
                        Change
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}

            {(!day.transports || day.transports.length === 0) && (
              <div className="text-center py-8 text-muted-foreground" data-testid={`text-no-transport-${trip.id}`}>
                <Route className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No transport legs for this day</p>
              </div>
            )}

            {day.transports?.length > 0 && (
              <div className="mt-5 p-4 rounded-xl bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 border border-blue-200/30 dark:border-blue-800/20 flex flex-wrap gap-3 items-center justify-between" data-testid={`maps-cta-${trip.id}`}>
                <div>
                  <div className="text-[14px] font-bold text-foreground" data-testid={`text-maps-cta-title-${trip.id}`}>Open Day {day.dayNum} in Maps</div>
                  <div className="text-[12px] text-muted-foreground mt-0.5">Activities + transport routes as layers</div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleGoogleMaps}
                    variant="default"
                    className="text-xs gap-1.5"
                    data-testid={`button-google-maps-${trip.id}`}
                  >
                    <SiGoogle className="w-3.5 h-3.5" /> Google Maps
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAppleMaps}
                    className="text-xs gap-1.5"
                    data-testid={`button-apple-maps-${trip.id}`}
                  >
                    <SiApple className="w-3.5 h-3.5" /> Apple Maps
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="px-5 pb-5 pt-2">
          <Link href={`/itinerary/${trip.id}`}>
            <Button
              className="w-full text-xs font-semibold"
              data-testid={`button-view-itinerary-${trip.id}`}
            >
              <Calendar className="w-3.5 h-3.5 mr-1.5" />
              View Full Itinerary
              <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </Card>
    </motion.div>
  );
}
