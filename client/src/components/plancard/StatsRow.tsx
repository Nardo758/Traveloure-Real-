import { differenceInDays } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Star, TrendingDown, Heart, Route } from "lucide-react";
import { STATS_ICONS, type TemplateConfig, type PlanCardTrip, type PlanCardDay } from "./plancard-types";

interface StatsRowProps {
  trip: PlanCardTrip;
  days: PlanCardDay[];
  totalActivities: number;
  totalLegs: number;
  totalMinutes: number;
  templateConfig: TemplateConfig;
}

export function StatsRow({ trip, days, totalActivities, totalLegs, totalMinutes, templateConfig }: StatsRowProps) {
  const statItems = [
    { label: templateConfig.statsLabels[0], value: days.length || differenceInDays(new Date(trip.endDate), new Date(trip.startDate)) + 1 },
    { label: templateConfig.statsLabels[1], value: totalActivities },
    { label: templateConfig.statsLabels[2], value: totalLegs },
    { label: templateConfig.statsLabels[3], value: totalMinutes > 0 ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m` : "-" },
  ];

  return (
    <div className="grid grid-cols-4 border-b border-border" data-testid={`stats-row-${trip.id}`}>
      {statItems.map((s, i) => {
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
  );
}

interface OptimizerMetricsProps {
  tripId: string;
  traveloureScore: number | null | undefined;
  savings: string | null | undefined;
  savingsPercent: string | null | undefined;
  wellnessTime: number | null | undefined;
  travelDistance: number | null | undefined;
  starDelta: number | null | undefined;
  totalCost: string | null | undefined;
  perPerson: string | null;
}

export function OptimizerMetrics({ tripId, traveloureScore, savings, savingsPercent, wellnessTime, travelDistance, starDelta, totalCost, perPerson }: OptimizerMetricsProps) {
  const hasMetrics = traveloureScore != null || savings || wellnessTime || travelDistance || starDelta || totalCost;
  if (!hasMetrics) return null;

  return (
    <div className="flex flex-wrap gap-2 px-4 py-2.5 border-b border-border bg-muted/30" data-testid={`optimizer-metrics-${tripId}`}>
      {traveloureScore != null && (
        <Badge variant="secondary" className="text-[11px] gap-1 bg-primary/10 text-primary border-0" data-testid={`badge-traveloure-score-${tripId}`}>
          <Star className="w-3 h-3" /> {traveloureScore} Score
        </Badge>
      )}
      {totalCost && (
        <Badge variant="secondary" className="text-[11px] gap-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-0" data-testid={`badge-total-cost-${tripId}`}>
          {totalCost}{perPerson && ` (${perPerson})`}
        </Badge>
      )}
      {savings && (
        <Badge variant="secondary" className="text-[11px] gap-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-0" data-testid={`badge-savings-${tripId}`}>
          <TrendingDown className="w-3 h-3" /> Saves {savings}{savingsPercent && ` (${savingsPercent})`}
        </Badge>
      )}
      {wellnessTime && (
        <Badge variant="secondary" className="text-[11px] gap-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-0" data-testid={`badge-wellness-${tripId}`}>
          <Heart className="w-3 h-3" /> {wellnessTime}m wellness
        </Badge>
      )}
      {travelDistance && (
        <Badge variant="secondary" className="text-[11px] gap-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-0" data-testid={`badge-travel-distance-${tripId}`}>
          <Route className="w-3 h-3" /> {travelDistance}m travel
        </Badge>
      )}
      {starDelta && (
        <Badge variant="secondary" className="text-[11px] gap-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-0" data-testid={`badge-star-delta-${tripId}`}>
          <Star className="w-3 h-3" /> {starDelta} stars
        </Badge>
      )}
    </div>
  );
}
