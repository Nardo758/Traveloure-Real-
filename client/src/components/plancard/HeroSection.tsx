import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { differenceInDays, format, isValid } from "date-fns";
import { Users, Share2, Download, MapPin, Calendar, Zap } from "lucide-react";
import { Link } from "wouter";
import { getDestinationPhoto, type PlanCardTrip, type PlanCardDay } from "./plancard-types";
import { MetricStrip } from "./MetricStrip";

interface HeroSectionProps {
  trip: PlanCardTrip;
  traveloureScore: number | null | undefined;
  shareToken: string | null | undefined;
  totalCost: string | null | undefined;
  perPerson: string | null;
  budget: string | null;
  /** metric-strip inputs — same numbers the summary header shows, for continuity */
  days: PlanCardDay[];
  totalActivities: number;
  totalLegs: number;
  totalMinutes: number;
  /** template-aware labels (mirrors StatsRow) */
  statsLabels: string[];
}

export function HeroSection({
  trip,
  traveloureScore,
  shareToken,
  totalCost,
  perPerson,
  budget,
  days,
  totalActivities,
  totalLegs,
  totalMinutes,
  statsLabels,
}: HeroSectionProps) {
  const { toast } = useToast();
  // Real photo when sourced; null today → the brand gradient below carries the hero.
  const photoUrl = getDestinationPhoto(trip.destination || "travel");

  function safeDate(raw: string | null | undefined): Date | null {
    if (!raw) return null;
    const d = new Date(raw);
    return isValid(d) ? d : null;
  }

  const startDate = safeDate(trip.startDate);
  const endDate = safeDate(trip.endDate);
  const daysUntil = startDate ? differenceInDays(startDate, new Date()) : null;
  const statusLabel = daysUntil != null && daysUntil > 0
    ? (daysUntil <= 30 ? `${daysUntil}d away` : "Upcoming")
    : "Planning";

  const destinationParts = trip.destination?.split(",") || [trip.destination];
  const city = destinationParts[0]?.trim() || trip.destination;
  const country = destinationParts.slice(1).join(",").trim() || "";

  const displayCost = totalCost || budget;

  const daysCount = days.length || (startDate && endDate ? differenceInDays(endDate, startDate) + 1 : 0);
  const metricCells = [
    { label: statsLabels[0] ?? "Days", value: daysCount },
    { label: statsLabels[1] ?? "Activities", value: totalActivities },
    { label: statsLabels[2] ?? "Transit legs", value: totalLegs },
    { label: statsLabels[3] ?? "Transit time", value: totalMinutes > 0 ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m` : "-" },
  ];

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
    <div className="relative h-36 sm:h-48 overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-primary/40">
      {photoUrl && (
        <img
          src={photoUrl}
          alt={trip.destination}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          data-testid={`img-hero-${trip.id}`}
        />
      )}
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

      <div className="absolute bottom-0 left-0 right-0 px-3 sm:px-5 pb-2 pt-4">
        <h3 className="font-['DM_Serif_Display',serif] text-[17px] sm:text-[22px] text-white leading-tight drop-shadow-sm" data-testid={`text-plan-title-${trip.id}`}>
          {trip.title}
        </h3>
        <div className="flex flex-wrap gap-2 sm:gap-4 mt-1 mb-1.5">
          <span className="text-[11px] sm:text-[13px] text-white/85 flex items-center gap-1" data-testid={`text-destination-${trip.id}`}>
            <MapPin className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> {city}{country && `, ${country}`}
          </span>
          <span className="text-[11px] sm:text-[13px] text-white/85 flex items-center gap-1" data-testid={`text-dates-${trip.id}`}>
            <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            {startDate && endDate
              ? `${format(startDate, "MMM d")} – ${format(endDate, "MMM d, yyyy")}`
              : "Dates not set"}
          </span>
          {displayCost && (
            <span className="text-[11px] sm:text-[13px] text-emerald-300 font-semibold" data-testid={`text-budget-${trip.id}`}>
              {displayCost}
              {perPerson && <span className="text-white/60 font-normal ml-1">· {perPerson}</span>}
            </span>
          )}
        </div>

        {/* shared metric strip — hidden on very small screens to save space */}
        <MetricStrip cells={metricCells} className="hidden sm:flex border-t border-white/10 pt-2" />
      </div>
    </div>
  );
}
