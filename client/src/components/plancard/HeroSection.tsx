import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { differenceInDays, format } from "date-fns";
import { Users, Share2, Download, MapPin, Calendar, Zap } from "lucide-react";
import { Link } from "wouter";
import { getDestinationPhotoUrl, type PlanCardTrip } from "./plancard-types";

interface HeroSectionProps {
  trip: PlanCardTrip;
  traveloureScore: number | null | undefined;
  shareToken: string | null | undefined;
  totalCost: string | null | undefined;
  perPerson: string | null;
  budget: string | null;
}

export function HeroSection({ trip, traveloureScore, shareToken, totalCost, perPerson, budget }: HeroSectionProps) {
  const { toast } = useToast();
  const photoUrl = getDestinationPhotoUrl(trip.destination);
  const now = new Date();
  const daysUntilStart = differenceInDays(new Date(trip.startDate ?? Date.now()), now);
  const daysUntilEnd = trip.endDate ? differenceInDays(new Date(trip.endDate), now) : daysUntilStart;
  const statusLabel = daysUntilStart > 0
    ? `${daysUntilStart}d away`
    : daysUntilEnd < 0
    ? "Completed"
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
            {format(new Date(trip.startDate ?? Date.now()), "MMM d")} - {format(new Date(trip.endDate ?? Date.now()), "MMM d, yyyy")}
          </span>
          {displayCost && (
            <span className="text-[13px] text-emerald-300 font-semibold" data-testid={`text-budget-${trip.id}`}>
              {displayCost}
              {perPerson && <span className="text-white/60 font-normal ml-1">- {perPerson}</span>}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
