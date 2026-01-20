import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Sparkles, 
  Calendar, 
  PartyPopper, 
  TrendingUp, 
  DollarSign, 
  Sun,
  ThumbsUp,
  Star
} from "lucide-react";

interface AIRecommendationBadgesProps {
  aiScore?: number;
  aiReasons?: string[];
  seasonalMatch?: boolean;
  eventNearby?: boolean;
  eventRelated?: boolean;
  budgetMatch?: boolean;
  bestTimeMatch?: boolean;
  preferenceMatch?: boolean;
  showScore?: boolean;
  compact?: boolean;
}

export function AIRecommendationBadges({
  aiScore,
  aiReasons = [],
  seasonalMatch,
  eventNearby,
  eventRelated,
  budgetMatch,
  bestTimeMatch,
  preferenceMatch,
  showScore = false,
  compact = false,
}: AIRecommendationBadgesProps) {
  const badges: { 
    icon: typeof Sparkles; 
    label: string; 
    tooltip: string; 
    variant: "default" | "secondary" | "outline";
    color: string;
  }[] = [];

  if (bestTimeMatch) {
    badges.push({
      icon: Sun,
      label: compact ? "" : "Best Time",
      tooltip: "Perfect timing to visit - excellent season",
      variant: "default",
      color: "bg-green-500/90 hover:bg-green-500 text-white",
    });
  }

  if (eventNearby || eventRelated) {
    badges.push({
      icon: PartyPopper,
      label: compact ? "" : "Event",
      tooltip: eventRelated 
        ? "Related to upcoming local event or festival" 
        : "Near upcoming local event or festival",
      variant: "secondary",
      color: "bg-purple-500/90 hover:bg-purple-500 text-white",
    });
  }

  if (seasonalMatch && !bestTimeMatch) {
    badges.push({
      icon: Calendar,
      label: compact ? "" : "In Season",
      tooltip: "Good time to visit this destination",
      variant: "outline",
      color: "bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30",
    });
  }

  if (budgetMatch) {
    badges.push({
      icon: DollarSign,
      label: compact ? "" : "Value",
      tooltip: "Matches your budget preference",
      variant: "outline",
      color: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    });
  }

  if (preferenceMatch) {
    badges.push({
      icon: ThumbsUp,
      label: compact ? "" : "For You",
      tooltip: "Matches your travel preferences",
      variant: "outline",
      color: "bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30",
    });
  }

  if (badges.length === 0 && (!aiScore || aiScore < 60)) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1" data-testid="ai-recommendation-badges">
      {showScore && aiScore !== undefined && aiScore >= 60 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge 
              variant="default" 
              className="bg-primary/90 hover:bg-primary text-white text-xs gap-1"
              data-testid="badge-ai-score"
            >
              <Sparkles className="h-3 w-3" />
              {aiScore}%
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <div className="space-y-1">
              <p className="font-medium">AI Match Score: {aiScore}%</p>
              {aiReasons.length > 0 && (
                <ul className="text-xs space-y-0.5">
                  {aiReasons.slice(0, 3).map((reason, idx) => (
                    <li key={idx} className="flex items-start gap-1">
                      <Star className="h-2.5 w-2.5 mt-0.5 flex-shrink-0" />
                      {reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      )}

      {badges.map((badge, idx) => (
        <Tooltip key={idx}>
          <TooltipTrigger asChild>
            <Badge 
              variant={badge.variant}
              className={`text-xs gap-1 ${badge.color}`}
              data-testid={`badge-${badge.label.toLowerCase().replace(/\s/g, '-') || idx}`}
            >
              <badge.icon className="h-3 w-3" />
              {badge.label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">{badge.tooltip}</p>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

export function AIScoreIndicator({ 
  score, 
  size = "default" 
}: { 
  score: number; 
  size?: "sm" | "default" | "lg";
}) {
  const getScoreColor = (s: number) => {
    if (s >= 80) return "text-green-600 dark:text-green-400";
    if (s >= 60) return "text-blue-600 dark:text-blue-400";
    if (s >= 40) return "text-amber-600 dark:text-amber-400";
    return "text-gray-500";
  };

  const getScoreLabel = (s: number) => {
    if (s >= 80) return "Excellent Match";
    if (s >= 60) return "Good Match";
    if (s >= 40) return "Fair Match";
    return "Low Match";
  };

  const sizeClasses = {
    sm: "text-xs",
    default: "text-sm",
    lg: "text-base",
  };

  return (
    <div className={`flex items-center gap-1.5 ${sizeClasses[size]}`} data-testid="ai-score-indicator">
      <Sparkles className={`h-4 w-4 ${getScoreColor(score)}`} />
      <span className={`font-semibold ${getScoreColor(score)}`}>{score}%</span>
      <span className="text-muted-foreground">{getScoreLabel(score)}</span>
    </div>
  );
}

export function SeasonalInsightBanner({
  rating,
  weatherDescription,
  events,
  bestTimeToVisit,
}: {
  rating: string;
  weatherDescription?: string | null;
  events?: { title: string; eventType: string | null }[];
  bestTimeToVisit?: string | null;
}) {
  const ratingColors: Record<string, string> = {
    excellent: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800",
    good: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
    average: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800",
    poor: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
  };

  const ratingTextColors: Record<string, string> = {
    excellent: "text-green-700 dark:text-green-400",
    good: "text-blue-700 dark:text-blue-400",
    average: "text-amber-700 dark:text-amber-400",
    poor: "text-red-700 dark:text-red-400",
  };

  return (
    <div 
      className={`p-3 rounded-lg border ${ratingColors[rating] || ratingColors.average}`}
      data-testid="seasonal-insight-banner"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className={`h-4 w-4 ${ratingTextColors[rating] || ratingTextColors.average}`} />
            <span className={`font-medium capitalize ${ratingTextColors[rating] || ratingTextColors.average}`}>
              {rating} Time to Visit
            </span>
          </div>
          {weatherDescription && (
            <p className="text-sm text-muted-foreground">{weatherDescription}</p>
          )}
          {bestTimeToVisit && (
            <p className="text-xs text-muted-foreground mt-1">
              <Sparkles className="h-3 w-3 inline mr-1" />
              Best time: {bestTimeToVisit}
            </p>
          )}
        </div>
        {events && events.length > 0 && (
          <div className="flex-shrink-0">
            <Badge variant="secondary" className="text-xs gap-1">
              <PartyPopper className="h-3 w-3" />
              {events.length} event{events.length > 1 ? "s" : ""}
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
}
